PRAGMA foreign_keys = OFF;

-- Rename legacy tenant_id columns to company_id on existing databases.
ALTER TABLE actors RENAME COLUMN tenant_id TO company_id;
ALTER TABLE project_tokens RENAME COLUMN tenant_id TO company_id;
ALTER TABLE folders RENAME COLUMN tenant_id TO company_id;
ALTER TABLE document_versions RENAME COLUMN tenant_id TO company_id;
ALTER TABLE audit_events RENAME COLUMN tenant_id TO company_id;

-- Normalize index names/definitions after column rename.
DROP INDEX IF EXISTS idx_document_versions_tenant_project_doc;
DROP INDEX IF EXISTS idx_folders_tenant_project;
DROP INDEX IF EXISTS idx_project_tokens_tenant_project_scope;
DROP INDEX IF EXISTS idx_audit_events_tenant_project;

CREATE INDEX IF NOT EXISTS idx_document_versions_company_project_doc
  ON document_versions(company_id, project_id, document_id);
CREATE INDEX IF NOT EXISTS idx_folders_company_project
  ON folders(company_id, project_id);
CREATE INDEX IF NOT EXISTS idx_project_tokens_company_project_scope
  ON project_tokens(company_id, project_id, scope);
CREATE INDEX IF NOT EXISTS idx_audit_events_company_project
  ON audit_events(company_id, project_id);

PRAGMA foreign_keys = ON;
