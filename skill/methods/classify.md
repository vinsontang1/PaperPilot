# methods/classify.md

**Purpose:** Propose a category (folder path) for a paper, confirm with the user, then call `POST /papers/{id}/move`. Create a new category only if the user approves.

## Preconditions
- Paper exists (has meta + summary). Category tree is readable via `GET /api/categories`.

## Steps

Let `PORT=$(cat ./.port)`, `ID=<paper_id>`.

1. **Fetch existing tree**:
   ```bash
   curl -s "http://127.0.0.1:$PORT/api/categories"
   ```
   Shape: `{"tree":{"nlp":{"transformers":{}},...}, "papers":{...}}`.

2. **Read the paper's summary** (for topical cues):
   ```bash
   curl -s "http://127.0.0.1:$PORT/api/papers/$ID/summary"
   ```

3. **Propose a category** — pick the single most-fitting existing node, or propose a new path (use "/" to nest, e.g. `vision/diffusion`).

4. **Ask the user** with `AskUserQuestion`:
   - If a matching existing category was found, ask: "建议放入 `<existing_path>`，确认吗？" with options: `确认` / `放入其他分类` / `新建分类`.
   - If no match, ask: "没有合适的分类，建议新建 `<proposed_path>`，创建吗？" with options: `创建并放入` / `放入现有分类` / `暂不分类`.

5. **Apply the user's choice**:
   - Create (if new):
     ```bash
     curl -sX POST "http://127.0.0.1:$PORT/api/categories" \
       -H 'Content-Type: application/json' -d "{\"path\":\"$CAT\"}"
     ```
   - Move:
     ```bash
     curl -sX POST "http://127.0.0.1:$PORT/api/papers/$ID/move" \
       -H 'Content-Type: application/json' -d "{\"category\":\"$CAT\"}"
     ```
   - If user picks "暂不分类", call `/move` with `"category": null`.

## APIs used
- `GET /api/categories`
- `POST /api/categories`
- `POST /api/papers/{id}/move`

## Files written (indirectly via server)
- `data/categories.json`, `data/papers/$ID/meta.json`

## Failure modes
- A category delete can fail with 409 if it still has papers — server is strict. Tell the user to move papers out first.
- Do **not** auto-move on "move" failures; surface the error.
