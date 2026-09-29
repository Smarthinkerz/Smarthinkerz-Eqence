// Accounts migrated from Comment to Customer keep their existing passwords. C2C stored
// `salt:hash` from Node's scryptSync(password, saltHexString, 64) with default cost
// (N=16384, r=8, p=1) — see c2c-live server.cjs:583-596. Better Auth's own format is
// also `salt:hash` but with r=16, so the two cannot be told apart by shape. Migrated
// hashes are therefore stored with an explicit prefix.
import { scrypt, timingSafeEqual } from 'node:crypto';

export const LEGACY_PREFIX = 'c2c-scrypt$';

export function isLegacyHash(stored: string): boolean {
  return stored.startsWith(LEGACY_PREFIX);
}

export function toLegacyHash(c2cStored: string): string {
  return LEGACY_PREFIX + c2cStored;
}

export function verifyLegacyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.slice(LEGACY_PREFIX.length).split(':');
  if (!salt || !hash || !/^[0-9a-f]+$/i.test(hash)) return Promise.resolve(false);
  const expected = Buffer.from(hash, 'hex');
  return new Promise((resolve) => {
    scrypt(password, salt, 64, (err, derived) => {
      if (err || derived.length !== expected.length) return resolve(false);
      resolve(timingSafeEqual(derived, expected));
    });
  });
}
