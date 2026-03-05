function makeThumbItem(pageNumber) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "thumbItem";
  item.dataset.page = String(pageNumber);

  const label = document.createElement("div");
  label.className = "thumbLabel";
  label.textContent = String(pageNumber);

  const canvas = document.createElement("canvas");
  canvas.className = "thumbCanvas";

  item.appendChild(canvas);
  item.appendChild(label);
  return { item, canvas };
}

async function renderThumb(page, canvas, widthCss = 140) {
  const base = page.getViewport({ scale: 1 });
  const scale = widthCss / base.width;
  const viewport = page.getViewport({ scale });

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
  canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
}

function getThumbWidth(ui) {
  const containerWidth = ui.thumbsContainer?.clientWidth || 160;
  return Math.max(90, Math.floor(containerWidth - 16));
}

function setActiveThumb(ui, pageNumber) {
  const items = ui.thumbsContainer.querySelectorAll(".thumbItem");
  for (const item of items) {
    item.classList.toggle("active", Number(item.dataset.page) === Number(pageNumber));
  }
}

export async function buildThumbnails(state, ui) {
  if (!state.pdfDoc) return;

  ui.thumbsContainer.innerHTML = "";
  const total = state.pdfDoc.numPages;
  const widthCss = getThumbWidth(ui);

  for (let n = 1; n <= total; n++) {
    const page = await state.pdfDoc.getPage(n);
    const { item, canvas } = makeThumbItem(n);

    item.addEventListener("click", () => {
      state.pdfViewer.currentPageNumber = n;
      setActiveThumb(ui, n);
    });

    ui.thumbsContainer.appendChild(item);
    // rendu asynchrone séquentiel (simple/stable)
    await renderThumb(page, canvas, widthCss);
  }

  setActiveThumb(ui, state.pdfViewer.currentPageNumber || 1);
}

export function bindThumbnailSync(state, ui) {
  state.eventBus.on("pagechanging", ({ pageNumber }) => {
    setActiveThumb(ui, pageNumber);
  });
}
