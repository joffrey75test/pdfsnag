PRAGMA foreign_keys = OFF;

INSERT OR IGNORE INTO actors (id, company_id, type, label, created_at)
SELECT DISTINCT
  'user_' || cm.invited_by_user_id,
  cm.company_id,
  'user',
  'user:' || cm.invited_by_user_id,
  datetime('now')
FROM company_memberships cm
WHERE cm.invited_by_user_id IS NOT NULL AND TRIM(cm.invited_by_user_id) != '';

INSERT OR IGNORE INTO actors (id, company_id, type, label, created_at)
SELECT DISTINCT
  'user_' || pm.invited_by_user_id,
  p.company_id,
  'user',
  'user:' || pm.invited_by_user_id,
  datetime('now')
FROM project_memberships pm
JOIN projects p ON p.project_id = pm.project_id
WHERE pm.invited_by_user_id IS NOT NULL AND TRIM(pm.invited_by_user_id) != '';

ALTER TABLE company_memberships RENAME TO company_memberships_old_017;
CREATE TABLE company_memberships (
  company_membership_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  status TEXT NOT NULL CHECK (status IN ('invited','active','suspended','removed')),
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
  status,
  CASE
    WHEN invited_by_user_id IS NULL OR TRIM(invited_by_user_id) = '' THEN NULL
    ELSE 'user_' || invited_by_user_id
  END,
  invited_at,
  joined_at,
  created_at,
  updated_at,
  deleted_at
FROM company_memberships_old_017;
DROP TABLE company_memberships_old_017;
CREATE INDEX IF NOT EXISTS idx_company_memberships_company_user
  ON company_memberships(company_id, user_id);

ALTER TABLE project_memberships RENAME TO project_memberships_old_017;
CREATE TABLE project_memberships (
  project_membership_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','collaborator','guest')),
  status TEXT NOT NULL CHECK (status IN ('invited','active','removed')),
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
  status,
  CASE
    WHEN invited_by_user_id IS NULL OR TRIM(invited_by_user_id) = '' THEN NULL
    ELSE 'user_' || invited_by_user_id
  END,
  invited_at,
  joined_at,
  created_at,
  updated_at,
  deleted_at
FROM project_memberships_old_017;
DROP TABLE project_memberships_old_017;
CREATE INDEX IF NOT EXISTS idx_project_memberships_project_user
  ON project_memberships(project_id, user_id);

DROP TRIGGER IF EXISTS trg_company_memberships_updated_at;
CREATE TRIGGER IF NOT EXISTS trg_company_memberships_updated_at
AFTER UPDATE ON company_memberships
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE company_memberships SET updated_at = datetime('now') WHERE company_membership_id = NEW.company_membership_id;
END;

DROP TRIGGER IF EXISTS trg_project_memberships_updated_at;
CREATE TRIGGER IF NOT EXISTS trg_project_memberships_updated_at
AFTER UPDATE ON project_memberships
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE project_memberships SET updated_at = datetime('now') WHERE project_membership_id = NEW.project_membership_id;
END;

PRAGMA foreign_keys = ON;
