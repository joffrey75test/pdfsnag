PRAGMA foreign_keys = OFF;

-- Ensure actors exist for historical user-authored rows.
INSERT OR IGNORE INTO actors (id, company_id, type, label, created_at)
SELECT DISTINCT
  'user_' || l.created_by_user_id,
  p.company_id,
  'user',
  'user:' || l.created_by_user_id,
  datetime('now')
FROM lists l
JOIN projects p ON p.project_id = l.project_id
WHERE l.created_by_user_id IS NOT NULL AND TRIM(l.created_by_user_id) != '';

INSERT OR IGNORE INTO actors (id, company_id, type, label, created_at)
SELECT DISTINCT
  'user_' || ld.created_by_user_id,
  p.company_id,
  'user',
  'user:' || ld.created_by_user_id,
  datetime('now')
FROM list_documents ld
JOIN lists l ON l.list_id = ld.list_id
JOIN projects p ON p.project_id = l.project_id
WHERE ld.created_by_user_id IS NOT NULL AND TRIM(ld.created_by_user_id) != '';

INSERT OR IGNORE INTO actors (id, company_id, type, label, created_at)
SELECT DISTINCT
  'user_' || it.invited_by_user_id,
  CASE
    WHEN it.scope_type = 'company' THEN it.scope_id
    WHEN it.scope_type = 'project' THEN p_proj.company_id
    WHEN it.scope_type = 'list' THEN p_list.company_id
    ELSE NULL
  END,
  'user',
  'user:' || it.invited_by_user_id,
  datetime('now')
FROM invite_tokens it
LEFT JOIN projects p_proj
  ON p_proj.project_id = it.scope_id
 AND it.scope_type = 'project'
LEFT JOIN lists l
  ON l.list_id = it.scope_id
 AND it.scope_type = 'list'
LEFT JOIN projects p_list
  ON p_list.project_id = l.project_id
WHERE it.invited_by_user_id IS NOT NULL
  AND TRIM(it.invited_by_user_id) != ''
  AND (
    (it.scope_type = 'company' AND it.scope_id IS NOT NULL AND TRIM(it.scope_id) != '')
    OR (it.scope_type = 'project' AND p_proj.company_id IS NOT NULL)
    OR (it.scope_type = 'list' AND p_list.company_id IS NOT NULL)
  );

INSERT OR IGNORE INTO actors (id, company_id, type, label, created_at)
SELECT DISTINCT
  'user_' || da.author_user_id,
  p.company_id,
  'user',
  'user:' || da.author_user_id,
  datetime('now')
FROM document_annotations da
JOIN projects p ON p.project_id = da.project_id
WHERE da.author_user_id IS NOT NULL AND TRIM(da.author_user_id) != '';

ALTER TABLE lists RENAME TO lists_old_015;
CREATE TABLE lists (
  list_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private','shared')),
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  archived_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (created_by_actor_id) REFERENCES actors(id)
);
INSERT INTO lists (
  list_id, project_id, name, visibility, created_by_actor_id, created_at, updated_at, deleted_at, archived_at
)
SELECT
  list_id,
  project_id,
  name,
  visibility,
  'user_' || created_by_user_id,
  created_at,
  updated_at,
  deleted_at,
  archived_at
FROM lists_old_015;
DROP TABLE lists_old_015;
CREATE INDEX IF NOT EXISTS idx_lists_project ON lists(project_id);

ALTER TABLE list_documents RENAME TO list_documents_old_015;
CREATE TABLE list_documents (
  list_document_id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (list_id) REFERENCES lists(list_id),
  FOREIGN KEY (document_id) REFERENCES documents(document_id),
  FOREIGN KEY (created_by_actor_id) REFERENCES actors(id),
  UNIQUE (list_id, document_id)
);
INSERT INTO list_documents (list_document_id, list_id, document_id, created_by_actor_id, created_at)
SELECT
  list_document_id,
  list_id,
  document_id,
  'user_' || created_by_user_id,
  created_at
FROM list_documents_old_015;
DROP TABLE list_documents_old_015;
CREATE INDEX IF NOT EXISTS idx_list_documents_document ON list_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_list_documents_list ON list_documents(list_id);

ALTER TABLE invite_tokens RENAME TO invite_tokens_old_015;
CREATE TABLE invite_tokens (
  invite_id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('company','project','list')),
  scope_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_actor_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invited_by_actor_id) REFERENCES actors(id)
);
INSERT INTO invite_tokens (
  invite_id, scope_type, scope_id, email, role, token_hash, invited_by_actor_id, expires_at, accepted_at, revoked_at, created_at, updated_at
)
SELECT
  invite_id,
  scope_type,
  scope_id,
  email,
  role,
  token_hash,
  'user_' || invited_by_user_id,
  expires_at,
  accepted_at,
  revoked_at,
  created_at,
  updated_at
FROM invite_tokens_old_015;
DROP TABLE invite_tokens_old_015;
CREATE INDEX IF NOT EXISTS idx_invites_scope ON invite_tokens(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invite_tokens(email);
CREATE INDEX IF NOT EXISTS idx_invites_expires ON invite_tokens(expires_at);

ALTER TABLE document_annotations RENAME TO document_annotations_old_015;
CREATE TABLE document_annotations (
  annotation_id TEXT PRIMARY KEY,
  document_version_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','review','approved','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_version_id) REFERENCES document_versions(document_version_id),
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (created_by_actor_id) REFERENCES actors(id)
);
INSERT INTO document_annotations (
  annotation_id, document_version_id, project_id, created_by_actor_id, page, type, payload_json, status, created_at, updated_at
)
SELECT
  annotation_id,
  document_version_id,
  project_id,
  'user_' || author_user_id,
  page,
  type,
  payload_json,
  status,
  created_at,
  updated_at
FROM document_annotations_old_015;
DROP TABLE document_annotations_old_015;
CREATE INDEX IF NOT EXISTS idx_document_annotations_document
  ON document_annotations(document_version_id, created_at);
CREATE INDEX IF NOT EXISTS idx_document_annotations_document_status
  ON document_annotations(document_version_id, status);
CREATE INDEX IF NOT EXISTS idx_document_annotations_project
  ON document_annotations(project_id, document_version_id);

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
    (OLD.status = 'draft' AND NEW.status IN ('review', 'archived'))
    OR (OLD.status = 'review' AND NEW.status IN ('approved', 'archived'))
    OR (OLD.status = 'approved' AND NEW.status = 'archived')
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid status transition for document_annotations');
END;

PRAGMA foreign_keys = ON;
