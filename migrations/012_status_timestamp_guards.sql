PRAGMA foreign_keys = ON;

CREATE TRIGGER IF NOT EXISTS trg_documents_status_timestamps_guard_insert
BEFORE INSERT ON documents
FOR EACH ROW
WHEN
  (NEW.deleted_at IS NOT NULL AND NEW.status != 'DELETED')
  OR (NEW.archived_at IS NOT NULL AND NEW.status != 'ARCHIVED')
BEGIN
  SELECT RAISE(ABORT, 'documents status must match deleted_at/archived_at');
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_status_timestamps_guard_update
BEFORE UPDATE ON documents
FOR EACH ROW
WHEN
  (NEW.deleted_at IS NOT NULL AND NEW.status != 'DELETED')
  OR (NEW.archived_at IS NOT NULL AND NEW.status != 'ARCHIVED')
BEGIN
  SELECT RAISE(ABORT, 'documents status must match deleted_at/archived_at');
END;
