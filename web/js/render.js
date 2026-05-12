// Markdown + KaTeX + [[FIG_N]] placeholder renderer.
import { api } from "./api.js";

export function renderMarkdown(source) {
  const md = source || "_(空)_";
  const html = (window.marked && window.marked.parse)
    ? window.marked.parse(md)
    : escapeHtml(md);
  return html;
}

export function renderMath(container) {
  if (!window.renderMathInElement) return;
  try {
    window.renderMathInElement(container, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
      strict: "ignore",
    });
  } catch (e) {
    console.warn("KaTeX render failed:", e);
  }
}

// Resolve `![x](images/foo.png)` against the paper's /api/papers/{id}/images/ endpoint.
export function resolveImages(container, paperId) {
  container.querySelectorAll("img").forEach(img => {
    const src = img.getAttribute("src") || "";
    if (src.startsWith("images/")) {
      img.src = api.imageURL(paperId, src.replace(/^images\//, ""));
    }
  });
}

// Replace [[FIG_N]] / [[FIG N]] / [[FIG_3_caption]] placeholders with figure elements.
// `images` is the ordered list of filenames (fig001.jpg, fig002.jpg, …).
// `paperId` is used for the API URL.
// Supported placeholder forms:
//   [[FIG_1]]                 — fig001 without caption
//   [[FIG_1|一句说明]]         — with caption
//   [[FIG_1|一句说明|small]]   — size hint small|medium|large (default medium)
export function resolveFigurePlaceholders(container, paperId, images) {
  if (!container.innerHTML.includes("[[FIG")) return;
  const pattern = /\[\[FIG[\s_]*([0-9]+)(?:\|([^\]|]+))?(?:\|(small|medium|large))?\]\]/gi;
  // Replace inside text nodes to avoid breaking attributes.
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const toReplace = [];
  let n;
  while ((n = walker.nextNode())) {
    if (pattern.test(n.nodeValue)) {
      pattern.lastIndex = 0;
      toReplace.push(n);
    }
  }
  for (const node of toReplace) {
    const frag = document.createDocumentFragment();
    const text = node.nodeValue;
    let i = 0;
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      // Text before
      if (match.index > i) frag.appendChild(document.createTextNode(text.slice(i, match.index)));
      const num = parseInt(match[1], 10);
      const caption = (match[2] || "").trim();
      const size = (match[3] || "medium").toLowerCase();
      const filename = images[num - 1]; // fig001 = index 0
      if (filename) {
        const fig = document.createElement("figure");
        const widthCls = { small: "max-w-sm", medium: "max-w-xl", large: "max-w-3xl" }[size] || "max-w-xl";
        fig.className = `${widthCls} mx-auto my-5 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm`;
        fig.innerHTML = `
          <img src="${api.imageURL(paperId, filename)}" alt="FIG_${num}" class="w-full block bg-slate-50 cursor-zoom-in" data-fig="${filename}" />
          ${caption ? `<figcaption class="text-[12px] text-muted px-3 py-2 border-t border-slate-100 bg-slate-50">${escapeHtml(`图 ${num}. ${caption}`)}</figcaption>` : `<figcaption class="text-[12px] text-muted px-3 py-2 border-t border-slate-100 bg-slate-50">图 ${num}</figcaption>`}
        `;
        frag.appendChild(fig);
      } else {
        const span = document.createElement("span");
        span.className = "text-rose-600 font-mono text-[12px]";
        span.textContent = `[[FIG_${num} 未找到]]`;
        frag.appendChild(span);
      }
      i = regex.lastIndex;
    }
    if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
    node.parentNode.replaceChild(frag, node);
  }
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
