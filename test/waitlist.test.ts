// The Vercel waitlist function against a stubbed fetch: nothing is sent to Resend.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import handler from '../api/waitlist';

type Sent = { url: string; init: RequestInit };
let sent: Sent[] = [];
let reply: () => Response;
const realFetch = globalThis.fetch;
const realKey = process.env.RESEND_API;
const realError = console.error;
const realLog = console.log;

beforeEach(() => {
  sent = [];
  reply = () => new Response(JSON.stringify({ id: 'stub-id' }), { status: 200 });
  globalThis.fetch = (async (url: string, init: RequestInit) => { sent.push({ url: String(url), init }); return reply(); }) as typeof fetch;
  process.env.RESEND_API = 'test-key-not-real';
  console.error = () => {};
  console.log = () => {};
});
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.RESEND_API; else process.env.RESEND_API = realKey;
  console.error = realError;
  console.log = realLog;
});

function call(method: string, body?: unknown) {
  const out = { status: 0, json: undefined as any, headers: {} as Record<string, string> };
  const res = {
    setHeader(k: string, v: string) { out.headers[k] = v; },
    status(code: number) { out.status = code; return res; },
    json(v: unknown) { out.json = v; return res; },
  };
  return handler({ method, body }, res).then(() => out);
}

const valid = { name: 'Sara', business: 'Sara Store', email: 'sara@example.com', store: 'sara-store.myshopify.com', plan: 'starter' };

test('only POST is accepted', async () => {
  const r = await call('GET');
  assert.equal(r.status, 405);
  assert.equal(r.headers.Allow, 'POST');
  assert.equal(sent.length, 0);
});

test('a valid request is emailed to the team once, with reply-to set to the visitor', async () => {
  const r = await call('POST', valid);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://api.resend.com/emails');
  const payload = JSON.parse(String(sent[0].init.body));
  assert.deepEqual(payload.to, ['reply@smarthinkerz.com']);
  assert.equal(payload.reply_to, 'sara@example.com');
  assert.match(payload.text, /Shopify store: sara-store\.myshopify\.com/);
});

test('a JSON string body is parsed', async () => {
  const r = await call('POST', JSON.stringify(valid));
  assert.equal(r.status, 200);
  assert.equal(sent.length, 1);
});

test('the honeypot field is accepted silently and nothing is sent', async () => {
  const r = await call('POST', { ...valid, website: 'http://spam.example' });
  assert.equal(r.status, 200);
  assert.equal(sent.length, 0);
});

test('invalid details are refused before anything is sent', async () => {
  for (const bad of [
    { ...valid, email: 'not-an-email' },
    { ...valid, name: '' },
    { ...valid, store: 'not a store' },
    { ...valid, plan: 'free-forever' },
    { ...valid, name: 'x'.repeat(101) },
  ]) {
    const r = await call('POST', bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal(sent.length, 0);
  assert.equal((await call('POST', '{broken')).status, 400);
});

test('HTML in a field is escaped and new lines cannot reach the subject', async () => {
  await call('POST', { ...valid, business: 'Shop\r\nBcc: x@example.com <script>' });
  const payload = JSON.parse(String(sent[0].init.body));
  assert.ok(!/[\r\n]/.test(payload.subject));
  assert.ok(!payload.html.includes('<script>'));
  assert.ok(payload.html.includes('&#60;script&#62;'));
});

test('a missing Resend key is a 500 and nothing is sent', async () => {
  delete process.env.RESEND_API;
  const r = await call('POST', valid);
  assert.equal(r.status, 500);
  assert.equal(sent.length, 0);
});

test('a Resend failure is a 502 for the visitor', async () => {
  reply = () => new Response('forbidden', { status: 403 });
  const r = await call('POST', valid);
  assert.equal(r.status, 502);
});
