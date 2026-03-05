import { Hono } from "hono";
import type { AppEnv } from "../services/db";

export const syncRouter = new Hono<AppEnv>();

syncRouter.get("/", (c) => {
  const auth = c.get("auth");
  return c.json({ ok: true, resource: "sync", user: auth.user_id, company: auth.company_id, syncedAt: new Date().toISOString() });
});
