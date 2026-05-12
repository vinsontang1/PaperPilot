// tier 1 (summary) and tier 2 (detail) markdown views.
import { api } from "./api.js";
import {
  applyMarkdownAnnotations,
  installSelectionToolbar,
  markdownTargetBuilder,
  hideToolbar,
  renderAnnotationBar,
} from "./annotations.js";
import { renderMarkdown, renderMath, resolveImages, resolveFigurePlaceholders } from "./render.js";
import { confirm, escapeHtml, lightbox, pickCategory } from "./ui-kit.js";

// ---- Top bar ---------------------------------------------------------

function topbar(paper, tier) {
  const tiers = [
    { k: "summary",  label: "摘要",        hash: `#/paper/${paper.id}` },
    { k: "detail",   label: "精解",        hash: `#/paper/${paper.id}/detail` },
    { k: "original", label: "原文+翻译",   hash: `#/paper/${paper.id}/original` },
  ];
  return `
    <div class="flex items-center gap-3 px-8 py-4 bg-white border-b border-slate-200">
      <button onclick="location.hash='#/'" class="px-2.5 py-1 text-[13px] border border-slate-200 bg-white text-textSoft rounded-md hover:bg-slate-50 transition">← 首页</button>
      <div class="min-w-0 flex-1">
        <h1 class="text-[15px] font-semibold m-0 truncate leading-tight">${escapeHtml(paper.title)}</h1>
        <div class="text-[11px] text-muted mt-0.5 flex items-center gap-2">
          ${paper.category ? `<span class="inline-flex items-center px-1.5 py-[1px] rounded-full bg-slate-100">${escapeHtml(paper.category)}</span>` : `<span class="inline-flex items-center px-1.5 py-[1px] rounded-full bg-amber-50 text-amber-700">未归档</span>`}
          <code class="text-[10px] bg-slate-50 border border-slate-200 px-1.5 rounded">${escapeHtml(paper.id)}</code>
        </div>
      </div>
      <div class="inline-flex gap-1 p-1 bg-slate-100 rounded-md">
        ${tiers.map(t => `
          <button onclick="location.hash='${t.hash}'"
                  class="px-3 py-1 text-[13px] font-medium rounded transition-all
                         ${t.k === tier ? 'bg-white text-accent shadow-sm' : 'text-textSoft hover:text-accent'}">
            ${t.label}
          </button>
        `).join("")}
      </div>
      <button id="paper-move" class="px-2.5 py-1 text-[12px] border border-slate-200 bg-white text-textSoft rounded-md hover:bg-slate-50" title="迁移">📁</button>
      <button id="paper-delete" class="px-2.5 py-1 text-[12px] border border-slate-200 bg-white text-textSoft rounded-md hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200" title="删除">🗑</button>
      <select id="status-sel" class="px-2 py-1 text-[13px] border border-slate-200 rounded-md bg-white text-textSoft focus:outline-none focus:ring-2 focus:ring-indigo-200">
        <option value="unprocessed" ${paper.status === "unprocessed" ? "selected" : ""}>未处理</option>
        <option value="preprocessed" ${paper.status === "preprocessed" ? "selected" : ""}>预处理</option>
        <option value="read" ${paper.status === "read" ? "selected" : ""}>已读</option>
      </select>
    </div>
  `;
}

// ---- Side content ----------------------------------------------------

function qaItem(q) {
  const answered = !!q.answer_markdown;
  return `
    <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-md mb-2 text-[13px]">
      <div class="flex items-center gap-2">
        <span class="font-bold text-accent">${q.id}</span>
        <span class="text-[11px] text-muted">tier ${q.tier}</span>
      </div>
      <div class="text-muted italic text-[12px] mt-1 line-clamp-2">${escapeHtml((q.selection?.quote || "").slice(0, 160))}</div>
      <div class="mt-1 text-[12px] ${answered ? 'text-emerald-700' : 'text-muted'}">
        ${answered ? `✓ 已答${q.synced_to_summary ? ' · 已同步' : ''}` : '待回答'}
      </div>
    </div>
  `;
}

function annItem(a) {
  const swatch = a.color
    ? `<span class="inline-block w-3 h-3 rounded-sm border border-black/10 align-middle" style="background:${a.color}"></span>`
    : "";
  return `
    <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-md mb-2 text-[13px]" data-row="${a.id}">
      <div class="flex items-center gap-1.5 text-[12px] text-muted">
        <span class="px-1.5 py-[1px] bg-white border border-slate-200 rounded-full font-medium">${a.type}</span>
        ${swatch}
        <button class="ml-auto text-[11px] px-2 py-[1px] border border-slate-200 bg-white text-muted rounded hover:bg-indigo-50 hover:text-accent hover:border-indigo-200 transition-all" data-ann-note="${a.id}">${a.comment_markdown ? "编辑" : "加注"}</button>
        <button class="text-[11px] px-2 py-[1px] border border-slate-200 bg-white text-muted rounded hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all" data-ann-del="${a.id}">删除</button>
      </div>
      <div class="text-muted italic text-[12px] mt-1 line-clamp-2">"${escapeHtml((a.target?.quote || "").slice(0, 140))}"</div>
      ${a.comment_markdown ? `<div class="mt-1.5 p-2 bg-white border border-slate-200 rounded text-[12px]">${escapeHtml(a.comment_markdown)}</div>` : ""}
    </div>
  `;
}

function brokenBar(broken) {
  if (!broken.length) return "";
  return `
    <div class="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-md text-[13px] text-rose-700">
      <div class="font-medium mb-1">⚠️ ${broken.length} 条标注的原文已不存在</div>
      ${broken.map(a => `
        <div class="flex items-center gap-2 mt-1 bg-white p-1.5 rounded">
          <span class="italic text-textSoft flex-1 truncate">"${escapeHtml((a.target?.quote || "").slice(0, 120))}"</span>
          ${a.comment_markdown ? `<span class="text-muted text-[12px] truncate">· ${escapeHtml(a.comment_markdown.slice(0, 80))}</span>` : ""}
          <button class="text-[11px] px-2 py-[1px] border border-slate-200 bg-white text-muted rounded hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all"
                  data-broken-del="${a.id}">删除</button>
        </div>
      `).join("")}
    </div>
  `;
}

function figuresSidebar(images, paperId) {
  if (!images || !images.length) return "";
  return `
    <aside class="w-[210px] border-r border-slate-200 bg-white overflow-y-auto p-3 flex-none">
      <h3 class="text-[10px] text-muted uppercase tracking-widest font-semibold mb-2 px-1">图表 <span class="text-accent">${images.length}</span></h3>
      <div class="grid gap-2.5">
        ${images.map((name, i) => `
          <div class="fig-thumb" data-fig="${escapeHtml(name)}">
            <img src="${api.imageURL(paperId, name)}" alt="${escapeHtml(name)}" loading="lazy">
            <div class="fig-caption">图 ${i + 1}</div>
          </div>
        `).join("")}
      </div>
    </aside>
  `;
}

// ---- Renderer --------------------------------------------------------

async function renderMarkdownTier(root, paperId, tier, source, getFn) {
  root.innerHTML = `<div class="p-10 text-muted">加载中…</div>`;
  const paper = await api.paper(paperId);
  const [{ markdown }, anns, qas] = await Promise.all([
    getFn(paperId),
    api.listAnnotations(paperId, { tier }),
    tier === 1 ? api.listQA(paperId) : Promise.resolve([]),
  ]);

  const images = (paper.files && paper.files.images) || [];
  const broken = anns.filter(a => a.broken);
  const active = anns.filter(a => !a.broken);

  root.innerHTML = `
    ${topbar(paper, source === "summary.md" ? "summary" : "detail")}
    ${renderAnnotationBar()}
    <div class="flex flex-1 min-h-0 bg-bg">
      ${figuresSidebar(images, paperId)}
      <main class="flex-1 min-w-0 overflow-y-auto px-12 py-8">
        ${brokenBar(broken)}
        <article class="prose-paper" id="md-root">${renderMarkdown(markdown)}</article>
      </main>
      <aside class="w-[300px] border-l border-slate-200 bg-white overflow-y-auto p-4 flex-none">
        ${tier === 1 ? `
          <h3 class="text-[10px] text-muted uppercase tracking-widest font-semibold mb-2 flex items-center gap-1.5">
            QA <span class="bg-indigo-50 text-accent px-1.5 py-[1px] rounded-full text-[11px] font-semibold normal-case tracking-normal">${qas.length}</span>
          </h3>
          <div id="qa-list">${qas.map(qaItem).join("") || '<div class="text-muted text-[13px] py-1">暂无问题</div>'}</div>
          <hr class="my-3 border-0 border-t border-slate-200">
        ` : ""}
        <h3 class="text-[10px] text-muted uppercase tracking-widest font-semibold mb-2 flex items-center gap-1.5">
          标注 <span class="bg-indigo-50 text-accent px-1.5 py-[1px] rounded-full text-[11px] font-semibold normal-case tracking-normal" id="ann-count">${active.length}</span>
        </h3>
        <div id="ann-list">${active.map(annItem).join("") || '<div class="text-muted text-[13px] py-1">暂无标注</div>'}</div>
      </aside>
    </div>
  `;

  const mdRoot = root.querySelector("#md-root");
  resolveFigurePlaceholders(mdRoot, paperId, images);
  resolveImages(mdRoot, paperId);
  renderMath(mdRoot);
  applyMarkdownAnnotations(mdRoot, active);

  // Clicking a rendered figure opens lightbox
  mdRoot.querySelectorAll("img[data-fig]").forEach(img => {
    img.onclick = (e) => { e.stopPropagation(); lightbox(img.src, img.closest("figure")?.querySelector("figcaption")?.textContent || ""); };
  });

  root.querySelectorAll(".fig-thumb").forEach(t => {
    t.onclick = () => lightbox(api.imageURL(paperId, t.dataset.fig), t.dataset.fig);
  });

  async function refreshAnnotationsIncrementally() {
    const fresh = await api.listAnnotations(paperId, { tier });
    const freshActive = fresh.filter(a => !a.broken);
    const freshBroken = fresh.filter(a => a.broken);

    mdRoot.innerHTML = renderMarkdown(markdown);
    resolveFigurePlaceholders(mdRoot, paperId, images);
    resolveImages(mdRoot, paperId);
    renderMath(mdRoot);
    applyMarkdownAnnotations(mdRoot, freshActive);
    mdRoot.querySelectorAll("img[data-fig]").forEach(img => {
      img.onclick = (e) => { e.stopPropagation(); lightbox(img.src, img.closest("figure")?.querySelector("figcaption")?.textContent || ""); };
    });

    const annList = document.getElementById("ann-list");
    if (annList) {
      annList.innerHTML = freshActive.map(annItem).join("") || '<div class="text-muted text-[13px] py-1">暂无标注</div>';
      wireAnnListButtons(annList);
    }
    const annCount = document.getElementById("ann-count");
    if (annCount) annCount.textContent = String(freshActive.length);

    const main = root.querySelector("main");
    let bb = main.querySelector(".bg-rose-50");
    const html = brokenBar(freshBroken);
    if (bb) bb.outerHTML = html;
    else if (html) main.insertAdjacentHTML("afterbegin", html);
    main.querySelectorAll("[data-broken-del]").forEach(b => {
      b.onclick = async () => {
        await api.deleteAnnotation(paperId, b.dataset.brokenDel);
        await refreshAnnotationsIncrementally();
      };
    });
  }

  function wireAnnListButtons(container) {
    container.querySelectorAll("[data-ann-del]").forEach(b => {
      b.onclick = async () => {
        if (!(await confirm("删除此标注?", "", "删除", true))) return;
        await api.deleteAnnotation(paperId, b.dataset.annDel);
        await refreshAnnotationsIncrementally();
      };
    });
    container.querySelectorAll("[data-ann-note]").forEach(b => {
      b.onclick = async () => {
        const aid = b.dataset.annNote;
        const ann = (await api.listAnnotations(paperId, { tier })).find(a => a.id === aid);
        const quote = ann?.target?.quote || "";
        const existing = ann?.comment_markdown || "";
        // use annotation module's prompt via a dynamic import to avoid coupling
        const mod = await import("./annotations.js");
        const next = await mod.promptAnnotationComment(quote, existing);
        if (next === null) return;
        await api.patchAnnotation(paperId, aid, { comment_markdown: next });
        await refreshAnnotationsIncrementally();
      };
    });
  }

  installSelectionToolbar({
    paperId,
    tier,
    rootEl: mdRoot,
    targetBuilder: markdownTargetBuilder(source, mdRoot),
    onChanged: refreshAnnotationsIncrementally,
  });

  // Top action buttons
  const sel = root.querySelector("#status-sel");
  if (sel) sel.onchange = async (e) => {
    await api.patchPaper(paperId, { status: e.target.value });
    window.paperReaderRefresh && window.paperReaderRefresh();
  };

  const moveBtn = root.querySelector("#paper-move");
  if (moveBtn) moveBtn.onclick = async () => {
    const choice = await pickCategory(paper.category);
    if (!choice || choice.action !== "pick") return;
    await api.movePaper(paperId, choice.path);
    window.paperReaderRefresh && window.paperReaderRefresh();
  };

  const delBtn = root.querySelector("#paper-delete");
  if (delBtn) delBtn.onclick = async () => {
    if (!(await confirm(`删除「${paper.title}」?`, "会删除论文所有处理结果（标注、QA、翻译）。原始 PDF 保留。", "删除", true))) return;
    await api.deletePaper(paperId);
    location.hash = "#/";
  };

  wireAnnListButtons(root.querySelector("#ann-list"));
  root.querySelectorAll("[data-broken-del]").forEach(b => {
    b.onclick = async () => {
      await api.deleteAnnotation(paperId, b.dataset.brokenDel);
      await refreshAnnotationsIncrementally();
    };
  });

  hideToolbar();
}

export async function renderTier1(root, paperId) {
  return renderMarkdownTier(root, paperId, 1, "summary.md", api.getSummary);
}
export async function renderTier2(root, paperId) {
  return renderMarkdownTier(root, paperId, 2, "detail.md", api.getDetail);
}
