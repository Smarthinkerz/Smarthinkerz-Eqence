import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileVault } from '../src/index';

const key = randomBytes(32).toString('hex');
const fresh = () => mkdtemp(join(tmpdir(), 'eq-vault-'));

test('round-trips a value and stores no plaintext', async () => {
  const dir = await fresh();
  const vault = fileVault(dir, key);
  const ref = await vault.put({ apiToken: 'plain-token-value', shopDomain: 'shop.myshopify.com' });
  assert.match(ref, /^vlt_/);
  assert.deepEqual(await vault.get(ref), { apiToken: 'plain-token-value', shopDomain: 'shop.myshopify.com' });
  const raw = await readFile(join(dir, `${ref}.enc`));
  assert.equal(raw.includes(Buffer.from('plain-token-value')), false);
});

test('a tampered file fails authentication', async () => {
  const dir = await fresh();
  const vault = fileVault(dir, key);
  const ref = await vault.put({ apiToken: 'x' });
  const file = join(dir, `${ref}.enc`);
  const buf = await readFile(file);
  buf[buf.length - 1] ^= 0xff;
  await writeFile(file, buf);
  await assert.rejects(vault.get(ref));
});

test('a file copied under another reference does not decrypt', async () => {
  const dir = await fresh();
  const vault = fileVault(dir, key);
  const a = await vault.put({ apiToken: 'a' });
  const b = await vault.put({ apiToken: 'b' });
  await writeFile(join(dir, `${b}.enc`), await readFile(join(dir, `${a}.enc`)));
  await assert.rejects(vault.get(b));
});

test('path traversal in a reference is refused', async () => {
  const dir = await fresh();
  const vault = fileVault(dir, key);
  await assert.rejects(vault.get('../../etc/passwd'), /invalid vault reference/);
  assert.equal((await readdir(dir)).length, 0);
});

test('a wrong-length key is refused', () => {
  assert.throws(() => fileVault('/tmp', 'abcd'), /32 bytes/);
});
