// SmarThinkerz Hub billing: checkout links and the partner webhook.
// Contract read from the Hub source (Smarthinkerz-Hub @ 608e9d4,
// artifacts/api-server/src/lib/partnerWebhook.ts):
//  - flat JSON body; header X-SmarThinkerz-Signature: sha256=<hex HMAC-SHA256 of the exact body>
//  - events: payment.success (order.paid), payment.failed (order.failed),
//    subscription.cancelled (order.refunded, also re-sent when the Hub cancels after failed
//    renewals), order.partially_refunded (passed through unchanged)
//  - event_id = sh_<internal event>_<order id>, stable across retries; no timestamp, so
//    replay protection is the event_id dedupe
//  - older Hub builds sent the signature header twice, folded as "sha256=a, sha256=a"
import { createHmac, timingSafeEqual } from 'node:crypto';
import { auditLog, hubEvents, tenants, user, type Db } from '@eqence/db';
import { and, eq, sql } from 'drizzle-orm';
import { selfServePlans, type Plan } from './pricing';

export const HUB_APP_ID = 'eqence';

export function verifyHubSignature(rawBody: Buffer | string, header: string | null | undefined, secret: string): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex'));
  const parts = header.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return false;
  // Every copy of a folded header must match; one forged copy fails the request.
  return parts.every((p) => {
    const given = Buffer.from(p);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

const REF_RE = /^[A-Za-z0-9_-]{3,32}$/;

export function checkoutUrl(opts: {
  hubBaseUrl: string; plan: Plan; cycle: 'monthly' | 'yearly'; tenantId: string; email?: string;
  returnUrl: string; ref?: string | null;
}): string {
  const u = new URL('/checkout', opts.hubBaseUrl);
  u.searchParams.set('plan', opts.plan.slug);
  u.searchParams.set('app_id', HUB_APP_ID);
  u.searchParams.set('cycle', opts.cycle);
  u.searchParams.set('return_url', opts.returnUrl);
  // external_ref is echoed back in the webhook: it is how a payment finds its workspace.
  u.searchParams.set('external_ref', opts.tenantId);
  if (opts.email) u.searchParams.set('email', opts.email);
  // Trainee referral code, passed through for the Hub's commission attribution.
  if (opts.ref && REF_RE.test(opts.ref)) u.searchParams.set('ref', opts.ref);
  return u.toString();
}

export interface HubPayload {
  event?: string; internal_event?: string; event_id?: string; id?: string;
  app_id?: string | null; metadata?: { app_id?: string | null; user_id?: string | null };
  plan?: string; plan_slug?: string; cycle?: string | null; external_ref?: string | null;
  email?: string; customer_email?: string; order_id?: number | string; paid_at?: string | null;
}

export type HubOutcome =
  | { status: 200; outcome: string }
  | { status: 400; outcome: string };

function addPeriod(from: Date, cycle: 'monthly' | 'yearly') {
  const d = new Date(from);
  if (cycle === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** Applies one verified Hub delivery. Dedupe row and plan change commit together, so a
 *  failure rolls both back and the Hub's retry is processed again. */
export async function applyHubEvent(db: Db, p: HubPayload): Promise<HubOutcome> {
  const eventId = String(p.event_id ?? p.id ?? '');
  if (!/^[A-Za-z0-9_.:-]{3,200}$/.test(eventId)) return { status: 400, outcome: 'missing or malformed event_id' };
  const event = String(p.event ?? '');
  const appId = p.app_id ?? p.metadata?.app_id ?? null;

  return db.transaction(async (tx) => {
    const inserted = await tx.insert(hubEvents).values({
      eventId, event, appId, orderId: p.order_id != null ? String(p.order_id) : null, outcome: 'pending',
    }).onConflictDoNothing().returning({ eventId: hubEvents.eventId });
    if (inserted.length === 0) return { status: 200 as const, outcome: 'duplicate' };

    const finish = async (outcome: string, tenantId: string | null = null) => {
      await tx.update(hubEvents).set({ outcome, tenantId }).where(eq(hubEvents.eventId, eventId));
      return { status: 200 as const, outcome };
    };

    // Another app's payment must never grant an Eqence plan.
    if (appId !== HUB_APP_ID) return finish(`ignored:app_id=${appId ?? 'none'}`);

    // A Hub-side connectivity check: signature verified, nothing else happens.
    if (event === 'test.ping') return finish('test_ok');

    // Find the workspace: external_ref carries the tenant id from our checkout link;
    // fall back to the buyer's email only when the ref is absent.
    let tenantId: string | null = null;
    const ref = p.external_ref ?? null;
    if (ref && /^[0-9a-f-]{36}$/.test(ref)) {
      const [t] = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, ref));
      tenantId = t?.id ?? null;
    }
    if (!tenantId) {
      const email = String(p.email ?? p.customer_email ?? '').toLowerCase();
      if (email) {
        const [t] = await tx.select({ id: tenants.id }).from(tenants).innerJoin(user, eq(user.id, tenants.ownerUserId))
          .where(eq(sql`lower(${user.email})`, email));
        tenantId = t?.id ?? null;
      }
    }
    if (!tenantId) return finish('ignored:no_matching_workspace');

    if (event === 'payment.success') {
      const slug = String(p.plan_slug ?? p.plan ?? '');
      // Only self-serve plans can be bought; a contact-only slug never grants through checkout.
      const plan = selfServePlans().find((x) => x.slug === slug);
      if (!plan) return finish(`ignored:unknown_plan=${slug}`, tenantId);
      const cycle = p.cycle === 'yearly' ? 'yearly' : 'monthly';
      const [t] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
      const paidAt = p.paid_at ? new Date(p.paid_at) : new Date();
      // A renewal of the same plan extends from the current expiry; otherwise start now.
      const base = t.plan === plan.slug && t.planStatus === 'active' && t.planExpiresAt && t.planExpiresAt > paidAt ? t.planExpiresAt : paidAt;
      await tx.update(tenants).set({
        plan: plan.slug, planStatus: 'active', planCycle: cycle, planExpiresAt: addPeriod(base, cycle), updatedAt: new Date(),
      }).where(eq(tenants.id, tenantId));
      await tx.insert(auditLog).values({ tenantId, action: 'billing.plan_granted', target: eventId, detail: { plan: plan.slug, cycle, order_id: p.order_id } });
      return finish('granted', tenantId);
    }

    if (event === 'subscription.cancelled') {
      // The Hub maps refunds (and cancellation after failed renewals) to this event.
      await tx.update(tenants).set({ planStatus: 'cancelled', planExpiresAt: new Date(), updatedAt: new Date() })
        .where(and(eq(tenants.id, tenantId), sql`${tenants.planStatus} <> 'none'`));
      await tx.insert(auditLog).values({ tenantId, action: 'billing.plan_revoked', target: eventId, detail: { order_id: p.order_id } });
      return finish('revoked', tenantId);
    }

    if (event === 'payment.failed') {
      await tx.insert(auditLog).values({ tenantId, action: 'billing.payment_failed', target: eventId, detail: { order_id: p.order_id } });
      return finish('recorded:payment_failed', tenantId);
    }

    return finish(`ignored:event=${event || 'none'}`, tenantId);
  });
}
