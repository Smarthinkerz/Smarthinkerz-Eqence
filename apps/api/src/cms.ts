// Admin CMS (front-page text and blog) and the public reads behind eqence.com/blog.
// Rebuilt from the Cahit CRM's feature set, without its flaws: every admin route is
// behind the session plus an admin role check, state-changing requests must come from
// one of our own origins, Markdown is rendered without HTML, uploads are size-capped
// and identified by magic bytes, and AI output is never stored without the admin saving it.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aiConfigFromEnv } from '@eqence/core';
import { blogAssist, type BlogAiAction } from '@eqence/ai';
import {
  cleanBlogInput, CONTENT_LANGS, contentMax, MAX_IMAGE_BYTES, slugify, sniffImage, uniqueSlug, validContentKey,
} from '@eqence/core';
import { auditLog, blogPosts, siteContent } from '@eqence/db';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { Context, Hono, Next } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { db } from './db';
import { env } from './env';

type U = { id: string; role?: string; isSuperUser?: boolean };

// The signed-in user set by the /api/v1 session middleware. Typed loosely because route-level
// middleware (bodyLimit) narrows Hono's context variables.
const userOf = (c: unknown) => (c as Context).get('user') as U;

export function isAdmin(u: U | undefined | null) {
  return !!u && (u.role === 'admin' || u.isSuperUser === true);
}

async function requireAdmin(c: Context, next: Next) {
  if (!isAdmin(userOf(c))) return c.json({ error: 'admin only' }, 403);
  // Cookies alone must not authorise a write: the request has to come from our web app.
  if (c.req.method !== 'GET' && !env.webOrigins.includes(c.req.header('origin') ?? '')) {
    return c.json({ error: 'cross-site request refused' }, 403);
  }
  await next();
}

const filesBase = () => `${env.publicUrl.replace(/\/$/, '')}/files`;
const publicPost = (p: typeof blogPosts.$inferSelect) => ({
  slug: p.slug, titleEn: p.titleEn, titleAr: p.titleAr, excerptEn: p.excerptEn, excerptAr: p.excerptAr,
  coverUrl: p.coverUrl, authorName: p.authorName, publishedAt: p.publishedAt,
});

async function freeSlug(base: string, excludeId?: string) {
  const rows = await db.select({ slug: blogPosts.slug, id: blogPosts.id }).from(blogPosts)
    .where(sql`${blogPosts.slug} = ${base} or ${blogPosts.slug} like ${base + '-%'}`);
  return uniqueSlug(base, new Set(rows.filter((r) => r.id !== excludeId).map((r) => r.slug)));
}

export function mountCms(app: Hono<any>) {
  /* ── public ── */
  app.get('/api/content', async (c) => {
    const rows = await db.select({ key: siteContent.key, lang: siteContent.lang, value: siteContent.value }).from(siteContent);
    const out: Record<string, Record<string, string>> = { en: {}, ar: {}, ja: {} };
    for (const r of rows) (out[r.lang] ??= {})[r.key] = r.value;
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({ overrides: out });
  });

  app.get('/api/blog', async (c) => {
    const rows = await db.select().from(blogPosts)
      .where(and(eq(blogPosts.status, 'published'), isNotNull(blogPosts.publishedAt)))
      .orderBy(desc(blogPosts.publishedAt)).limit(60);
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({ posts: rows.map(publicPost) });
  });

  app.get('/api/blog/:slug', async (c) => {
    const [p] = await db.select().from(blogPosts)
      .where(and(eq(blogPosts.slug, c.req.param('slug')), eq(blogPosts.status, 'published')));
    if (!p) return c.json({ error: 'not found' }, 404);
    return c.json({ post: { ...publicPost(p), bodyEn: p.bodyEn, bodyAr: p.bodyAr, metaTitle: p.metaTitle, metaDescription: p.metaDescription } });
  });

  /* ── admin (session required by the /api/v1 middleware, then admin role) ── */
  app.use('/api/v1/admin/*', requireAdmin);

  // Admin dashboard: counts only, no personal data.
  app.get('/api/v1/admin/overview', async (c) => {
    const one = async (q: ReturnType<typeof sql>) => Number((await db.execute(q)).rows[0]?.n ?? 0);
    const [published, drafts, overrides, users, verified, activePlans, connections, reviews, published7] = await Promise.all([
      one(sql`select count(*) as n from blog_posts where status = 'published'`),
      one(sql`select count(*) as n from blog_posts where status = 'draft'`),
      one(sql`select count(*) as n from site_content`),
      one(sql`select count(*) as n from "user"`),
      one(sql`select count(*) as n from "user" where email_verified`),
      one(sql`select count(*) as n from tenants where plan_status = 'active' and (plan_expires_at is null or plan_expires_at > now())`),
      one(sql`select count(*) as n from connections where status = 'active'`),
      one(sql`select count(*) as n from interactions`),
      one(sql`select count(*) as n from responses where status = 'published' and published_at > now() - interval '7 days'`),
    ]);
    const [latest] = await db.select({ slug: blogPosts.slug, titleEn: blogPosts.titleEn, status: blogPosts.status, updatedAt: blogPosts.updatedAt })
      .from(blogPosts).orderBy(desc(blogPosts.updatedAt)).limit(1);
    return c.json({
      blog: { published, drafts, latest: latest ?? null },
      content: { overrides },
      accounts: { users, verified, activePlans },
      reviews: { connections, reviews, repliesPosted7d: published7 },
    });
  });

  app.get('/api/v1/admin/content', async (c) => {
    const rows = await db.select().from(siteContent);
    return c.json({ rows: rows.map((r) => ({ key: r.key, lang: r.lang, value: r.value, updatedAt: r.updatedAt })) });
  });

  // { lang, values: { key: "text" | null } }; null removes the override (back to the default).
  app.put('/api/v1/admin/content', async (c) => {
    const b = await c.req.json().catch(() => ({})) as { lang?: string; values?: Record<string, unknown> };
    if (!CONTENT_LANGS.includes(b.lang as never)) return c.json({ error: 'lang must be en, ar or ja' }, 400);
    const entries = Object.entries(b.values ?? {});
    if (!entries.length || entries.length > 200) return c.json({ error: 'send 1-200 values' }, 400);
    for (const [k, v] of entries) {
      if (!validContentKey(k)) return c.json({ error: `invalid key ${k.slice(0, 80)}` }, 400);
      if (v !== null && (typeof v !== 'string' || v.length > contentMax(k))) return c.json({ error: `value for ${k} must be text up to ${contentMax(k)} characters, or null` }, 400);
    }
    const uid = userOf(c).id;
    await db.transaction(async (tx) => {
      for (const [k, v] of entries) {
        if (v === null || (v as string).trim() === '') {
          await tx.delete(siteContent).where(and(eq(siteContent.key, k), eq(siteContent.lang, b.lang!)));
        } else {
          await tx.insert(siteContent).values({ key: k, lang: b.lang!, value: (v as string).trim(), updatedBy: uid })
            .onConflictDoUpdate({ target: [siteContent.key, siteContent.lang], set: { value: (v as string).trim(), updatedBy: uid, updatedAt: new Date() } });
        }
      }
      await tx.insert(auditLog).values({ actorUserId: uid, action: 'cms.content_saved', detail: { lang: b.lang, keys: entries.map(([k]) => k) } });
    });
    return c.json({ saved: entries.length });
  });

  app.get('/api/v1/admin/blog', async (c) => {
    const rows = await db.select().from(blogPosts).orderBy(desc(blogPosts.updatedAt));
    return c.json({ posts: rows });
  });

  app.get('/api/v1/admin/blog/:id', async (c) => {
    const [p] = await db.select().from(blogPosts).where(eq(blogPosts.id, c.req.param('id')));
    return p ? c.json({ post: p }) : c.json({ error: 'not found' }, 404);
  });

  app.post('/api/v1/admin/blog', async (c) => {
    let input;
    try { input = cleanBlogInput(await c.req.json().catch(() => ({})), { coverOrigins: [new URL(env.publicUrl).origin], partial: false }); }
    catch (e) { return c.json({ error: (e as Error).message }, 400); }
    const base = input.slug ?? (slugify(input.titleEn!) || `post-${randomUUID().slice(0, 8)}`);
    const slug = await freeSlug(base);
    const status = input.status ?? 'draft';
    const [p] = await db.insert(blogPosts).values({
      ...input, titleEn: input.titleEn!, bodyEn: input.bodyEn ?? '', slug, status,
      publishedAt: status === 'published' ? new Date() : null, createdBy: userOf(c).id,
    }).returning();
    await db.insert(auditLog).values({ actorUserId: userOf(c).id, action: 'cms.blog_created', target: p.id, detail: { slug, status } });
    return c.json({ post: p }, 201);
  });

  app.patch('/api/v1/admin/blog/:id', async (c) => {
    const id = c.req.param('id');
    const [cur] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
    if (!cur) return c.json({ error: 'not found' }, 404);
    let input;
    try { input = cleanBlogInput(await c.req.json().catch(() => ({})), { coverOrigins: [new URL(env.publicUrl).origin], partial: true }); }
    catch (e) { return c.json({ error: (e as Error).message }, 400); }
    if (input.slug && input.slug !== cur.slug) input.slug = await freeSlug(input.slug, id);
    // First publication stamps the date; unpublishing keeps it for a later re-publish.
    const publishedAt = input.status === 'published' && !cur.publishedAt ? new Date() : undefined;
    const [p] = await db.update(blogPosts).set({ ...input, ...(publishedAt ? { publishedAt } : {}), updatedAt: new Date() })
      .where(eq(blogPosts.id, id)).returning();
    await db.insert(auditLog).values({ actorUserId: userOf(c).id, action: 'cms.blog_updated', target: id, detail: { fields: Object.keys(input), status: p.status } });
    return c.json({ post: p });
  });

  app.delete('/api/v1/admin/blog/:id', async (c) => {
    const [p] = await db.delete(blogPosts).where(eq(blogPosts.id, c.req.param('id'))).returning({ id: blogPosts.id, slug: blogPosts.slug });
    if (!p) return c.json({ error: 'not found' }, 404);
    await db.insert(auditLog).values({ actorUserId: userOf(c).id, action: 'cms.blog_deleted', target: p.id, detail: { slug: p.slug } });
    return c.json({ deleted: true });
  });

  // Image upload for covers. Stored on the ECS disk and served by nginx at /files/.
  app.post('/api/v1/admin/media', bodyLimit({ maxSize: MAX_IMAGE_BYTES + 64 * 1024, onError: (c) => c.json({ error: 'image larger than 4 MB' }, 413) }), async (c) => {
    const form = await c.req.parseBody().catch(() => null);
    const file = form?.file;
    if (!file || typeof file === 'string') return c.json({ error: 'send one file field named "file"' }, 400);
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) return c.json({ error: 'image larger than 4 MB' }, 413);
    const kind = sniffImage(buf);
    if (!kind) return c.json({ error: 'only PNG, JPEG or WebP images are accepted' }, 415);
    const name = `${randomUUID()}.${kind.ext}`;
    const dir = join(env.fileDir, 'blog');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), buf, { mode: 0o644 });
    await db.insert(auditLog).values({ actorUserId: userOf(c).id, action: 'cms.media_uploaded', target: name, detail: { bytes: buf.length, type: kind.mime } });
    return c.json({ url: `${filesBase()}/blog/${name}` }, 201);
  });

  const ACTIONS: BlogAiAction[] = ['titles', 'outline', 'full_post', 'excerpt', 'seo', 'translate_ar', 'translate_en', 'improve'];
  app.post('/api/v1/admin/blog-ai', async (c) => {
    const b = await c.req.json().catch(() => ({})) as { action?: string; topic?: string; text?: string };
    if (!ACTIONS.includes(b.action as BlogAiAction)) return c.json({ error: 'unknown action' }, 400);
    const topic = String(b.topic ?? '').slice(0, 500);
    const text = String(b.text ?? '').slice(0, 30000);
    try {
      const out = await blogAssist(aiConfigFromEnv(), b.action as BlogAiAction, topic, text);
      await db.insert(auditLog).values({ actorUserId: userOf(c).id, action: 'cms.blog_ai', detail: { action: b.action, model: out.usage.model, tokensIn: out.usage.tokensIn, tokensOut: out.usage.tokensOut } });
      return c.json({ text: out.text });
    } catch (e) {
      return c.json({ error: (e as Error).message.slice(0, 300) }, 400);
    }
  });
}
