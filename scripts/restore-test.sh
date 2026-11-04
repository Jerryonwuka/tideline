#!/usr/bin/env bash
# Backup restore test (§14): dump the app schemas, restore them into a fresh database, and compare
# row counts table by table. Locally it runs inside the Supabase Postgres container; for staging or
# production, restore the provider's backup into a scratch project and point SOURCE/TARGET at it
# (see docs/RUNBOOK.md → Backups). Prints a line to paste into the runbook's restore log.
set -euo pipefail

CONTAINER="${PG_CONTAINER:-supabase_db_tideline}"
SCRATCH="restore_test_$(date +%s)"
psqlc() { docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }

echo "Dumping public and private schemas from $CONTAINER..."
docker exec "$CONTAINER" pg_dump -U postgres -Fc -n public -n private -f "/tmp/$SCRATCH.dump" postgres
dump_size=$(docker exec "$CONTAINER" stat -c %s "/tmp/$SCRATCH.dump")

echo "Restoring into $SCRATCH..."
psqlc -c "create database $SCRATCH"
trap 'psqlc -c "drop database if exists $SCRATCH" >/dev/null; docker exec "$CONTAINER" rm -f "/tmp/$SCRATCH.dump"' EXIT
# Supabase roles and the auth/storage schemas live outside the dump; stub what the app schemas reference.
psqlc -d "$SCRATCH" <<'SQL'
create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create or replace function auth.role() returns text language sql stable as $$ select null::text $$;
SQL
# Account ids (only the ids) so foreign keys to auth.users restore and are checked.
psqlc -c "copy (select id from auth.users) to stdout" | psqlc -d "$SCRATCH" -c "copy auth.users (id) from stdin"
docker exec "$CONTAINER" pg_restore -U postgres -d "$SCRATCH" --no-owner --disable-triggers "/tmp/$SCRATCH.dump" 2> /tmp/restore-errors.log || true
# Expected locally: the public schema already exists, and default privileges belong to Supabase's
# own admin role. Anything else counts as a failure.
errors=$(grep "error:" /tmp/restore-errors.log | grep -v -e 'schema "public" already exists' -e 'change default privileges' | tee /dev/stderr | grep -c "error:" || true)

echo "Comparing row counts..."
tables=$(psqlc -c "select tablename from pg_tables where schemaname = 'public' order by 1")
mismatch=0
checked=0
for t in $tables; do
  a=$(psqlc -c "select count(*) from public.\"$t\"")
  b=$(psqlc -d "$SCRATCH" -c "select count(*) from public.\"$t\"" 2>/dev/null || echo "missing")
  checked=$((checked + 1))
  if [ "$a" != "$b" ]; then
    echo "  MISMATCH $t: source=$a restored=$b"
    mismatch=$((mismatch + 1))
  fi
done

result=$([ "$mismatch" = "0" ] && [ "$errors" = "0" ] && echo PASS || echo FAIL)
echo
echo "$(date -u +%Y-%m-%d) | local ($CONTAINER) | dump ${dump_size} bytes | ${checked} tables | ${mismatch} mismatches | ${errors} unexpected restore errors | $result"
[ "$result" = "PASS" ]
