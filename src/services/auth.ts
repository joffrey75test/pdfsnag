import { jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./db";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBearerToken(authHeader: string | undefined | null) {
  if (!authHeader || typeof authHeader !== "string") return null;
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return null;
  return authHeader.slice(prefix.length).trim();
}

function hasValidAuthClaims(payload: unknown): payload is AppEnv["Variables"]["auth"] {
  if (!isObject(payload)) return false;
  if (typeof payload.user_id !== "string" || payload.user_id.length < 1) return false;
  if (typeof payload.company_id !== "string" || payload.company_id.length < 1) return false;
  if (!Array.isArray(payload.roles) || payload.roles.some((r) => typeof r !== "string")) return false;
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return false;
  return true;
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getBearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ ok: false, error: "Missing or invalid Authorization header." }, 401);
  }

  const secret = c.env.JWT_SECRET;
  if (!secret || typeof secret !== "string") {
    return c.json({ ok: false, error: "JWT secret is not configured." }, 500);
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (!hasValidAuthClaims(payload)) {
      return c.json({ ok: false, error: "Invalid JWT payload." }, 401);
    }

    c.set("auth", {
      user_id: payload.user_id,
      company_id: payload.company_id,
      roles: payload.roles,
      exp: payload.exp,
    });
    await next();
  } catch {
    return c.json({ ok: false, error: "Invalid or expired token." }, 401);
  }
};
