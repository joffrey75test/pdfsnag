PRAGMA foreign_keys = OFF;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_project_company
  ON projects(project_id, company_id);

DROP TRIGGER IF EXISTS trg_documents_updated_at;
DROP TRIGGER IF EXISTS trg_documents_status_timestamps_guard_insert;
DROP TRIGGER IF EXISTS trg_documents_status_timestamps_guard_update;

ALTER TABLE documents RENAME TO documents_old_019;

CREATE TABLE documents (
  document_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  folder_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED','DELETED')),
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

INSERT INTO documents (
  document_id, company_id, project_id, folder_id, title, status, current_version_id,
  created_by_actor_id, created_at, updated_at, deleted_at, archived_at
)
SELECT
  d.document_id,
  p.company_id,
  d.project_id,
  d.folder_id,
  d.title,
  d.status,
  d.current_version_id,
  d.created_by_actor_id,
  d.created_at,
  d.updated_at,
  d.deleted_at,
  d.archived_at
FROM documents_old_019 d
JOIN projects p ON p.project_id = d.project_id;

DROP TABLE documents_old_019;

CREATE INDEX IF NOT EXISTS idx_documents_project_folder
  ON documents(project_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_company_project
  ON documents(company_id, project_id);

CREATE TRIGGER IF NOT EXISTS trg_documents_updated_at
AFTER UPDATE OF title, status, folder_id, current_version_id, deleted_at, archived_at ON documents
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE documents SET updated_at = datetime('now') WHERE document_id = NEW.document_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_status_timestamps_guard_insert
BEFORE INSERT ON documents
FOR EACH ROW
WHEN
  (NEW.deleted_at IS NOT NULL AND NEW.status != 'DELETED')
  OR (NEW.archived_at IS NOT NULL AND NEW.status != 'ARCHIVED')
BEGIN
  SELECT RAISE(ABORT, 'documents status must match deleted_at/archived_at');
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_status_timestamps_guard_update
BEFORE UPDATE ON documents
FOR EACH ROW
WHEN
  (NEW.deleted_at IS NOT NULL AND NEW.status != 'DELETED')
  OR (NEW.archived_at IS NOT NULL AND NEW.status != 'ARCHIVED')
BEGIN
  SELECT RAISE(ABORT, 'documents status must match deleted_at/archived_at');
END;

PRAGMA foreign_keys = ON;
