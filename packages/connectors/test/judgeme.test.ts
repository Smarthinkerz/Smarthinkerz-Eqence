import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import {
  createJudgeMeConnector, normalizeShopDomain, reviewIdFromWebhook, verifyJudgeMeWebhook,
} from '../src/judgeme';
import type { ConnectionContext } from '../src/types';

// A review shaped like components.schemas.Review in https://judge.me/api/docs.yaml.
const review = {
  id: 12345, title: 'Great', body: '  Arrived fast, fits well.  ', rating: 5,
  product_external_id: 777, product_title: 'Linen shirt', product_handle: 'linen-shirt',
  reviewer: { id: 55, external_id: 9, email: 'a@example.com', name: 'Aisha' },
  source: 'email', curated: 'ok', hidden: false, verified: 'verified-purchase',
  created_at: '2026-09-01T10:00:00+00:00',
};

const conn: ConnectionContext = {
  id: 'c1', tenantId: 't1', externalAccount: 'shop.myshopify.com', cursor: null,
  credentials: { apiToken: 'tok', shopDomain: 'shop.myshopify.com' },
};

function recorder(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: URL; method: string; headers: Record<string, string>; body: unknown }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({
      url: new URL(url), method: init?.method ?? 'GET',
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = responses.shift() ?? { body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  };
  return { calls, fetchImpl };
}

test('normalize maps a Judge.me review into the Interaction shape', () => {
  const n = createJudgeMeConnector(async () => new Response('{}')).normalize(review);
  assert.equal(n.externalId, '12345');
  assert.equal(n.channelType, 'review');
  assert.equal(n.rating, 5);
  assert.equal(n.body, 'Arrived fast, fits well.');
  assert.equal(n.subject, 'Linen shirt');
  assert.equal(n.author.displayName, 'Aisha');
  assert.equal(n.isPublic, true);
  assert.equal(n.postedAt.toISOString(), '2026-09-01T10:00:00.000Z');
});

test('normalize treats unpublished reviews as not public and bad ratings as null', () => {
  const n = createJudgeMeConnector(async () => new Response('{}')).normalize({ ...review, curated: 'not-yet', rating: 9 });
  assert.equal(n.isPublic, false);
  assert.equal(n.rating, null);
});

test('requests authenticate with X-Api-Token and shop_domain', async () => {
  const { calls, fetchImpl } = recorder([{ body: { current_page: 1, per_page: 50, reviews: [review] } }]);
  const res = await createJudgeMeConnector(fetchImpl).ingest(conn, null);
  assert.equal(calls[0].url.origin + calls[0].url.pathname, 'https://api.judge.me/api/v1/reviews');
  assert.equal(calls[0].url.searchParams.get('shop_domain'), 'shop.myshopify.com');
  assert.equal(calls[0].url.searchParams.get('page'), '1');
  assert.equal(calls[0].headers['X-Api-Token'], 'tok');
  assert.equal(res.interactions.length, 1);
  assert.equal(res.hasMore, false);
});

test('ingest pages forward while a page is full', async () => {
  const full = Array.from({ length: 50 }, (_, i) => ({ ...review, id: i + 1 }));
  const { fetchImpl } = recorder([{ body: { reviews: full } }]);
  const res = await createJudgeMeConnector(fetchImpl).ingest(conn, { page: 3 });
  assert.equal(res.hasMore, true);
  assert.deepEqual(res.cursor, { page: 4 });
});

test('publish posts a public reply with the documented body', async () => {
  const { calls, fetchImpl } = recorder([{ body: {} }]);
  await createJudgeMeConnector(fetchImpl).publish(conn, { interactionExternalId: '12345', channelType: 'review' }, 'Thank you!');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url.pathname, '/api/v1/replies');
  assert.deepEqual(calls[0].body, { review_id: 12345, send_reply_email: true, reply: { content: 'Thank you!' } });
});

test('an API error surfaces its status', async () => {
  const { fetchImpl } = recorder([{ status: 401, body: { error: 'unauthorized' } }]);
  await assert.rejects(createJudgeMeConnector(fetchImpl).ingest(conn, null), /returned 401/);
});

test('connect validates via /shops/info and normalises the domain', async () => {
  const { calls, fetchImpl } = recorder([{ body: { shop: { domain: 'shop.myshopify.com', platform: 'shopify' } } }]);
  const out = await createJudgeMeConnector(fetchImpl).connect({ shopDomain: 'https://Shop.myshopify.com/admin', apiToken: ' tok ' });
  assert.equal(out.externalAccount, 'shop.myshopify.com');
  assert.equal(calls[0].url.pathname, '/api/v1/shops/info');
  assert.equal(calls[0].headers['X-Api-Token'], 'tok');
});

test('webhook signature: hex HMAC-SHA256 of the raw body with the private token', () => {
  const raw = Buffer.from('{"review":{"id":12345}}');
  const sig = createHmac('sha256', 'tok').update(raw).digest('hex');
  assert.equal(verifyJudgeMeWebhook(raw, sig, 'tok'), true);
  assert.equal(verifyJudgeMeWebhook(raw, sig.toUpperCase(), 'tok'), true);
  assert.equal(verifyJudgeMeWebhook(raw, sig, 'other'), false);
  assert.equal(verifyJudgeMeWebhook(Buffer.from('{"review":{"id":1}}'), sig, 'tok'), false);
  assert.equal(verifyJudgeMeWebhook(raw, undefined, 'tok'), false);
  assert.equal(verifyJudgeMeWebhook(raw, 'not-hex', 'tok'), false);
  assert.equal(verifyJudgeMeWebhook(raw, sig, ''), false);
});

test('reviewIdFromWebhook accepts documented-ish shapes and rejects junk', () => {
  assert.equal(reviewIdFromWebhook({ review: { id: 12345 } }), '12345');
  assert.equal(reviewIdFromWebhook({ id: '99' }), '99');
  assert.equal(reviewIdFromWebhook({ review: { id: '1; drop' } }), null);
  assert.equal(reviewIdFromWebhook(null), null);
});

test('normalizeShopDomain rejects non-hosts', () => {
  assert.equal(normalizeShopDomain('shop.myshopify.com'), 'shop.myshopify.com');
  assert.throws(() => normalizeShopDomain('not a domain'));
  assert.throws(() => normalizeShopDomain(''));
});
