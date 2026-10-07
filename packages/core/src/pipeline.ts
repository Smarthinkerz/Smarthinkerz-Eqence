// The core loop, independent of the platform: store what a connector returns, classify
// it, draft a reply within quota, approve, publish. Nothing here branches on the source;
// platform differences stay inside the connector (merge-spec §4 acceptance test).
import { classify, draftReply, type AiConfig } from '@eqence/ai';
import type { RawInteraction } from '@eqence/connectors';
import {
  aiActions, auditLog, brandVoices, interactions, outbox, responses, tenants, user, type Db,
} from '@eqence/db';
import { linkAuthor } from './crm';
import { and, eq, gte, sql } from 'drizzle-orm';
import { planBySlug } from './pricing';

export class QuotaExceeded extends Error {}
export class NotAllowed extends Error {}

export async function enqueue(db: Db, topic: string, payload: unknown, delaySeconds = 0) {
  await db.insert(outbox).values({
    topic, payload,
    runAfter: sql`now() + make_interval(secs => ${delaySeconds})`,
  });
}

/** Upserts platform items. Returns ids of rows that were new, so only they get classified.
 *  Platform-owned fields are refreshed; our own state (status, sentiment) is kept. */
export async function upsertInteractions(db: Db, conn: { id: string; tenantId: string; source: string }, items: RawInteraction[]) {
  const created: string[] = [];
  for (const it of items) {
    // Every item is tied to one customer record, so Customers and Leads see the whole history.
    const authorId = await linkAuthor(db, conn.tenantId, conn.source, it.author, it.postedAt);
    const [row] = await db.insert(interactions).values({
      tenantId: conn.tenantId,
      connectionId: conn.id,
      authorId,
      source: conn.source as any,
      channelType: it.channelType,
      externalId: it.externalId,
      threadId: it.threadId ?? null,
      subject: it.subject ?? null,
      title: it.title ?? null,
      body: it.body,
      rating: it.rating ?? null,
      postedAt: it.postedAt,
      isPublic: it.isPublic,
      permalink: it.permalink ?? null,
      raw: { ...(it.raw as object), _author: it.author },
    }).onConflictDoUpdate({
      target: [interactions.tenantId, interactions.source, interactions.externalId],
      set: {
        body: sql`excluded.body`, title: sql`excluded.title`, rating: sql`excluded.rating`,
        isPublic: sql`excluded.is_public`, raw: sql`excluded.raw`, subject: sql`excluded.subject`,
        authorId: sql`coalesce(${interactions.authorId}, excluded.author_id)`,
      },
    }).returning({ id: interactions.id, inserted: sql<boolean>`(xmax = 0)` });
    if (row?.inserted) created.push(row.id);
  }
  for (const id of created) await enqueue(db, 'interaction.classify', { interactionId: id });
  return created;
}

export async function classifyInteraction(db: Db, ai: AiConfig, interactionId: string) {
  const [it] = await db.select().from(interactions).where(eq(interactions.id, interactionId));
  if (!it) return null;
  const author = (it.raw as { _author?: { displayName?: string } })._author;
  const { result, usage } = await classify(ai, {
    channelType: it.channelType, subject: it.subject, title: it.title, body: it.body, rating: it.rating,
    authorName: author?.displayName,
  });
  await db.update(interactions).set({
    language: result.language, sentiment: result.sentiment, sentimentScore: result.sentimentScore, intent: result.intent,
    leadScore: result.leadScore,
    status: it.status === 'new' ? 'triaged' : it.status,
  }).where(eq(interactions.id, interactionId));
  // Classification is recorded for cost tracking but is never billable.
  await db.insert(aiActions).values({
    tenantId: it.tenantId, kind: 'classify', interactionId, billable: false,
    model: usage.model, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut,
  });
  // One alert per interaction: only the first classification sends it, never a re-run.
  if (result.sentimentScore <= -0.4 && it.status === 'new') await enqueue(db, 'alert.negative', { interactionId });
  return result;
}

export function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Billable AI actions allowed this month for a tenant; -1 = unlimited, 0 = none. */
export async function quotaFor(db: Db, tenantId: string): Promise<{ limit: number; used: number }> {
  const [t] = await db.select({ plan: tenants.plan, status: tenants.planStatus, expires: tenants.planExpiresAt, super: user.isSuperUser, viewAs: user.effectivePlan })
    .from(tenants).innerJoin(user, eq(user.id, tenants.ownerUserId)).where(eq(tenants.id, tenantId));
  if (!t) throw new NotAllowed('unknown tenant');
  const [{ used }] = await db.select({ used: sql<number>`count(*)::int` }).from(aiActions)
    .where(and(eq(aiActions.tenantId, tenantId), eq(aiActions.billable, true), gte(aiActions.createdAt, monthStart())));
  // A super user is unlimited, unless they chose to view the product as a plan (or as no plan).
  if (t.super) {
    // Anything that is not a current plan (including tier names carried from C2C) means unlimited.
    if (t.viewAs === 'none') return { limit: 0, used };
    const viewed = planBySlug(t.viewAs);
    return { limit: viewed ? viewed.aiActionsPerMonth : -1, used };
  }
  const active = t.status === 'active' && (!t.expires || t.expires.getTime() > Date.now());
  const plan = active ? planBySlug(t.plan) : undefined;
  return { limit: plan ? plan.aiActionsPerMonth : 0, used };
}

export async function draftForInteraction(db: Db, ai: AiConfig, tenantId: string, interactionId: string, storeName: string) {
  const [it] = await db.select().from(interactions)
    .where(and(eq(interactions.id, interactionId), eq(interactions.tenantId, tenantId)));
  if (!it) throw new NotAllowed('interaction not found');
  const q = await quotaFor(db, tenantId);
  if (q.limit !== -1 && q.used >= q.limit) {
    throw new QuotaExceeded(q.limit === 0 ? 'no active plan includes AI replies' : `monthly AI action limit reached (${q.limit})`);
  }
  const [voice] = await db.select().from(brandVoices)
    .where(and(eq(brandVoices.tenantId, tenantId), eq(brandVoices.active, true)));
  const author = (it.raw as { _author?: { displayName?: string } })._author;
  const out = await draftReply(ai, {
    channelType: it.channelType, subject: it.subject, title: it.title, body: it.body, rating: it.rating,
    authorName: author?.displayName,
  }, {
    tone: voice?.tone ?? 'warm, concise, professional',
    bannedPhrases: voice?.bannedPhrases ?? [],
    signature: voice?.signature, dialectNotes: voice?.dialectNotes, storeName,
  });
  const [resp] = await db.insert(responses).values({
    tenantId, interactionId, body: out.reply, language: out.language, generatedBy: 'ai',
    model: out.usage.model, brandVoiceVersion: voice?.version ?? null, status: 'pending_approval',
  }).returning();
  await db.insert(aiActions).values({
    tenantId, kind: 'generate_reply', interactionId, billable: true,
    model: out.usage.model, tokensIn: out.usage.tokensIn, tokensOut: out.usage.tokensOut,
  });
  return resp;
}

export async function editResponse(db: Db, tenantId: string, responseId: string, body: string) {
  const text = body.trim();
  if (!text || text.length > 5000) throw new NotAllowed('reply must be 1-5000 characters');
  const [r] = await db.update(responses).set({
    body: text,
    generatedBy: sql`case when ${responses.generatedBy} = 'human' then 'human'::generated_by else 'ai_edited'::generated_by end`,
    updatedAt: new Date(),
  }).where(and(eq(responses.id, responseId), eq(responses.tenantId, tenantId),
    sql`${responses.status} in ('draft','pending_approval','failed')`)).returning();
  if (!r) throw new NotAllowed('reply not found or already sent');
  return r;
}

export async function approveResponse(db: Db, tenantId: string, responseId: string, userId: string) {
  const [r] = await db.update(responses).set({ status: 'approved', approvedBy: userId, approvedAt: new Date(), error: null, updatedAt: new Date() })
    .where(and(eq(responses.id, responseId), eq(responses.tenantId, tenantId),
      sql`${responses.status} in ('draft','pending_approval','failed')`)).returning();
  if (!r) throw new NotAllowed('reply not found or already sent');
  const [it] = await db.select({ id: interactions.id, connectionId: interactions.connectionId }).from(interactions).where(eq(interactions.id, r.interactionId));
  if (it && !it.connectionId) {
    // Added by hand (no connected channel): Eqence cannot post it, so approving records
    // that the merchant sent this reply themselves on the platform.
    const [done] = await db.update(responses).set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() }).where(eq(responses.id, r.id)).returning();
    await db.update(interactions).set({ status: 'responded' }).where(eq(interactions.id, it.id));
    await db.insert(auditLog).values({ tenantId, actorUserId: userId, action: 'response.sent_by_hand', target: responseId });
    return done;
  }
  await enqueue(db, 'response.publish', { responseId });
  await db.insert(auditLog).values({ tenantId, actorUserId: userId, action: 'response.approved', target: responseId });
  return r;
}

export async function rejectResponse(db: Db, tenantId: string, responseId: string, userId: string) {
  const [r] = await db.update(responses).set({ status: 'rejected', updatedAt: new Date() })
    .where(and(eq(responses.id, responseId), eq(responses.tenantId, tenantId),
      sql`${responses.status} in ('draft','pending_approval','failed')`)).returning();
  if (!r) throw new NotAllowed('reply not found or already sent');
  await db.insert(auditLog).values({ tenantId, actorUserId: userId, action: 'response.rejected', target: responseId });
  return r;
}
