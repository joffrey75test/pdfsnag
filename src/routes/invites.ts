import { Hono } from "hono";
import type { AppEnv } from "../services/db";
import { hasAtLeastCompanyRole, hasAtLeastListRole, hasAtLeastProjectRole } from "../services/authz";
import { sha256Hex } from "../services/auth";

async function parseJson(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function tokenHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const invitesRouter = new Hono<AppEnv>();

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

invitesRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const scopeType = c.req.query("scopeType");
  const scopeId = c.req.query("scopeId");

  if (!scopeType || !scopeId) {
    return c.json({ ok: false, error: "scopeType and scopeId are required." }, 400);
  }

  const rows = await c.env.DB.prepare(
    `SELECT invite_id, scope_type, scope_id, email, role, expires_at, accepted_at, revoked_at, created_at
     FROM invite_tokens
     WHERE scope_type = ? AND scope_id = ?
     ORDER BY created_at DESC`
  )
    .bind(scopeType, scopeId)
    .all();

  return c.json({ ok: true, requestedBy: auth.user_id, invites: rows.results ?? [] });
});

invitesRouter.post("/", async (c) => {
  const auth = c.get("auth");
  const body = await parseJson(c);
  const scopeType = (body as { scopeType?: unknown } | null)?.scopeType;
  const scopeId = (body as { scopeId?: unknown } | null)?.scopeId;
  const email = (body as { email?: unknown } | null)?.email;
  const role = (body as { role?: unknown } | null)?.role;
  const expiresDays = Number((body as { expiresDays?: unknown } | null)?.expiresDays ?? 7);

  if (!["company", "project", "list"].includes(String(scopeType))) {
    return c.json({ ok: false, error: "scopeType must be company|project|list." }, 400);
  }
  if (typeof scopeId !== "string" || !scopeId.trim()) {
    return c.json({ ok: false, error: "scopeId is required." }, 400);
  }
  if (typeof email !== "string" || !email.trim()) {
    return c.json({ ok: false, error: "email is required." }, 400);
  }
  if (typeof role !== "string" || !role.trim()) {
    return c.json({ ok: false, error: "role is required." }, 400);
  }

  if (scopeType === "company") {
    const m = await c.env.DB.prepare(
      `SELECT role FROM company_memberships WHERE company_id = ? AND user_id = ? AND status = 'active' LIMIT 1`
    )
      .bind(scopeId, auth.user_id)
      .first<{ role: string }>();
    if (!m || !hasAtLeastCompanyRole(m.role, "admin")) {
      return c.json({ ok: false, error: "Insufficient company role to invite." }, 403);
    }
  }

  if (scopeType === "project") {
    const m = await c.env.DB.prepare(
      `SELECT role FROM project_memberships WHERE project_id = ? AND user_id = ? AND status = 'active' LIMIT 1`
    )
      .bind(scopeId, auth.user_id)
      .first<{ role: string }>();
    if (!m || !hasAtLeastProjectRole(m.role, "manager")) {
      return c.json({ ok: false, error: "Insufficient project role to invite." }, 403);
    }
  }

  if (scopeType === "list") {
    const m = await c.env.DB.prepare(
      `SELECT role FROM list_memberships WHERE list_id = ? AND user_id = ? LIMIT 1`
    )
      .bind(scopeId, auth.user_id)
      .first<{ role: string }>();
    if (!m || !hasAtLeastListRole(m.role, "collaborator")) {
      return c.json({ ok: false, error: "Insufficient list role to invite." }, 403);
    }
  }

  let companyId: string | null = null;
  if (scopeType === "company") {
    companyId = scopeId.trim();
  } else if (scopeType === "project") {
    const row = await c.env.DB.prepare("SELECT company_id FROM projects WHERE project_id = ? LIMIT 1")
      .bind(scopeId.trim())
      .first<{ company_id: string }>();
    companyId = row?.company_id ?? null;
  } else if (scopeType === "list") {
    const row = await c.env.DB.prepare(
      `SELECT p.company_id
       FROM lists l
       JOIN projects p ON p.project_id = l.project_id
       WHERE l.list_id = ?
       LIMIT 1`
    )
      .bind(scopeId.trim())
      .first<{ company_id: string }>();
    companyId = row?.company_id ?? null;
  }
  if (!companyId) {
    return c.json({ ok: false, error: "Unable to resolve company for invite scope." }, 404);
  }
  const inviterActorId = await ensureUserActor(c, auth.user_id, companyId);

  const rawToken = tokenHex(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + Math.max(1, expiresDays) * 86400000).toISOString();

  await c.env.DB.prepare(
    `INSERT INTO invite_tokens (
      invite_id, scope_type, scope_id, email, role, token_hash, invited_by_actor_id, expires_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      `inv_${crypto.randomUUID()}`,
      scopeType,
      scopeId.trim(),
      email.toLowerCase().trim(),
      role.trim(),
      tokenHash,
      inviterActorId,
      expiresAt,
      new Date().toISOString()
    )
    .run();

  return c.json(
    {
      ok: true,
      invite: {
        scopeType,
        scopeId: scopeId.trim(),
        email: email.toLowerCase().trim(),
        role: role.trim(),
        expiresAt,
        rawToken,
      },
      warning: "rawToken is shown only once.",
    },
    201
  );
});

invitesRouter.post("/accept", async (c) => {
  const auth = c.get("auth");
  const body = await parseJson(c);
  const token = (body as { token?: unknown } | null)?.token;

  if (typeof token !== "string" || !token.trim()) {
    return c.json({ ok: false, error: "token is required." }, 400);
  }

  const tokenHash = await sha256Hex(token.trim());
  const invite = await c.env.DB.prepare(
    `SELECT invite_id, scope_type, scope_id, email, role, invited_by_actor_id, expires_at, accepted_at, revoked_at
     FROM invite_tokens
     WHERE token_hash = ?
     LIMIT 1`
  )
    .bind(tokenHash)
    .first<{
      invite_id: string;
      scope_type: string;
      scope_id: string;
      email: string;
      role: string;
      invited_by_actor_id: string;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
    }>();

  if (!invite) return c.json({ ok: false, error: "Invalid invite token." }, 404);
  if (invite.revoked_at) return c.json({ ok: false, error: "Invite revoked." }, 400);
  if (invite.accepted_at) return c.json({ ok: false, error: "Invite already accepted." }, 400);
  if (Date.parse(invite.expires_at) <= Date.now()) return c.json({ ok: false, error: "Invite expired." }, 400);

  const now = new Date().toISOString();

  if (invite.scope_type === "company") {
    await c.env.DB.prepare(
      `INSERT INTO company_memberships (
         company_membership_id, company_id, user_id, role, status, invited_by_actor_id, joined_at, created_at
       ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
       ON CONFLICT(company_id, user_id)
       DO UPDATE SET role = excluded.role, status = 'active', joined_at = excluded.joined_at`
    )
      .bind(`cm_${crypto.randomUUID()}`, invite.scope_id, auth.user_id, invite.role, invite.invited_by_actor_id, now, now)
      .run();
  } else if (invite.scope_type === "project") {
    await c.env.DB.prepare(
      `INSERT INTO project_memberships (
         project_membership_id, project_id, user_id, role, status, invited_by_actor_id, joined_at, created_at
       ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
       ON CONFLICT(project_id, user_id)
       DO UPDATE SET role = excluded.role, status = 'active', joined_at = excluded.joined_at`
    )
      .bind(`pm_${crypto.randomUUID()}`, invite.scope_id, auth.user_id, invite.role, invite.invited_by_actor_id, now, now)
      .run();
  } else if (invite.scope_type === "list") {
    await c.env.DB.prepare(
      `INSERT INTO list_memberships (list_membership_id, list_id, user_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(list_id, user_id)
       DO UPDATE SET role = excluded.role`
    )
      .bind(`lm_${crypto.randomUUID()}`, invite.scope_id, auth.user_id, invite.role, now)
      .run();
  }

  await c.env.DB.prepare("UPDATE invite_tokens SET accepted_at = ? WHERE invite_id = ?")
    .bind(now, invite.invite_id)
    .run();

  return c.json({ ok: true, inviteId: invite.invite_id, acceptedAt: now, scopeType: invite.scope_type, scopeId: invite.scope_id });
});
