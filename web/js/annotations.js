// Annotation toolbar (fixed under the topbar) + hover popups + markdown anchoring.
import { api } from "./api.js";

const popup = document.getElementById("hover-popup");

let currentCtx = null;
let lastRange = null;
let lastSelectionInfo = null; // { quote }

// ---- Toolbar markup ------------------------------------------------------

export function renderAnnotationBar() {
  return `
    <div id="ann-bar" class="flex items-center gap-3 px-5 py-2 bg-gradient-to-b from-[#fafafe] to-[#f3f4f9] border-b border-border text-[13px] flex-none">
      <div class="flex items-center gap-1.5 flex-none">
        <button data-act="highlight" class="px-2.5 py-1 border border-border bg-white rounded-md text-textSoft font-medium hover:bg-accentSoft hover:border-indigo-200 hover:text-accent transition-all inline-flex items-center gap-1.5" title="高亮选区">
          <span class="inline-block w-3.5 h-3.5 rounded-sm border border-black/10 bg-amber-200"></span> 高亮
        </button>
        <button data-act="underline" class="px-2.5 py-1 border border-border bg-white rounded-md text-textSoft font-medium hover:bg-accentSoft hover:border-indigo-200 hover:text-accent transition-all" title="下划线">U̲ 下划线</button>
        <button data-act="comment" class="px-2.5 py-1 border border-border bg-white rounded-md text-textSoft font-medium hover:bg-accentSoft hover:border-indigo-200 hover:text-accent transition-all" title="评论">💬 评论</button>
        <button data-act="ask" class="px-2.5 py-1 border border-border bg-white rounded-md text-textSoft font-medium hover:bg-accentSoft hover:border-indigo-200 hover:text-accent transition-all" title="向 Agent 提问">🤖 提问</button>
      </div>
      <div class="ann-bar-colors inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-border rounded-md" hidden>
        <span class="text-muted text-[12px]">选颜色 →</span>
        <span class="color-chip" data-color="#fde68a" style="background:#fde68a"></span>
        <span class="color-chip" data-color="#bbf7d0" style="background:#bbf7d0"></span>
        <span class="color-chip" data-color="#bfdbfe" style="background:#bfdbfe"></span>
        <span class="color-chip" data-color="#fecaca" style="background:#fecaca"></span>
        <span class="color-chip" data-color="#e9d5ff" style="background:#e9d5ff"></span>
      </div>
      <div class="flex-1 min-w-0 text-muted text-[12px] truncate">
        <span id="ann-bar-msg">先在正文上选中文字，然后点上面的按钮</span>
      </div>
    </div>
  `;
}

// ---- Install (called by tiers12 / tier3 after rendering) -----------------

export function installSelectionToolbar(ctx) {
  currentCtx = ctx;
  // Normalize rootEl to an array for multi-pane support (e.g. tier3 PDF + translation)
  if (ctx.rootEl && !Array.isArray(ctx.rootEl)) {
    ctx.rootEls = [ctx.rootEl];
  } else {
    ctx.rootEls = ctx.rootEl || [];
  }
  lastRange = null;
  lastSelectionInfo = null;

  const bar = document.getElementById("ann-bar");
  if (!bar) return;

  // Snapshot: when user mousedowns on a button, freeze lastRange so that
  // even if selectionchange fires and collapses the selection before click,
  // we still have a valid range to work with.
  let frozenRange = null;
  let frozenInfo = null;

  bar.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("mousedown", e => {
      e.preventDefault();
      // Freeze current selection state before browser potentially clears it
      frozenRange = lastRange;
      frozenInfo = lastSelectionInfo;
    });
    btn.onclick = (e) => {
      // Restore frozen range if lastRange was cleared between mousedown and click
      if (!lastRange && frozenRange) {
        lastRange = frozenRange;
        lastSelectionInfo = frozenInfo;
      }
      frozenRange = null;
      frozenInfo = null;
      onAction(btn.dataset.act);
    };
  });

  bar.querySelectorAll(".color-chip").forEach(chip => {
    chip.addEventListener("mousedown", e => {
      e.preventDefault();
      frozenRange = lastRange;
      frozenInfo = lastSelectionInfo;
    });
    chip.onclick = async () => {
      if (!lastRange && frozenRange) {
        lastRange = frozenRange;
        lastSelectionInfo = frozenInfo;
      }
      frozenRange = null;
      frozenInfo = null;
      if (!lastRange) return updateStatus("没有选区，请先选中文字", true);
      await createAnnotation("highlight", lastRange, { color: chip.dataset.color });
      bar.querySelector(".ann-bar-colors").hidden = true;
    };
  });

  syncStatus();
}

// ---- Selection tracking --------------------------------------------------

document.addEventListener("selectionchange", () => {
  syncStatus();
});

function syncStatus() {
  if (!currentCtx) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) {
    lastRange = null;
    lastSelectionInfo = null;
    updateStatus("先在正文上选中文字，然后点上面的按钮");
    return;
  }
  const range = sel.getRangeAt(0);
  const inScope = currentCtx.rootEls?.some(el => el && el.contains(range.commonAncestorContainer));
  if (!inScope) {
    return; // selection outside our content area; ignore but don't reset
  }
  lastRange = range.cloneRange();
  const quote = sel.toString();
  lastSelectionInfo = { quote };
  updateStatus(`已选中 ${quote.length} 字：${truncate(quote, 60)}`);
}

function updateStatus(msg, warn = false) {
  const el = document.getElementById("ann-bar-msg");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("warn", !!warn);
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ---- Actions -------------------------------------------------------------

async function onAction(act) {
  const bar = document.getElementById("ann-bar");
  if (!bar) return;

  if (!lastRange) {
    return updateStatus("没有选区，请先在正文中选中一段文字", true);
  }

  if (act === "highlight") {
    bar.querySelector(".ann-bar-colors").hidden = false;
    return;
  }
  if (act === "underline") {
    await createAnnotation("underline", lastRange);
    return;
  }
  if (act === "comment") {
    const text = await promptComment(lastSelectionInfo?.quote || "");
    if (text != null && text.trim() !== "") {
      await createAnnotation("comment", lastRange, { comment_markdown: text });
    }
    return;
  }
  if (act === "ask") {
    if (!currentCtx) return;
    const target = currentCtx.targetBuilder(lastRange);
    if (!target || !target.quote) return updateStatus("无法识别选区位置", true);
    const qa = await api.createQA(currentCtx.paperId, { tier: currentCtx.tier, selection: target });
    await showQidModal(qa);
    currentCtx.onChanged && currentCtx.onChanged();
    return;
  }
}

async function createAnnotation(type, range, extra = {}) {
  if (!currentCtx) return;
  const target = currentCtx.targetBuilder(range);
  if (!target || !target.quote) {
    return updateStatus("选区不在可标注区域", true);
  }
  const ann = { type, tier: currentCtx.tier, target, ...extra };
  await api.createAnnotation(currentCtx.paperId, ann);
  updateStatus(`已添加 ${type} 标注`);
  currentCtx.onChanged && currentCtx.onChanged();
}

// ---- Modal helpers -------------------------------------------------------

async function promptComment(quote, existing = "") {
  return promptAnnotationComment(quote, existing);
}

export async function promptAnnotationComment(quote, existing = "") {
  return new Promise(resolve => {
    const root = document.getElementById("modal-root");
    root.innerHTML = `
      <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[1100] p-6" data-backdrop>
        <div class="bg-white rounded-xl shadow-modal max-w-[560px] w-full overflow-hidden">
          <div class="px-6 py-5">
            <h3 class="m-0 mb-3 text-[16px] font-semibold">${existing ? "编辑评论" : "添加评论"}</h3>
            ${quote ? `<blockquote class="bg-slate-50 border-l-[3px] border-indigo-200 py-1.5 px-3 m-0 mb-3 italic text-textSoft rounded-r text-[13px]">${escapeHtml(truncate(quote, 200))}</blockquote>` : ""}
            <textarea id="cm-text" class="w-full min-h-[100px] box-border px-3 py-2 border border-slate-200 rounded-md font-sans text-[14px] leading-[1.6] focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-accent" placeholder="支持 Markdown">${escapeHtml(existing)}</textarea>
            <div class="flex gap-2 justify-end mt-3">
              <button id="cm-cancel" class="px-3.5 py-1.5 rounded-md border border-slate-200 bg-white text-textSoft text-[13px] font-medium hover:bg-slate-50 transition">取消</button>
              ${existing ? `<button id="cm-clear" class="px-3.5 py-1.5 rounded-md border border-slate-200 bg-white text-rose-600 text-[13px] font-medium hover:bg-rose-50 hover:border-rose-200 transition">清空评论</button>` : ""}
              <button id="cm-ok" class="px-3.5 py-1.5 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-indigo-700 transition">保存</button>
            </div>
          </div>
        </div>
      </div>
    `;
    const done = (v) => { root.innerHTML = ""; resolve(v); };
    root.querySelector("#cm-cancel").onclick = () => done(null);
    const clearBtn = root.querySelector("#cm-clear");
    if (clearBtn) clearBtn.onclick = () => done("");
    root.querySelector("#cm-ok").onclick = () => done(root.querySelector("#cm-text").value);
    root.querySelector("[data-backdrop]").onclick = (e) => { if (e.target.hasAttribute("data-backdrop")) done(null); };
    setTimeout(() => root.querySelector("#cm-text").focus(), 0);
  });
}

async function showQidModal(qa) {
  return new Promise(resolve => {
    const root = document.getElementById("modal-root");
    const quoted = (qa.selection?.quote || "").slice(0, 300);
    const prompt = `请回答问题 ${qa.id}\n\n原文引用: ${quoted}\n\n(回答后告诉我 "同步 QA 到论文" 即可将此问答写回论文首页)`;
    root.innerHTML = `
      <div class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[1100]" data-backdrop>
        <div class="bg-white rounded-xl shadow-modal p-6 w-[92%] max-w-[540px]">
          <h3 class="m-0 mb-3 text-[16px] font-semibold">已创建问题 <span class="text-accent">${qa.id}</span></h3>
          <p class="text-muted text-[13px] m-0 mb-3">已自动复制到剪贴板。粘贴到 Agent 窗口即可提问：</p>
          <textarea readonly class="w-full min-h-[140px] box-border px-3 py-2 border border-border rounded-md font-sans text-[13px] leading-[1.6] bg-panel2">${escapeHtml(prompt)}</textarea>
          <div class="flex gap-2 justify-end mt-3">
            <button id="qid-copy" class="px-3.5 py-1.5 rounded-md bg-accent text-white font-medium hover:bg-indigo-700 transition">📋 复制</button>
            <button id="qid-close" class="px-3.5 py-1.5 rounded-md border border-border bg-white text-textSoft font-medium hover:bg-panel2 transition">关闭</button>
          </div>
        </div>
      </div>
    `;
    const done = () => { root.innerHTML = ""; resolve(); };
    root.querySelector("#qid-close").onclick = done;
    root.querySelector("[data-backdrop]").onclick = (e) => { if (e.target.hasAttribute("data-backdrop")) done(); };
    root.querySelector("#qid-copy").onclick = () => {
      navigator.clipboard.writeText(prompt).then(() => {
        root.querySelector("#qid-copy").textContent = "✓ 已复制";
      });
    };
    navigator.clipboard.writeText(prompt).catch(() => {});
  });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// kept for backward-compat with old tier code
export function hideToolbar() {
  const bar = document.getElementById("ann-bar");
  if (bar) bar.querySelector(".ann-bar-colors").hidden = true;
}

// ---- Hover popup ---------------------------------------------------------

const ANN_CLASSES = new Set(["ann-hl", "ann-ul", "ann-cm", "pdf-ann"]);

function findAnnTarget(el) {
  while (el && el !== document.body) {
    if (el.dataset && el.dataset.annId) {
      const cls = el.classList || { contains: () => false };
      let isMarker = false;
      ANN_CLASSES.forEach(c => { if (cls.contains(c)) isMarker = true; });
      if (isMarker) return el;
    }
    el = el.parentElement;
  }
  return null;
}

let hoverEl = null;
let hoverHideTimer = null;

function positionPopup(anchorRect) {
  popup.style.top = `${window.scrollY + anchorRect.bottom + 6}px`;
  popup.style.left = `${window.scrollX + Math.max(8, anchorRect.left)}px`;
}

function renderPopupHtml(t) {
  const id = t.dataset.annId;
  const comment = t.dataset.comment || "";
  const hasComment = comment.trim() !== "";
  return `
    <div class="hover-card">
      ${hasComment
        ? `<div class="hover-body">${escapeHtml(comment)}</div>`
        : `<div class="hover-body-empty">无评论</div>`}
      <div class="hover-actions">
        <button data-act="edit" class="hover-btn">${hasComment ? "✏️ 编辑" : "💬 添加评论"}</button>
        <button data-act="del"  class="hover-btn hover-btn-danger">🗑 删除</button>
      </div>
    </div>
  `;
}

function showPopupFor(t) {
  hoverEl = t;
  popup.hidden = false;
  popup.innerHTML = renderPopupHtml(t);
  positionPopup(t.getBoundingClientRect());
  // Wire buttons — dispatch custom events that tier code handles.
  popup.querySelectorAll("[data-act]").forEach(b => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const aid = t.dataset.annId;
      const act = b.dataset.act;
      if (act === "edit") {
        const current = t.dataset.comment || "";
        const next = await promptComment(t.textContent || "", current);
        if (next === null) return;
        await api.patchAnnotation(currentCtx?.paperId, aid, { comment_markdown: next });
        hideHoverNow();
        currentCtx?.onChanged && currentCtx.onChanged();
      } else if (act === "del") {
        if (await (await import("./ui-kit.js")).confirm("删除标注?", "", "删除", true)) {
          await api.deleteAnnotation(currentCtx?.paperId, aid);
          hideHoverNow();
          currentCtx?.onChanged && currentCtx.onChanged();
        }
      }
    };
  });
}

function hideHoverNow() {
  popup.hidden = true;
  popup.innerHTML = "";
  hoverEl = null;
}

// Show on hover. Keep popup alive while cursor is over popup itself.
document.addEventListener("mousemove", (e) => {
  // If cursor is inside popup, do nothing (keep alive).
  if (!popup.hidden && popup.contains(e.target)) {
    if (hoverHideTimer) { clearTimeout(hoverHideTimer); hoverHideTimer = null; }
    return;
  }
  const t = findAnnTarget(e.target);
  if (t === hoverEl) return;
  if (!t) {
    // Scheduled hide; allow cursor to travel to popup.
    if (hoverHideTimer) clearTimeout(hoverHideTimer);
    hoverHideTimer = setTimeout(() => hideHoverNow(), 180);
    return;
  }
  if (hoverHideTimer) { clearTimeout(hoverHideTimer); hoverHideTimer = null; }
  showPopupFor(t);
});

window.addEventListener("scroll", () => { hideHoverNow(); }, true);

// ---- Markdown anchor application ----------------------------------------

export function applyMarkdownAnnotations(container, annotations) {
  for (const ann of annotations) {
    if (ann.broken) continue;
    const t = ann.target || {};
    const quote = t.quote;
    if (!quote) continue;
    const found = findTextRange(container, quote, t.prefix, t.suffix);
    if (!found) { ann.__display_broken = true; continue; }
    wrapRange(found, ann);
  }
}

function buildTextIndex(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  const ranges = [];
  let text = "";
  let n;
  while ((n = walker.nextNode())) {
    if (n.parentNode && n.parentNode.closest && n.parentNode.closest("[data-ann-id]")) continue;
    const start = text.length;
    text += n.nodeValue;
    nodes.push(n);
    ranges.push([start, text.length]);
  }
  return { text, nodes, ranges };
}

function findTextRange(root, quote, prefix, suffix) {
  const { text, nodes, ranges } = buildTextIndex(root);
  let idx = -1;
  if (prefix || suffix) {
    const search = (prefix || "") + quote + (suffix || "");
    const at = text.indexOf(search);
    if (at !== -1) idx = at + (prefix?.length || 0);
  }
  if (idx === -1) idx = text.indexOf(quote);
  if (idx === -1) return null;
  const end = idx + quote.length;
  return locateRange(nodes, ranges, idx, end);
}

function locateRange(nodes, ranges, start, end) {
  let startNode = null, startOffset = 0, endNode = null, endOffset = 0;
  for (let i = 0; i < nodes.length; i++) {
    const [a, b] = ranges[i];
    if (startNode == null && start >= a && start < b) { startNode = nodes[i]; startOffset = start - a; }
    if (end > a && end <= b) { endNode = nodes[i]; endOffset = end - a; break; }
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  try {
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
  } catch { return null; }
  return range;
}

function wrapRange(range, ann) {
  const pieces = splitRangePerNode(range);
  for (const r of pieces) {
    const span = document.createElement("span");
    span.dataset.annId = ann.id;
    if (ann.comment_markdown) span.dataset.comment = ann.comment_markdown;
    if (ann.type === "highlight") {
      span.className = "ann-hl";
      span.style.background = ann.color || "#fde68a";
    } else if (ann.type === "underline") {
      span.className = "ann-ul";
    } else if (ann.type === "comment") {
      span.className = "ann-cm";
    }
    try { r.surroundContents(span); } catch {}
  }
}

function splitRangePerNode(range) {
  const out = [];
  const start = range.startContainer;
  const end = range.endContainer;
  if (start === end && start.nodeType === 3) {
    const r = document.createRange();
    r.setStart(start, range.startOffset);
    r.setEnd(end, range.endOffset);
    out.push(r);
    return out;
  }
  const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
    acceptNode(node) { return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
  });
  let node;
  while ((node = walker.nextNode())) {
    const r = document.createRange();
    const s = node === start ? range.startOffset : 0;
    const e = node === end ? range.endOffset : node.nodeValue.length;
    if (s >= e) continue;
    r.setStart(node, s);
    r.setEnd(node, e);
    out.push(r);
  }
  return out;
}

// ---- Target builders -----------------------------------------------------

export function markdownTargetBuilder(source, rootEl) {
  return (range) => {
    const quote = range.toString();
    if (!quote) return null;
    const { text } = buildTextIndex(rootEl);
    const idx = findRangeStart(rootEl, range);
    const prefix = idx >= 0 ? text.slice(Math.max(0, idx - 24), idx) : "";
    const suffix = idx >= 0 ? text.slice(idx + quote.length, idx + quote.length + 24) : "";
    return { source, quote, prefix, suffix };
  };
}

function findRangeStart(root, range) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let offset = 0, n;
  while ((n = walker.nextNode())) {
    if (n === range.startContainer) return offset + range.startOffset;
    offset += n.nodeValue.length;
  }
  return -1;
}

export function pdfTargetBuilder() {
  return (range) => {
    const quote = range.toString();
    if (!quote) return null;
    let node = range.startContainer;
    while (node && node.nodeType === 3) node = node.parentNode;
    while (node && !node.dataset?.pid) node = node.parentNode;
    const pid = node?.dataset?.pid || null;
    return { pid, quote, char_start: 0, char_end: quote.length };
  };
}
