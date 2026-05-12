import { api } from "./api.js";
import { confirm, escapeHtml, pickCategory, uploadPdf } from "./ui-kit.js";

function statusPill(s) {
  const map = {
    unprocessed: ["bg-slate-100 text-muted", "未处理"],
    preprocessed: ["bg-amber-100 text-amber-700", "预处理"],
    read: ["bg-emerald-100 text-emerald-700", "已读"],
  };
  const [cls, label] = map[s] || ["bg-slate-100 text-muted", s];
  return `<span class="inline-flex items-center text-[11px] font-medium px-2 py-[2px] rounded-full ${cls}">${label}</span>`;
}

function card(p) {
  return `
    <div class="paper-card group bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer" data-id="${p.id}">
      <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-50 to-violet-50 text-accent flex items-center justify-center flex-none">📄</div>
      <div class="min-w-0 flex-1">
        <div class="font-semibold text-[14px] text-text truncate">${escapeHtml(p.title)}</div>
        <div class="text-[12px] text-muted mt-1 flex items-center gap-2 flex-wrap">
          ${statusPill(p.status)}
          ${p.category ? `<span class="inline-flex items-center text-[11px] px-2 py-[2px] rounded-full bg-slate-100 text-muted"><span class="opacity-60 mr-0.5">📁</span>${escapeHtml(p.category)}</span>` : `<span class="inline-flex items-center text-[11px] px-2 py-[2px] rounded-full bg-amber-50 text-amber-700">未归档</span>`}
          ${p.year ? `<span class="text-[11px] text-muted">${p.year}</span>` : ""}
          <code class="text-[10px] bg-slate-50 border border-slate-200 px-1.5 rounded">${escapeHtml(p.id)}</code>
        </div>
      </div>
      <div class="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        <button data-act="move" class="px-2.5 py-1 text-[12px] border border-slate-200 bg-white text-textSoft rounded-md hover:bg-slate-50" title="迁移到分类">📁</button>
        <button data-act="delete" class="px-2.5 py-1 text-[12px] border border-slate-200 bg-white text-textSoft rounded-md hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200" title="删除">🗑</button>
      </div>
      <button data-act="open" class="px-3 py-1.5 text-[13px] bg-accent text-white rounded-md font-medium hover:bg-indigo-700 transition">打开 →</button>
    </div>
  `;
}

function headerBar(title, subtitle, opts) {
  return `
    <div class="flex items-center gap-3 px-8 py-4 bg-white border-b border-slate-200">
      <div class="min-w-0 flex-1">
        <h1 class="text-[20px] font-bold text-text m-0 leading-tight">${escapeHtml(title)}</h1>
        ${subtitle ? `<div class="text-[13px] text-muted mt-0.5">${escapeHtml(subtitle)}</div>` : ""}
      </div>
      <label class="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 bg-white text-textSoft text-[13px] font-medium rounded-md cursor-pointer hover:bg-slate-50 hover:border-indigo-200 hover:text-accent transition">
        📎 添加文献
        <input type="file" id="file-in" accept="application/pdf" class="hidden" />
      </label>
      <button id="btn-rescan" class="px-3 py-1.5 text-[13px] border border-slate-200 bg-white text-textSoft font-medium rounded-md hover:bg-slate-50 transition">🔄 Rescan</button>
    </div>
  `;
}

export async function renderHome(root, { filter = "all" } = {}) {
  root.innerHTML = `<div class="p-10 text-muted">加载中…</div>`;
  const all = await api.papers();
  const papers = (filter === "unfiled") ? all.filter(p => !p.category) : all;

  const title = filter === "unfiled" ? "未归档" : "全部文献";
  const subtitle = filter === "unfiled"
    ? `${papers.length} 篇还没有分类。可以手动迁移，或让 Agent 帮你归档。`
    : `共 ${all.length} 篇，其中 ${all.filter(p => p.status === "preprocessed").length} 篇已预处理。`;

  root.innerHTML = `
    ${headerBar(title, subtitle)}
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-5xl mx-auto px-8 py-6 space-y-2.5">
        ${papers.length === 0
          ? `<div class="p-10 bg-white border-2 border-dashed border-slate-200 rounded-xl text-center text-muted">
               <div class="text-3xl mb-3">📭</div>
               <div class="text-sm">${filter === 'unfiled' ? '没有未归档的文献 🎉' : '还没有文献。点击上方"添加文献"上传 PDF。'}</div>
             </div>`
          : papers.map(card).join("")}
      </div>
    </div>
  `;

  // File upload
  const fi = root.querySelector("#file-in");
  fi.onchange = async () => {
    const f = fi.files?.[0];
    if (!f) return;
    const btn = fi.closest("label");
    const old = btn.textContent;
    btn.innerHTML = "⏳ 上传中…";
    try {
      const meta = await uploadPdf(f);
      btn.textContent = "✓ 已添加";
      setTimeout(() => window.paperReaderRefresh && window.paperReaderRefresh(), 400);
    } catch (e) {
      alert("上传失败: " + e.message);
      btn.innerHTML = old;
    }
    fi.value = "";
  };

  root.querySelector("#btn-rescan").onclick = async () => {
    const r = await api.rescan();
    alert(`新增 ${r.added.length} 篇，跳过 ${r.skipped.length} 篇。`);
    window.paperReaderRefresh && window.paperReaderRefresh();
  };

  root.querySelectorAll(".paper-card").forEach(c => {
    const id = c.dataset.id;
    c.onclick = () => { location.hash = `#/paper/${id}`; };
    c.querySelector("[data-act=open]").onclick = (e) => {
      e.stopPropagation();
      location.hash = `#/paper/${id}`;
    };
    c.querySelector("[data-act=move]").onclick = async (e) => {
      e.stopPropagation();
      const p = all.find(x => x.id === id);
      const choice = await pickCategory(p?.category);
      if (!choice || choice.action !== "pick") return;
      await api.movePaper(id, choice.path);
      window.paperReaderRefresh && window.paperReaderRefresh();
    };
    c.querySelector("[data-act=delete]").onclick = async (e) => {
      e.stopPropagation();
      const p = all.find(x => x.id === id);
      if (await confirm(`删除「${p?.title || id}」?`, "这会删除 data/papers 下该目录，包括所有标注、QA、翻译。原始 PDF 保留在 data/origin/。", "删除", true)) {
        await api.deletePaper(id);
        window.paperReaderRefresh && window.paperReaderRefresh();
      }
    };
  });
}
