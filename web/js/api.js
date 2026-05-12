// Thin REST wrapper. All calls go through here.
const BASE = "/api";

async function req(method, path, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${path} ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  return ct.includes("json") ? res.json() : res.text();
}

export const api = {
  health: () => req("GET", "/health"),
  rescan: () => req("POST", "/system/rescan"),

  papers: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req("GET", "/papers" + (q ? "?" + q : ""));
  },
  paper: (id) => req("GET", `/papers/${id}`),
  createPaper: (origin_filename) => req("POST", "/papers", { origin_filename }),
  patchPaper: (id, patch) => req("PATCH", `/papers/${id}`, patch),
  deletePaper: (id) => req("DELETE", `/papers/${id}`),
  movePaper: (id, category) => req("POST", `/papers/${id}/move`, { category }),

  getSummary: (id) => req("GET", `/papers/${id}/summary`),
  putSummary: (id, markdown, opts = {}) =>
    req("PUT", `/papers/${id}/summary`, { markdown, mode: opts.mode || "replace", section: opts.section || null }),

  getDetail: (id) => req("GET", `/papers/${id}/detail`),
  putDetail: (id, markdown, opts = {}) =>
    req("PUT", `/papers/${id}/detail`, { markdown, mode: opts.mode || "replace", section: opts.section || null }),

  getTranslation: (id) => req("GET", `/papers/${id}/translation`),
  putTranslation: (id, paragraphs) => req("PUT", `/papers/${id}/translation`, { paragraphs }),

  listAnnotations: (id, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req("GET", `/papers/${id}/annotations` + (q ? "?" + q : ""));
  },
  createAnnotation: (id, ann) => req("POST", `/papers/${id}/annotations`, ann),
  patchAnnotation: (id, aid, patch) => req("PATCH", `/papers/${id}/annotations/${aid}`, patch),
  deleteAnnotation: (id, aid) => req("DELETE", `/papers/${id}/annotations/${aid}`),

  listQA: (id) => req("GET", `/papers/${id}/qa`),
  createQA: (id, payload) => req("POST", `/papers/${id}/qa`, payload),
  getQA: (id, qid) => req("GET", `/papers/${id}/qa/${encodeURIComponent(qid)}`),
  patchQA: (id, qid, patch) => req("PATCH", `/papers/${id}/qa/${encodeURIComponent(qid)}`, patch),
  deleteQA: (id, qid) => req("DELETE", `/papers/${id}/qa/${encodeURIComponent(qid)}`),

  categories: () => req("GET", "/categories"),
  createCategory: (path) => req("POST", "/categories", { path }),
  deleteCategory: (path) => req("DELETE", "/categories", { path }),
  papersUnder: (path) => req("GET", `/categories/${path}/papers`),

  getFolderHomepage: (path) => req("GET", `/folders/${path}/homepage`),
  putFolderHomepage: (path, markdown) => req("PUT", `/folders/${path}/homepage`, { markdown }),

  pdfURL: (id) => `${BASE}/papers/${id}/pdf`,
  imageURL: (id, name) => `${BASE}/papers/${id}/images/${name}`,
};

export function qidOf(qaOrId) {
  return typeof qaOrId === "string" ? qaOrId : qaOrId?.id;
}
