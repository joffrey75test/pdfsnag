PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS trg_doc_folders_updated_at;

ALTER TABLE folders ADD COLUMN path TEXT;

UPDATE folders
SET path = (
  SELECT df.path
  FROM doc_folders df
  WHERE df.folder_id = folders.id
    AND df.project_id = folders.project_id
  LIMIT 1
)
WHERE path IS NULL;

UPDATE folders
SET path = '/' || REPLACE(TRIM(name), '/', '_') || '/'
WHERE path IS NULL OR TRIM(path) = '';

CREATE TABLE doc_folder_permissions_new (
  folder_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  can_read INTEGER NOT NULL DEFAULT 1 CHECK (can_read IN (0, 1)),
  can_write INTEGER NOT NULL DEFAULT 0 CHECK (can_write IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (folder_id, user_id),
  FOREIGN KEY (folder_id) REFERENCES folders(id),
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

INSERT INTO doc_folder_permissions_new (
  folder_id, project_id, user_id, can_read, can_write, created_at, updated_at
)
SELECT folder_id, project_id, user_id, can_read, can_write, created_at, updated_at
FROM doc_folder_permissions;

DROP TABLE doc_folder_permissions;
ALTER TABLE doc_folder_permissions_new RENAME TO doc_folder_permissions;

CREATE INDEX IF NOT EXISTS idx_doc_folder_permissions_lookup
  ON doc_folder_permissions(project_id, user_id, can_read);
CREATE INDEX IF NOT EXISTS idx_folders_project_path
  ON folders(project_id, path);

DROP TABLE IF EXISTS doc_folders;

PRAGMA foreign_keys = ON;
