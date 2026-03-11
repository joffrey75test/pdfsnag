import { createViewer, openFromFile } from "./lib/core.js";
import { getUI, setStatus, setZoomLabel } from "./lib/ui.js";
import { installDesktopZoom } from "./lib/zoom.js";
import { installDesktopPan } from "./lib/pan.js";
import { installMobilePan } from "./lib/mobile-pan.js";
import { installMobilePinch } from "./lib/pinch.js";
import { bindThumbnailSync, buildThumbnails } from "./lib/thumbnails.js";
import { installAnnotationTools } from "./lib/annotations.js";
import { installCloudTool } from "./lib/cloud.js";
import { loadSession as loadUsersSession } from "./lib/users-api.js";

const ui = getUI();
const state = createViewer(ui);
bindThumbnailSync(state, ui);
const annotationTypes = state.pdfjsLib.AnnotationEditorType;
let annotationMode = annotationTypes.NONE;
const cloudAnnotations = [];
window.__cloudAnnotations = cloudAnnotations;
const drawingStyle = {
  strokeColor: ui.strokeColorInput?.value || "#ff0000",
  strokeWidth: Math.max(1, Number(ui.strokeWidthInput?.value || 4)),
  strokeStyle: ui.strokeStyleSelect?.value || "solid",
};
window.__drawingStyle = drawingStyle;
let selectedAnnotation = null;
let replyParentId = null;
let cloudTool = null;
let activeDocumentContext = null;
let contentSyncTimer = 0;

function isPersistedAnnotationId(annotationId) {
  return typeof annotationId === "string" && annotationId.startsWith("ann_");
}

function syncCloudAnnotationsFromTool() {
  const next = cloudTool?.getAnnotations?.() || [];
  cloudAnnotations.splice(0, cloudAnnotations.length, ...next);
  window.__cloudAnnotations = cloudAnnotations;
}

async function apiRequest(path, options = {}) {
  const usersSession = loadUsersSession();
  const authHeaders = usersSession?.jwtToken ? { Authorization: `Bearer ${usersSession.jwtToken}` } : {};

  const res = await fetch(path, {
    ...options,
    headers: {
      ...authHeaders,
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

function getAnnotationContext() {
  if (!activeDocumentContext?.projectId || !activeDocumentContext?.docId) return null;
  return {
    projectId: String(activeDocumentContext.projectId),
    documentId: String(activeDocumentContext.docId),
  };
}

function toBackendAnnotationPayload(annotation) {
  return {
    page: Number(annotation?.page),
    geometry: annotation?.geometry,
    style: annotation?.style,
    content: annotation?.content || { text: "", tags: [] },
    discussion: Array.isArray(annotation?.discussion) ? annotation.discussion : [],
  };
}

async function fetchCloudAnnotationsFromApi() {
  const ctx = getAnnotationContext();
  if (!ctx) return [];

  const payload = await apiRequest(
    `/api/documents/projects/${encodeURIComponent(ctx.projectId)}/documents/${encodeURIComponent(ctx.documentId)}/annotations`
  );
  return Array.isArray(payload?.annotations) ? payload.annotations : [];
}

async function createCloudAnnotationInApi(annotation) {
  const ctx = getAnnotationContext();
  if (!ctx) return null;

  const payload = await apiRequest(
    `/api/documents/projects/${encodeURIComponent(ctx.projectId)}/documents/${encodeURIComponent(ctx.documentId)}/annotations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toBackendAnnotationPayload(annotation)),
    }
  );
  return payload?.annotation || null;
}

async function patchCloudAnnotationInApi(annotation) {
  const ctx = getAnnotationContext();
  if (!ctx || !isPersistedAnnotationId(annotation?.id)) return null;

  const payload = await apiRequest(
    `/api/documents/projects/${encodeURIComponent(ctx.projectId)}/documents/${encodeURIComponent(ctx.documentId)}/annotations/${encodeURIComponent(annotation.id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        geometry: annotation.geometry,
        style: annotation.style,
        content: annotation.content || { text: "", tags: [] },
        discussion: Array.isArray(annotation.discussion) ? annotation.discussion : [],
        status: annotation.status || "active",
      }),
    }
  );
  return payload?.annotation || null;
}

async function deleteCloudAnnotationInApi(annotationId) {
  const ctx = getAnnotationContext();
  if (!ctx || !isPersistedAnnotationId(annotationId)) return;

  await apiRequest(
    `/api/documents/projects/${encodeURIComponent(ctx.projectId)}/documents/${encodeURIComponent(ctx.documentId)}/annotations/${encodeURIComponent(annotationId)}`,
    { method: "DELETE" }
  );
}

async function syncCreatedAnnotation(annotation) {
  if (!getAnnotationContext()) return;
  try {
    const saved = await createCloudAnnotationInApi(annotation);
    if (saved?.id) {
      cloudTool?.replaceAnnotation?.(annotation.id, saved);
      syncCloudAnnotationsFromTool();
      setStatus(ui, "Annotation enregistrée");
    }
  } catch (error) {
    setStatus(ui, `Annotation locale uniquement: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

async function syncUpdatedAnnotation(annotation) {
  if (!annotation || !getAnnotationContext() || !isPersistedAnnotationId(annotation.id)) return;
  try {
    const saved = await patchCloudAnnotationInApi(annotation);
    if (saved?.id) {
      cloudTool?.replaceAnnotation?.(annotation.id, saved);
      syncCloudAnnotationsFromTool();
    }
  } catch (error) {
    setStatus(ui, `Échec sync annotation: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

async function loadCloudAnnotationsForActiveDocument() {
  if (!getAnnotationContext()) {
    cloudTool?.setAnnotations?.([]);
    syncCloudAnnotationsFromTool();
    return;
  }

  try {
    const annotations = await fetchCloudAnnotationsFromApi();
    cloudTool?.setAnnotations?.(annotations);
    syncCloudAnnotationsFromTool();
    setStatus(ui, `Annotations chargées: ${annotations.length}`);
  } catch (error) {
    setStatus(ui, `Annotations non synchronisées: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

function setReplyTarget(comment) {
  if (!ui.replyTarget || !ui.cancelReplyBtn) return;
  if (!comment) {
    replyParentId = null;
    ui.replyTarget.hidden = true;
    ui.replyTarget.textContent = "";
    ui.cancelReplyBtn.hidden = true;
    return;
  }
  replyParentId = comment.id;
  ui.replyTarget.hidden = false;
  ui.replyTarget.textContent = `Réponse à: ${comment.text.slice(0, 80)}`;
  ui.cancelReplyBtn.hidden = false;
}

function ensureDiscussion(annotation) {
  if (!annotation) return [];
  if (!Array.isArray(annotation.discussion)) annotation.discussion = [];
  return annotation.discussion;
}

function findCommentById(annotation, commentId) {
  if (!annotation || !commentId) return null;
  return ensureDiscussion(annotation).find((item) => item.id === commentId) || null;
}

function createComment(text, parentId = null) {
  const now = new Date().toISOString();
  return {
    id: `cmt_${crypto.randomUUID()}`,
    parentId,
    text,
    author: {
      userId: "local-user",
      name: "Local User",
    },
    createdAt: now,
    updatedAt: now,
    status: "active",
  };
}

function renderDiscussion(annotation) {
  if (!ui.commentThread) return;
  ui.commentThread.innerHTML = "";

  if (!annotation) {
    ui.commentThread.textContent = "Sélectionne un objet pour voir la discussion.";
    return;
  }

  const all = ensureDiscussion(annotation).filter((item) => item.status !== "deleted");
  if (all.length === 0) {
    ui.commentThread.textContent = "Aucun commentaire pour cet objet.";
    return;
  }

  const byParent = new Map();
  for (const item of all) {
    const key = item.parentId || "__root__";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(item);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  }

  const renderList = (parentId, level) => {
    const list = byParent.get(parentId || "__root__") || [];
    for (const item of list) {
      const row = document.createElement("div");
      row.className = "threadItem";
      row.style.marginLeft = `${level * 14}px`;

      const meta = document.createElement("div");
      meta.className = "threadMeta";
      const author = item.author?.name || "Utilisateur";
      meta.textContent = `${author} • ${new Date(item.createdAt).toLocaleString()}`;

      const body = document.createElement("div");
      body.className = "threadBody";
      body.textContent = item.text || "";

      const replyBtn = document.createElement("button");
      replyBtn.type = "button";
      replyBtn.className = "threadReplyBtn";
      replyBtn.dataset.commentId = item.id;
      replyBtn.textContent = "Répondre";

      row.append(meta, body, replyBtn);
      ui.commentThread.appendChild(row);
      renderList(item.id, level + 1);
    }
  };

  renderList(null, 0);
}

function renderSelectedComment(annotation, options = {}) {
  const { canDelete = true } = options;
  if (!ui.commentMeta || !ui.commentText) return;
  selectedAnnotation = annotation;
  if (!annotation) {
    ui.commentMeta.textContent = "Aucun objet sélectionné";
    ui.commentText.value = "";
    ui.commentText.disabled = true;
    ui.commentText.readOnly = true;
    if (ui.deleteSelectedAnnotationBtn) ui.deleteSelectedAnnotationBtn.disabled = true;
    if (ui.newCommentText) ui.newCommentText.disabled = true;
    if (ui.addCommentBtn) ui.addCommentBtn.disabled = true;
    setReplyTarget(null);
    renderDiscussion(null);
    return;
  }

  ui.commentMeta.textContent = `Nuage • page ${annotation.page} • ${annotation.id}`;
  ui.commentText.value = annotation.content?.text || "";
  ui.commentText.disabled = false;
  ui.commentText.readOnly = false;
  if (ui.deleteSelectedAnnotationBtn) ui.deleteSelectedAnnotationBtn.disabled = !canDelete;
  if (ui.newCommentText) ui.newCommentText.disabled = false;
  if (ui.addCommentBtn) ui.addCommentBtn.disabled = false;
  renderDiscussion(annotation);
  ui.commentSidebar?.scrollTo({ top: 0, behavior: "smooth" });
}

function applyPdfJsStyle() {
  const params = state.pdfjsLib.AnnotationEditorParamsType;
  if (!params) return;
  state.eventBus.dispatch("switchannotationeditorparams", {
    source: null,
    type: params.INK_COLOR,
    value: drawingStyle.strokeColor,
  });
  state.eventBus.dispatch("switchannotationeditorparams", {
    source: null,
    type: params.INK_THICKNESS,
    value: drawingStyle.strokeWidth,
  });
  state.eventBus.dispatch("switchannotationeditorparams", {
    source: null,
    type: params.HIGHLIGHT_COLOR,
    value: drawingStyle.strokeColor,
  });
  state.eventBus.dispatch("switchannotationeditorparams", {
    source: null,
    type: params.HIGHLIGHT_THICKNESS,
    value: drawingStyle.strokeWidth,
  });
}

function refreshDrawingStyleFromUI() {
  if (ui.strokeColorInput?.value) drawingStyle.strokeColor = ui.strokeColorInput.value;
  if (ui.strokeWidthInput?.value) drawingStyle.strokeWidth = Math.max(1, Number(ui.strokeWidthInput.value || 4));
  if (ui.strokeStyleSelect?.value) drawingStyle.strokeStyle = ui.strokeStyleSelect.value;
  applyPdfJsStyle();
}

installAnnotationTools(state, ui, (mode) => {
  annotationMode = mode;
  if (mode !== annotationTypes.NONE) {
    cloudTool?.clearSelection?.();
  }
});

cloudTool = installCloudTool(
  ui,
  () => annotationMode === "cloud",
  () => annotationMode === annotationTypes.NONE,
  () => drawingStyle,
  () => state.pdfViewer.currentScale || 1,
  (annotation) => {
    cloudAnnotations.push(annotation);
    setCommentsVisible(true);
    // Show discussion panel on the newly created object, without selecting it on-canvas.
    renderSelectedComment(annotation, { canDelete: false });
    syncCloudAnnotationsFromTool();
    void syncCreatedAnnotation(annotation);
    window.__cloudAnnotations = cloudAnnotations;
    console.log("Cloud annotation created:", annotation);
  },
  (selectedAnnotation) => renderSelectedComment(selectedAnnotation),
  () => {
    setStatus(ui, "Objet supprimé");
  }
);

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  cloudTool?.clearSelection?.();
  setStatus(ui, "Sélection annulée");
});

ui.deleteSelectedAnnotationBtn?.addEventListener("click", async () => {
  const deleted = cloudTool?.deleteSelectedCloud?.();
  if (!deleted) {
    setStatus(ui, "Aucun objet sélectionné");
    return;
  }
  syncCloudAnnotationsFromTool();
  try {
    await deleteCloudAnnotationInApi(deleted.id);
    setStatus(ui, "Nuage supprimé");
  } catch (error) {
    setStatus(ui, `Suppression locale uniquement: ${error instanceof Error ? error.message : "unknown"}`);
  }
  window.__cloudAnnotations = cloudAnnotations;
  console.log("Cloud annotation soft-deleted:", deleted);
});

ui.commentThread?.addEventListener("click", (e) => {
  const btn = e.target.closest("button.threadReplyBtn");
  if (!btn || !selectedAnnotation) return;
  const comment = findCommentById(selectedAnnotation, btn.dataset.commentId);
  if (!comment) return;
  setReplyTarget(comment);
  ui.newCommentText?.focus();
});

ui.cancelReplyBtn?.addEventListener("click", () => {
  setReplyTarget(null);
});

ui.addCommentBtn?.addEventListener("click", () => {
  if (!selectedAnnotation || !ui.newCommentText) return;
  const text = ui.newCommentText.value.trim();
  if (!text) return;
  const comment = createComment(text, replyParentId);
  ensureDiscussion(selectedAnnotation).push(comment);
  selectedAnnotation.updatedAt = new Date().toISOString();
  ui.newCommentText.value = "";
  setReplyTarget(null);
  renderSelectedComment(selectedAnnotation);
  syncCloudAnnotationsFromTool();
  void syncUpdatedAnnotation(selectedAnnotation);
  window.__cloudAnnotations = cloudAnnotations;
  console.log("Comment added:", comment);
});

ui.commentText?.addEventListener("input", () => {
  if (!selectedAnnotation || !ui.commentText) return;
  if (!selectedAnnotation.content || typeof selectedAnnotation.content !== "object") {
    selectedAnnotation.content = { text: "", tags: [] };
  }

  selectedAnnotation.content.text = ui.commentText.value;
  selectedAnnotation.updatedAt = new Date().toISOString();
  syncCloudAnnotationsFromTool();

  clearTimeout(contentSyncTimer);
  contentSyncTimer = setTimeout(() => {
    void syncUpdatedAnnotation(selectedAnnotation);
  }, 350);
});

ui.strokeColorInput?.addEventListener("input", refreshDrawingStyleFromUI);
ui.strokeWidthInput?.addEventListener("input", refreshDrawingStyleFromUI);
ui.strokeStyleSelect?.addEventListener("change", refreshDrawingStyleFromUI);

let thumbsVisible = true;
let commentsVisible = true;
let thumbsRebuildTimer = 0;

function scheduleThumbsRebuild() {
  if (!state.pdfDoc || !thumbsVisible) return;
  clearTimeout(thumbsRebuildTimer);
  thumbsRebuildTimer = setTimeout(() => {
    buildThumbnails(state, ui).catch((err) => console.error(err));
  }, 120);
}

if (ui.toggleThumbsBtn) {
  ui.toggleThumbsBtn.addEventListener("click", () => {
    thumbsVisible = !thumbsVisible;
    document.body.classList.toggle("thumbs-hidden", !thumbsVisible);
    ui.toggleThumbsBtn.setAttribute("aria-pressed", String(thumbsVisible));
    scheduleThumbsRebuild();
  });
}

function setCommentsVisible(visible) {
  commentsVisible = visible;
  document.body.classList.toggle("comments-hidden", !visible);
  ui.toggleCommentsBtn?.setAttribute("aria-pressed", String(visible));
}

ui.toggleCommentsBtn?.addEventListener("click", () => {
  setCommentsVisible(!commentsVisible);
});

ui.hideCommentSidebarBtn?.addEventListener("click", () => {
  setCommentsVisible(false);
});
setCommentsVisible(true);

const resizer = document.getElementById("thumbsResizer");
if (resizer) {
  const MIN = 140;
  const MAX = 420;
  let active = false;

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const setWidth = (px) => {
    document.documentElement.style.setProperty("--thumbs-width", `${px}px`);
  };

  resizer.addEventListener("pointerdown", (e) => {
    if (!thumbsVisible || e.button !== 0) return;
    active = true;
    document.body.classList.add("is-resizing");
    resizer.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });

  window.addEventListener("pointermove", (e) => {
    if (!active) return;
    setWidth(clamp(e.clientX, MIN, MAX));
  });

  const endResize = () => {
    if (!active) return;
    active = false;
    document.body.classList.remove("is-resizing");
    scheduleThumbsRebuild();
  };

  window.addEventListener("pointerup", endResize);
  window.addEventListener("pointercancel", endResize);
}

if (ui.commentResizer) {
  const MIN = 220;
  const MAX = 520;
  let active = false;

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const setWidth = (px) => {
    document.documentElement.style.setProperty("--comments-width", `${px}px`);
  };

  ui.commentResizer.addEventListener("pointerdown", (e) => {
    if (!commentsVisible || e.button !== 0) return;
    active = true;
    document.body.classList.add("is-resizing");
    ui.commentResizer.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });

  window.addEventListener("pointermove", (e) => {
    if (!active) return;
    const width = clamp(window.innerWidth - e.clientX, MIN, MAX);
    setWidth(width);
  });

  const endResize = () => {
    if (!active) return;
    active = false;
    document.body.classList.remove("is-resizing");
  };

  window.addEventListener("pointerup", endResize);
  window.addEventListener("pointercancel", endResize);
}

window.addEventListener("resize", () => {
  scheduleThumbsRebuild();
  cloudTool?.refresh?.();
});

function hasDoc() {
  return !!state.pdfDoc;
}

async function openFromGedContextIfAny() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("openGedDoc") !== "1") return;

  const docId = params.get("docId");
  if (!docId) return;

  let context = null;
  try {
    const raw = localStorage.getItem("pdfsnag_open_doc_context");
    context = raw ? JSON.parse(raw) : null;
  } catch {
    context = null;
  }

  if (!context || context.docId !== docId) {
    setStatus(ui, "Contexte GED introuvable");
    return;
  }
  localStorage.removeItem("pdfsnag_open_doc_context");
  activeDocumentContext = context;

  let blob;
  let contentType = "application/pdf";
  if (context.authMode === "user") {
    const jwtToken = context.jwtToken || loadUsersSession().jwtToken;
    const dlPayload = await apiRequest(`/api/documents/${encodeURIComponent(docId)}/download`, {
      headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
    });
    const downloadUrl = dlPayload?.downloadUrl;
    if (!downloadUrl) {
      setStatus(ui, "Erreur ouverture GED (downloadUrl manquant)");
      return;
    }
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      setStatus(ui, `Erreur ouverture GED (${res.status})`);
      return;
    }
    blob = await res.blob();
    contentType = res.headers.get("content-type") || contentType;
  } else {
    const url = `/projects/${encodeURIComponent(context.projectId)}/documents/${encodeURIComponent(docId)}/content`;
    const companyId = context.companyId || "";
    const res = await fetch(url, {
      headers: {
        "x-company-id": companyId,
        Authorization: `Bearer ${context.projectToken}`,
      },
    });
    if (!res.ok) {
      setStatus(ui, `Erreur ouverture GED (${res.status})`);
      return;
    }
    blob = await res.blob();
    contentType = res.headers.get("content-type") || contentType;
  }

  const file = new File([blob], `${context.title || "document"}.pdf`, { type: contentType || "application/pdf" });

  await openFromFile(state, ui, file);
  await buildThumbnails(state, ui);
  await loadCloudAnnotationsForActiveDocument();
  setStatus(ui, `Ouvert depuis GED: ${context.title || docId}`);
}

ui.fileInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    activeDocumentContext = null;
    await openFromFile(state, ui, file);
    await buildThumbnails(state, ui);
    cloudTool?.setAnnotations?.([]);
    syncCloudAnnotationsFromTool();
  } catch (err) {
    console.error(err);
    setStatus(ui, "Erreur de chargement");
  }
});

state.eventBus.on("pagesinit", () => {
  state.pdfViewer.currentScale = 1.0;
  setZoomLabel(ui, state.pdfViewer.currentScale || 1);
  applyPdfJsStyle();
  cloudTool?.refresh?.();
  renderSelectedComment(null);
});

state.eventBus.on("scalechanging", () => {
  // Reproject cloud overlays to current page viewport dimensions.
  cloudTool?.refresh?.();
  setTimeout(() => cloudTool?.refresh?.(), 60);
  setTimeout(() => cloudTool?.refresh?.(), 180);
});

installDesktopZoom(state, ui);
installDesktopPan(ui, hasDoc, () => annotationMode === annotationTypes.NONE);
installMobilePan(ui, hasDoc, () => annotationMode === annotationTypes.NONE);
installMobilePinch(
  state,
  ui,
  (msg) => setStatus(ui, msg),
  () => setZoomLabel(ui, state.pdfViewer.currentScale || 1)
);

openFromGedContextIfAny().catch((err) => {
  console.error(err);
  setStatus(ui, "Erreur ouverture GED");
});
