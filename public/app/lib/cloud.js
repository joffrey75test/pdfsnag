function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ensurePageOverlay(pageEl) {
  let overlay = pageEl.querySelector(".cloudOverlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.className = "cloudOverlay";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "cloudOverlaySvg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  overlay.appendChild(svg);

  pageEl.appendChild(overlay);
  return overlay;
}

function rectFromPoints(a, b) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  return {
    x: left,
    y: top,
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

function normalizeComment(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 1000);
}

function buildCloudData(pageEl, rect, commentText = "", style = {}) {
  const pageRect = pageEl.getBoundingClientRect();
  const pageNumber = Number(pageEl.dataset.pageNumber || "0");
  const now = new Date().toISOString();
  const w = pageRect.width || 1;
  const h = pageRect.height || 1;
  const polygon = [
    { x: rect.x / w, y: rect.y / h },
    { x: (rect.x + rect.width) / w, y: rect.y / h },
    { x: (rect.x + rect.width) / w, y: (rect.y + rect.height) / h },
    { x: rect.x / w, y: (rect.y + rect.height) / h },
  ];

  return {
    id: `cld_${crypto.randomUUID()}`,
    page: pageNumber,
    type: "cloud",
    geometry: {
      unit: "normalized",
      polygon,
      bbox: {
        x: rect.x / w,
        y: rect.y / h,
        width: rect.width / w,
        height: rect.height / h,
      },
      rotation: 0,
      pageSize: {
        width: w,
        height: h,
      },
    },
    style: {
      strokeColor: style.strokeColor || "#ff0000",
      strokeWidth: style.strokeWidth || 4,
      strokeStyle: style.strokeStyle || "solid",
      opacity: 0.9,
      cloudIntensity: 0.6,
    },
    content: {
      text: commentText,
      tags: [],
    },
    discussion: commentText ? [{
      id: `cmt_${crypto.randomUUID()}`,
      parentId: null,
      text: commentText,
      author: {
        userId: "local-user",
        name: "Local User",
      },
      createdAt: now,
      updatedAt: now,
      status: "active",
    }] : [],
    status: "active",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function setShapeComment(shapeEl, commentText) {
  if (!shapeEl) return;
  const prev = shapeEl.querySelector("title");
  if (prev) prev.remove();
  if (!commentText) return;
  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = commentText;
  shapeEl.appendChild(title);
}

function zoomAdjustedCloudIntensity(intensity, zoomScale) {
  const base = clamp(Number.isFinite(intensity) ? intensity : 0.6, 0, 1);
  const zoom = Number.isFinite(zoomScale) && zoomScale > 0 ? zoomScale : 1;
  const zoomFactor = clamp(1 / Math.sqrt(zoom), 0.75, 1.5);
  return clamp(base * zoomFactor, 0.2, 1.2);
}

function buildScallopedPath(rect, intensity = 0.6, zoomScale = 1) {
  const effective = zoomAdjustedCloudIntensity(intensity, zoomScale);
  const frequencyFactor = 1 + effective * 0.85;
  const minStep = 34 / frequencyFactor;
  const topCount = Math.max(2, Math.round(rect.width / minStep));
  const sideCount = Math.max(2, Math.round(rect.height / minStep));
  const topStep = rect.width / topCount;
  const sideStep = rect.height / sideCount;
  const amplitudeFactor = clamp(0.55 + effective * 0.9, 0.45, 1.35);
  const ampTop = (topStep / 2) * amplitudeFactor;
  const ampSide = (sideStep / 2) * amplitudeFactor;

  let d = `M ${rect.x} ${rect.y}`;

  for (let i = 0; i < topCount; i += 1) {
    const sx = rect.x + i * topStep;
    const ex = sx + topStep;
    const cx = sx + topStep / 2;
    d += ` Q ${cx} ${rect.y - ampTop} ${ex} ${rect.y}`;
  }

  for (let i = 0; i < sideCount; i += 1) {
    const sy = rect.y + i * sideStep;
    const ey = sy + sideStep;
    const cy = sy + sideStep / 2;
    d += ` Q ${rect.x + rect.width + ampSide} ${cy} ${rect.x + rect.width} ${ey}`;
  }

  for (let i = 0; i < topCount; i += 1) {
    const sx = rect.x + rect.width - i * topStep;
    const ex = sx - topStep;
    const cx = sx - topStep / 2;
    d += ` Q ${cx} ${rect.y + rect.height + ampTop} ${ex} ${rect.y + rect.height}`;
  }

  for (let i = 0; i < sideCount; i += 1) {
    const sy = rect.y + rect.height - i * sideStep;
    const ey = sy - sideStep;
    const cy = sy - sideStep / 2;
    d += ` Q ${rect.x - ampSide} ${cy} ${rect.x} ${ey}`;
  }

  return `${d} Z`;
}

function toDashArray(strokeStyle) {
  if (strokeStyle === "dashed") return "14 9";
  if (strokeStyle === "dotted") return "2 8";
  return "";
}

function zoomAdjustedStrokeWidth(width, zoomScale) {
  const base = Math.max(1, Number.isFinite(width) ? width : 4);
  const zoom = Number.isFinite(zoomScale) && zoomScale > 0 ? zoomScale : 1;
  const zoomFactor = clamp(zoom, 0.5, 2);
  return clamp(base * zoomFactor, 1, 20);
}

function applyCloudStrokeStyle(shape, style = {}, zoomScale = 1) {
  shape.style.stroke = style.strokeColor || "#ff0000";
  shape.style.strokeWidth = String(zoomAdjustedStrokeWidth(Number(style.strokeWidth || 4), zoomScale));
  const dash = toDashArray(style.strokeStyle);
  if (dash) shape.style.strokeDasharray = dash;
  else shape.style.strokeDasharray = "";
}

function createCloudRectElement(svg, rect, style, zoomScale) {
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute("class", "cloudShape");
  shape.setAttribute("d", buildScallopedPath(rect, Number(style?.cloudIntensity ?? 0.6), zoomScale));
  applyCloudStrokeStyle(shape, style, zoomScale);
  svg.appendChild(shape);
  return shape;
}

function pagePointFromEvent(event, pageEl) {
  const pageRect = pageEl.getBoundingClientRect();
  return {
    x: clamp(event.clientX - pageRect.left, 0, pageRect.width),
    y: clamp(event.clientY - pageRect.top, 0, pageRect.height),
  };
}

function isPointInRect(point, rect, margin = 0) {
  return point.x >= rect.x - margin &&
    point.x <= rect.x + rect.width + margin &&
    point.y >= rect.y - margin &&
    point.y <= rect.y + rect.height + margin;
}

function setShapeSelected(shapeEl, selected) {
  if (!shapeEl) return;
  shapeEl.classList.toggle("is-selected", selected);
}

function denormalizeRect(annotation, pageEl) {
  const pageRect = pageEl.getBoundingClientRect();
  const pageW = pageRect.width;
  const pageH = pageRect.height;
  if (!Number.isFinite(pageW) || !Number.isFinite(pageH) || pageW < 2 || pageH < 2) {
    return null;
  }
  const bbox = annotation?.geometry?.bbox || {};
  const unit = annotation?.geometry?.unit || "viewport";

  if (unit === "normalized") {
    return {
      x: Number(bbox.x || 0) * pageW,
      y: Number(bbox.y || 0) * pageH,
      width: Number(bbox.width || 0) * pageW,
      height: Number(bbox.height || 0) * pageH,
    };
  }

  const baseW = Number(annotation?.geometry?.pageSize?.width || pageW) || pageW;
  const baseH = Number(annotation?.geometry?.pageSize?.height || pageH) || pageH;
  const scaleX = pageW / baseW;
  const scaleY = pageH / baseH;
  return {
    x: Number(bbox.x || 0) * scaleX,
    y: Number(bbox.y || 0) * scaleY,
    width: Number(bbox.width || 0) * scaleX,
    height: Number(bbox.height || 0) * scaleY,
  };
}

export function installCloudTool(
  ui,
  isCloudMode,
  canSelectCloud,
  getCloudStyle,
  getZoomScale,
  onCloudCreated,
  onCloudSelected,
  onCloudDeleted
) {
  const draw = {
    active: false,
    pointerId: null,
    pageEl: null,
    overlaySvg: null,
    shapeEl: null,
    start: null,
    rect: null,
  };
  const cloudVisuals = [];
  let selectedCloudId = null;

  function syncShapeFromAnnotation(visual) {
    const pageEl = ui.viewerContainer.querySelector(`.page[data-page-number="${visual.annotation.page}"]`);
    if (!pageEl || !visual.shapeEl) return false;
    const overlay = ensurePageOverlay(pageEl);
    const svg = overlay.querySelector("svg");
    if (!svg) return false;
    if (visual.shapeEl.parentNode !== svg) svg.appendChild(visual.shapeEl);

    const nextRect = denormalizeRect(visual.annotation, pageEl);
    if (
      !nextRect ||
      !Number.isFinite(nextRect.width) ||
      !Number.isFinite(nextRect.height) ||
      nextRect.width <= 0 ||
      nextRect.height <= 0
    ) {
      return false;
    }

    visual.rect = nextRect;
    visual.pageNumber = Number(pageEl.dataset.pageNumber || "0");
    visual.shapeEl.dataset.cloudId = visual.annotation.id;
    visual.shapeEl.setAttribute(
      "d",
      buildScallopedPath(nextRect, Number(visual.annotation?.style?.cloudIntensity ?? 0.6), getZoomScale?.() ?? 1)
    );
    applyCloudStrokeStyle(visual.shapeEl, visual.annotation?.style || {}, getZoomScale?.() ?? 1);
    setShapeComment(visual.shapeEl, visual.annotation?.content?.text || "");
    return true;
  }

  function addCloudVisual(annotation) {
    const pageEl = ui.viewerContainer.querySelector(`.page[data-page-number="${annotation.page}"]`);
    if (!pageEl) return null;

    const overlay = ensurePageOverlay(pageEl);
    const svg = overlay.querySelector("svg");
    if (!svg) return null;

    const rect = denormalizeRect(annotation, pageEl);
    if (
      !rect ||
      !Number.isFinite(rect.width) ||
      !Number.isFinite(rect.height) ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return null;
    }

    const shapeEl = createCloudRectElement(svg, rect, annotation?.style || {}, getZoomScale?.() ?? 1);
    shapeEl.dataset.cloudId = annotation.id;
    setShapeComment(shapeEl, annotation?.content?.text || "");

    const visual = {
      annotation,
      pageNumber: Number(pageEl.dataset.pageNumber || "0"),
      rect,
      shapeEl,
    };
    cloudVisuals.push(visual);
    return visual;
  }

  function refreshCloudVisuals() {
    for (const visual of cloudVisuals) {
      syncShapeFromAnnotation(visual);
    }
  }

  function selectCloudById(cloudId, { notify = true } = {}) {
    selectedCloudId = cloudId;
    let selectedAnnotation = null;

    for (const visual of cloudVisuals) {
      const isSelected = !!cloudId && visual.annotation.id === cloudId;
      setShapeSelected(visual.shapeEl, isSelected);
      if (isSelected) selectedAnnotation = visual.annotation;
    }

    if (notify) onCloudSelected?.(selectedAnnotation);
  }

  function findSelectedVisualIndex() {
    if (!selectedCloudId) return -1;
    return cloudVisuals.findIndex((visual) => visual.annotation.id === selectedCloudId);
  }

  function clearSelection(options = {}) {
    selectCloudById(null, options);
  }

  function getHitVisual(pageNumber, point) {
    const matches = [];
    for (let i = 0; i < cloudVisuals.length; i += 1) {
      const visual = cloudVisuals[i];
      if (visual.pageNumber !== pageNumber) continue;
      if (!isPointInRect(point, visual.rect, 2)) continue;
      const area = visual.rect.width * visual.rect.height;
      const centerX = visual.rect.x + visual.rect.width / 2;
      const centerY = visual.rect.y + visual.rect.height / 2;
      const dist2 = (point.x - centerX) ** 2 + (point.y - centerY) ** 2;
      matches.push({ visual, area, dist2 });
    }
    if (matches.length === 0) return null;
    // Prefer the visually closest match, then smaller area.
    matches.sort((a, b) => (a.dist2 - b.dist2) || (a.area - b.area));

    // If current selection is still first and another match exists, switch to next.
    if (selectedCloudId && matches.length > 1 && matches[0].visual.annotation.id === selectedCloudId) {
      const alternative = matches.find((m) => m.visual.annotation.id !== selectedCloudId);
      if (alternative) return alternative.visual;
    }

    return matches[0].visual;
  }

  function deleteSelectedCloud() {
    const selectedIndex = findSelectedVisualIndex();
    if (selectedIndex < 0) return null;

    const visual = cloudVisuals[selectedIndex];
    const annotation = visual.annotation;
    annotation.status = "deleted";
    annotation.deletedAt = new Date().toISOString();
    annotation.updatedAt = annotation.deletedAt;

    visual.shapeEl.remove();
    cloudVisuals.splice(selectedIndex, 1);
    selectCloudById(null);
    onCloudDeleted?.(annotation);
    return annotation;
  }

  function clearClouds() {
    for (const visual of cloudVisuals) {
      visual.shapeEl?.remove();
    }
    cloudVisuals.length = 0;
    selectedCloudId = null;
  }

  function setAnnotations(annotations) {
    clearClouds();
    const list = Array.isArray(annotations) ? annotations : [];
    for (const annotation of list) {
      if (!annotation || annotation.status === "deleted") continue;
      addCloudVisual(annotation);
    }
    refreshCloudVisuals();
  }

  function replaceAnnotation(currentId, nextAnnotation) {
    const idx = cloudVisuals.findIndex((visual) => visual.annotation.id === currentId);
    if (idx < 0 || !nextAnnotation) return false;
    cloudVisuals[idx].annotation = nextAnnotation;
    const updated = syncShapeFromAnnotation(cloudVisuals[idx]);
    if (selectedCloudId === currentId) {
      selectedCloudId = nextAnnotation.id;
      selectCloudById(nextAnnotation.id);
    }
    return updated;
  }

  ui.viewerContainer.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0 || !isCloudMode()) return;

      const pageEl = e.target.closest?.(".page");
      if (!pageEl) return;

      const start = pagePointFromEvent(e, pageEl);
      const overlay = ensurePageOverlay(pageEl);
      const svg = overlay.querySelector("svg");
      const draftRect = { x: start.x, y: start.y, width: 1, height: 1 };
      const shape = createCloudRectElement(svg, draftRect, getCloudStyle?.() || {}, getZoomScale?.() ?? 1);

      draw.active = true;
      draw.pointerId = e.pointerId;
      draw.pageEl = pageEl;
      draw.overlaySvg = svg;
      draw.shapeEl = shape;
      draw.start = start;
      draw.rect = draftRect;

      ui.viewerContainer.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    },
    { passive: false }
  );

  ui.viewerContainer.addEventListener(
    "pointermove",
    (e) => {
      if (!draw.active || e.pointerId !== draw.pointerId || !draw.pageEl || !draw.shapeEl) return;

      const pageRect = draw.pageEl.getBoundingClientRect();
      const current = {
        x: clamp(e.clientX - pageRect.left, 0, pageRect.width),
        y: clamp(e.clientY - pageRect.top, 0, pageRect.height),
      };
      const nextRect = rectFromPoints(draw.start, current);
      draw.rect = nextRect;
      draw.shapeEl.setAttribute(
        "d",
        buildScallopedPath(nextRect, Number((getCloudStyle?.() || {}).cloudIntensity ?? 0.6), getZoomScale?.() ?? 1)
      );
      applyCloudStrokeStyle(draw.shapeEl, getCloudStyle?.() || {}, getZoomScale?.() ?? 1);
      e.preventDefault();
    },
    { passive: false }
  );

  const endDraw = (e) => {
    if (!draw.active || e.pointerId !== draw.pointerId || !draw.pageEl || !draw.shapeEl || !draw.rect) return;

    const width = draw.rect.width;
    const height = draw.rect.height;
    const tooSmall = width < 14 || height < 14;

    if (tooSmall) {
      draw.shapeEl.remove();
    } else if (onCloudCreated) {
      const rawComment = window.prompt("Commentaire du nuage (optionnel)", "") ?? "";
      const comment = normalizeComment(rawComment);
      setShapeComment(draw.shapeEl, comment);
      const annotation = buildCloudData(draw.pageEl, draw.rect, comment, getCloudStyle?.() || {});
      draw.shapeEl.dataset.cloudId = annotation.id;
      cloudVisuals.push({
        annotation,
        pageNumber: annotation.page,
        rect: { ...draw.rect },
        shapeEl: draw.shapeEl,
      });
      onCloudCreated(annotation);
      // Keep drawing flow: do not auto-select the newly created cloud.
      clearSelection({ notify: false });
    }

    draw.active = false;
    draw.pointerId = null;
    draw.pageEl = null;
    draw.overlaySvg = null;
    draw.shapeEl = null;
    draw.start = null;
    draw.rect = null;
  };

  ui.viewerContainer.addEventListener("pointerup", endDraw, { passive: true });
  ui.viewerContainer.addEventListener("pointercancel", endDraw, { passive: true });

  ui.viewerContainer.addEventListener(
    "pointerdown",
    (e) => {
      if (draw.active || isCloudMode() || !canSelectCloud()) return;

      const pageEl = e.target.closest?.(".page");
      if (!pageEl) {
        if (selectedCloudId) selectCloudById(null);
        return;
      }

      const pageNumber = Number(pageEl.dataset.pageNumber || "0");
      const point = pagePointFromEvent(e, pageEl);
      const hit = getHitVisual(pageNumber, point);

      if (!hit) {
        if (selectedCloudId) selectCloudById(null);
        return;
      }

      selectCloudById(hit.annotation.id);
      e.preventDefault();
      e.stopPropagation();
    },
    { passive: false, capture: true }
  );

  return {
    deleteSelectedCloud,
    clearSelection,
    refresh: refreshCloudVisuals,
    getSelectedCloudId: () => selectedCloudId,
    setAnnotations,
    replaceAnnotation,
    getAnnotations: () => cloudVisuals.map((v) => v.annotation),
  };
}
