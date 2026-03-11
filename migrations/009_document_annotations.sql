PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS document_annotations;

CREATE TABLE document_annotations (
  annotation_id TEXT PRIMARY KEY,
  document_version_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','review','approved','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_version_id) REFERENCES document_versions(document_version_id),
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (author_user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_document_annotations_document
  ON document_annotations(document_version_id, created_at);

CREATE INDEX IF NOT EXISTS idx_document_annotations_document_status
  ON document_annotations(document_version_id, status);

CREATE INDEX IF NOT EXISTS idx_document_annotations_project
  ON document_annotations(project_id, document_version_id);
