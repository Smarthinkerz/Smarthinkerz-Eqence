// Merchant credentials (platform API tokens) never enter the database: `connections`
// holds only a reference. Each credential set is one AES-256-GCM encrypted file under
// VAULT_DIR, keyed by VAULT_KEY (32 bytes, hex) from the service environment.
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REF_RE = /^vlt_[0-9a-f-]{36}$/;

export interface Vault {
  put(value: Record<string, string>): Promise<string>;
  get(ref: string): Promise<Record<string, string>>;
  remove(ref: string): Promise<void>;
}

export function fileVault(dir: string, keyHex: string): Vault {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('VAULT_KEY must be 32 bytes of hex');
  const path = (ref: string) => {
    if (!REF_RE.test(ref)) throw new Error('invalid vault reference');
    return join(dir, `${ref}.enc`);
  };

  return {
    async put(value) {
      const ref = `vlt_${randomUUID()}`;
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(ref)); // binds the ciphertext to its own reference
      const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const tmp = `${path(ref)}.tmp`;
      await writeFile(tmp, Buffer.concat([iv, cipher.getAuthTag(), body]), { mode: 0o600 });
      await rename(tmp, path(ref));
      return ref;
    },
    async get(ref) {
      const buf = await readFile(path(ref));
      const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      decipher.setAAD(Buffer.from(ref));
      decipher.setAuthTag(buf.subarray(12, 28));
      const plain = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
      return JSON.parse(plain.toString('utf8'));
    },
    async remove(ref) {
      await rm(path(ref), { force: true });
    },
  };
}
