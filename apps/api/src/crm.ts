// Comments, Leads and Customers (CRM). All three are views over the workspace's real
// interactions and customer records; every route is scoped to the signed-in user's
// workspace, and writes must come from our own web app.
import {
  addManualInteraction, cleanEmail, cleanManual, cleanPhone, cleanStage, cleanTags, HOT_LEAD_SCORE, LEAD_MIN_SCORE,
  MANUAL_PLATFORMS, NotAllowed, STAGES, toCsv,
} from '@eqence/core';
import { auditLog, authors, interactions, responses, tenants } from '@eqence/db';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { db } from './db';
import { env } from './env';

const userId = (c: Context) => (c.get('user') as { id: string }).id;
const fromOurSite = (c: Context) => env.webOrigins.includes(c.req.header('origin') ?? '');
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

async function tenantId(c: Context): Promise<string | null> {
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.ownerUserId, userId(c)));
  return t?.id ?? null;
}

// One row per customer with what their interactions add up to.
const customerRows = (tid: string, extra = sql``) => sql`
  select a.id, a.display_name as "displayName", a.stage, a.tags, a.email, a.phone, a.notes,
         a.first_seen_at as "firstSeenAt", a.last_seen_at as "lastSeenAt",
         count(i.id)::int as "interactions",
         count(i.id) filter (where i.status <> 'responded')::int as "open",
         round(avg(i.rating)::numeric, 1)::float as "avgRating",
         max(i.lead_score)::int as "leadScore",
         max(i.posted_at) as "lastActivity",
         (array_agg(i.sentiment order by i.posted_at desc))[1] as "lastSentiment",
         (array_agg(i.intent order by i.lead_score desc nulls last, i.posted_at desc))[1] as "topIntent",
         (array_agg(i.source order by i.posted_at desc))[1] as "source"
    from authors a left join interactions i on i.author_id = a.id
   where a.tenant_id = ${tid} ${extra}
   group by a.id`;

export function mountCrm(app: Hono<any>) {
  /* ── Comments and messages added by hand ── */
  app.get('/api/v1/comments/meta', (c) => c.json({ platforms: MANUAL_PLATFORMS }));

  app.post('/api/v1/comments', async (c) => {
    if (!fromOurSite(c)) return c.json({ error: 'cross-site request refused' }, 403);
    const tid = await tenantId(c);
    if (!tid) return c.json({ error: 'no workspace for this account' }, 404);
    const parsed = cleanManual(await c.req.json().catch(() => ({})));
    if ('error' in parsed) return c.json({ error: parsed.error }, 400);
    try {
      const row = await addManualInteraction(db, tid, parsed.value);
      return c.json({ interaction: { id: row.id, source: row.source, channelType: row.channelType } }, 201);
    } catch (err) {
      if (err instanceof NotAllowed) return c.json({ error: err.message }, 429);
      throw err;
    }
  });

  // Only something the merchant typed in can be deleted; platform data stays as the platform has it.
  app.delete('/api/v1/comments/:id', async (c) => {
    if (!fromOurSite(c)) return c.json({ error: 'cross-site request refused' }, 403);
    const tid = await tenantId(c);
    const id = c.req.param('id');
    if (!tid || !isUuid(id)) return c.json({ error: 'not found' }, 404);
    const gone = await db.delete(interactions)
      .where(and(eq(interactions.id, id), eq(interactions.tenantId, tid), sql`${interactions.connectionId} is null`)).returning({ id: interactions.id });
    return gone.length ? c.json({ deleted: true }) : c.json({ error: 'not found' }, 404);
  });

  app.get('/api/v1/comments/stats', async (c) => {
    const tid = await tenantId(c);
    if (!tid) return c.json({ total: 0, replied: 0, pending: 0, hot: 0 });
    const r = await db.execute(sql`
      select count(*)::int as total,
             count(*) filter (where status = 'responded')::int as replied,
             count(*) filter (where status <> 'responded')::int as pending,
             count(*) filter (where lead_score >= ${HOT_LEAD_SCORE})::int as hot
        from interactions where tenant_id = ${tid} and channel_type in ('comment', 'dm')`);
    return c.json(r.rows[0]);
  });

  /* ── Leads: customers showing intent to buy ── */
  const leadRows = async (tid: string, stage: string | null) => {
    const r = await db.execute(sql`
      select * from (${customerRows(tid, stage ? sql`and a.stage = ${stage}` : sql``)}) x
       where x."leadScore" >= ${LEAD_MIN_SCORE}
       order by x."leadScore" desc, x."lastActivity" desc nulls last limit 500`);
    return r.rows as Array<Record<string, unknown>>;
  };

  app.get('/api/v1/leads', async (c) => {
    const tid = await tenantId(c);
    if (!tid) return c.json({ leads: [], stats: { total: 0, hot: 0, contacted: 0, won: 0 }, stages: STAGES, hotScore: HOT_LEAD_SCORE });
    const all = await leadRows(tid, null);
    const stage = cleanStage(c.req.query('stage'));
    const stats = {
      total: all.length, hot: all.filter((l) => Number(l.leadScore) >= HOT_LEAD_SCORE).length,
      contacted: all.filter((l) => l.stage !== 'new').length, won: all.filter((l) => l.stage === 'won').length,
    };
    return c.json({ leads: stage ? all.filter((l) => l.stage === stage) : all, stats, stages: STAGES, hotScore: HOT_LEAD_SCORE, minScore: LEAD_MIN_SCORE });
  });

  app.get('/api/v1/leads/export', async (c) => {
    const tid = await tenantId(c);
    const rows = tid ? await leadRows(tid, null) : [];
    if (tid) await db.insert(auditLog).values({ tenantId: tid, actorUserId: userId(c), action: 'leads.exported', detail: { rows: rows.length } });
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="eqence-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    c.header('Cache-Control', 'no-store');
    const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');
    // A UTF-8 mark first, so Excel opens Arabic names correctly.
    return c.body('﻿' + toCsv(['name', 'score', 'intent', 'stage', 'source', 'interactions', 'email', 'phone', 'tags', 'last_activity'],
      rows.map((l) => [l.displayName ?? '', l.leadScore, l.topIntent ?? '', l.stage, l.source ?? '', l.interactions, l.email ?? '', l.phone ?? '', (l.tags as string[]).join(' '), iso(l.lastActivity)])));
  });

  /* ── Customers ── */
  app.get('/api/v1/customers', async (c) => {
    const tid = await tenantId(c);
    if (!tid) return c.json({ customers: [], total: 0, stages: STAGES });
    const q = (c.req.query('q') ?? '').trim().slice(0, 80);
    const stage = cleanStage(c.req.query('stage'));
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const filter = sql`${q ? sql`and (a.display_name ilike ${like} or a.email ilike ${like} or a.phone ilike ${like} or exists (select 1 from unnest(a.tags) t where t ilike ${like}))` : sql``}
                       ${stage ? sql`and a.stage = ${stage}` : sql``}`;
    const r = await db.execute(sql`select * from (${customerRows(tid, filter)}) x order by x."lastActivity" desc nulls last limit 300`);
    const [{ total }] = (await db.execute(sql`select count(*)::int as total from authors where tenant_id = ${tid}`)).rows as { total: number }[];
    return c.json({ customers: r.rows, total, stages: STAGES });
  });

  app.get('/api/v1/customers/:id', async (c) => {
    const tid = await tenantId(c);
    const id = c.req.param('id');
    if (!tid || !isUuid(id)) return c.json({ error: 'not found' }, 404);
    const [customer] = (await db.execute(customerRows(tid, sql`and a.id = ${id}`))).rows;
    if (!customer) return c.json({ error: 'not found' }, 404);
    const items = await db.select({
      id: interactions.id, source: interactions.source, channelType: interactions.channelType, subject: interactions.subject, title: interactions.title,
      body: interactions.body, rating: interactions.rating, sentiment: interactions.sentiment, intent: interactions.intent, leadScore: interactions.leadScore,
      status: interactions.status, postedAt: interactions.postedAt, language: interactions.language,
    }).from(interactions).where(and(eq(interactions.authorId, id), eq(interactions.tenantId, tid))).orderBy(desc(interactions.postedAt)).limit(100);
    const ids = items.map((i) => i.id);
    const replies = ids.length ? await db.select({ interactionId: responses.interactionId, body: responses.body, status: responses.status, publishedAt: responses.publishedAt })
      .from(responses).where(and(inArray(responses.interactionId, ids), eq(responses.status, 'published'))) : [];
    return c.json({ customer, timeline: items.map((i) => ({ ...i, reply: replies.find((r) => r.interactionId === i.id) ?? null })) });
  });

  // { stage?, notes?, tags?, email?, phone? }: only what the merchant keeps about the customer.
  app.patch('/api/v1/customers/:id', async (c) => {
    if (!fromOurSite(c)) return c.json({ error: 'cross-site request refused' }, 403);
    const tid = await tenantId(c);
    const id = c.req.param('id');
    if (!tid || !isUuid(id)) return c.json({ error: 'not found' }, 404);
    const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const set: Partial<typeof authors.$inferInsert> = {};
    if ('stage' in b) { const s = cleanStage(b.stage); if (!s) return c.json({ error: `stage must be one of: ${STAGES.join(', ')}` }, 400); set.stage = s; }
    if ('notes' in b) set.notes = String(b.notes ?? '').trim().slice(0, 4000) || null;
    if ('tags' in b) set.tags = cleanTags(b.tags);
    if ('email' in b) { const e = cleanEmail(b.email); if (e === undefined) return c.json({ error: 'that email address does not look right' }, 400); set.email = e; }
    if ('phone' in b) { const p = cleanPhone(b.phone); if (p === undefined) return c.json({ error: 'use digits, spaces and an optional + for the phone number' }, 400); set.phone = p; }
    if (!Object.keys(set).length) return c.json({ error: 'nothing to change' }, 400);
    const [row] = await db.update(authors).set({ ...set, updatedAt: new Date() }).where(and(eq(authors.id, id), eq(authors.tenantId, tid)))
      .returning({ id: authors.id, stage: authors.stage, notes: authors.notes, tags: authors.tags, email: authors.email, phone: authors.phone });
    return row ? c.json({ customer: row }) : c.json({ error: 'not found' }, 404);
  });
}
