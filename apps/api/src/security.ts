// IP bans and persistent rate limits, carried over from C2C (cc_ip_bans, cc_ids_counters).
// The client address is X-Real-IP, which nginx sets from the connecting socket; a
// client-sent forwarding chain is never trusted.
import { ipBans, rateCounters } from '@eqence/db';
import { gt, sql } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { db } from './db';

export function clientIp(c: Context): string {
  return (c.req.header('x-real-ip') ?? '').trim().toLowerCase() || 'unknown';
}

// Active bans are cached briefly so a ban check is not a query on every request.
// An admin change clears the cache, so a new ban applies on the next request.
let cache: { at: number; ips: Set<string> } | null = null;
const CACHE_MS = 15_000;

export function clearBanCache() { cache = null; }

async function activeBans(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.ips;
  const rows = await db.select({ ip: ipBans.ip }).from(ipBans).where(gt(ipBans.bannedUntil, new Date()));
  cache = { at: Date.now(), ips: new Set(rows.map((r) => r.ip)) };
  return cache.ips;
}

export async function refuseBanned(c: Context, next: Next) {
  // Health checks stay reachable so monitoring never depends on the bans table.
  if (c.req.path === '/health') return next();
  let banned = false;
  try { banned = (await activeBans()).has(clientIp(c)); } catch (err) { console.error('ban check failed', err); }
  if (banned) return c.json({ error: 'access from this address is blocked' }, 403);
  await next();
}

/**
 * Counts one hit in a fixed window and reports whether the caller is still within the
 * limit. One atomic statement, so concurrent requests cannot both slip under the limit.
 */
export async function withinLimit(bucket: string, key: string, windowSeconds: number, max: number): Promise<boolean> {
  const r = await db.execute(sql`
    insert into ${rateCounters} (bucket, key, window_start, count) values (${bucket}, ${key}, now(), 1)
    on conflict (bucket, key) do update set
      count = case when ${rateCounters.windowStart} < now() - make_interval(secs => ${windowSeconds}) then 1 else ${rateCounters.count} + 1 end,
      window_start = case when ${rateCounters.windowStart} < now() - make_interval(secs => ${windowSeconds}) then now() else ${rateCounters.windowStart} end
    returning count`);
  return Number(r.rows[0]?.count ?? 0) <= max;
}
