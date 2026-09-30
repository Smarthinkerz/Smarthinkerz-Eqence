// Shared runtime wiring for the API and the worker: AI config, credential vault and
// connector context, all from environment variables (names only in logs).
import type { AiConfig } from '@eqence/ai';
import { createJudgeMeConnector, type ConnectionContext } from '@eqence/connectors';
import { connections, type Db } from '@eqence/db';
import { fileVault, type Vault } from '@eqence/vault';
import { eq } from 'drizzle-orm';

export function aiConfigFromEnv(env = process.env): AiConfig {
  const provider = env.AI_PROVIDER === 'anthropic' ? 'anthropic' : 'openai';
  return {
    provider,
    apiKey: (provider === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY) || '',
    classifyModel: env.AI_CLASSIFY_MODEL || (provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini'),
    draftModel: env.AI_DRAFT_MODEL || (provider === 'anthropic' ? 'claude-sonnet-5' : 'gpt-4o'),
  };
}

let vault: Vault | undefined;
export function vaultFromEnv(env = process.env): Vault {
  if (!vault) {
    if (!env.VAULT_KEY) throw new Error('missing required environment variable VAULT_KEY');
    vault = fileVault(env.VAULT_DIR || '/var/lib/eqence/vault', env.VAULT_KEY);
  }
  return vault;
}

export const judgeme = createJudgeMeConnector();

export async function loadConnection(db: Db, connectionId: string) {
  const [c] = await db.select().from(connections).where(eq(connections.id, connectionId));
  if (!c) return null;
  const ctx: ConnectionContext = {
    id: c.id, tenantId: c.tenantId, externalAccount: c.externalAccount,
    cursor: (c.cursor as Record<string, unknown> | null) ?? null,
    credentials: await vaultFromEnv().get(c.credentialsRef),
  };
  return { row: c, ctx };
}

export function webhookUrlFor(publicUrl: string, connectionId: string) {
  return `${publicUrl.replace(/\/$/, '')}/webhooks/judgeme/${connectionId}`;
}
