import { loadSession as loadUsersSession } from "/app/lib/users-api.js";
import { loadSession as loadGedSession } from "/app/lib/ged-api.js";

const ui = {
  companyId: document.getElementById("companyId"),
  projectId: document.getElementById("projectId"),
  jwtState: document.getElementById("jwtState"),
  contextInfo: document.getElementById("contextInfo"),
  listsView: document.getElementById("listsView"),
  status: document.getElementById("status"),
  refreshBtn: document.getElementById("refreshBtn"),
};

function setStatus(message) {
  ui.status.textContent = message;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function maskToken(token) {
  if (!token) return "-";
  if (token.length < 16) return token;
  return `${token.slice(0, 10)}...${token.slice(-6)}`;
}

async function requestLists(projectId, jwtToken) {
  const res = await fetch(`/api/lists/projects/${encodeURIComponent(projectId)}`, {
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

function renderLists(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    ui.listsView.innerHTML = '<div class="item"><small>Aucune liste visible sur ce projet.</small></div>';
    return;
  }

  ui.listsView.innerHTML = list
    .map((row) => {
      return `
        <article class="item">
          <strong>${escapeHtml(row.name || row.list_id)}</strong><br/>
          <small>ID: ${escapeHtml(row.list_id)}</small><br/>
          <small>Visibilité: ${escapeHtml(row.visibility)}</small><br/>
          <small>Documents: ${escapeHtml(row.document_count)}</small>
        </article>
      `;
    })
    .join("");
}

async function refresh() {
  const userSession = loadUsersSession();
  const gedSession = loadGedSession();

  const companyId = userSession.companyId || gedSession.companyId || "";
  const projectId = gedSession.projectId || "";
  const jwtToken = userSession.jwtToken || "";

  ui.companyId.value = companyId;
  ui.projectId.value = projectId;
  ui.jwtState.value = jwtToken ? "JWT actif" : "Non connecté";

  if (!jwtToken) {
    ui.contextInfo.textContent = "Connecte-toi d'abord sur la page Projet.";
    renderLists([]);
    setStatus("JWT manquant.");
    return;
  }
  if (!projectId) {
    ui.contextInfo.textContent = "Sélectionne d'abord un projet dans la page Projet.";
    renderLists([]);
    setStatus("Project ID manquant.");
    return;
  }

  ui.contextInfo.textContent = `Chargement des listes pour ${projectId} (${maskToken(jwtToken)})...`;

  try {
    const payload = await requestLists(projectId, jwtToken);
    renderLists(payload.lists || []);
    ui.contextInfo.textContent = `Projet ${projectId} | Rôle: ${payload.role || "-"}`;
    setStatus("Listes chargées.");
  } catch (error) {
    renderLists([]);
    ui.contextInfo.textContent = `Erreur: ${error instanceof Error ? error.message : "unknown"}`;
    setStatus("Erreur de chargement.");
  }
}

ui.refreshBtn?.addEventListener("click", () => {
  refresh();
});

refresh();
