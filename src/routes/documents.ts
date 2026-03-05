import { Hono } from "hono";
import type { AppEnv } from "../services/db";

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
