# methods/summarize-annotations.md

**Purpose:** Roll up the user's highlights, underlines, and comments on a paper into a coherent section inside `summary.md`. Only on explicit user ask (e.g. "总结我的标注", "summarize my comments on this paper").

## Preconditions
- Paper has at least one non-broken annotation (`broken=false`).

## Steps

Let `PORT=$(cat ./.port)`, `ID=<paper_id>`.

1. **Fetch active annotations** (exclude broken):
   ```bash
   curl -s "http://127.0.0.1:$PORT/api/papers/$ID/annotations?broken=false"
   ```
   Each has `{type, tier, target:{quote, ...}, color, comment_markdown, created_at}`.

2. **Group + digest**:
   - Group by tier (1: summary, 2: detail, 3: pdf).
   - Within each tier, cluster by theme using the `quote` text + `comment_markdown`.
   - Write a short prose digest: "用户在这些地方重点关注 … ; 评论围绕 … 展开; 存在 N 条疑问 …"
   - List representative quotes as blockquotes.

3. **Write back** to `summary.md` under the `## Annotation Digest` section (idempotent merge):
   ```bash
   curl -sX PUT "http://127.0.0.1:$PORT/api/papers/$ID/summary" \
     -H 'Content-Type: application/json' \
     -d @- <<EOF
   {
     "markdown": "<prose digest as markdown>",
     "mode": "merge",
     "section": "## Annotation Digest"
   }
   EOF
   ```
   The server replaces the named section (if it exists) or appends it.

4. **Report** to the user in chat: how many annotations summarized, how many themes, any broken anchors that should be triaged in the UI.

## APIs used
- `GET /api/papers/{id}/annotations?broken=false`
- `PUT /api/papers/{id}/summary` with `mode=merge` + `section="## Annotation Digest"`

## Files written
- `data/papers/$ID/summary.md` (section replaced in place)

## Failure modes
- Zero non-broken annotations → do NOT write anything; just tell the user.
- If the user wants to include broken anchors too, first surface them and confirm.
