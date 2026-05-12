// Reusable UI components: modal shell, confirm dialog, upload helper, category tree picker.
import { api } from "./api.js";

export function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- generic modal ------------------------------------------------------

export function openModal(innerHtml, opts = {}) {
  // Returns { close(value), root (div) } — caller resolves the promise themselves.
  const root = document.getElementById("modal-root");
  const widthCls = opts.wide ? "max-w-2xl" : "max-w-[540px]";
  root.innerHTML = `
    <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[1100] p-6" data-backdrop>
      <div class="bg-white rounded-xl shadow-modal ${widthCls} w-full overflow-hidden">
        ${innerHtml}
      </div>
    </div>
  `;
  const backdrop = root.querySelector("[data-backdrop]");
  let resolver = null;
  const close = (v = null) => {
    root.innerHTML = "";
    if (resolver) resolver(v);
  };
  backdrop.onclick = (e) => { if (e.target === backdrop) close(null); };
  const escHandler = (e) => { if (e.key === "Escape") { close(null); document.removeEventListener("keydown", escHandler); } };
  document.addEventListener("keydown", escHandler);
  return {
    close,
    wait: () => new Promise(r => { resolver = r; }),
    root: root.firstElementChild.firstElementChild,
  };
}

// ---- confirm ------------------------------------------------------------

export async function confirm(title, body = "", okLabel = "确认", danger = false) {
  const m = openModal(`
    <div class="px-6 py-5">
      <h3 class="m-0 mb-2 text-[16px] font-semibold">${escapeHtml(title)}</h3>
      ${body ? `<p class="text-[13px] text-muted m-0 mb-4 leading-relaxed">${escapeHtml(body)}</p>` : ""}
      <div class="flex justify-end gap-2">
        <button data-ok="0" class="px-3.5 py-1.5 rounded-md border border-slate-200 bg-white text-textSoft text-[13px] font-medium hover:bg-slate-50 transition">取消</button>
        <button data-ok="1" class="px-3.5 py-1.5 rounded-md ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-accent hover:bg-indigo-700'} text-white text-[13px] font-medium transition">${escapeHtml(okLabel)}</button>
      </div>
    </div>
  `);
  m.root.querySelector('[data-ok="0"]').onclick = () => m.close(false);
  m.root.querySelector('[data-ok="1"]').onclick = () => m.close(true);
  return m.wait();
}

// ---- category tree picker ----------------------------------------------

export async function pickCategory(currentPath = null) {
  const tree = await api.categories();
  const m = openModal(`
    <div class="px-6 py-5">
      <h3 class="m-0 mb-3 text-[16px] font-semibold">迁移到分类</h3>
      <p class="text-[12px] text-muted m-0 mb-3">当前：<code class="font-mono">${escapeHtml(currentPath || "未归档")}</code></p>
      <div id="tree-body" class="max-h-[340px] overflow-y-auto border border-slate-200 rounded-md p-2 bg-slate-50"></div>
      <div class="mt-3 flex items-center gap-2">
        <input id="new-cat" class="flex-1 border border-slate-200 rounded-md px-2 py-1.5 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-accent" placeholder="或输入新分类路径，如 nlp/transformers" />
        <button id="add-new-cat" class="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-textSoft text-[13px] font-medium hover:bg-slate-50">新建并选择</button>
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button id="cat-cancel" class="px-3.5 py-1.5 rounded-md border border-slate-200 bg-white text-textSoft text-[13px] font-medium hover:bg-slate-50">取消</button>
      </div>
    </div>
  `);

  function walk(node, prefix, depth) {
    const names = Object.keys(node).sort();
    return names.map(n => {
      const full = prefix ? `${prefix}/${n}` : n;
      const count = (tree.papers[full] || []).length;
      return `
        <div class="cursor-pointer flex items-center gap-1.5 py-1 px-2 rounded hover:bg-indigo-50 hover:text-accent text-[13px]"
             style="padding-left:${8 + depth * 16}px" data-pick="${full}">
          <span class="text-[10px] text-muted">▸</span>
          <span class="flex-1">${escapeHtml(n)}</span>
          ${count ? `<span class="text-[11px] text-muted">${count}</span>` : ""}
        </div>
        ${walk(node[n], full, depth + 1)}
      `;
    }).join("");
  }

  const body = m.root.querySelector("#tree-body");
  body.innerHTML = `
    <div class="cursor-pointer py-1 px-2 rounded hover:bg-indigo-50 hover:text-accent text-[13px] flex items-center gap-2"
         data-pick="">📥 未归档 / 取消分类</div>
    <hr class="my-1 border-slate-200"/>
    ${walk(tree.tree, "", 0) || '<div class="px-2 py-2 text-[12px] text-muted">暂无分类，用下方输入框创建</div>'}
  `;

  body.querySelectorAll("[data-pick]").forEach(el => {
    el.onclick = () => m.close({ action: "pick", path: el.dataset.pick || null });
  });
  m.root.querySelector("#cat-cancel").onclick = () => m.close(null);
  m.root.querySelector("#add-new-cat").onclick = async () => {
    const path = m.root.querySelector("#new-cat").value.trim();
    if (!path) return;
    try {
      await api.createCategory(path);
    } catch (e) {}
    m.close({ action: "pick", path });
  };

  return m.wait();
}

// ---- upload file --------------------------------------------------------

export async function uploadPdf(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/papers/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(`upload failed ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

// ---- lightbox -----------------------------------------------------------

export function lightbox(src, caption = "") {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="fixed inset-0 bg-slate-900/80 backdrop-blur flex items-center justify-center z-[1200] p-10" data-backdrop>
      <img src="${src}" class="max-w-[95%] max-h-[88%] rounded-lg shadow-modal bg-white" />
      ${caption ? `<div class="absolute bottom-6 left-1/2 -translate-x-1/2 text-white bg-black/55 px-3.5 py-1 rounded-full text-[12px]">${escapeHtml(caption)}</div>` : ""}
    </div>
  `;
  const close = () => { root.innerHTML = ""; };
  root.querySelector("[data-backdrop]").onclick = close;
  const h = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", h); } };
  document.addEventListener("keydown", h);
}
