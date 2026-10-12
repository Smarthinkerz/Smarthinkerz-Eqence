// One click opt out for invitation email (RFC 8058) and the export the outreach sender
// reads before every send. Public, no session: the signed token in the link is the proof.
//   POST /u/:token   mail clients, from the List-Unsubscribe and List-Unsubscribe-Post headers
//   GET  /u/:token   a person opening the link in the email footer; also unsubscribes at once
//   GET  /api/outreach/optouts   sender only, Authorization: Bearer <OUTREACH_SECRET>
// Fails closed: without OUTREACH_SECRET nothing is accepted and nothing is listed.
import { emailFromUnsubscribeToken } from '@eqence/core';
import { outreachOptouts } from '@eqence/db';
import { asc } from 'drizzle-orm';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { db } from './db';
import { env } from './env';

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title}</title><style>body{font:17px/1.6 system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 1rem;color:#1c1c1a}</style>
</head><body><h1>${title}</h1><p>${body}</p></body></html>`;

async function optOut(c: Context, method: 'one_click' | 'link') {
  if (!env.outreachSecret) return c.text('unsubscribe is not configured', 503);
  const email = emailFromUnsubscribeToken(c.req.param('token'), env.outreachSecret);
  if (!email) {
    return method === 'link'
      ? c.html(page('Link not recognized', 'This unsubscribe link is incomplete. Reply to the email with the word unsubscribe and we will remove you by hand.'), 404)
      : c.text('not found', 404);
  }
  await db.insert(outreachOptouts).values({ email, method }).onConflictDoNothing();
  console.log(JSON.stringify({ msg: 'outreach.optout', method }));
  if (method === 'one_click') return c.text('unsubscribed');
  // The address is not echoed into the page; the signature already proved whose it is.
  return c.html(page('You are unsubscribed', 'SmarThinkerz will send no further email about Eqence to this address. Nothing else is needed.'));
}

function isSender(header: string | undefined): boolean {
  if (!env.outreachSecret || !header?.startsWith('Bearer ')) return false;
  const h = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(header.slice(7)), h(env.outreachSecret));
}

export function mountOutreach(app: Hono<any>) {
  app.post('/u/:token', (c) => optOut(c, 'one_click'));
  app.get('/u/:token', (c) => optOut(c, 'link'));

  app.get('/api/outreach/optouts', async (c) => {
    if (!env.outreachSecret) return c.json({ error: 'not configured' }, 503);
    if (!isSender(c.req.header('authorization'))) return c.json({ error: 'not found' }, 404);
    const rows = await db.select().from(outreachOptouts).orderBy(asc(outreachOptouts.createdAt));
    return c.json({ optouts: rows.map((r) => ({ email: r.email, method: r.method, at: r.createdAt })) });
  });
}
