#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${1:-snag_db}"

echo "Running local D1 migrations on database: ${DB_NAME}"

for f in \
  migrations/001_ged_v0_hardening.sql \
  migrations/002_identity_and_org.sql \
  migrations/003_auth_coexistence.sql \
  migrations/004_domain_expansion.sql

do
  echo "--- applying ${f}"
  npx wrangler d1 execute "${DB_NAME}" --local --file="${f}"
done

echo "All local migrations applied successfully."
