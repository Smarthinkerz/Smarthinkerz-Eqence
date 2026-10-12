import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emailFromUnsubscribeToken, unsubscribeToken, unsubscribeUrl } from '../src/outreach';

test('a token round trips to the lower-cased address it was issued for', () => {
  const t = unsubscribeToken(' Info@Store.Example ', 'k');
  assert.equal(emailFromUnsubscribeToken(t, 'k'), 'info@store.example');
  assert.match(unsubscribeUrl('https://api.eqence.com/', 'info@store.example', 'k'), /^https:\/\/api\.eqence\.com\/u\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test('a token signed with another secret, altered, or malformed names nobody', () => {
  const t = unsubscribeToken('info@store.example', 'k');
  const [body, sig] = t.split('.');
  assert.equal(emailFromUnsubscribeToken(t, 'other'), null);
  assert.equal(emailFromUnsubscribeToken(t, ''), null, 'empty secret never verifies');
  assert.equal(emailFromUnsubscribeToken(`${Buffer.from('boss@store.example').toString('base64url')}.${sig}`, 'k'), null, 'signature is bound to the address');
  assert.equal(emailFromUnsubscribeToken(`${body}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`, 'k'), null);
  assert.equal(emailFromUnsubscribeToken(`${body}.${sig}.x`, 'k'), null);
  assert.equal(emailFromUnsubscribeToken(body, 'k'), null);
  assert.equal(emailFromUnsubscribeToken('', 'k'), null);
  assert.equal(emailFromUnsubscribeToken('x'.repeat(601), 'k'), null);
});

test('no token is issued without a secret or for something that is not an address', () => {
  assert.throws(() => unsubscribeToken('info@store.example', ''));
  assert.throws(() => unsubscribeToken('not an address', 'k'));
});
