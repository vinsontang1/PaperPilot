---
name: paper_pilot
description: Read, annotate, translate, and discuss academic PDF papers through a local web UI. Trigger whenever the user mentions reading/preprocessing/translating a 论文 / 文献 / paper, or when they reference a Q#id or ask to "sync QA to paper" / "总结标注" / "整理文件夹下论文".
---

# paper_reader

A user-level skill that collaborates with a local FastAPI + static-web app (PaperPilot) to let the user read, annotate, and translate PDFs. The Agent drives it through a stable REST contract — **never edit files under `web/` or `server/`**.

> **项目结构说明**：skill 文档位于项目内 `skill/` 目录（通过符号链接被 Agent 发现）。整个项目可以直接 push 到 GitHub。

## When to use

Trigger this skill when the user:
- drops PDFs into the paperpilot workspace and asks you to "preprocess / 解析 / 总结 / 翻译" them;
- references a paper by title / category / paper id in this workspace;
- mentions a QA id like `Q#7` or asks to "sync QA to paper" / "把问答写进去";
- asks to "总结我的标注" / "summarize my comments";
- asks to "整理这个分类下所有论文的联系";
- asks to "create a new category" or "move paper X to Y".

## Workspace layout

The current working directory is the project. Key paths:

- `data/origin/` — users drop raw PDFs here. **Do not delete**.
- `data/papers/<paper_id>/` — per-paper files (`meta.json`, `summary.md`, `detail.md`, `translation.json`, `annotations.json`, `qa.json`, `images/`).
- `data/categories.json` — folder tree + paper membership.
- `data/folders/<path>/homepage.md` — cross-paper homepage.
- `./.port` — the port the server is listening on (default 7856; falls back 7857–7870).

## MinerU 配置（必须，预处理依赖它）

PDF 解析（段落抽取 + 图表抽取 + 公式 / 表格 OCR）由 [MinerU](https://mineru.net/) 在线服务承担。**用户首次使用前必须配好 MinerU API Token**，否则 `methods/preprocess.md` 无法运行。

如果用户尚未配置，按以下步骤引导：

1. 打开 https://mineru.net/ ，注册并登录（支持手机号 / GitHub）。
2. 进入 Token 管理页面：**https://mineru.net/apiManage/token** ，点击「复制」。
3. 把 Token 注入当前 shell 的环境变量：
   ```bash
   export MINERU_TOKEN='粘贴你复制的 token'
   ```
   建议同时写入 `~/.bashrc`：
   ```bash
   echo "export MINERU_TOKEN='你的token'" >> ~/.bashrc && source ~/.bashrc
   ```
4. **重启 PaperPilot 服务**，让子进程也能读到新 token：
   ```bash
   bash stop.sh && bash start.sh
   ```

配额：精准解析 API 默认 1000 页/天/账号，每个 PDF ≤ 200 页 ≤ 200 MB。日常论文阅读完全够用。

## Agent quickstart

1. Always start by running **`methods/bootstrap.md`** — it installs dependencies, starts the server, and scans `data/origin/`.
2. Read `PORT=$(cat ./.port)` → all API calls go to `http://127.0.0.1:$PORT/api/...`.
3. Dispatch to the appropriate sub-method:
   - `methods/preprocess.md` — preprocess a single paper (only on explicit user ask).
   - `methods/classify.md` — propose / confirm category for a paper.
   - `methods/answer-question.md` — read a `Q#id` selection and (only on explicit sync) write the answer back.
   - `methods/summarize-annotations.md` — digest user highlights + comments into `summary.md`.
   - `methods/folder-analysis.md` — write cross-paper narrative on a folder homepage.
4. The full REST contract lives in **`methods/api-reference.md`** — treat it as the single source of truth.

## Hard rules

- **NEVER edit files under `web/` or `server/`** — everything is driven through the REST API.
- **NEVER auto-preprocess** a paper. The user must ask. Preprocessing touches multiple long-running sub-tasks (extract → summarize → translate) and may need sub-agents.
- **NEVER sync a QA back into `summary.md`** unless the user explicitly says to (e.g. "sync QA to paper" / "把这个问答写进论文"). Answer freely in chat; only on explicit sync call `PATCH /papers/{id}/qa/{qid}` with `sync=true`.
- **NEVER change a paper's category without user confirmation.** Even when the user drags a paper in the UI, that path does not call you — the move is a simple `POST /papers/{id}/move` handled server-side.
- When rewriting `summary.md` or `detail.md`, expect the server to flag some old annotations as `broken=true`. Do not try to fuzzily re-anchor them — the UI surfaces them in a broken-anchors sidebar for the user to triage.
- For long translations, **always dispatch a single dedicated sub-agent** (not multiple parallel sub-agents) so paragraph reading order stays consistent. Submit batches in ascending `pid` order via `PATCH /papers/{id}/translation`.
- Detail (`detail.md`) **must not embed images** — figures live in the web sidebar and are auto-rendered from `data/papers/<id>/images/`. Refer to figures in prose only.
- After preprocessing succeeds, paper id and origin filename are renamed via `POST /papers/{old_id}/rename` to use the real paper title; remember to use the new id for subsequent calls.

## Discovery: listing & statuses

```
curl -s http://127.0.0.1:$(cat ./.port)/api/papers
curl -s http://127.0.0.1:$(cat ./.port)/api/papers/<id>
```

Paper `status` transitions:
- `unprocessed` → initial state for a newly rescanned PDF
- `preprocessed` → after `preprocess.md` has written summary/detail/translation
- `read` → user-only; set via the UI, never by the Agent

## Method index

- [`methods/bootstrap.md`](methods/bootstrap.md) — install deps, start server, rescan `data/origin/`
- [`methods/preprocess.md`](methods/preprocess.md) — extract → rename → 3-agent parallel summary/detail/translation → classify
- [`methods/_prompt-summary.md`](methods/_prompt-summary.md) — sub-agent prompt (≤ 1000 字 摘要 + `[[FIG_N]]` placeholders)
- [`methods/_prompt-detail.md`](methods/_prompt-detail.md) — sub-agent prompt (per-section 精解 + `[[FIG_N]]` placeholders)
- [`methods/_prompt-translation.md`](methods/_prompt-translation.md) — sub-agent prompt (filter junk, generate ## section headings, PATCH in pid order)
- [`methods/classify.md`](methods/classify.md) — propose category / handle create-or-move (first-time classification)
- [`methods/archive.md`](methods/archive.md) — intelligent archiving for "把 XXX 归档" / 批量归档未分类
- [`methods/answer-question.md`](methods/answer-question.md) — respond to `Q#id`; sync only on explicit user ask
- [`methods/summarize-annotations.md`](methods/summarize-annotations.md) — roll up user annotations into `summary.md`
- [`methods/folder-analysis.md`](methods/folder-analysis.md) — cross-paper citation article on folder homepage (uses `[[CITE:<paper_id>]]`)
- [`methods/api-reference.md`](methods/api-reference.md) — canonical REST contract
