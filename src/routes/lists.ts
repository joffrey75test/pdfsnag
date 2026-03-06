import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../services/db";
import { hasAtLeastProjectRole } from "../services/authz";

type ListRow = {
  list_id: string;
  project_id: string;
  visibility: "public" | "private" | "shared";
  created_by_user_id: string;
};

async function getList(c: { env: AppEnv["Bindings"] }, listId: string) {
  return c.env.DB.prepare(
    `SELECT list_id, project_id, visibility, created_by_user_id
     FROM lists
     WHERE list_id = ?
     LIMIT 1`
  )
    .bind(listId)
    .first<ListRow>();
}

async function canManageListDocuments(c: { env: AppEnv["Bindings"]; get: (k: "auth") => AppEnv["Variables"]["auth"] }, list: ListRow) {
  const auth = c.get("auth");

  const listMembership = await c.env.DB.prepare(
    `SELECT role
     FROM list_memberships
     WHERE list_id = ? AND user_id = ?
     LIMIT 1`
  )
    .bind(list.list_id, auth.user_id)
    .first<{ role: string }>();

  if (String(listMembership?.role || "").toLowerCase() === "collaborator") return true;

  const projectMembership = await c.env.DB.prepare(
    `SELECT role
     FROM project_memberships
     WHERE project_id = ? AND user_id = ? AND status = 'active'
     LIMIT 1`
  )
    .bind(list.project_id, auth.user_id)
    .first<{ role: string }>();

  return hasAtLeastProjectRole(String(projectMembership?.role || ""), "manager");
}

export const listsRouter = new Hono<AppEnv>();

listsRouter.get("/:listId/documents", async (c) => {
  const auth = c.get("auth");
  const listId = c.req.param("listId");

  const list = await getList(c, listId);
  if (!list) return c.json({ ok: false, error: "List not found." }, 404);

  const rows = await c.env.DB.prepare(
    `SELECT role
     FROM project_memberships
     WHERE project_id = ? AND user_id = ? AND status = 'active'
     LIMIT 1`
  )
    .bind(list.project_id, auth.user_id)
    .first<{ role: string }>();

  if (!rows || !hasAtLeastProjectRole(rows.role, "guest")) {
    return c.json({ ok: false, error: "No active project membership." }, 403);
  }

  const docs = await c.env.DB.prepare(
    `SELECT d.id, d.title, d.status, d.folder_id, d.current_version_id, d.created_at, d.updated_at
     FROM list_documents ld
     JOIN documents d ON d.id = ld.document_id
     WHERE ld.list_id = ? AND d.status != 'DELETED'
     ORDER BY d.updated_at DESC`
  )
    .bind(listId)
    .all();

  return c.json({
    ok: true,
    list: {
      listId: list.list_id,
      projectId: list.project_id,
      visibility: list.visibility,
    },
    documents: docs.results ?? [],
  });
});

async function linkDocumentToList(c: Context<AppEnv>, listId: string, documentId: string) {
  const auth = c.get("auth");

  const list = await getList(c, listId);
  if (!list) return c.json({ ok: false, error: "List not found." }, 404);

  const allowed = await canManageListDocuments(c, list);
  if (!allowed) return c.json({ ok: false, error: "Insufficient role to link documents on this list." }, 403);

  const doc = await c.env.DB.prepare(
    `SELECT id, project_id
     FROM documents
     WHERE id = ? AND status != 'DELETED'
     LIMIT 1`
  )
    .bind(documentId)
    .first<{ id: string; project_id: string }>();

  if (!doc) return c.json({ ok: false, error: "Document not found." }, 404);
  if (doc.project_id !== list.project_id) {
    return c.json({ ok: false, error: "Document and list must belong to the same project." }, 400);
  }

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO list_documents (list_document_id, list_id, document_id, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(`ld_${crypto.randomUUID()}`, listId, documentId, auth.user_id, new Date().toISOString())
    .run();

  return c.json({ ok: true, listId, documentId, linked: true }, 201);
}

listsRouter.post("/:listId/documents", async (c) => {
  const listId = c.req.param("listId");
  const body = await c.req.json().catch(() => null);
  const documentId = (body as { documentId?: unknown } | null)?.documentId;
  if (typeof documentId !== "string" || !documentId.trim()) {
    return c.json({ ok: false, error: "documentId is required." }, 400);
  }
  return linkDocumentToList(c, listId, documentId.trim());
});

listsRouter.post("/:listId/documents/:documentId", async (c) => {
  const auth = c.get("auth");
  const listId = c.req.param("listId");
  const documentId = c.req.param("documentId");
  if (!auth?.user_id) return c.json({ ok: false, error: "Authentication required." }, 401);
  return linkDocumentToList(c, listId, documentId);
});

listsRouter.delete("/:listId/documents/:documentId", async (c) => {
  const listId = c.req.param("listId");
  const documentId = c.req.param("documentId");

  const list = await getList(c, listId);
  if (!list) return c.json({ ok: false, error: "List not found." }, 404);

  const allowed = await canManageListDocuments(c, list);
  if (!allowed) return c.json({ ok: false, error: "Insufficient role to unlink documents on this list." }, 403);

  await c.env.DB.prepare("DELETE FROM list_documents WHERE list_id = ? AND document_id = ?")
    .bind(listId, documentId)
    .run();

  return c.json({ ok: true, listId, documentId, linked: false });
});
