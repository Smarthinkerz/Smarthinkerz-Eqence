#!/usr/bin/env bash
# Copies Comment to Customer accounts into the eqence database. Runs on csb-fra as root.
#   migrate-c2c-users.sh <source database on this server> [target database, default eqence]
# The source is a restored copy of C2C's Neon database (never Neon itself). Idempotent:
# rows are keyed on user.legacy_c2c_id, so re-running inserts nothing twice. Password
# hashes move database-to-database and are never printed; they are stored with the
# c2c-scrypt$ prefix that apps/api/src/legacyPassword.ts verifies.
set -euo pipefail
SRC="${1:?usage: migrate-c2c-users.sh <source db> [target db]}"
DST="${2:-eqence}"
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d "$DST" -c "create table if not exists c2c_import_users (
  id int primary key, name text, email text, password_hash text, role text, is_super_user boolean,
  effective_plan text, plan text, billing_status text, email_verified boolean, created_at timestamptz)"
"${PSQL[@]}" -d "$DST" -c "truncate c2c_import_users"

"${PSQL[@]}" -d "$SRC" -c "\copy (select id, name, lower(trim(email)), password_hash, role, coalesce(is_super_user,false), effective_plan, plan, billing_status, coalesce(email_verified,false), created_at from cc_users) to stdout with csv" \
  | "${PSQL[@]}" -d "$DST" -c "\copy c2c_import_users from stdin with csv"

"${PSQL[@]}" -d "$DST" <<'SQL'
begin;
-- Only hashes in C2C's exact format are carried; anything else is reported and skipped.
insert into "user" (id, name, email, email_verified, role, is_super_user, effective_plan, legacy_c2c_id, created_at, updated_at)
select gen_random_uuid()::text, coalesce(nullif(name, ''), split_part(email, '@', 1)), email, email_verified,
       case when role = 'admin' then 'admin' else 'user' end, is_super_user,
       case when is_super_user then effective_plan end, id, coalesce(created_at, now()), now()
  from c2c_import_users i
 where password_hash ~ '^[0-9a-f]{32}:[0-9a-f]{128}$'
on conflict do nothing;

insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
select gen_random_uuid()::text, u.id, 'credential', u.id, 'c2c-scrypt$' || i.password_hash, now(), now()
  from c2c_import_users i join "user" u on u.legacy_c2c_id = i.id
 where not exists (select 1 from account a where a.user_id = u.id and a.provider_id = 'credential');

insert into tenants (name, owner_user_id)
select u.name, u.id from "user" u where u.legacy_c2c_id is not null
on conflict do nothing;

-- C2C plan state is recorded, not granted: Eqence pricing is not decided yet.
insert into audit_log (tenant_id, actor_user_id, action, detail)
select t.id, null, 'c2c.account_migrated',
       jsonb_build_object('c2c_id', i.id, 'c2c_plan', i.plan, 'c2c_billing_status', i.billing_status,
                          'c2c_email_verified_unreliable', true)
  from c2c_import_users i join "user" u on u.legacy_c2c_id = i.id join tenants t on t.owner_user_id = u.id
 where not exists (select 1 from audit_log l where l.action = 'c2c.account_migrated' and (l.detail->>'c2c_id')::int = i.id);
commit;
SQL

"${PSQL[@]}" -d "$DST" -At -F ' | ' <<'SQL'
select 'source rows', count(*)::text from c2c_import_users
union all select 'skipped (unrecognised hash format)', count(*)::text from c2c_import_users where password_hash !~ '^[0-9a-f]{32}:[0-9a-f]{128}$'
union all select 'users with legacy id', count(*)::text from "user" where legacy_c2c_id is not null
union all select 'credential accounts with legacy hash', count(*)::text from account where password like 'c2c-scrypt$%'
union all select 'tenants for migrated users', count(*)::text from tenants t join "user" u on u.id = t.owner_user_id where u.legacy_c2c_id is not null
union all select 'super users', count(*)::text from "user" where is_super_user;
SQL
"${PSQL[@]}" -d "$DST" -c "drop table c2c_import_users"
