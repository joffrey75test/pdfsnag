PRAGMA foreign_keys = ON;

-- MVP Users + RBAC model (additive, compatible with existing schema)

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','invited','removed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS companies (
  company_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','removed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (invited_by_user_id) REFERENCES users(user_id),
  UNIQUE (company_id, user_id)
);

-- Existing projects table uses primary key "id"
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
  FOREIGN KEY (project_id) REFERENCES projects(id),
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
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS list_memberships (
  list_membership_id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('collaborator','guest','subcontractor')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
CREATE INDEX IF NOT EXISTS idx_invites_scope
  ON invite_tokens(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_invites_email
  ON invite_tokens(email);
CREATE INDEX IF NOT EXISTS idx_invites_expires
  ON invite_tokens(expires_at);
