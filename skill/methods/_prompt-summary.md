# _prompt-summary.md

Template for the summary sub-agent. Substitute `{TITLE}`, `{PAPER_ID}`, `{PORT}`, `{PROJECT_ROOT}`, `{FULL_MD_PATH}`, `{FIGURE_LIST}` and pass the result as the `prompt` field of an `Agent` tool call.

`{FIGURE_LIST}` should be a numbered list of figures the web UI has available, each line like:
```
FIG_1 (fig001.jpg) — page 1 — Figure 1: Overview of ThinkRec
FIG_2 (fig002.jpg) — page 3 — Figure 2: Training pipeline
FIG_3 (fig003.jpg) — page 4 — Table 1: Dataset statistics
...
```

---

You are writing a Chinese summary (≤ 1000 字) for an academic paper for the PaperPilot web UI.

**Paper title:** {TITLE}
**Paper id (use this for the API):** {PAPER_ID}
**Server port:** {PORT}
**Project root:** {PROJECT_ROOT}

**Source text:** read the MinerU-rendered markdown at `{FULL_MD_PATH}`. This is a clean, structured Markdown rendering of the paper (headings, paragraphs, tables, equations preserved in LaTeX).

**Available figures (pre-extracted, filtered, ordered):**
```
{FIGURE_LIST}
```

## Output structure (Chinese, GFM markdown, ≤ 1000 字)

1. **顶部 metadata 引用块** with title (English + Chinese gloss if helpful), 会议/年份, 作者机构 (合并相同机构, 用顿号分隔), GitHub / arXiv URL if mentioned.
2. **一句话概括** — 单段 50–80 字, 抓住贡献 + 创新点。
3. **研究动机** — 现有方法的不足 + 论文要解决什么。可在这里插入 `[[FIG_1|反例示意]]` 类占位符来引用图（见规则）。
4. **核心方法** — 3-5 个有序要点。
5. **实验与收益** — 一句话讲数据集 + 关键指标的提升幅度。
6. **贡献总结** — bullet 形式, 4-6 点。
7. **我的阅读线索** — 3 条。

## 图片 placeholder 规则（重要）

- **不要使用** `![](images/...)` 或 Markdown 图片语法。
- 使用占位符 `[[FIG_N]]` 或 `[[FIG_N|简短中文说明]]` 或 `[[FIG_N|说明|small|medium|large]]` 来引用图。Web 会把占位符替换成 `<figure>` 带 caption。
- `N` 就是上面 FIGURE_LIST 里的 FIG_N 序号。每张图最多引用一次。
- 摘要很短，通常只需引用 1 张关键图（比如 Figure 1 的整体概览）就够了，其它图留给 detail 用。

## Hard rules

- ≤ 1000 字 (Chinese), 含标点。超过就压缩。
- 学术名词保留英文 (LoRA, AUC, METEOR, embedding, transformer, MoE, ...) — 不要硬翻译。
- 表达流畅, 像科研同事的笔记。

## Submit

```bash
PORT={PORT}
ID={PAPER_ID}
# Write summary to /tmp/_summary_{PAPER_ID}.md, then:
curl -sX PUT "http://127.0.0.1:$PORT/api/papers/$ID/summary" \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"markdown":open(sys.argv[1]).read(),"mode":"replace"}))' /tmp/_summary_{PAPER_ID}.md)"
```

Verify the response is `{"ok":true}`. Report back with the final summary length (chars) and which figures you referenced.
