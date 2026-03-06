import { Hono } from "hono";
import type { AppEnv } from "../services/db";
import { authCookie, hashPassword, issueJwt, requireAuth, verifyPassword } from "../services/auth";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

async function parseJson(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export const authRouter = new Hono<AppEnv>();

authRouter.post("/register", async (c) => {
  const body = await parseJson(c);
  const email = (body as { email?: unknown } | null)?.email;
  const password = (body as { password?: unknown } | null)?.password;
  const fullName = (body as { fullName?: unknown } | null)?.fullName;
  const companyName = (body as { companyName?: unknown } | null)?.companyName;

  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return c.json({ ok: false, error: "email and password are required." }, 400);
  }

  const userId = crypto.randomUUID();
  const companyId = `cmp_${crypto.randomUUID()}`;
  const nowIso = new Date().toISOString();
  const pwdHash = await hashPassword(password);

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO users (user_id, email, full_name, password_hash, status, created_at)
         VALUES (?, ?, ?, ?, 'active', ?)`
      ).bind(userId, email.toLowerCase().trim(), isNonEmptyString(fullName) ? fullName.trim() : null, pwdHash, nowIso),
      c.env.DB.prepare(
        `INSERT INTO companies (company_id, name, status, created_at)
         VALUES (?, ?, 'active', ?)`
      ).bind(companyId, isNonEmptyString(companyName) ? companyName.trim() : `Company ${userId.slice(0, 8)}`, nowIso),
      c.env.DB.prepare(
        `INSERT INTO company_memberships (company_membership_id, company_id, user_id, role, status, joined_at, created_at)
         VALUES (?, ?, ?, 'owner', 'active', ?, ?)`
      ).bind(`cm_${crypto.randomUUID()}`, companyId, userId, nowIso, nowIso),
    ]);
  } catch (error) {
    return c.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to register user." },
      400
    );
  }

  const exp = Math.floor(Date.now() / 1000) + 86400;
  const token = await issueJwt({ user_id: userId, company_id: companyId, roles: ["owner", "admin"], exp }, c.env.JWT_SECRET);
  c.header("Set-Cookie", authCookie(token, 86400));

  return c.json(
    {
      ok: true,
      user: { user_id: userId, email: email.toLowerCase().trim(), full_name: isNonEmptyString(fullName) ? fullName.trim() : null },
      company: { company_id: companyId },
      token,
    },
    201
  );
});

authRouter.post("/login", async (c) => {
  const body = await parseJson(c);
  const email = (body as { email?: unknown } | null)?.email;
  const password = (body as { password?: unknown } | null)?.password;

  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return c.json({ ok: false, error: "email and password are required." }, 400);
  }

  const user = await c.env.DB.prepare(
    `SELECT user_id, email, full_name, password_hash, status
     FROM users
     WHERE email = ?
     LIMIT 1`
  )
    .bind(email.toLowerCase().trim())
    .first<{ user_id: string; email: string; full_name: string | null; password_hash: string; status: string }>();

  if (!user || user.status !== "active") {
    return c.json({ ok: false, error: "Invalid credentials." }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ ok: false, error: "Invalid credentials." }, 401);
  }

  const membership = await c.env.DB.prepare(
    `SELECT company_id, role
     FROM company_memberships
     WHERE user_id = ? AND status = 'active'
     ORDER BY created_at ASC
     LIMIT 1`
  )
    .bind(user.user_id)
    .first<{ company_id: string; role: string }>();

  if (!membership) {
    return c.json({ ok: false, error: "No active company membership." }, 403);
  }

  const roles = [String(membership.role || "member").toLowerCase()];
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const token = await issueJwt({ user_id: user.user_id, company_id: membership.company_id, roles, exp }, c.env.JWT_SECRET);

  await c.env.DB.prepare("UPDATE users SET last_login_at = ? WHERE user_id = ?")
    .bind(new Date().toISOString(), user.user_id)
    .run();

  c.header("Set-Cookie", authCookie(token, 86400));

  return c.json({
    ok: true,
    user: {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
    },
    company_id: membership.company_id,
    roles,
    token,
  });
});

authRouter.post("/logout", (c) => {
  c.header("Set-Cookie", "auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure");
  return c.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (c) => {
  const auth = c.get("auth");

  const user = await c.env.DB.prepare(
    `SELECT user_id, email, full_name, status, created_at, last_login_at
     FROM users
     WHERE user_id = ?
     LIMIT 1`
  )
    .bind(auth.user_id)
    .first();

  const memberships = await c.env.DB.prepare(
    `SELECT company_id, role, status
     FROM company_memberships
     WHERE user_id = ?`
  )
    .bind(auth.user_id)
    .all();

  return c.json({ ok: true, auth, user, company_memberships: memberships.results ?? [] });
});
