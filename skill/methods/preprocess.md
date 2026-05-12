# methods/preprocess.md

**Purpose:** 预处理一篇 `status == "unprocessed"` 的论文，生成 summary.md、detail.md、translation.json 和图表。

> **只有用户明确要求时才运行**（如 "预处理这篇" / "解析这个文献"）。

## 前提

- `methods/bootstrap.md` 已执行（服务健康 + MINERU_TOKEN 已设）。
- 你有目标论文的 paper_id。如果没有，先 `GET /api/papers?status=unprocessed` 选择最新的。

## 快速流程

### Step 1 — 一键抽取 + 重命名 + 图表索引

```bash
python scripts/preprocess_paper.py <paper_id>
```

脚本自动完成：
1. 调用 MinerU API 解析 PDF（上传 → 轮询 → 下载 zip）
2. 从 full.md 推断论文标题
3. 调用 `POST /papers/{id}/rename` 重命名（id 可能变化）
4. 生成段落 JSON + 图片 + FIGURE_LIST

**脚本向 stdout 输出一个 JSON**，包含后续所有变量：

```json
{
  "old_id": "2403-14144v2",
  "paper_id": "understanding-the-ranking-loss-...",
  "title": "Understanding the Ranking Loss...",
  "port": 7856,
  "full_md_path": "/tmp/.../full.md",
  "extract_path": "/tmp/paperpilot_extract_....json",
  "figure_list_path": "/tmp/..._figure_list.txt",
  "figure_list_text": "FIG_1 (fig001.jpg) — page 7 ...\nFIG_2...",
  "paragraph_count": 172,
  "image_count": 8
}
```

**读取这个 JSON，后续所有步骤都从中取值，不再写临时代码。**

如果脚本失败（exit code ≠ 0），它也向 stdout 输出 JSON：`{"error": "...", "code": N}`。按错误码处理：
- 2 = MINERU_TOKEN 未设 → 引导用户配置
- 3 = 服务未启动 → `bash start.sh`

### Step 2 — 派发 3 个 sub-agent

从 JSON 中取变量，填充三个 prompt 模板并**在一条消息中同时派发三个** `Agent` 调用（`run_in_background: true`）：

| Sub-agent | 模板文件 | 关键输入变量 | 输出 |
|-----------|---------|-------------|------|
| A: summary | `methods/_prompt-summary.md` | `{TITLE}`, `{PAPER_ID}`, `{PORT}`, `{PROJECT_ROOT}`, `{FULL_MD_PATH}`, `{FIGURE_LIST}` | PUT /summary |
| B: detail | `methods/_prompt-detail.md` | 同上 | PUT /detail |
| C: translation | `methods/_prompt-translation.md` | `{PAPER_ID}`, `{PORT}`, `{EXTRACT_PATH}` | PATCH /translation |

**变量映射**（JSON 字段 → 模板占位符）：
- `paper_id` → `{PAPER_ID}`
- `title` → `{TITLE}`
- `port` → `{PORT}`
- 项目 CWD → `{PROJECT_ROOT}`
- `full_md_path` → `{FULL_MD_PATH}`
- `figure_list_text` → `{FIGURE_LIST}`
- `extract_path` → `{EXTRACT_PATH}`

### Step 3 — 标记完成

三个 agent 全部回报成功后：

```bash
PORT=<from JSON>
ID=<paper_id from JSON>
curl -sX PATCH "http://127.0.0.1:$PORT/api/papers/$ID" \
  -H 'Content-Type: application/json' -d '{"status":"preprocessed"}'
```

### Step 4 — 归档分类

运行 `methods/classify.md` 或 `methods/archive.md`。

## Token 优化说明

之前 Agent 每次处理论文需要写 ~80 行临时 Python/Bash（MinerU 调用 + 标题推断 + 重命名 + 复制文件 + 构建 FIGURE_LIST）。现在这些**全部由 `scripts/preprocess_paper.py` 固定完成**，Agent 只需：
1. 一行 `python scripts/preprocess_paper.py <id>`
2. 读 JSON 输出
3. 填模板派 agent
4. 一行 curl 标记完成

总计约 ~200 tokens 的 Bash，比之前省 ~90%。

## 失败处理

- **MinerU 超时/失败**：脚本会输出具体错误。常见原因：PDF 加密/损坏/超 200 页。
- **重命名冲突**：服务端自动加 `_2` 后缀，脚本返回的 `paper_id` 是最终值。
- **Sub-agent 部分失败**：只重新派发失败的那个，不要重新跑整个流程。
