function setButtonsActive(ui, mode, types) {
  ui.toolSelectBtn?.classList.toggle("is-active", mode === types.NONE);
  ui.toolTextBtn?.classList.toggle("is-active", mode === types.FREETEXT);
  ui.toolInkBtn?.classList.toggle("is-active", mode === types.INK);
  ui.toolHighlightBtn?.classList.toggle("is-active", mode === types.HIGHLIGHT);
}

function setMode(state, ui, mode, onModeChanged) {
  if (!state.pdfDoc) return;
  try {
    state.pdfViewer.annotationEditorMode = { mode };
    onModeChanged(mode);
    setButtonsActive(ui, mode, state.pdfjsLib.AnnotationEditorType);
  } catch (err) {
    console.error(err);
  }
}

export function installAnnotationTools(state, ui, onModeChanged) {
  const types = state.pdfjsLib.AnnotationEditorType;
  let currentMode = types.NONE;

  const applyMode = (mode) => setMode(state, ui, mode, (newMode) => {
    currentMode = newMode;
    onModeChanged(newMode);
  });

  ui.toolSelectBtn?.addEventListener("click", () => applyMode(types.NONE));
  ui.toolTextBtn?.addEventListener("click", () => applyMode(types.FREETEXT));
  ui.toolInkBtn?.addEventListener("click", () => applyMode(types.INK));
  ui.toolHighlightBtn?.addEventListener("click", () => applyMode(types.HIGHLIGHT));

  state.eventBus.on("annotationeditormodechanged", ({ mode }) => {
    currentMode = mode;
    setButtonsActive(ui, mode, types);
    onModeChanged(mode);
  });

  setButtonsActive(ui, currentMode, types);

  return {
    getCurrentMode: () => currentMode,
  };
}
