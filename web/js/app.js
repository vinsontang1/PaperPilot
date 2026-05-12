// Router + shell layout (persistent left sidebar + main area).
import { api } from "./api.js";
import { renderHome } from "./home.js";
import { renderTier1, renderTier2 } from "./tiers12.js";
import { renderTier3 } from "./tier3.js";
import { renderFolder } from "./folder.js";

const app = document.getElementById("app");

function parseRoute() {
  const h = (location.hash || "#/").slice(2);
  const [path] = h.split("?");
  const parts = path.split("/").filter(Boolean);
  return { path, parts, raw: h };
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------- Sidebar

async function renderSidebar(active = { type: "home", path: "" }) {
  const [cats, allPapers] = await Promise.all([
    api.categories().catch(() => ({ tree: {}, papers: {} })),
    api.papers().catch(() => []),
  ]);
  const unfiledCount = allPapers.filter(p => !p.category).length;
  const totalCount = allPapers.length;

  function isActive(type, path = "") {
    if (active.type !== type) return false;
    return (active.path || "") === (path || "");
  }

  function categoryLink(fullPath, label, depth, count) {
    const on = isActive("category", fullPath);
    return `
      <div class="group flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition-colors text-[13px]
                  ${on ? 'bg-accent/10 text-accent font-medium' : 'text-textSoft hover:bg-slate-100'}"
           style="padding-left:${8 + depth * 14}px"
           data-cat="${fullPath}">
        <span class="text-[11px] text-muted">▸</span>
        <span class="truncate flex-1">${escapeHtml(label)}</span>
        ${count ? `<span class="text-[11px] text-muted">${count}</span>` : ""}
      </div>
    `;
  }

  function renderTreeLinks(node, prefix, depth) {
    const names = Object.keys(node).sort();
    return names.map(n => {
      const full = prefix ? `${prefix}/${n}` : n;
      const count = (cats.papers[full] || []).length;
      return categoryLink(full, n, depth, count) + renderTreeLinks(node[n], full, depth + 1);
    }).join("");
  }

  return `
    <aside class="w-[260px] flex-none bg-white border-r border-slate-200 flex flex-col h-full">
      <div class="px-4 pt-4 pb-3 border-b border-slate-100">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center font-bold">📖</div>
          <div class="flex-1">
            <div class="text-[13px] font-semibold leading-tight">PaperPilot</div>
            <div class="text-[11px] text-muted">${totalCount} 篇文献</div>
          </div>
        </div>
      </div>

      <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <div class="text-[10px] text-muted uppercase tracking-widest font-semibold px-2 mb-1">导航</div>
        <div class="${isActive('home') ? 'bg-accent/10 text-accent font-medium' : 'text-textSoft hover:bg-slate-100'}
                    flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[13px] transition-colors"
             data-nav="home">
          <span>🏠</span><span class="flex-1">全部文献</span>
          <span class="text-[11px] text-muted">${totalCount}</span>
        </div>
        <div class="${isActive('unfiled') ? 'bg-accent/10 text-accent font-medium' : 'text-textSoft hover:bg-slate-100'}
                    flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[13px] transition-colors"
             data-nav="unfiled">
          <span>📥</span><span class="flex-1">未归档</span>
          ${unfiledCount ? `<span class="text-[11px] bg-amber-100 text-amber-700 px-1.5 rounded-full">${unfiledCount}</span>` : ""}
        </div>

        <div class="text-[10px] text-muted uppercase tracking-widest font-semibold px-2 mt-4 mb-1 flex items-center">
          <span class="flex-1">分类</span>
          <button id="sb-new-cat" class="text-muted hover:text-accent text-[13px]" title="新建分类">+</button>
        </div>
        ${renderTreeLinks(cats.tree, "", 0) || '<div class="px-2 py-1 text-[12px] text-muted">暂无分类</div>'}
      </nav>

      <div class="p-3 border-t border-slate-100 text-[11px] text-muted">
        <div>端口 <span class="font-mono">${location.port || "80"}</span></div>
      </div>
    </aside>
  `;
}

function wireSidebar(root) {
  root.querySelectorAll("[data-nav]").forEach(el => {
    el.onclick = () => {
      const v = el.dataset.nav;
      if (v === "home") location.hash = "#/";
      if (v === "unfiled") location.hash = "#/unfiled";
    };
  });
  root.querySelectorAll("[data-cat]").forEach(el => {
    el.onclick = () => { location.hash = `#/folder/${el.dataset.cat}`; };
  });
  const btn = root.querySelector("#sb-new-cat");
  if (btn) btn.onclick = async () => {
    const path = prompt("新建分类路径（/ 分隔，例如 nlp/transformers）:");
    if (!path) return;
    await api.createCategory(path.trim());
    render();
  };
}

// --------------------------------------------------------------- Shell

async function shell(mainHtmlRenderer, active) {
  const sidebar = await renderSidebar(active);
  app.innerHTML = `
    <div class="flex flex-1 min-h-0">
      ${sidebar}
      <div id="main" class="flex-1 flex flex-col min-w-0 bg-bg"></div>
    </div>
  `;
  wireSidebar(app);
  const main = document.getElementById("main");
  await mainHtmlRenderer(main);
}

// --------------------------------------------------------------- Router

async function render() {
  const r = parseRoute();
  try {
    if (r.parts.length === 0) {
      await shell(main => renderHome(main, { filter: "all" }), { type: "home" });
    } else if (r.parts[0] === "unfiled") {
      await shell(main => renderHome(main, { filter: "unfiled" }), { type: "unfiled" });
    } else if (r.parts[0] === "paper" && r.parts.length === 2) {
      await shell(main => renderTier1(main, r.parts[1]), { type: "paper", path: r.parts[1] });
    } else if (r.parts[0] === "paper" && r.parts[2] === "detail") {
      await shell(main => renderTier2(main, r.parts[1]), { type: "paper", path: r.parts[1] });
    } else if (r.parts[0] === "paper" && r.parts[2] === "original") {
      await shell(main => renderTier3(main, r.parts[1]), { type: "paper", path: r.parts[1] });
    } else if (r.parts[0] === "folder") {
      const path = r.parts.slice(1).join("/");
      await shell(main => renderFolder(main, path), { type: "category", path });
    } else {
      await shell(main => {
        main.innerHTML = `<div class="p-10 text-muted">Not found: <code>${escapeHtml(r.raw)}</code></div>`;
      }, { type: "home" });
    }
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="p-10 text-danger">Error: ${escapeHtml(e.message)}</div>`;
  }
}

window.addEventListener("hashchange", render);
render();
window.navigate = (hash) => { location.hash = hash; };
// Expose a lightweight re-render hook so sub-views can trigger sidebar refresh.
window.paperReaderRefresh = render;
