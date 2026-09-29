#!/usr/bin/env bash
# Deploys the committed state of the current branch to csb-fra. The build runs on the
# server (the workstation is memory-constrained); only committed source is sent.
#   bash infra/deploy.sh
# Touches only Eqence's own paths: /opt/eqence, /var/lib/eqence, /etc/eqence,
# /etc/systemd/system/eqence-*.service and /etc/nginx/sites-{available,enabled}/api.eqence.com.conf.
set -euo pipefail
HOST=csb-fra
cd "$(dirname "$0")/.."
REV=$(git rev-parse --short HEAD)
if [ -n "$(git status --porcelain -- apps packages infra pnpm-lock.yaml pnpm-workspace.yaml)" ]; then
  echo "refusing: uncommitted changes in deployable paths" >&2; exit 1
fi

git archive --format=tar.gz HEAD | ssh "$HOST" "REV=$REV bash -c '
set -euo pipefail
rm -rf /opt/eqence/build && mkdir -p /opt/eqence/build && tar -xzf - -C /opt/eqence/build
cd /opt/eqence/build
pnpm install --frozen-lockfile >/tmp/eqence-install.log 2>&1 || { tail -20 /tmp/eqence-install.log; exit 1; }
npx tsc -p tsconfig.server.json
pnpm --filter @eqence/api build >/dev/null
pnpm --filter @eqence/api migrate:build >/dev/null
pnpm --filter @eqence/worker build >/dev/null

id eqence >/dev/null 2>&1 || useradd --system --home /var/lib/eqence --shell /usr/sbin/nologin eqence
install -d -o eqence -g eqence -m 750 /var/lib/eqence /var/lib/eqence/files
REL=/opt/eqence/releases/\$(date -u +%Y%m%dT%H%M%SZ)-\$REV
install -d \$REL/api \$REL/worker \$REL/migrations
cp apps/api/dist/index.mjs apps/api/dist/migrate.mjs \$REL/api/
cp apps/worker/dist/index.mjs \$REL/worker/
cp -r packages/db/migrations/. \$REL/migrations/
chgrp eqence /etc/eqence /etc/eqence/api.env && chmod 750 /etc/eqence && chmod 640 /etc/eqence/api.env

# Migrations first; the API must never start against an older schema.
(set -a; . /etc/eqence/api.env; set +a; node \$REL/api/migrate.mjs \$REL/migrations)
ln -sfn \$REL/api /opt/eqence/api
ln -sfn \$REL/worker /opt/eqence/worker
install -m 644 infra/systemd/eqence-api.service infra/systemd/eqence-worker.service /etc/systemd/system/
# certbot edits the site file in place to add TLS, so it is installed once and never overwritten.
[ -e /etc/nginx/sites-available/api.eqence.com.conf ] || install -m 644 infra/nginx/api.eqence.com.conf /etc/nginx/sites-available/api.eqence.com.conf
[ -e /etc/nginx/sites-enabled/api.eqence.com.conf ] || ln -s /etc/nginx/sites-available/api.eqence.com.conf /etc/nginx/sites-enabled/api.eqence.com.conf
install -m 750 infra/migrate-c2c-users.sh /opt/eqence/migrate-c2c-users.sh
systemctl daemon-reload
systemctl enable eqence-api eqence-worker >/dev/null 2>&1
systemctl restart eqence-api eqence-worker
nginx -t 2>&1 | tail -1 && systemctl reload nginx
sleep 3
echo release: \$REL
systemctl is-active eqence-api eqence-worker
curl -s -w \" api /health %{http_code}\n\" http://127.0.0.1:4410/health
curl -s -w \" worker %{http_code}\n\" http://127.0.0.1:4420/
'"
