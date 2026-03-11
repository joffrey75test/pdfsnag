PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS trg_users_updated_at;
DROP TRIGGER IF EXISTS trg_company_memberships_updated_at;
DROP TRIGGER IF EXISTS trg_project_memberships_updated_at;
DROP TRIGGER IF EXISTS trg_documents_updated_at;
DROP TRIGGER IF EXISTS trg_documents_status_timestamps_guard_insert;
DROP TRIGGER IF EXISTS trg_documents_status_timestamps_guard_update;
DROP TRIGGER IF EXISTS trg_document_annotations_updated_at;
DROP TRIGGER IF EXISTS trg_document_annotations_document_version_update_guard;
DROP TRIGGER IF EXISTS trg_document_annotations_status_transition_guard;

ALTER TABLE users RENAME TO users_old_021;
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  deleted_at TEXT,
  archived_at TEXT
);
INSERT INTO users (user_id, email, full_name, password_hash, status, created_at, updated_at, last_login_at, deleted_at, archived_at)
SELECT
  user_id,
  email,
  full_name,
  password_hash,
  CASE LOWER(COALESCE(status, 'active'))
    WHEN 'active' THEN 'active'
    WHEN 'invited' THEN 'invited'
    WHEN 'suspended' THEN 'suspended'
    WHEN 'archived' THEN 'archived'
    WHEN 'removed' THEN 'archived'
    ELSE 'active'
  END,
  created_at,
  updated_at,
  last_login_at,
  deleted_at,
  archived_at
FROM users_old_021;
DROP TABLE users_old_021;

ALTER TABLE company_memberships RENAME TO company_memberships_old_021;
CREATE TABLE company_memberships (
  company_membership_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  status TEXT NOT NULL CHECK (status IN ('invited','active','revoked')),
  invited_by_actor_id TEXT,
  invited_at TEXT,
  joined_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (invited_by_actor_id) REFERENCES actors(id),
  UNIQUE (company_id, user_id)
);
INSERT INTO company_memberships (
  company_membership_id, company_id, user_id, role, status, invited_by_actor_id, invited_at, joined_at, created_at, updated_at, deleted_at
)
SELECT
  company_membership_id,
  company_id,
  user_id,
  role,
  CASE LOWER(COALESCE(status, 'active'))
    WHEN 'invited' THEN 'invited'
    WHEN 'active' THEN 'active'
    WHEN 'revoked' THEN 'revoked'
    WHEN 'suspended' THEN 'revoked'
    WHEN 'removed' THEN 'revoked'
    ELSE 'active'
  END,
  invited_by_actor_id,
  invited_at,
  joined_at,
  created_at,
  updated_at,
  deleted_at
FROM company_memberships_old_021;
DROP TABLE company_memberships_old_021;
CREATE INDEX IF NOT EXISTS idx_company_memberships_company_user
  ON company_memberships(company_id, user_id);

ALTER TABLE project_memberships RENAME TO project_memberships_old_021;
CREATE TABLE project_memberships (
  project_membership_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','collaborator','guest')),
  status TEXT NOT NULL CHECK (status IN ('invited','active','revoked')),
  invited_by_actor_id TEXT,
  invited_at TEXT,
  joined_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (invited_by_actor_id) REFERENCES actors(id),
  UNIQUE (project_id, user_id)
);
INSERT INTO project_memberships (
  project_membership_id, project_id, user_id, role, status, invited_by_actor_id, invited_at, joined_at, created_at, updated_at, deleted_at
)
SELECT
  project_membership_id,
  project_id,
  user_id,
  role,
  CASE LOWER(COALESCE(status, 'active'))
    WHEN 'invited' THEN 'invited'
    WHEN 'active' THEN 'active'
    WHEN 'revoked' THEN 'revoked'
    WHEN 'removed' THEN 'revoked'
    ELSE 'active'
  END,
  invited_by_actor_id,
  invited_at,
  joined_at,
  created_at,
  updated_at,
  deleted_at
FROM project_memberships_old_021;
DROP TABLE project_memberships_old_021;
CREATE INDEX IF NOT EXISTS idx_project_memberships_project_user
  ON project_memberships(project_id, user_id);

ALTER TABLE documents RENAME TO documents_old_021;
CREATE TABLE documents (
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
INSERT INTO documents (
  document_id, company_id, project_id, folder_id, title, status, current_version_id, created_by_actor_id, created_at, updated_at, deleted_at, archived_at
)
SELECT
  document_id,
  company_id,
  project_id,
  folder_id,
  title,
  CASE LOWER(COALESCE(status, 'active'))
    WHEN 'active' THEN 'active'
    WHEN 'archived' THEN 'archived'
    WHEN 'deleted' THEN 'deleted'
    ELSE 'active'
  END,
  current_version_id,
  created_by_actor_id,
  created_at,
  updated_at,
  deleted_at,
  archived_at
FROM documents_old_021;
DROP TABLE documents_old_021;
CREATE INDEX IF NOT EXISTS idx_documents_project_folder
  ON documents(project_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_company_project
  ON documents(company_id, project_id);

ALTER TABLE document_annotations RENAME TO document_annotations_old_021;
CREATE TABLE document_annotations (
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
INSERT INTO document_annotations (
  annotation_id, document_version_id, document_id, project_id, created_by_actor_id, page, type, payload_json, status, created_at, updated_at
)
SELECT
  annotation_id,
  document_version_id,
  document_id,
  project_id,
  created_by_actor_id,
  page,
  type,
  payload_json,
  CASE LOWER(COALESCE(status, 'open'))
    WHEN 'open' THEN 'open'
    WHEN 'resolved' THEN 'resolved'
    WHEN 'hidden' THEN 'hidden'
    WHEN 'archived' THEN 'archived'
    WHEN 'draft' THEN 'open'
    WHEN 'review' THEN 'open'
    WHEN 'approved' THEN 'resolved'
    WHEN 'active' THEN 'open'
    WHEN 'deleted' THEN 'hidden'
    ELSE 'open'
  END,
  created_at,
  updated_at
FROM document_annotations_old_021;
DROP TABLE document_annotations_old_021;
CREATE INDEX IF NOT EXISTS idx_document_annotations_document
  ON document_annotations(document_id, created_at);
CREATE INDEX IF NOT EXISTS idx_document_annotations_document_status
  ON document_annotations(document_id, status);
CREATE INDEX IF NOT EXISTS idx_document_annotations_project_document_status_time
  ON document_annotations(project_id, document_id, status, created_at);

CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_company_memberships_updated_at
AFTER UPDATE ON company_memberships
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE company_memberships SET updated_at = datetime('now') WHERE company_membership_id = NEW.company_membership_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_project_memberships_updated_at
AFTER UPDATE ON project_memberships
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE project_memberships SET updated_at = datetime('now') WHERE project_membership_id = NEW.project_membership_id;
END;

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

PRAGMA foreign_keys = ON;
