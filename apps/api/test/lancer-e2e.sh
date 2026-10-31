#!/usr/bin/env bash
# Tests e2e de l'API sur une base PostgreSQL jetable : cluster créé dans /tmp, migrations
# appliquées par Prisma, puis supprimé à la fin. N'utilise jamais la base de développement.
set -euo pipefail
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8

ICI="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d /tmp/gt.XXXXXX)"
PORT=54331
trap 'pg_ctl -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

initdb -D "$TMP/data" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" start >/dev/null || { cat "$TMP/log"; exit 1; }
createdb -h "$TMP" -p "$PORT" -U postgres geotopo_test

cd "$ICI"
export NODE_ENV=test
export DATABASE_URL="postgresql://postgres@localhost:$PORT/geotopo_test?host=$TMP"
export JWT_SECRET="secret-de-test-secret-de-test-secret-de-test"
export ORIGINE_WEB="http://localhost:3001"
npx --no-install prisma migrate deploy >/dev/null
npx --no-install vitest run --config ./vitest.config.e2e.ts "$@"
