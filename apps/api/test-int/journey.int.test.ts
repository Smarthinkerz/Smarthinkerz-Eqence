// The merchant journey end to end, through the real API routes, the real worker handlers
// and a real Postgres: connect a Judge.me store, import its reviews, receive a signed
// review webhook, buy a plan through a signed Hub checkout link and webhook, draft an
// Arabic and an English reply, approve one (posted to Judge.me) and reject the other
// (never posted). Only the outside services are stubbed: Judge.me and the AI provider.
// Run: DATABASE_URL=<eqence_dev> PRICING_LADDER=site HUB_PARTNER_SECRET=<test value>
//      node --import tsx --test test-int/journey.int.test.ts
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { account, auditLog, connections, hubEvents, interactions, outbox, responses, tenants, user } from '@eqence/db';
import { and, eq, sql } from 'drizzle-orm';

process.env.BETTER_AUTH_SECRET ||= 'test-only-secret-not-used-for-anything-real';
process.env.VAULT_KEY ||= randomBytes(32).toString('hex');
process.env.VAULT_DIR ||= mkdtempSync(join(tmpdir(), 'eqence-vault-'));
process.env.OPENAI_API_KEY ||= 'test-key';
const SECRET = process.env.HUB_PARTNER_SECRET!;
assert.ok(SECRET, 'HUB_PARTNER_SECRET must be set for this test');
assert.equal(process.env.PRICING_LADDER, 'site', 'PRICING_LADDER=site for this test');

const SHOP = `journey-${randomBytes(3).toString('hex')}.myshopify.com`;
const TOKEN = `jm-test-token-${randomBytes(8).toString('hex')}`;
const AR_REVIEW = 'المنتج وصل مكسور والتغليف سيء جدا';
const EN_REVIEW = 'Lovely scarf, the color is exactly as pictured.';
const reviews: Record<string, unknown> = {
  '9001': { id: 9001, title: 'سيء', body: AR_REVIEW, rating: 1, product_title: 'Oud Oil', reviewer: { id: 1, name: 'Fatma' }, curated: 'ok', created_at: '2026-11-01T10:00:00Z' },
  '9002': { id: 9002, title: 'Love it', body: EN_REVIEW, rating: 5, product_title: 'Silk Scarf', reviewer: { id: 2, name: 'Jane' }, curated: 'ok', created_at: '2026-11-02T10:00:00Z' },
  '9003': { id: 9003, title: 'Fast', body: 'Arrived quickly, thank you.', rating: 5, product_title: 'Silk Scarf', reviewer: { id: 3, name: 'Omar' }, curated: 'ok', created_at: '2026-11-03T10:00:00Z' },
};
const judgeCalls: Array<{ method: string; path: string; body: any; token: string | null; shop: string | null }> = [];
const isArabic = (s: string) => /[؀-ۿ]/.test(s);

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = new URL(String(input));
  if (url.origin === 'https://api.judge.me') {
    const path = url.pathname.replace('/api/v1', '');
    const body = init?.body ? JSON.parse(init.body) : null;
    judgeCalls.push({ method: init?.method ?? 'GET', path, body, token: init?.headers?.['X-Api-Token'] ?? null, shop: url.searchParams.get('shop_domain') });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    if (init?.headers?.['X-Api-Token'] !== TOKEN) return json({ error: 'unauthorized' }, 401);
    if (path === '/shops/info') return json({ shop: { domain: SHOP, platform: 'shopify' } });
    if (path === '/reviews') return json({ current_page: 1, reviews: [reviews['9001'], reviews['9002']] });
    if (path.startsWith('/reviews/')) return reviews[path.split('/')[2]] ? json({ review: reviews[path.split('/')[2]] }) : json({}, 404);
    if (path === '/webhooks' || path === '/replies') return json({});
    return json({ error: 'unexpected' }, 404);
  }
  if (url.origin === 'https://api.openai.com') {
    const req = JSON.parse(init.body);
    const text: string = req.messages[1].content;
    const ar = isArabic(text);
    const content = /You classify/.test(req.messages[0].content)
      ? { language: ar ? 'ar' : 'en', sentiment: ar ? 'negative' : 'positive', sentiment_score: ar ? -0.8 : 0.9, intent: ar ? 'complaint' : 'praise', lead_score: ar ? 5 : 30 }
      : ar
        ? { language: 'ar', reply: 'نعتذر لك يا فاطمة عن وصول المنتج بهذه الحالة. نرجو التواصل معنا بشكل خاص لنساعدك.' }
        : { language: 'en', reply: 'Thank you, Jane! We are so glad the scarf matches the photos.' };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 20, completion_tokens: 20 } }), { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;

// Imported after fetch is stubbed: the Judge.me connector binds fetch when @eqence/core loads.
const { signAmount } = await import('@eqence/core');
const { app } = await import('../src/app');
const { db, pool } = await import('../src/db');
const { buildHandlers } = await import('../../worker/src/handlers');
const handlers = buildHandlers(db);

const ORIGIN = 'https://www.eqence.com';
const id = `journey-${randomUUID()}`;
const email = `${id}@example.invalid`;
const password = `Pw-${randomBytes(10).toString('hex')}!`;
let cookie = '';
let tenantId = '';
let connId = '';

const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => app.request(path, {
  method, headers: { Origin: ORIGIN, cookie, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
});

/** Runs this workspace's queued jobs with the real worker handlers (alerts are left queued: no mail in tests). */
async function drain() {
  for (let round = 0; round < 10; round++) {
    const { rows } = await pool.query<{ id: number; topic: string; payload: unknown }>(
      `select id, topic, payload from outbox where status = 'pending' and topic <> 'alert.negative' and (
         payload->>'connectionId' = $1
         or payload->>'interactionId' in (select id::text from interactions where tenant_id = $2)
         or payload->>'responseId' in (select id::text from responses where tenant_id = $2)) order by id`, [connId, tenantId]);
    if (rows.length === 0) return;
    for (const r of rows) {
      await handlers[r.topic](r.payload);
      await pool.query(`update outbox set status = 'done', attempts = attempts + 1 where id = $1`, [r.id]);
    }
  }
  throw new Error('jobs kept queueing more jobs');
}

const listInbox = async () => (await (await req('GET', '/api/v1/interactions')).json() as { interactions: Array<{ id: string; body: string; language: string; sentiment: string; responses: Array<{ id: string; status: string; language: string; body: string }> }> }).interactions;

before(async () => {
  const salt = randomBytes(16).toString('hex');
  await db.insert(user).values({ id, name: 'Journey Store', email, emailVerified: true });
  await db.insert(account).values({ id: randomUUID(), accountId: id, providerId: 'credential', userId: id, password: `c2c-scrypt$${salt}:${scryptSync(password, salt, 64).toString('hex')}` });
  const [t] = await db.insert(tenants).values({ name: 'Journey Store', ownerUserId: id }).returning();
  tenantId = t.id;
  const r = await req('POST', '/api/auth/sign-in/email', { email, password });
  assert.equal(r.status, 200, 'sign-in');
  cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
});

after(async () => {
  await pool.query(`delete from outbox where payload->>'connectionId' = $1
    or payload->>'interactionId' in (select id::text from interactions where tenant_id = $2)
    or payload->>'responseId' in (select id::text from responses where tenant_id = $2)`, [connId, tenantId]);
  await db.delete(hubEvents).where(eq(hubEvents.tenantId, tenantId));
  await db.delete(auditLog).where(eq(auditLog.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, id));
  await pool.end();
  globalThis.fetch = realFetch;
});

test('connect: a wrong Judge.me token is refused; the right one connects and registers both webhooks', async () => {
  const bad = await req('POST', '/api/v1/connections/judgeme', { shopDomain: SHOP, apiToken: 'wrong' });
  assert.equal(bad.status, 400);
  const r = await req('POST', '/api/v1/connections/judgeme', { shopDomain: `https://${SHOP}/admin`, apiToken: TOKEN });
  assert.equal(r.status, 201, await r.clone().text());
  connId = ((await r.json()) as { connection: { id: string } }).connection.id;
  const hooks = judgeCalls.filter((c) => c.method === 'POST' && c.path === '/webhooks').map((c) => c.body.webhook);
  assert.deepEqual(hooks.map((h) => h.key), ['review/created', 'review/updated']);
  assert.ok(hooks.every((h) => h.url === `http://localhost:4410/webhooks/judgeme/${connId}` || h.url.endsWith(`/webhooks/judgeme/${connId}`)));
  assert.ok(judgeCalls.every((c) => c.shop === SHOP), 'every call names the normalised shop domain');
  const [row] = await db.select().from(interactions).where(eq(interactions.tenantId, tenantId));
  assert.equal(row, undefined, 'nothing is imported before the worker runs');
});

test('import: the worker pulls the store\'s reviews and classifies language and sentiment', async () => {
  await drain();
  const inbox = await listInbox();
  assert.equal(inbox.length, 2);
  const ar = inbox.find((i) => i.body === AR_REVIEW)!;
  const en = inbox.find((i) => i.body === EN_REVIEW)!;
  assert.deepEqual([ar.language, ar.sentiment, en.language, en.sentiment], ['ar', 'negative', 'en', 'positive']);
  const alerts = await db.select().from(outbox).where(and(eq(outbox.topic, 'alert.negative'), sql`${outbox.payload}->>'interactionId' = ${ar.id}`));
  assert.equal(alerts.length, 1, 'the negative Arabic review raises one alert');
});

test('review webhook: a forged signature is refused; a signed one imports the new review', async () => {
  const body = JSON.stringify({ review: { id: 9003 } });
  const forged = await req('POST', `/webhooks/judgeme/${connId}`, body, { 'Content-Type': 'application/json', 'JUDGEME-HMAC-SHA256': createHmac('sha256', 'wrong').update(body).digest('hex') });
  assert.equal(forged.status, 401);
  const ok = await req('POST', `/webhooks/judgeme/${connId}`, body, { 'Content-Type': 'application/json', 'JUDGEME-HMAC-SHA256': createHmac('sha256', TOKEN).update(body).digest('hex') });
  assert.equal(ok.status, 200);
  await drain();
  assert.equal((await listInbox()).length, 3);
});

test('no plan: drafting a reply is refused with 402', async () => {
  const inbox = await listInbox();
  const r = await req('POST', `/api/v1/interactions/${inbox[0].id}/draft`);
  assert.equal(r.status, 402);
});

test('checkout: the link is a signed Hub checkout bound to this workspace; the signed webhook grants the plan', async () => {
  const r = await req('GET', '/api/v1/billing/checkout-url?plan=eqence-basic&cycle=monthly');
  assert.equal(r.status, 200);
  const url = new URL(((await r.json()) as { url: string }).url);
  const q = url.searchParams;
  assert.equal(url.origin + url.pathname, 'https://smarthinkerz.com/checkout');
  assert.equal(q.get('user_id'), tenantId);
  assert.equal(q.get('return_url'), `${ORIGIN}/app/billing/return`);
  assert.equal(q.get('amount'), '59.00');
  assert.equal(q.get('sig'), signAmount({ appId: 'eqence', planSlug: 'eqence-basic', amount: '59.00', currency: 'USD', externalRef: q.get('external_ref')!, exp: Number(q.get('exp')) }, SECRET));
  assert.equal((await req('GET', '/api/v1/billing/checkout-url?plan=eqence-enterprise')).status, 409, 'contact-only plans have no checkout');

  // The Hub's payment.success for that order, shaped and signed as partnerWebhook.ts builds it.
  const order = Math.floor(Math.random() * 1e9);
  const delivery = JSON.stringify({
    event: 'payment.success', event_id: `sh_order_paid_${order}`, id: `sh_order_paid_${order}`, email, plan: 'eqence-basic', plan_slug: 'eqence-basic',
    metadata: { user_id: q.get('user_id'), plan_id: 'eqence-basic', app_id: 'eqence' }, internal_event: 'order.paid', order_id: order,
    app_id: 'eqence', cycle: 'monthly', amount: 59, currency: 'USD', status: 'paid', external_ref: q.get('external_ref'), paid_at: new Date().toISOString(),
  });
  const hook = await app.request('/api/hub/webhook', {
    method: 'POST', body: delivery,
    headers: { 'Content-Type': 'application/json', 'X-SmarThinkerz-Signature': 'sha256=' + createHmac('sha256', SECRET).update(delivery).digest('hex') },
  });
  assert.equal(hook.status, 200);
  const me = await (await req('GET', '/api/v1/me')).json() as { tenant: { plan: string; planStatus: string } };
  assert.deepEqual([me.tenant.plan, me.tenant.planStatus], ['eqence-basic', 'active']);
});

test('drafting: an Arabic review gets an Arabic draft, an English review an English one, both awaiting approval', async () => {
  const inbox = await listInbox();
  for (const body of [AR_REVIEW, EN_REVIEW]) {
    const it = inbox.find((i) => i.body === body)!;
    const r = await req('POST', `/api/v1/interactions/${it.id}/draft`);
    assert.equal(r.status, 201);
  }
  const after = await listInbox();
  const ar = after.find((i) => i.body === AR_REVIEW)!.responses[0];
  const en = after.find((i) => i.body === EN_REVIEW)!.responses[0];
  assert.equal(ar.language, 'ar'); assert.ok(isArabic(ar.body));
  assert.equal(en.language, 'en'); assert.ok(!isArabic(en.body));
  assert.deepEqual([ar.status, en.status], ['pending_approval', 'pending_approval']);
  assert.equal(judgeCalls.filter((c) => c.path === '/replies').length, 0, 'nothing is posted before approval');
  const usage = await (await req('GET', '/api/v1/usage')).json() as { aiActions: { limit: number; used: number } };
  assert.deepEqual(usage.aiActions, { limit: 500, used: 2 }, 'two drafts metered against the Basic allowance');
});

test('approval: only the approved reply is posted to Judge.me, once; the rejected one never is', async () => {
  const inbox = await listInbox();
  const ar = inbox.find((i) => i.body === AR_REVIEW)!;
  const en = inbox.find((i) => i.body === EN_REVIEW)!;
  const edited = await req('PATCH', `/api/v1/responses/${ar.responses[0].id}`, { body: 'نعتذر لك عن ذلك، ونرجو التواصل معنا بشكل خاص.' });
  assert.equal(edited.status, 200);
  assert.equal((await req('POST', `/api/v1/responses/${ar.responses[0].id}/approve`)).status, 200);
  assert.equal((await req('POST', `/api/v1/responses/${en.responses[0].id}/reject`)).status, 200);
  await drain();
  const posted = judgeCalls.filter((c) => c.method === 'POST' && c.path === '/replies');
  assert.equal(posted.length, 1);
  assert.deepEqual(posted[0].body, { review_id: 9001, send_reply_email: true, reply: { content: 'نعتذر لك عن ذلك، ونرجو التواصل معنا بشكل خاص.' } });
  const [arResp] = await db.select().from(responses).where(eq(responses.id, ar.responses[0].id));
  const [enResp] = await db.select().from(responses).where(eq(responses.id, en.responses[0].id));
  assert.deepEqual([arResp.status, arResp.generatedBy, enResp.status], ['published', 'ai_edited', 'rejected']);
  assert.equal((await req('POST', `/api/v1/responses/${ar.responses[0].id}/approve`)).status, 404, 'a sent reply cannot be approved again');
  await drain();
  assert.equal(judgeCalls.filter((c) => c.path === '/replies').length, 1, 'still posted exactly once');
});

test('guards: a malformed id is a plain 404, and writes from another site are refused before anything changes', async () => {
  for (const [method, path] of [
    ['POST', '/api/v1/connections/not-a-uuid/sync'],
    ['DELETE', '/api/v1/connections/not-a-uuid'],
    ['POST', '/api/v1/interactions/not-a-uuid/draft'],
    ['PATCH', '/api/v1/responses/not-a-uuid'],
    ['POST', '/api/v1/responses/not-a-uuid/approve'],
    ['POST', '/api/v1/responses/not-a-uuid/reject'],
  ] as const) {
    const r = await req(method, path, method === 'PATCH' ? { body: 'x' } : undefined);
    assert.equal(r.status, 404, `${method} ${path}`);
  }
  const connBefore = await db.select().from(connections).where(eq(connections.id, connId));
  for (const origin of ['https://evil.example', '']) {
    const h = { Origin: origin };
    for (const [method, path, body] of [
      ['POST', '/api/v1/connections/judgeme', { shopDomain: SHOP, apiToken: TOKEN }],
      ['POST', `/api/v1/connections/${connId}/sync`, undefined],
      ['DELETE', `/api/v1/connections/${connId}`, undefined],
      ['PUT', '/api/v1/brand-voice', { tone: 'hijacked' }],
    ] as const) {
      const r = await req(method, path, body, h);
      assert.equal(r.status, 403, `${method} ${path} from ${origin || 'no origin'}`);
    }
  }
  const connAfter = await db.select().from(connections).where(eq(connections.id, connId));
  assert.equal(connAfter[0].status, connBefore[0].status, 'the connection was not revoked');
  const voice = await req('GET', '/api/v1/brand-voice');
  assert.notEqual((await voice.json() as { brandVoice: { tone?: string } | null }).brandVoice?.tone, 'hijacked');
});
