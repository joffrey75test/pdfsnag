PRAGMA foreign_keys = ON;

-- Link GED documents to collaboration lists/channels
CREATE TABLE IF NOT EXISTS list_documents (
  list_document_id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (list_id) REFERENCES lists(list_id),
  FOREIGN KEY (document_id) REFERENCES documents(document_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id),
  UNIQUE (list_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_list_documents_document
  ON list_documents(document_id);

CREATE INDEX IF NOT EXISTS idx_list_documents_list
  ON list_documents(list_id);
