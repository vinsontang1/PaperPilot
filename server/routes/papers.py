"""Paper routes: CRUD, move, summary/detail/translation, PDF & images."""
from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse

from ..models import (
    AnnotationIn,
    MarkdownOut,
    MarkdownPutIn,
    OkOut,
    PaperCreateIn,
    PaperMoveIn,
    PaperPatchIn,
    PaperSummary,
    TranslationOut,
    TranslationPatchIn,
)
from ..store import annotations_store, categories_store, papers_store
from ..store.paths import ORIGIN_DIR, paper_dir

router = APIRouter(prefix="/papers", tags=["papers"])


@router.get("", response_model=list[PaperSummary])
def list_papers(category: str | None = None, status: str | None = None):
    items = papers_store.list_papers_summary()
    if category:
        allowed = set(categories_store.papers_in_category(category))
        items = [p for p in items if p["id"] in allowed]
    if status:
        items = [p for p in items if p["status"] == status]
    return items


@router.post("")
def create_paper(body: PaperCreateIn):
    try:
        meta = papers_store.create_paper_from_origin(body.origin_filename)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return meta


@router.post("/upload")
async def upload_paper(file: UploadFile = File(...)):
    """Accept a multipart PDF upload. Saves to data/origin/<safe-filename>.pdf,
    then creates a paper entry via create_paper_from_origin. Returns the new meta."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="no filename")
    # Sanitize: only keep basename, force .pdf extension.
    safe_name = Path(file.filename).name
    if not safe_name.lower().endswith(".pdf"):
        safe_name = safe_name + ".pdf"
    dest = ORIGIN_DIR / safe_name
    # If same name exists, append numeric suffix.
    i = 2
    while dest.exists():
        stem = Path(safe_name).stem
        dest = ORIGIN_DIR / f"{stem}_{i}.pdf"
        i += 1
    # Stream to disk.
    with open(dest, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
    try:
        meta = papers_store.create_paper_from_origin(dest.name)
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return meta


@router.get("/{paper_id}")
def get_paper(paper_id: str):
    meta = papers_store.load_meta(paper_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="paper not found")
    meta["files"] = papers_store.get_file_inventory(paper_id)
    return meta


@router.patch("/{paper_id}")
def patch_paper(paper_id: str, body: PaperPatchIn):
    meta = papers_store.load_meta(paper_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="paper not found")
    if body.status is not None:
        meta["status"] = body.status
    if body.title is not None:
        meta["title"] = body.title
    papers_store.save_meta(paper_id, meta)
    return meta


@router.delete("/{paper_id}", response_model=OkOut)
def delete_paper(paper_id: str):
    d = paper_dir(paper_id)
    if not d.exists():
        raise HTTPException(status_code=404, detail="paper not found")
    # Remove from categories
    categories_store.move_paper(paper_id, None)
    shutil.rmtree(d)
    return OkOut()


@router.post("/{paper_id}/move")
def move_paper(paper_id: str, body: PaperMoveIn):
    meta = papers_store.load_meta(paper_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="paper not found")
    categories_store.move_paper(paper_id, body.category)
    meta["category"] = body.category
    papers_store.save_meta(paper_id, meta)
    return meta


class _RenameIn(__import__("pydantic").BaseModel):
    title: str


@router.post("/{paper_id}/rename")
def rename_paper(paper_id: str, body: _RenameIn):
    """Rename paper_id + origin PDF based on a new human title.

    Returns the meta with possibly updated `id`. Callers MUST use the new id
    for subsequent calls.
    """
    if papers_store.load_meta(paper_id) is None:
        raise HTTPException(status_code=404, detail="paper not found")
    try:
        meta = papers_store.rename_paper(paper_id, body.title)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return meta


# --- summary / detail ------------------------------------------------------

def _merge_section(existing: str, section: str | None, new_markdown: str) -> str:
    if not section:
        # Append
        sep = "" if existing.endswith("\n") or not existing else "\n"
        return existing + sep + new_markdown.rstrip() + "\n"
    # Replace the block starting at the section heading until next heading of same/upper level
    lines = existing.splitlines(keepends=True)
    import re
    head_re = re.compile(r"^(#{1,6})\s+.*$")
    target = section.strip()
    target_level = len(target) - len(target.lstrip("#"))
    start = None
    end = len(lines)
    for i, line in enumerate(lines):
        if line.rstrip("\n").strip() == target:
            start = i
            continue
        if start is not None:
            m = head_re.match(line)
            if m and len(m.group(1)) <= target_level:
                end = i
                break
    if start is None:
        # Append with heading
        sep = "" if existing.endswith("\n") or not existing else "\n"
        return existing + sep + f"{target}\n\n" + new_markdown.rstrip() + "\n"
    new_lines = lines[:start] + [target + "\n\n", new_markdown.rstrip() + "\n"] + lines[end:]
    return "".join(new_lines)


@router.get("/{paper_id}/summary", response_model=MarkdownOut)
def get_summary(paper_id: str):
    if papers_store.load_meta(paper_id) is None:
        raise HTTPException(status_code=404, detail="paper not found")
    return MarkdownOut(markdown=papers_store.read_summary(paper_id))


@router.put("/{paper_id}/summary", response_model=OkOut)
def put_summary(paper_id: str, body: MarkdownPutIn):
    if papers_store.load_meta(paper_id) is None:
        raise HTTPException(status_code=404, detail="paper not found")
    if body.mode == "merge":
        existing = papers_store.read_summary(paper_id)
        new_text = _merge_section(existing, body.section, body.markdown)
    else:
        new_text = body.markdown
    papers_store.write_summary(paper_id, new_text)
    annotations_store.revalidate_markdown_anchors(paper_id, "summary.md", new_text)
    return OkOut()


@router.get("/{paper_id}/detail", response_model=MarkdownOut)
def get_detail(paper_id: str):
    if papers_store.load_meta(paper_id) is None:
        raise HTTPException(status_code=404, detail="paper not found")
    return MarkdownOut(markdown=papers_store.read_detail(paper_id))


@router.put("/{paper_id}/detail", response_model=OkOut)
def put_detail(paper_id: str, body: MarkdownPutIn):
    if papers_store.load_meta(paper_id) is None:
        raise HTTPException(status_code=404, detail="paper not found")
    if body.mode == "merge":
        existing = papers_store.read_detail(paper_id)
        new_text = _merge_section(existing, body.section, body.markdown)
    else:
        new_text = body.markdown
    papers_store.write_detail(paper_id, new_text)
    annotations_store.revalidate_markdown_anchors(paper_id, "detail.md", new_text)
    return OkOut()


# --- translation -----------------------------------------------------------

@router.get("/{paper_id}/translation", response_model=TranslationOut)
def get_translation(paper_id: str):
    if papers_store.load_meta(paper_id) is None:
        raise HTTPException(status_code=404, detail="paper not found")
    return papers_store.read_translation(paper_id)


@router.put("/{paper_id}/translation", response_model=OkOut)
def put_translation(paper_id: str, body: TranslationPatchIn):
    if papers_store.load_meta(paper_id) is None:
        raise HTTPException(status_code=404, detail="paper not found")
    papers_store.write_translation(paper_id, {"paragraphs": body.paragraphs})
    # Update paragraph_count on meta
    meta = papers_store.load_meta(paper_id) or {}
    meta["paragraph_count"] = len(body.paragraphs)
    papers_store.save_meta(paper_id, meta)
    return OkOut()


@router.patch("/{paper_id}/translation", response_model=OkOut)
def patch_translation(paper_id: str, body: TranslationPatchIn):
    if papers_store.load_meta(paper_id) is None:
        raise HTTPException(status_code=404, detail="paper not found")
    merged = papers_store.patch_translation(paper_id, body.paragraphs)
    meta = papers_store.load_meta(paper_id) or {}
    meta["paragraph_count"] = len(merged["paragraphs"])
    papers_store.save_meta(paper_id, meta)
    return OkOut()


# --- binary resources ------------------------------------------------------

@router.get("/{paper_id}/pdf")
def get_pdf(paper_id: str):
    pdf = paper_dir(paper_id) / "source.pdf"
    if not pdf.exists():
        raise HTTPException(status_code=404, detail="pdf not found")
    return FileResponse(str(pdf), media_type="application/pdf", filename="source.pdf")


@router.get("/{paper_id}/images/{name}")
def get_image(paper_id: str, name: str):
    img = paper_dir(paper_id) / "images" / name
    if not img.exists() or not img.is_file():
        raise HTTPException(status_code=404, detail="image not found")
    return FileResponse(str(img))
