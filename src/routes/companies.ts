import { Hono } from "hono";
import type { AppEnv } from "../services/db";
import { requireCompanyRole } from "../services/authz";

async function parseJson(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export const companiesRouter = new Hono<AppEnv>();

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

companiesRouter.get("/me", async (c) => {
  const auth = c.get("auth");

  const rows = await c.env.DB.prepare(
    `SELECT c.company_id, c.name, c.status, cm.role, cm.status as membership_status
     FROM company_memberships cm
     JOIN companies c ON c.company_id = cm.company_id
     WHERE cm.user_id = ?`
  )
    .bind(auth.user_id)
    .all();

  return c.json({ ok: true, companies: rows.results ?? [] });
});

companiesRouter.get("/:companyId/members", requireCompanyRole("admin"), async (c) => {
  const companyId = c.req.param("companyId");

  const rows = await c.env.DB.prepare(
    `SELECT cm.company_membership_id, cm.user_id, u.email, u.full_name, cm.role, cm.status, cm.created_at
     FROM company_memberships cm
     JOIN users u ON u.user_id = cm.user_id
     WHERE cm.company_id = ?
     ORDER BY cm.created_at DESC`
  )
    .bind(companyId)
    .all();

  return c.json({ ok: true, companyId, members: rows.results ?? [] });
});

companiesRouter.post("/:companyId/members", requireCompanyRole("admin"), async (c) => {
  const auth = c.get("auth");
  const companyId = c.req.param("companyId");
  const body = await parseJson(c);
  const userId = (body as { userId?: unknown } | null)?.userId;
  const role = (body as { role?: unknown } | null)?.role;

  if (typeof userId !== "string" || userId.trim().length === 0) {
    return c.json({ ok: false, error: "userId is required." }, 400);
  }
  if (!["owner", "admin", "member"].includes(String(role))) {
    return c.json({ ok: false, error: "role must be owner|admin|member." }, 400);
  }

  const now = new Date().toISOString();
  const invitedByActorId = await ensureUserActor(c, auth.user_id, companyId);
  await c.env.DB.prepare(
    `INSERT INTO company_memberships (
      company_membership_id, company_id, user_id, role, status, invited_by_actor_id, invited_at, created_at
     ) VALUES (?, ?, ?, ?, 'invited', ?, ?, ?)
     ON CONFLICT(company_id, user_id)
     DO UPDATE SET role = excluded.role, status = 'invited', invited_by_actor_id = excluded.invited_by_actor_id, invited_at = excluded.invited_at`
  )
    .bind(`cm_${crypto.randomUUID()}`, companyId, userId.trim(), String(role), invitedByActorId, now, now)
    .run();

  return c.json({ ok: true, companyId, userId: userId.trim(), role, status: "invited" }, 201);
});
