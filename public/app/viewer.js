import { createViewer, openFromFile } from "./lib/core.js";
import { getUI, setStatus, setZoomLabel } from "./lib/ui.js";
import { installDesktopZoom } from "./lib/zoom.js";
import { installDesktopPan } from "./lib/pan.js";
import { installMobilePan } from "./lib/mobile-pan.js";
import { installMobilePinch } from "./lib/pinch.js";
import { bindThumbnailSync, buildThumbnails } from "./lib/thumbnails.js";
import { installAnnotationTools } from "./lib/annotations.js";
import { installCloudTool } from "./lib/cloud.js";

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
    if (ui.deleteSelectedAnnotationBtn) ui.deleteSelectedAnnotationBtn.disabled = true;
    if (ui.newCommentText) ui.newCommentText.disabled = true;
    if (ui.addCommentBtn) ui.addCommentBtn.disabled = true;
    setReplyTarget(null);
    renderDiscussion(null);
    return;
  }

  ui.commentMeta.textContent = `Nuage • page ${annotation.page} • ${annotation.id}`;
  ui.commentText.value = annotation.content?.text || "";
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
  (annotation) => {
    cloudAnnotations.push(annotation);
    setCommentsVisible(true);
    // Show discussion panel on the newly created object, without selecting it on-canvas.
    renderSelectedComment(annotation, { canDelete: false });
    // Exposed for quick manual test and future API wiring.
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

ui.deleteSelectedAnnotationBtn?.addEventListener("click", () => {
  const deleted = cloudTool?.deleteSelectedCloud?.();
  if (!deleted) {
    setStatus(ui, "Aucun objet sélectionné");
    return;
  }
  setStatus(ui, `Nuage supprimé (soft delete)`);
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
  window.__cloudAnnotations = cloudAnnotations;
  console.log("Comment added:", comment);
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
});

function hasDoc() {
  return !!state.pdfDoc;
}

ui.fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    await openFromFile(state, ui, file);
    await buildThumbnails(state, ui);
  } catch (err) {
    console.error(err);
    setStatus(ui, "Erreur de chargement");
  }
});

state.eventBus.on("pagesinit", () => {
  state.pdfViewer.currentScale = 1.0;
  setZoomLabel(ui, state.pdfViewer.currentScale || 1);
  applyPdfJsStyle();
  renderSelectedComment(null);
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
