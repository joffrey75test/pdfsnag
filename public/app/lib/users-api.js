const STORAGE_KEY = "pdfsnag_users_session_v1";

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { jwtToken: "", companyId: "" };
    const parsed = JSON.parse(raw);
    return {
      jwtToken: parsed.jwtToken || "",
      companyId: parsed.companyId || "",
    };
  } catch {
    return { jwtToken: "", companyId: "" };
  }
}

export function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

async function request(session, path, options = {}) {
  if (!session.jwtToken) throw new Error("JWT manquant");

  const res = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.jwtToken}`,
      ...(options.headers || {}),
    },
  });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = payload && typeof payload === "object" && payload.error ? payload.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return payload;
}

export function me(session) {
  return request(session, "/api/auth/me");
}

export function listMembers(session, companyId) {
  return request(session, `/api/companies/${encodeURIComponent(companyId)}/members`);
}

export function createInvite(session, { companyId, email, role, expiresDays }) {
  return request(session, "/api/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scopeType: "company",
      scopeId: companyId,
      email,
      role,
      expiresDays,
    }),
  });
}
