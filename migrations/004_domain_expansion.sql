PRAGMA foreign_keys = ON;

-- Phase 4: target domain model expansion (lists/tasks/offline/files abstraction)

CREATE TABLE IF NOT EXISTS list (
  list_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private','shared')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (created_by_user_id) REFERENCES user(user_id)
);

CREATE TABLE IF NOT EXISTS list_membership (
  list_membership_id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  list_role TEXT NOT NULL CHECK (list_role IN ('admin','manager','collaborator','guest','subcontractor')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (list_id) REFERENCES list(list_id),
  FOREIGN KEY (user_id) REFERENCES user(user_id),
  UNIQUE (list_id, user_id)
);

CREATE TABLE IF NOT EXISTS list_occurrence (
  occurrence_id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  occurrence_index INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_user_id TEXT,
  FOREIGN KEY (list_id) REFERENCES list(list_id),
  FOREIGN KEY (created_by_user_id) REFERENCES user(user_id),
  UNIQUE (list_id, occurrence_index)
);

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
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (list_id) REFERENCES list(list_id),
  FOREIGN KEY (occurrence_id) REFERENCES list_occurrence(occurrence_id),
  FOREIGN KEY (assigned_to_user_id) REFERENCES user(user_id),
  FOREIGN KEY (created_by_user_id) REFERENCES user(user_id)
);

CREATE TABLE IF NOT EXISTS task_events (
  task_event_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  actor_user_id TEXT,
  type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(task_id),
  FOREIGN KEY (actor_user_id) REFERENCES user(user_id)
);

CREATE TABLE IF NOT EXISTS tag (
  tag_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (task_id, tag_id),
  FOREIGN KEY (task_id) REFERENCES tasks(task_id),
  FOREIGN KEY (tag_id) REFERENCES tag(tag_id)
);

-- File abstraction for multi-entity linking
CREATE TABLE IF NOT EXISTS file_object (
  file_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_user_id TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (created_by_user_id) REFERENCES user(user_id),
  UNIQUE (r2_key)
);

-- Offline sync dedup
CREATE TABLE IF NOT EXISTS device (
  device_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT,
  FOREIGN KEY (user_id) REFERENCES user(user_id)
);

CREATE TABLE IF NOT EXISTS processed_event (
  processed_event_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (device_id) REFERENCES device(device_id),
  UNIQUE (device_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_task_events_task_time ON task_events(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_file_object_project ON file_object(project_id);
CREATE INDEX IF NOT EXISTS idx_processed_event_device ON processed_event(device_id);
