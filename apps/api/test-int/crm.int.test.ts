// Comments, Leads and Customers end to end through the real app and Postgres (eqence_dev).
// Only the AI provider is stubbed: it "reads" a buying question as purchase intent with a
// lead score of 92, and a complaint as negative with a score of 5.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { after, before, test } from 'node:test';
import { account, auditLog, authors, connections, interactions, outbox, responses, tenants, user } from '@eqence/db';
import { and, eq, inArray, sql } from 'drizzle-orm';

process.env.BETTER_AUTH_SECRET ||= 'test-only-secret-not-used-for-anything-real';
process.env.PUBLIC_URL = 'https://api.eqence.com';
process.env.PRICING_LADDER = 'site';
process.env.AI_PROVIDER = 'openai';
process.env.OPENAI_API_KEY = 'test-key-never-sent-anywhere';

const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  if (!String(url).startsWith('https://api.openai.com/')) return realFetch(url, init);
  const body = JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] };
  const system = body.messages[0].content, text = body.messages[1].content;
  const content = system.startsWith('You classify')
    ? JSON.stringify(/wrong color|late/i.test(text)
      ? { language: 'en', sentiment: 'negative', sentiment_score: -0.8, intent: 'complaint', lead_score: 5 }
      : { language: 'en', sentiment: 'positive', sentiment_score: 0.6, intent: 'purchase_intent', lead_score: 92 })
    : JSON.stringify({ language: 'en', reply: 'Thank you for asking! Please message us and we will help with your order.' });
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 9, completion_tokens: 9 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const { app } = await import('../src/app');
const { db, pool } = await import('../src/db');
const { aiConfigFromEnv, classifyInteraction, upsertInteractions } = await import('@eqence/core');

const ORIGIN = 'https://www.eqence.com';
const tag = randomBytes(4).toString('hex');
const ids: string[] = [];
const creds: Record<string, { email: string; password: string; id: string; tenantId: string }> = {};

async function makeUser(name: string) {
  const id = `crmtest-${tag}-${name}`, email = `${id}@example.invalid`;
  const password = `Pw-${randomBytes(10).toString('hex')}!`, salt = randomBytes(16).toString('hex');
  await db.insert(user).values({ id, name, email, emailVerified: true, role: 'user' });
  await db.insert(account).values({ id: randomUUID(), accountId: id, providerId: 'credential', userId: id, password: `c2c-scrypt$${salt}:${scryptSync(password, salt, 64).toString('hex')}` });
  const [t] = await db.insert(tenants).values({ name: `${name} store`, ownerUserId: id, plan: 'eqence-basic', planStatus: 'active' }).returning();
  ids.push(id);
  creds[name] = { email, password, id, tenantId: t.id };
}
const cookieOf = (r: Response) => r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const req = (method: string, path: string, cookie = '', body?: unknown, origin = ORIGIN) => app.request(path, {
  method, headers: { Origin: origin, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
  body: body !== undefined ? JSON.stringify(body) : undefined,
});
async function signIn(name: string) {
  const r = await req('POST', '/api/auth/sign-in/email', '', { email: creds[name].email, password: creds[name].password });
  assert.equal(r.status, 200);
  return cookieOf(r);
}
const json = async <T>(r: Response) => (await r.json()) as T;

let shop = '', rival = '';
let commentId = '', sarahId = '';

before(async () => {
  await makeUser('shop'); await makeUser('rival');
  shop = await signIn('shop'); rival = await signIn('rival');
});

after(async () => {
  await db.delete(outbox).where(sql`${outbox.payload}->>'interactionId' in (select id::text from interactions where tenant_id in (${sql.join(Object.values(creds).map((c) => sql`${c.tenantId}`), sql`, `)}))`);
  await db.delete(auditLog).where(inArray(auditLog.actorUserId, ids));
  await db.delete(tenants).where(inArray(tenants.ownerUserId, ids));
  await db.delete(user).where(inArray(user.id, ids));
  await pool.end();
  globalThis.fetch = realFetch;
});

test('Comments: add one by hand, it is read by the AI like any review', async () => {
  const body = { platform: 'instagram', authorName: '@sarah_m', body: 'How much is this? I need 5 units shipped to Muscat' };
  assert.equal((await req('POST', '/api/v1/comments', shop, { ...body, platform: 'judgeme' })).status, 400, 'a connected source cannot be faked');
  assert.equal((await req('POST', '/api/v1/comments', shop, { ...body, body: '' })).status, 400);
  assert.equal((await req('POST', '/api/v1/comments', shop, body, 'https://evil.example')).status, 403);
  assert.equal((await req('POST', '/api/v1/comments', '', body)).status, 401);
  const made = await req('POST', '/api/v1/comments', shop, body);
  assert.equal(made.status, 201);
  commentId = (await json<{ interaction: { id: string } }>(made)).interaction.id;
  const [queued] = await db.select().from(outbox).where(sql`${outbox.topic} = 'interaction.classify' and ${outbox.payload}->>'interactionId' = ${commentId}`);
  assert.ok(queued, 'classification is queued for the worker');
  await classifyInteraction(db, aiConfigFromEnv(), commentId);   // what the worker does

  const list = await json<{ interactions: any[] }>(await req('GET', '/api/v1/interactions?channel=social', shop));
  assert.equal(list.interactions.length, 1);
  const c = list.interactions[0];
  assert.deepEqual([c.source, c.channelType, c.manual, c.authorName, c.intent, c.leadScore, c.sentiment, c.status], ['instagram', 'comment', true, '@sarah_m', 'purchase_intent', 92, 'positive', 'triaged']);
  assert.equal((await json<{ interactions: any[] }>(await req('GET', '/api/v1/interactions?channel=review', shop))).interactions.length, 0);
  assert.deepEqual(await json(await req('GET', '/api/v1/comments/stats', shop)), { total: 1, replied: 0, pending: 1, hot: 1 });
  assert.equal((await json<{ interactions: any[] }>(await req('GET', '/api/v1/interactions', rival))).interactions.length, 0, 'another workspace sees nothing');
});

test('a reply to a hand-added comment is recorded as sent by the merchant, never queued for posting', async () => {
  const draft = await req('POST', `/api/v1/interactions/${commentId}/draft`, shop, {});
  assert.equal(draft.status, 201);
  const { response } = await json<{ response: { id: string; status: string } }>(draft);
  assert.equal(response.status, 'pending_approval');
  const approved = await json<{ response: { status: string; publishedAt: string | null } }>(await req('POST', `/api/v1/responses/${response.id}/approve`, shop, {}));
  assert.equal(approved.response.status, 'published');
  assert.ok(approved.response.publishedAt);
  const [it] = await db.select({ status: interactions.status }).from(interactions).where(eq(interactions.id, commentId));
  assert.equal(it.status, 'responded');
  const jobs = await db.select().from(outbox).where(sql`${outbox.topic} = 'response.publish' and ${outbox.payload}->>'responseId' = ${response.id}`);
  assert.equal(jobs.length, 0, 'nothing is sent to a platform that is not connected');
  assert.deepEqual(await json(await req('GET', '/api/v1/comments/stats', shop)), { total: 1, replied: 1, pending: 0, hot: 1 });
});

test('Leads: the buyer appears with a score; a complainer does not; stages and export work', async () => {
  const second = await json<{ interaction: { id: string } }>(await req('POST', '/api/v1/comments', shop, { platform: 'facebook', channelType: 'dm', authorName: 'Alex R', body: 'I received the wrong color. How do I return it?' }));
  await classifyInteraction(db, aiConfigFromEnv(), second.interaction.id);

  const leads = await json<{ leads: any[]; stats: Record<string, number>; hotScore: number }>(await req('GET', '/api/v1/leads', shop));
  assert.equal(leads.leads.length, 1, 'only the customer with buying intent is a lead');
  const lead = leads.leads[0];
  sarahId = lead.id;
  assert.deepEqual([lead.displayName, lead.leadScore, lead.topIntent, lead.stage, lead.source, lead.interactions], ['@sarah_m', 92, 'purchase_intent', 'new', 'instagram', 1]);
  assert.deepEqual(leads.stats, { total: 1, hot: 1, contacted: 0, won: 0 });

  assert.equal((await req('PATCH', `/api/v1/customers/${sarahId}`, shop, { stage: 'vip' })).status, 400);
  assert.equal((await req('PATCH', `/api/v1/customers/${sarahId}`, rival, { stage: 'won' })).status, 404, 'not another workspace\'s customer');
  assert.equal((await req('PATCH', `/api/v1/customers/${sarahId}`, shop, { stage: 'won' }, 'https://evil.example')).status, 403);
  assert.equal((await req('PATCH', `/api/v1/customers/${sarahId}`, shop, { stage: 'contacted' })).status, 200);
  const after = await json<{ leads: any[]; stats: Record<string, number> }>(await req('GET', '/api/v1/leads?stage=contacted', shop));
  assert.equal(after.leads.length, 1);
  assert.equal(after.stats.contacted, 1);
  assert.equal((await json<{ leads: any[] }>(await req('GET', '/api/v1/leads?stage=won', shop))).leads.length, 0);
  assert.equal((await json<{ leads: any[] }>(await req('GET', '/api/v1/leads', rival))).leads.length, 0);

  const csv = await req('GET', '/api/v1/leads/export', shop);
  assert.match(csv.headers.get('content-type') ?? '', /text\/csv/);
  const lines = (await csv.text()).replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines[0], 'name,score,intent,stage,source,interactions,email,phone,tags,last_activity');
  assert.match(lines[1], /^'@sarah_m,92,purchase_intent,contacted,instagram,1,/, 'a name starting with @ is defused for spreadsheets');
  assert.equal(lines.length, 2);
});

test('Customers: list, search, full history, and the merchant\'s own notes', async () => {
  const all = await json<{ customers: any[]; total: number }>(await req('GET', '/api/v1/customers', shop));
  assert.equal(all.total, 2);
  assert.deepEqual(all.customers.map((c) => c.displayName).sort(), ['@sarah_m', 'Alex R']);
  const alex = all.customers.find((c) => c.displayName === 'Alex R');
  assert.deepEqual([alex.lastSentiment, alex.leadScore, alex.open, alex.source], ['negative', 5, 1, 'facebook']);

  const bad = await req('PATCH', `/api/v1/customers/${sarahId}`, shop, { email: 'nope' });
  assert.equal(bad.status, 400);
  assert.equal((await req('PATCH', `/api/v1/customers/${sarahId}`, shop, {})).status, 400);
  const saved = await json<{ customer: any }>(await req('PATCH', `/api/v1/customers/${sarahId}`, shop, { notes: ' Wants 5 units. ', tags: 'Wholesale, VIP, vip', email: 'sarah@example.com', phone: '+968 9123 4567' }));
  assert.deepEqual([saved.customer.notes, saved.customer.tags, saved.customer.email, saved.customer.phone], ['Wants 5 units.', ['wholesale', 'vip'], 'sarah@example.com', '+968 9123 4567']);

  assert.deepEqual((await json<{ customers: any[] }>(await req('GET', '/api/v1/customers?q=wholes', shop))).customers.map((c) => c.displayName), ['@sarah_m'], 'search finds a tag');
  assert.equal((await json<{ customers: any[] }>(await req('GET', '/api/v1/customers?q=%25', shop))).customers.length, 0, 'a % is searched literally');
  assert.equal((await json<{ customers: any[] }>(await req('GET', '/api/v1/customers?stage=contacted', shop))).customers.length, 1);

  const detail = await json<{ customer: any; timeline: any[] }>(await req('GET', `/api/v1/customers/${sarahId}`, shop));
  assert.equal(detail.customer.notes, 'Wants 5 units.');
  assert.equal(detail.timeline.length, 1);
  assert.match(detail.timeline[0].reply.body, /Thank you for asking/);
  assert.equal((await req('GET', `/api/v1/customers/${sarahId}`, rival)).status, 404);
  assert.equal((await req('GET', '/api/v1/customers/not-a-uuid', shop)).status, 404);
});

test('connected reviews build the same customer records: one person, one record, and one alert only', async () => {
  const [conn] = await db.insert(connections).values({ tenantId: creds.shop.tenantId, source: 'judgeme', externalAccount: `crm-${tag}.myshopify.com`, credentialsRef: 'vlt_test_unused' }).returning();
  const review = (externalId: string, body: string) => ({
    externalId, channelType: 'review' as const, author: { externalId: 'jm-777', displayName: 'Emma' }, body, rating: 2,
    postedAt: new Date(), isPublic: true, raw: {},
  });
  const first = await upsertInteractions(db, { id: conn.id, tenantId: creds.shop.tenantId, source: 'judgeme' }, [review('r1', 'It arrived late.'), review('r2', 'Do you have it in blue? I want two.')]);
  assert.equal(first.length, 2);
  await upsertInteractions(db, { id: conn.id, tenantId: creds.shop.tenantId, source: 'judgeme' }, [review('r1', 'It arrived late. Edited.')]);
  const emma = await db.select().from(authors).where(and(eq(authors.tenantId, creds.shop.tenantId), eq(authors.key, 'judgeme:jm-777')));
  assert.equal(emma.length, 1, 'two reviews and a re-sync make one customer');
  for (const id of first) await classifyInteraction(db, aiConfigFromEnv(), id);

  const c = (await json<{ customers: any[] }>(await req('GET', '/api/v1/customers?q=Emma', shop))).customers[0];
  assert.deepEqual([c.interactions, c.avgRating, c.leadScore, c.source], [2, 2, 92, 'judgeme']);
  assert.equal((await json<{ leads: any[] }>(await req('GET', '/api/v1/leads', shop))).leads.length, 2, 'the reviewer who asked to buy is now a lead too');

  const late = first[0];
  const alerts = () => db.select().from(outbox).where(sql`${outbox.topic} = 'alert.negative' and ${outbox.payload}->>'interactionId' = ${late}`);
  assert.equal((await alerts()).length, 1);
  await classifyInteraction(db, aiConfigFromEnv(), late);
  assert.equal((await alerts()).length, 1, 're-reading a review never sends a second alert');

  // A review that came from a platform cannot be deleted through the hand-entry route.
  assert.equal((await req('DELETE', `/api/v1/comments/${late}`, shop)).status, 404);
  assert.equal((await req('DELETE', `/api/v1/comments/${commentId}`, rival)).status, 404);
  assert.equal((await req('DELETE', `/api/v1/comments/${commentId}`, shop)).status, 200);
  assert.equal((await db.select().from(responses).where(eq(responses.interactionId, commentId))).length, 0);
});
