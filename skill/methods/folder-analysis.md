# methods/folder-analysis.md

**Purpose:** Write a cross-paper **citation article** on a folder's homepage — a narrative that weaves together what the papers say, with each citation rendered as an inline `[[CITE:<paper_id>]]` placeholder the web UI turns into a link back to that paper.

Only on explicit user ask.

## Preconditions
- The folder exists (`GET /api/categories` returns it in the tree).
- The folder contains ≥ 2 papers (otherwise nothing to correlate; tell the user).

## Steps

Let `PORT=$(cat ./.port)`, `CAT=<category_path>` (slash-separated, e.g. `recommendation/llm4rec`).

1. **List papers under the folder** (includes descendants):
   ```bash
   curl -s "http://127.0.0.1:$PORT/api/categories/$CAT/papers"
   # → {"papers":[id1, id2, ...]}
   ```

2. **Gather context** for each paper id (parallelize via sub-agent if many):
   - `GET /api/papers/$id` (title, year)
   - `GET /api/papers/$id/summary`
   - `GET /api/papers/$id/qa`
   - `GET /api/papers/$id/annotations?broken=false`

   For > 10 papers or > 30k tokens total, dispatch a 1M-context sub-agent.

3. **Compose a citation-style Chinese article.** Guidelines:
   - Start with a one-paragraph framing of what this category contains and why it matters.
   - Group papers by sub-theme (e.g. 问题表述 / 方法范式 / 评测 / 工程落地), 用 markdown `##` 二级标题分块。
   - Inside each sub-theme, write flowing prose that references papers inline using the placeholder format `[[CITE:<paper_id>]]`. Example:
     > 在"LLM4Rec 从 System 1 到 System 2 的方法论"这一线索上，[[CITE:thinkrec-thinking-based-recommendation-via-llm]] 通过合成推理数据激活 LLM 的思考能力，并用 LoRA 专家融合缓解用户行为异质问题。类似方向上 …
   - Each paper should be cited at least once, ideally multiple times across themes.
   - **Do NOT** use Markdown `![](...)` images. Do NOT use URL links — only the citation placeholder.
   - 结尾给 3-5 条 "值得深入的方向 / 未解决问题"。

4. **Write folder homepage:**
   ```bash
   curl -sX PUT "http://127.0.0.1:$PORT/api/folders/$CAT/homepage" \
     -H 'Content-Type: application/json' \
     -d @- <<EOF
   {"markdown": "<citation article>"}
   EOF
   ```

5. **Report** to user: themes identified, number of papers cited, URL
   `http://127.0.0.1:$PORT/#/folder/$CAT` they can open.

## Placeholder format contract

The web renders `[[CITE:<paper_id>]]` as a small inline link chip that navigates to the paper. Paper id is exactly what appears in `GET /papers` (slug form, e.g. `thinkrec-thinking-based-recommendation-via-llm`).

## APIs used
- `GET /api/categories/{path}/papers`
- `GET /api/papers/{id}` / `summary` / `qa` / `annotations`
- `PUT /api/folders/{path}/homepage`

## Files written
- `data/folders/$CAT/homepage.md`

## Failure modes
- Empty folder → do nothing; report.
- Unknown paper_id in your output → placeholder becomes a broken link. Double-check each cite against the papers list you fetched in step 1.
