PRAGMA foreign_keys = OFF;

-- Simplification: remove legacy singular auth/org/list tables.
-- Canonical tables kept by runtime are pluralized (users, companies, ...).
DROP TABLE IF EXISTS list_membership;
DROP TABLE IF EXISTS list;
DROP TABLE IF EXISTS project_membership;
DROP TABLE IF EXISTS company_membership;
DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS company;

PRAGMA foreign_keys = ON;
