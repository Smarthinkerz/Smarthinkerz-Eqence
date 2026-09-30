import {
  aiConfigFromEnv, classifyInteraction, judgeme, loadConnection, upsertInteractions,
} from '@eqence/core';
import { connections, interactions, responses, tenants, user, type Db } from '@eqence/db';
import { and, eq } from 'drizzle-orm';
import type { Handler } from './outbox';

const MAX_PAGES_PER_SYNC = 200; // 200 x 50 = 10,000 reviews per pass

async function markConnectionError(db: Db, connectionId: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  await db.update(connections).set({ status: 'error', error: message.slice(0, 500), updatedAt: new Date() })
    .where(eq(connections.id, connectionId));
}

export function buildHandlers(db: Db): Record<string, Handler> {
  return {
    'system.noop': async () => {},

    // Full pass over a store's reviews. Upserts are idempotent, so retries are safe.
    'connection.sync': async (payload) => {
      const { connectionId } = payload as { connectionId: string };
      const loaded = await loadConnection(db, connectionId);
      if (!loaded || loaded.row.status === 'revoked') return;
      let cursor = null as Record<string, unknown> | null;
      try {
        for (let i = 0; i < MAX_PAGES_PER_SYNC; i++) {
          const page = await judgeme.ingest(loaded.ctx, cursor);
          await upsertInteractions(db, { id: connectionId, tenantId: loaded.row.tenantId, source: loaded.row.source }, page.interactions);
          cursor = page.cursor;
          if (!page.hasMore) break;
        }
        await db.update(connections).set({ cursor, lastSyncAt: new Date(), status: 'active', error: null, updatedAt: new Date() })
          .where(eq(connections.id, connectionId));
      } catch (err) {
        await markConnectionError(db, connectionId, err);
        throw err;
      }
    },

    // A verified webhook named a review: fetch the authoritative copy and upsert it.
    'judgeme.review': async (payload) => {
      const { connectionId, reviewId } = payload as { connectionId: string; reviewId: string };
      const loaded = await loadConnection(db, connectionId);
      if (!loaded || loaded.row.status !== 'active') return;
      const item = await judgeme.fetchReview(loaded.ctx, reviewId);
      await upsertInteractions(db, { id: connectionId, tenantId: loaded.row.tenantId, source: loaded.row.source }, [item]);
    },

    'interaction.classify': async (payload) => {
      const { interactionId } = payload as { interactionId: string };
      await classifyInteraction(db, aiConfigFromEnv(), interactionId);
    },

    'response.publish': async (payload) => {
      const { responseId } = payload as { responseId: string };
      const [r] = await db.select().from(responses).where(eq(responses.id, responseId));
      if (!r || r.status !== 'approved') return; // rejected or already published meanwhile
      const [it] = await db.select().from(interactions).where(eq(interactions.id, r.interactionId));
      const loaded = it?.connectionId ? await loadConnection(db, it.connectionId) : null;
      if (!it || !loaded) {
        await db.update(responses).set({ status: 'failed', error: 'source connection no longer exists', updatedAt: new Date() }).where(eq(responses.id, r.id));
        return;
      }
      try {
        const out = await judgeme.publish(loaded.ctx, { interactionExternalId: it.externalId, channelType: it.channelType }, r.body);
        await db.update(responses).set({ status: 'published', publishedAt: new Date(), externalId: out.externalId, error: null, updatedAt: new Date() })
          .where(and(eq(responses.id, r.id), eq(responses.status, 'approved')));
        await db.update(interactions).set({ status: 'responded' }).where(eq(interactions.id, it.id));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // A 4xx will not fix itself: fail visibly so the merchant can edit and retry.
        if (/returned 4\d\d/.test(message)) {
          await db.update(responses).set({ status: 'failed', error: message.slice(0, 500), updatedAt: new Date() }).where(eq(responses.id, r.id));
          return;
        }
        throw err; // network or 5xx: the outbox retries with backoff
      }
    },

    // One email per negative interaction to the workspace owner.
    'alert.negative': async (payload) => {
      const { interactionId } = payload as { interactionId: string };
      const [row] = await db.select({ it: interactions, email: user.email, store: tenants.name })
        .from(interactions).innerJoin(tenants, eq(tenants.id, interactions.tenantId)).innerJoin(user, eq(user.id, tenants.ownerUserId))
        .where(eq(interactions.id, interactionId));
      if (!row) return;
      const key = process.env.RESEND_API_KEY;
      if (!key) throw new Error('RESEND_API_KEY is not set; alert stays queued');
      const stars = row.it.rating != null ? `${row.it.rating}/5 stars` : 'no rating';
      const excerpt = row.it.body.slice(0, 400);
      const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      const link = `${process.env.WEB_URL || 'https://www.eqence.com'}/app/inbox?i=${row.it.id}`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'Eqence <noreply@smarthinkerz.com>',
          to: [row.email],
          subject: `Negative review needs a reply (${stars})`,
          text: `A customer left a negative review${row.it.subject ? ` on ${row.it.subject}` : ''} (${stars}):\n\n"${excerpt}"\n\nReply: ${link}`,
          html: `<p>A customer left a negative review${row.it.subject ? ` on <b>${esc(row.it.subject)}</b>` : ''} (${esc(stars)}):</p><blockquote>${esc(excerpt)}</blockquote><p><a href="${esc(link)}">Draft a reply in Eqence</a></p>`,
        }),
      });
      if (!res.ok) throw new Error(`Resend returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}
