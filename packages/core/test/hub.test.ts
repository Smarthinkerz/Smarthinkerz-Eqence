import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { checkoutUrl, verifyHubSignature } from '../src/hub';
import { SITE_LADDER } from '../src/pricing';

const sign = (b: string, s: string) => 'sha256=' + createHmac('sha256', s).update(b).digest('hex');

test('signature: exact sha256=<hex> over the raw body', () => {
  const body = '{"event":"payment.success"}';
  assert.equal(verifyHubSignature(body, sign(body, 'k'), 'k'), true);
  assert.equal(verifyHubSignature(body + ' ', sign(body, 'k'), 'k'), false);
  assert.equal(verifyHubSignature(body, sign(body, 'k').slice(7), 'k'), false, 'prefix is required');
  assert.equal(verifyHubSignature(body, sign(body, 'k'), ''), false, 'empty secret never verifies');
  assert.equal(verifyHubSignature(body, `${sign(body, 'k')}, ${sign(body, 'k')}, ${sign(body, 'k')}`, 'k'), false, 'more than two copies is not a Hub header');
});

test('checkout URL carries plan, app_id, cycle, return URL, tenant ref and a valid referral code', () => {
  const url = new URL(checkoutUrl({
    hubBaseUrl: 'https://smarthinkerz.com', plan: SITE_LADDER[0], cycle: 'monthly',
    tenantId: '11111111-2222-3333-4444-555555555555', email: 'a@b.co',
    returnUrl: 'https://www.eqence.com/app/billing/return', ref: 'RAF7K',
  }));
  assert.equal(url.origin + url.pathname, 'https://smarthinkerz.com/checkout');
  assert.equal(url.searchParams.get('plan'), 'eqence-starter');
  assert.equal(url.searchParams.get('app_id'), 'eqence');
  assert.equal(url.searchParams.get('cycle'), 'monthly');
  assert.equal(url.searchParams.get('return_url'), 'https://www.eqence.com/app/billing/return');
  assert.equal(url.searchParams.get('external_ref'), '11111111-2222-3333-4444-555555555555');
  assert.equal(url.searchParams.get('ref'), 'RAF7K');
});

test('an invalid referral code is dropped, not forwarded', () => {
  const url = new URL(checkoutUrl({
    hubBaseUrl: 'https://smarthinkerz.com', plan: SITE_LADDER[0], cycle: 'yearly', tenantId: 't',
    returnUrl: 'https://www.eqence.com/x', ref: '<script>',
  }));
  assert.equal(url.searchParams.has('ref'), false);
});
