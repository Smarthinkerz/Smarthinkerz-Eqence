#!/usr/bin/env bash
# Builds the API and worker into single-file bundles and installs them on csb-fra.
# Run from the repo root on the build machine:  bash infra/deploy.sh
# Touches only Eqence's own paths: /opt/eqence, /var/lib/eqence, /etc/eqence,
# /etc/systemd/system/eqence-*.service and /etc/nginx/sites-{available,enabled}/api.eqence.com.conf.
set -euo pipefail
HOST=csb-fra
cd "$(dirname "$0")/.."

pnpm --filter @eqence/api build
pnpm --filter @eqence/api migrate:build
pnpm --filter @eqence/worker build

STAGE=$(mktemp -d)
mkdir -p "$STAGE/api" "$STAGE/worker" "$STAGE/migrations"
cp apps/api/dist/index.mjs apps/api/dist/migrate.mjs "$STAGE/api/"
cp apps/worker/dist/index.mjs "$STAGE/worker/"
cp -r packages/db/migrations/. "$STAGE/migrations/"
cp infra/systemd/eqence-api.service infra/systemd/eqence-worker.service infra/nginx/api.eqence.com.conf infra/migrate-c2c-users.sh "$STAGE/"
tar -C "$STAGE" -czf "$STAGE.tgz" .

scp -q "$STAGE.tgz" "$HOST:/tmp/eqence-release.tgz"
ssh "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
id eqence >/dev/null 2>&1 || useradd --system --home /var/lib/eqence --shell /usr/sbin/nologin eqence
install -d -o eqence -g eqence -m 750 /var/lib/eqence /var/lib/eqence/files
install -d -m 755 /opt/eqence
REL=/opt/eqence/releases/$(date -u +%Y%m%dT%H%M%SZ)
install -d "$REL" && tar -C "$REL" -xzf /tmp/eqence-release.tgz && rm /tmp/eqence-release.tgz
chmod 640 /etc/eqence/api.env && chgrp eqence /etc/eqence/api.env && chmod 750 /etc/eqence && chgrp eqence /etc/eqence
# Migrations first; the API must never start against an older schema.
set -a; . /etc/eqence/api.env; set +a
node "$REL/api/migrate.mjs" "$REL/migrations"
ln -sfn "$REL/api" /opt/eqence/api
ln -sfn "$REL/worker" /opt/eqence/worker
install -m 644 "$REL/eqence-api.service" "$REL/eqence-worker.service" /etc/systemd/system/
# certbot edits this file in place to add TLS, so it is installed once and never overwritten.
[ -e /etc/nginx/sites-available/api.eqence.com.conf ] || install -m 644 "$REL/api.eqence.com.conf" /etc/nginx/sites-available/api.eqence.com.conf
[ -e /etc/nginx/sites-enabled/api.eqence.com.conf ] || ln -s /etc/nginx/sites-available/api.eqence.com.conf /etc/nginx/sites-enabled/api.eqence.com.conf
install -m 750 "$REL/migrate-c2c-users.sh" /opt/eqence/migrate-c2c-users.sh
systemctl daemon-reload
systemctl enable --now eqence-api eqence-worker >/dev/null
systemctl restart eqence-api eqence-worker
nginx -t && systemctl reload nginx
sleep 2
echo "release: $REL"
systemctl is-active eqence-api eqence-worker
curl -s -o /dev/null -w "api /health %{http_code}\n" http://127.0.0.1:4410/health
curl -s -o /dev/null -w "worker health %{http_code}\n" http://127.0.0.1:4420/
REMOTE
rm -rf "$STAGE" "$STAGE.tgz"
