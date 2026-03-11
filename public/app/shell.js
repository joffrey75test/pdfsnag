const STORAGE_KEY = "pdfsnag_app_nav_width_v1";
const STORAGE_COLLAPSED_KEY = "pdfsnag_app_nav_collapsed_v1";
const MIN_WIDTH = 180;
const MAX_WIDTH = 420;

function clampWidth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 220;
  if (n < MIN_WIDTH) return MIN_WIDTH;
  if (n > MAX_WIDTH) return MAX_WIDTH;
  return Math.round(n);
}

function setSidebarWidth(px) {
  document.documentElement.style.setProperty("--app-nav-width", `${clampWidth(px)}px`);
}

function getInitialWidth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 220;
    return clampWidth(raw);
  } catch {
    return 220;
  }
}

function saveWidth(px) {
  try {
    localStorage.setItem(STORAGE_KEY, String(clampWidth(px)));
  } catch {
    // ignore persistence errors
  }
}

function getInitialCollapsed() {
  try {
    return localStorage.getItem(STORAGE_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed) {
  try {
    localStorage.setItem(STORAGE_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore persistence errors
  }
}

function initSidebarResize() {
  const body = document.body;
  const sidebar = document.querySelector(".appSidebar");
  const resizer = document.getElementById("appSidebarResizer");
  if (!(body instanceof HTMLElement) || !(sidebar instanceof HTMLElement) || !(resizer instanceof HTMLElement)) return;
  if (!body.classList.contains("appShellBody")) return;

  const initial = getInitialWidth();
  setSidebarWidth(initial);
  let collapsed = getInitialCollapsed();

  const brand = sidebar.querySelector(".appSidebar__brand");

  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "appSidebarToggle";
  collapseBtn.title = "Masquer la navigation";
  collapseBtn.setAttribute("aria-label", "Masquer la navigation");
  collapseBtn.textContent = "‹";

  const floatingBtn = document.createElement("button");
  floatingBtn.type = "button";
  floatingBtn.className = "appSidebarFloatingToggle";
  floatingBtn.title = "Afficher la navigation";
  floatingBtn.setAttribute("aria-label", "Afficher la navigation");
  floatingBtn.textContent = "›";

  if (brand instanceof HTMLElement) {
    brand.appendChild(collapseBtn);
  }
  body.appendChild(floatingBtn);

  const applyCollapsed = (value) => {
    collapsed = Boolean(value);
    body.classList.toggle("appShellBody--nav-collapsed", collapsed);
    saveCollapsed(collapsed);
  };

  applyCollapsed(collapsed);

  let dragging = false;

  const onMove = (event) => {
    if (!dragging) return;
    setSidebarWidth(event.clientX);
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = "";
    const current = getComputedStyle(document.documentElement).getPropertyValue("--app-nav-width").trim().replace("px", "");
    saveWidth(current);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };

  resizer.addEventListener("mousedown", (event) => {
    if (window.matchMedia("(max-width: 980px)").matches) return;
    if (collapsed) return;
    event.preventDefault();
    dragging = true;
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  collapseBtn.addEventListener("click", () => {
    applyCollapsed(true);
  });

  floatingBtn.addEventListener("click", () => {
    applyCollapsed(false);
  });
}

initSidebarResize();
