# methods/api-reference.md

Canonical REST contract for PaperPilot. **This is the only source of truth Agents should consume** — do not read `server/` source. Base URL is `http://127.0.0.1:$(cat ./.port)/api`.

All JSON requests/responses. Error shape: `{"error": "...", "code": <int>, "detail": "..."}`.

## System

| Method | Path | Body | Response | Purpose |
|---|---|---|---|---|
| GET | `/health` | — | `{ok, version, port}` | Liveness |
| POST | `/system/rescan` | — | `{added:[id], skipped:[filename]}` | Import new PDFs from `data/origin/` |

## Papers

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/papers` | — | `[{id,title,status,category,year,created_at}]` | Supports `?category=<path>&status=<s>` filters |
| GET | `/papers/{id}` | — | full meta + `files` inventory | 404 if missing |
| POST | `/papers` | `{origin_filename}` | meta | Create from file in `data/origin/` |
| POST | `/papers/upload` | multipart/form-data `file=<pdf>` | meta | Upload a PDF directly (browser use) — saved to `data/origin/` + registered |
| PATCH | `/papers/{id}` | `{status?, title?}` | meta | Agent sets `status` to `preprocessed` only |
| DELETE | `/papers/{id}` | — | `{ok}` | Removes paper dir + categories entry |
| POST | `/papers/{id}/move` | `{category}` | meta | `category` may be `null` to uncategorize |
| POST | `/papers/{id}/rename` | `{title}` | meta (with possibly new `id`) | Renames paper_id, origin filename, and category memberships based on the title; **subsequent calls must use the returned id** |

### Summary / Detail (markdown)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/papers/{id}/summary` | — | returns `{markdown}` |
| PUT | `/papers/{id}/summary` | `{markdown, mode:"replace"\|"merge", section?}` | `merge` replaces the named section (e.g. `"## QA"`, `"## Annotation Digest"`) or appends if missing |
| GET | `/papers/{id}/detail` | same shape | |
| PUT | `/papers/{id}/detail` | same shape | |

**Important:** PUTs on markdown automatically revalidate existing annotation anchors. Annotations whose `quote` (optionally bracketed by `prefix`/`suffix`) no longer appears in the new text are flagged `broken=true`. The UI surfaces them in a sidebar — **do not** attempt fuzzy re-anchoring.

### Translation

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/papers/{id}/translation` | — | `{paragraphs:[...]}` |
| PUT | `/papers/{id}/translation` | `{paragraphs:[...]}` | Full replace |
| PATCH | `/papers/{id}/translation` | `{paragraphs:[...]}` | **Delta merge by `pid`** — prefer this for batched sub-agent writes |

Paragraph shape: `{pid, page, index_on_page, bbox:[x0,y0,x1,y1], text_en, text_zh, kind?}`.

### Binary

| Method | Path | Notes |
|---|---|---|
| GET | `/papers/{id}/pdf` | Streams `source.pdf` |
| GET | `/papers/{id}/images/{name}` | Figure bytes |

## Annotations

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/papers/{id}/annotations` | — | `?tier=1\|2\|3&broken=true\|false` |
| POST | `/papers/{id}/annotations` | `{type, tier, target, color?, comment_markdown?}` | returns saved annotation with `id` |
| PATCH | `/papers/{id}/annotations/{aid}` | partial | |
| DELETE | `/papers/{id}/annotations/{aid}` | — | |

`type` ∈ `highlight | underline | comment`. `target` shape depends on `tier`:
- tier 1/2: `{source:"summary.md"|"detail.md", quote, prefix, suffix, start?, end?}`
- tier 3: `{pid, quote, char_start, char_end}`

Hover popup in the UI renders `comment_markdown` when non-empty.

## QA

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/papers/{id}/qa` | — | list of QA |
| POST | `/papers/{id}/qa` | `{tier, selection, question?}` | returns `{id:"Q#N", ...}` |
| GET | `/papers/{id}/qa/{qid}` | — | single QA |
| PATCH | `/papers/{id}/qa/{qid}` | `{question?, answer_markdown?, sync?:bool}` | `sync:true` also rewrites the `<!-- qa:Q#id -->` block in `summary.md` |
| DELETE | `/papers/{id}/qa/{qid}` | — | Also strips block from `summary.md` |

`selection` uses the same shape as annotation `target`.

## Categories (folder tree)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/categories` | — | `{tree:{}, papers:{path:[ids]}}` |
| POST | `/categories` | `{path}` | Creates nested path (e.g. `"a/b/c"`) |
| DELETE | `/categories` | `{path}` | 409 if non-empty (including subtree) |
| GET | `/categories/{path:path}/papers` | — | `{papers:[id]}` — **includes descendants** |

## Folder homepage

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/folders/{path:path}/homepage` | — | `{markdown}` |
| PUT | `/folders/{path:path}/homepage` | `{markdown}` | Overwrites |

## Conventions

- All text is UTF-8.
- Timestamps are ISO-8601 UTC (`created_at`, `updated_at`).
- Paper ids are `<year>_<slug>` with numeric suffix on collision.
- The server binds only to `127.0.0.1`. No auth.
- Concurrency: per-file `fcntl.flock` protects JSON writes. Sequential Agent calls are always safe.
