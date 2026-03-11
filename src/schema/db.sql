PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  archived_at TEXT,
  UNIQUE(project_id, company_id)
);

CREATE TABLE IF NOT EXISTS actors (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('system','token','user')),
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_tokens (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('read','write')),
  name TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (actor_id) REFERENCES actors(id),
  UNIQUE(company_id, project_id, token_hash),
  UNIQUE(token_hash)
);

CREATE INDEX IF NOT EXISTS idx_project_tokens_lookup
  ON project_tokens(company_id, project_id, token_hash);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  path TEXT NOT NULL DEFAULT '/',
  name TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  archived_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (parent_id) REFERENCES folders(id),
  FOREIGN KEY (created_by_actor_id) REFERENCES actors(id),
  UNIQUE(company_id, project_id, parent_id, name),
  UNIQUE(project_id, path)
);

CREATE INDEX IF NOT EXISTS idx_folders_project_parent
  ON folders(company_id, project_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_project_path
  ON folders(project_id, path);

CREATE TABLE IF NOT EXISTS documents (
  document_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  folder_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','deleted')),
  current_version_id TEXT,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  archived_at TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (project_id, company_id) REFERENCES projects(project_id, company_id),
  FOREIGN KEY (folder_id) REFERENCES folders(id),
  FOREIGN KEY (created_by_actor_id) REFERENCES actors(id),
  FOREIGN KEY (current_version_id) REFERENCES document_versions(document_version_id)
);

CREATE INDEX IF NOT EXISTS idx_documents_project_folder
  ON documents(project_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_company_project
  ON documents(company_id, project_id);

CREATE TABLE IF NOT EXISTS document_versions (
  document_version_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK(version_number >= 1),
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT,
  UNIQUE(document_id, version_number),
  UNIQUE(document_version_id, document_id),
  FOREIGN KEY (document_id) REFERENCES documents(document_id),
  FOREIGN KEY (created_by_actor_id) REFERENCES actors(id)
);

CREATE INDEX IF NOT EXISTS idx_versions_document
  ON document_versions(document_id);

CREATE TABLE IF NOT EXISTS document_annotations (
  annotation_id TEXT PRIMARY KEY,
  document_version_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','resolved','hidden','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_version_id, document_id) REFERENCES document_versions(document_version_id, document_id),
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (created_by_actor_id) REFERENCES actors(id)
);

CREATE INDEX IF NOT EXISTS idx_document_annotations_document
  ON document_annotations(document_id, created_at);

CREATE INDEX IF NOT EXISTS idx_document_annotations_document_status
  ON document_annotations(document_id, status);

CREATE INDEX IF NOT EXISTS idx_document_annotations_project_document_status_time
  ON document_annotations(project_id, document_id, status, created_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
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
  ON audit_events(company_id, project_id, created_at);

CREATE TRIGGER IF NOT EXISTS trg_documents_updated_at
AFTER UPDATE OF title, status, folder_id, current_version_id, deleted_at, archived_at ON documents
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE documents SET updated_at = datetime('now') WHERE document_id = NEW.document_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_projects_updated_at
AFTER UPDATE ON projects
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE projects SET updated_at = datetime('now') WHERE project_id = NEW.project_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_folders_updated_at
AFTER UPDATE ON folders
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE folders SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_document_versions_updated_at
AFTER UPDATE ON document_versions
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE document_versions SET updated_at = datetime('now') WHERE document_version_id = NEW.document_version_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_document_annotations_updated_at
AFTER UPDATE ON document_annotations
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE document_annotations SET updated_at = datetime('now') WHERE annotation_id = NEW.annotation_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_document_annotations_document_version_update_guard
BEFORE UPDATE OF document_version_id ON document_annotations
FOR EACH ROW
WHEN NEW.document_version_id != OLD.document_version_id
BEGIN
  SELECT RAISE(ABORT, 'document_version_id is immutable once annotation is created');
END;

CREATE TRIGGER IF NOT EXISTS trg_document_annotations_status_transition_guard
BEFORE UPDATE OF status ON document_annotations
FOR EACH ROW
WHEN NEW.status != OLD.status
  AND NOT (
    (OLD.status = 'open' AND NEW.status IN ('resolved', 'hidden', 'archived'))
    OR (OLD.status = 'resolved' AND NEW.status IN ('hidden', 'archived'))
    OR (OLD.status = 'hidden' AND NEW.status = 'archived')
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid status transition for document_annotations');
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_status_timestamps_guard_insert
BEFORE INSERT ON documents
FOR EACH ROW
WHEN
  (NEW.deleted_at IS NOT NULL AND NEW.status != 'deleted')
  OR (NEW.archived_at IS NOT NULL AND NEW.status != 'archived')
BEGIN
  SELECT RAISE(ABORT, 'documents status must match deleted_at/archived_at');
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_status_timestamps_guard_update
BEFORE UPDATE ON documents
FOR EACH ROW
WHEN
  (NEW.deleted_at IS NOT NULL AND NEW.status != 'deleted')
  OR (NEW.archived_at IS NOT NULL AND NEW.status != 'archived')
BEGIN
  SELECT RAISE(ABORT, 'documents status must match deleted_at/archived_at');
END;
