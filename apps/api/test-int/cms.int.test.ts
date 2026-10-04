// CMS routes against a real Postgres (eqence_dev), through the real app and Better Auth
// sessions. Run on csb-fra with DATABASE_URL=<eqence_dev>, FILE_DIR=<temp dir>.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { account, auditLog, blogPosts, siteContent, tenants, user } from '@eqence/db';
import { eq, inArray, like } from 'drizzle-orm';

process.env.BETTER_AUTH_SECRET ||= 'test-only-secret-not-used-for-anything-real';
process.env.PUBLIC_URL = 'https://api.eqence.com';
const { app } = await import('../src/app');
const { db, pool } = await import('../src/db');

const ORIGIN = 'https://www.eqence.com';
const tag = randomBytes(4).toString('hex');
const ids: string[] = [];
const cookies: Record<string, string> = {};

async function makeUser(name: string, role: 'admin' | 'user') {
  const id = `cmstest-${tag}-${name}`, email = `${id}@example.invalid`;
  const pw = `Pw-${randomBytes(10).toString('hex')}!`, salt = randomBytes(16).toString('hex');
  await db.insert(user).values({ id, name, email, emailVerified: true, role });
  await db.insert(account).values({ id: randomUUID(), accountId: id, providerId: 'credential', userId: id, password: `c2c-scrypt$${salt}:${scryptSync(pw, salt, 64).toString('hex')}` });
  ids.push(id);
  const r = await app.request('/api/auth/sign-in/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ email, password: pw }) });
  assert.equal(r.status, 200, `sign in ${name}`);
  cookies[name] = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  // Admin access needs two-factor. The full setup flow is tested in admin2fa.int.test.ts;
  // here the signed-in admin is marked as having completed it.
  if (role === 'admin') await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, id));
}

const call = (who: string | null, method: string, path: string, body?: unknown, origin: string | null = ORIGIN) =>
  app.request(path, {
    method,
    headers: { ...(who ? { cookie: cookies[who] } : {}), ...(origin ? { Origin: origin } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

before(async () => { await makeUser('admin', 'admin'); await makeUser('merchant', 'user'); });

after(async () => {
  await db.delete(blogPosts).where(like(blogPosts.slug, `cms-test-${tag}%`));
  await db.delete(siteContent).where(like(siteContent.value, `%${tag}%`));
  await db.delete(auditLog).where(inArray(auditLog.actorUserId, ids));
  await db.delete(tenants).where(inArray(tenants.ownerUserId, ids));
  await db.delete(user).where(inArray(user.id, ids));
  await pool.end();
});

test('admin routes: 401 signed out, 403 for a normal user, 200 for an admin', async () => {
  assert.equal((await call(null, 'GET', '/api/v1/admin/blog')).status, 401);
  assert.equal((await call('merchant', 'GET', '/api/v1/admin/blog')).status, 403);
  assert.equal((await call('merchant', 'PUT', '/api/v1/admin/content', { lang: 'en', values: { 'hero.title': 'x' } })).status, 403);
  assert.equal((await call('admin', 'GET', '/api/v1/admin/blog')).status, 200);
});

test('admin writes from another origin, or with no origin, are refused', async () => {
  assert.equal((await call('admin', 'PUT', '/api/v1/admin/content', { lang: 'en', values: { 'hero.title': 'x' } }, 'https://evil.example')).status, 403);
  assert.equal((await call('admin', 'POST', '/api/v1/admin/blog', { titleEn: 'x' }, null)).status, 403);
});

test('content: saved override appears publicly; null restores the default; bad keys refused', async () => {
  const v = `Hero ${tag}`;
  assert.equal((await call('admin', 'PUT', '/api/v1/admin/content', { lang: 'ar', values: { 'hero.title': v } })).status, 200);
  const pub = await (await call(null, 'GET', '/api/content')).json() as { overrides: Record<string, Record<string, string>> };
  assert.equal(pub.overrides.ar['hero.title'], v);
  assert.equal((await call('admin', 'PUT', '/api/v1/admin/content', { lang: 'ar', values: { 'hero.title': null } })).status, 200);
  const pub2 = await (await call(null, 'GET', '/api/content')).json() as { overrides: Record<string, Record<string, string>> };
  assert.equal(pub2.overrides.ar['hero.title'], undefined);
  assert.equal((await call('admin', 'PUT', '/api/v1/admin/content', { lang: 'xx', values: { 'hero.title': 'a' } })).status, 400);
  assert.equal((await call('admin', 'PUT', '/api/v1/admin/content', { lang: 'en', values: { '<script>': 'a' } })).status, 400);
});

test('blog: draft is private, publish makes it public, slugs never collide', async () => {
  const t = `CMS Test ${tag}`;
  const a = await (await call('admin', 'POST', '/api/v1/admin/blog', { titleEn: t, bodyEn: '## Hello\nWorld', excerptEn: 'Ex' })).json() as { post: { id: string; slug: string; status: string; publishedAt: string | null } };
  assert.equal(a.post.slug, `cms-test-${tag}`);
  assert.equal(a.post.status, 'draft');
  assert.equal(a.post.publishedAt, null);
  assert.equal((await call(null, 'GET', `/api/blog/${a.post.slug}`)).status, 404, 'draft not public');
  const list0 = await (await call(null, 'GET', '/api/blog')).json() as { posts: { slug: string }[] };
  assert.equal(list0.posts.some((p) => p.slug === a.post.slug), false);

  const b = await (await call('admin', 'POST', '/api/v1/admin/blog', { titleEn: t, bodyEn: 'second' })).json() as { post: { slug: string } };
  assert.equal(b.post.slug, `cms-test-${tag}-2`, 'same title gets a numbered slug');

  const pubd = await (await call('admin', 'PATCH', `/api/v1/admin/blog/${a.post.id}`, { status: 'published', titleAr: 'عنوان' })).json() as { post: { status: string; publishedAt: string } };
  assert.equal(pubd.post.status, 'published');
  assert.ok(pubd.post.publishedAt);
  const detail = await (await call(null, 'GET', `/api/blog/${a.post.slug}`)).json() as { post: { titleEn: string; titleAr: string; bodyEn: string } };
  assert.deepEqual([detail.post.titleEn, detail.post.titleAr, detail.post.bodyEn], [t, 'عنوان', '## Hello\nWorld']);
  const list1 = await (await call(null, 'GET', '/api/blog')).json() as { posts: { slug: string; bodyEn?: string }[] };
  const card = list1.posts.find((p) => p.slug === a.post.slug)!;
  assert.ok(card);
  assert.equal(card.bodyEn, undefined, 'the list does not ship full bodies');

  assert.equal((await call('admin', 'PATCH', `/api/v1/admin/blog/${a.post.id}`, { status: 'draft' })).status, 200);
  assert.equal((await call(null, 'GET', `/api/blog/${a.post.slug}`)).status, 404, 'unpublished again');
  assert.equal((await call('admin', 'DELETE', `/api/v1/admin/blog/${a.post.id}`)).status, 200);
  assert.equal((await call('admin', 'GET', `/api/v1/admin/blog/${a.post.id}`)).status, 404);
});

test('blog: an outside cover URL is refused', async () => {
  const r = await call('admin', 'POST', '/api/v1/admin/blog', { titleEn: `CMS Test ${tag} cover`, coverUrl: 'https://evil.example/x.png' });
  assert.equal(r.status, 400);
});

test('media: PNG accepted and stored; SVG, HTML and fake extensions refused', async () => {
  const send = (bytes: Uint8Array, name: string, type: string) => {
    const fd = new FormData();
    fd.append('file', new File([bytes], name, { type }));
    return app.request('/api/v1/admin/media', { method: 'POST', headers: { cookie: cookies.admin, Origin: ORIGIN }, body: fd });
  };
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const ok = await send(png, 'cover.png', 'image/png');
  assert.equal(ok.status, 201);
  const { url } = await ok.json() as { url: string };
  assert.match(url, /^https:\/\/api\.eqence\.com\/files\/blog\/[0-9a-f-]{36}\.png$/);
  assert.ok(existsSync(join(process.env.FILE_DIR!, 'blog', url.split('/').pop()!)), 'file written to FILE_DIR');
  assert.equal((await send(new TextEncoder().encode('<svg onload=alert(1)></svg>'), 'x.svg', 'image/svg+xml')).status, 415);
  assert.equal((await send(new TextEncoder().encode('<html><script>alert(1)</script>'), 'x.png', 'image/png')).status, 415);
  const fd = new FormData(); fd.append('file', new File([png], 'cover.png', { type: 'image/png' }));
  assert.equal((await app.request('/api/v1/admin/media', { method: 'POST', headers: { cookie: cookies.merchant, Origin: ORIGIN }, body: fd })).status, 403);
});

test('admin overview: counts for admins, 403 for others, no personal data', async () => {
  assert.equal((await call('merchant', 'GET', '/api/v1/admin/overview')).status, 403);
  const r = await call('admin', 'GET', '/api/v1/admin/overview');
  assert.equal(r.status, 200);
  const o = await r.json() as Record<string, Record<string, unknown>>;
  for (const [group, keys] of Object.entries({ blog: ['published', 'drafts'], content: ['overrides'], accounts: ['users', 'verified', 'activePlans'], reviews: ['connections', 'reviews', 'repliesPosted7d'] })) {
    for (const k of keys) assert.equal(typeof o[group][k], 'number', `${group}.${k}`);
  }
  assert.ok((o.accounts.users as number) >= 2, 'counts the two test accounts');
  assert.ok(!JSON.stringify(o).includes('@'), 'no email addresses in the overview');
});

test('an admin without two-factor set up is refused with a clear code', async () => {
  await makeUser('admin-no2fa', 'admin');
  await db.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, `cmstest-${tag}-admin-no2fa`));
  const r = await call('admin-no2fa', 'GET', '/api/v1/admin/overview');
  assert.equal(r.status, 403);
  assert.equal((await r.json() as { code?: string }).code, 'admin_2fa_required');
});
