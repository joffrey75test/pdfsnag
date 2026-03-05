import { Hono } from "hono";
import type { AppEnv } from "../services/db";

export const tasksRouter = new Hono<AppEnv>();

tasksRouter.get("/", (c) => {
  const auth = c.get("auth");
  return c.json({ ok: true, resource: "tasks", user: auth.user_id, company: auth.company_id });
});
