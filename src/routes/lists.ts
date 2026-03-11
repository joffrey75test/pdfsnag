import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../services/db";
import { hasAtLeastProjectRole } from "../services/authz";

type ListRow = {
  list_id: string;
  project_id: string;
  visibility: "public" | "private" | "shared";
};

async function getList(c: { env: AppEnv["Bindings"] }, listId: string) {
  return c.env.DB.prepare(
    `SELECT list_id, project_id, visibility
     FROM lists
     WHERE list_id = ?
     LIMIT 1`
  )
    .bind(listId)
    .first<ListRow>();
}

async function ensureUserActor(c: { env: AppEnv["Bindings"] }, userId: string, companyId: string) {
  const actorId = `user_${userId}`;
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO actors (id, company_id, type, label, created_at)
     VALUES (?, ?, 'user', ?, datetime('now'))`
  )
    .bind(actorId, companyId, `user:${userId}`)
    .run();
  return actorId;
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

listsRouter.get("/projects/:projectId", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");

  const projectMembership = await c.env.DB.prepare(
    `SELECT role
     FROM project_memberships
     WHERE project_id = ? AND user_id = ? AND status = 'active'
     LIMIT 1`
  )
    .bind(projectId, auth.user_id)
    .first<{ role: string }>();

  if (!projectMembership || !hasAtLeastProjectRole(projectMembership.role, "guest")) {
    return c.json({ ok: false, error: "No active project membership." }, 403);
  }

  const rows = await c.env.DB.prepare(
    `SELECT
       l.list_id,
       l.project_id,
       l.name,
       l.description,
       l.visibility,
       l.created_at,
       l.updated_at,
       COUNT(ld.document_id) AS document_count
     FROM lists l
     LEFT JOIN list_documents ld ON ld.list_id = l.list_id
     WHERE l.project_id = ?
     GROUP BY
       l.list_id, l.project_id, l.name, l.description, l.visibility,
       l.created_at, l.updated_at
     ORDER BY l.updated_at DESC, l.created_at DESC`
  )
    .bind(projectId)
    .all();

  return c.json({
    ok: true,
    projectId,
    role: projectMembership.role,
    lists: rows.results ?? [],
  });
});

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
    `SELECT d.document_id AS id, d.title, d.status, d.folder_id, d.current_version_id, d.created_at, d.updated_at
     FROM list_documents ld
     JOIN documents d ON d.document_id = ld.document_id
     WHERE ld.list_id = ? AND d.status != 'deleted'
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
     `SELECT document_id AS id, project_id
     FROM documents
     WHERE document_id = ? AND status != 'deleted'
     LIMIT 1`
  )
    .bind(documentId)
    .first<{ id: string; project_id: string }>();

  if (!doc) return c.json({ ok: false, error: "Document not found." }, 404);
  if (doc.project_id !== list.project_id) {
    return c.json({ ok: false, error: "Document and list must belong to the same project." }, 400);
  }

  const project = await c.env.DB.prepare(
    `SELECT company_id
     FROM projects
     WHERE project_id = ?
     LIMIT 1`
  )
    .bind(list.project_id)
    .first<{ company_id: string }>();
  if (!project?.company_id) {
    return c.json({ ok: false, error: "Project company not found." }, 404);
  }
  const actorId = await ensureUserActor(c, auth.user_id, project.company_id);
  const listDocumentId = `ld_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  try {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO list_documents (list_document_id, list_id, document_id, created_by_actor_id, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(listDocumentId, listId, documentId, actorId, now)
      .run();
  } catch {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO list_documents (list_document_id, list_id, document_id, created_by_user_id, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(listDocumentId, listId, documentId, auth.user_id, now)
      .run();
  }

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
