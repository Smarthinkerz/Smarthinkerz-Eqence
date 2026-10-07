// Sign-in attempts are limited per client address (Better Auth: 3 per 10 seconds on
// sign-in). The other integration tests run with AUTH_RATE_LIMIT=off; this one turns it on.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';

process.env.BETTER_AUTH_SECRET ||= 'test-only-secret-not-used-for-anything-real';
process.env.PUBLIC_URL = 'https://api.eqence.com';
process.env.AUTH_RATE_LIMIT = 'on';
const { app } = await import('../src/app');
const { pool } = await import('../src/db');

after(() => pool.end());

const attempt = (ip: string) => app.request('/api/auth/sign-in/email', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://www.eqence.com', 'x-real-ip': ip },
  body: JSON.stringify({ email: `nobody-${randomBytes(4).toString('hex')}@example.invalid`, password: 'wrong-password-123' }),
});

test('rapid sign-in attempts from one address are cut off; another address is unaffected', async () => {
  const ip = `198.51.100.${1 + randomBytes(1)[0] % 250}`;
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await attempt(ip)).status);
  assert.ok(statuses.slice(0, 3).every((s) => s === 401), `first attempts are plain failures: ${statuses}`);
  assert.ok(statuses.includes(429), `later attempts are rate limited: ${statuses}`);
  assert.equal((await attempt('203.0.113.77')).status, 401, 'a different address is not limited');
});
