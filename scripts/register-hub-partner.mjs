#!/usr/bin/env node
/**
 * Register Eqence as a SmarThinkerz Hub partner app, with its plans.
 *
 * Modelled on MicroLearning's scripts/register-hub-partner.mjs (via the Academy port at
 * Smarthinkerz-Academy/scripts/register-hub-partner.mjs) and the Hub's own
 * scripts/register-partner-apps.mjs, so the payloads are what the Hub admin API expects.
 *
 * Refuses to run unless all of these agree, before it ever authenticates:
 *   1. the ladder named by --ladder (site | metered) in packages/core/src/pricing.ts
 *   2. the plans the LIVE Eqence API serves at https://api.eqence.com/api/pricing
 *      (so the Hub can never charge a price the product does not grant)
 *   3. the Hub's lib/plans.ts: exactly one product string for displayName "Eqence",
 *      and no collision between Eqence slugs and the Hub's in-code slugs
 *   4. if a partner with app_id "eqence" already exists in the Hub, its product,
 *      webhook URL and return URL must match exactly
 *
 *   Dry run (default, changes nothing):
 *     node scripts/register-hub-partner.mjs --ladder site
 *   Apply (Fathi runs this):
 *     HUB_ADMIN_TOKEN=... PARTNER_SECRET_EQENCE=... node scripts/register-hub-partner.mjs --ladder site --apply
 *
 * PARTNER_SECRET_EQENCE must be at least 32 characters and must equal HUB_PARTNER_SECRET in
 * /etc/eqence/api.env on csb-fra, byte for byte. This script never generates or prints it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const REPLACE = args.includes('--replace');
const ladderArg = args[args.indexOf('--ladder') + 1];

const HUB_BASE_URL = (process.env.HUB_BASE_URL || 'https://smarthinkerz.com').replace(/\/+$/, '');
const API_BASE_URL = (process.env.API_BASE_URL || 'https://api.eqence.com').replace(/\/+$/, '');
const APP_BASE_URL = (process.env.APP_BASE_URL || 'https://www.eqence.com').replace(/\/+$/, '');
const HUB_PLANS_FILE = process.env.HUB_PLANS_FILE || path.resolve(ROOT, '../Smarthinkerz-Hub/artifacts/api-server/src/lib/plans.ts');
const APP_ID = 'eqence';
const DISPLAY_NAME = 'Eqence';
const CURRENCY = 'USD';
const EVENTS = 'order.paid,order.failed,order.refunded';

function fail(msg, details = []) {
  console.error(`\nREFUSED: ${msg}`);
  for (const d of details) console.error(`  - ${d}`);
  process.exit(1);
}

// 1. the chosen ladder, parsed from source so this script cannot drift from the product
function readLadder(name) {
  if (name !== 'site' && name !== 'metered') fail('pass --ladder site or --ladder metered (the ladder Fathi confirmed)');
  const src = fs.readFileSync(path.join(ROOT, 'packages/core/src/pricing.ts'), 'utf8');
  const constName = name === 'site' ? 'SITE_LADDER' : 'METERED_LADDER';
  const block = src.slice(src.indexOf(`export const ${constName}`), src.indexOf('];', src.indexOf(`export const ${constName}`)));
  const plans = [...block.matchAll(/slug: '([^']+)', name: '([^']+)', monthlyUsd: (\d+(?:\.\d+)?), yearlyUsd: (null|\d+(?:\.\d+)?)/g)]
    .map(([, slug, name, m, y]) => ({ slug, name, monthlyUsd: Number(m), yearlyUsd: y === 'null' ? null : Number(y) }));
  if (!plans.length) fail(`could not parse ${constName} from packages/core/src/pricing.ts`);
  return plans;
}

// 2. what the live API actually serves
async function readLive() {
  try {
    const r = await fetch(`${API_BASE_URL}/api/pricing`);
    if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` };
    return { ok: true, ...(await r.json()) };
  } catch (e) { return { ok: false, reason: e.message }; }
}

// 3. the Hub's product string and in-code slugs
function readHubPlans() {
  if (!fs.existsSync(HUB_PLANS_FILE)) fail(`cannot confirm the Hub's product string: ${HUB_PLANS_FILE} not found`, ['git -C ../Smarthinkerz-Hub pull, or set HUB_PLANS_FILE']);
  const src = fs.readFileSync(HUB_PLANS_FILE, 'utf8');
  const entries = [...src.matchAll(/"([a-z0-9-]+)":\s*\{([\s\S]*?)\n\s*\},/g)].map(([, slug, block]) => ({
    slug, product: block.match(/product:\s*"([^"]+)"/)?.[1], displayName: block.match(/displayName:\s*"([^"]+)"/)?.[1],
  }));
  const products = [...new Set(entries.filter((e) => e.displayName === DISPLAY_NAME || e.product === DISPLAY_NAME).map((e) => e.product))];
  return { products, inCodeSlugs: new Set(entries.map((e) => e.slug)) };
}

async function api(p, { method = 'GET', token, body } = {}) {
  const r = await fetch(HUB_BASE_URL + p, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, data };
}
const rowsOf = (d, key) => (Array.isArray(d) ? d : d?.[key] ?? []);

async function main() {
  const ladder = readLadder(ladderArg);
  console.log(`Ladder:   ${ladderArg}: ${ladder.map((p) => `${p.slug} $${p.monthlyUsd}`).join(', ')}`);

  const live = await readLive();
  if (!live.ok) fail(`the live Eqence API is not reachable (${live.reason}), so its prices cannot be verified`);
  if (live.ladder !== ladderArg) fail(`the live API serves ladder "${live.ladder}", not "${ladderArg}"`, ['set PRICING_LADDER on csb-fra and redeploy first, so the product grants what the Hub charges']);
  const problems = [];
  for (const p of ladder) {
    const l = live.plans.find((x) => x.slug === p.slug);
    if (!l) problems.push(`${p.slug} missing from the live API`);
    else if (l.monthlyUsd !== p.monthlyUsd || l.yearlyUsd !== p.yearlyUsd) problems.push(`${p.slug}: source $${p.monthlyUsd}/$${p.yearlyUsd}, live $${l.monthlyUsd}/$${l.yearlyUsd}`);
  }
  for (const l of live.plans) if (!ladder.find((p) => p.slug === l.slug)) problems.push(`live API serves extra plan ${l.slug}`);
  if (problems.length) fail('the live API and the source ladder disagree', problems);
  console.log(`Live API: OK, ${API_BASE_URL}/api/pricing serves the same ${ladder.length} plans`);

  const hub = readHubPlans();
  if (hub.products.length !== 1) {
    fail(`expected exactly one Hub product for "${DISPLAY_NAME}" in ${path.relative(ROOT, HUB_PLANS_FILE)}`, [
      `found: ${JSON.stringify(hub.products)}`,
      'the Hub must define Eqence\'s product string (routing key) before plans can be registered',
    ]);
  }
  const PRODUCT = hub.products[0];
  const collisions = ladder.filter((p) => hub.inCodeSlugs.has(p.slug)).map((p) => p.slug);
  if (collisions.length) fail('slugs collide with the Hub\'s in-code plans (the Hub would charge its own price)', collisions);
  console.log(`Product:  "${PRODUCT}" from the Hub's lib/plans.ts; no slug collisions`);

  const secret = (process.env.PARTNER_SECRET_EQENCE || process.env.PARTNER_SECRET || '').trim();
  const partner = {
    name: DISPLAY_NAME, appId: APP_ID, product: PRODUCT,
    returnUrl: `${APP_BASE_URL}/app/billing/return`,
    allowedReturnHosts: 'eqence.com,www.eqence.com',
    webhookUrl: `${API_BASE_URL}/api/hub/webhook`,
    secret, events: EVENTS,
  };
  const planRows = ladder.map((p) => ({
    appId: APP_ID, slug: p.slug, name: p.name, product: PRODUCT, displayName: DISPLAY_NAME, oneTime: false,
    monthlyAmount: p.monthlyUsd, yearlyAmount: p.yearlyUsd, currency: CURRENCY, productUrl: APP_BASE_URL,
  }));

  console.log('\nPOST /admin/api/partners');
  console.log(JSON.stringify({ ...partner, secret: secret ? `[hidden, ${secret.length} chars]` : '[NOT SET]' }, null, 2));
  for (const row of planRows) { console.log('POST /admin/api/partner-plans'); console.log(JSON.stringify(row)); }

  if (!APPLY) { console.log('\nDry run complete. Nothing was sent. Re-run with --apply to register.'); return; }

  if (secret.length < 32) fail(`PARTNER_SECRET_EQENCE must be set and at least 32 characters (got ${secret.length})`);
  let token = (process.env.HUB_ADMIN_TOKEN || '').trim();
  if (token) {
    const probe = await api('/admin/api/partners', { token });
    if (!probe.ok) fail(`HUB_ADMIN_TOKEN was rejected (HTTP ${probe.status})`);
  } else {
    const { ADMIN_USERNAME: username, ADMIN_PASSWORD: password } = process.env;
    if (!username || !password) fail('set HUB_ADMIN_TOKEN, or ADMIN_USERNAME and ADMIN_PASSWORD (Hub admin credentials)');
    const login = await api('/admin/api/login', { method: 'POST', body: { username, password } });
    if (!login.ok || !login.data?.token) fail(`Hub admin login failed (HTTP ${login.status})`);
    token = login.data.token;
  }

  const existing = rowsOf((await api('/admin/api/partners', { token })).data, 'partners').find((p) => (p.appId ?? p.app_id) === APP_ID);
  if (existing) {
    const diffs = [];
    for (const [k, v] of Object.entries({ product: partner.product, webhookUrl: partner.webhookUrl, returnUrl: partner.returnUrl })) {
      const cur = existing[k] ?? existing[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)];
      if (cur !== v) diffs.push(`${k}: Hub has "${cur}", expected "${v}"`);
    }
    if (diffs.length) fail('partner "eqence" already exists in the Hub with a different configuration', diffs);
    console.log('partner eqence already exists with matching settings; not recreated (its secret cannot be read back).');
  } else {
    const r = await api('/admin/api/partners', { method: 'POST', token, body: partner });
    if (!r.ok) fail(`creating partner eqence failed (HTTP ${r.status})`, [JSON.stringify(r.data)]);
    console.log('partner eqence created');
  }

  if (REPLACE) {
    const keep = new Set(planRows.map((p) => p.slug));
    const current = rowsOf((await api('/admin/api/partner-plans', { token })).data, 'plans');
    for (const x of current.filter((x) => (x.appId ?? x.app_id) === APP_ID && !keep.has(x.slug))) {
      const del = await api(`/admin/api/partner-plans/${x.id}`, { method: 'DELETE', token });
      console.log(del.ok ? `removed stale plan ${x.slug}` : `removing ${x.slug}: HTTP ${del.status}`);
    }
  }
  let failed = 0;
  for (const row of planRows) {
    const pr = await api('/admin/api/partner-plans', { method: 'POST', token, body: row });
    if (pr.ok) console.log(`plan ${row.slug}: $${row.monthlyAmount}/mo registered`);
    else if (pr.status === 409) console.log(`plan ${row.slug} already exists; verify its price in the Hub admin`);
    else { failed++; console.error(`plan ${row.slug}: HTTP ${pr.status} ${JSON.stringify(pr.data)}`); }
  }
  if (failed) process.exit(1);
  console.log('\nDone. HUB_PARTNER_SECRET on csb-fra must equal PARTNER_SECRET_EQENCE.');
}

main().catch((e) => { console.error(e); process.exit(1); });
