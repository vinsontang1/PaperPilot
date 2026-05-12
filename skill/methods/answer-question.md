# methods/answer-question.md

**Purpose:** Respond to a `Q#id` the user raised in the web UI. **Only sync the answer back to `summary.md` when the user explicitly says so.**

## Preconditions
- User mentioned a `Q#id` (e.g. "回答 Q#7", "关于 Q#12 …"). You may also need the paper id.

## Steps

Let `PORT=$(cat ./.port)`.

1. **Find the paper**. If the user didn't specify a paper, either:
   - parse it from conversation context; or
   - list recent papers with open questions:
     ```bash
     for id in $(curl -s "http://127.0.0.1:$PORT/api/papers" | jq -r '.[].id'); do
       q=$(curl -s "http://127.0.0.1:$PORT/api/papers/$id/qa" | jq '[.[] | select(.id == "'"$QID"'")]')
       [ "$(echo "$q" | jq length)" -gt 0 ] && echo "$id"
     done
     ```
   If still ambiguous, ask the user with `AskUserQuestion`.

2. **Fetch the question**:
   ```bash
   curl -s "http://127.0.0.1:$PORT/api/papers/$ID/qa/$QID"
   ```
   This returns `{id, tier, selection:{quote, prefix, suffix | pid, char_start, char_end}, question, answer_markdown, synced_to_summary}`.

3. **Read context** for a good answer:
   - Always fetch summary: `GET /papers/$ID/summary`.
   - If tier=3, fetch the surrounding translation paragraph via `GET /papers/$ID/translation` (find the matching `pid`).
   - If tier=2, fetch `GET /papers/$ID/detail`.

4. **Answer in chat**. Be thorough — reference the quoted selection, surrounding context, and related sections. **Do not** write back to any file yet.

5. **Sync only when asked**. When the user says "sync this to paper" / "把这个答案写进论文" / "同步 QA 到论文":
   ```bash
   curl -sX PATCH "http://127.0.0.1:$PORT/api/papers/$ID/qa/$QID" \
     -H 'Content-Type: application/json' \
     -d @- <<EOF
   {
     "question": "<optional one-line question, or null>",
     "answer_markdown": "<your full answer as markdown>",
     "sync": true
   }
   EOF
   ```
   The server writes/rewrites a block into `summary.md` under `## QA`, anchored by `<!-- qa:Q#id -->`. Re-syncing replaces in place (idempotent).

## APIs used
- `GET /api/papers/{id}/qa/{qid}`
- `GET /api/papers/{id}/summary` / `detail` / `translation` (context)
- `PATCH /api/papers/{id}/qa/{qid}` with `sync=true`

## Files written (indirectly)
- `data/papers/$ID/qa.json`, `data/papers/$ID/summary.md`

## Failure modes
- 404 on QA id → the user might have cleared it. Offer to create a new QA from a selection.
- Markdown anchor conflict: `summary.md` might already contain a stale `<!-- qa:Q#id -->` block — the server overwrites in place, so this is safe.
