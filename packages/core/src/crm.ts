// Customers, leads and hand-entered comments. One customer record (authors row) per
// person per platform; every review, comment and message links to it, so the Customers
// and Leads screens are views over real interactions, never separate made-up data.
import { authors, interactions, type Db } from '@eqence/db';
import { and, eq, gte, sql } from 'drizzle-orm';
import { enqueue, NotAllowed } from './pipeline';

export const STAGES = ['new', 'contacted', 'qualified', 'won', 'lost'] as const;
export type Stage = (typeof STAGES)[number];
/** A lead is a customer whose strongest buying signal reaches this score. */
export const LEAD_MIN_SCORE = 40;
export const HOT_LEAD_SCORE = 70;

// Channels a merchant can log by hand until they connect directly.
export const MANUAL_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'whatsapp', 'manual'] as const;
export type ManualPlatform = (typeof MANUAL_PLATFORMS)[number];
export const MANUAL_CHANNELS = ['comment', 'dm'] as const;
export const MAX_MANUAL_PER_DAY = 300;

export interface AuthorRef { externalId?: string | null; displayName?: string | null; handle?: string | null }

const squash = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ');

/** The identity of a person on a platform: their platform id when there is one, else their handle or name. */
export function authorKey(source: string, a: AuthorRef): string | null {
  const id = squash(String(a.externalId ?? ''));
  if (id) return `${source}:${id}`.slice(0, 200);
  const name = squash(String(a.handle ?? a.displayName ?? '')).replace(/^@/, '').toLowerCase();
  return name ? `${source}:name:${name}`.slice(0, 200) : null;
}

/** Finds or creates the customer record for an author. Returns null for an anonymous author. */
export async function linkAuthor(db: Db, tenantId: string, source: string, a: AuthorRef, seenAt: Date): Promise<string | null> {
  const key = authorKey(source, a);
  if (!key) return null;
  const displayName = squash(String(a.displayName ?? a.handle ?? '')).slice(0, 120) || null;
  const handle = a.handle ? squash(String(a.handle)).replace(/^@/, '').slice(0, 80) : null;
  const [row] = await db.insert(authors).values({
    tenantId, key, displayName, firstSeenAt: seenAt, lastSeenAt: seenAt,
    platformHandles: handle ? { [source]: handle } : {},
  }).onConflictDoUpdate({
    target: [authors.tenantId, authors.key],
    set: {
      // The name follows the platform; everything the merchant typed (stage, notes, tags, contact) is untouched.
      displayName: sql`coalesce(excluded.display_name, ${authors.displayName})`,
      firstSeenAt: sql`least(${authors.firstSeenAt}, excluded.first_seen_at)`,
      lastSeenAt: sql`greatest(${authors.lastSeenAt}, excluded.last_seen_at)`,
    },
  }).returning({ id: authors.id });
  return row.id;
}

export interface ManualInput { platform: ManualPlatform; channelType: 'comment' | 'dm'; authorName: string; body: string }

export function cleanManual(b: Record<string, unknown>): { value: ManualInput } | { error: string } {
  const platform = String(b.platform ?? '') as ManualPlatform;
  if (!MANUAL_PLATFORMS.includes(platform)) return { error: `Choose where it came from: ${MANUAL_PLATFORMS.join(', ')}.` };
  const channelType = b.channelType === 'dm' ? 'dm' : b.channelType === 'comment' || b.channelType == null ? 'comment' : null;
  if (!channelType) return { error: 'Type must be comment or dm.' };
  const authorName = squash(String(b.authorName ?? '')).slice(0, 80);
  if (!authorName) return { error: 'Enter the customer\'s name or handle.' };
  const body = String(b.body ?? '').replace(/\r\n?/g, '\n').trim();
  if (!body) return { error: 'Paste what the customer wrote.' };
  if (body.length > 2000) return { error: 'Keep the text under 2,000 characters.' };
  return { value: { platform, channelType, authorName, body } };
}

/** Stores a comment or message the merchant copied in, and queues it for the same AI reading as any review. */
export async function addManualInteraction(db: Db, tenantId: string, input: ManualInput) {
  const since = new Date(Date.now() - 86400_000);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(interactions)
    .where(and(eq(interactions.tenantId, tenantId), sql`${interactions.connectionId} is null`, gte(interactions.ingestedAt, since)));
  if (n >= MAX_MANUAL_PER_DAY) throw new NotAllowed(`You can add up to ${MAX_MANUAL_PER_DAY} comments by hand in a day.`);
  const author: AuthorRef = { displayName: input.authorName, handle: input.authorName };
  const now = new Date();
  const authorId = await linkAuthor(db, tenantId, input.platform, author, now);
  const [row] = await db.insert(interactions).values({
    tenantId, connectionId: null, authorId, source: input.platform, channelType: input.channelType,
    externalId: `manual-${crypto.randomUUID()}`, body: input.body, postedAt: now,
    isPublic: input.channelType === 'comment', raw: { manual: true, _author: { displayName: input.authorName } },
  }).returning();
  await enqueue(db, 'interaction.classify', { interactionId: row.id });
  return row;
}

export function cleanStage(v: unknown): Stage | null {
  return STAGES.includes(v as Stage) ? (v as Stage) : null;
}

/** Up to 12 short tags, trimmed, lower-cased, without duplicates. */
export function cleanTags(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(',');
  return [...new Set(arr.map((t) => squash(String(t)).toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 12);
}

export function cleanEmail(v: unknown): string | null | undefined {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s) ? s.slice(0, 254) : undefined;   // undefined = invalid
}

export function cleanPhone(v: unknown): string | null | undefined {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return /^\+?[0-9 ()]{6,24}$/.test(s) ? s : undefined;
}
