-- Folder-level visibility for GED documents

CREATE TABLE IF NOT EXISTS doc_folders (
  folder_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_folders_project_path
  ON doc_folders(project_id, path);

CREATE TABLE IF NOT EXISTS doc_folder_permissions (
  folder_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  can_read INTEGER NOT NULL DEFAULT 1 CHECK (can_read IN (0, 1)),
  can_write INTEGER NOT NULL DEFAULT 0 CHECK (can_write IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (folder_id, user_id),
  FOREIGN KEY (folder_id) REFERENCES doc_folders(folder_id),
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_folder_permissions_lookup
  ON doc_folder_permissions(project_id, user_id, can_read);

-- Backfill path for existing folders using folder tree (best effort).
WITH RECURSIVE folder_paths AS (
  SELECT
    f.id AS folder_id,
    f.project_id AS project_id,
    f.parent_id AS parent_id,
    '/' || REPLACE(TRIM(f.name), '/', '_') || '/' AS path
  FROM folders f
  WHERE f.parent_id IS NULL

  UNION ALL

  SELECT
    c.id AS folder_id,
    c.project_id AS project_id,
    c.parent_id AS parent_id,
    fp.path || REPLACE(TRIM(c.name), '/', '_') || '/' AS path
  FROM folders c
  JOIN folder_paths fp
    ON c.parent_id = fp.folder_id
   AND c.project_id = fp.project_id
)
INSERT OR IGNORE INTO doc_folders (folder_id, project_id, path, created_at)
SELECT folder_id, project_id, path, datetime('now')
FROM folder_paths;
