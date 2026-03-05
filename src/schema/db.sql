PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS actors (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('system','token','user')),
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_tokens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('read','write')),
  name TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (actor_id) REFERENCES actors(id),
  UNIQUE(tenant_id, project_id, token_hash)
);

CREATE INDEX IF NOT EXISTS idx_project_tokens_lookup
  ON project_tokens(tenant_id, project_id, token_hash);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (parent_id) REFERENCES folders(id),
  FOREIGN KEY (created_by_actor_id) REFERENCES actors(id),
  UNIQUE(tenant_id, project_id, parent_id, name)
);

CREATE INDEX IF NOT EXISTS idx_folders_project_parent
  ON folders(tenant_id, project_id, parent_id);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  folder_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED','DELETED')),
  current_version_id TEXT,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (folder_id) REFERENCES folders(id),
  FOREIGN KEY (created_by_actor_id) REFERENCES actors(id),
  FOREIGN KEY (current_version_id) REFERENCES document_versions(id)
);

CREATE INDEX IF NOT EXISTS idx_documents_project_folder
  ON documents(tenant_id, project_id, folder_id);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(document_id, version_number),
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (created_by_actor_id) REFERENCES actors(id)
);

CREATE INDEX IF NOT EXISTS idx_versions_document
  ON document_versions(document_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (actor_id) REFERENCES actors(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_project_time
  ON audit_events(tenant_id, project_id, created_at);

CREATE TRIGGER IF NOT EXISTS trg_documents_updated_at
AFTER UPDATE OF title, status, folder_id, current_version_id ON documents
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE documents SET updated_at = datetime('now') WHERE id = NEW.id;
END;
