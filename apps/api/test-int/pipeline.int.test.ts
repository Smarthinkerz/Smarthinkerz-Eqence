// Integration test of the core loop against a real PostgreSQL (eqence_dev on csb-fra).
// The AI provider is stubbed (no key needed); everything else is the production code.
// Run on the server:  DATABASE_URL=<eqence_dev> node --import tsx --test test-int/*.int.test.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import type { AiConfig } from '@eqence/ai';
import {
  approveResponse, classifyInteraction, draftForInteraction, editResponse, NotAllowed, QuotaExceeded,
  quotaFor, rejectResponse, upsertInteractions,
} from '@eqence/core';
import { aiActions, connections, createDb, interactions, outbox, responses, tenants, user } from '@eqence/db';
import { and, eq, sql } from 'drizzle-orm';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (eqence_dev) is required');
const { db, pool } = createDb(url);

function stubAi(reply: Record<string, unknown>): AiConfig {
  return {
    provider: 'openai', apiKey: 'test', classifyModel: 'stub-classify', draftModel: 'stub-draft',
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(reply) } }], usage: { prompt_tokens: 10, completion_tokens: 5 },
    })),
  };
}

const uid = `it-${randomUUID()}`;
let tenantId = '';
let connId = '';
const item = (id: string, body: string, rating: number) => ({
  externalId: id, channelType: 'review' as const, author: { displayName: 'Tester' }, subject: 'Product',
  body, rating, postedAt: new Date('2026-09-01T00:00:00Z'), isPublic: true, raw: { id },
});

before(async () => {
  await db.insert(user).values({ id: uid, name: 'Integration', email: `${uid}@example.invalid` });
  const [t] = await db.insert(tenants).values({ name: 'Integration Store', ownerUserId: uid }).returning();
  tenantId = t.id;
  const [c] = await db.insert(connections).values({ tenantId, source: 'judgeme', externalAccount: 'it.myshopify.com', credentialsRef: 'vlt_00000000-0000-0000-0000-000000000000' }).returning();
  connId = c.id;
});

after(async () => {
  await db.delete(outbox).where(sql`payload::text like ${'%' + tenantId + '%'} or payload->>'interactionId' in (select id::text from interactions where tenant_id = ${tenantId})`);
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, uid));
  await pool.end();
});

test('upsert stores new items once and queues classification only for new ones', async () => {
  const conn = { id: connId, tenantId, source: 'judgeme' };
  const first = await upsertInteractions(db, conn, [item('r1', 'Broken on arrival', 1), item('r2', 'Lovely', 5)]);
  assert.equal(first.length, 2);
  const again = await upsertInteractions(db, conn, [item('r1', 'Broken on arrival (edited)', 1)]);
  assert.equal(again.length, 0, 'a repeat must not create a row');
  const rows = await db.select().from(interactions).where(eq(interactions.tenantId, tenantId));
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.externalId === 'r1')!.body, 'Broken on arrival (edited)');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(outbox)
    .where(and(eq(outbox.topic, 'interaction.classify'), sql`payload->>'interactionId' in (select id::text from interactions where tenant_id = ${tenantId})`));
  assert.equal(n, 2);
});

test('classification is stored, is not billable, and negative items raise an alert', async () => {
  const [r1] = await db.select().from(interactions).where(and(eq(interactions.tenantId, tenantId), eq(interactions.externalId, 'r1')));
  const res = await classifyInteraction(db, stubAi({ language: 'en', sentiment: 'negative', sentiment_score: -0.9, intent: 'complaint' }), r1.id);
  assert.equal(res!.sentiment, 'negative');
  const [after1] = await db.select().from(interactions).where(eq(interactions.id, r1.id));
  assert.equal(after1.status, 'triaged');
  assert.equal(after1.language, 'en');
  const acts = await db.select().from(aiActions).where(eq(aiActions.interactionId, r1.id));
  assert.equal(acts.length, 1);
  assert.equal(acts[0].billable, false);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(outbox)
    .where(and(eq(outbox.topic, 'alert.negative'), sql`payload->>'interactionId' = ${r1.id}`));
  assert.equal(n, 1);
});

test('a workspace without an active plan cannot spend AI actions', async () => {
  const [r1] = await db.select().from(interactions).where(and(eq(interactions.tenantId, tenantId), eq(interactions.externalId, 'r1')));
  assert.deepEqual(await quotaFor(db, tenantId), { limit: 0, used: 0 });
  await assert.rejects(draftForInteraction(db, stubAi({ language: 'en', reply: 'x' }), tenantId, r1.id, 'Store'), QuotaExceeded);
});

test('draft, edit, approve: states, metering and single publish', async () => {
  await db.update(user).set({ isSuperUser: true }).where(eq(user.id, uid));
  const [r1] = await db.select().from(interactions).where(and(eq(interactions.tenantId, tenantId), eq(interactions.externalId, 'r1')));
  const draft = await draftForInteraction(db, stubAi({ language: 'en', reply: 'Sorry it arrived broken - please contact us.' }), tenantId, r1.id, 'Store');
  assert.equal(draft.status, 'pending_approval');
  assert.equal(draft.generatedBy, 'ai');
  assert.deepEqual(await quotaFor(db, tenantId), { limit: -1, used: 1 });

  const edited = await editResponse(db, tenantId, draft.id, 'Sorry it arrived broken. Please email us and we will sort it out.');
  assert.equal(edited.generatedBy, 'ai_edited');

  const approved = await approveResponse(db, tenantId, draft.id, uid);
  assert.equal(approved.status, 'approved');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(outbox)
    .where(and(eq(outbox.topic, 'response.publish'), sql`payload->>'responseId' = ${draft.id}`));
  assert.equal(n, 1);

  await assert.rejects(approveResponse(db, tenantId, draft.id, uid), NotAllowed, 'approving twice must not queue a second publish');
  await assert.rejects(rejectResponse(db, tenantId, draft.id, uid), NotAllowed);
  await assert.rejects(editResponse(db, tenantId, draft.id, 'late edit'), NotAllowed);
});

test('another workspace cannot touch this workspace\'s replies', async () => {
  const [resp] = await db.select().from(responses).where(eq(responses.tenantId, tenantId));
  await assert.rejects(editResponse(db, randomUUID(), resp.id, 'hijack'), NotAllowed);
  await assert.rejects(draftForInteraction(db, stubAi({ language: 'en', reply: 'x' }), randomUUID(), resp.interactionId, 'X'), NotAllowed);
});
