export function getUI() {
  return {
    fileInput: document.getElementById("fileInput"),
    toolSelectBtn: document.getElementById("toolSelect"),
    toolCloudBtn: document.getElementById("toolCloud"),
    toolTextBtn: document.getElementById("toolText"),
    toolInkBtn: document.getElementById("toolInk"),
    toolHighlightBtn: document.getElementById("toolHighlight"),
    toggleThumbsBtn: document.getElementById("toggleThumbs"),
    toggleCommentsBtn: document.getElementById("toggleComments"),
    strokeColorInput: document.getElementById("strokeColor"),
    strokeWidthInput: document.getElementById("strokeWidth"),
    strokeStyleSelect: document.getElementById("strokeStyle"),
    zoomFitBtn: document.getElementById("zoomFit"),
    zoomOutBtn: document.getElementById("zoomOut"),
    zoomInBtn: document.getElementById("zoomIn"),
    zoomValue: document.getElementById("zoomValue"),
    statusEl: document.getElementById("status"),
    commentSidebar: document.getElementById("commentSidebar"),
    commentResizer: document.getElementById("commentResizer"),
    hideCommentSidebarBtn: document.getElementById("hideCommentSidebar"),
    commentMeta: document.getElementById("commentMeta"),
    commentText: document.getElementById("commentText"),
    commentThread: document.getElementById("commentThread"),
    replyTarget: document.getElementById("replyTarget"),
    newCommentText: document.getElementById("newCommentText"),
    addCommentBtn: document.getElementById("addCommentBtn"),
    cancelReplyBtn: document.getElementById("cancelReplyBtn"),
    deleteSelectedAnnotationBtn: document.getElementById("deleteSelectedAnnotation"),
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
