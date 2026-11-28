// api() against a stubbed fetch: no request leaves the test process.
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { api, ApiError, UNREACHABLE_MESSAGE } from './api';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function stub(impl: () => Promise<Response>) {
  globalThis.fetch = (async () => impl()) as typeof fetch;
}

async function failure(p: Promise<unknown>): Promise<ApiError> {
  try { await p; } catch (err) { assert.ok(err instanceof ApiError); return err; }
  assert.fail('expected the call to fail');
}

test('a JSON success is returned as data', async () => {
  stub(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  assert.deepEqual(await api('/api/v1/me'), { ok: true });
});

test('an empty success body is an empty object', async () => {
  stub(async () => new Response('', { status: 200 }));
  assert.deepEqual(await api('/api/auth/sign-out', { method: 'POST', body: {} }), {});
});

test('a network failure becomes a clear message with status 0', async () => {
  stub(async () => { throw new TypeError('Failed to fetch'); });
  const err = await failure(api('/api/chat', { method: 'POST', body: { messages: [] } }));
  assert.equal(err.status, 0);
  assert.equal(err.message, UNREACHABLE_MESSAGE);
});

test('an HTML gateway error page becomes the same clear message, keeping the status', async () => {
  stub(async () => new Response('<html><body>502 Bad Gateway</body></html>', { status: 502 }));
  const err = await failure(api('/api/demo-chat', { method: 'POST', body: { message: 'hi' } }));
  assert.equal(err.status, 502);
  assert.equal(err.message, UNREACHABLE_MESSAGE);
});

test('a non JSON 200 is treated as unreachable, not as a parse crash', async () => {
  stub(async () => new Response('<!doctype html><title>x</title>', { status: 200 }));
  const err = await failure(api('/api/v1/me'));
  assert.equal(err.message, UNREACHABLE_MESSAGE);
});

test('the API error message and status still come through', async () => {
  stub(async () => new Response(JSON.stringify({ error: 'not signed in' }), { status: 401 }));
  const err = await failure(api('/api/v1/me'));
  assert.equal(err.status, 401);
  assert.equal(err.message, 'not signed in');
});

test('Better Auth style message field wins over error', async () => {
  stub(async () => new Response(JSON.stringify({ message: 'Invalid email or password', error: 'x' }), { status: 401 }));
  assert.equal((await failure(api('/api/auth/sign-in/email', { method: 'POST', body: {} }))).message, 'Invalid email or password');
});

test('a 500 without a body keeps the generic status message', async () => {
  stub(async () => new Response('', { status: 500 }));
  assert.equal((await failure(api('/api/v1/me'))).message, 'Request failed (500)');
});
