const STORAGE_KEY = "pdfsnag_ged_session_v1";

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { companyId: "", projectId: "", projectToken: "" };
    const parsed = JSON.parse(raw);
    const companyId = parsed.companyId || "";
    return {
      companyId,
      projectId: parsed.projectId || "",
      projectToken: parsed.projectToken || "",
    };
  } catch {
    return { companyId: "", projectId: "", projectToken: "" };
  }
}

export function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function buildHeaders(session, extra = {}) {
  const companyId = session.companyId || "";
  return {
    "x-company-id": companyId,
    Authorization: `Bearer ${session.projectToken}`,
    ...extra,
  };
}

async function request(session, path, options = {}) {
  const companyId = session.companyId || "";
  if (!companyId || !session.projectId || !session.projectToken) {
    throw new Error("Session GED incomplète (company/projet/token)");
  }

  const res = await fetch(path, {
    ...options,
    headers: buildHeaders(session, options.headers || {}),
  });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = typeof payload === "object" && payload && payload.error ? payload.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return payload;
}

export function listFolders(session, parentId = null) {
  const params = new URLSearchParams();
  if (parentId) params.set("parentId", parentId);
  const q = params.toString();
  const suffix = q ? `?${q}` : "";
  return request(session, `/projects/${encodeURIComponent(session.projectId)}/folders${suffix}`);
}

export function listDocuments(session, folderId = null) {
  const params = new URLSearchParams();
  if (folderId) params.set("folderId", folderId);
  const q = params.toString();
  const suffix = q ? `?${q}` : "";
  return request(session, `/projects/${encodeURIComponent(session.projectId)}/documents${suffix}`);
}

export function createFolder(session, payload) {
  return request(session, `/projects/${encodeURIComponent(session.projectId)}/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      parentId: payload.parentId ?? null,
    }),
  });
}

export function createDocument(session, payload) {
  return request(session, `/projects/${encodeURIComponent(session.projectId)}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: payload.title,
      folderId: payload.folderId ?? null,
      mimeType: payload.mimeType || "application/pdf",
    }),
  });
}

export async function uploadVersionContent(session, uploadUrl, file, onProgress) {
  if (!(file instanceof File)) {
    throw new Error("Fichier invalide.");
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);

    const headers = buildHeaders(session, {
      "Content-Type": file.type || "application/octet-stream",
      "x-file-size": String(file.size || 0),
    });
    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    if (typeof onProgress === "function") {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      const contentType = xhr.getResponseHeader("content-type") || "";
      const isJson = contentType.includes("application/json");
      const payload = isJson && xhr.responseText ? JSON.parse(xhr.responseText) : xhr.responseText;

      if (xhr.status < 200 || xhr.status >= 300) {
        const msg = payload && typeof payload === "object" && payload.error ? payload.error : `HTTP ${xhr.status}`;
        reject(new Error(msg));
        return;
      }

      if (typeof onProgress === "function") onProgress(100);
      resolve(payload);
    };

    xhr.onerror = () => reject(new Error("Erreur réseau pendant l'upload"));
    xhr.send(file);
  });
}
