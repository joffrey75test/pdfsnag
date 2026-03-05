const CLOUD_MODE = "cloud";

function setButtonsActive(ui, mode, types) {
  ui.toolSelectBtn?.classList.toggle("is-active", mode === types.NONE);
  ui.toolCloudBtn?.classList.toggle("is-active", mode === CLOUD_MODE);
  ui.toolTextBtn?.classList.toggle("is-active", mode === types.FREETEXT);
  ui.toolInkBtn?.classList.toggle("is-active", mode === types.INK);
  ui.toolHighlightBtn?.classList.toggle("is-active", mode === types.HIGHLIGHT);
}

function setMode(state, ui, mode, types, onModeChanged) {
  if (!state.pdfDoc) return;
  try {
    // Cloud uses a custom overlay tool, keep PDF.js editor disabled in that mode.
    const pdfjsMode = mode === CLOUD_MODE ? types.NONE : mode;
    state.pdfViewer.annotationEditorMode = { mode: pdfjsMode };
    onModeChanged(mode);
    setButtonsActive(ui, mode, types);
  } catch (err) {
    console.error(err);
  }
}

export function installAnnotationTools(state, ui, onModeChanged) {
  const types = state.pdfjsLib.AnnotationEditorType;
  let currentMode = types.NONE;
  let cloudModeEnabled = false;

  const applyMode = (mode) => setMode(state, ui, mode, types, (newMode) => {
    cloudModeEnabled = newMode === CLOUD_MODE;
    currentMode = newMode;
    onModeChanged(newMode);
  });

  ui.toolSelectBtn?.addEventListener("click", () => applyMode(types.NONE));
  ui.toolCloudBtn?.addEventListener("click", () => applyMode(CLOUD_MODE));
  ui.toolTextBtn?.addEventListener("click", () => applyMode(types.FREETEXT));
  ui.toolInkBtn?.addEventListener("click", () => applyMode(types.INK));
  ui.toolHighlightBtn?.addEventListener("click", () => applyMode(types.HIGHLIGHT));

  state.eventBus.on("annotationeditormodechanged", ({ mode }) => {
    // Cloud mode uses custom overlay and keeps PDF.js editor at NONE.
    if (cloudModeEnabled && mode === types.NONE) {
      currentMode = CLOUD_MODE;
      setButtonsActive(ui, CLOUD_MODE, types);
      onModeChanged(CLOUD_MODE);
      return;
    }

    cloudModeEnabled = false;
    currentMode = mode;
    setButtonsActive(ui, mode, types);
    onModeChanged(mode);
  });

  setButtonsActive(ui, currentMode, types);

  return {
    getCurrentMode: () => currentMode,
  };
}
