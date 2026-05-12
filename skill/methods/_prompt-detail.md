# _prompt-detail.md

Template for the detail sub-agent. Substitute `{TITLE}`, `{PAPER_ID}`, `{PORT}`, `{PROJECT_ROOT}`, `{FULL_MD_PATH}`, `{FIGURE_LIST}` and pass the result as the `prompt` field of an `Agent` tool call.

`{FIGURE_LIST}` should be a numbered list of figures the web UI has available, each line like:
```
FIG_1 (fig001.jpg) — page 1 — Figure 1: Overview of ThinkRec
FIG_2 (fig002.jpg) — page 3 — Figure 2: Training pipeline
FIG_3 (fig003.jpg) — page 4 — Table 1: Dataset statistics
...
```

---

You are writing the **精细讲解** (`detail.md`) for an academic paper, for the PaperPilot web UI.

**Paper title:** {TITLE}
**Paper id:** {PAPER_ID}
**Server port:** {PORT}
**Project root:** {PROJECT_ROOT}

## Step 1 — Read the full paper

Primary source: `{FULL_MD_PATH}` — MinerU's clean markdown with headings, tables, LaTeX equations.

If you need to double-check:
```bash
python3 - <<'EOF'
import pdfplumber
with pdfplumber.open("{PROJECT_ROOT}/data/papers/{PAPER_ID}/source.pdf") as p:
    for i, pg in enumerate(p.pages, 1):
        print(f"== PAGE {i} ==")
        print(pg.extract_text() or "")
        print()
EOF
```

## Step 2 — Plan figure usage BEFORE writing

**Available figures (pre-extracted, filtered, ordered):**
```
{FIGURE_LIST}
```

Read this list. Then scan the paper and match each figure to the section it belongs to — you'll insert figure placeholders in those sections as you write the detail below. Every figure should ideally be referenced at most once, in the most relevant section.

## Step 3 — Write the detail

Structure: walk the user through **every numbered section** of the paper, in order. Suggested template (adapt to the paper's actual structure):

```
# {TITLE} 精细讲解

> 阅读建议: …

## 1. Abstract / 摘要 (中文译述)
## 2. Introduction / 引言
### 2.1 背景与动机
### 2.2 现有方法的局限
### 2.3 本文要解决的关键问题

[[FIG_1|动机反例：为什么需要推理]]   <!-- 在合适的章节插入占位符 -->

## 3. Related Work / 相关工作
## 4. Method / 方法

[[FIG_2|整体 pipeline]]

### 4.1 ...
### 4.2 ...
...
```

## 图片 placeholder 规则（必须遵守）

- **严禁使用** Markdown 原生图片语法 `![alt](images/xxx.jpg)`。
- 必须使用占位符格式：
  - `[[FIG_N]]` — 不带说明
  - `[[FIG_N|中文说明]]` — 带说明（推荐）
  - `[[FIG_N|说明|small]]` / `[[FIG_N|说明|medium]]` / `[[FIG_N|说明|large]]` — 带大小提示（默认 medium）
- `N` = 上面 FIGURE_LIST 中的 FIG_N 序号（1-based）。
- 每张图最多使用一次。
- 如果某张图不适合（例如全是公式截图），可以不引用。

## 其他硬规则

- 学术名词保留英文（LoRA, AUC, METEOR, MoE, ...）。
- 数学公式保留 LaTeX：inline `$...$`、block `$$...$$`。**不要**把希腊字母翻译成中文。
- 表格用 GFM 格式。
- 每小节 1-3 段，用自己的话重述，不堆砌 quote。
- 让读者读完后能向同事讲清这篇论文。

## Submit

```bash
PORT={PORT}
ID={PAPER_ID}
# Write to /tmp/_detail_{PAPER_ID}.md, then:
curl -sX PUT "http://127.0.0.1:$PORT/api/papers/$ID/detail" \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"markdown":open(sys.argv[1]).read(),"mode":"replace"}))' /tmp/_detail_{PAPER_ID}.md)"
```

Report back: total length, sections written, which figures you referenced.
