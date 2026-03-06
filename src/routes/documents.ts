import { SignJWT, jwtVerify } from "jose";
import { Hono } from "hono";
import type { AppEnv } from "../services/db";
import { hasAtLeastProjectRole, requireProjectRole } from "../services/authz";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIsoDateTime(value: unknown) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function hasOnlyAllowedKeys(obj: Record<string, unknown>, allowedKeys: string[]) {
  return Object.keys(obj).every((key) => allowedKeys.includes(key));
}

function validateCloudAnnotation(payload: unknown) {
  const errors: string[] = [];
  const requiredRoot = [
    "id",
    "documentId",
    "page",
    "type",
    "geometry",
    "style",
    "status",
    "version",
    "createdAt",
    "updatedAt",
  ];
  const allowedRoot = [...requiredRoot, "content", "author", "deletedAt", "discussion"];

  if (!isObject(payload)) {
    return ["Payload must be a JSON object."];
  }
  if (!hasOnlyAllowedKeys(payload, allowedRoot)) {
    errors.push("Payload contains unsupported root properties.");
  }
  for (const field of requiredRoot) {
    if (!(field in payload)) errors.push(`Missing required field: ${field}`);
  }

  if (typeof payload.id !== "string" || payload.id.length < 1) errors.push("id must be a non-empty string.");
  if (typeof payload.documentId !== "string" || payload.documentId.length < 1) errors.push("documentId must be a non-empty string.");
  if (!Number.isInteger(payload.page) || payload.page < 1) errors.push("page must be an integer >= 1.");
  if (payload.type !== "cloud") errors.push("type must be 'cloud'.");
  if (!Number.isInteger(payload.version) || payload.version < 1) errors.push("version must be an integer >= 1.");
  if (!isIsoDateTime(payload.createdAt)) errors.push("createdAt must be a valid ISO date-time string.");
  if (!isIsoDateTime(payload.updatedAt)) errors.push("updatedAt must be a valid ISO date-time string.");
  if (![
    "active",
    "deleted",
    "archived",
  ].includes(payload.status as string)) {
    errors.push("status must be one of: active, deleted, archived.");
  }
  if ("deletedAt" in payload && !isIsoDateTime(payload.deletedAt)) {
    errors.push("deletedAt must be a valid ISO date-time string.");
  }
  if (payload.status === "deleted" && !("deletedAt" in payload)) {
    errors.push("deletedAt is required when status is 'deleted'.");
  }

  const geometry = payload.geometry;
  if (!isObject(geometry)) {
    errors.push("geometry must be an object.");
  } else {
    const allowedGeometry = ["unit", "polygon", "bbox", "rotation"];
    if (!hasOnlyAllowedKeys(geometry, allowedGeometry)) {
      errors.push("geometry contains unsupported properties.");
    }
    for (const field of allowedGeometry) {
      if (!(field in geometry)) errors.push(`Missing required field: geometry.${field}`);
    }

    if (!["pdf", "viewport"].includes(geometry.unit as string)) {
      errors.push("geometry.unit must be 'pdf' or 'viewport'.");
    }
    if (!Array.isArray(geometry.polygon) || geometry.polygon.length < 3) {
      errors.push("geometry.polygon must be an array with at least 3 points.");
    } else {
      for (let i = 0; i < geometry.polygon.length; i += 1) {
        const point = geometry.polygon[i];
        if (!isObject(point) || !hasOnlyAllowedKeys(point, ["x", "y"])) {
          errors.push(`geometry.polygon[${i}] must contain only x and y.`);
          continue;
        }
        if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
          errors.push(`geometry.polygon[${i}] x/y must be finite numbers.`);
        }
      }
    }

    if (!isObject(geometry.bbox)) {
      errors.push("geometry.bbox must be an object.");
    } else {
      const bbox = geometry.bbox;
      if (!hasOnlyAllowedKeys(bbox, ["x", "y", "width", "height"])) {
        errors.push("geometry.bbox contains unsupported properties.");
      }
      if (!isFiniteNumber(bbox.x)) errors.push("geometry.bbox.x must be a finite number.");
      if (!isFiniteNumber(bbox.y)) errors.push("geometry.bbox.y must be a finite number.");
      if (!isFiniteNumber(bbox.width) || bbox.width <= 0) errors.push("geometry.bbox.width must be a number > 0.");
      if (!isFiniteNumber(bbox.height) || bbox.height <= 0) errors.push("geometry.bbox.height must be a number > 0.");
    }

    if (!isFiniteNumber(geometry.rotation)) {
      errors.push("geometry.rotation must be a finite number.");
    }
  }

  const style = payload.style;
  if (!isObject(style)) {
    errors.push("style must be an object.");
  } else {
    const allowedStyle = ["strokeColor", "strokeWidth", "strokeStyle", "opacity", "cloudIntensity"];
    if (!hasOnlyAllowedKeys(style, allowedStyle)) {
      errors.push("style contains unsupported properties.");
    }
    for (const field of allowedStyle) {
      if (!(field in style)) errors.push(`Missing required field: style.${field}`);
    }
    if (typeof style.strokeColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(style.strokeColor)) {
      errors.push("style.strokeColor must match #RRGGBB.");
    }
    if (!isFiniteNumber(style.strokeWidth) || style.strokeWidth <= 0) {
      errors.push("style.strokeWidth must be a number > 0.");
    }
    if ("strokeStyle" in style && !["solid", "dashed", "dotted"].includes(style.strokeStyle as string)) {
      errors.push("style.strokeStyle must be one of: solid, dashed, dotted.");
    }
    if (!isFiniteNumber(style.opacity) || style.opacity < 0 || style.opacity > 1) {
      errors.push("style.opacity must be between 0 and 1.");
    }
    if (!isFiniteNumber(style.cloudIntensity) || style.cloudIntensity < 0 || style.cloudIntensity > 1) {
      errors.push("style.cloudIntensity must be between 0 and 1.");
    }
  }

  if ("content" in payload) {
    if (!isObject(payload.content)) {
      errors.push("content must be an object when provided.");
    } else {
      if (!hasOnlyAllowedKeys(payload.content, ["text", "tags"])) {
        errors.push("content contains unsupported properties.");
      }
      if ("text" in payload.content && typeof payload.content.text !== "string") {
        errors.push("content.text must be a string.");
      }
      if ("tags" in payload.content) {
        if (!Array.isArray(payload.content.tags) || payload.content.tags.some((tag) => typeof tag !== "string")) {
          errors.push("content.tags must be an array of strings.");
        }
      }
    }
  }

  if ("author" in payload) {
    if (!isObject(payload.author)) {
      errors.push("author must be an object when provided.");
    } else {
      if (!hasOnlyAllowedKeys(payload.author, ["userId", "name"])) {
        errors.push("author contains unsupported properties.");
      }
      if (typeof payload.author.userId !== "string" || payload.author.userId.length < 1) {
        errors.push("author.userId must be a non-empty string.");
      }
      if ("name" in payload.author && typeof payload.author.name !== "string") {
        errors.push("author.name must be a string.");
      }
    }
  }

  if ("discussion" in payload) {
    if (!Array.isArray(payload.discussion)) {
      errors.push("discussion must be an array when provided.");
    } else {
      for (let i = 0; i < payload.discussion.length; i += 1) {
        const item = payload.discussion[i];
        if (!isObject(item)) {
          errors.push(`discussion[${i}] must be an object.`);
          continue;
        }
        const allowedItem = ["id", "parentId", "text", "author", "createdAt", "updatedAt", "status"];
        if (!hasOnlyAllowedKeys(item, allowedItem)) {
          errors.push(`discussion[${i}] contains unsupported properties.`);
        }
        for (const field of ["id", "parentId", "text", "author", "createdAt", "updatedAt", "status"]) {
          if (!(field in item)) errors.push(`Missing required field: discussion[${i}].${field}`);
        }
        if (typeof item.id !== "string" || item.id.length < 1) {
          errors.push(`discussion[${i}].id must be a non-empty string.`);
        }
        if (!(item.parentId === null || typeof item.parentId === "string")) {
          errors.push(`discussion[${i}].parentId must be null or string.`);
        }
        if (typeof item.text !== "string" || item.text.trim().length < 1) {
          errors.push(`discussion[${i}].text must be a non-empty string.`);
        }
        if (!isObject(item.author) || !hasOnlyAllowedKeys(item.author, ["userId", "name"])) {
          errors.push(`discussion[${i}].author must be an object with userId/name.`);
        } else if (typeof item.author.userId !== "string" || item.author.userId.length < 1) {
          errors.push(`discussion[${i}].author.userId must be a non-empty string.`);
        }
        if (!isIsoDateTime(item.createdAt)) {
          errors.push(`discussion[${i}].createdAt must be a valid ISO date-time string.`);
        }
        if (!isIsoDateTime(item.updatedAt)) {
          errors.push(`discussion[${i}].updatedAt must be a valid ISO date-time string.`);
        }
        if (!["active", "deleted"].includes(item.status as string)) {
          errors.push(`discussion[${i}].status must be one of: active, deleted.`);
        }
      }
    }
  }

  return errors;
}

export const documentsRouter = new Hono<AppEnv>();

documentsRouter.use("/projects/:projectId/*", requireProjectRole("guest"));
documentsRouter.use("/projects/:projectId", requireProjectRole("guest"));

function getR2Bucket(c: { env: AppEnv["Bindings"] }) {
  return c.env.R2 ?? c.env.FILES;
}

async function parseJsonBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function fileKey(projectId: string, fileId: string) {
  return `u/${projectId}/${fileId}`;
}

async function ensureUserActor(c: { env: AppEnv["Bindings"] }, userId: string, tenantId: string) {
  const actorId = `user_${userId}`;
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO actors (id, tenant_id, type, label, created_at)
     VALUES (?, ?, 'user', ?, datetime('now'))`
  )
    .bind(actorId, tenantId, `user:${userId}`)
    .run();
  return actorId;
}

async function hasDocumentReadAccess(c: { env: AppEnv["Bindings"] }, projectId: string, docId: string, userId: string) {
  const row = await c.env.DB.prepare(
    `SELECT d.id
     FROM documents d
     LEFT JOIN doc_folders df
       ON df.folder_id = d.folder_id
      AND df.project_id = d.project_id
     WHERE d.id = ?
       AND d.project_id = ?
       AND d.status != 'DELETED'
       AND (
         NOT EXISTS (
           SELECT 1
           FROM doc_folder_permissions p0
           WHERE p0.project_id = d.project_id
             AND p0.user_id = ?
             AND p0.can_read = 1
         )
         OR EXISTS (
           SELECT 1
           FROM doc_folder_permissions p
           JOIN doc_folders pf
             ON pf.folder_id = p.folder_id
            AND pf.project_id = p.project_id
           WHERE p.project_id = d.project_id
             AND p.user_id = ?
             AND p.can_read = 1
             AND COALESCE(df.path, '/') LIKE (pf.path || '%')
         )
       )
       AND (
         NOT EXISTS (
           SELECT 1
           FROM list_documents ld0
           JOIN lists l0
             ON l0.list_id = ld0.list_id
            AND l0.project_id = d.project_id
           WHERE ld0.document_id = d.id
         )
         OR EXISTS (
           SELECT 1
           FROM list_documents ld
           JOIN lists l
             ON l.list_id = ld.list_id
            AND l.project_id = d.project_id
           LEFT JOIN list_memberships lm
             ON lm.list_id = l.list_id
            AND lm.user_id = ?
           WHERE ld.document_id = d.id
             AND (
               l.visibility = 'public'
               OR (l.visibility = 'shared' AND lm.user_id IS NOT NULL)
               OR (l.visibility = 'private' AND (lm.user_id IS NOT NULL OR l.created_by_user_id = ?))
             )
         )
       )
     LIMIT 1`
  )
    .bind(docId, projectId, userId, userId, userId, userId)
    .first<{ id: string }>();

  return Boolean(row?.id);
}

documentsRouter.post("/annotations/cloud", async (c) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ ok: false, errors: ["Invalid JSON body."] }, 400);
  }

  const errors = validateCloudAnnotation(payload);
  if (errors.length > 0) {
    return c.json({ ok: false, errors }, 400);
  }

  return c.json({ ok: true, annotation: payload }, 201);
});

documentsRouter.post("/projects/:projectId/files/init", requireProjectRole("collaborator"), async (c) => {
  const projectId = c.req.param("projectId");
  const body = await parseJsonBody(c);
  const fileId = `file_${crypto.randomUUID()}`;

  const contentType = (body as { contentType?: unknown } | null)?.contentType;
  const filename = (body as { filename?: unknown } | null)?.filename;
  const byteSize = Number((body as { byteSize?: unknown } | null)?.byteSize ?? 0);

  return c.json(
    {
      ok: true,
      file: {
        fileId,
        r2Key: fileKey(projectId, fileId),
        filename: typeof filename === "string" ? filename : null,
        contentType: typeof contentType === "string" ? contentType : "application/octet-stream",
        byteSize: Number.isFinite(byteSize) && byteSize > 0 ? byteSize : null,
      },
      upload: {
        method: "PUT",
        url: `/api/documents/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/content`,
      },
    },
    201
  );
});

documentsRouter.put("/projects/:projectId/files/:fileId/content", requireProjectRole("collaborator"), async (c) => {
  const projectId = c.req.param("projectId");
  const fileId = c.req.param("fileId");
  const body = await c.req.arrayBuffer();
  if (!body || body.byteLength === 0) return c.json({ ok: false, error: "Missing file body." }, 400);

  const contentType = c.req.header("content-type") || "application/octet-stream";
  const r2Key = fileKey(projectId, fileId);
  await getR2Bucket(c).put(r2Key, body, { httpMetadata: { contentType } });

  return c.json({ ok: true, fileId, r2Key, byteSize: body.byteLength, contentType });
});

documentsRouter.get("/projects/:projectId", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  const role = c.get("projectRole");

  const rows = await c.env.DB.prepare(
    `SELECT d.id, d.title, d.status, d.folder_id, d.current_version_id, d.created_at, d.updated_at
     FROM documents d
     LEFT JOIN doc_folders df
       ON df.folder_id = d.folder_id
      AND df.project_id = d.project_id
     WHERE d.project_id = ?
       AND d.status != 'DELETED'
       AND (
         NOT EXISTS (
           SELECT 1
           FROM doc_folder_permissions p0
           WHERE p0.project_id = d.project_id
             AND p0.user_id = ?
             AND p0.can_read = 1
         )
         OR EXISTS (
           SELECT 1
           FROM doc_folder_permissions p
           JOIN doc_folders pf
             ON pf.folder_id = p.folder_id
            AND pf.project_id = p.project_id
           WHERE p.project_id = d.project_id
             AND p.user_id = ?
             AND p.can_read = 1
             AND COALESCE(df.path, '/') LIKE (pf.path || '%')
         )
       )
       AND (
         NOT EXISTS (
           SELECT 1
           FROM list_documents ld0
           JOIN lists l0
             ON l0.list_id = ld0.list_id
            AND l0.project_id = d.project_id
           WHERE ld0.document_id = d.id
         )
         OR EXISTS (
           SELECT 1
           FROM list_documents ld
           JOIN lists l
             ON l.list_id = ld.list_id
            AND l.project_id = d.project_id
           LEFT JOIN list_memberships lm
             ON lm.list_id = l.list_id
            AND lm.user_id = ?
           WHERE ld.document_id = d.id
             AND (
               l.visibility = 'public'
               OR (l.visibility = 'shared' AND lm.user_id IS NOT NULL)
               OR (l.visibility = 'private' AND (lm.user_id IS NOT NULL OR l.created_by_user_id = ?))
             )
         )
       )
     ORDER BY d.updated_at DESC
     LIMIT 200`
  )
    .bind(projectId, auth.user_id, auth.user_id, auth.user_id, auth.user_id)
    .all();

  return c.json({ ok: true, projectId, role, documents: rows.results ?? [] });
});

documentsRouter.post("/projects/:projectId", requireProjectRole("collaborator"), async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  const role = c.get("projectRole");
  const body = await parseJsonBody(c);

  const rawName = (body as { name?: unknown; title?: unknown } | null)?.name ?? (body as { title?: unknown } | null)?.title;
  const fileId = (body as { fileId?: unknown } | null)?.fileId;
  const folderPath = (body as { folderPath?: unknown } | null)?.folderPath;
  const mimeType = (body as { mimeType?: unknown } | null)?.mimeType;

  if (typeof rawName !== "string" || !rawName.trim()) {
    return c.json({ ok: false, error: "name (or title) is required." }, 400);
  }
  if (typeof fileId !== "string" || !fileId.trim()) {
    return c.json({ ok: false, error: "fileId is required (from files/init)." }, 400);
  }
  if (!(folderPath === undefined || folderPath === null || (typeof folderPath === "string" && folderPath.trim()))) {
    return c.json({ ok: false, error: "folderPath must be string|null." }, 400);
  }

  const objectKey = fileKey(projectId, fileId.trim());
  const uploaded = await getR2Bucket(c).head(objectKey);
  if (!uploaded) {
    return c.json({ ok: false, error: "Uploaded file not found in R2 for this fileId." }, 404);
  }

  let folderId: string | null = null;
  if (typeof folderPath === "string" && folderPath.trim()) {
    const row = await c.env.DB.prepare(
      `SELECT folder_id
       FROM doc_folders
       WHERE project_id = ? AND path = ?
       LIMIT 1`
    )
      .bind(projectId, folderPath.trim())
      .first<{ folder_id: string }>();

    if (!row?.folder_id) {
      return c.json({ ok: false, error: "folderPath not found in doc_folders." }, 404);
    }
    folderId = row.folder_id;
  }

  const actorId = await ensureUserActor(c, auth.user_id, auth.company_id);
  const docId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const contentType = typeof mimeType === "string" && mimeType.trim() ? mimeType.trim() : (uploaded.httpMetadata?.contentType || "application/octet-stream");

  await c.env.DB.prepare(
    `INSERT INTO documents (id, tenant_id, project_id, folder_id, title, status, current_version_id, created_by_actor_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', NULL, ?, ?, ?)`
  )
    .bind(docId, auth.company_id, projectId, folderId, rawName.trim(), actorId, now, now)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO document_versions (id, tenant_id, project_id, document_id, version_number, r2_key, mime_type, byte_size, created_by_actor_id, created_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
  )
    .bind(revisionId, auth.company_id, projectId, docId, objectKey, contentType, uploaded.size, actorId, now)
    .run();

  await c.env.DB.prepare(
    `UPDATE documents
     SET current_version_id = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(revisionId, now, docId)
    .run();

  return c.json(
    {
      ok: true,
      projectId,
      role,
      document: {
        id: docId,
        title: rawName.trim(),
        folderId,
        currentRevisionId: revisionId,
      },
    },
    201
  );
});

documentsRouter.post("/:documentId/revisions", async (c) => {
  const auth = c.get("auth");
  const documentId = c.req.param("documentId");
  const body = await parseJsonBody(c);
  const fileId = (body as { fileId?: unknown } | null)?.fileId;
  const mimeType = (body as { mimeType?: unknown } | null)?.mimeType;

  if (typeof fileId !== "string" || !fileId.trim()) {
    return c.json({ ok: false, error: "fileId is required." }, 400);
  }

  const doc = await c.env.DB.prepare(
    `SELECT id, project_id, tenant_id, status
     FROM documents
     WHERE id = ?
     LIMIT 1`
  )
    .bind(documentId)
    .first<{ id: string; project_id: string; tenant_id: string; status: string }>();

  if (!doc || doc.status === "DELETED") return c.json({ ok: false, error: "Document not found." }, 404);

  const membership = await c.env.DB.prepare(
    `SELECT role
     FROM project_memberships
     WHERE project_id = ? AND user_id = ? AND status = 'active'
     LIMIT 1`
  )
    .bind(doc.project_id, auth.user_id)
    .first<{ role: string }>();

  if (!membership || !hasAtLeastProjectRole(membership.role, "collaborator")) {
    return c.json({ ok: false, error: "Insufficient role. Requires 'collaborator'." }, 403);
  }

  const objectKey = fileKey(doc.project_id, fileId.trim());
  const uploaded = await getR2Bucket(c).head(objectKey);
  if (!uploaded) {
    return c.json({ ok: false, error: "Uploaded file not found in R2 for this fileId." }, 404);
  }

  const maxRow = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(version_number), 0) AS maxv
     FROM document_versions
     WHERE document_id = ?`
  )
    .bind(documentId)
    .first<{ maxv: number }>();

  const actorId = await ensureUserActor(c, auth.user_id, auth.company_id);
  const revisionId = crypto.randomUUID();
  const nextVersion = (maxRow?.maxv ?? 0) + 1;
  const now = new Date().toISOString();
  const contentType = typeof mimeType === "string" && mimeType.trim() ? mimeType.trim() : (uploaded.httpMetadata?.contentType || "application/octet-stream");

  await c.env.DB.prepare(
    `INSERT INTO document_versions (id, tenant_id, project_id, document_id, version_number, r2_key, mime_type, byte_size, created_by_actor_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(revisionId, doc.tenant_id, doc.project_id, documentId, nextVersion, objectKey, contentType, uploaded.size, actorId, now)
    .run();

  await c.env.DB.prepare(
    `UPDATE documents
     SET current_version_id = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(revisionId, now, documentId)
    .run();

  return c.json(
    {
      ok: true,
      documentId,
      revision: {
        id: revisionId,
        versionNumber: nextVersion,
      },
    },
    201
  );
});

documentsRouter.get("/:documentId", async (c) => {
  const auth = c.get("auth");
  const documentId = c.req.param("documentId");

  const doc = await c.env.DB.prepare(
    `SELECT id, tenant_id, project_id, folder_id, title, status, current_version_id, created_at, updated_at
     FROM documents
     WHERE id = ?
     LIMIT 1`
  )
    .bind(documentId)
    .first<{
      id: string;
      tenant_id: string;
      project_id: string;
      folder_id: string | null;
      title: string;
      status: string;
      current_version_id: string | null;
      created_at: string;
      updated_at: string;
    }>();

  if (!doc || doc.status === "DELETED") return c.json({ ok: false, error: "Document not found." }, 404);

  const membership = await c.env.DB.prepare(
    `SELECT role
     FROM project_memberships
     WHERE project_id = ? AND user_id = ? AND status = 'active'
     LIMIT 1`
  )
    .bind(doc.project_id, auth.user_id)
    .first<{ role: string }>();

  if (!membership || !hasAtLeastProjectRole(membership.role, "guest")) {
    return c.json({ ok: false, error: "No active project membership." }, 403);
  }

  const allowed = await hasDocumentReadAccess(c, doc.project_id, documentId, auth.user_id);
  if (!allowed) return c.json({ ok: false, error: "No document access (folder/list policy)." }, 403);

  const revision = doc.current_version_id
    ? await c.env.DB.prepare(
        `SELECT id, version_number, r2_key, mime_type, byte_size, created_at
         FROM document_versions
         WHERE id = ?
         LIMIT 1`
      )
        .bind(doc.current_version_id)
        .first<{ id: string; version_number: number; r2_key: string; mime_type: string; byte_size: number; created_at: string }>()
    : null;

  return c.json({
    ok: true,
    projectId: doc.project_id,
    role: membership.role,
    document: doc,
    currentRevision: revision,
  });
});

documentsRouter.get("/:documentId/download", async (c) => {
  const auth = c.get("auth");
  const documentId = c.req.param("documentId");

  const doc = await c.env.DB.prepare(
    `SELECT id, project_id, status
     FROM documents
     WHERE id = ?
     LIMIT 1`
  )
    .bind(documentId)
    .first<{ id: string; project_id: string; status: string }>();

  if (!doc || doc.status === "DELETED") return c.json({ ok: false, error: "Document not found." }, 404);

  const membership = await c.env.DB.prepare(
    `SELECT role
     FROM project_memberships
     WHERE project_id = ? AND user_id = ? AND status = 'active'
     LIMIT 1`
  )
    .bind(doc.project_id, auth.user_id)
    .first<{ role: string }>();

  if (!membership || !hasAtLeastProjectRole(membership.role, "guest")) {
    return c.json({ ok: false, error: "No active project membership." }, 403);
  }

  const allowed = await hasDocumentReadAccess(c, doc.project_id, documentId, auth.user_id);
  if (!allowed) return c.json({ ok: false, error: "No document access (folder/list policy)." }, 403);

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 300;
  const token = await new SignJWT({
    type: "document_download",
    documentId,
    projectId: doc.project_id,
    userId: auth.user_id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(c.env.JWT_SECRET));

  return c.json({
    ok: true,
    downloadUrl: `/documents/download/${token}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  });
});

documentsRouter.get("/download/verify/:token", async (c) => {
  const token = c.req.param("token");
  try {
    const verified = await jwtVerify(token, new TextEncoder().encode(c.env.JWT_SECRET));
    return c.json({ ok: true, payload: verified.payload });
  } catch {
    return c.json({ ok: false, error: "Invalid token." }, 401);
  }
});
