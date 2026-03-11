import { loadSession, saveSession } from "/app/lib/users-api.js";
import { loadSession as loadGedSession, saveSession as saveGedSession } from "/app/lib/ged-api.js";

const ui = {
  loginForm: document.getElementById("loginForm"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  companyId: document.getElementById("companyId"),
  jwtToken: document.getElementById("jwtToken"),
  result: document.getElementById("result"),
  status: document.getElementById("status"),
  projectSelect: document.getElementById("projectSelect"),
  useProjectBtn: document.getElementById("useProjectBtn"),
  projectsInfo: document.getElementById("projectsInfo"),
  openUsersBtn: document.getElementById("openUsersBtn"),
  openGedBtn: document.getElementById("openGedBtn"),
};

let projectsState = [];

function setStatus(text) {
  ui.status.textContent = text;
}

function maskToken(token) {
  if (!token || token.length < 16) return token || "";
  return `${token.slice(0, 12)}...${token.slice(-8)}`;
}

function syncSessionPreview() {
  const session = loadSession();
  ui.companyId.value = session.companyId || "";
  ui.jwtToken.value = maskToken(session.jwtToken || "");
  ui.result.textContent = session.jwtToken
    ? `Session active. Company: ${session.companyId || "(vide)"}`
    : "Aucune session utilisateur.";
}

async function login(email, password) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = payload && typeof payload === "object" && payload.error ? payload.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return payload;
}

async function fetchProjects(jwtToken) {
  const res = await fetch("/api/projects", {
    headers: {
      Authorization: `Bearer ${jwtToken}`,
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

function renderProjects(projects) {
  const list = Array.isArray(projects) ? projects : [];
  projectsState = list;

  if (!(ui.projectSelect instanceof HTMLSelectElement)) return;
  ui.projectSelect.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = list.length ? "Sélectionner un projet" : "(aucun projet)";
  ui.projectSelect.append(empty);

  list.forEach((project) => {
    const option = document.createElement("option");
    option.value = String(project.project_id || "");
    option.textContent = `${String(project.name || project.project_id || "")} [${String(project.role || "-")}]`;
    ui.projectSelect.append(option);
  });

  if (ui.projectsInfo) {
    ui.projectsInfo.textContent = list.length
      ? `${list.length} projet(s) accessible(s).`
      : "Aucun projet actif pour cet utilisateur.";
  }
}

async function refreshProjectsForCurrentSession() {
  const session = loadSession();
  if (!session.jwtToken) {
    renderProjects([]);
    if (ui.projectsInfo) ui.projectsInfo.textContent = "Connecte-toi pour charger tes projets.";
    return;
  }

  try {
    const payload = await fetchProjects(session.jwtToken);
    renderProjects(payload.projects || []);
  } catch (error) {
    renderProjects([]);
    if (ui.projectsInfo) {
      ui.projectsInfo.textContent = `Erreur chargement projets: ${error instanceof Error ? error.message : "unknown"}`;
    }
  }
}

ui.loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = ui.email.value.trim();
  const password = ui.password.value;

  if (!email || !password) {
    setStatus("Email et mot de passe requis.");
    return;
  }

  try {
    setStatus("Connexion en cours...");
    const payload = await login(email, password);

    saveSession({
      jwtToken: String(payload.token || ""),
      companyId: String(payload.company_id || ""),
    });

    ui.password.value = "";
    syncSessionPreview();
    ui.result.textContent = JSON.stringify(
      {
        ok: payload.ok,
        user: payload.user,
        company_id: payload.company_id,
        roles: payload.roles,
      },
      null,
      2
    );
    await refreshProjectsForCurrentSession();
    setStatus("Connecté. Session locale mise à jour.");
  } catch (error) {
    setStatus(`Erreur login: ${error instanceof Error ? error.message : "unknown"}`);
  }
});

ui.useProjectBtn?.addEventListener("click", () => {
  const usersSession = loadSession();
  if (!(ui.projectSelect instanceof HTMLSelectElement)) return;
  const projectId = ui.projectSelect.value;
  if (!projectId) {
    setStatus("Sélectionne un projet.");
    return;
  }

  const gedSession = loadGedSession();
  saveGedSession({
    companyId: usersSession.companyId || gedSession.companyId || "",
    projectId,
    projectToken: gedSession.projectToken || "",
  });

  const picked = projectsState.find((p) => String(p.project_id) === projectId);
  setStatus(`Projet GED actif: ${projectId}${picked?.role ? ` (${picked.role})` : ""}`);
});

ui.openUsersBtn?.addEventListener("click", () => {
  window.location.href = "/app/users.html";
});

ui.openGedBtn?.addEventListener("click", () => {
  window.location.href = "/app/ged.html";
});

syncSessionPreview();
refreshProjectsForCurrentSession();
