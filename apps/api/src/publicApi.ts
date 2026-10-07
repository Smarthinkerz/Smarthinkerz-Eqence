// Public endpoints carried over from C2C: the landing-page demo and the API-key ping.
// Neither needs a session. The demo is rate limited per address and, unlike C2C's,
// never fetches a URL the visitor types (that was an SSRF risk).
import { demoReply } from '@eqence/ai';
import { aiConfigFromEnv, apiSecretMatches, parseApiKey } from '@eqence/core';
import { apiKeys } from '@eqence/db';
import { and, eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { db } from './db';
import { clientIp, withinLimit } from './security';

export function mountPublicApi(app: Hono<any>) {
  // Must be registered before the /api/v1 session middleware: it authenticates by key.
  app.get('/api/v1/ping', async (c) => {
    const parsed = parseApiKey(c.req.header('authorization'));
    if (!parsed) return c.json({ error: 'send the API key as "Authorization: Bearer <key>"' }, 401);
    const [k] = await db.select().from(apiKeys).where(and(eq(apiKeys.keyId, parsed.keyId), eq(apiKeys.revoked, false)));
    if (!k || !apiSecretMatches(parsed.secret, k.keyHash)) return c.json({ error: 'invalid API key' }, 401);
    if (k.ipAllowlist.length && !k.ipAllowlist.includes(clientIp(c))) return c.json({ error: 'this address is not allowed to use this key' }, 403);
    if (!(await withinLimit('api_key_min', k.keyId, 60, k.ratePerMin))) return c.json({ error: 'rate limit reached for this key' }, 429);
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, k.id));
    return c.json({ ok: true, keyId: k.keyId, scopes: k.scopes, time: new Date().toISOString() });
  });

  app.post('/api/demo-chat', bodyLimit({ maxSize: 4096 }), async (c) => {
    const ip = clientIp(c);
    let cfg;
    try { cfg = aiConfigFromEnv(); } catch { return c.json({ error: 'the demo is not available right now' }, 503); }
    if (!cfg.apiKey) return c.json({ error: 'the demo is not available right now' }, 503);
    const b = await c.req.json().catch(() => ({})) as { message?: unknown };
    const message = String(b.message ?? '').trim();
    if (!message) return c.json({ error: 'type a sample review or comment first' }, 400);
    if (message.length > 500) return c.json({ error: 'keep the sample under 500 characters' }, 400);
    // Same limits C2C used: 4 a minute and 20 an hour per address.
    if (!(await withinLimit('demo_chat_min', ip, 60, 4))) return c.json({ error: 'Please slow down and try again in a minute.' }, 429);
    if (!(await withinLimit('demo_chat_hr', ip, 3600, 20))) return c.json({ error: 'Demo limit reached for this hour. Create an account to try it on your own reviews.' }, 429);
    // An overall ceiling as well, so a crowd of addresses cannot run up the AI bill.
    if (!(await withinLimit('demo_chat_day', 'all', 86400, Number(process.env.DEMO_DAILY_CAP) || 1500))) return c.json({ error: 'The demo is busy today. Create an account to try it on your own reviews.' }, 429);
    try {
      const { result } = await demoReply(cfg, message);
      return c.json(result);
    } catch (err) {
      console.error('demo-chat failed', err instanceof Error ? err.message : err);
      return c.json({ error: 'the demo could not answer just now, please try again' }, 502);
    }
  });
}
