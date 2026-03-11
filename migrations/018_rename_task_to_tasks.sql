PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS trg_task_updated_at;
DROP TRIGGER IF EXISTS trg_tasks_updated_at;

ALTER TABLE task RENAME TO tasks;

DROP INDEX IF EXISTS idx_task_project;
DROP INDEX IF EXISTS idx_task_list;
CREATE INDEX IF NOT EXISTS idx_tasks_project
  ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_list
  ON tasks(list_id);

CREATE TRIGGER IF NOT EXISTS trg_tasks_updated_at
AFTER UPDATE ON tasks
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE tasks SET updated_at = datetime('now') WHERE task_id = NEW.task_id;
END;

PRAGMA foreign_keys = ON;
