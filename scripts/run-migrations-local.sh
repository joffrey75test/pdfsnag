#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${1:-snag_db}"

echo "Running local D1 migrations on database: ${DB_NAME}"

# Canonical baseline (idempotent)
echo "--- applying src/schema/db.sql"
npx wrangler d1 execute "${DB_NAME}" --local --file="src/schema/db.sql"

for f in \
  migrations/001_ged_v0_hardening.sql \
  migrations/005_users_rbac_mvp.sql \
  migrations/006_doc_folder_permissions.sql \
  migrations/007_list_documents.sql \
  migrations/008_reconcile_legacy_to_canonical.sql

do
  echo "--- applying ${f}"
  npx wrangler d1 execute "${DB_NAME}" --local --file="${f}"
done

echo "All local migrations applied successfully."
