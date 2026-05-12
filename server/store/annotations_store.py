"""Annotations storage + broken-anchor detection on markdown rewrites."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from .paths import paper_dir, read_json, write_json_atomic


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _path(paper_id: str):
    return paper_dir(paper_id) / "annotations.json"


def list_annotations(paper_id: str, tier: Optional[int] = None, broken: Optional[bool] = None) -> list[dict]:
    data = read_json(_path(paper_id), default=[])
    out = data
    if tier is not None:
        out = [a for a in out if a.get("tier") == tier]
    if broken is not None:
        out = [a for a in out if bool(a.get("broken")) == broken]
    return out


def create_annotation(paper_id: str, ann: dict) -> dict:
    data = read_json(_path(paper_id), default=[])
    if not ann.get("id"):
        ann["id"] = f"a_{uuid.uuid4().hex[:10]}"
    ann.setdefault("broken", False)
    ann.setdefault("created_at", _now())
    ann["updated_at"] = _now()
    data.append(ann)
    write_json_atomic(_path(paper_id), data)
    return ann


def update_annotation(paper_id: str, aid: str, patch: dict) -> Optional[dict]:
    data = read_json(_path(paper_id), default=[])
    for a in data:
        if a.get("id") == aid:
            a.update({k: v for k, v in patch.items() if k != "id"})
            a["updated_at"] = _now()
            write_json_atomic(_path(paper_id), data)
            return a
    return None


def delete_annotation(paper_id: str, aid: str) -> bool:
    data = read_json(_path(paper_id), default=[])
    new = [a for a in data if a.get("id") != aid]
    if len(new) == len(data):
        return False
    write_json_atomic(_path(paper_id), new)
    return True


def revalidate_markdown_anchors(paper_id: str, source: str, new_text: str) -> int:
    """Mark markdown-tier annotations whose quote is no longer present as broken.
    Returns the number of newly broken annotations.
    `source` is the filename ("summary.md" or "detail.md")."""
    data = read_json(_path(paper_id), default=[])
    changed = 0
    for a in data:
        tgt = a.get("target") or {}
        if tgt.get("source") != source:
            continue
        if a.get("tier") not in (1, 2):
            continue
        was_broken = bool(a.get("broken"))
        quote = tgt.get("quote") or ""
        prefix = tgt.get("prefix") or ""
        suffix = tgt.get("suffix") or ""
        # Anchor ok if prefix+quote+suffix exists; fall back to quote alone
        found = False
        if quote:
            if prefix or suffix:
                found = (prefix + quote + suffix) in new_text
            if not found:
                found = quote in new_text
        now_broken = not found
        if now_broken != was_broken:
            a["broken"] = now_broken
            a["updated_at"] = _now()
            changed += 1
    if changed:
        write_json_atomic(_path(paper_id), data)
    return changed
