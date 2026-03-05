import { createViewer, openFromFile } from "./lib/core.js";
import { getUI, setStatus, setZoomLabel } from "./lib/ui.js";
import { installDesktopZoom } from "./lib/zoom.js";
import { installDesktopPan } from "./lib/pan.js";
import { installMobilePan } from "./lib/mobile-pan.js";
import { installMobilePinch } from "./lib/pinch.js";
import { bindThumbnailSync, buildThumbnails } from "./lib/thumbnails.js";
import { installAnnotationTools } from "./lib/annotations.js";

const ui = getUI();
const state = createViewer(ui);
bindThumbnailSync(state, ui);
const annotationTypes = state.pdfjsLib.AnnotationEditorType;
let annotationMode = annotationTypes.NONE;

installAnnotationTools(state, ui, (mode) => {
  annotationMode = mode;
});

let thumbsVisible = true;
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
