"""QA storage + rewrite of QA blocks inside summary.md."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

from .paths import paper_dir, read_json, write_json_atomic
from . import papers_store


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _path(paper_id: str):
    return paper_dir(paper_id) / "qa.json"


def list_qa(paper_id: str) -> list[dict]:
    return read_json(_path(paper_id), default=[])


def get_qa(paper_id: str, qid: str) -> Optional[dict]:
    for q in list_qa(paper_id):
        if q.get("id") == qid:
            return q
    return None


def _next_qid(existing: list[dict]) -> str:
    nums = []
    for q in existing:
        m = re.match(r"Q#(\d+)", q.get("id", ""))
        if m:
            nums.append(int(m.group(1)))
    n = (max(nums) + 1) if nums else 1
    return f"Q#{n}"


def create_qa(paper_id: str, payload: dict) -> dict:
    data = list_qa(paper_id)
    qa = {
        "id": _next_qid(data),
        "tier": payload.get("tier", 1),
        "selection": payload.get("selection") or {},
        "question": payload.get("question"),
        "answer_markdown": None,
        "synced_to_summary": False,
        "created_at": _now(),
    }
    data.append(qa)
    write_json_atomic(_path(paper_id), data)
    return qa


def update_qa(paper_id: str, qid: str, patch: dict) -> Optional[dict]:
    data = list_qa(paper_id)
    found = None
    for q in data:
        if q.get("id") == qid:
            for k, v in patch.items():
                if k in ("id", "created_at"):
                    continue
                if k == "sync":
                    continue
                q[k] = v
            found = q
            break
    if not found:
        return None

    # Handle sync:true → rewrite summary.md block
    if patch.get("sync"):
        _sync_to_summary(paper_id, found)
        found["synced_to_summary"] = True

    write_json_atomic(_path(paper_id), data)
    return found


def delete_qa(paper_id: str, qid: str) -> bool:
    data = list_qa(paper_id)
    new = [q for q in data if q.get("id") != qid]
    if len(new) == len(data):
        return False
    write_json_atomic(_path(paper_id), new)
    # Also strip the block from summary.md if present
    summary = papers_store.read_summary(paper_id)
    new_sum = _replace_block(summary, qid, None)
    if new_sum != summary:
        papers_store.write_summary(paper_id, new_sum)
    return True


# --- Summary.md QA block management ---------------------------------------

_BLOCK_RE_TMPL = (
    r"(?s)<!--\s*qa:{qid}\s*-->.*?<!--\s*/qa:{qid}\s*-->"
)
_QA_SECTION_HEADING = "## QA"


def _make_block(qa: dict) -> str:
    qid = qa["id"]
    q_line = (qa.get("question") or "").strip().splitlines()
    q_head = q_line[0] if q_line else ""
    quote = ""
    sel = qa.get("selection") or {}
    if sel.get("quote"):
        quote = f"> {sel['quote']}\n\n"
    body = (qa.get("answer_markdown") or "").rstrip() + "\n"
    return (
        f"<!-- qa:{qid} -->\n"
        f"### {qid}{' — ' + q_head if q_head else ''}\n\n"
        f"{quote}"
        f"{body}"
        f"<!-- /qa:{qid} -->"
    )


def _replace_block(summary: str, qid: str, new_block: Optional[str]) -> str:
    pattern = _BLOCK_RE_TMPL.format(qid=re.escape(qid))
    if re.search(pattern, summary):
        if new_block is None:
            out = re.sub(pattern + r"\n?", "", summary)
        else:
            out = re.sub(pattern, new_block, summary)
        return out
    if new_block is None:
        return summary
    # Append; ensure ## QA section exists
    if _QA_SECTION_HEADING not in summary:
        if summary and not summary.endswith("\n"):
            summary += "\n"
        summary += f"\n{_QA_SECTION_HEADING}\n\n"
    if not summary.endswith("\n"):
        summary += "\n"
    return summary + new_block + "\n"


def _sync_to_summary(paper_id: str, qa: dict) -> None:
    summary = papers_store.read_summary(paper_id)
    block = _make_block(qa)
    new_summary = _replace_block(summary, qa["id"], block)
    if new_summary != summary:
        papers_store.write_summary(paper_id, new_summary)
