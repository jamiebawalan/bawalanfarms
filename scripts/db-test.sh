#!/usr/bin/env bash
# Applies every migration to a throwaway database and runs the rule tests.
# The tests prove the database refuses the things that corrupted the old
# spreadsheet, so they run against real Postgres rather than a mock.
#
#   PGURL="-h /tmp -p 5433 -U postgres" ./scripts/db-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PG="${PGURL:-}"
DB="${TESTDB:-farm_rules_test}"

psql $PG -d postgres -q -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null ||
  { psql $PG -d postgres -q -c "drop database if exists $DB"; psql $PG -d postgres -q -c "create database $DB"; }
trap 'psql $PG -d postgres -q -c "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT

for f in supabase/migrations/*.sql; do
  psql $PG -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done

out=""
for suite in supabase/tests/*.test.sql; do
  out="$out"$'\n'"$(psql $PG -d "$DB" -v ON_ERROR_STOP=1 -q -f "$suite" 2>&1 || true)"
done
echo "$out" | sed -n 's/.*NOTICE:  //p'
if echo "$out" | grep -q 'ERROR'; then
  echo; echo "$out" | grep -B2 -A6 'ERROR'; exit 1
fi
echo
echo "$(echo "$out" | grep -c 'NOTICE:  ok ') checks passed"
