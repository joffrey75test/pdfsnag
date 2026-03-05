import {
  createDocument,
  createFolder,
  listDocuments,
  listFolders,
  loadSession,
  saveSession,
  uploadVersionContent,
} from "/app/lib/ged-api.js";

const ui = {
  tenantId: document.getElementById("tenantId"),
  projectId: document.getElementById("projectId"),
  projectToken: document.getElementById("projectToken"),
  connectBtn: document.getElementById("connectBtn"),
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
let foldersState = [];
let foldersById = new Map();
let documentsState = [];
let selectedFolderId = null;
let selectedDocumentId = null;

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

  const url = `/projects/${encodeURIComponent(session.projectId)}/documents/${encodeURIComponent(doc.id)}/content`;
  ui.detailsPanel.innerHTML = `
    <div class="detailsBlock">
      <strong>${escapeHtml(doc.title)}</strong>
      <div class="detailsMeta">ID: ${escapeHtml(doc.id)}</div>
      <div class="detailsMeta">Statut: ${escapeHtml(doc.status)}</div>
      <div class="detailsMeta">Version courante: ${escapeHtml(doc.current_version_id || "-")}</div>
      <div class="detailsMeta">Créé: ${escapeHtml(doc.created_at || "-")}</div>
      <div class="detailsMeta">Mis à jour: ${escapeHtml(doc.updated_at || "-")}</div>
      <div class="detailsActions">
        <button class="btn iconBtn" type="button" id="openDocBtn" data-doc-url="${escapeHtml(url)}" title="Ouvrir / Télécharger" aria-label="Ouvrir / Télécharger">↗</button>
      </div>
    </div>
  `;
}

async function refreshFolders() {
  foldersState = await fetchFolderTree(null);
  foldersById = new Map(flattenTree(foldersState).map((item) => [item.id, item]));

  if (selectedFolderId && !foldersById.has(selectedFolderId)) {
    selectedFolderId = null;
  }

  renderFolders(foldersState);
  syncFolderFilterLabel();
}

async function refreshDocuments() {
  const docs = await listDocuments(session, selectedFolderId);
  documentsState = Array.isArray(docs) ? docs : [];

  if (selectedDocumentId && !documentsState.find((d) => d.id === selectedDocumentId)) {
    selectedDocumentId = null;
  }

  renderDocuments(documentsState);
  renderDetails();
}

async function refreshAll() {
  setStatus("Chargement GED...");
  try {
    await Promise.all([refreshFolders(), refreshDocuments()]);
    setStatus("GED connectée.");
  } catch (error) {
    setStatus(`Erreur: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

function syncFormFromSession() {
  ui.tenantId.value = session.tenantId;
  ui.projectId.value = session.projectId;
  ui.projectToken.value = session.projectToken;
}

async function uploadDocumentFile(file) {
  const item = createUploadItem(file.name);
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

ui.connectBtn.addEventListener("click", async () => {
  session = {
    tenantId: ui.tenantId.value.trim(),
    projectId: ui.projectId.value.trim(),
    projectToken: ui.projectToken.value.trim(),
  };
  saveSession(session);
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
  ui.uploadInput.value = "";
  ui.uploadInput.click();
});

ui.uploadInput.addEventListener("change", async () => {
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
  ui.dropZone.classList.remove("is-dragover");
  const files = event.dataTransfer?.files;
  await onUploadFiles(files);
});

ui.foldersList.addEventListener("click", async (event) => {
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

  const url = btn.getAttribute("data-doc-url");
  if (!url) return;

  fetch(url, {
    headers: {
      "x-tenant-id": session.tenantId,
      Authorization: `Bearer ${session.projectToken}`,
    },
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res.blob();
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    })
    .catch((error) => {
      setStatus(`Erreur ouverture document: ${error instanceof Error ? error.message : "unknown"}`);
    });
});

syncFormFromSession();
syncFolderFilterLabel();
if (session.tenantId && session.projectId && session.projectToken) {
  refreshAll();
}
