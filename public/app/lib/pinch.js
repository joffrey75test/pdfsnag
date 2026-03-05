import { PINCH } from "./config.js";

function getDistAndMid(t0, t1) {
  const dx = t0.clientX - t1.clientX;
  const dy = t0.clientY - t1.clientY;
  return {
    dist: Math.hypot(dx, dy),
    midX: (t0.clientX + t1.clientX) / 2,
    midY: (t0.clientY + t1.clientY) / 2,
  };
}

function getOriginInContainer(container, clientX, clientY) {
  const r = container.getBoundingClientRect();
  return [clientX - r.left, clientY - r.top];
}

function clampScale(s) {
  return Math.min(PINCH.MAX_SCALE, Math.max(PINCH.MIN_SCALE, s));
}

function quantizeScale(s) {
  const q = PINCH.QUANTUM;
  if (!q) return s;
  return Math.round(s / q) * q;
}

export function installMobilePinch(state, ui, setStatus, updateZoomLabel) {
  const pinch = {
    active: false,
    prevDist: 0,
    raf: 0,
    lastFrameTs: 0,
    pending: null,
  };

  function applyPinch(prevDist, newDist, originX, originY) {
    if (!state.pdfDoc) return;
    if (Math.abs(newDist - prevDist) < PINCH.MIN_MOVE_DELTA) return;

    const current = state.pdfViewer.currentScale || 1;
    const raw = newDist / Math.max(1, prevDist);
    const rawFactor = Math.pow(raw, PINCH.SPEED_POWER);
    const nextScale = clampScale(quantizeScale(current * rawFactor));
    const scaleFactor = nextScale / current;
    if (!isFinite(scaleFactor) || Math.abs(scaleFactor - 1) < 1e-6) return;

    const origin = getOriginInContainer(ui.viewerContainer, originX, originY);
    state.pdfViewer.updateScale({
      scaleFactor,
      origin,
      drawingDelay: PINCH.DRAWING_DELAY,
    });
    setStatus("Pinch...");
  }

  function schedule(prevDist, newDist, originX, originY) {
    pinch.pending = { prevDist, newDist, originX, originY };
    if (pinch.raf) return;

    pinch.raf = requestAnimationFrame((ts) => {
      pinch.raf = 0;
      const p = pinch.pending;
      pinch.pending = null;
      if (!p) return;

      if (PINCH.USE_30FPS_THROTTLE) {
        if (ts - pinch.lastFrameTs < PINCH.FRAME_MS) {
          schedule(p.prevDist, p.newDist, p.originX, p.originY);
          return;
        }
        pinch.lastFrameTs = ts;
      }

      applyPinch(p.prevDist, p.newDist, p.originX, p.originY);
    });
  }

  function endPinch() {
    pinch.active = false;
    pinch.prevDist = 0;
    pinch.pending = null;
    ui.viewerContainer.style.touchAction = "pan-x pan-y";
    setStatus("");
    updateZoomLabel();
  }

  ui.viewerContainer.addEventListener(
    "touchstart",
    (e) => {
      if (!state.pdfDoc || e.touches.length < 2) return;
      const { dist } = getDistAndMid(e.touches[0], e.touches[1]);
      if (dist < PINCH.MIN_START_DIST) return;
      pinch.active = true;
      pinch.prevDist = dist;
      ui.viewerContainer.style.touchAction = "none";
      e.preventDefault();
    },
    { passive: false }
  );

  ui.viewerContainer.addEventListener(
    "touchmove",
    (e) => {
      if (!pinch.active) return;
      if (e.touches.length < 2) {
        endPinch();
        return;
      }
      const { dist: newDist, midX, midY } = getDistAndMid(e.touches[0], e.touches[1]);
      const prevDist = pinch.prevDist || newDist;
      pinch.prevDist = newDist;
      schedule(prevDist, newDist, midX, midY);
      e.preventDefault();
    },
    { passive: false }
  );

  ui.viewerContainer.addEventListener("touchend", () => pinch.active && endPinch(), { passive: true });
  ui.viewerContainer.addEventListener("touchcancel", () => pinch.active && endPinch(), { passive: true });

  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
}
