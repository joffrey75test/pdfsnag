import { PINCH, WHEEL, ZOOM } from "./config.js";
import { setZoomLabel } from "./ui.js";

export function clampScale(s) {
  return Math.min(PINCH.MAX_SCALE, Math.max(PINCH.MIN_SCALE, s));
}

function getOriginInContainer(container, clientX, clientY) {
  const r = container.getBoundingClientRect();
  return [clientX - r.left, clientY - r.top];
}

export function zoomByFactor(state, ui, factor, clientX, clientY) {
  if (!state.pdfDoc) return;
  const current = state.pdfViewer.currentScale || 1;
  const next = clampScale(current * factor);
  const scaleFactor = next / current;
  if (!isFinite(scaleFactor) || Math.abs(scaleFactor - 1) < 1e-6) return;

  const origin = clientX != null && clientY != null
    ? getOriginInContainer(ui.viewerContainer, clientX, clientY)
    : [ui.viewerContainer.clientWidth / 2, ui.viewerContainer.clientHeight / 2];

  state.pdfViewer.updateScale({
    scaleFactor,
    origin,
    drawingDelay: PINCH.DRAWING_DELAY,
  });
}

export function installDesktopZoom(state, ui) {
  ui.zoomFitBtn?.addEventListener("click", () => {
    if (!state.pdfDoc) return;
    state.pdfViewer.currentScaleValue = "page-fit";
  });

  ui.zoomOutBtn?.addEventListener("click", () => {
    zoomByFactor(state, ui, ZOOM.STEP_OUT);
  });

  ui.zoomInBtn?.addEventListener("click", () => {
    zoomByFactor(state, ui, ZOOM.STEP_IN);
  });

  ui.viewerContainer.addEventListener(
    "wheel",
    (e) => {
      if (!state.pdfDoc || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * WHEEL.SPEED);
      zoomByFactor(state, ui, factor, e.clientX, e.clientY);
    },
    { passive: false }
  );

  state.eventBus.on("scalechanging", ({ scale }) => {
    setZoomLabel(ui, scale);
  });
}
