export function getUI() {
  return {
    fileInput: document.getElementById("fileInput"),
    toolSelectBtn: document.getElementById("toolSelect"),
    toolTextBtn: document.getElementById("toolText"),
    toolInkBtn: document.getElementById("toolInk"),
    toolHighlightBtn: document.getElementById("toolHighlight"),
    toggleThumbsBtn: document.getElementById("toggleThumbs"),
    zoomFitBtn: document.getElementById("zoomFit"),
    zoomOutBtn: document.getElementById("zoomOut"),
    zoomInBtn: document.getElementById("zoomIn"),
    zoomValue: document.getElementById("zoomValue"),
    statusEl: document.getElementById("status"),
    thumbsSidebar: document.getElementById("thumbsSidebar"),
    thumbsContainer: document.getElementById("thumbsContainer"),
    viewerContainer: document.getElementById("viewerContainer"),
    viewerEl: document.getElementById("viewer"),
  };
}

export function setStatus(ui, msg) {
  ui.statusEl.textContent = msg || "";
}

export function setZoomLabel(ui, scale) {
  ui.zoomValue.textContent = `${Math.round((scale || 1) * 100)}%`;
}
