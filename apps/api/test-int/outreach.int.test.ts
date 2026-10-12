// One click opt out against the real API app and a real Postgres (eqence_dev).
// Run on csb-fra with DATABASE_URL=<eqence_dev> and OUTREACH_SECRET=<any test value>.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { unsubscribeToken } from '@eqence/core';
import { outreachOptouts } from '@eqence/db';
import { eq } from 'drizzle-orm';

process.env.BETTER_AUTH_SECRET ||= 'test-only-secret-not-used-for-anything-real';
const SECRET = process.env.OUTREACH_SECRET!;
assert.ok(SECRET, 'OUTREACH_SECRET must be set for this test');

const { app } = await import('../src/app');
const { db, pool } = await import('../src/db');

const a = `optout-a-${randomUUID()}@example.invalid`;
const b = `optout-b-${randomUUID()}@example.invalid`;
const row = async (email: string) => (await db.select().from(outreachOptouts).where(eq(outreachOptouts.email, email)))[0];
const list = (auth?: string) => app.request('/api/outreach/optouts', { headers: auth ? { authorization: auth } : {} });

after(async () => {
  for (const e of [a, b]) await db.delete(outreachOptouts).where(eq(outreachOptouts.email, e));
  await pool.end();
});

test('a mail client one click POST unsubscribes exactly that address, and repeating it is harmless', async () => {
  const url = `/u/${unsubscribeToken(a, SECRET)}`;
  const post = () => app.request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
  assert.equal((await post()).status, 200);
  assert.equal((await post()).status, 200);
  assert.equal((await row(a))?.method, 'one_click');
  assert.equal(await row(b), undefined);
});

test('opening the footer link unsubscribes at once and does not echo the address', async () => {
  const res = await app.request(`/u/${unsubscribeToken(b, SECRET)}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /You are unsubscribed/);
  assert.ok(!html.includes(b));
  assert.equal((await row(b))?.method, 'link');
});

test('a forged, altered or foreign token changes nothing', async () => {
  const victim = `optout-v-${randomUUID()}@example.invalid`;
  const good = unsubscribeToken(victim, SECRET);
  const forged = [unsubscribeToken(victim, 'another-secret'), good.slice(0, -2), `${Buffer.from(victim).toString('base64url')}.x`, 'nonsense'];
  for (const t of forged) {
    assert.equal((await app.request(`/u/${t}`, { method: 'POST' })).status, 404);
    assert.equal((await app.request(`/u/${t}`)).status, 404);
  }
  assert.equal(await row(victim), undefined);
});

test('the export is for the sender only', async () => {
  assert.equal((await list()).status, 404);
  assert.equal((await list('Bearer wrong')).status, 404);
  const res = await list(`Bearer ${SECRET}`);
  assert.equal(res.status, 200);
  const emails = ((await res.json()) as { optouts: { email: string }[] }).optouts.map((o) => o.email);
  assert.ok(emails.includes(a) && emails.includes(b));
});
