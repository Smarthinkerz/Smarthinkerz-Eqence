// Account self-service, carried over from C2C: see and end your sessions, export your
// data, delete your account, the super user's "view as plan" switch, and the Auto-DM
// sequence builder. All routes sit behind the /api/v1 session middleware.
import {
  cleanSequence, judgeme, loadConnection, MAX_SEQUENCES, MAX_SEQUENCE_STEPS, planAllowsSequences, planBySlug,
  sequencesMinPlan, vaultFromEnv, viewAsOptions, webhookUrlFor,
} from '@eqence/core';
import {
  account, aiActions, auditLog, authors, brandVoices, connections, interactions, responses, sequences, session, tenants, user,
} from '@eqence/db';
import { verifyPassword } from 'better-auth/crypto';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { db } from './db';
import { env } from './env';
import { isLegacyHash, verifyLegacyPassword } from './legacyPassword';

type U = { id: string; email: string; name: string; role?: string; isSuperUser?: boolean; effectivePlan?: string | null };
const me = (c: Context) => c.get('user') as U;
const sessionId = (c: Context) => (c.get('session') as { id: string }).id;
const fromOurSite = (c: Context) => env.webOrigins.includes(c.req.header('origin') ?? '');

async function tenantOf(userId: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.ownerUserId, userId));
  return t;
}

async function passwordIsCorrect(userId: string, password: string) {
  const [cred] = await db.select({ password: account.password }).from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));
  if (!cred?.password || !password) return false;
  return isLegacyHash(cred.password) ? verifyLegacyPassword(password, cred.password) : verifyPassword({ hash: cred.password, password });
}

/** The plan the sequence gate sees: a super user's view-as plan, else the paid plan while active. */
function sequencesAllowed(u: U, t: typeof tenants.$inferSelect | undefined) {
  if (u.isSuperUser) {
    const v = u.effectivePlan;
    if (v === 'none') return false;
    return planBySlug(v) ? planAllowsSequences(v) : true;
  }
  const active = t?.planStatus === 'active' && (!t.planExpiresAt || t.planExpiresAt.getTime() > Date.now());
  return active && planAllowsSequences(t?.plan);
}

export function mountAccount(app: Hono<any>) {
  /* ── sessions ── */
  app.get('/api/v1/me/sessions', async (c) => {
    const rows = await db.select({ id: session.id, ipAddress: session.ipAddress, userAgent: session.userAgent, createdAt: session.createdAt, expiresAt: session.expiresAt })
      .from(session).where(and(eq(session.userId, me(c).id), sql`${session.expiresAt} > now()`)).orderBy(desc(session.createdAt));
    const current = sessionId(c);
    return c.json({ sessions: rows.map((r) => ({ ...r, current: r.id === current })) });
  });

  // { scope: 'others' | 'all' }. 'all' is C2C's "log out of all devices" and ends this session too.
  app.post('/api/v1/me/sessions/revoke', async (c) => {
    if (!fromOurSite(c)) return c.json({ error: 'cross-site request refused' }, 403);
    const b = await c.req.json().catch(() => ({})) as { scope?: string };
    if (b.scope !== 'others' && b.scope !== 'all') return c.json({ error: 'scope must be others or all' }, 400);
    const u = me(c);
    const where = b.scope === 'all' ? eq(session.userId, u.id) : and(eq(session.userId, u.id), ne(session.id, sessionId(c)));
    const gone = await db.delete(session).where(where).returning({ id: session.id });
    await db.insert(auditLog).values({ actorUserId: u.id, action: 'account.sessions_revoked', target: u.id, detail: { scope: b.scope, count: gone.length } });
    return c.json({ revoked: gone.length });
  });

  /* ── export my data ── */
  app.get('/api/v1/me/export', async (c) => {
    const u = me(c);
    const t = await tenantOf(u.id);
    const [profile] = await db.select({
      id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, role: user.role,
      twoFactorEnabled: user.twoFactorEnabled, createdAt: user.createdAt,
    }).from(user).where(eq(user.id, u.id));
    const own = async () => {
      if (!t) return {};
      const [conn, inter, resp, voices, seqs, people, usage] = await Promise.all([
        // Connection credentials are never exported: only where it points and its state.
        db.select({ id: connections.id, source: connections.source, externalAccount: connections.externalAccount, status: connections.status, lastSyncAt: connections.lastSyncAt, createdAt: connections.createdAt })
          .from(connections).where(eq(connections.tenantId, t.id)),
        db.select({
          id: interactions.id, source: interactions.source, channelType: interactions.channelType, subject: interactions.subject, title: interactions.title,
          body: interactions.body, rating: interactions.rating, language: interactions.language, sentiment: interactions.sentiment, intent: interactions.intent,
          status: interactions.status, postedAt: interactions.postedAt, permalink: interactions.permalink,
        }).from(interactions).where(eq(interactions.tenantId, t.id)).orderBy(desc(interactions.postedAt)).limit(20000),
        db.select({ id: responses.id, interactionId: responses.interactionId, body: responses.body, language: responses.language, generatedBy: responses.generatedBy, status: responses.status, publishedAt: responses.publishedAt, createdAt: responses.createdAt })
          .from(responses).where(eq(responses.tenantId, t.id)).limit(20000),
        db.select().from(brandVoices).where(eq(brandVoices.tenantId, t.id)),
        db.select().from(sequences).where(eq(sequences.tenantId, t.id)),
        db.select({ id: authors.id, displayName: authors.displayName, interactionCount: authors.interactionCount, firstSeenAt: authors.firstSeenAt, lastSeenAt: authors.lastSeenAt })
          .from(authors).where(eq(authors.tenantId, t.id)).limit(20000),
        db.select({ month: sql<string>`to_char(date_trunc('month', ${aiActions.createdAt}), 'YYYY-MM')`, kind: aiActions.kind, billable: aiActions.billable, n: sql<number>`count(*)::int` })
          .from(aiActions).where(eq(aiActions.tenantId, t.id)).groupBy(sql`1`, aiActions.kind, aiActions.billable),
      ]);
      return { connections: conn, interactions: inter, replies: resp, brandVoices: voices, sequences: seqs, reviewers: people, aiUsageByMonth: usage };
    };
    const body = {
      exportedAt: new Date().toISOString(), product: 'Eqence',
      account: profile,
      workspace: t ? { id: t.id, name: t.name, plan: t.plan, planStatus: t.planStatus, planCycle: t.planCycle, planExpiresAt: t.planExpiresAt, createdAt: t.createdAt } : null,
      ...(await own()),
    };
    await db.insert(auditLog).values({ tenantId: t?.id, actorUserId: u.id, action: 'account.data_exported', target: u.id });
    c.header('Content-Disposition', `attachment; filename="eqence-export-${new Date().toISOString().slice(0, 10)}.json"`);
    c.header('Cache-Control', 'no-store');
    return c.json(body);
  });

  /* ── delete my account ── */
  // { password, confirm: 'DELETE' }. Removes the workspace and everything in it, the stored
  // store credentials and the Judge.me webhooks, then the account. It cannot be undone.
  app.post('/api/v1/me/delete', async (c) => {
    if (!fromOurSite(c)) return c.json({ error: 'cross-site request refused' }, 403);
    const u = me(c);
    const b = await c.req.json().catch(() => ({})) as { password?: unknown; confirm?: unknown };
    if (b.confirm !== 'DELETE') return c.json({ error: 'type DELETE to confirm' }, 400);
    if (u.isSuperUser || u.role === 'admin') return c.json({ error: 'administrator accounts cannot be deleted here; ask another administrator to remove the admin role first' }, 403);
    if (!(await passwordIsCorrect(u.id, String(b.password ?? '')))) return c.json({ error: 'password is incorrect' }, 403);

    const t = await tenantOf(u.id);
    if (t) {
      const conns = await db.select({ id: connections.id }).from(connections).where(eq(connections.tenantId, t.id));
      for (const { id } of conns) {
        const loaded = await loadConnection(db, id).catch(() => null);
        if (!loaded) continue;
        await judgeme.removeWebhooks(loaded.ctx, webhookUrlFor(env.publicUrl, id)).catch(() => {});
        await vaultFromEnv().remove(loaded.row.credentialsRef).catch(() => {});
      }
    }
    await db.transaction(async (tx) => {
      // The audit entry keeps no personal data: the account id is random and the email is not stored.
      await tx.insert(auditLog).values({ actorUserId: u.id, action: 'account.deleted', target: u.id, detail: { hadWorkspace: !!t, plan: t?.plan ?? null } });
      if (t) await tx.delete(tenants).where(eq(tenants.id, t.id));
      await tx.delete(user).where(eq(user.id, u.id));
    });
    return c.json({ deleted: true });
  });

  /* ── super user: view the product as a plan ── */
  app.get('/api/v1/me/view-as', (c) => {
    const u = me(c);
    if (!u.isSuperUser) return c.json({ error: 'not permitted' }, 403);
    const current = u.effectivePlan === 'none' || planBySlug(u.effectivePlan) ? u.effectivePlan : 'unlimited';
    return c.json({ current, options: viewAsOptions() });
  });

  app.put('/api/v1/me/view-as', async (c) => {
    if (!fromOurSite(c)) return c.json({ error: 'cross-site request refused' }, 403);
    const u = me(c);
    if (!u.isSuperUser) return c.json({ error: 'not permitted' }, 403);
    const b = await c.req.json().catch(() => ({})) as { plan?: unknown };
    const plan = String(b.plan ?? '');
    if (!viewAsOptions().includes(plan)) return c.json({ error: `unknown plan; use one of: ${viewAsOptions().join(', ')}` }, 400);
    // Changes only what this account is shown and allowed; it never creates a subscription.
    await db.update(user).set({ effectivePlan: plan, updatedAt: new Date() }).where(and(eq(user.id, u.id), eq(user.isSuperUser, true)));
    await db.insert(auditLog).values({ actorUserId: u.id, action: 'account.view_as_changed', target: u.id, detail: { plan } });
    return c.json({ current: plan });
  });

  /* ── Auto-DM sequences ── */
  app.get('/api/v1/sequences', async (c) => {
    const u = me(c);
    const t = await tenantOf(u.id);
    const rows = t ? await db.select().from(sequences).where(eq(sequences.tenantId, t.id)).orderBy(sequences.createdAt) : [];
    return c.json({
      sequences: rows, allowed: sequencesAllowed(u, t), minPlan: sequencesMinPlan()?.name ?? null,
      maxSteps: MAX_SEQUENCE_STEPS, maxSequences: MAX_SEQUENCES,
      // Honest status: definitions are saved, nothing is sent until a messaging channel exists.
      sending: false,
    });
  });

  const save = async (c: Context, id?: string) => {
    if (!fromOurSite(c)) return c.json({ error: 'cross-site request refused' }, 403);
    const u = me(c);
    const t = await tenantOf(u.id);
    if (!t) return c.json({ error: 'no workspace for this account' }, 404);
    if (!sequencesAllowed(u, t)) return c.json({ error: `Auto-DM sequences need the ${sequencesMinPlan()?.name ?? 'next'} plan or higher.`, upgrade: true }, 403);
    const parsed = cleanSequence(await c.req.json().catch(() => ({})));
    if ('error' in parsed) return c.json({ error: parsed.error }, 400);
    if (id) {
      if (!/^[0-9a-f-]{36}$/.test(id)) return c.json({ error: 'not found' }, 404);
      const [row] = await db.update(sequences).set({ ...parsed.value, updatedAt: new Date() })
        .where(and(eq(sequences.id, id), eq(sequences.tenantId, t.id))).returning();
      return row ? c.json({ sequence: row }) : c.json({ error: 'not found' }, 404);
    }
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(sequences).where(eq(sequences.tenantId, t.id));
    if (n >= MAX_SEQUENCES) return c.json({ error: `You have reached ${MAX_SEQUENCES} sequences.` }, 400);
    const [row] = await db.insert(sequences).values({ tenantId: t.id, ...parsed.value }).returning();
    return c.json({ sequence: row }, 201);
  };
  app.post('/api/v1/sequences', (c) => save(c));
  app.put('/api/v1/sequences/:id', (c) => save(c, c.req.param('id')));

  app.delete('/api/v1/sequences/:id', async (c) => {
    if (!fromOurSite(c)) return c.json({ error: 'cross-site request refused' }, 403);
    const id = c.req.param('id');
    const t = await tenantOf(me(c).id);
    if (!t || !/^[0-9a-f-]{36}$/.test(id)) return c.json({ error: 'not found' }, 404);
    const gone = await db.delete(sequences).where(and(eq(sequences.id, id), eq(sequences.tenantId, t.id))).returning({ id: sequences.id });
    return gone.length ? c.json({ deleted: true }) : c.json({ error: 'not found' }, 404);
  });
}
