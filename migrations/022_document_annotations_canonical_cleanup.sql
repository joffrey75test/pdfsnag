PRAGMA foreign_keys = OFF;

ALTER TABLE document_annotations RENAME TO document_annotations_old_022;

INSERT OR IGNORE INTO actors (id, company_id, type, label, created_at)
SELECT DISTINCT
  'user_' || da.author_user_id AS id,
  p.company_id,
  'user' AS type,
  'user:' || da.author_user_id AS label,
  COALESCE(u.created_at, datetime('now')) AS created_at
FROM document_annotations_old_022 da
JOIN projects p ON p.project_id = da.project_id
LEFT JOIN users u ON u.user_id = da.author_user_id;

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
  annotation_id,
  document_version_id,
  document_id,
  project_id,
  created_by_actor_id,
  page,
  type,
  payload_json,
  status,
  created_at,
  updated_at
)
SELECT
  da.annotation_id,
  da.document_version_id,
  dv.document_id,
  da.project_id,
  'user_' || da.author_user_id AS created_by_actor_id,
  da.page,
  da.type,
  da.payload_json,
  CASE LOWER(COALESCE(da.status, 'draft'))
    WHEN 'draft' THEN 'open'
    WHEN 'review' THEN 'open'
    WHEN 'approved' THEN 'resolved'
    WHEN 'archived' THEN 'archived'
    ELSE 'open'
  END AS status,
  da.created_at,
  da.updated_at
FROM document_annotations_old_022 da
JOIN document_versions dv ON dv.document_version_id = da.document_version_id;

DROP TABLE document_annotations_old_022;

CREATE INDEX IF NOT EXISTS idx_document_annotations_document
  ON document_annotations(document_id, created_at);
CREATE INDEX IF NOT EXISTS idx_document_annotations_document_status
  ON document_annotations(document_id, status);
CREATE INDEX IF NOT EXISTS idx_document_annotations_project_document_status_time
  ON document_annotations(project_id, document_id, status, created_at);

DROP TRIGGER IF EXISTS trg_document_annotations_updated_at;
CREATE TRIGGER trg_document_annotations_updated_at
AFTER UPDATE ON document_annotations
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE document_annotations SET updated_at = datetime('now') WHERE annotation_id = NEW.annotation_id;
END;

DROP TRIGGER IF EXISTS trg_document_annotations_document_version_update_guard;
CREATE TRIGGER trg_document_annotations_document_version_update_guard
BEFORE UPDATE OF document_version_id ON document_annotations
FOR EACH ROW
WHEN NEW.document_version_id != OLD.document_version_id
BEGIN
  SELECT RAISE(ABORT, 'document_version_id is immutable once annotation is created');
END;

DROP TRIGGER IF EXISTS trg_document_annotations_status_transition_guard;
CREATE TRIGGER trg_document_annotations_status_transition_guard
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
