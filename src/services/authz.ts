import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./db";

export type CompanyRole = "member" | "admin" | "owner";
export type ProjectRole = "guest" | "collaborator" | "manager" | "admin";
export type ListRole = "guest" | "subcontractor" | "collaborator";

const companyRank: Record<CompanyRole, number> = {
  member: 10,
  admin: 20,
  owner: 30,
};

const projectRank: Record<ProjectRole, number> = {
  guest: 10,
  collaborator: 20,
  manager: 30,
  admin: 40,
};

const listRank: Record<ListRole, number> = {
  guest: 10,
  subcontractor: 15,
  collaborator: 20,
};

export function hasAtLeastCompanyRole(userRole: string, minRole: CompanyRole) {
  const normalized = String(userRole || "").toLowerCase() as CompanyRole;
  return (companyRank[normalized] ?? 0) >= (companyRank[minRole] ?? 999);
}

export function hasAtLeastProjectRole(userRole: string, minRole: ProjectRole) {
  const normalized = String(userRole || "").toLowerCase() as ProjectRole;
  return (projectRank[normalized] ?? 0) >= (projectRank[minRole] ?? 999);
}

export function hasAtLeastListRole(userRole: string, minRole: ListRole) {
  const normalized = String(userRole || "").toLowerCase() as ListRole;
  return (listRank[normalized] ?? 0) >= (listRank[minRole] ?? 999);
}

export function requireCompanyRole(minRole: CompanyRole, companyParam = "companyId"): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!auth?.user_id) return c.json({ ok: false, error: "Authentication required." }, 401);

    const companyId = c.req.param(companyParam);
    if (!companyId) return c.json({ ok: false, error: "Missing companyId in route parameters." }, 400);

    const row = await c.env.DB.prepare(
      `SELECT role
       FROM company_memberships
       WHERE company_id = ? AND user_id = ? AND status = 'active'
       LIMIT 1`
    )
      .bind(companyId, auth.user_id)
      .first<{ role: string }>();

    if (!row) return c.json({ ok: false, error: "No active company membership." }, 403);

    const role = String(row.role || "").toLowerCase();
    if (!hasAtLeastCompanyRole(role, minRole)) {
      return c.json({ ok: false, error: `Insufficient company role. Requires '${minRole}'.` }, 403);
    }

    c.set("companyRole", role as CompanyRole);
    await next();
  };
}

export function requireProjectRole(minRole: ProjectRole, projectParam = "projectId"): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!auth?.user_id) return c.json({ ok: false, error: "Authentication required." }, 401);

    const projectId = c.req.param(projectParam);
    if (!projectId) return c.json({ ok: false, error: "Missing projectId in route parameters." }, 400);

    const row = await c.env.DB.prepare(
      `SELECT role
       FROM project_memberships
       WHERE project_id = ? AND user_id = ? AND status = 'active'
       LIMIT 1`
    )
      .bind(projectId, auth.user_id)
      .first<{ role: string }>();

    if (!row) return c.json({ ok: false, error: "No active project membership." }, 403);

    const role = String(row.role || "").toLowerCase();
    if (!hasAtLeastProjectRole(role, minRole)) {
      return c.json({ ok: false, error: `Insufficient role. Requires '${minRole}'.` }, 403);
    }

    c.set("projectRole", role as ProjectRole);
    await next();
  };
}

export function requireListRole(minRole: ListRole, listParam = "listId"): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!auth?.user_id) return c.json({ ok: false, error: "Authentication required." }, 401);

    const listId = c.req.param(listParam);
    if (!listId) return c.json({ ok: false, error: "Missing listId in route parameters." }, 400);

    const row = await c.env.DB.prepare(
      `SELECT role
       FROM list_memberships
       WHERE list_id = ? AND user_id = ?
       LIMIT 1`
    )
      .bind(listId, auth.user_id)
      .first<{ role: string }>();

    if (!row) return c.json({ ok: false, error: "No list membership." }, 403);

    const role = String(row.role || "").toLowerCase();
    if (!hasAtLeastListRole(role, minRole)) {
      return c.json({ ok: false, error: `Insufficient list role. Requires '${minRole}'.` }, 403);
    }

    c.set("listRole", role as ListRole);
    await next();
  };
}
