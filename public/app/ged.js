import {
  createFolder,
  listDocuments,
  listFolders,
  loadSession,
  uploadVersionContent,
} from "/app/lib/ged-api.js";
import { loadSession as loadUsersSession } from "/app/lib/users-api.js";

const ui = {
  infoMode: document.getElementById("infoMode"),
  infoTenant: document.getElementById("infoTenant"),
  infoProject: document.getElementById("infoProject"),
  infoAuth: document.getElementById("infoAuth"),
  refreshSessionBtn: document.getElementById("refreshSessionBtn"),
  refreshFolders: document.getElementById("refreshFolders"),
  refreshDocuments: document.getElementById("refreshDocuments"),
  clearFolderFilterBtn: document.getElementById("clearFolderFilterBtn"),
  folderFilterLabel: document.getElementById("folderFilterLabel"),
  newFolderBtn: document.getElementById("newFolderBtn"),
  newDocumentBtn: document.getElementById("newDocumentBtn"),
  uploadInput: document.getElementById("documentUploadInput"),
  dropZone: document.getElementById("dropZone"),
  uploadQueue: document.getElementById("uploadQueue"),
  foldersList: document.getElementById("foldersList"),
  documentsList: document.getElementById("documentsList"),
  detailsPanel: document.getElementById("detailsPanel"),
  status: document.getElementById("gedStatus"),
};

let session = loadSession();
let usersSession = loadUsersSession();
let foldersState = [];
let foldersById = new Map();
let documentsState = [];
let selectedFolderId = null;
let selectedDocumentId = null;

function getAuthMode() {
  if (session.companyId && session.projectId && session.projectToken) return "token";
  if (usersSession.jwtToken) return "user";
  return "none";
}

function shortText(value, fallback = "-") {
  const v = String(value || "").trim();
  if (!v) return fallback;
  return v;
}

function updateHeaderInfo() {
  usersSession = loadUsersSession();
  const mode = getAuthMode();

  ui.infoMode.textContent = mode === "token" ? "Token GED" : mode === "user" ? "JWT user" : "Aucun";
  const visibleCompanyId = mode === "token" ? session.companyId : mode === "user" ? usersSession.companyId : "";
  ui.infoTenant.textContent = shortText(visibleCompanyId);
  ui.infoProject.textContent = shortText(session.projectId);

  if (mode === "token") {
    ui.infoAuth.textContent = "Bearer token";
  } else if (mode === "user") {
    ui.infoAuth.textContent = "JWT actif";
  } else {
    ui.infoAuth.textContent = "Non connecté";
  }
}

function updateCapabilityUi() {
  const isTokenMode = getAuthMode() === "token";
  const isUserMode = getAuthMode() === "user";
  const hasProjectId = Boolean(session.projectId);
  ui.newFolderBtn.disabled = !isTokenMode;
  const canUpload = isTokenMode || (isUserMode && hasProjectId);
  ui.newDocumentBtn.disabled = !canUpload;
  ui.dropZone.style.opacity = canUpload ? "1" : "0.55";
  ui.dropZone.style.pointerEvents = canUpload ? "auto" : "none";
  ui.dropZone.textContent = canUpload
    ? "Glisse un fichier ici pour l'uploader dans ce dossier"
    : isUserMode
      ? "JWT actif. Sélectionne un projet pour uploader"
      : "Connecte-toi (JWT) et sélectionne un projet pour uploader";
}

async function requestUserApi(path, options = {}) {
  usersSession = loadUsersSession();
  if (!usersSession.jwtToken) throw new Error("JWT user manquant. Connecte-toi sur /app/login.html.");

  const res = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${usersSession.jwtToken}`,
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

function setStatus(message) {
  ui.status.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSelectedDocument() {
  return documentsState.find((doc) => doc.id === selectedDocumentId) || null;
}

function createUploadItem(name) {
  const wrapper = document.createElement("div");
  wrapper.className = "uploadItem";
  wrapper.innerHTML = `
    <strong class="uploadItem__name">${escapeHtml(name)}</strong>
    <div class="uploadProgress"><div class="uploadProgress__bar"></div></div>
    <div class="uploadItem__meta">Initialisation...</div>
  `;
  ui.uploadQueue.hidden = false;
  ui.uploadQueue.prepend(wrapper);

  return {
    setProgress(percent) {
      const bar = wrapper.querySelector(".uploadProgress__bar");
      if (bar instanceof HTMLElement) {
        bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
      }
    },
    setMeta(text) {
      const meta = wrapper.querySelector(".uploadItem__meta");
      if (meta instanceof HTMLElement) {
        meta.textContent = text;
      }
    },
    remove(afterMs = 0) {
      window.setTimeout(() => {
        wrapper.remove();
        if (!ui.uploadQueue.hasChildNodes()) {
          ui.uploadQueue.hidden = true;
        }
      }, afterMs);
    },
  };
}

async function fetchFolderTree(parentId = null, depth = 0, maxDepth = 5) {
  if (getAuthMode() !== "token") return [];
  if (depth > maxDepth) return [];

  const rows = await listFolders(session, parentId);
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const tree = [];
  for (const row of rows) {
    const node = {
      ...row,
      depth,
      children: await fetchFolderTree(row.id, depth + 1, maxDepth),
    };
    tree.push(node);
  }
  return tree;
}

function flattenTree(nodes) {
  const out = [];
  for (const node of nodes) {
    out.push(node);
    if (node.children?.length) {
      out.push(...flattenTree(node.children));
    }
  }
  return out;
}

function syncFolderFilterLabel() {
  if (!selectedFolderId) {
    ui.folderFilterLabel.textContent = "Racine";
    return;
  }
  const folder = foldersById.get(selectedFolderId);
  ui.folderFilterLabel.textContent = folder?.name || "Dossier";
}

function renderFolders(nodes) {
  if (!nodes.length) {
    ui.foldersList.innerHTML = '<div class="listItem"><small>Aucun dossier</small></div>';
    return;
  }

  const flat = flattenTree(nodes);
  ui.foldersList.innerHTML = flat
    .map((r) => {
      const isSelected = selectedFolderId === r.id;
      const indent = Math.min(r.depth * 16, 80);
      return `
        <button
          class="listItem folderNode"
          type="button"
          data-folder-id="${escapeHtml(r.id)}"
          style="padding-left:${10 + indent}px;${isSelected ? "border-color:#0b74de;background:#eef6ff;" : ""}"
        >
          <strong>${escapeHtml(r.name)}</strong><br/>
          <small>${escapeHtml(r.id)}</small>
        </button>`;
    })
    .join("");
}

function renderDocuments(rows) {
  if (!rows.length) {
    ui.documentsList.innerHTML = '<div class="listItem"><small>Aucun document</small></div>';
    return;
  }

  ui.documentsList.innerHTML = rows
    .map((r) => {
      const selected = r.id === selectedDocumentId;
      return `
        <button
          class="listItem"
          type="button"
          data-doc-id="${escapeHtml(r.id)}"
          style="width:100%;text-align:left;cursor:pointer;${selected ? "border-color:#0b74de;background:#eef6ff;" : ""}"
        >
          <strong>${escapeHtml(r.title)}</strong><br/>
          <small>${escapeHtml(r.id)} | ${escapeHtml(r.status)} | v:${escapeHtml(r.current_version_id || "-")}</small>
        </button>`;
    })
    .join("");
}

function renderDetails() {
  const doc = getSelectedDocument();
  if (!doc) {
    ui.detailsPanel.textContent = "Sélectionne un document pour voir les détails.";
    return;
  }

  ui.detailsPanel.innerHTML = `
    <div class="detailsBlock">
      <strong>${escapeHtml(doc.title)}</strong>
      <div class="detailsMeta">ID: ${escapeHtml(doc.id)}</div>
      <div class="detailsMeta">Statut: ${escapeHtml(doc.status)}</div>
      <div class="detailsMeta">Version courante: ${escapeHtml(doc.current_version_id || "-")}</div>
      <div class="detailsMeta">Créé: ${escapeHtml(doc.created_at || "-")}</div>
      <div class="detailsMeta">Mis à jour: ${escapeHtml(doc.updated_at || "-")}</div>
      <div class="detailsActions">
        <button class="btn iconBtn" type="button" id="openDocBtn" title="Ouvrir / Télécharger" aria-label="Ouvrir / Télécharger">↗</button>
      </div>
    </div>
  `;
}

async function refreshFolders() {
  if (getAuthMode() !== "token") {
    foldersState = [];
    foldersById = new Map();
    selectedFolderId = null;
    renderFolders([]);
    syncFolderFilterLabel();
    return;
  }

  foldersState = await fetchFolderTree(null);
  foldersById = new Map(flattenTree(foldersState).map((item) => [item.id, item]));

  if (selectedFolderId && !foldersById.has(selectedFolderId)) {
    selectedFolderId = null;
  }

  renderFolders(foldersState);
  syncFolderFilterLabel();
}

async function refreshDocuments() {
  let docs;
  if (getAuthMode() === "token") {
    docs = await listDocuments(session, selectedFolderId);
  } else if (getAuthMode() === "user" && session.projectId) {
    const payload = await requestUserApi(`/api/documents/projects/${encodeURIComponent(session.projectId)}`);
    docs = payload?.documents || [];
  } else {
    docs = [];
  }
  documentsState = Array.isArray(docs) ? docs : [];

  if (selectedDocumentId && !documentsState.find((d) => d.id === selectedDocumentId)) {
    selectedDocumentId = null;
  }

  renderDocuments(documentsState);
  renderDetails();
}

async function refreshAll() {
  setStatus("Chargement GED...");
  updateHeaderInfo();
  updateCapabilityUi();
  try {
    await Promise.all([refreshFolders(), refreshDocuments()]);
    if (getAuthMode() === "user" && session.projectId) {
      setStatus("GED connectée (mode lecture utilisateur).");
    } else if (getAuthMode() === "user") {
      setStatus("JWT actif. Définis un projet pour charger les documents.");
    } else if (getAuthMode() === "token") {
      setStatus("GED connectée (mode token).");
    } else {
      setStatus("Renseigne projet + token, ou connecte-toi via /app/login.html");
    }
  } catch (error) {
    setStatus(`Erreur: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

async function uploadDocumentFile(file) {
  const item = createUploadItem(file.name);
  const mode = getAuthMode();

  if (mode === "token") {
    item.setMeta("Création des métadonnées...");

    const created = await createDocument(session, {
      title: file.name,
      folderId: selectedFolderId,
      mimeType: file.type || "application/octet-stream",
    });

    if (!created?.upload?.url) {
      throw new Error("Réponse API invalide (upload.url manquant)");
    }

    item.setProgress(10);
    item.setMeta("Upload en cours...");

    await uploadVersionContent(session, created.upload.url, file, (pct) => {
      const mapped = Math.max(10, pct);
      item.setProgress(mapped);
    });

    item.setProgress(100);
    item.setMeta("Upload terminé.");
    item.remove(1200);
    selectedDocumentId = created.documentId || null;
    return;
  }

  if (mode === "user") {
    usersSession = loadUsersSession();
    if (!usersSession.jwtToken) throw new Error("JWT user manquant.");
    if (!session.projectId) throw new Error("projectId manquant.");

    item.setMeta("Initialisation upload...");
    const initPayload = await requestUserApi(`/api/documents/projects/${encodeURIComponent(session.projectId)}/files/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        byteSize: file.size || 0,
      }),
    });

    const fileId = initPayload?.file?.fileId;
    const uploadUrl = initPayload?.upload?.url;
    if (!fileId || !uploadUrl) throw new Error("Initialisation upload invalide.");

    item.setProgress(10);
    item.setMeta("Upload binaire...");

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Authorization", `Bearer ${usersSession.jwtToken}`);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const pct = Math.round((event.loaded / event.total) * 100);
        item.setProgress(Math.max(10, pct));
      };
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`Upload failed (HTTP ${xhr.status})`));
          return;
        }
        resolve(null);
      };
      xhr.onerror = () => reject(new Error("Erreur réseau pendant l'upload"));
      xhr.send(file);
    });

    item.setProgress(90);
    item.setMeta("Création document...");
    const created = await requestUserApi(`/api/documents/projects/${encodeURIComponent(session.projectId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: file.name,
        fileId,
        mimeType: file.type || "application/octet-stream",
      }),
    });

    item.setProgress(100);
    item.setMeta("Upload terminé.");
    item.remove(1200);
    selectedDocumentId = created?.document?.id || null;
    return;
  }

  throw new Error("Connecte-toi pour uploader.");
}

async function onUploadFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f instanceof File);
  if (!files.length) return;

  for (const file of files) {
    try {
      setStatus(`Traitement: ${file.name}...`);
      await uploadDocumentFile(file);
    } catch (error) {
      setStatus(`Erreur upload (${file.name}): ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  await refreshDocuments();
  setStatus("Uploads terminés.");
}

ui.refreshSessionBtn?.addEventListener("click", async () => {
  session = loadSession();
  usersSession = loadUsersSession();
  await refreshAll();
});

ui.refreshFolders.addEventListener("click", async () => {
  try {
    await refreshFolders();
    setStatus("Dossiers rafraichis.");
  } catch (error) {
    setStatus(`Erreur dossiers: ${error instanceof Error ? error.message : "unknown"}`);
  }
});

ui.refreshDocuments.addEventListener("click", async () => {
  try {
    await refreshDocuments();
    setStatus("Documents rafraichis.");
  } catch (error) {
    setStatus(`Erreur documents: ${error instanceof Error ? error.message : "unknown"}`);
  }
});

ui.clearFolderFilterBtn.addEventListener("click", async () => {
  selectedFolderId = null;
  selectedDocumentId = null;
  syncFolderFilterLabel();
  renderFolders(foldersState);
  await refreshDocuments();
  setStatus("Filtre dossier réinitialisé.");
});

ui.newFolderBtn.addEventListener("click", async () => {
  if (getAuthMode() !== "token") {
    setStatus("Création dossier disponible uniquement en mode token GED.");
    return;
  }
  const name = window.prompt("Nom du nouveau dossier");
  if (!name || !name.trim()) return;

  try {
    await createFolder(session, { name: name.trim(), parentId: selectedFolderId });
    await refreshFolders();
    setStatus(`Dossier créé: ${name.trim()}`);
  } catch (error) {
    setStatus(`Erreur création dossier: ${error instanceof Error ? error.message : "unknown"}`);
  }
});

ui.newDocumentBtn.addEventListener("click", () => {
  if (getAuthMode() === "none") {
    setStatus("Upload indisponible sans connexion.");
    return;
  }
  ui.uploadInput.value = "";
  ui.uploadInput.click();
});

ui.uploadInput.addEventListener("change", async () => {
  if (getAuthMode() === "none") return;
  await onUploadFiles(ui.uploadInput.files);
});

ui.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  ui.dropZone.classList.add("is-dragover");
});

ui.dropZone.addEventListener("dragleave", () => {
  ui.dropZone.classList.remove("is-dragover");
});

ui.dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  if (getAuthMode() === "none") return;
  ui.dropZone.classList.remove("is-dragover");
  const files = event.dataTransfer?.files;
  await onUploadFiles(files);
});

ui.foldersList.addEventListener("click", async (event) => {
  if (getAuthMode() !== "token") return;
  const target = event.target;
  const btn = target instanceof HTMLElement ? target.closest("[data-folder-id]") : null;
  if (!btn) return;

  const folderId = btn.getAttribute("data-folder-id");
  selectedFolderId = folderId || null;
  selectedDocumentId = null;

  syncFolderFilterLabel();
  renderFolders(foldersState);

  try {
    await refreshDocuments();
    setStatus(`Filtre dossier: ${foldersById.get(selectedFolderId)?.name || "Racine"}`);
  } catch (error) {
    setStatus(`Erreur filtre dossier: ${error instanceof Error ? error.message : "unknown"}`);
  }
});

ui.documentsList.addEventListener("click", (event) => {
  const target = event.target;
  const btn = target instanceof HTMLElement ? target.closest("[data-doc-id]") : null;
  if (!btn) return;

  selectedDocumentId = btn.getAttribute("data-doc-id") || null;
  renderDocuments(documentsState);
  renderDetails();
});

ui.detailsPanel.addEventListener("click", (event) => {
  const target = event.target;
  const btn = target instanceof HTMLElement ? target.closest("#openDocBtn") : null;
  if (!btn) return;

  const doc = getSelectedDocument();
  if (!doc?.id) return;

  try {
    localStorage.setItem(
      "pdfsnag_open_doc_context",
      JSON.stringify({
        authMode: getAuthMode(),
        companyId: session.companyId || "",
        projectId: session.projectId,
        projectToken: session.projectToken,
        jwtToken: usersSession.jwtToken || "",
        docId: doc.id,
        title: doc.title || "document",
        ts: Date.now(),
      })
    );
    const targetUrl = `/app/?openGedDoc=1&docId=${encodeURIComponent(doc.id)}`;
    window.location.href = targetUrl;
  } catch (error) {
    setStatus(`Erreur ouverture viewer: ${error instanceof Error ? error.message : "unknown"}`);
  }
});

syncFolderFilterLabel();
updateHeaderInfo();
updateCapabilityUi();
if ((session.companyId && session.projectId && session.projectToken) || usersSession.jwtToken) {
  refreshAll();
}
