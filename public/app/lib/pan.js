export function installDesktopPan(ui, hasDoc, canPan = () => true) {
  const pan = { active: false, pointerId: null, x: 0, y: 0 };

  ui.viewerContainer.addEventListener(
    "pointerdown",
    (e) => {
      if (!hasDoc() || !canPan() || e.pointerType !== "mouse" || e.button !== 0) return;
      pan.active = true;
      pan.pointerId = e.pointerId;
      pan.x = e.clientX;
      pan.y = e.clientY;
      ui.viewerContainer.classList.add("is-panning");
      try {
        ui.viewerContainer.setPointerCapture(e.pointerId);
      } catch {}
      e.preventDefault();
    },
    { passive: false }
  );

  ui.viewerContainer.addEventListener(
    "pointermove",
    (e) => {
      if (!pan.active || e.pointerId !== pan.pointerId) return;
      const dx = e.clientX - pan.x;
      const dy = e.clientY - pan.y;
      pan.x = e.clientX;
      pan.y = e.clientY;
      ui.viewerContainer.scrollLeft -= dx;
      ui.viewerContainer.scrollTop -= dy;
      e.preventDefault();
    },
    { passive: false }
  );

  const endPan = (e) => {
    if (!pan.active || e.pointerId !== pan.pointerId) return;
    pan.active = false;
    pan.pointerId = null;
    ui.viewerContainer.classList.remove("is-panning");
  };

  ui.viewerContainer.addEventListener("pointerup", endPan, { passive: true });
  ui.viewerContainer.addEventListener("pointercancel", endPan, { passive: true });
}
