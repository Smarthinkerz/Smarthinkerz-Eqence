ALTER TYPE "public"."source" ADD VALUE 'whatsapp';--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "stage" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "lead_score" smallint;--> statement-breakpoint
CREATE UNIQUE INDEX "authors_tenant_key_idx" ON "authors" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE INDEX "interactions_author_idx" ON "interactions" USING btree ("author_id");--> statement-breakpoint
-- Backfill: one customer record per existing author, then link each interaction to it.
-- The key matches packages/core/src/crm.ts authorKey() for platform ids; rows without an
-- id fall back to the lower-cased name. Safe to re-run: both statements are idempotent.
INSERT INTO "authors" ("tenant_id", "key", "display_name", "first_seen_at", "last_seen_at")
SELECT i."tenant_id",
       CASE WHEN coalesce(i."raw"->'_author'->>'externalId', '') <> ''
            THEN left(i."source"::text || ':' || (i."raw"->'_author'->>'externalId'), 200)
            ELSE left(i."source"::text || ':name:' || lower(btrim(i."raw"->'_author'->>'displayName')), 200) END AS k,
       max(left(btrim(i."raw"->'_author'->>'displayName'), 120)),
       min(i."posted_at"), max(i."posted_at")
  FROM "interactions" i
 WHERE i."author_id" IS NULL
   AND (coalesce(i."raw"->'_author'->>'externalId', '') <> '' OR coalesce(btrim(i."raw"->'_author'->>'displayName'), '') <> '')
 GROUP BY i."tenant_id", k
ON CONFLICT ("tenant_id", "key") DO NOTHING;--> statement-breakpoint
UPDATE "interactions" i SET "author_id" = a."id"
  FROM "authors" a
 WHERE i."author_id" IS NULL AND a."tenant_id" = i."tenant_id"
   AND a."key" = CASE WHEN coalesce(i."raw"->'_author'->>'externalId', '') <> ''
            THEN left(i."source"::text || ':' || (i."raw"->'_author'->>'externalId'), 200)
            ELSE left(i."source"::text || ':name:' || lower(btrim(i."raw"->'_author'->>'displayName')), 200) END;
