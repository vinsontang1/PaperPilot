// Tier 3: PDF.js rendered pages (left) + translation markdown with annotations (right).
//
// Left pane: PDF.js renders each page to canvas (high DPI) with zoom controls.
//            No annotation on PDF side — just clean reading.
// Right pane: Translation as markdown with full annotation support (same as tier1/2).
import { api } from "./api.js";
import {
  applyMarkdownAnnotations,
  installSelectionToolbar,
  markdownTargetBuilder,
  hideToolbar,
  renderAnnotationBar,
} from "./annotations.js";
import { renderMarkdown, renderMath } from "./render.js";

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function topbar(paper, scale) {
  const z = Math.round(scale * 100);
  return `
    <div class="flex items-center gap-3 px-8 py-4 bg-white border-b border-slate-200">
      <button onclick="location.hash='#/'" class="px-2.5 py-1 text-[13px] border border-slate-200 bg-white text-textSoft rounded-md hover:bg-slate-50 transition">← 首页</button>
      <div class="min-w-0 flex-1">
        <h1 class="text-[15px] font-semibold m-0 truncate leading-tight">${escapeHtml(paper.title)}</h1>
        <div class="text-[11px] text-muted mt-0.5">档位3 · 原文 + 翻译</div>
      </div>
      <div class="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-md">
        <button id="zoom-out" class="px-2.5 py-1 text-[14px] rounded hover:bg-white hover:text-accent transition" title="缩小">−</button>
        <span id="zoom-label" class="px-2 text-[12px] text-muted min-w-[42px] text-center">${z}%</span>
        <button id="zoom-in"  class="px-2.5 py-1 text-[14px] rounded hover:bg-white hover:text-accent transition" title="放大">+</button>
        <button id="zoom-fit" class="px-2.5 py-1 text-[14px] rounded hover:bg-white hover:text-accent transition" title="适应宽度">⤢</button>
      </div>
      <div class="inline-flex gap-1 p-1 bg-slate-100 rounded-md">
        <button onclick="location.hash='#/paper/${paper.id}'" class="px-3 py-1 text-[13px] font-medium rounded text-textSoft hover:text-accent transition">摘要</button>
        <button onclick="location.hash='#/paper/${paper.id}/detail'" class="px-3 py-1 text-[13px] font-medium rounded text-textSoft hover:text-accent transition">精解</button>
        <button class="px-3 py-1 text-[13px] font-medium rounded bg-white text-accent shadow-sm transition">原文+翻译</button>
      </div>
    </div>
  `;
}

function annItem(a) {
  const swatch = a.color
    ? `<span class="inline-block w-3 h-3 rounded-sm border border-black/10 align-middle" style="background:${a.color}"></span>`
    : "";
  return `
    <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-md mb-2 text-[13px]">
      <div class="flex items-center gap-1.5 text-[12px] text-muted">
        <span class="px-1.5 py-[1px] bg-white border border-slate-200 rounded-full font-medium">${a.type}</span>
        ${swatch}
        <button class="ml-auto text-[11px] px-2 py-[1px] border border-slate-200 bg-white text-muted rounded hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all" data-ann-del="${a.id}">删除</button>
      </div>
      <div class="text-muted italic text-[12px] mt-1 line-clamp-2">"${escapeHtml((a.target?.quote || "").slice(0, 140))}"</div>
      ${a.comment_markdown ? `<div class="mt-1.5 p-2 bg-white border border-slate-200 rounded text-[12px]">${escapeHtml(a.comment_markdown)}</div>` : ""}
    </div>
  `;
}

async function loadPdfJs() {
  if (window.__pdfjsLib) return window.__pdfjsLib;
  const mod = await import("/web/vendor/pdfjs/pdf.min.mjs");
  mod.GlobalWorkerOptions.workerSrc = "/web/vendor/pdfjs/pdf.worker.min.mjs";
  window.__pdfjsLib = mod;
  return mod;
}

const STORAGE_KEY = "pr.tier3.scale";

function buildTranslationMarkdown(paragraphs) {
  if (!paragraphs || paragraphs.length === 0) return "_(尚未生成翻译)_";
  return paragraphs
    .filter(p => (p.text_zh || "").trim())
    .map(p => p.text_zh)
    .join("\n\n");
}

export async function renderTier3(root, paperId) {
  root.innerHTML = `<div class="p-10 text-muted">加载中…</div>`;
  const [paper, trans, anns] = await Promise.all([
    api.paper(paperId),
    api.getTranslation(paperId),
    api.listAnnotations(paperId, { tier: 3 }),
  ]);

  let scale = parseFloat(localStorage.getItem(STORAGE_KEY) || "1.5");
  if (!Number.isFinite(scale) || scale < 0.5 || scale > 4) scale = 1.5;

  const active = anns.filter(a => !a.broken);
  const transMarkdown = buildTranslationMarkdown(trans.paragraphs);

  root.innerHTML = `
    ${topbar(paper, scale)}
    ${renderAnnotationBar()}
    <div class="flex flex-1 min-h-0">
      <!-- Left: PDF.js canvas rendering -->
      <div id="pdf-pane" class="flex-1 min-w-0 overflow-auto bg-slate-600 py-4 px-3"></div>
      <!-- Right: translation markdown + annotations -->
      <div class="w-[46%] min-w-[380px] flex flex-col border-l border-slate-200 bg-white">
        <div class="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50/50 flex-none">
          <span class="text-[11px] text-muted uppercase tracking-widest font-semibold">中文翻译</span>
          <span class="text-[11px] text-muted">${trans.paragraphs.filter(p => (p.text_zh || "").trim()).length} 段</span>
        </div>
        <div class="flex-1 flex min-h-0">
          <div class="flex-1 overflow-y-auto px-6 py-5" id="trans-scroll">
            <article class="prose-paper" id="trans-md">${renderMarkdown(transMarkdown)}</article>
          </div>
          <aside class="w-[200px] border-l border-slate-200 overflow-y-auto p-3 flex-none bg-white">
            <h3 class="text-[10px] text-muted uppercase tracking-widest font-semibold mb-2 flex items-center gap-1.5">
              标注 <span class="bg-indigo-50 text-accent px-1.5 py-[1px] rounded-full text-[11px] font-semibold normal-case tracking-normal" id="ann-count">${active.length}</span>
            </h3>
            <div id="ann-list">${active.map(annItem).join("") || '<div class="text-muted text-[13px] py-1">暂无标注</div>'}</div>
          </aside>
        </div>
      </div>
    </div>
  `;

  const pdfPane = root.querySelector("#pdf-pane");
  const transMd = root.querySelector("#trans-md");

  // ---- Render translation markdown + math + existing annotations ----
  renderMath(transMd);
  applyMarkdownAnnotations(transMd, active);

  // ---- PDF.js rendering ----
  const dpr = window.devicePixelRatio || 1;
  let pdfDoc = null;

  async function renderPdf() {
    pdfPane.innerHTML = "";
    if (!pdfDoc) {
      const pdfjsLib = await loadPdfJs();
      pdfDoc = await pdfjsLib.getDocument({ url: api.pdfURL(paperId) }).promise;
    }
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const wrap = document.createElement("div");
      wrap.className = "pdf-page";
      wrap.dataset.pageNum = String(pageNum);
      wrap.style.width = `${viewport.width}px`;
      wrap.style.height = `${viewport.height}px`;

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width * dpr);
      canvas.height = Math.round(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      wrap.appendChild(canvas);
      pdfPane.appendChild(wrap);

      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      await page.render({ canvasContext: ctx, viewport }).promise;
    }
  }

  // ---- Zoom controls ----
  function applyZoom(newScale) {
    scale = Math.max(0.5, Math.min(4, newScale));
    localStorage.setItem(STORAGE_KEY, String(scale));
    document.getElementById("zoom-label").textContent = `${Math.round(scale * 100)}%`;
    renderPdf();
  }
  document.getElementById("zoom-in").onclick = () => applyZoom(scale + 0.2);
  document.getElementById("zoom-out").onclick = () => applyZoom(scale - 0.2);
  document.getElementById("zoom-fit").onclick = () => {
    if (!pdfDoc) return;
    pdfDoc.getPage(1).then(page => {
      const vp1 = page.getViewport({ scale: 1 });
      const fit = (pdfPane.clientWidth - 40) / vp1.width;
      applyZoom(fit);
    });
  };

  // ---- Annotation support on translation pane (same as tier1/2) ----
  async function refreshAnnotations() {
    const fresh = await api.listAnnotations(paperId, { tier: 3 });
    const freshActive = fresh.filter(a => !a.broken);
    transMd.innerHTML = renderMarkdown(transMarkdown);
    renderMath(transMd);
    applyMarkdownAnnotations(transMd, freshActive);
    const annList = document.getElementById("ann-list");
    if (annList) {
      annList.innerHTML = freshActive.map(annItem).join("") || '<div class="text-muted text-[13px] py-1">暂无标注</div>';
      wireAnnDel(annList);
    }
    const annCount = document.getElementById("ann-count");
    if (annCount) annCount.textContent = String(freshActive.length);
  }

  function wireAnnDel(container) {
    container.querySelectorAll("[data-ann-del]").forEach(b => {
      b.onclick = async () => {
        await api.deleteAnnotation(paperId, b.dataset.annDel);
        await refreshAnnotations();
      };
    });
  }

  installSelectionToolbar({
    paperId,
    tier: 3,
    rootEl: transMd,
    targetBuilder: markdownTargetBuilder("translation.md", transMd),
    onChanged: refreshAnnotations,
  });

  wireAnnDel(root.querySelector("#ann-list"));
  hideToolbar();
  await renderPdf();
}
