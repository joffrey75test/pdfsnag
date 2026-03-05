PRAGMA foreign_keys = ON;

-- Phase 1: hardening on existing GED v0 schema (additive, idempotent)

CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_project_status ON documents(tenant_id, project_id, status);
CREATE INDEX IF NOT EXISTS idx_document_versions_tenant_project_doc ON document_versions(tenant_id, project_id, document_id);
CREATE INDEX IF NOT EXISTS idx_folders_tenant_project ON folders(tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_project_tokens_tenant_project_scope ON project_tokens(tenant_id, project_id, scope);
CREATE INDEX IF NOT EXISTS idx_project_tokens_revoked_at ON project_tokens(revoked_at);
CREATE INDEX IF NOT EXISTS idx_project_tokens_expires_at ON project_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_project ON audit_events(tenant_id, project_id);

-- Optional guardrails on value domains
CREATE TRIGGER IF NOT EXISTS trg_project_tokens_scope_guard
BEFORE INSERT ON project_tokens
FOR EACH ROW
WHEN NEW.scope NOT IN ('read', 'write')
BEGIN
  SELECT RAISE(ABORT, 'project_tokens.scope must be read|write');
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_status_guard
BEFORE INSERT ON documents
FOR EACH ROW
WHEN NEW.status NOT IN ('ACTIVE', 'ARCHIVED', 'DELETED')
BEGIN
  SELECT RAISE(ABORT, 'documents.status must be ACTIVE|ARCHIVED|DELETED');
END;
