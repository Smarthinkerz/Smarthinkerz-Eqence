// Outreach opt out: the link in an invitation email carries the recipient's address and a
// keyed signature, so one request unsubscribes exactly that address and nobody can
// unsubscribe (or enumerate) anyone else. No account, no sign in, no state before the click.
import { createHmac, timingSafeEqual } from 'node:crypto';

const mac = (email: string, secret: string) => createHmac('sha256', secret).update(`outreach-optout:${email}`).digest('base64url');
const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$/;

/** `<base64url address>.<signature>`. The address is lower-cased first. */
export function unsubscribeToken(email: string, secret: string): string {
  if (!secret) throw new Error('unsubscribeToken: no secret');
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) throw new Error('unsubscribeToken: not an email address');
  return `${Buffer.from(e).toString('base64url')}.${mac(e, secret)}`;
}

/** The address a token was issued for, or null when it is malformed or not signed by us. */
export function emailFromUnsubscribeToken(token: string | null | undefined, secret: string): string | null {
  if (!secret || !token || token.length > 600) return null;
  const [body, sig, ...rest] = token.split('.');
  if (!body || !sig || rest.length) return null;
  const email = Buffer.from(body, 'base64url').toString('utf8');
  if (!EMAIL_RE.test(email) || email !== email.toLowerCase()) return null;
  const given = Buffer.from(sig);
  const expected = Buffer.from(mac(email, secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? email : null;
}

export const unsubscribeUrl = (publicUrl: string, email: string, secret: string) =>
  `${publicUrl.replace(/\/$/, '')}/u/${unsubscribeToken(email, secret)}`;
