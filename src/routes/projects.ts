import { Hono } from "hono";
import type { AppEnv } from "../services/db";
import { requireProjectRole } from "../services/authz";

export const projectsRouter = new Hono<AppEnv>();

projectsRouter.get("/", (c) => {
  const auth = c.get("auth");
  return c.json({ ok: true, resource: "projects", user: auth.user_id, company: auth.company_id });
});

projectsRouter.get("/:projectId/permissions", requireProjectRole("guest"), (c) => {
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
