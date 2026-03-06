import { Hono } from "hono";
import type { AppEnv } from "../services/db";
import { requireProjectRole } from "../services/authz";

export const tasksRouter = new Hono<AppEnv>();

tasksRouter.use("/projects/:projectId/*", requireProjectRole("guest"));
tasksRouter.use("/projects/:projectId", requireProjectRole("guest"));

tasksRouter.get("/", (c) => {
  const auth = c.get("auth");
  return c.json({ ok: true, resource: "tasks", user: auth.user_id, company: auth.company_id });
});

tasksRouter.get("/projects/:projectId", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  const listId = c.req.query("listId") || null;
  const parsedLimit = Number(c.req.query("limit") ?? 100);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 100;

  let isSubcontractorOnList = false;
  if (listId) {
    const membership = await c.env.DB.prepare(
      `SELECT role
       FROM list_memberships
       WHERE list_id = ? AND user_id = ?
       LIMIT 1`
    )
      .bind(listId, auth.user_id)
      .first<{ role: string }>();

    isSubcontractorOnList = String(membership?.role || "").toLowerCase() === "subcontractor";
  }

  const filters = ["project_id = ?"];
  const params: unknown[] = [projectId];

  if (listId) {
    filters.push("list_id = ?");
    params.push(listId);
  }

  // Aproplan-like rule: subcontractor only sees tasks assigned to themselves on that list.
  if (isSubcontractorOnList) {
    filters.push("assigned_to_user_id = ?");
    params.push(auth.user_id);
  }

  const rows = await c.env.DB.prepare(
    `SELECT
      task_id,
      project_id,
      list_id,
      title,
      status,
      priority,
      due_date,
      assigned_to_user_id,
      created_at,
      updated_at
     FROM task
     WHERE ${filters.join(" AND ")}
     ORDER BY updated_at DESC
     LIMIT ?`
  )
    .bind(...params, limit)
    .all();

  return c.json({
    ok: true,
    projectId,
    listId,
    subcontractorFiltered: isSubcontractorOnList,
    count: rows.results.length,
    tasks: rows.results,
  });
});
