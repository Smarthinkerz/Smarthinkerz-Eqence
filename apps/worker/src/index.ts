// eqence-worker: runs outbox jobs (ingest, draft, publish) and scheduled syncs.
// Health on 127.0.0.1:WORKER_HEALTH_PORT reports the last successful tick.
import { createServer } from 'node:http';
import { createDb } from '@eqence/db';
import { buildHandlers } from './handlers';
import { tick } from './outbox';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('missing required environment variable DATABASE_URL');
const healthPort = Number(process.env.WORKER_HEALTH_PORT || 4420);
const { db, pool } = createDb(url);
const handlers = buildHandlers(db);

let lastTickAt = 0;
let lastError: string | null = null;
let stopping = false;

async function loop() {
  while (!stopping) {
    try {
      const n = await tick(pool, handlers);
      lastTickAt = Date.now();
      lastError = null;
      if (n === 0) await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error('tick failed:', lastError);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// Housekeeping, hourly (C2C's maintenance cron): drop what has expired and schedule the
// periodic review sync.
async function maintain() {
  for (const q of [
    `delete from session where expires_at < now()`,
    `delete from verification where expires_at < now() - interval '1 day'`,
    `delete from ip_bans where banned_until < now()`,
    `delete from rate_counters where window_start < now() - interval '1 day'`,
    // Safety net for missed Judge.me webhooks: re-sync every active store at least every
    // six hours, never queueing a second sync while one is still waiting.
    `insert into outbox (topic, payload)
       select 'connection.sync', jsonb_build_object('connectionId', c.id::text) from connections c
        where c.status = 'active' and (c.last_sync_at is null or c.last_sync_at < now() - interval '6 hours')
          and not exists (select 1 from outbox o where o.topic = 'connection.sync' and o.status = 'pending'
                           and o.payload->>'connectionId' = c.id::text)`,
  ]) await pool.query(q).catch((err) => console.error('maintenance failed:', err instanceof Error ? err.message : err));
}
const maintenance = setInterval(maintain, 3600_000);
maintain();

const health = createServer((_req, res) => {
  const fresh = Date.now() - lastTickAt < 30_000;
  res.writeHead(fresh ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: fresh, lastTickAt: lastTickAt ? new Date(lastTickAt).toISOString() : null, lastError }));
}).listen(healthPort, '127.0.0.1', () => console.log(`eqence-worker health on 127.0.0.1:${healthPort}`));

process.on('SIGTERM', () => {
  stopping = true;
  clearInterval(maintenance);
  health.close();
  setTimeout(() => pool.end().finally(() => process.exit(0)), 3000);
});

loop();
