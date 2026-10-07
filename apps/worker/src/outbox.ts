// Postgres outbox consumer, the pattern proven in C2C (server.cjs:1634-1675): claim a
// batch with FOR UPDATE SKIP LOCKED so several workers never take the same row, run the
// handler for its topic, retry with exponential backoff, dead-letter after MAX_ATTEMPTS.
import type pg from 'pg';

export type Handler = (payload: unknown) => Promise<void>;

const MAX_ATTEMPTS = 6;
const BATCH = 10;

export function backoffSeconds(attempts: number): number {
  return Math.min(3600, 15 * 2 ** attempts); // 30s, 60s, 2m, 4m, 8m, then capped at 1h
}

export async function tick(pool: pg.Pool, handlers: Record<string, Handler>): Promise<number> {
  const client = await pool.connect();
  let processed = 0;
  try {
    await client.query('begin');
    const { rows } = await client.query<{ id: number; topic: string; payload: unknown; attempts: number }>(
      `select id, topic, payload, attempts from outbox
        where status = 'pending' and run_after <= now()
        order by id for update skip locked limit $1`, [BATCH]);
    for (const row of rows) {
      const handler = handlers[row.topic];
      try {
        if (!handler) throw new Error(`no handler for topic "${row.topic}"`);
        await handler(row.payload);
        await client.query(`update outbox set status = 'done', attempts = attempts + 1, last_error = null where id = $1`, [row.id]);
      } catch (err) {
        const attempts = row.attempts + 1;
        const message = err instanceof Error ? err.message : String(err);
        await client.query(
          // Explicit casts: $2 is used both as a value and in a comparison, and Postgres
          // refuses to guess one type for it.
          `update outbox set attempts = $2::int, last_error = $3,
                  status = case when $2::int >= $4::int then 'dead' else 'pending' end,
                  run_after = now() + make_interval(secs => $5::int)
            where id = $1`,
          [row.id, attempts, message.slice(0, 2000), MAX_ATTEMPTS, backoffSeconds(attempts)]);
        console.error(`outbox ${row.id} (${row.topic}) attempt ${attempts} failed: ${message}`);
      }
      processed++;
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return processed;
}
