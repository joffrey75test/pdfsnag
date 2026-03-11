PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_tokens_token_hash_unique
  ON project_tokens(token_hash);

DROP TRIGGER IF EXISTS trg_document_versions_version_number_guard_insert;
CREATE TRIGGER IF NOT EXISTS trg_document_versions_version_number_guard_insert
BEFORE INSERT ON document_versions
FOR EACH ROW
WHEN NEW.version_number < 1
BEGIN
  SELECT RAISE(ABORT, 'document_versions.version_number must be >= 1');
END;

DROP TRIGGER IF EXISTS trg_document_versions_version_number_guard_update;
CREATE TRIGGER IF NOT EXISTS trg_document_versions_version_number_guard_update
BEFORE UPDATE OF version_number ON document_versions
FOR EACH ROW
WHEN NEW.version_number < 1
BEGIN
  SELECT RAISE(ABORT, 'document_versions.version_number must be >= 1');
END;

DROP TRIGGER IF EXISTS trg_doc_folder_permissions_bounds_guard_insert;
CREATE TRIGGER IF NOT EXISTS trg_doc_folder_permissions_bounds_guard_insert
BEFORE INSERT ON doc_folder_permissions
FOR EACH ROW
WHEN NEW.can_read NOT IN (0, 1) OR NEW.can_write NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'doc_folder_permissions can_read/can_write must be 0 or 1');
END;

DROP TRIGGER IF EXISTS trg_doc_folder_permissions_bounds_guard_update;
CREATE TRIGGER IF NOT EXISTS trg_doc_folder_permissions_bounds_guard_update
BEFORE UPDATE OF can_read, can_write ON doc_folder_permissions
FOR EACH ROW
WHEN NEW.can_read NOT IN (0, 1) OR NEW.can_write NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'doc_folder_permissions can_read/can_write must be 0 or 1');
END;
