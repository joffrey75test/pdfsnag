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
  migrations/008_reconcile_legacy_to_canonical.sql \
  migrations/009_document_annotations.sql \
  migrations/010_drop_legacy_singular_tables.sql \
  migrations/011_updated_at_triggers.sql \
  migrations/012_status_timestamp_guards.sql \
  migrations/013_merge_folders_doc_folders.sql \
  migrations/014_rename_tenant_to_company.sql \
  migrations/015_authorship_to_actors.sql \
  migrations/016_document_annotations_add_document_id.sql \
  migrations/017_memberships_invited_by_actor.sql \
  migrations/018_rename_task_to_tasks.sql \
  migrations/019_documents_add_company_id.sql \
  migrations/020_business_constraints_hardening.sql \
  migrations/021_statuses_alignment.sql

do
  echo "--- applying ${f}"
  npx wrangler d1 execute "${DB_NAME}" --local --file="${f}"
done

echo "All local migrations applied successfully."
