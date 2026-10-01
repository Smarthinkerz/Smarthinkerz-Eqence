// Signed Hub deliveries against the real API app and a real Postgres (eqence_dev).
// Bodies and headers are built exactly as the Hub builds them (partnerWebhook.ts:
// buildPayload, signPayload "sha256=<hex>", header X-SmarThinkerz-Signature).
// Run on csb-fra with DATABASE_URL=<eqence_dev>, PRICING_LADDER=site, HUB_PARTNER_SECRET=<any test value>.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { quotaFor } from '@eqence/core';
import { auditLog, hubEvents, tenants, user } from '@eqence/db';
import { eq, like } from 'drizzle-orm';

process.env.BETTER_AUTH_SECRET ||= 'test-only-secret-not-used-for-anything-real';
const SECRET = process.env.HUB_PARTNER_SECRET!;
assert.ok(SECRET, 'HUB_PARTNER_SECRET must be set for this test');
assert.equal(process.env.PRICING_LADDER, 'site', 'PRICING_LADDER=site for this test');

const { app } = await import('../src/app');
const { db, pool } = await import('../src/db');

const uid = `hubtest-${randomUUID()}`;
const email = `${uid}@example.invalid`;
let tenantId = '';
let order = 1000 + Math.floor(Math.random() * 1e6);

function payload(event: string, extra: Record<string, unknown> = {}) {
  const id = ++order;
  const internal = event === 'payment.success' ? 'order.paid' : event === 'payment.failed' ? 'order.failed' : 'order.refunded';
  const eventId = `sh_${internal.replace(/\./g, '_')}_${id}_${uid.slice(-8)}`;
  return {
    event, event_id: eventId, id: eventId, email, customer_email: email, name: 'Hub Test', plan: 'eqence-starter', plan_slug: 'eqence-starter',
    metadata: { user_id: null, plan_id: 'eqence-starter', app_id: 'eqence', customer_email: email, name: 'Hub Test' },
    internal_event: internal, order_id: id, app_id: 'eqence', tap_charge_id: `chg_test_${id}`, plan_label: 'Starter',
    product: 'Eqence', cycle: 'monthly', amount: 29, currency: 'USD', status: 'paid', customer: { name: 'Hub Test', email, phone: null },
    external_ref: tenantId, paid_at: new Date().toISOString(), refunded_amount: null, refunded_at: null, failure_message: null,
    created_at: new Date().toISOString(), ...extra,
  };
}

const sign = (body: string, secret = SECRET) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

async function deliver(body: unknown, signature?: string) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const res = await app.request('/api/hub/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-SmarThinkerz-Signature': signature ?? sign(raw) },
    body: raw,
  });
  return { status: res.status, body: await res.json() as { outcome?: string; error?: string } };
}

const tenant = async () => (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0];

before(async () => {
  await db.insert(user).values({ id: uid, name: 'Hub Test', email });
  const [t] = await db.insert(tenants).values({ name: 'Hub Test Store', ownerUserId: uid }).returning();
  tenantId = t.id;
});

after(async () => {
  await db.delete(hubEvents).where(like(hubEvents.eventId, `%${uid.slice(-8)}`));
  await db.delete(auditLog).where(eq(auditLog.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, uid));
  await pool.end();
});

test('no secret configured: fails closed with 503', async () => {
  const saved = process.env.HUB_PARTNER_SECRET;
  delete process.env.HUB_PARTNER_SECRET;
  try {
    const r = await deliver(payload('payment.success'));
    assert.equal(r.status, 503);
  } finally { process.env.HUB_PARTNER_SECRET = saved; }
  assert.equal((await tenant()).planStatus, 'none');
});

test('wrong signature: 401 and nothing changes', async () => {
  const body = JSON.stringify(payload('payment.success'));
  assert.equal((await deliver(body, sign(body, 'not-the-secret'))).status, 401);
  assert.equal((await deliver(body, 'sha256=' + '0'.repeat(64))).status, 401);
  assert.equal((await deliver(body, '')).status, 401);
  assert.equal((await tenant()).planStatus, 'none');
});

test('folded doubled header from older Hub builds is accepted; a forged copy is not', async () => {
  const forged = JSON.stringify(payload('payment.failed'));
  assert.equal((await deliver(forged, `${sign(forged)}, ${sign(forged, 'wrong')}`)).status, 401);
  const body = JSON.stringify(payload('payment.failed'));
  const r = await deliver(body, `${sign(body)}, ${sign(body)}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.outcome, 'recorded:payment_failed');
  assert.equal((await tenant()).planStatus, 'none', 'a failed payment grants nothing');
});

test('another app\'s payment never grants an Eqence plan', async () => {
  const r = await deliver(payload('payment.success', { app_id: 'academy', metadata: { app_id: 'academy' } }));
  assert.equal(r.status, 200);
  assert.equal(r.body.outcome, 'ignored:app_id=academy');
  assert.equal((await tenant()).planStatus, 'none');
});

test('unknown plan slug is ignored', async () => {
  const r = await deliver(payload('payment.success', { plan: 'commentcustomer-pro', plan_slug: 'commentcustomer-pro' }));
  assert.equal(r.body.outcome, 'ignored:unknown_plan=commentcustomer-pro');
  assert.equal((await tenant()).planStatus, 'none');
});

test('payment.success grants the plan for one month; the same event again is a duplicate', async () => {
  const p = payload('payment.success');
  const before = Date.now();
  const r = await deliver(p);
  assert.equal(r.body.outcome, 'granted');
  const t = await tenant();
  assert.equal(t.plan, 'eqence-starter');
  assert.equal(t.planStatus, 'active');
  assert.equal(t.planCycle, 'monthly');
  const days = (t.planExpiresAt!.getTime() - before) / 86_400_000;
  assert.ok(days > 27 && days < 32, `expires in ~1 month, got ${days.toFixed(1)} days`);
  assert.deepEqual(await quotaFor(db, tenantId), { limit: 100, used: 0 });

  const again = await deliver(p);
  assert.equal(again.body.outcome, 'duplicate');
  assert.equal((await tenant()).planExpiresAt!.getTime(), t.planExpiresAt!.getTime(), 'a retry must not extend the plan');
});

test('a renewal of the same plan extends from the current expiry', async () => {
  const before = (await tenant()).planExpiresAt!;
  const r = await deliver(payload('payment.success'));
  assert.equal(r.body.outcome, 'granted');
  const after = (await tenant()).planExpiresAt!;
  const days = (after.getTime() - before.getTime()) / 86_400_000;
  assert.ok(days > 27 && days < 32, `extended by ~1 month from the old expiry, got ${days.toFixed(1)}`);
});

test('yearly cycle grants a year', async () => {
  const r = await deliver(payload('payment.success', { plan: 'eqence-basic', plan_slug: 'eqence-basic', cycle: 'yearly' }));
  assert.equal(r.body.outcome, 'granted');
  const t = await tenant();
  assert.equal(t.plan, 'eqence-basic');
  const days = (t.planExpiresAt!.getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 360 && days < 370, `~1 year, got ${days.toFixed(1)}`);
});

test('subscription.cancelled (the Hub\'s refund event) revokes the plan', async () => {
  const r = await deliver(payload('subscription.cancelled'));
  assert.equal(r.body.outcome, 'revoked');
  const t = await tenant();
  assert.equal(t.planStatus, 'cancelled');
  assert.ok(t.planExpiresAt!.getTime() <= Date.now());
  assert.equal((await quotaFor(db, tenantId)).limit, 0, 'no AI actions after revocation');
});

test('without external_ref the buyer\'s email finds the workspace', async () => {
  const r = await deliver(payload('payment.success', { external_ref: null }));
  assert.equal(r.body.outcome, 'granted');
  assert.equal((await tenant()).planStatus, 'active');
});

test('malformed deliveries are rejected', async () => {
  const noId = { ...payload('payment.success'), event_id: undefined, id: undefined };
  assert.equal((await deliver(noId)).status, 400);
  const notJson = 'not json';
  assert.equal((await deliver(notJson, sign(notJson))).status, 400);
});

test('every accepted delivery left exactly one dedupe row', async () => {
  const rows = await db.select().from(hubEvents).where(like(hubEvents.eventId, `%${uid.slice(-8)}`));
  assert.ok(rows.length >= 8);
  assert.equal(new Set(rows.map((r) => r.eventId)).size, rows.length);
  assert.ok(rows.every((r) => r.outcome !== 'pending'));
});
