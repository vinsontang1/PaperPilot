// Folder detail page: upper = contents (subfolders + papers), lower = citation article.
import { api } from "./api.js";
import { renderMarkdown, renderMath, resolveImages } from "./render.js";
import { confirm, escapeHtml, pickCategory } from "./ui-kit.js";

function statusPill(s) {
  const map = {
    unprocessed: ["bg-slate-100 text-muted", "未处理"],
    preprocessed: ["bg-amber-100 text-amber-700", "预处理"],
    read: ["bg-emerald-100 text-emerald-700", "已读"],
  };
  const [cls, label] = map[s] || ["bg-slate-100 text-muted", s];
  return `<span class="inline-flex items-center text-[11px] font-medium px-2 py-[2px] rounded-full ${cls}">${label}</span>`;
}

function childCategoryChip(name, full, count) {
  return `
    <div class="cat-chip flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-sm cursor-pointer transition"
         data-goto="${full}">
      <div class="w-8 h-8 rounded-md bg-gradient-to-br from-indigo-50 to-violet-50 text-accent flex items-center justify-center">📁</div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-[13px] truncate">${escapeHtml(name)}</div>
        <div class="text-[11px] text-muted">${count} 篇</div>
      </div>
      <span class="text-muted">→</span>
    </div>
  `;
}

function paperRow(p) {
  return `
    <div class="paper-row group bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-3 hover:border-indigo-300 hover:shadow-sm transition cursor-pointer" data-id="${p.id}">
      <div class="w-8 h-8 rounded-md bg-gradient-to-br from-indigo-50 to-violet-50 text-accent flex items-center justify-center flex-none">📄</div>
      <div class="min-w-0 flex-1">
        <div class="font-semibold text-[13px] truncate">${escapeHtml(p.title)}</div>
        <div class="text-[11px] text-muted mt-0.5 flex items-center gap-2">
          ${statusPill(p.status)}
          ${p.year ? `<span>${p.year}</span>` : ""}
          <code class="text-[10px] bg-slate-50 border border-slate-200 px-1.5 rounded">${escapeHtml(p.id)}</code>
        </div>
      </div>
      <div class="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
        <button data-act="move" class="px-2 py-0.5 text-[11px] border border-slate-200 bg-white text-textSoft rounded hover:bg-slate-50" title="迁移">📁</button>
        <button data-act="del" class="px-2 py-0.5 text-[11px] border border-slate-200 bg-white text-textSoft rounded hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200" title="删除">🗑</button>
      </div>
    </div>
  `;
}

export async function renderFolder(root, path) {
  root.innerHTML = `<div class="p-10 text-muted">加载中…</div>`;
  const [tree, { papers }, home] = await Promise.all([
    api.categories(),
    api.papersUnder(path),
    api.getFolderHomepage(path).catch(() => ({ markdown: "" })),
  ]);

  // Subcategory list: look up node at `path` and read its direct children
  function walk(node, parts) {
    for (const p of parts) {
      node = (node || {})[p];
      if (!node) return null;
    }
    return node;
  }
  const node = walk(tree.tree, path.split("/").filter(Boolean)) || {};
  const subcats = Object.keys(node).sort().map(n => ({
    name: n,
    full: `${path}/${n}`,
    count: (tree.papers[`${path}/${n}`] || []).length,
  }));

  // Direct papers (strictly in this path, not descendants)
  const directIds = tree.papers[path] || [];
  const directPapers = await Promise.all(directIds.map(id => api.paper(id).catch(() => null)));
  const directPapersValid = directPapers.filter(Boolean);

  const copyPrompt = `请递归阅读分类「${path}」下所有论文的 summary，并为这个分类写一篇引用文稿（cite with placeholders）。每次引用用 [[CITE:<paper_id>]] 占位，Web 会自动替换为链接。写完后调用 PUT /folders/${path}/homepage 保存。路径 = ${path}。`;

  root.innerHTML = `
    <div class="flex items-center gap-3 px-8 py-4 bg-white border-b border-slate-200">
      <button onclick="location.hash='#/'" class="px-2.5 py-1 text-[13px] border border-slate-200 bg-white text-textSoft rounded-md hover:bg-slate-50 transition">← 首页</button>
      <div class="flex-1 min-w-0">
        <h1 class="text-[20px] font-bold m-0 flex items-center gap-2">
          <span>📁</span>
          <span class="truncate">${escapeHtml(path)}</span>
        </h1>
        <div class="text-[12px] text-muted mt-0.5">${subcats.length} 个子分类 · ${papers.length} 篇文献（含子分类）</div>
      </div>
      <button id="copy-prompt" class="px-3 py-1.5 text-[13px] border border-slate-200 bg-white text-textSoft font-medium rounded-md hover:bg-slate-50 hover:border-indigo-200 hover:text-accent transition">📋 复制 Agent 提示</button>
      <button id="delete-cat" class="px-3 py-1.5 text-[13px] border border-slate-200 bg-white text-rose-600 font-medium rounded-md hover:bg-rose-50 hover:border-rose-200 transition">🗑 删除分类</button>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-5xl mx-auto px-8 py-6 space-y-6">

        <!-- Upper: contents -->
        <section>
          <h2 class="text-[11px] uppercase tracking-widest text-muted font-semibold mb-3">目录内容</h2>
          ${subcats.length ? `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              ${subcats.map(s => childCategoryChip(s.name, s.full, s.count)).join("")}
            </div>
          ` : ""}
          ${directPapersValid.length ? `
            <div class="space-y-2">
              ${directPapersValid.map(paperRow).join("")}
            </div>
          ` : ""}
          ${(subcats.length === 0 && directPapersValid.length === 0) ? `
            <div class="p-8 bg-white border-2 border-dashed border-slate-200 rounded-lg text-center text-muted text-sm">
              此分类下暂无内容
            </div>
          ` : ""}
        </section>

        <!-- Lower: citation article / homepage -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-[11px] uppercase tracking-widest text-muted font-semibold">引用文稿</h2>
            ${home.markdown ? `<span class="text-[11px] text-muted">由 Agent 生成</span>` : ""}
          </div>
          <div class="bg-white border border-slate-200 rounded-xl p-8">
            ${home.markdown
              ? `<article class="prose-paper" id="home-md">${renderMarkdown(home.markdown)}</article>`
              : `<div class="text-center text-muted text-sm py-8">
                   <div class="text-3xl mb-3">📝</div>
                   <div>还没有分类总结。</div>
                   <div class="text-[12px] mt-2">点击右上角"复制 Agent 提示"，到 Agent 对话中粘贴后让 Agent 生成</div>
                 </div>`
            }
          </div>
        </section>

      </div>
    </div>
  `;

  // wire upper
  root.querySelectorAll("[data-goto]").forEach(e => {
    e.onclick = () => { location.hash = `#/folder/${e.dataset.goto}`; };
  });
  root.querySelectorAll(".paper-row").forEach(r => {
    const id = r.dataset.id;
    r.onclick = () => { location.hash = `#/paper/${id}`; };
    r.querySelector("[data-act=move]").onclick = async (e) => {
      e.stopPropagation();
      const p = directPapersValid.find(x => x.id === id);
      const choice = await pickCategory(p?.category);
      if (!choice || choice.action !== "pick") return;
      await api.movePaper(id, choice.path);
      window.paperReaderRefresh && window.paperReaderRefresh();
    };
    r.querySelector("[data-act=del]").onclick = async (e) => {
      e.stopPropagation();
      const p = directPapersValid.find(x => x.id === id);
      if (await confirm(`删除「${p?.title || id}」?`, "会删除标注/QA/翻译。原始 PDF 保留。", "删除", true)) {
        await api.deletePaper(id);
        window.paperReaderRefresh && window.paperReaderRefresh();
      }
    };
  });

  // copy prompt
  root.querySelector("#copy-prompt").onclick = () => {
    navigator.clipboard.writeText(copyPrompt).then(() => {
      root.querySelector("#copy-prompt").textContent = "✓ 已复制";
    });
  };

  // delete category
  root.querySelector("#delete-cat").onclick = async () => {
    if (!(await confirm(`删除分类「${path}」?`, "分类必须为空（包括子分类）。文献本身不会被删除。", "删除", true))) return;
    try {
      await api.deleteCategory(path);
      location.hash = "#/";
    } catch (e) {
      alert("删除失败: " + e.message);
    }
  };

  // render homepage markdown (math + citation links)
  const mdRoot = root.querySelector("#home-md");
  if (mdRoot) {
    resolveCitations(mdRoot);
    resolveImages(mdRoot);
    renderMath(mdRoot);
  }
}

// Resolve [[CITE:paper_id]] placeholders to navigation links.
function resolveCitations(container) {
  const pattern = /\[\[CITE:([a-zA-Z0-9_\-]+)\]\]/g;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) {
    if (pattern.test(n.nodeValue)) { pattern.lastIndex = 0; nodes.push(n); }
  }
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    const text = node.nodeValue;
    let i = 0;
    const re = new RegExp(pattern.source, pattern.flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > i) frag.appendChild(document.createTextNode(text.slice(i, m.index)));
      const a = document.createElement("a");
      a.href = `#/paper/${m[1]}`;
      a.textContent = `[${m[1]}]`;
      a.className = "text-accent font-mono text-[12px] px-1 py-[1px] bg-indigo-50 rounded border border-indigo-100 no-underline hover:bg-indigo-100";
      frag.appendChild(a);
      i = re.lastIndex;
    }
    if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
    node.parentNode.replaceChild(frag, node);
  }
}
