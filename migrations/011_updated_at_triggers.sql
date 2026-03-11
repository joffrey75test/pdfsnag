PRAGMA foreign_keys = ON;

DROP TRIGGER IF EXISTS trg_documents_updated_at;

CREATE TRIGGER IF NOT EXISTS trg_projects_updated_at
AFTER UPDATE ON projects
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE projects SET updated_at = datetime('now') WHERE project_id = NEW.project_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_companies_updated_at
AFTER UPDATE ON companies
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE companies SET updated_at = datetime('now') WHERE company_id = NEW.company_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_company_memberships_updated_at
AFTER UPDATE ON company_memberships
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE company_memberships SET updated_at = datetime('now') WHERE company_membership_id = NEW.company_membership_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_project_memberships_updated_at
AFTER UPDATE ON project_memberships
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE project_memberships SET updated_at = datetime('now') WHERE project_membership_id = NEW.project_membership_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_lists_updated_at
AFTER UPDATE ON lists
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE lists SET updated_at = datetime('now') WHERE list_id = NEW.list_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_list_memberships_updated_at
AFTER UPDATE ON list_memberships
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE list_memberships SET updated_at = datetime('now') WHERE list_membership_id = NEW.list_membership_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_folders_updated_at
AFTER UPDATE ON folders
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE folders SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_updated_at
AFTER UPDATE ON documents
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE documents SET updated_at = datetime('now') WHERE document_id = NEW.document_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_document_versions_updated_at
AFTER UPDATE ON document_versions
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE document_versions SET updated_at = datetime('now') WHERE document_version_id = NEW.document_version_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_doc_folder_permissions_updated_at
AFTER UPDATE ON doc_folder_permissions
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE doc_folder_permissions
  SET updated_at = datetime('now')
  WHERE folder_id = NEW.folder_id AND user_id = NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_updated_at
AFTER UPDATE ON tasks
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE tasks SET updated_at = datetime('now') WHERE task_id = NEW.task_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_invite_tokens_updated_at
AFTER UPDATE ON invite_tokens
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE invite_tokens SET updated_at = datetime('now') WHERE invite_id = NEW.invite_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_document_annotations_updated_at
AFTER UPDATE ON document_annotations
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE document_annotations SET updated_at = datetime('now') WHERE annotation_id = NEW.annotation_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_document_annotations_document_version_update_guard
BEFORE UPDATE OF document_version_id ON document_annotations
FOR EACH ROW
WHEN NEW.document_version_id != OLD.document_version_id
BEGIN
  SELECT RAISE(ABORT, 'document_version_id is immutable once annotation is created');
END;

CREATE TRIGGER IF NOT EXISTS trg_document_annotations_status_transition_guard
BEFORE UPDATE OF status ON document_annotations
FOR EACH ROW
WHEN NEW.status != OLD.status
  AND NOT (
    (OLD.status = 'draft' AND NEW.status IN ('review', 'archived'))
    OR (OLD.status = 'review' AND NEW.status IN ('approved', 'archived'))
    OR (OLD.status = 'approved' AND NEW.status = 'archived')
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid status transition for document_annotations');
END;
