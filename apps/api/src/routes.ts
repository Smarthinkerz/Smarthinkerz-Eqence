import {
  activeLadder, aiConfigFromEnv, applyHubEvent, approveResponse, checkoutUrl, draftForInteraction, editResponse,
  enqueue, type HubPayload, judgeme, loadConnection, NotAllowed, planBySlug, QuotaExceeded, quotaFor,
  rejectResponse, vaultFromEnv, verifyHubSignature, webhookUrlFor,
} from '@eqence/core';
import { reviewIdFromWebhook, verifyJudgeMeWebhook, JudgeMeError } from '@eqence/connectors';
import { auditLog, brandVoices, connections, interactions, responses, tenants } from '@eqence/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { db } from './db';
import { env } from './env';

async function tenantOf(c: Context) {
  const u = c.get('user') as { id: string };
  const [t] = await db.select().from(tenants).where(eq(tenants.ownerUserId, u.id));
  if (!t) throw new NotAllowed('no workspace for this account');
  return t;
}

function fail(c: Context, err: unknown) {
  if (err instanceof QuotaExceeded) return c.json({ error: err.message }, 402);
  if (err instanceof NotAllowed) return c.json({ error: err.message }, 404);
  if (err instanceof JudgeMeError) return c.json({ error: 'Judge.me rejected the request', detail: err.message }, 400);
  throw err;
}

export function mountRoutes(app: Hono<any>) {
  /* ── connections ── */
  app.get('/api/v1/connections', async (c) => {
    const t = await tenantOf(c);
    const rows = await db.select({
      id: connections.id, source: connections.source, externalAccount: connections.externalAccount,
      status: connections.status, lastSyncAt: connections.lastSyncAt, error: connections.error, createdAt: connections.createdAt,
    }).from(connections).where(eq(connections.tenantId, t.id));
    return c.json({ connections: rows });
  });

  app.post('/api/v1/connections/judgeme', async (c) => {
    const t = await tenantOf(c);
    const body = await c.req.json().catch(() => ({})) as { shopDomain?: string; apiToken?: string };
    let account: { externalAccount: string; scopes: string[] };
    try {
      account = await judgeme.connect({ shopDomain: String(body.shopDomain ?? ''), apiToken: String(body.apiToken ?? '') });
    } catch (err) {
      if (err instanceof JudgeMeError || err instanceof Error) return c.json({ error: 'Could not connect to Judge.me', detail: err.message }, 400);
      throw err;
    }
    const credentialsRef = await vaultFromEnv().put({ shopDomain: account.externalAccount, apiToken: String(body.apiToken).trim() });
    const [conn] = await db.insert(connections).values({
      tenantId: t.id, source: 'judgeme', externalAccount: account.externalAccount, credentialsRef, scopes: account.scopes,
    }).onConflictDoUpdate({
      target: [connections.tenantId, connections.source, connections.externalAccount],
      set: { credentialsRef, status: 'active', error: null, updatedAt: new Date() },
    }).returning();
    const loaded = await loadConnection(db, conn.id);
    await judgeme.registerWebhooks(loaded!.ctx, webhookUrlFor(env.publicUrl, conn.id));
    await enqueue(db, 'connection.sync', { connectionId: conn.id });
    await db.insert(auditLog).values({ tenantId: t.id, actorUserId: (c.get('user') as { id: string }).id, action: 'connection.created', target: conn.id, detail: { source: 'judgeme', shop: account.externalAccount } });
    return c.json({ connection: { id: conn.id, source: conn.source, externalAccount: conn.externalAccount, status: conn.status } }, 201);
  });

  app.post('/api/v1/connections/:id/sync', async (c) => {
    const t = await tenantOf(c);
    const [conn] = await db.select().from(connections).where(and(eq(connections.id, c.req.param('id')), eq(connections.tenantId, t.id)));
    if (!conn) return c.json({ error: 'not found' }, 404);
    await enqueue(db, 'connection.sync', { connectionId: conn.id });
    return c.json({ queued: true });
  });

  app.delete('/api/v1/connections/:id', async (c) => {
    const t = await tenantOf(c);
    const loaded = await loadConnection(db, c.req.param('id'));
    if (!loaded || loaded.row.tenantId !== t.id) return c.json({ error: 'not found' }, 404);
    await judgeme.removeWebhooks(loaded.ctx, webhookUrlFor(env.publicUrl, loaded.row.id)).catch(() => {});
    await vaultFromEnv().remove(loaded.row.credentialsRef);
    await db.update(connections).set({ status: 'revoked', updatedAt: new Date() }).where(eq(connections.id, loaded.row.id));
    return c.json({ revoked: true });
  });

  /* ── interactions and replies ── */
  app.get('/api/v1/interactions', async (c) => {
    const t = await tenantOf(c);
    const status = c.req.query('status');
    const where = status ? and(eq(interactions.tenantId, t.id), eq(interactions.status, status as any)) : eq(interactions.tenantId, t.id);
    const rows = await db.select({
      id: interactions.id, source: interactions.source, channelType: interactions.channelType, subject: interactions.subject,
      title: interactions.title, body: interactions.body, rating: interactions.rating, language: interactions.language,
      sentiment: interactions.sentiment, sentimentScore: interactions.sentimentScore, intent: interactions.intent,
      status: interactions.status, isPublic: interactions.isPublic, postedAt: interactions.postedAt,
    }).from(interactions).where(where).orderBy(desc(interactions.postedAt)).limit(200);
    const ids = rows.map((r) => r.id);
    const resp = ids.length ? await db.select().from(responses).where(inArray(responses.interactionId, ids)).orderBy(desc(responses.createdAt)) : [];
    return c.json({ interactions: rows.map((r) => ({ ...r, responses: resp.filter((x) => x.interactionId === r.id) })) });
  });

  app.post('/api/v1/interactions/:id/draft', async (c) => {
    const t = await tenantOf(c);
    try {
      const r = await draftForInteraction(db, aiConfigFromEnv(), t.id, c.req.param('id'), t.name);
      return c.json({ response: r }, 201);
    } catch (err) { return fail(c, err); }
  });

  app.patch('/api/v1/responses/:id', async (c) => {
    const t = await tenantOf(c);
    const body = await c.req.json().catch(() => ({})) as { body?: string };
    try { return c.json({ response: await editResponse(db, t.id, c.req.param('id'), String(body.body ?? '')) }); }
    catch (err) { return fail(c, err); }
  });

  app.post('/api/v1/responses/:id/approve', async (c) => {
    const t = await tenantOf(c);
    try { return c.json({ response: await approveResponse(db, t.id, c.req.param('id'), (c.get('user') as { id: string }).id) }); }
    catch (err) { return fail(c, err); }
  });

  app.post('/api/v1/responses/:id/reject', async (c) => {
    const t = await tenantOf(c);
    try { return c.json({ response: await rejectResponse(db, t.id, c.req.param('id'), (c.get('user') as { id: string }).id) }); }
    catch (err) { return fail(c, err); }
  });

  /* ── brand voice and usage ── */
  app.get('/api/v1/brand-voice', async (c) => {
    const t = await tenantOf(c);
    const [v] = await db.select().from(brandVoices).where(and(eq(brandVoices.tenantId, t.id), eq(brandVoices.active, true)));
    return c.json({ brandVoice: v ?? null });
  });

  app.put('/api/v1/brand-voice', async (c) => {
    const t = await tenantOf(c);
    const b = await c.req.json().catch(() => ({})) as { tone?: string; bannedPhrases?: string[]; signature?: string; dialectNotes?: string };
    const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : null) || null;
    const [prev] = await db.select().from(brandVoices).where(and(eq(brandVoices.tenantId, t.id), eq(brandVoices.active, true)));
    await db.update(brandVoices).set({ active: false }).where(eq(brandVoices.tenantId, t.id));
    const [v] = await db.insert(brandVoices).values({
      tenantId: t.id, version: (prev?.version ?? 0) + 1,
      tone: clean(b.tone, 200) ?? 'warm, concise, professional',
      bannedPhrases: Array.isArray(b.bannedPhrases) ? b.bannedPhrases.map((p) => String(p).trim().slice(0, 100)).filter(Boolean).slice(0, 50) : [],
      signature: clean(b.signature, 200), dialectNotes: clean(b.dialectNotes, 300),
    }).returning();
    return c.json({ brandVoice: v });
  });

  app.get('/api/v1/usage', async (c) => {
    const t = await tenantOf(c);
    return c.json({ aiActions: await quotaFor(db, t.id) });
  });

  /* ── billing through the SmarThinkerz Hub ── */
  // Public: the plans checkout will charge. Empty until a ladder is confirmed (PRICING_LADDER).
  app.get('/api/pricing', (c) => c.json({ ladder: process.env.PRICING_LADDER || null, plans: activeLadder() }));

  app.get('/api/v1/billing/checkout-url', async (c) => {
    const t = await tenantOf(c);
    const plan = planBySlug(c.req.query('plan'));
    if (!plan) return c.json({ error: activeLadder().length ? 'unknown plan' : 'pricing is not confirmed yet' }, 409);
    const u = c.get('user') as { email: string };
    const url = checkoutUrl({
      hubBaseUrl: process.env.HUB_BASE_URL || 'https://smarthinkerz.com',
      plan, cycle: c.req.query('cycle') === 'yearly' ? 'yearly' : 'monthly', tenantId: t.id, email: u.email,
      returnUrl: `${env.webUrl}/app/billing/return`, ref: c.req.query('ref') ?? null,
    });
    return c.json({ url });
  });

  // Hub partner webhook. Fails closed: no secret configured means nothing is accepted.
  app.post('/api/hub/webhook', async (c) => {
    const secret = process.env.HUB_PARTNER_SECRET || '';
    if (!secret) return c.json({ error: 'webhook receiver not configured' }, 503);
    const raw = Buffer.from(await c.req.arrayBuffer());
    if (!verifyHubSignature(raw, c.req.header('x-smarthinkerz-signature'), secret)) return c.json({ error: 'invalid signature' }, 401);
    let payload: HubPayload;
    try { payload = JSON.parse(raw.toString('utf8')); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    const result = await applyHubEvent(db, payload);
    return c.json({ outcome: result.outcome }, result.status);
  });

  /* ── Judge.me webhook: signature over the raw body, keyed by that store's token ── */
  app.post('/webhooks/judgeme/:connectionId', async (c) => {
    const id = c.req.param('connectionId');
    if (!/^[0-9a-f-]{36}$/.test(id)) return c.json({ error: 'not found' }, 404);
    const raw = Buffer.from(await c.req.arrayBuffer());
    const loaded = await loadConnection(db, id).catch(() => null);
    if (!loaded || loaded.row.status !== 'active') return c.json({ error: 'not found' }, 404);
    const sig = c.req.header('judgeme-hmac-sha256') ?? c.req.header('x-judgeme-hmac-sha256');
    if (!verifyJudgeMeWebhook(raw, sig, loaded.ctx.credentials.apiToken)) return c.json({ error: 'invalid signature' }, 401);
    let parsed: unknown;
    try { parsed = JSON.parse(raw.toString('utf8')); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    const reviewId = reviewIdFromWebhook(parsed);
    if (!reviewId) return c.json({ ignored: 'no review id' });
    // Only the id is taken from the webhook; the worker re-fetches the review from the API.
    await enqueue(db, 'judgeme.review', { connectionId: id, reviewId });
    return c.json({ queued: true });
  });
}
