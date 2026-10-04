// Two-factor sign-in for admins and admin user management, end to end through the real
// app, Better Auth and Postgres (eqence_dev). TOTP codes are computed from the secret the
// enable step returns (RFC 6238, SHA-1, 30 s, 6 digits), exactly as an authenticator app does.
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { after, before, test } from 'node:test';
import { account, auditLog, session, tenants, twoFactor, user } from '@eqence/db';
import { eq, inArray } from 'drizzle-orm';

process.env.BETTER_AUTH_SECRET ||= 'test-only-secret-not-used-for-anything-real';
process.env.PUBLIC_URL = 'https://api.eqence.com';
const { app } = await import('../src/app');
const { db, pool } = await import('../src/db');

const ORIGIN = 'https://www.eqence.com';
const tag = randomBytes(4).toString('hex');
const ids: string[] = [];
const creds: Record<string, { email: string; password: string; id: string }> = {};

function base32Decode(s: string) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of s.replace(/=+$/, '').toUpperCase()) bits += alpha.indexOf(ch).toString(2).padStart(5, '0');
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secretB32: string, offset = 0) {
  const counter = Math.floor(Date.now() / 1000 / 30) + offset;
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secretB32)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function makeUser(name: string, role: 'admin' | 'user', isSuperUser = false) {
  const id = `tfatest-${tag}-${name}`, email = `${id}@example.invalid`;
  const password = `Pw-${randomBytes(10).toString('hex')}!`, salt = randomBytes(16).toString('hex');
  await db.insert(user).values({ id, name, email, emailVerified: true, role, isSuperUser });
  await db.insert(account).values({ id: randomUUID(), accountId: id, providerId: 'credential', userId: id, password: `c2c-scrypt$${salt}:${scryptSync(password, salt, 64).toString('hex')}` });
  ids.push(id);
  creds[name] = { email, password, id };
}

const cookieOf = (r: Response, prev = '') => {
  const jar = new Map(prev.split('; ').filter(Boolean).map((c) => [c.split('=')[0], c]));
  for (const c of r.headers.getSetCookie()) { const kv = c.split(';')[0]; jar.set(kv.split('=')[0], kv); }
  return [...jar.values()].join('; ');
};
const post = (path: string, body: unknown, cookie = '') => app.request(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
});
const req = (method: string, path: string, cookie: string, body?: unknown) => app.request(path, {
  method, headers: { Origin: ORIGIN, cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
});
const signIn = (name: string) => post('/api/auth/sign-in/email', { email: creds[name].email, password: creds[name].password });

let adminSecret = '';
let adminCookie = '';

before(async () => {
  await makeUser('admin', 'admin');
  await makeUser('merchant', 'user');
  await makeUser('super', 'admin', true);
  await makeUser('victim', 'user');
});

after(async () => {
  await db.delete(auditLog).where(inArray(auditLog.actorUserId, ids));
  await db.delete(twoFactor).where(inArray(twoFactor.userId, ids));
  await db.delete(tenants).where(inArray(tenants.ownerUserId, ids));
  await db.delete(user).where(inArray(user.id, ids));
  await pool.end();
});

test('a new admin is blocked from admin routes until two-factor is set up', async () => {
  const s = await signIn('admin');
  assert.equal(s.status, 200);
  adminCookie = cookieOf(s);
  const r = await req('GET', '/api/v1/admin/overview', adminCookie);
  assert.equal(r.status, 403);
  assert.equal((await r.json() as { code: string }).code, 'admin_2fa_required');
});

test('enable needs the password; a wrong password is refused', async () => {
  const bad = await post('/api/auth/two-factor/enable', { password: 'wrong-password' }, adminCookie);
  assert.notEqual(bad.status, 200);
  const ok = await post('/api/auth/two-factor/enable', { password: creds.admin.password }, adminCookie);
  assert.equal(ok.status, 200);
  const j = await ok.json() as { totpURI: string; backupCodes: string[] };
  assert.match(j.totpURI, /^otpauth:\/\/totp\/Eqence:/);
  assert.ok(j.backupCodes.length >= 5);
  adminSecret = new URL(j.totpURI).searchParams.get('secret')!;
  adminCookie = cookieOf(ok, adminCookie);
  const [u] = await db.select({ e: user.twoFactorEnabled }).from(user).where(eq(user.id, creds.admin.id));
  assert.equal(u.e, false, 'not enabled until a code is confirmed');
});

test('confirming with a real authenticator code turns two-factor on and opens admin routes', async () => {
  const wrong = await post('/api/auth/two-factor/verify-totp', { code: '000000' }, adminCookie);
  assert.notEqual(wrong.status, 200);
  const ok = await post('/api/auth/two-factor/verify-totp', { code: totp(adminSecret) }, adminCookie);
  assert.equal(ok.status, 200);
  adminCookie = cookieOf(ok, adminCookie);
  const [u] = await db.select({ e: user.twoFactorEnabled }).from(user).where(eq(user.id, creds.admin.id));
  assert.equal(u.e, true);
  assert.equal((await req('GET', '/api/v1/admin/overview', adminCookie)).status, 200);
});

test('next sign-in: password alone gives no session; the authenticator code does', async () => {
  const s = await signIn('admin');
  assert.equal(s.status, 200);
  const body = await s.json() as { twoFactorRedirect?: boolean };
  assert.equal(body.twoFactorRedirect, true);
  const pending = cookieOf(s);
  assert.equal((await req('GET', '/api/v1/me', pending)).status, 401, 'no session before the code');
  assert.notEqual((await post('/api/auth/two-factor/verify-totp', { code: '123456' }, pending)).status, 200);
  const v = await post('/api/auth/two-factor/verify-totp', { code: totp(adminSecret) }, pending);
  assert.equal(v.status, 200);
  adminCookie = cookieOf(v, pending);
  assert.equal((await req('GET', '/api/v1/admin/overview', adminCookie)).status, 200);
});

test('user list: admins can search; regular users cannot see it', async () => {
  const r = await req('GET', `/api/v1/admin/users?q=${tag}`, adminCookie);
  assert.equal(r.status, 200);
  const j = await r.json() as { users: { email: string; twoFactorEnabled: boolean }[]; total: number };
  assert.equal(j.total, 4);
  assert.equal(j.users.find((u) => u.email === creds.admin.email)!.twoFactorEnabled, true);
  const m = await signIn('merchant');
  assert.equal((await req('GET', '/api/v1/admin/users', cookieOf(m))).status, 403);
});

test('disabling an account revokes its sessions and blocks sign-in; re-enabling restores it', async () => {
  const v = await signIn('victim');
  const victimCookie = cookieOf(v);
  assert.equal((await req('GET', '/api/v1/me', victimCookie)).status, 200);
  const d = await req('PATCH', `/api/v1/admin/users/${creds.victim.id}`, adminCookie, { disabled: true });
  assert.equal(d.status, 200);
  assert.equal((await db.select().from(session).where(eq(session.userId, creds.victim.id))).length, 0, 'sessions deleted');
  assert.equal((await req('GET', '/api/v1/me', victimCookie)).status, 401, 'old cookie is dead');
  const again = await signIn('victim');
  assert.notEqual(again.status, 200, 'cannot sign in while disabled');
  assert.equal((await req('PATCH', `/api/v1/admin/users/${creds.victim.id}`, adminCookie, { disabled: false })).status, 200);
  assert.equal((await signIn('victim')).status, 200);
});

test('role changes, guard rails and audit trail', async () => {
  assert.equal((await req('PATCH', `/api/v1/admin/users/${creds.merchant.id}`, adminCookie, { role: 'admin' })).status, 200);
  const [m] = await db.select({ role: user.role }).from(user).where(eq(user.id, creds.merchant.id));
  assert.equal(m.role, 'admin');
  assert.equal((await req('PATCH', `/api/v1/admin/users/${creds.merchant.id}`, adminCookie, { role: 'owner' })).status, 400);
  assert.equal((await req('PATCH', `/api/v1/admin/users/${creds.admin.id}`, adminCookie, { disabled: true })).status, 400, 'not your own account');
  assert.equal((await req('PATCH', `/api/v1/admin/users/${creds.super.id}`, adminCookie, { disabled: true })).status, 403, 'only a super user changes a super user');
  assert.equal((await req('PATCH', `/api/v1/admin/users/${creds.merchant.id}`, adminCookie, { isSuperUser: true })).status, 400, 'super-user status is not grantable');
  const [{ isSuperUser }] = await db.select({ isSuperUser: user.isSuperUser }).from(user).where(eq(user.id, creds.merchant.id));
  assert.equal(isSuperUser, false);
  const a = await (await req('GET', `/api/v1/admin/users/${creds.merchant.id}/audit`, adminCookie)).json() as { entries: { action: string }[] };
  assert.ok(a.entries.some((e) => e.action === 'admin.user_updated'));
});
