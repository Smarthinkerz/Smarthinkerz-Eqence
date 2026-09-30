// Judge.me: the review app most Shopify stores use (Shopify's own reviews app was
// discontinued in 2024). Built against Judge.me's official OpenAPI spec,
// https://judge.me/api/docs.yaml (server https://api.judge.me/api/v1):
//   GET  /shops/info            validate credentials, learn the shop
//   GET  /reviews               paged list (page, per_page)
//   GET  /reviews/{id}          one review, used to re-fetch after a webhook
//   POST /replies               public shop reply  { review_id, reply: { content }, send_reply_email }
//   POST /webhooks  DELETE /webhooks   { webhook: { key, url } }
// Auth with a private API token: header X-Api-Token plus query shop_domain.
// Webhooks are signed: header JUDGEME-HMAC-SHA256 = hex HMAC-SHA256(raw body, private token).
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ConnectionContext, Connector, Cursor, IngestResult, RawInteraction } from './types';

export const JUDGEME_API = 'https://api.judge.me/api/v1';
export const JUDGEME_WEBHOOK_KEYS = ['review/created', 'review/updated'] as const;
const PER_PAGE = 50;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface JudgeMeReview {
  id: number | string;
  title?: string | null;
  body?: string | null;
  rating?: number | null;
  product_external_id?: number | string | null;
  product_title?: string | null;
  product_handle?: string | null;
  reviewer?: { id?: number | string; external_id?: number | string | null; name?: string | null } | null;
  source?: string | null;
  curated?: 'not-yet' | 'ok' | 'spam' | null;
  hidden?: boolean | null;
  verified?: string | null;
  created_at?: string | null;
}

export class JudgeMeError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function normalizeShopDomain(input: string): string {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(d)) throw new Error('shop domain is not a valid host name');
  return d;
}

export function verifyJudgeMeWebhook(rawBody: Buffer | string, headerValue: string | null | undefined, secret: string): boolean {
  if (!headerValue || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = headerValue.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given, 'hex'));
}

/** The review id carried by a webhook body. The body itself is not trusted beyond this:
 *  the review is re-fetched from the API. Payload shape is not documented, so accept
 *  { review: {...} } or a bare review object. */
export function reviewIdFromWebhook(body: unknown): string | null {
  const b = body as { review?: { id?: unknown }; id?: unknown } | null;
  const id = b?.review?.id ?? b?.id;
  return typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id)) ? String(id) : null;
}

export function createJudgeMeConnector(fetchImpl: FetchLike = fetch): Connector & {
  registerWebhooks(conn: ConnectionContext, url: string): Promise<void>;
  removeWebhooks(conn: ConnectionContext, url: string): Promise<void>;
  fetchReview(conn: ConnectionContext, reviewId: string): Promise<RawInteraction>;
} {
  async function call<T>(creds: Record<string, string>, method: string, path: string,
    query: Record<string, string | number> = {}, body?: unknown): Promise<T> {
    const { apiToken, shopDomain } = creds;
    if (!apiToken || !shopDomain) throw new JudgeMeError('missing Judge.me credentials', 0);
    const url = new URL(JUDGEME_API + path);
    url.searchParams.set('shop_domain', shopDomain);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
    const res = await fetchImpl(url.toString(), {
      method,
      headers: { 'X-Api-Token': apiToken, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new JudgeMeError(`Judge.me ${method} ${path} returned ${res.status}: ${text.slice(0, 300)}`, res.status);
    return (text ? JSON.parse(text) : {}) as T;
  }

  function normalize(raw: unknown): RawInteraction {
    const r = raw as JudgeMeReview;
    if (r == null || r.id == null) throw new Error('Judge.me review without an id');
    const rating = typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5 ? Math.round(r.rating) : null;
    return {
      externalId: String(r.id),
      channelType: 'review',
      threadId: null,
      author: {
        externalId: r.reviewer?.id != null ? String(r.reviewer.id) : null,
        displayName: r.reviewer?.name ?? null,
      },
      subject: r.product_title ?? null,
      title: r.title ?? null,
      body: (r.body ?? '').trim(),
      rating,
      postedAt: r.created_at ? new Date(r.created_at) : new Date(),
      // Published on the storefront only when curated is 'ok'.
      isPublic: r.curated === 'ok',
      permalink: null,
      raw,
    };
  }

  return {
    source: 'judgeme',
    capabilities: {
      channels: ['review'],
      canPublish: true,
      canPublishDM: false,
      supportsThreads: false,
      supportsEdit: false,
      rateLimit: { requests: 60, windowMs: 60_000 },
    },

    async connect(credentials) {
      const shopDomain = normalizeShopDomain(credentials.shopDomain ?? '');
      const apiToken = (credentials.apiToken ?? '').trim();
      if (!apiToken) throw new Error('API token is required');
      const info = await call<{ shop?: { domain?: string; platform?: string } }>({ apiToken, shopDomain }, 'GET', '/shops/info');
      if (!info.shop) throw new JudgeMeError('Judge.me did not return shop info for these credentials', 0);
      return { externalAccount: shopDomain, scopes: ['read_reviews', 'write_replies'] };
    },

    async healthCheck(conn) {
      try {
        await call(conn.credentials, 'GET', '/shops/info');
        return { ok: true };
      } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    },

    // Walks every page each sync. Upserts are keyed on the review id, so a repeat is
    // harmless; the cursor records how far the last full pass reached.
    async ingest(conn, cursor: Cursor | null): Promise<IngestResult> {
      const page = typeof cursor?.page === 'number' ? cursor.page : 1;
      const data = await call<{ current_page?: number; reviews?: unknown[] }>(conn.credentials, 'GET', '/reviews', { page, per_page: PER_PAGE });
      const reviews = Array.isArray(data.reviews) ? data.reviews : [];
      const hasMore = reviews.length === PER_PAGE;
      return {
        interactions: reviews.map(normalize),
        cursor: hasMore ? { page: page + 1 } : { page: 1, lastFullSyncAt: new Date().toISOString() },
        hasMore,
      };
    },

    async publish(conn, target, body) {
      if (target.channelType !== 'review') throw new Error('Judge.me can only reply to reviews');
      await call(conn.credentials, 'POST', '/replies', {}, {
        review_id: Number(target.interactionExternalId),
        send_reply_email: true,
        reply: { content: body },
      });
      // The reply endpoint returns no id; the reply lives on the review.
      return { externalId: null };
    },

    normalize,

    async registerWebhooks(conn, url) {
      for (const key of JUDGEME_WEBHOOK_KEYS) {
        await call(conn.credentials, 'POST', '/webhooks', {}, { webhook: { key, url } });
      }
    },

    async removeWebhooks(conn, url) {
      for (const key of JUDGEME_WEBHOOK_KEYS) {
        await call(conn.credentials, 'DELETE', '/webhooks', {}, { key, url }).catch(() => {});
      }
    },

    async fetchReview(conn, reviewId) {
      const data = await call<{ review?: unknown }>(conn.credentials, 'GET', `/reviews/${encodeURIComponent(reviewId)}`);
      if (!data.review) throw new JudgeMeError(`review ${reviewId} not found`, 404);
      return normalize(data.review);
    },
  };
}
