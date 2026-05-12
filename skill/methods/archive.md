# methods/archive.md

**Purpose:** Intelligently archive one or more papers into categories based on user intent. Two modes:

1. **Batch unfiled** — user says "把未归档的归档" / "archive all unfiled papers".
2. **Single target** — user says "把 XXX 归档" / "archive XXX" (path given or to infer).

Both modes ultimately call `POST /api/papers/{id}/move`, but Agent reads the paper's `summary.md` first to propose a category.

## Preconditions
- Server is healthy (see `bootstrap.md`).
- Target paper(s) exist.

## Steps

Let `PORT=$(cat ./.port)`.

### A. Determine scope

- If user specified a single paper title/id and **also** a target path (e.g. "把 ThinkRec 归档到 recommendation/llm4rec"): skip to step C with one item and no proposal needed.
- If user specified a single paper title/id WITHOUT path: one item, generate proposal.
- If user said "把未归档的归档" / batch: `curl -s http://127.0.0.1:$PORT/api/papers | jq '[.[] | select(.category == null) | .id]'` to get the unfiled list. Confirm scale with user before proceeding (don't silently archive 50 papers).

### B. Propose categories (when user didn't specify path)

For each paper to archive:
1. `curl -s http://127.0.0.1:$PORT/api/papers/$ID/summary` → read summary.md.
2. `curl -s http://127.0.0.1:$PORT/api/categories` → read existing tree.
3. Decide the best-fitting category path. Prefer **reusing an existing leaf** over creating a new branch. Create a new category only when no existing leaf matches the paper's topic clearly.
4. Ask the user via `AskUserQuestion` with 2-3 options:
   - `确认` → proceed with the proposed path
   - `放入已有分类` → user picks a different existing path
   - `新建分类` → user gives a new path
   - `跳过` → skip this paper (for batch mode)

For batch mode, it's OK to propose the same category for similar papers; ask once per unique proposed path if you want to save user clicks.

### C. Execute

For each (paper_id, category) decided:

```bash
# Create category if new (safe to call repeatedly; server handles existing)
curl -sX POST "http://127.0.0.1:$PORT/api/categories" \
  -H 'Content-Type: application/json' -d "{\"path\":\"$CAT\"}"

# Move
curl -sX POST "http://127.0.0.1:$PORT/api/papers/$ID/move" \
  -H 'Content-Type: application/json' -d "{\"category\":\"$CAT\"}"
```

Report a summary to the user: how many moved, category changes, any skipped.

## APIs used
- `GET /api/papers?category=null` (via filter)
- `GET /api/papers/{id}/summary`
- `GET /api/categories`
- `POST /api/categories`
- `POST /api/papers/{id}/move`

## Failure modes
- User's specified category doesn't exist → create it transparently (no need to ask).
- User's specified paper title is ambiguous → ask via `AskUserQuestion` with top candidates.
- Batch of 20+ papers → process in chunks of 5, pause to let user object.
