"""Per-paper metadata, summary, detail, translation storage."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .paths import (
    PAPERS_DIR,
    ORIGIN_DIR,
    paper_dir,
    read_json,
    read_text,
    slugify,
    unique_paper_id,
    write_json_atomic,
    write_text_atomic,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


_year_re = re.compile(r"(19|20)\d{2}")


def _derive_year_from_name(name: str) -> Optional[int]:
    m = _year_re.search(name)
    return int(m.group(0)) if m else None


def list_paper_ids() -> list[str]:
    if not PAPERS_DIR.exists():
        return []
    return sorted(p.name for p in PAPERS_DIR.iterdir() if p.is_dir())


def load_meta(paper_id: str) -> Optional[dict]:
    return read_json(paper_dir(paper_id) / "meta.json", default=None)


def save_meta(paper_id: str, meta: dict) -> None:
    meta["updated_at"] = _now()
    write_json_atomic(paper_dir(paper_id) / "meta.json", meta)


def list_papers_summary() -> list[dict]:
    out = []
    for pid in list_paper_ids():
        m = load_meta(pid)
        if m is None:
            continue
        out.append({
            "id": m.get("id", pid),
            "title": m.get("title", pid),
            "status": m.get("status", "unprocessed"),
            "category": m.get("category"),
            "year": m.get("year"),
            "created_at": m.get("created_at"),
        })
    return out


def create_paper_from_origin(origin_filename: str) -> dict:
    """Create a paper directory from a file in data/origin/. Returns meta."""
    src = ORIGIN_DIR / origin_filename
    if not src.exists():
        raise FileNotFoundError(f"origin file not found: {origin_filename}")

    title = Path(origin_filename).stem
    year = _derive_year_from_name(origin_filename)
    slug = slugify(title)
    base = f"{year}_{slug}" if year else slug
    pid = unique_paper_id(base)

    pdir = paper_dir(pid)
    pdir.mkdir(parents=True, exist_ok=True)
    (pdir / "images").mkdir(exist_ok=True)
    # Copy PDF into paper dir
    dst = pdir / "source.pdf"
    dst.write_bytes(src.read_bytes())

    meta = {
        "id": pid,
        "title": title,
        "origin_filename": origin_filename,
        "status": "unprocessed",
        "category": None,
        "authors": [],
        "year": year,
        "created_at": _now(),
        "updated_at": _now(),
        "pdf_path": "source.pdf",
        "paragraph_count": 0,
    }
    save_meta(pid, meta)

    # Seed empty auxiliary files
    write_text_atomic(pdir / "summary.md", "")
    write_text_atomic(pdir / "detail.md", "")
    write_json_atomic(pdir / "translation.json", {"paragraphs": []})
    write_json_atomic(pdir / "annotations.json", [])
    write_json_atomic(pdir / "qa.json", [])
    return meta


def rescan_origin() -> dict:
    """Find new PDFs in data/origin/ and create paper entries for them."""
    added: list[str] = []
    skipped: list[str] = []
    # Build a set of origin_filename values already registered
    known = {(load_meta(pid) or {}).get("origin_filename") for pid in list_paper_ids()}
    for f in sorted(ORIGIN_DIR.glob("*.pdf")):
        if f.name in known:
            skipped.append(f.name)
            continue
        try:
            m = create_paper_from_origin(f.name)
            added.append(m["id"])
        except Exception:
            skipped.append(f.name)
    return {"added": added, "skipped": skipped}


def get_file_inventory(paper_id: str) -> dict:
    d = paper_dir(paper_id)
    return {
        "has_pdf": (d / "source.pdf").exists(),
        "has_summary": bool(read_text(d / "summary.md").strip()),
        "has_detail": bool(read_text(d / "detail.md").strip()),
        "has_translation": bool(
            (read_json(d / "translation.json", default={"paragraphs": []}) or {}).get("paragraphs")
        ),
        "images": sorted(p.name for p in (d / "images").glob("*")) if (d / "images").exists() else [],
    }


def read_summary(paper_id: str) -> str:
    return read_text(paper_dir(paper_id) / "summary.md")


def write_summary(paper_id: str, markdown: str) -> None:
    write_text_atomic(paper_dir(paper_id) / "summary.md", markdown)


def read_detail(paper_id: str) -> str:
    return read_text(paper_dir(paper_id) / "detail.md")


def write_detail(paper_id: str, markdown: str) -> None:
    write_text_atomic(paper_dir(paper_id) / "detail.md", markdown)


def read_translation(paper_id: str) -> dict:
    return read_json(paper_dir(paper_id) / "translation.json", default={"paragraphs": []})


def write_translation(paper_id: str, data: dict) -> None:
    if "paragraphs" not in data:
        data = {"paragraphs": data.get("paragraphs", [])}
    write_json_atomic(paper_dir(paper_id) / "translation.json", data)


def patch_translation(paper_id: str, paragraphs_delta: list[dict]) -> dict:
    """Merge paragraphs into translation.json by pid."""
    cur = read_translation(paper_id)
    index = {p.get("pid"): i for i, p in enumerate(cur["paragraphs"]) if p.get("pid")}
    for p in paragraphs_delta:
        pid = p.get("pid")
        if not pid:
            continue
        if pid in index:
            cur["paragraphs"][index[pid]] = p
        else:
            index[pid] = len(cur["paragraphs"])
            cur["paragraphs"].append(p)
    write_translation(paper_id, cur)
    return cur


def rename_paper(old_id: str, new_title: str) -> dict:
    """Rename paper_id (directory + meta.id) and the origin PDF based on a new title.

    - new paper_id = year_slug(title) (with numeric suffix on collision)
    - origin PDF renamed to <year>_<slug>.pdf (or <slug>.pdf if no year)
    - meta.title is updated to the human title; meta.origin_filename to the new file name
    - categories.json membership entries are updated
    """
    from . import categories_store  # local import to avoid cycle

    meta = load_meta(old_id)
    if meta is None:
        raise FileNotFoundError(f"paper not found: {old_id}")

    old_dir = paper_dir(old_id)
    if not old_dir.exists():
        raise FileNotFoundError(f"paper dir missing: {old_dir}")

    title = (new_title or "").strip()
    if not title:
        raise ValueError("new_title is required")

    year = meta.get("year") or _derive_year_from_name(title) or _derive_year_from_name(meta.get("origin_filename", ""))
    slug = slugify(title)
    base = f"{year}_{slug}" if year else slug

    if base == old_id:
        # Just refresh title/origin filename (keep id stable) — see below.
        new_id = old_id
    else:
        new_id = unique_paper_id(base)
        new_dir = paper_dir(new_id)
        old_dir.rename(new_dir)

    new_dir = paper_dir(new_id)

    # Rename the origin PDF file to match (best effort; do not fail if missing).
    old_origin = ORIGIN_DIR / (meta.get("origin_filename") or "")
    new_origin_name = f"{base}.pdf"
    if old_origin.exists() and old_origin.is_file():
        target = ORIGIN_DIR / new_origin_name
        # Avoid clobber: append suffix if needed.
        i = 2
        while target.exists() and target != old_origin:
            target = ORIGIN_DIR / f"{base}_{i}.pdf"
            i += 1
        if target != old_origin:
            old_origin.rename(target)
        new_origin_name = target.name

    # Patch meta
    meta["id"] = new_id
    meta["title"] = title
    meta["origin_filename"] = new_origin_name
    save_meta(new_id, meta)

    # Update category membership
    if new_id != old_id:
        try:
            categories_store.replace_paper_id(old_id, new_id)
        except Exception:
            pass

    return meta
