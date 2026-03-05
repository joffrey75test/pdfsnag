PRAGMA foreign_keys = ON;

-- Phase 3: auth coexistence (token + user) support artifacts

CREATE TABLE IF NOT EXISTS auth_compat (
  auth_compat_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('token_only','user_only','mixed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  UNIQUE (project_id)
);

-- Extend audit for explicit actor typing in coexistence phase
ALTER TABLE audit_events ADD COLUMN actor_type TEXT;
ALTER TABLE audit_events ADD COLUMN actor_label TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_id, actor_type);

-- Default existing rows to token if unknown
UPDATE audit_events
SET actor_type = COALESCE(actor_type, 'token')
WHERE actor_type IS NULL;

-- Maintain updated_at on auth_compat
CREATE TRIGGER IF NOT EXISTS trg_auth_compat_updated_at
AFTER UPDATE ON auth_compat
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE auth_compat SET updated_at = datetime('now') WHERE auth_compat_id = NEW.auth_compat_id;
END;
