import { Hono } from "hono";
import type { AppEnv } from "../services/db";
import { requireProjectRole } from "../services/authz";

export const projectsRouter = new Hono<AppEnv>();

projectsRouter.use("/:projectId/*", requireProjectRole("guest"));
projectsRouter.use("/:projectId", requireProjectRole("guest"));

projectsRouter.get("/", (c) => {
  const auth = c.get("auth");
  return c.json({ ok: true, resource: "projects", user: auth.user_id, company: auth.company_id });
});

projectsRouter.get("/:projectId/permissions", (c) => {
  const auth = c.get("auth");
  const role = c.get("projectRole");
  return c.json({
    ok: true,
    projectId: c.req.param("projectId"),
    userId: auth.user_id,
    role,
    canRead: true,
  });
});

projectsRouter.patch("/:projectId/settings", requireProjectRole("manager"), async (c) => {
  const role = c.get("projectRole");
  const payload = await c.req.json().catch(() => null);
  return c.json({
    ok: true,
    projectId: c.req.param("projectId"),
    appliedByRole: role,
    updated: payload ?? {},
  });
});

projectsRouter.post("/:projectId/doc-folders/:folderId/permissions", requireProjectRole("manager"), async (c) => {
  const projectId = c.req.param("projectId");
  const folderId = c.req.param("folderId");
  const body = await c.req.json().catch(() => null);

  const userId = (body as { userId?: unknown } | null)?.userId;
  const canReadRaw = (body as { canRead?: unknown } | null)?.canRead;
  const canWriteRaw = (body as { canWrite?: unknown } | null)?.canWrite;

  if (typeof userId !== "string" || !userId.trim()) {
    return c.json({ ok: false, error: "userId is required." }, 400);
  }

  const canRead = canReadRaw === undefined ? 1 : canReadRaw ? 1 : 0;
  const canWrite = canWriteRaw === undefined ? 0 : canWriteRaw ? 1 : 0;

  const folder = await c.env.DB.prepare(
    `SELECT folder_id
     FROM doc_folders
     WHERE folder_id = ? AND project_id = ?
     LIMIT 1`
  )
    .bind(folderId, projectId)
    .first<{ folder_id: string }>();

  if (!folder?.folder_id) return c.json({ ok: false, error: "Folder not found in doc_folders." }, 404);

  await c.env.DB.prepare(
    `INSERT INTO doc_folder_permissions (folder_id, project_id, user_id, can_read, can_write, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(folder_id, user_id)
     DO UPDATE SET
       can_read = excluded.can_read,
       can_write = excluded.can_write,
       updated_at = datetime('now')`
  )
    .bind(folderId, projectId, userId.trim(), canRead, canWrite)
    .run();

  return c.json({ ok: true, projectId, folderId, userId: userId.trim(), canRead: Boolean(canRead), canWrite: Boolean(canWrite) }, 201);
});

projectsRouter.get("/:projectId/doc-folders/permissions", requireProjectRole("manager"), async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.req.query("userId") || null;
  const folderId = c.req.query("folderId") || null;

  const filters = ["p.project_id = ?"];
  const params: unknown[] = [projectId];

  if (userId) {
    filters.push("p.user_id = ?");
    params.push(userId);
  }
  if (folderId) {
    filters.push("p.folder_id = ?");
    params.push(folderId);
  }

  const rows = await c.env.DB.prepare(
    `SELECT p.project_id, p.folder_id, f.path, p.user_id, p.can_read, p.can_write, p.created_at, p.updated_at
     FROM doc_folder_permissions p
     JOIN doc_folders f ON f.folder_id = p.folder_id AND f.project_id = p.project_id
     WHERE ${filters.join(" AND ")}
     ORDER BY f.path ASC, p.user_id ASC`
  )
    .bind(...params)
    .all();

  return c.json({ ok: true, projectId, permissions: rows.results ?? [] });
});
