export function installMobilePan(ui, hasDoc, canPan = () => true) {
  const pan = { active: false, x: 0, y: 0, dx: 0, dy: 0, raf: 0 };

  function flushPan() {
    pan.raf = 0;
    if (!pan.active) {
      pan.dx = 0;
      pan.dy = 0;
      return;
    }
    if (pan.dx !== 0 || pan.dy !== 0) {
      ui.viewerContainer.scrollLeft -= pan.dx;
      ui.viewerContainer.scrollTop -= pan.dy;
      pan.dx = 0;
      pan.dy = 0;
    }
  }

  ui.viewerContainer.addEventListener(
    "touchstart",
    (e) => {
      if (!hasDoc() || !canPan() || !e.touches || e.touches.length !== 1) return;
      const t = e.touches[0];
      pan.active = true;
      pan.x = t.clientX;
      pan.y = t.clientY;
    },
    { passive: true }
  );

  ui.viewerContainer.addEventListener(
    "touchmove",
    (e) => {
      if (!pan.active || !e.touches || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - pan.x;
      const dy = t.clientY - pan.y;
      pan.x = t.clientX;
      pan.y = t.clientY;

      pan.dx += dx;
      pan.dy += dy;
      if (!pan.raf) {
        pan.raf = requestAnimationFrame(flushPan);
      }
      e.preventDefault();
    },
    { passive: false }
  );

  const stop = () => {
    pan.active = false;
    if (pan.raf) {
      cancelAnimationFrame(pan.raf);
      pan.raf = 0;
    }
    pan.dx = 0;
    pan.dy = 0;
  };

  ui.viewerContainer.addEventListener("touchend", stop, { passive: true });
  ui.viewerContainer.addEventListener("touchcancel", stop, { passive: true });
}
