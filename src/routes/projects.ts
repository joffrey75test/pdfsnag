import { Hono } from "hono";
import type { AppEnv } from "../services/db";

export const projectsRouter = new Hono<AppEnv>();

projectsRouter.get("/", (c) => {
  const auth = c.get("auth");
  return c.json({ ok: true, resource: "projects", user: auth.user_id, company: auth.company_id });
});
