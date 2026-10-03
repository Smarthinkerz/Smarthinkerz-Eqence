import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHubReturn } from './hubReturn';

const ws = '11111111-2222-3333-4444-555555555555';

test('paid return, exactly as the Hub builds it', () => {
  assert.deepEqual(parseHubReturn(`?status=paid&order_id=129&tap_id=chg_TS01A&external_ref=${ws}`),
    { status: 'paid', orderId: '129', tapId: 'chg_TS01A', externalRef: ws });
});

test('cancelled and failed are distinct outcomes', () => {
  assert.equal(parseHubReturn('?status=cancelled&order_id=5&tap_id=chg_x1').status, 'cancelled');
  assert.equal(parseHubReturn('?status=failed&order_id=5&tap_id=chg_x1').status, 'failed');
});

test('the Hub never sends pending; pending, unknown or missing status is treated as failed', () => {
  assert.equal(parseHubReturn('?status=pending&order_id=5').status, 'failed');
  assert.equal(parseHubReturn('?status=PAID').status, 'failed');
  assert.equal(parseHubReturn('').status, 'failed');
});

test('a plan parameter is ignored: the plan comes only from the signed webhook', () => {
  assert.equal('plan' in parseHubReturn('?status=paid&plan=eqence-premium'), false);
});

test('external_ref is optional and malformed values are dropped', () => {
  const r = parseHubReturn('?status=paid&order_id=12&tap_id=chg_x1');
  assert.equal(r.externalRef, null);
  const bad = parseHubReturn('?status=paid&order_id=12abc&tap_id=<x>&external_ref=not-a-uuid');
  assert.deepEqual([bad.orderId, bad.tapId, bad.externalRef], [null, null, null]);
});
