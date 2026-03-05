import * as pdfjsLib from "/pdfjs/build/pdf.mjs";
import { EventBus, PDFLinkService, PDFViewer } from "/pdfjs/web/pdf_viewer.mjs";
import { setStatus } from "./ui.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/build/pdf.worker.mjs";

export function createViewer(ui) {
  const eventBus = new EventBus();
  const linkService = new PDFLinkService({ eventBus });
  const { AnnotationEditorType, AnnotationMode } = pdfjsLib;
  const pdfViewer = new PDFViewer({
    container: ui.viewerContainer,
    viewer: ui.viewerEl,
    eventBus,
    linkService,
    textLayerMode: 1,
    annotationMode: AnnotationMode.ENABLE,
    annotationEditorMode: AnnotationEditorType.NONE,
  });

  linkService.setViewer(pdfViewer);

  return { pdfjsLib, eventBus, linkService, pdfViewer, pdfDoc: null };
}

export async function openFromFile(state, ui, file) {
  setStatus(ui, "Chargement...");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const task = state.pdfjsLib.getDocument({
    data: bytes,
    cMapUrl: "/pdfjs/web/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/web/standard_fonts/",
  });
  state.pdfDoc = await task.promise;
  state.pdfViewer.setDocument(state.pdfDoc);
  state.linkService.setDocument(state.pdfDoc);
  setStatus(ui, `OK • ${state.pdfDoc.numPages} pages`);
}
