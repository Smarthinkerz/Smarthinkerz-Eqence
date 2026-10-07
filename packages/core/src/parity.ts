// Pure rules for the features carried over from Comment to Customer (C2C): Auto-DM
// sequence validation, API key format, IP ban input, CSV export and the plan gate.
// Kept free of I/O so each rule has a unit test.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { activeLadder, type Plan } from './pricing';

/* ───────────── Auto-DM sequences (C2C server.cjs:2217-2313) ───────────── */

export const MAX_SEQUENCE_STEPS = 10;
export const MAX_SEQUENCES = 20;
export const MAX_DELAY_MINUTES = 43200; // 30 days

export interface SequenceStep { delayMinutes: number; body: string }
export interface SequenceInput { name: string; triggerIntent: number; triggerKeywords: string; steps: SequenceStep[]; isActive: boolean }

/** Validates a sequence exactly as C2C did. Returns the clean value or a message for the user. */
export function cleanSequence(b: Record<string, unknown>): { value: SequenceInput } | { error: string } {
  const name = String(b.name ?? '').trim();
  if (!name || name.length > 120) return { error: 'Give the sequence a name (max 120 characters).' };
  const intent = Number(b.triggerIntent);
  if (!Number.isInteger(intent) || intent < 0 || intent > 100) return { error: 'Trigger intent must be a whole number from 0 to 100.' };
  if (!Array.isArray(b.steps)) return { error: 'Steps must be a list.' };
  if (b.steps.length === 0) return { error: 'Add at least one message.' };
  if (b.steps.length > MAX_SEQUENCE_STEPS) return { error: `At most ${MAX_SEQUENCE_STEPS} steps.` };
  const steps: SequenceStep[] = [];
  for (const s of b.steps as Array<Record<string, unknown> | null>) {
    const body = String(s?.body ?? '').trim();
    const delay = Number(s?.delayMinutes ?? 0);
    if (!body) return { error: 'Every step needs a message.' };
    if (body.length > 1000) return { error: 'A step message is limited to 1000 characters.' };
    if (!Number.isInteger(delay) || delay < 0 || delay > MAX_DELAY_MINUTES) return { error: 'Delay must be between 0 and 43200 minutes (30 days).' };
    steps.push({ delayMinutes: delay, body });
  }
  return { value: { name, triggerIntent: intent, triggerKeywords: String(b.triggerKeywords ?? '').trim().slice(0, 500), steps, isActive: b.isActive !== false } };
}

/** C2C sold Auto-DM from its second tier up ("growth"). Same rule here: the second plan on the ladder. */
export function sequencesMinPlan(ladder: Plan[] = activeLadder()): Plan | undefined {
  return ladder[1];
}

export function planAllowsSequences(planSlug: string | null | undefined, ladder: Plan[] = activeLadder()): boolean {
  const min = sequencesMinPlan(ladder);
  if (!min) return false;
  const at = ladder.findIndex((p) => p.slug === planSlug);
  return at >= ladder.indexOf(min);
}

/* ───────────── API keys ───────────── */

// eqk_<12 hex key id>_<48 hex secret>. The id finds the row; only a hash of the secret is stored.
const KEY_RE = /^eqk_([0-9a-f]{12})_([0-9a-f]{48})$/;

export function generateApiKey() {
  const keyId = randomBytes(6).toString('hex');
  const secret = randomBytes(24).toString('hex');
  return { keyId, plaintext: `eqk_${keyId}_${secret}`, keyHash: hashApiSecret(secret) };
}

export function hashApiSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

export function parseApiKey(header: string | undefined | null): { keyId: string; secret: string } | null {
  const m = String(header ?? '').replace(/^Bearer\s+/i, '').trim().match(KEY_RE);
  return m ? { keyId: m[1], secret: m[2] } : null;
}

export function apiSecretMatches(secret: string, keyHash: string) {
  const a = Buffer.from(hashApiSecret(secret), 'hex');
  const b = Buffer.from(keyHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cleanList(v: unknown, max = 32): string[] {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(',');
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))].slice(0, max);
}

/* ───────────── IP bans ───────────── */

/** A single IPv4 or IPv6 address, normalised; null for anything else (no ranges, no hostnames). */
export function cleanIp(v: unknown): string | null {
  const ip = String(v ?? '').trim().toLowerCase();
  return isIP(ip) ? ip : null;
}

/** Ban length in hours: 1 hour to 1 year, default 24. */
export function banHours(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 24 * 365) : 24;
}

/* ───────────── CSV export ───────────── */

/** One CSV cell. Values that a spreadsheet would run as a formula are prefixed with a quote. */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/* ───────────── Super user "view as plan" ───────────── */

/** Plans a super user may view the product as: every ladder plan, or 'unlimited' (the default). */
export function viewAsOptions(ladder: Plan[] = activeLadder()): string[] {
  return ['unlimited', 'none', ...ladder.map((p) => p.slug)];
}
