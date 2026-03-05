PRAGMA foreign_keys = ON;

-- Phase 2: introduce company/user/memberships (additive)

CREATE TABLE IF NOT EXISTS company (
  company_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  plan_tier TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS company_membership (
  company_membership_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  company_role TEXT NOT NULL CHECK (company_role IN ('owner','admin','member','guest')),
  status TEXT NOT NULL CHECK (status IN ('invited','active','suspended','removed')),
  invited_by_user_id TEXT,
  invited_at TEXT,
  joined_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (company_id) REFERENCES company(company_id),
  FOREIGN KEY (user_id) REFERENCES user(user_id),
  FOREIGN KEY (invited_by_user_id) REFERENCES user(user_id),
  UNIQUE (company_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_membership (
  project_membership_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  project_role TEXT NOT NULL CHECK (project_role IN ('admin','manager','collaborator','guest','subcontractor')),
  status TEXT NOT NULL CHECK (status IN ('invited','active','removed')),
  invited_by_user_id TEXT,
  invited_at TEXT,
  joined_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (user_id) REFERENCES user(user_id),
  FOREIGN KEY (invited_by_user_id) REFERENCES user(user_id),
  UNIQUE (project_id, user_id)
);

-- Add company_id to legacy projects (tenant_id remains for compatibility)
ALTER TABLE projects ADD COLUMN company_id TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_company_membership_company_user ON company_membership(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_project_membership_project_user ON project_membership(project_id, user_id);

-- Backfill company from existing tenant_id (one company per tenant)
INSERT OR IGNORE INTO company (company_id, name, status, plan_tier)
SELECT DISTINCT tenant_id, tenant_id, 'active', 'starter'
FROM projects
WHERE tenant_id IS NOT NULL;

UPDATE projects
SET company_id = tenant_id
WHERE company_id IS NULL;
