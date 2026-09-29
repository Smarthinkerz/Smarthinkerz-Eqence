import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { test } from 'node:test';
import { isLegacyHash, toLegacyHash, verifyLegacyPassword } from '../src/legacyPassword';

// Exactly C2C's hashPassword (c2c-live server.cjs:584-588).
function c2cHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

test('a C2C hash verifies with the right password', async () => {
  const stored = toLegacyHash(c2cHash('Correct-horse-9!'));
  assert.equal(isLegacyHash(stored), true);
  assert.equal(await verifyLegacyPassword('Correct-horse-9!', stored), true);
});

test('a C2C hash rejects a wrong password', async () => {
  const stored = toLegacyHash(c2cHash('Correct-horse-9!'));
  assert.equal(await verifyLegacyPassword('correct-horse-9!', stored), false);
});

test('malformed legacy hashes are rejected, not thrown', async () => {
  assert.equal(await verifyLegacyPassword('x', 'c2c-scrypt$'), false);
  assert.equal(await verifyLegacyPassword('x', 'c2c-scrypt$abc:not-hex'), false);
  assert.equal(await verifyLegacyPassword('x', 'c2c-scrypt$abc:00ff'), false);
});

test('a Better Auth hash is not treated as legacy', () => {
  assert.equal(isLegacyHash('0123abcd:ffee'), false);
});
