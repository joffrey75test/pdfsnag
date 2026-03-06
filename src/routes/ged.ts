import { Hono } from "hono";
import { jwtVerify } from "jose";
import type { AppEnv } from "../services/db";

type Scope = "read" | "write";

function uuid() {
  return crypto.randomUUID();
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getR2Bucket(c: { env: AppEnv["Bindings"] }) {
  return c.env.R2 ?? c.env.FILES;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sanitizeFolderSegment(name: string) {
  return name.trim().replaceAll("/", "_");
}

async function parseJsonBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function requireWrite(c: { get: (key: "scope") => Scope }) {
  return c.get("scope") === "write";
}

async function audit(
  c: {
    env: AppEnv["Bindings"];
    get: (key: "tenantId" | "projectId" | "actorId") => string;
  },
  action: string,
  entityType: string,
  entityId: string,
  meta?: unknown
) {
  await c.env.DB.prepare(
    `INSERT INTO audit_events (id, tenant_id, project_id, actor_id, action, entity_type, entity_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      uuid(),
      c.get("tenantId"),
      c.get("projectId"),
      c.get("actorId"),
      action,
      entityType,
      entityId,
      meta ? JSON.stringify(meta) : null
    )
    .run();
}

export const gedRouter = new Hono<AppEnv>();

gedRouter.get("/documents/download/:token", async (c) => {
  const token = c.req.param("token");

  let payload: { documentId?: unknown; projectId?: unknown; type?: unknown };
  try {
    const verified = await jwtVerify(token, new TextEncoder().encode(c.env.JWT_SECRET));
    payload = verified.payload as { documentId?: unknown; projectId?: unknown; type?: unknown };
  } catch {
    return c.json({ ok: false, error: "Invalid or expired download token." }, 401);
  }

  if (payload.type !== "document_download" || typeof payload.documentId !== "string" || typeof payload.projectId !== "string") {
    return c.json({ ok: false, error: "Invalid download payload." }, 401);
  }

  const row = await c.env.DB.prepare(
    `SELECT d.title, v.r2_key, v.mime_type
     FROM documents d
     JOIN document_versions v ON v.id = d.current_version_id
     WHERE d.id = ? AND d.project_id = ? AND d.status != 'DELETED'
     LIMIT 1`
  )
    .bind(payload.documentId, payload.projectId)
    .first<{ title: string; r2_key: string; mime_type: string }>();

  if (!row) return c.json({ ok: false, error: "Document not found." }, 404);

  const obj = await getR2Bucket(c).get(row.r2_key);
  if (!obj) return c.json({ ok: false, error: "File missing in R2." }, 404);

  const safeName = (row.title || "document").replaceAll('"', "");
  return new Response(obj.body, {
    headers: {
      "content-type": row.mime_type || "application/octet-stream",
      "content-disposition": `attachment; filename="${safeName}"`,
      "cache-control": "private, max-age=300",
    },
  });
});

// Auth middleware (project token)
gedRouter.use("/projects/:projectId/*", async (c, next) => {
  const tenantId = c.req.header("x-tenant-id");
  if (!tenantId) return c.json({ error: "missing x-tenant-id" }, 400);

  const projectId = c.req.param("projectId");

  const auth = c.req.header("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return c.json({ error: "missing bearer token" }, 401);

  const rawToken = m[1].trim();
  const tokenHash = await sha256Hex(rawToken);

  const row = await c.env.DB.prepare(
    `SELECT scope, actor_id, expires_at, revoked_at
     FROM project_tokens
     WHERE tenant_id = ? AND project_id = ? AND token_hash = ?
     LIMIT 1`
  )
    .bind(tenantId, projectId, tokenHash)
    .first<{ scope: Scope; actor_id: string; expires_at: string | null; revoked_at: string | null }>();

  if (!row) return c.json({ error: "invalid token" }, 401);
  if (row.revoked_at) return c.json({ error: "token revoked" }, 401);
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
    return c.json({ error: "token expired" }, 401);
  }

  await c.env.DB.prepare("UPDATE project_tokens SET last_used_at = datetime('now') WHERE tenant_id = ? AND project_id = ? AND token_hash = ?")
    .bind(tenantId, projectId, tokenHash)
    .run();

  c.set("tenantId", tenantId);
  c.set("projectId", projectId);
  c.set("scope", row.scope);
  c.set("actorId", row.actor_id);

  await next();
});

// FOLDERS
gedRouter.get("/projects/:projectId/folders", async (c) => {
  const parentId = c.req.query("parentId") ?? null;

  const rows = await c.env.DB.prepare(
    `SELECT id, parent_id, name, created_at
     FROM folders
     WHERE tenant_id = ? AND project_id = ? AND (parent_id IS ? OR parent_id = ?)
     ORDER BY name ASC`
  )
    .bind(c.get("tenantId"), c.get("projectId"), parentId, parentId)
    .all();

  return c.json(rows.results ?? []);
});

gedRouter.post("/projects/:projectId/folders", async (c) => {
  if (!requireWrite(c)) return c.json({ error: "forbidden (write token required)" }, 403);

  const body = await parseJsonBody(c);
  const name = (body as { name?: unknown } | null)?.name;
  const parentId = (body as { parentId?: unknown } | null)?.parentId;

  if (!isNonEmptyString(name)) {
    return c.json({ error: "invalid body: name is required" }, 400);
  }
  if (!(parentId === undefined || parentId === null || isNonEmptyString(parentId))) {
    return c.json({ error: "invalid body: parentId must be string|null" }, 400);
  }

  const id = uuid();
  const safeName = name.trim();
  await c.env.DB.prepare(
    `INSERT INTO folders (id, tenant_id, project_id, parent_id, name, created_by_actor_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, c.get("tenantId"), c.get("projectId"), parentId ?? null, safeName, c.get("actorId"))
    .run();

  const segment = sanitizeFolderSegment(safeName);
  let path = `/${segment}/`;
  if (isNonEmptyString(parentId)) {
    const parent = await c.env.DB.prepare(
      `SELECT path
       FROM doc_folders
       WHERE folder_id = ? AND project_id = ?
       LIMIT 1`
    )
      .bind(parentId, c.get("projectId"))
      .first<{ path: string }>();

    if (parent?.path) {
      path = `${parent.path}${segment}/`;
    }
  }

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO doc_folders (folder_id, project_id, path, created_at)
     VALUES (?, ?, ?, datetime('now'))`
  )
    .bind(id, c.get("projectId"), path)
    .run();

  await audit(c, "FOLDER_CREATE", "folder", id, { name: safeName, parentId: parentId ?? null, path });

  return c.json({ id, name: safeName, parentId: parentId ?? null, path }, 201);
});

// DOCUMENTS
gedRouter.get("/projects/:projectId/documents", async (c) => {
  const folderId = c.req.query("folderId") ?? null;
  const q = (c.req.query("q") ?? "").trim();
  const parsedLimit = Number(c.req.query("limit") ?? 50);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50;

  const params: unknown[] = [c.get("tenantId"), c.get("projectId")];

  let where = "WHERE tenant_id = ? AND project_id = ? AND status != 'DELETED'";
  if (folderId) {
    where += " AND folder_id = ?";
    params.push(folderId);
  } else {
    where += " AND folder_id IS NULL";
  }
  if (q) {
    where += " AND title LIKE ?";
    params.push(`%${q}%`);
  }

  const rows = await c.env.DB.prepare(
    `SELECT id, folder_id, title, status, current_version_id, created_at, updated_at
     FROM documents
     ${where}
     ORDER BY updated_at DESC
     LIMIT ?`
  )
    .bind(...params, limit)
    .all();

  return c.json(rows.results ?? []);
});

gedRouter.post("/projects/:projectId/documents", async (c) => {
  if (!requireWrite(c)) return c.json({ error: "forbidden (write token required)" }, 403);

  const body = await parseJsonBody(c);
  const title = (body as { title?: unknown } | null)?.title;
  const folderId = (body as { folderId?: unknown } | null)?.folderId;
  const mimeTypeRaw = (body as { mimeType?: unknown } | null)?.mimeType;

  if (!isNonEmptyString(title)) {
    return c.json({ error: "invalid body: title is required" }, 400);
  }
  if (!(folderId === undefined || folderId === null || isNonEmptyString(folderId))) {
    return c.json({ error: "invalid body: folderId must be string|null" }, 400);
  }

  const mimeType = isNonEmptyString(mimeTypeRaw) ? mimeTypeRaw : "application/pdf";

  const tenantId = c.get("tenantId");
  const projectId = c.get("projectId");
  const actorId = c.get("actorId");

  const docId = uuid();
  const verId = uuid();
  const safeTitle = title.trim();
  const r2Key = `t/${tenantId}/p/${projectId}/d/${docId}/v/${verId}.pdf`;

  await c.env.DB.prepare(
    `INSERT INTO documents (id, tenant_id, project_id, folder_id, title, status, current_version_id, created_by_actor_id)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', NULL, ?)`
  )
    .bind(docId, tenantId, projectId, folderId ?? null, safeTitle, actorId)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO document_versions (id, tenant_id, project_id, document_id, version_number, r2_key, mime_type, byte_size, created_by_actor_id)
     VALUES (?, ?, ?, ?, 1, ?, ?, 0, ?)`
  )
    .bind(verId, tenantId, projectId, docId, r2Key, mimeType, actorId)
    .run();

  await c.env.DB.prepare(
    `UPDATE documents
     SET current_version_id = ?, updated_at = datetime('now')
     WHERE id = ? AND tenant_id = ? AND project_id = ?`
  )
    .bind(verId, docId, tenantId, projectId)
    .run();

  await audit(c, "DOCUMENT_CREATE", "document", docId, { title: safeTitle, folderId: folderId ?? null, versionId: verId });

  return c.json(
    {
      documentId: docId,
      currentVersionId: verId,
      upload: {
        method: "PUT",
        url: `/projects/${projectId}/documents/${docId}/versions/${verId}/content`,
        headers: {
          "content-type": mimeType,
          "x-file-size": "OPTIONAL",
        },
      },
    },
    201
  );
});

// upload content for a specific version (stream to R2)
gedRouter.put("/projects/:projectId/documents/:docId/versions/:verId/content", async (c) => {
  if (!requireWrite(c)) return c.json({ error: "forbidden (write token required)" }, 403);

  const { docId, verId } = c.req.param();
  const tenantId = c.get("tenantId");
  const projectId = c.get("projectId");

  const v = await c.env.DB.prepare(
    `SELECT r2_key FROM document_versions
     WHERE id = ? AND document_id = ? AND tenant_id = ? AND project_id = ?`
  )
    .bind(verId, docId, tenantId, projectId)
    .first<{ r2_key: string }>();

  if (!v) return c.json({ error: "version not found" }, 404);

  const contentType = c.req.header("content-type") || "application/pdf";
  const body = await c.req.arrayBuffer();
  if (!body || body.byteLength === 0) return c.json({ error: "missing body" }, 400);

  const xFileSize = c.req.header("x-file-size");
  const headerSize = xFileSize ? Number(xFileSize) : NaN;
  const byteSize = Number.isFinite(headerSize) && headerSize > 0 ? headerSize : body.byteLength;

  await getR2Bucket(c).put(v.r2_key, body, { httpMetadata: { contentType } });

  await c.env.DB.prepare(`UPDATE document_versions SET mime_type = ?, byte_size = ? WHERE id = ?`)
    .bind(contentType, byteSize, verId)
    .run();

  await c.env.DB.prepare(`UPDATE documents SET updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND project_id = ?`)
    .bind(docId, tenantId, projectId)
    .run();

  await audit(c, "VERSION_UPLOAD", "document_version", verId, { docId, byteSize });

  return c.json({ ok: true });
});

// download current version (proxy)
gedRouter.get("/projects/:projectId/documents/:docId/content", async (c) => {
  const { docId } = c.req.param();
  const tenantId = c.get("tenantId");
  const projectId = c.get("projectId");

  const row = await c.env.DB.prepare(
    `SELECT v.r2_key, v.mime_type
     FROM documents d
     JOIN document_versions v ON v.id = d.current_version_id
     WHERE d.id = ? AND d.tenant_id = ? AND d.project_id = ? AND d.status != 'DELETED'
     LIMIT 1`
  )
    .bind(docId, tenantId, projectId)
    .first<{ r2_key: string; mime_type: string }>();

  if (!row) return c.json({ error: "not found" }, 404);

  const obj = await getR2Bucket(c).get(row.r2_key);
  if (!obj) return c.json({ error: "file missing" }, 404);

  return new Response(obj.body, {
    headers: {
      "content-type": row.mime_type || "application/pdf",
      "cache-control": "private, no-store",
    },
  });
});

// create new version (metadata only; upload in a second call)
gedRouter.post("/projects/:projectId/documents/:docId/versions", async (c) => {
  if (!requireWrite(c)) return c.json({ error: "forbidden (write token required)" }, 403);

  const { docId } = c.req.param();
  const tenantId = c.get("tenantId");
  const projectId = c.get("projectId");
  const actorId = c.get("actorId");

  const doc = await c.env.DB.prepare(
    `SELECT id FROM documents WHERE id = ? AND tenant_id = ? AND project_id = ? AND status != 'DELETED'`
  )
    .bind(docId, tenantId, projectId)
    .first();

  if (!doc) return c.json({ error: "document not found" }, 404);

  const maxRow = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(version_number), 0) AS maxv
     FROM document_versions
     WHERE document_id = ? AND tenant_id = ? AND project_id = ?`
  )
    .bind(docId, tenantId, projectId)
    .first<{ maxv: number }>();

  const nextV = (maxRow?.maxv ?? 0) + 1;
  const verId = uuid();
  const r2Key = `t/${tenantId}/p/${projectId}/d/${docId}/v/${verId}.pdf`;

  await c.env.DB.prepare(
    `INSERT INTO document_versions (id, tenant_id, project_id, document_id, version_number, r2_key, mime_type, byte_size, created_by_actor_id)
     VALUES (?, ?, ?, ?, ?, ?, 'application/pdf', 0, ?)`
  )
    .bind(verId, tenantId, projectId, docId, nextV, r2Key, actorId)
    .run();

  await c.env.DB.prepare(
    `UPDATE documents SET current_version_id = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND project_id = ?`
  )
    .bind(verId, docId, tenantId, projectId)
    .run();

  await audit(c, "VERSION_CREATE", "document_version", verId, { docId, versionNumber: nextV });

  return c.json(
    {
      versionId: verId,
      versionNumber: nextV,
      upload: {
        method: "PUT",
        url: `/projects/${projectId}/documents/${docId}/versions/${verId}/content`,
      },
    },
    201
  );
});
