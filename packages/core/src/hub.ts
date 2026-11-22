// SmarThinkerz Hub billing: checkout links and the partner webhook.
// Contract read from the Hub source (Smarthinkerz-Hub @ 608e9d4,
// artifacts/api-server/src/lib/partnerWebhook.ts):
//  - flat JSON body; header X-SmarThinkerz-Signature: sha256=<hex HMAC-SHA256 of the exact body>
//  - events: payment.success (order.paid), payment.failed (order.failed),
//    subscription.cancelled (order.refunded, also re-sent when the Hub cancels after failed
//    renewals), order.partially_refunded (passed through unchanged). Only
//    subscription.cancelled revokes a plan; a partial refund is recorded, nothing more.
//  - event_id = sh_<internal event>_<order id>, stable across retries; no timestamp, so
//    replay protection is the event_id dedupe
//  - older Hub builds sent the signature header twice, folded as "sha256=a, sha256=a"
// Checkout (Hub PAYMENT_GATEWAY.md sections 3 and 3b, lib/signedAmountCanonical.ts):
//  - user_id carries the workspace id and comes back as metadata.user_id: that is the
//    join key. Email is never used to bind a payment (partner-app README, "Binding on email").
//  - the price is partner-signed (scheme shz.amount.v2) with the same partner secret that
//    signs the webhooks, so the link states exactly what Eqence grants for it. A fresh
//    external_ref per checkout is the nonce; exp bounds the link's life.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { auditLog, hubEvents, tenants, type Db } from '@eqence/db';
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** How long a signed checkout link stays valid. The Hub allows at most 24 hours. */
export const CHECKOUT_TTL_SECONDS = 30 * 60;
export const CHECKOUT_CURRENCY = 'USD';

const netstring = (v: string) => `${Buffer.byteLength(v, 'utf8')}:${v},`;

/** The exact bytes the Hub hashes for a partner-signed amount (shz.amount.v2). The item
 *  name is trimmed and cut to 200 characters first, as the Hub does before verifying. */
export function signedAmountCanonical(f: {
  appId: string; planSlug: string; amount: string; currency: string; externalRef: string; exp: number; itemName?: string;
}): string {
  return netstring('shz.amount.v2') + netstring(f.appId) + netstring(f.planSlug) + netstring(f.amount)
    + netstring(f.currency.toUpperCase()) + netstring(f.externalRef) + netstring(String(f.exp))
    + netstring((f.itemName ?? '').trim().slice(0, 200));
}

export function signAmount(fields: Parameters<typeof signedAmountCanonical>[0], secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(signedAmountCanonical(fields), 'utf8').digest('hex');
}

/** USD has exactly one legal spelling at the Hub: two decimals, no leading zeros. */
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('price must be a positive number');
  return amount.toFixed(2);
}

/** The price a plan is sold at for a cycle. A plan without a yearly price is monthly only. */
export function priceFor(plan: Plan, cycle: 'monthly' | 'yearly'): number {
  if (cycle === 'yearly') {
    if (plan.yearlyUsd == null) throw new Error(`plan ${plan.slug} has no yearly price`);
    return plan.yearlyUsd;
  }
  return plan.monthlyUsd;
}

/** A fresh single-use reference per checkout: the signed amount's nonce. */
export function newCheckoutRef(): string {
  return 'eqc_' + randomBytes(12).toString('hex');
}

export function checkoutUrl(opts: {
  hubBaseUrl: string; plan: Plan; cycle: 'monthly' | 'yearly'; tenantId: string; email?: string;
  returnUrl: string; ref?: string | null; secret: string; now?: number; externalRef?: string;
}): string {
  if (!opts.secret) throw new Error('HUB_PARTNER_SECRET is not set; checkout links cannot be signed');
  if (!UUID_RE.test(opts.tenantId)) throw new Error('tenant id must be a UUID');
  const amount = formatUsd(priceFor(opts.plan, opts.cycle));
  const externalRef = opts.externalRef ?? newCheckoutRef();
  const exp = Math.floor((opts.now ?? Date.now()) / 1000) + CHECKOUT_TTL_SECONDS;
  const u = new URL('/checkout', opts.hubBaseUrl);
  u.searchParams.set('plan', opts.plan.slug);
  u.searchParams.set('app_id', HUB_APP_ID);
  u.searchParams.set('cycle', opts.cycle);
  u.searchParams.set('return_url', opts.returnUrl);
  // user_id is echoed back as metadata.user_id: it is how a payment finds its workspace.
  u.searchParams.set('user_id', opts.tenantId);
  u.searchParams.set('external_ref', externalRef);
  u.searchParams.set('amount', amount);
  u.searchParams.set('currency', CHECKOUT_CURRENCY);
  u.searchParams.set('exp', String(exp));
  u.searchParams.set('sig', signAmount({
    appId: HUB_APP_ID, planSlug: opts.plan.slug, amount, currency: CHECKOUT_CURRENCY, externalRef, exp,
  }, opts.secret));
  // Prefills the checkout form only; it never binds the payment.
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
  refunded_amount?: number | null;
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

    // Find the workspace: metadata.user_id carries the tenant id from our checkout link.
    // Links issued before user_id was sent carried the tenant id in external_ref, and the
    // Hub copies both onto renewals, so that is honoured too. Email never binds a payment.
    let tenantId: string | null = null;
    for (const candidate of [p.metadata?.user_id, p.external_ref]) {
      if (tenantId || !candidate || !UUID_RE.test(candidate)) continue;
      const [t] = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, candidate));
      tenantId = t?.id ?? null;
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

    if (event === 'order.partially_refunded') {
      await tx.insert(auditLog).values({ tenantId, action: 'billing.partially_refunded', target: eventId, detail: { order_id: p.order_id, refunded_amount: p.refunded_amount ?? null } });
      return finish('recorded:partially_refunded', tenantId);
    }

    return finish(`ignored:event=${event || 'none'}`, tenantId);
  });
}
