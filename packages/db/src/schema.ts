// Eqence database schema. Auth tables follow Better Auth's core schema; everything a
// merchant owns hangs off `tenants` (one tenant per account for now, memberships later).
// Domain model from docs/merge-spec.md §3: one Interaction type for reviews, comments and DMs.
import {
  bigint, boolean, index, integer, jsonb, pgEnum, pgTable, real, smallint, text, timestamp,
  uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/* ───────────── Better Auth ───────────── */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // Carried from C2C: 'user' | 'admin'. Super users see every tier without paying.
  role: text('role').notNull().default('user'),
  isSuperUser: boolean('is_super_user').notNull().default(false),
  // Which tier a super user is currently viewing the product as (C2C's effective_plan).
  effectivePlan: text('effective_plan'),
  // Set only for accounts migrated from Comment to Customer (its integer cc_users.id).
  legacyC2cId: integer('legacy_c2c_id').unique(),
  // Better Auth two-factor plugin; required for admin access.
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  // Set by an admin. A disabled account cannot sign in and its sessions are revoked.
  disabled: boolean('disabled').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('session_user_idx').on(t.userId)]);

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('account_user_idx').on(t.userId)]);

// Better Auth two-factor plugin: TOTP secret and backup codes (stored encrypted by Better Auth).
export const twoFactor = pgTable('two_factor', {
  id: text('id').primaryKey(),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  verified: boolean('verified').default(true),
  failedVerificationCount: integer('failed_verification_count').default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
}, (t) => [index('two_factor_user_idx').on(t.userId)]);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('verification_identifier_idx').on(t.identifier)]);

/* ───────────── Tenancy and billing ───────────── */

export const planStatus = pgEnum('plan_status', ['none', 'trial', 'active', 'past_due', 'cancelled']);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ownerUserId: text('owner_user_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  plan: text('plan'),                       // pricing config key, e.g. 'starter'; null = no plan
  planStatus: planStatus('plan_status').notNull().default('none'),
  planCycle: text('plan_cycle'),            // 'monthly' | 'yearly'
  planExpiresAt: timestamp('plan_expires_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('tenants_owner_idx').on(t.ownerUserId)]);

// One row per Hub delivery we have acted on. event_id is the Hub's stable id across
// retries, so the primary key is the dedupe.
export const hubEvents = pgTable('hub_events', {
  eventId: text('event_id').primaryKey(),
  event: text('event').notNull(),
  appId: text('app_id'),
  orderId: text('order_id'),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  outcome: text('outcome').notNull(),       // 'granted' | 'revoked' | 'ignored:<reason>'
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── Interaction model (merge-spec §3) ───────────── */

export const source = pgEnum('source', [
  'judgeme', 'shopify', 'google', 'facebook', 'instagram', 'tiktok', 'trustpilot', 'manual',
]);
export const channelType = pgEnum('channel_type', ['review', 'comment', 'dm', 'mention', 'question']);
export const connectionStatus = pgEnum('connection_status', ['active', 'expired', 'revoked', 'error']);
export const sentiment = pgEnum('sentiment', ['positive', 'neutral', 'negative', 'mixed']);
export const intent = pgEnum('intent', ['complaint', 'praise', 'question', 'purchase_intent', 'spam', 'other']);
export const interactionStatus = pgEnum('interaction_status', ['new', 'triaged', 'responded', 'ignored', 'escalated']);
export const responseStatus = pgEnum('response_status', ['draft', 'pending_approval', 'approved', 'published', 'rejected', 'failed']);
export const generatedBy = pgEnum('generated_by', ['ai', 'human', 'ai_edited']);
export const aiActionKind = pgEnum('ai_action_kind', ['generate_reply', 'lead_score', 'summarize_thread', 'translate', 'classify']);

export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  source: source('source').notNull(),
  externalAccount: text('external_account').notNull(),   // e.g. the shop domain
  // Reference to the credential in the server-side secret store, never the token itself.
  credentialsRef: text('credentials_ref').notNull(),
  scopes: text('scopes').array(),
  status: connectionStatus('status').notNull().default('active'),
  cursor: jsonb('cursor'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  error: text('error'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('connections_tenant_source_account_idx').on(t.tenantId, t.source, t.externalAccount)]);

export const authors = pgTable('authors', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  platformHandles: jsonb('platform_handles').notNull().default({}),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  interactionCount: integer('interaction_count').notNull().default(0),
}, (t) => [index('authors_tenant_idx').on(t.tenantId)]);

export const interactions = pgTable('interactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'set null' }),
  source: source('source').notNull(),
  channelType: channelType('channel_type').notNull(),
  externalId: text('external_id').notNull(),
  threadId: text('thread_id'),
  parentId: uuid('parent_id'),
  authorId: uuid('author_id').references(() => authors.id, { onDelete: 'set null' }),
  subject: text('subject'),                 // e.g. the product a review is about
  title: text('title'),
  body: text('body').notNull(),
  language: text('language'),               // BCP-47, detected on ingest
  rating: smallint('rating'),               // 1..5, reviews only
  postedAt: timestamp('posted_at', { withTimezone: true }).notNull(),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  sentiment: sentiment('sentiment'),
  sentimentScore: real('sentiment_score'),
  intent: intent('intent'),
  isPublic: boolean('is_public').notNull(),
  status: interactionStatus('status').notNull().default('new'),
  permalink: text('permalink'),
  raw: jsonb('raw').notNull(),
}, (t) => [
  uniqueIndex('interactions_tenant_source_external_idx').on(t.tenantId, t.source, t.externalId),
  index('interactions_tenant_status_posted_idx').on(t.tenantId, t.status, t.postedAt),
]);

export const brandVoices = pgTable('brand_voices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  tone: text('tone').notNull().default('warm, concise, professional'),
  bannedPhrases: text('banned_phrases').array().notNull().default([]),
  signature: text('signature'),
  languages: text('languages').array().notNull().default(['en', 'ar']),
  dialectNotes: text('dialect_notes'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index('brand_voices_tenant_idx').on(t.tenantId)]);

export const responses = pgTable('responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  interactionId: uuid('interaction_id').notNull().references(() => interactions.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  language: text('language'),
  generatedBy: generatedBy('generated_by').notNull(),
  model: text('model'),
  brandVoiceVersion: integer('brand_voice_version'),
  status: responseStatus('status').notNull().default('draft'),
  approvedBy: text('approved_by').references(() => user.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  externalId: text('external_id'),
  error: text('error'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('responses_interaction_idx').on(t.interactionId)]);

// The billing meter. Classification is recorded for cost tracking but never billable.
export const aiActions = pgTable('ai_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  kind: aiActionKind('kind').notNull(),
  interactionId: uuid('interaction_id').references(() => interactions.id, { onDelete: 'set null' }),
  billable: boolean('billable').notNull(),
  model: text('model'),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index('ai_actions_tenant_created_idx').on(t.tenantId, t.createdAt)]);

/* ───────────── Plumbing ───────────── */

// Postgres outbox, the pattern proven in C2C (server.cjs:1634-1675): workers claim rows
// with FOR UPDATE SKIP LOCKED, retry with backoff, dead-letter after max attempts.
export const outbox = pgTable('outbox', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  topic: text('topic').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull().default('pending'),   // pending | done | dead
  attempts: integer('attempts').notNull().default(0),
  runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
  lastError: text('last_error'),
  createdAt: createdAt(),
}, (t) => [index('outbox_pending_idx').on(t.status, t.runAfter)]);

export const auditLog = pgTable('audit_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  actorUserId: text('actor_user_id'),
  action: text('action').notNull(),
  target: text('target'),
  detail: jsonb('detail'),
  createdAt: createdAt(),
}, (t) => [index('audit_log_tenant_created_idx').on(t.tenantId, t.createdAt)]);

/* ───────────── Site content and blog (admin CMS) ───────────── */

// Front-page text overrides: one row per (key, language). Keys are the site's i18n keys,
// so an override replaces exactly the string the page would otherwise show.
export const siteContent = pgTable('site_content', {
  key: text('key').notNull(),
  lang: text('lang').notNull(),          // 'en' | 'ar' | 'ja'
  value: text('value').notNull(),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('site_content_key_lang_idx').on(t.key, t.lang)]);

export const blogStatus = pgEnum('blog_status', ['draft', 'published']);

// Bodies are Markdown, rendered without raw HTML. Arabic fields are optional; the
// English text is shown when an Arabic version is missing.
export const blogPosts = pgTable('blog_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  status: blogStatus('status').notNull().default('draft'),
  titleEn: text('title_en').notNull(),
  titleAr: text('title_ar'),
  excerptEn: text('excerpt_en'),
  excerptAr: text('excerpt_ar'),
  bodyEn: text('body_en').notNull().default(''),
  bodyAr: text('body_ar'),
  coverUrl: text('cover_url'),
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  authorName: text('author_name'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('blog_posts_status_published_idx').on(t.status, t.publishedAt)]);
