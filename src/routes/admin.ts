import { Hono } from "hono";
import type { AppEnv } from "../services/db";

type TokenScope = "read" | "write";

function hasAdminRole(roles: string[]) {
  return roles.includes("admin") || roles.includes("owner");
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateRawToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

async function parseJson(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export const adminRouter = new Hono<AppEnv>();

adminRouter.use("/*", async (c, next) => {
  const auth = c.get("auth");
  if (!auth || !hasAdminRole(auth.roles)) {
    return c.json({ ok: false, error: "Admin role required." }, 403);
  }
  await next();
});

adminRouter.get("/projects/:projectId/tokens", async (c) => {
  const projectId = c.req.param("projectId");
  const companyId = c.req.query("companyId") || c.req.header("x-company-id") || c.get("auth").company_id;

  const rows = await c.env.DB.prepare(
    `SELECT
      pt.id,
      pt.scope,
      pt.name,
      pt.expires_at,
      pt.revoked_at,
      pt.last_used_at,
      pt.created_at,
      a.id as actor_id,
      a.label as actor_label
    FROM project_tokens pt
    JOIN actors a ON a.id = pt.actor_id
    WHERE pt.company_id = ?
      AND pt.project_id = ?
    ORDER BY pt.created_at DESC`
  )
    .bind(companyId, projectId)
    .all();

  return c.json({ ok: true, projectId, companyId, tokens: rows.results ?? [] });
});

adminRouter.post("/projects/:projectId/tokens", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await parseJson(c);
  const companyId = (body as { companyId?: unknown } | null)?.companyId || c.req.header("x-company-id") || c.get("auth").company_id;
  const scope = (body as { scope?: unknown } | null)?.scope;
  const name = (body as { name?: unknown } | null)?.name;
  const expiresAt = (body as { expiresAt?: unknown } | null)?.expiresAt;

  if (typeof companyId !== "string" || companyId.trim().length === 0) {
    return c.json({ ok: false, error: "companyId is required." }, 400);
  }
  if (scope !== "read" && scope !== "write") {
    return c.json({ ok: false, error: "scope must be 'read' or 'write'." }, 400);
  }
  if (expiresAt !== undefined && expiresAt !== null) {
    if (typeof expiresAt !== "string" || Number.isNaN(Date.parse(expiresAt))) {
      return c.json({ ok: false, error: "expiresAt must be a valid ISO date-time string." }, 400);
    }
  }

  const project = await c.env.DB.prepare(
    `SELECT project_id FROM projects WHERE company_id = ? AND project_id = ? LIMIT 1`
  )
    .bind(companyId.trim(), projectId)
    .first();

  if (!project) {
    return c.json({ ok: false, error: "Project not found for company." }, 404);
  }

  const rawToken = generateRawToken(32);
  const tokenHash = await sha256Hex(rawToken);

  const tokenId = `tok_${crypto.randomUUID()}`;
  const actorId = `actor_${crypto.randomUUID()}`;
  const actorLabel = typeof name === "string" && name.trim().length > 0 ? `token:${name.trim()}` : `token:${scope}`;

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO actors (id, company_id, type, label)
       VALUES (?, ?, 'token', ?)`
    ).bind(actorId, companyId.trim(), actorLabel),
    c.env.DB.prepare(
      `INSERT INTO project_tokens (id, company_id, project_id, token_hash, scope, name, expires_at, actor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      tokenId,
      companyId.trim(),
      projectId,
      tokenHash,
      scope as TokenScope,
      typeof name === "string" && name.trim().length > 0 ? name.trim() : null,
      typeof expiresAt === "string" ? expiresAt : null,
      actorId
    ),
  ]);

  return c.json(
    {
      ok: true,
      token: {
        id: tokenId,
        companyId: companyId.trim(),
        projectId,
        scope,
        name: typeof name === "string" ? name.trim() : null,
        expiresAt: typeof expiresAt === "string" ? expiresAt : null,
        actorId,
        createdAt: new Date().toISOString(),
        rawToken,
      },
      warning: "rawToken is shown only once. Store it securely now.",
    },
    201
  );
});

adminRouter.post("/projects/:projectId/tokens/:tokenId/revoke", async (c) => {
  const { projectId, tokenId } = c.req.param();
  const body = await parseJson(c);
  const companyId = (body as { companyId?: unknown } | null)?.companyId || c.req.header("x-company-id") || c.get("auth").company_id;

  if (typeof companyId !== "string" || companyId.trim().length === 0) {
    return c.json({ ok: false, error: "companyId is required." }, 400);
  }

  const row = await c.env.DB.prepare(
     `SELECT id, revoked_at
     FROM project_tokens
     WHERE id = ? AND company_id = ? AND project_id = ?
     LIMIT 1`
  )
    .bind(tokenId, companyId.trim(), projectId)
    .first<{ id: string; revoked_at: string | null }>();

  if (!row) {
    return c.json({ ok: false, error: "Token not found." }, 404);
  }

  if (!row.revoked_at) {
    await c.env.DB.prepare(
      `UPDATE project_tokens SET revoked_at = datetime('now') WHERE id = ?`
    )
      .bind(tokenId)
      .run();
  }

  return c.json({ ok: true, tokenId, revoked: true });
});
