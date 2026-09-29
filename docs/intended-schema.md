# Eqence intended schema (for the Comment to Customer merge)

Source: `migrations/003_org_multi_location_phase2.sql` and `migrations/004_response_approval_workflow.sql`
(Manus, June 2026). Target: Supabase Postgres (`auth.users`, `auth.uid()`, RLS).

**None of this was ever used by the live site.** The front end never called Supabase, and both
Supabase projects (Eqence `lvodtuvfaaitfxndbxbz`, Smarthinkerz-ShopiRepute `wjnprqaararxrkoqadgx`)
are paused. This file records design intent only.

## Tables

| Table | Purpose | Key columns |
|---|---|---|
| `organizations` | The customer account | `name`, `slug` (unique), `plan` (`starter`/`professional`/`enterprise`), `sso_enabled`, `sso_provider` (`okta`/`azure`/`google`), `sso_config` jsonb |
| `memberships` | User ↔ org with a role | `org_id`, `user_id` → `auth.users`, `role` (`owner`,`admin`,`manager`,`responder`,`approver`,`viewer`); unique (org, user) |
| `locations` | A store or brand inside an org | `org_id`, `name`, `slug` (unique per org), `locale` (`en`/`ar`), `timezone`, `shopify_store_url`, `shopify_access_token` |
| `review_sources` | A connected review platform per location | `location_id`, `platform` (`google`,`shopify`,`facebook`,`trustpilot`,`app_store`), `credentials` jsonb (server-only), `is_active`, `last_sync_at`; unique (location, platform) |
| `sla_policies` | Response-time target per severity | `location_id`, `severity` (`critical`/`high`/`medium`/`low`), `response_hours_target`, `escalation_to` (a role) |
| `guardrails` | Brand voice and compliance per location (one row) | `brand_voice`, `banned_terms[]`, `required_disclosures[]`, `platform_rules` jsonb |
| `audit_log` | Append-only activity log | `org_id`, `location_id`, `actor_id`, `verb` (`ingested`,`drafted`,`edited`,`approved`,`published`,`failed`), `target`, `target_id`, `payload` jsonb |
| `reviews` *(altered, never created here)* | Inbound reviews | gains `location_id` |
| `responses` *(altered, never created here)* | Replies to reviews | gains `location_id`, `status` (enum below), `drafted_by`, `approved_by`, `approved_at`, `published_at`, `external_id`, `publish_error`, `language` |
| `approvals` | Decision trail on a response | `response_id`, `approver_id`, `status`, `rationale`, `acted_at` |
| `assignments` | Routing a review to a person | `review_id`, `assignee_id`, `queue`, `assigned_by`; unique (review, assignee) |
| `my_work_items` | Per-user inbox | `user_id`, `review_id`, `response_id`, `item_type` (`awaiting_approval`,`assigned_to_me`,`sla_at_risk`,`recently_published`), `priority` |

Enum `response_status`: `draft` → `in_review` → `changes_requested` / `approved` → `published`, plus `needs_attention`.

Trigger `response_approval_audit`: every insert into `approvals` writes an `audit_log` row (`verb='approved'`).

## Access model (RLS)

- **Read:** members of an org can read their org, its memberships, locations, reviews and responses. Only `owner`/`admin` can read `audit_log`. Users see only their own `my_work_items`.
- **Write:** responses can be drafted by `owner/admin/manager/responder`. Approvals can be made by `owner/admin/manager/approver`. Assignments can be made by `owner/admin/manager`.
- **No client access at all:** `review_sources`, `sla_policies` and `guardrails` have RLS enabled and no policies, so they are server-only.

## Gaps to settle at merge time

1. **`reviews` and `responses` are never created.** 003 and 004 only alter them, and migrations 001/002 are not in the repo. On a fresh database, 003 fails at its first `ALTER TABLE reviews`.
2. **Plan names don't match the site.** `organizations.plan` allows `starter/professional/enterprise`, but the planned pricing is Starter, Basic, Advance, Premium and Enterprise.
3. **`approvals.approver_id` contradicts itself.** It is `NOT NULL` but `ON DELETE SET NULL`, so deleting that user errors.
4. **Secrets are stored in plain columns.** `shopify_access_token` and `review_sources.credentials` would need encryption or a vault.
5. **Write policies are missing** for `organizations`, `memberships`, `locations` and response updates (approve/publish). Those would have to go through the service role.
6. **`CREATE INDEX` and `CREATE POLICY` are not idempotent** (no `IF NOT EXISTS`), so neither migration can be re-run.
7. **IDs differ from Comment to Customer.** This schema uses UUIDs; Comment to Customer uses `SERIAL` integers on Neon. Its `cc_interactions` and `cc_responses` tables already reuse this file's column names and status vocabulary (`external_id`, `publish_error`, `approved_by`, `approved_at`, `published_at`).
