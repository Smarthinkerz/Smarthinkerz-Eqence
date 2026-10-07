// Admin operations carried over from C2C's admin console: audit log (view and CSV
// export), active sessions, IP bans, system monitor, failed-job replay and API keys.
// Mounted under /api/v1/admin, so requireAdmin (admin role + 2FA + our origin) applies.
import { banHours, cleanIp, cleanList, generateApiKey, toCsv } from '@eqence/core';
import { apiKeys, auditLog, ipBans, outbox, session, user } from '@eqence/db';
import { and, desc, eq, gt, ilike, inArray, or, sql } from 'drizzle-orm';
import { realpathSync } from 'node:fs';
import type { Context, Hono } from 'hono';
import { db } from './db';
import { clearBanCache, clientIp } from './security';

const actor = (c: Context) => (c.get('user') as { id: string }).id;
const page = (c: Context) => Math.max(1, Math.min(1000, Number(c.req.query('page')) || 1));
const startedAt = Date.now();

// The running release, read from where the service's entry file really lives
// (/opt/eqence/releases/<stamp>-<commit>/api/index.mjs).
function release(): string | null {
  try { return realpathSync(process.argv[1] ?? '').match(/releases[\/]([^\/]+)/)?.[1] ?? null; } catch { return null; }
}

function auditWhere(c: Context) {
  const q = (c.req.query('q') ?? '').trim().slice(0, 100);
  return q ? or(ilike(auditLog.action, `%${q}%`), ilike(auditLog.target, `%${q}%`), ilike(user.email, `%${q}%`)) : undefined;
}

export function mountAdminOps(app: Hono<any>) {
  /* ── audit log ── */
  const auditRows = (c: Context, limit: number, offset = 0) => db.select({
    id: auditLog.id, createdAt: auditLog.createdAt, action: auditLog.action, actorUserId: auditLog.actorUserId,
    actorEmail: user.email, target: auditLog.target, detail: auditLog.detail,
  }).from(auditLog).leftJoin(user, eq(user.id, auditLog.actorUserId))
    .where(auditWhere(c)).orderBy(desc(auditLog.id)).limit(limit).offset(offset);

  app.get('/api/v1/admin/audit', async (c) => {
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorUserId)).where(auditWhere(c));
    return c.json({ entries: await auditRows(c, 50, (page(c) - 1) * 50), total, page: page(c) });
  });

  app.get('/api/v1/admin/audit/export', async (c) => {
    const rows = await auditRows(c, 10000);
    await db.insert(auditLog).values({ actorUserId: actor(c), action: 'admin.audit_exported', detail: { rows: rows.length } });
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="eqence-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    c.header('Cache-Control', 'no-store');
    return c.body(toCsv(['id', 'time', 'action', 'actor', 'target', 'detail'],
      rows.map((r) => [r.id, r.createdAt.toISOString(), r.action, r.actorEmail ?? r.actorUserId ?? '', r.target ?? '', r.detail ?? ''])));
  });

  /* ── active sessions ── */
  app.get('/api/v1/admin/sessions', async (c) => {
    const rows = await db.select({
      id: session.id, userId: session.userId, email: user.email, role: user.role, ipAddress: session.ipAddress,
      userAgent: session.userAgent, createdAt: session.createdAt, expiresAt: session.expiresAt,
    }).from(session).innerJoin(user, eq(user.id, session.userId)).where(gt(session.expiresAt, new Date()))
      .orderBy(desc(session.createdAt)).limit(200);
    const mine = (c.get('session') as { id: string }).id;
    return c.json({ sessions: rows.map((r) => ({ ...r, current: r.id === mine })) });
  });

  // { sessionId } ends one session; { userId } ends every session of that account.
  app.post('/api/v1/admin/sessions/revoke', async (c) => {
    const b = await c.req.json().catch(() => ({})) as { sessionId?: unknown; userId?: unknown };
    const mine = (c.get('session') as { id: string }).id;
    const where = typeof b.sessionId === 'string' ? eq(session.id, b.sessionId)
      : typeof b.userId === 'string' ? eq(session.userId, b.userId) : null;
    if (!where) return c.json({ error: 'sessionId or userId is required' }, 400);
    // The admin's own current session is never ended from here (use Sign out).
    const gone = await db.delete(session).where(and(where, sql`${session.id} <> ${mine}`)).returning({ id: session.id, userId: session.userId });
    await db.insert(auditLog).values({ actorUserId: actor(c), action: 'admin.sessions_revoked', target: String(b.userId ?? b.sessionId).slice(0, 100), detail: { count: gone.length } });
    return c.json({ revoked: gone.length });
  });

  /* ── IP bans ── */
  app.get('/api/v1/admin/bans', async (c) => {
    const rows = await db.select({ ip: ipBans.ip, reason: ipBans.reason, bannedUntil: ipBans.bannedUntil, createdAt: ipBans.createdAt, bannedByEmail: user.email })
      .from(ipBans).leftJoin(user, eq(user.id, ipBans.bannedBy)).where(gt(ipBans.bannedUntil, new Date())).orderBy(desc(ipBans.createdAt));
    return c.json({ bans: rows, yourIp: clientIp(c) });
  });

  app.post('/api/v1/admin/bans', async (c) => {
    const b = await c.req.json().catch(() => ({})) as { ip?: unknown; reason?: unknown; hours?: unknown };
    const ip = cleanIp(b.ip);
    if (!ip) return c.json({ error: 'enter one IPv4 or IPv6 address' }, 400);
    if (ip === clientIp(c)) return c.json({ error: 'that is your own address; banning it would lock you out' }, 400);
    if (ip === '127.0.0.1' || ip === '::1') return c.json({ error: 'the server\'s own address cannot be banned' }, 400);
    const hours = banHours(b.hours);
    const reason = String(b.reason ?? '').trim().slice(0, 200) || null;
    const until = new Date(Date.now() + hours * 3600_000);
    await db.insert(ipBans).values({ ip, reason, bannedUntil: until, bannedBy: actor(c) })
      .onConflictDoUpdate({ target: ipBans.ip, set: { reason, bannedUntil: until, bannedBy: actor(c), createdAt: new Date() } });
    // Anyone signed in from that address is signed out as well.
    const gone = await db.delete(session).where(eq(session.ipAddress, ip)).returning({ id: session.id });
    await db.insert(auditLog).values({ actorUserId: actor(c), action: 'admin.ip_banned', target: ip, detail: { hours, reason, sessionsEnded: gone.length } });
    clearBanCache();
    return c.json({ ban: { ip, reason, bannedUntil: until }, sessionsEnded: gone.length }, 201);
  });

  app.delete('/api/v1/admin/bans/:ip', async (c) => {
    const ip = cleanIp(decodeURIComponent(c.req.param('ip')));
    if (!ip) return c.json({ error: 'not found' }, 404);
    const gone = await db.delete(ipBans).where(eq(ipBans.ip, ip)).returning({ ip: ipBans.ip });
    if (!gone.length) return c.json({ error: 'not found' }, 404);
    await db.insert(auditLog).values({ actorUserId: actor(c), action: 'admin.ip_unbanned', target: ip });
    clearBanCache();
    return c.json({ removed: true });
  });

  /* ── system monitor ── */
  app.get('/api/v1/admin/system', async (c) => {
    const t0 = Date.now();
    await db.execute(sql`select 1`);
    const dbMs = Date.now() - t0;
    const one = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows[0] as Record<string, unknown>;
    const [jobs, sizes, counts] = await Promise.all([
      one(sql`select count(*) filter (where status = 'pending')::int as pending,
                     count(*) filter (where status = 'dead')::int as dead,
                     count(*) filter (where status = 'done' and created_at > now() - interval '24 hours')::int as done_24h,
                     coalesce(extract(epoch from now() - min(created_at) filter (where status = 'pending' and run_after <= now())), 0)::int as oldest_due_seconds
              from outbox`),
      one(sql`select pg_database_size(current_database())::bigint as bytes, current_setting('server_version') as version`),
      one(sql`select (select count(*) from "user")::int as users, (select count(*) from session where expires_at > now())::int as sessions,
                     (select count(*) from connections where status = 'active')::int as connections,
                     (select count(*) from interactions where ingested_at > now() - interval '24 hours')::int as interactions_24h,
                     (select count(*) from ai_actions where created_at > now() - interval '24 hours')::int as ai_actions_24h,
                     (select count(*) from ip_bans where banned_until > now())::int as active_bans,
                     (select count(*) from hub_events where received_at > now() - interval '30 days')::int as hub_events_30d`),
    ]);
    // The worker reports its own last tick on a loopback port.
    let worker: { ok: boolean; lastTickAt?: string | null; lastError?: string | null } = { ok: false };
    try {
      const r = await fetch(`http://127.0.0.1:${process.env.WORKER_HEALTH_PORT || 4420}/`, { signal: AbortSignal.timeout(1500) });
      worker = await r.json() as typeof worker;
    } catch { worker = { ok: false, lastError: 'worker health endpoint did not answer' }; }
    const mem = process.memoryUsage();
    return c.json({
      api: { ok: true, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), node: process.version, memoryMb: Math.round(mem.rss / 1048576), release: release() },
      database: { ok: true, latencyMs: dbMs, sizeMb: Math.round(Number(sizes.bytes) / 1048576), version: sizes.version },
      worker, jobs, counts,
      config: {
        ai: !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY, email: !!process.env.RESEND_API_KEY,
        hub: !!process.env.HUB_PARTNER_SECRET, pricing: process.env.PRICING_LADDER || null,
      },
    });
  });

  /* ── failed jobs (C2C's dead-letter replay) ── */
  app.get('/api/v1/admin/jobs', async (c) => {
    const status = c.req.query('status') === 'pending' ? 'pending' : 'dead';
    const rows = await db.select({ id: outbox.id, topic: outbox.topic, status: outbox.status, attempts: outbox.attempts, lastError: outbox.lastError, runAfter: outbox.runAfter, createdAt: outbox.createdAt })
      .from(outbox).where(eq(outbox.status, status)).orderBy(desc(outbox.id)).limit(100);
    return c.json({ jobs: rows });
  });

  // { ids: number[] } or { all: true }: put failed jobs back in the queue with a fresh attempt count.
  app.post('/api/v1/admin/jobs/replay', async (c) => {
    const b = await c.req.json().catch(() => ({})) as { ids?: unknown; all?: unknown };
    const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 500) : [];
    if (!ids.length && b.all !== true) return c.json({ error: 'ids or all is required' }, 400);
    const where = b.all === true ? eq(outbox.status, 'dead') : and(eq(outbox.status, 'dead'), inArray(outbox.id, ids));
    const back = await db.update(outbox).set({ status: 'pending', attempts: 0, runAfter: new Date() }).where(where).returning({ id: outbox.id });
    await db.insert(auditLog).values({ actorUserId: actor(c), action: 'admin.jobs_replayed', detail: { count: back.length } });
    return c.json({ replayed: back.length });
  });

  /* ── API keys ── */
  app.get('/api/v1/admin/api-keys', async (c) => {
    const rows = await db.select({
      id: apiKeys.id, keyId: apiKeys.keyId, label: apiKeys.label, scopes: apiKeys.scopes, ipAllowlist: apiKeys.ipAllowlist,
      ratePerMin: apiKeys.ratePerMin, revoked: apiKeys.revoked, lastUsedAt: apiKeys.lastUsedAt, createdAt: apiKeys.createdAt, ownerEmail: user.email,
    }).from(apiKeys).innerJoin(user, eq(user.id, apiKeys.userId)).orderBy(desc(apiKeys.createdAt)).limit(200);
    return c.json({ keys: rows });
  });

  app.post('/api/v1/admin/api-keys', async (c) => {
    const b = await c.req.json().catch(() => ({})) as { label?: unknown; scopes?: unknown; ipAllowlist?: unknown; ratePerMin?: unknown };
    const ips = cleanList(b.ipAllowlist);
    if (ips.some((ip) => !cleanIp(ip))) return c.json({ error: 'the IP allowlist must be single IPv4 or IPv6 addresses' }, 400);
    const rate = Math.max(1, Math.min(600, Math.floor(Number(b.ratePerMin)) || 60));
    const k = generateApiKey();
    const [row] = await db.insert(apiKeys).values({
      userId: actor(c), keyId: k.keyId, keyHash: k.keyHash, label: String(b.label ?? '').trim().slice(0, 80) || null,
      scopes: cleanList(b.scopes).map((s) => s.slice(0, 40)), ipAllowlist: ips.map((ip) => cleanIp(ip)!), ratePerMin: rate,
    }).returning({ id: apiKeys.id, keyId: apiKeys.keyId });
    await db.insert(auditLog).values({ actorUserId: actor(c), action: 'admin.api_key_issued', target: row.keyId });
    // The full key is returned once, here, and can never be read again.
    return c.json({ key: { id: row.id, keyId: row.keyId, apiKey: k.plaintext, ratePerMin: rate } }, 201);
  });

  app.delete('/api/v1/admin/api-keys/:id', async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/.test(id)) return c.json({ error: 'not found' }, 404);
    const [row] = await db.update(apiKeys).set({ revoked: true }).where(eq(apiKeys.id, id)).returning({ keyId: apiKeys.keyId });
    if (!row) return c.json({ error: 'not found' }, 404);
    await db.insert(auditLog).values({ actorUserId: actor(c), action: 'admin.api_key_revoked', target: row.keyId });
    return c.json({ revoked: true });
  });
}
