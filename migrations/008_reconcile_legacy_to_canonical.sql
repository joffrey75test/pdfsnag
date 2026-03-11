PRAGMA foreign_keys = ON;

-- Reconciliation migration:
-- - keeps canonical plural tables as source of truth
-- - safely imports legacy singular tables if they exist
-- - creates missing runtime tables used by current API

-- 1) Ensure canonical auth/RBAC tables exist (idempotent).
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','invited','removed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  deleted_at TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS companies (
  company_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','removed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS company_memberships (
  company_membership_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  status TEXT NOT NULL CHECK (status IN ('invited','active','suspended','removed')),
  invited_by_user_id TEXT,
  invited_at TEXT,
  joined_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (invited_by_user_id) REFERENCES users(user_id),
  UNIQUE (company_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_memberships (
  project_membership_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','collaborator','guest')),
  status TEXT NOT NULL CHECK (status IN ('invited','active','removed')),
  invited_by_user_id TEXT,
  invited_at TEXT,
  joined_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (invited_by_user_id) REFERENCES users(user_id),
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS lists (
  list_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private','shared')),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  archived_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS list_memberships (
  list_membership_id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('collaborator','guest','subcontractor')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (list_id) REFERENCES lists(list_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  UNIQUE (list_id, user_id)
);

CREATE TABLE IF NOT EXISTS invite_tokens (
  invite_id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('company','project','list')),
  scope_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invited_by_user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_memberships_company_user
  ON company_memberships(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_project_memberships_project_user
  ON project_memberships(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_lists_project
  ON lists(project_id);
CREATE INDEX IF NOT EXISTS idx_list_memberships_list_user
  ON list_memberships(list_id, user_id);

-- 2) Ensure runtime support tables exist (if a DB missed some old migrations).
CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  list_id TEXT,
  occurrence_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT,
  due_date TEXT,
  assigned_to_user_id TEXT,
  created_by_user_id TEXT,
  x_norm REAL,
  y_norm REAL,
  page_index INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_project
  ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_list
  ON tasks(list_id);

CREATE TABLE IF NOT EXISTS doc_folders (
  folder_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  archived_at TEXT,
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

CREATE TABLE IF NOT EXISTS list_documents (
  list_document_id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (list_id) REFERENCES lists(list_id),
  FOREIGN KEY (document_id) REFERENCES documents(document_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id),
  UNIQUE (list_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_list_documents_document
  ON list_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_list_documents_list
  ON list_documents(list_id);

-- 3) Create safe stubs for legacy singular tables when absent.
CREATE TABLE IF NOT EXISTS user (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  status TEXT,
  created_at TEXT,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS company (
  company_id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS company_membership (
  company_membership_id TEXT PRIMARY KEY,
  company_id TEXT,
  user_id TEXT,
  company_role TEXT,
  status TEXT,
  invited_by_user_id TEXT,
  invited_at TEXT,
  joined_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS project_membership (
  project_membership_id TEXT PRIMARY KEY,
  project_id TEXT,
  user_id TEXT,
  project_role TEXT,
  status TEXT,
  invited_by_user_id TEXT,
  invited_at TEXT,
  joined_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS list (
  list_id TEXT PRIMARY KEY,
  project_id TEXT,
  name TEXT,
  visibility TEXT,
  created_by_user_id TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS list_membership (
  list_membership_id TEXT PRIMARY KEY,
  list_id TEXT,
  user_id TEXT,
  list_role TEXT,
  created_at TEXT
);

-- 4) Seed a deterministic system user for fallback ownership.
INSERT OR IGNORE INTO users (user_id, email, full_name, password_hash, status, created_at)
VALUES ('system', 'system@local.invalid', 'System', 'system_disabled', 'active', datetime('now'));

-- 5) Import legacy -> canonical (best effort, idempotent).
INSERT OR IGNORE INTO users (user_id, email, full_name, password_hash, status, created_at, last_login_at)
SELECT
  u.user_id,
  LOWER(COALESCE(NULLIF(TRIM(u.email), ''), u.user_id || '@local.invalid')),
  u.full_name,
  'legacy_migrated',
  COALESCE(NULLIF(TRIM(u.status), ''), 'active'),
  COALESCE(NULLIF(TRIM(u.created_at), ''), datetime('now')),
  u.last_login_at
FROM user u
WHERE u.user_id IS NOT NULL AND TRIM(u.user_id) != '';

INSERT OR IGNORE INTO companies (company_id, name, status, created_at)
SELECT
  c.company_id,
  COALESCE(NULLIF(TRIM(c.name), ''), c.company_id),
  COALESCE(NULLIF(TRIM(c.status), ''), 'active'),
  COALESCE(NULLIF(TRIM(c.created_at), ''), datetime('now'))
FROM company c
WHERE c.company_id IS NOT NULL AND TRIM(c.company_id) != '';

INSERT OR IGNORE INTO company_memberships (
  company_membership_id, company_id, user_id, role, status, invited_by_user_id, invited_at, joined_at, created_at
)
SELECT
  COALESCE(NULLIF(TRIM(cm.company_membership_id), ''), 'cm_' || lower(hex(randomblob(16)))),
  cm.company_id,
  cm.user_id,
  CASE LOWER(COALESCE(cm.company_role, 'member'))
    WHEN 'owner' THEN 'owner'
    WHEN 'admin' THEN 'admin'
    ELSE 'member'
  END,
  CASE LOWER(COALESCE(cm.status, 'active'))
    WHEN 'invited' THEN 'invited'
    WHEN 'active' THEN 'active'
    WHEN 'suspended' THEN 'suspended'
    WHEN 'removed' THEN 'removed'
    ELSE 'active'
  END,
  cm.invited_by_user_id,
  cm.invited_at,
  cm.joined_at,
  COALESCE(NULLIF(TRIM(cm.created_at), ''), datetime('now'))
FROM company_membership cm
WHERE cm.company_id IS NOT NULL AND TRIM(cm.company_id) != ''
  AND cm.user_id IS NOT NULL AND TRIM(cm.user_id) != '';

INSERT OR IGNORE INTO project_memberships (
  project_membership_id, project_id, user_id, role, status, invited_by_user_id, invited_at, joined_at, created_at
)
SELECT
  COALESCE(NULLIF(TRIM(pm.project_membership_id), ''), 'pm_' || lower(hex(randomblob(16)))),
  pm.project_id,
  pm.user_id,
  CASE LOWER(COALESCE(pm.project_role, 'guest'))
    WHEN 'admin' THEN 'admin'
    WHEN 'manager' THEN 'manager'
    WHEN 'collaborator' THEN 'collaborator'
    WHEN 'subcontractor' THEN 'collaborator'
    ELSE 'guest'
  END,
  CASE LOWER(COALESCE(pm.status, 'active'))
    WHEN 'invited' THEN 'invited'
    WHEN 'active' THEN 'active'
    WHEN 'removed' THEN 'removed'
    ELSE 'active'
  END,
  pm.invited_by_user_id,
  pm.invited_at,
  pm.joined_at,
  COALESCE(NULLIF(TRIM(pm.created_at), ''), datetime('now'))
FROM project_membership pm
WHERE pm.project_id IS NOT NULL AND TRIM(pm.project_id) != ''
  AND pm.user_id IS NOT NULL AND TRIM(pm.user_id) != '';

INSERT OR IGNORE INTO lists (
  list_id, project_id, name, visibility, created_by_user_id, created_at
)
SELECT
  l.list_id,
  l.project_id,
  COALESCE(NULLIF(TRIM(l.name), ''), l.list_id),
  CASE LOWER(COALESCE(l.visibility, 'shared'))
    WHEN 'public' THEN 'public'
    WHEN 'private' THEN 'private'
    ELSE 'shared'
  END,
  COALESCE(NULLIF(TRIM(l.created_by_user_id), ''), 'system'),
  COALESCE(NULLIF(TRIM(l.created_at), ''), datetime('now'))
FROM list l
WHERE l.list_id IS NOT NULL AND TRIM(l.list_id) != ''
  AND l.project_id IS NOT NULL AND TRIM(l.project_id) != '';

INSERT OR IGNORE INTO list_memberships (
  list_membership_id, list_id, user_id, role, created_at
)
SELECT
  COALESCE(NULLIF(TRIM(lm.list_membership_id), ''), 'lm_' || lower(hex(randomblob(16)))),
  lm.list_id,
  lm.user_id,
  CASE LOWER(COALESCE(lm.list_role, 'guest'))
    WHEN 'subcontractor' THEN 'subcontractor'
    WHEN 'guest' THEN 'guest'
    ELSE 'collaborator'
  END,
  COALESCE(NULLIF(TRIM(lm.created_at), ''), datetime('now'))
FROM list_membership lm
WHERE lm.list_id IS NOT NULL AND TRIM(lm.list_id) != ''
  AND lm.user_id IS NOT NULL AND TRIM(lm.user_id) != '';

-- 6) Best-effort backfill doc_folders from folders when missing.
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
