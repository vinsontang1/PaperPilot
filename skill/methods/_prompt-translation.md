# _prompt-translation.md

Template for the translation sub-agent. Substitute `{PAPER_ID}`, `{PORT}`, `{EXTRACT_PATH}` and pass the result as the `prompt` field of an `Agent` tool call.

---

You are translating PDF paragraphs to Chinese for the PaperPilot web UI's tier-3 view (PDF on left, your translation on right).

**Paper id (use this for the API):** {PAPER_ID}
**Server port:** {PORT}
**Extracted paragraphs:** `{EXTRACT_PATH}` — JSON file `{paragraphs:[{pid, page, index_on_page, bbox, text_en, text_zh:"", kind}]}`.

## Mission

The user reads the right-side pane while looking at the PDF. The pane should be **smooth, faithful, useful Chinese** — NOT a literal word-for-word substitution. Garbled extraction artifacts must be filtered out so the reader is not annoyed.

## Filtering rules — drop these (do not include in your output)

For each input paragraph, decide whether to translate it or **drop it entirely**:

- **Page headers / running titles**: e.g. `WWW'26,April13–17,2026,...`, `ThinkRec:Thinking-basedRecommendation...`, `<author> et al.` — DROP.
- **Reference list entries**: `[<n>] <authors>. <year>. <title>. <venue>.` — DROP, including DOIs / arXiv ids / URLs. (Even when pdfplumber has glued multiple references together.)
- **Table-only fragments**: pure numeric salads with no surrounding prose — DROP. (Tables are visible on the PDF side; readers don't need a Chinese number list.)
- **Figure-label salads**: legend tokens, axis labels, scattered figure-internal text without context — DROP.
- **Code-only fragments / prompt-template salads** with no surrounding explanation — DROP. (Keep the prompt code in PDF view.)
- **Footnote URL footers** like `1 https://...` standalone — DROP.

If a paragraph **mixes** a header header (drop-worthy) with real prose (worth keeping), keep only the prose part in `text_zh`.

## Translation rules — apply to kept paragraphs

1. **保留学术名词的英文形式** when widely used: LoRA, AUC, METEOR, BCE, MoE, embedding, attention, transformer, fine-tuning, prompt, baseline, etc. Don't force a Chinese equivalent if the reader will not search for it in Chinese.
2. **保留公式与变量符号** (希腊字母, $\alpha, \beta$, etc.) verbatim. Translate the surrounding prose only.
3. **不要逐句翻译** — read the whole paragraph, then write a fluent Chinese version. Restore spaces that pdfplumber dropped (e.g. "thatshiftsLLM4Rec" → "将 LLM4Rec 推动").
4. **保留段落语义边界**: if the input paragraph rambles across topics (column-merge artifact), still keep it as one `text_zh` block (the right pane shows one section per pid).
5. **可读性 > 字面忠实**. The reader is a Chinese researcher, not a translation grader.
6. **Markdown 标题 (重要)**: When the paragraph IS a section heading in the paper (like "3 Method" / "3.1 Preliminary" / "Experiments"), emit a Markdown heading at the top of `text_zh`. The tier-3 translation pane renders Markdown, so these become real visual section markers:
   - Top-level section ("3 Method", "4 Experiments") → `## 3. 方法` style
   - Subsection ("3.1 Preliminary") → `### 3.1 预备知识`
   - Appendix headers ("A Ethical Considerations") → `## 附录 A. 伦理考量`
   Heuristic: `kind == "heading"` in the extraction JSON, OR short text (< 80 chars) starting with a digit/English section keyword (Method, Experiments, Related Work, Conclusion, Appendix, Abstract, Introduction, etc.). When uncertain, default to normal prose.
7. **公式**: preserve `$$...$$` / `$...$` verbatim.

## Output schema

For each paragraph you decided to keep, emit an object with all original fields plus a populated `text_zh`:

```json
{
  "pid": "p_3_2",
  "page": 3,
  "index_on_page": 2,
  "bbox": [...],
  "text_en": "<unchanged>",
  "text_zh": "<your Chinese translation>",
  "kind": "<unchanged>"
}
```

For dropped paragraphs, **simply omit them from the output**. The server side merges by `pid`, so the right pane will only show what you submit. (Existing entries with the same `pid` will be overwritten; pids you never submit remain at their previous state — for a fresh preprocess, the translation file starts empty so dropped pids stay absent. Good.)

## Submit — IN PID ORDER, in batches of ≤ 30

```bash
PORT={PORT}
ID={PAPER_ID}
# Construct /tmp/_trans_batch_<n>.json containing your translated subset.
curl -sX PATCH "http://127.0.0.1:$PORT/api/papers/$ID/translation" \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"paragraphs":json.load(open(sys.argv[1]))}))' /tmp/_trans_batch_1.json)"
```

**Crucial:** within each batch, paragraphs MUST be ordered by `pid` ascending (which equals reading order: page first, then index_on_page). Across batches, batch 1 must contain pids strictly before batch 2, etc. The right-pane reading order depends on this — if you randomize the order, the user sees garbage.

## Report back

After all batches are PATCHed, GET `/api/papers/$ID/translation` and verify:
- All kept pids are present with non-empty `text_zh`.
- No dropped pid is present (server preserves whatever was there before — for a fresh paper this starts empty).

Report back: number kept, number dropped (with brief categorization: headers / refs / tables / figures), final total in `translation.json`.
