#!/bin/sh
# Runs the integration tests against a real PostgreSQL. Usage:
#   DATABASE_URL=postgres://user@host:port/eqence_test pnpm --filter ./apps/api test:int
# Use a throwaway database: the tests create and delete their own rows. Apply the
# schema first with: node --import tsx src/migrate.ts ../../packages/db/migrations
# Every outside service (Judge.me, the AI provider) is stubbed inside the tests; the
# values below are test-only settings, never real credentials.
set -eu
: "${DATABASE_URL:?set DATABASE_URL to a throwaway test database}"
cd "$(dirname "$0")/.."
FILE_DIR="$(mktemp -d)"
trap 'rm -rf "$FILE_DIR"' EXIT
export FILE_DIR
export AUTH_RATE_LIMIT=off              # ratelimit.int.test.ts turns it back on for itself
export PRICING_LADDER=site
export HUB_PARTNER_SECRET=test-only-partner-secret-not-real
exec node --import tsx --test --test-concurrency=1 test-int/*.int.test.ts
