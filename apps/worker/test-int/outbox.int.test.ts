// The outbox consumer against real Postgres (eqence_dev): success, a failed attempt
// that is rescheduled, and the dead-letter after the last attempt. The failure path once
// broke the whole loop ("inconsistent types deduced for parameter $2"); this pins it.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import pg from 'pg';
import { tick } from '../src/outbox';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const topic = `outboxtest.${randomBytes(4).toString('hex')}`;
after(async () => { await pool.query(`delete from outbox where topic like $1`, [`${topic}%`]); await pool.end(); });

const add = async (t: string, attempts = 0) =>
  (await pool.query(`insert into outbox (topic, payload, attempts) values ($1, '{"n":1}', $2) returning id`, [t, attempts])).rows[0].id as number;
const row = async (id: number) => (await pool.query(`select status, attempts, last_error, run_after > now() as later from outbox where id = $1`, [id])).rows[0];
// Only this test's topics have handlers here; other pending rows in the dev database
// are left for their own worker, so every tick is limited to rows we created.
async function run(handlers: Record<string, (p: unknown) => Promise<void>>) {
  await pool.query(`update outbox set run_after = now() + interval '1 hour' where status = 'pending' and topic not like $1 and run_after <= now()`, [`${topic}%`]);
  return tick(pool, handlers);
}

test('a job that succeeds is marked done', async () => {
  const id = await add(`${topic}.ok`);
  let seen: unknown;
  await run({ [`${topic}.ok`]: async (p) => { seen = p; } });
  assert.deepEqual(seen, { n: 1 });
  assert.deepEqual(await row(id), { status: 'done', attempts: 1, last_error: null, later: false });
});

test('a job that fails is kept, with the error, and rescheduled for later', async () => {
  const id = await add(`${topic}.fail`);
  await run({ [`${topic}.fail`]: async () => { throw new Error('store said no'); } });
  assert.deepEqual(await row(id), { status: 'pending', attempts: 1, last_error: 'store said no', later: true });
});

test('the sixth failure moves the job to the failed list; a job with no handler fails too', async () => {
  const last = await add(`${topic}.last`, 5);
  const orphan = await add(`${topic}.orphan`);
  await run({ [`${topic}.last`]: async () => { throw new Error('still no'); } });
  assert.deepEqual(await row(last), { status: 'dead', attempts: 6, last_error: 'still no', later: true });
  const o = await row(orphan);
  assert.equal(o.status, 'pending');
  assert.match(o.last_error, /no handler for topic/);
});
