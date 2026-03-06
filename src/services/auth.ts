import { SignJWT, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./db";

const PBKDF2_ITERATIONS = 120000;
const PBKDF2_KEY_BYTES = 32;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCookies(cookieHeader: string | undefined | null) {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;

  const parts = cookieHeader.split(";");
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx < 0) continue;
    const key = p.slice(0, idx).trim();
    const val = p.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(val);
  }
  return out;
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

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string) {
  const normalized = hex.trim();
  if (normalized.length % 2 !== 0) throw new Error("Invalid hex");
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function pbkdf2Hex(password: string, saltHex: string, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: fromHex(saltHex),
      iterations,
    },
    key,
    PBKDF2_KEY_BYTES * 8
  );
  return toHex(new Uint8Array(bits));
}

function timingSafeEqualHex(aHex: string, bHex: string) {
  const a = fromHex(aHex);
  const b = fromHex(bHex);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const saltHex = toHex(salt);
  const digestHex = await pbkdf2Hex(password, saltHex, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${saltHex}$${digestHex}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, iterRaw, saltHex, digestHex] = String(stored || "").split("$");
  if (algo !== "pbkdf2_sha256" || !iterRaw || !saltHex || !digestHex) return false;
  const iterations = Number(iterRaw);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  const candidate = await pbkdf2Hex(password, saltHex, iterations);
  return timingSafeEqualHex(candidate, digestHex);
}

export async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

export async function issueJwt(claims: AppEnv["Variables"]["auth"], secret: string) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(claims.exp)
    .sign(new TextEncoder().encode(secret));
}

export function authCookie(token: string, maxAgeSeconds: number) {
  return `auth_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}; Secure`;
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const headerToken = getBearerToken(c.req.header("Authorization"));
  const cookieToken = parseCookies(c.req.header("Cookie"))["auth_token"] || null;
  const token = headerToken || cookieToken;

  if (!token) {
    return c.json({ ok: false, error: "Missing auth token (Bearer or cookie)." }, 401);
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
