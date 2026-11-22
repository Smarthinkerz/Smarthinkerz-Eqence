import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  CHECKOUT_TTL_SECONDS, checkoutUrl, formatUsd, priceFor, signAmount, signedAmountCanonical, verifyHubSignature,
} from '../src/hub';
import { selfServePlans, SITE_LADDER } from '../src/pricing';

const sign = (b: string, s: string) => 'sha256=' + createHmac('sha256', s).update(b).digest('hex');

test('signature: exact sha256=<hex> over the raw body', () => {
  const body = '{"event":"payment.success"}';
  assert.equal(verifyHubSignature(body, sign(body, 'k'), 'k'), true);
  assert.equal(verifyHubSignature(body + ' ', sign(body, 'k'), 'k'), false);
  assert.equal(verifyHubSignature(body, sign(body, 'k').slice(7), 'k'), false, 'prefix is required');
  assert.equal(verifyHubSignature(body, sign(body, 'k'), ''), false, 'empty secret never verifies');
  assert.equal(verifyHubSignature(body, `${sign(body, 'k')}, ${sign(body, 'k')}, ${sign(body, 'k')}`, 'k'), false, 'more than two copies is not a Hub header');
});

const TENANT = '11111111-2222-3333-4444-555555555555';
const base = {
  hubBaseUrl: 'https://smarthinkerz.com', tenantId: TENANT, returnUrl: 'https://www.eqence.com/app/billing/return', secret: 'k',
};

test('checkout URL: plan, app_id, cycle, return URL, user_id binding and a valid referral code', () => {
  const url = new URL(checkoutUrl({ ...base, plan: SITE_LADDER[0], cycle: 'monthly', email: 'a@b.co', ref: 'RAF7K' }));
  assert.equal(url.origin + url.pathname, 'https://smarthinkerz.com/checkout');
  assert.equal(url.searchParams.get('plan'), 'eqence-starter');
  assert.equal(url.searchParams.get('app_id'), 'eqence');
  assert.equal(url.searchParams.get('cycle'), 'monthly');
  assert.equal(url.searchParams.get('return_url'), 'https://www.eqence.com/app/billing/return');
  assert.equal(url.searchParams.get('user_id'), TENANT, 'user_id is the join key the Hub echoes as metadata.user_id');
  assert.match(url.searchParams.get('external_ref')!, /^eqc_[0-9a-f]{24}$/);
  assert.equal(url.searchParams.get('ref'), 'RAF7K');
});

test('checkout URL: the price is signed exactly as the Hub verifies it (shz.amount.v2)', () => {
  const now = Date.UTC(2026, 10, 22, 12, 0, 0);
  const url = new URL(checkoutUrl({ ...base, plan: SITE_LADDER[1], cycle: 'yearly', now, externalRef: 'eqc_000000000000000000000001' }));
  const q = url.searchParams;
  assert.equal(q.get('amount'), '590.00', 'yearly Basic, two decimals for USD');
  assert.equal(q.get('currency'), 'USD');
  assert.equal(q.get('exp'), String(now / 1000 + CHECKOUT_TTL_SECONDS));
  const canonical = `13:shz.amount.v2,6:eqence,12:eqence-basic,6:590.00,3:USD,28:eqc_000000000000000000000001,10:${now / 1000 + CHECKOUT_TTL_SECONDS},0:,`;
  assert.equal(q.get('sig'), sign(canonical, 'k'));
  // Any edit to the signed fields breaks the signature.
  assert.notEqual(signAmount({ appId: 'eqence', planSlug: 'eqence-basic', amount: '59.00', currency: 'USD', externalRef: 'eqc_000000000000000000000001', exp: now / 1000 + CHECKOUT_TTL_SECONDS }, 'k'), q.get('sig'));
});

test('checkout URL: a fresh nonce every time, and no link without the partner secret', () => {
  const a = new URL(checkoutUrl({ ...base, plan: SITE_LADDER[0], cycle: 'monthly' })).searchParams.get('external_ref');
  const b = new URL(checkoutUrl({ ...base, plan: SITE_LADDER[0], cycle: 'monthly' })).searchParams.get('external_ref');
  assert.notEqual(a, b);
  assert.throws(() => checkoutUrl({ ...base, secret: '', plan: SITE_LADDER[0], cycle: 'monthly' }), /HUB_PARTNER_SECRET/);
  assert.throws(() => checkoutUrl({ ...base, tenantId: 't', plan: SITE_LADDER[0], cycle: 'monthly' }), /UUID/);
});

test('USD amounts have the one legal spelling; a monthly-only plan has no yearly price', () => {
  assert.equal(formatUsd(29), '29.00');
  assert.equal(formatUsd(1990), '1990.00');
  assert.throws(() => formatUsd(0));
  assert.equal(priceFor(SITE_LADDER[3], 'yearly'), 1990);
  assert.throws(() => priceFor({ ...SITE_LADDER[0], yearlyUsd: null }, 'yearly'), /no yearly price/);
});

test('signer reproduces every Hub conformance vector byte for byte', () => {
  const vectors = JSON.parse(readFileSync(new URL('./signed-amount-vectors.json', import.meta.url), 'utf8')) as {
    secret: string; cases: Array<{ name: string; fields: { appId: string; planSlug: string; amount: string; currency: string; externalRef: string; expiresAt: number; itemName: string }; canonical: string; signature: string }>;
  };
  assert.ok(vectors.cases.length >= 4);
  for (const c of vectors.cases) {
    const f = { ...c.fields, exp: c.fields.expiresAt };
    assert.equal(signedAmountCanonical(f), c.canonical, c.name);
    assert.equal(signAmount(f, vectors.secret), c.signature, c.name);
  }
});

test('an invalid referral code is dropped, not forwarded', () => {
  const url = new URL(checkoutUrl({ ...base, plan: SITE_LADDER[0], cycle: 'yearly', returnUrl: 'https://www.eqence.com/x', ref: '<script>' }));
  assert.equal(url.searchParams.has('ref'), false);
});

test('site ladder: annual is exactly 10x monthly; Enterprise is contact-only', () => {
  for (const p of SITE_LADDER) assert.equal(p.yearlyUsd, p.monthlyUsd * 10, p.slug);
  assert.deepEqual(SITE_LADDER.map((p) => p.monthlyUsd), [29, 59, 99, 199, 499]);
  assert.deepEqual(selfServePlans(SITE_LADDER).map((p) => p.slug), ['eqence-starter', 'eqence-basic', 'eqence-advance', 'eqence-premium']);
});
