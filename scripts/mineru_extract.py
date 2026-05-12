"""mineru_extract.py — drive the MinerU API to parse a paper's source.pdf.

What it does:
  1. Reads `MINERU_TOKEN` from environment (or `--token` CLI arg).
  2. POSTs to /api/v4/file-urls/batch to obtain an upload URL for the local PDF.
  3. PUTs the local PDF to that URL.
  4. Polls /api/v4/extract-results/batch/<batch_id> until task state == "done".
  5. Downloads the result zip, extracts:
       - `full.md`         → /tmp/paperpilot_mineru_<paper_id>/full.md
       - `images/`         → data/papers/<paper_id>/images/  (all figures + tables)
       - `*_content_list.json` → /tmp/paperpilot_mineru_<paper_id>/content_list.json
  6. Builds the paragraph extraction JSON used by translation sub-agent at
     /tmp/paperpilot_extract_<paper_id>.json with shape:
       { paragraphs: [{pid, page, index_on_page, bbox, text_en, text_zh:"", kind}] }

Usage:
  python scripts/mineru_extract.py <paper_id> <project_root>

Hard dependencies: requests (already installed for FastAPI deps).

Output exit codes:
  0 = success  (prints summary line)
  2 = MINERU_TOKEN missing — guides the user
  3 = upload failed
  4 = task failed
  5 = parse error
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import shutil
import sys
import time
import zipfile
from pathlib import Path

import requests

API = "https://mineru.net/api/v4"


def fail(msg: str, code: int = 1) -> None:
    print(f"[mineru_extract] ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def get_token() -> str:
    tok = os.environ.get("MINERU_TOKEN", "").strip()
    if not tok:
        fail(
            "MINERU_TOKEN environment variable is not set. "
            "See SKILL.md → 'MinerU 配置' for how to obtain a token "
            "(https://mineru.net/) and `export MINERU_TOKEN=...`.",
            code=2,
        )
    return tok


def submit_batch(token: str, filename: str) -> tuple[str, str]:
    """Request a batch upload URL. Returns (batch_id, upload_url)."""
    r = requests.post(
        f"{API}/file-urls/batch",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={
            "enable_formula": True,
            "enable_table": True,
            "language": "en",
            "model_version": "vlm",
            "files": [{"name": filename, "is_ocr": False, "data_id": filename}],
        },
        timeout=30,
    )
    r.raise_for_status()
    body = r.json()
    if body.get("code") not in (0, "0"):
        fail(f"submit_batch error: {body}", code=3)
    data = body["data"]
    return data["batch_id"], data["file_urls"][0]


def upload_pdf(upload_url: str, pdf_path: Path) -> None:
    with open(pdf_path, "rb") as f:
        r = requests.put(upload_url, data=f, timeout=600)
    r.raise_for_status()


def poll_batch(token: str, batch_id: str, timeout_s: int = 1800) -> dict:
    """Wait for the first file in the batch to reach state == 'done'."""
    url = f"{API}/extract-results/batch/{batch_id}"
    headers = {"Authorization": f"Bearer {token}"}
    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        r = requests.get(url, headers=headers, timeout=30)
        r.raise_for_status()
        body = r.json()
        if body.get("code") not in (0, "0"):
            fail(f"poll_batch error: {body}", code=4)
        results = body["data"].get("extract_result") or []
        if results:
            last = results[0]
            state = last.get("state")
            if state == "done":
                return last
            if state == "failed":
                fail(f"task failed: {last.get('err_msg')}", code=4)
            prog = last.get("extract_progress") or {}
            print(
                f"[mineru_extract] state={state} pages={prog.get('extracted_pages', '?')}/{prog.get('total_pages', '?')}",
                file=sys.stderr,
            )
        time.sleep(5)
    fail(f"timed out after {timeout_s}s; last state: {last}", code=4)


def download_and_extract_zip(zip_url: str, dest_dir: Path) -> None:
    r = requests.get(zip_url, timeout=600)
    r.raise_for_status()
    if dest_dir.exists():
        shutil.rmtree(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        zf.extractall(dest_dir)


def find_first(dir: Path, name: str) -> Path | None:
    for p in dir.rglob(name):
        return p
    return None


# ---- Paragraph builder (from content_list.json) --------------------------

def build_paragraphs(content_list: list[dict]) -> list[dict]:
    """MinerU's content_list.json is a flat list of typed blocks with page index
    and bbox. We turn each text-bearing block into a paragraph for translation.

    We KEEP blocks of type 'text' / 'title' / 'list' / 'caption'.
    We DROP blocks of type 'image' / 'table' / 'equation' (their visuals live
    in images/ already; equations would need LaTeX rendering).
    """
    out: list[dict] = []
    per_page_index: dict[int, int] = {}
    for block in content_list:
        btype = block.get("type") or block.get("block_type") or ""
        page = block.get("page_idx", block.get("page", 0))
        if isinstance(page, int):
            page_num = page + 1
        else:
            try:
                page_num = int(page) + 1
            except Exception:
                page_num = 0

        bbox = block.get("bbox") or block.get("box") or [0, 0, 0, 0]

        text = ""
        kind = "body"
        if btype in ("text", "title", "list", "header"):
            text = block.get("text") or ""
            if btype == "title":
                kind = "heading"
        elif btype == "caption":
            text = block.get("text") or ""
            kind = "caption"
        else:
            continue
        text = text.strip()
        if len(text) < 3:
            continue

        per_page_index[page_num] = per_page_index.get(page_num, 0) + 1
        idx = per_page_index[page_num]
        out.append({
            "pid": f"p_{page_num}_{idx}",
            "page": page_num,
            "index_on_page": idx,
            "bbox": [float(x) for x in bbox] if isinstance(bbox, (list, tuple)) and len(bbox) == 4 else [0, 0, 0, 0],
            "text_en": text,
            "text_zh": "",
            "kind": kind,
        })
    return out


# ---- Image extraction ---------------------------------------------------

MIN_SIZE_PX_DIM_FLOOR = 120  # drop if either dim < this (absolute floor)


def _resolve_image_path(work_dir: Path, img_path: str) -> Path | None:
    """Resolve an image reference from content_list.json to an actual file path."""
    name = Path(img_path).name
    for p in work_dir.rglob(name):
        if p.is_file():
            return p
    return None


def collect_images_in_order(
    work_dir: Path,
    paper_dir: Path,
    content_list: list[dict],
) -> int:
    """Copy every figure/table image referenced by content_list.json into
    data/papers/<id>/images/, preserving the paper's reading order via
    fig001.jpg, fig002.jpg, … naming.

    Uses MinerU's original rasterized images directly (their resolution
    is determined by MinerU's VLM pipeline — typically 72-150 DPI).

    Drops images whose smaller dimension is below MIN_SIZE_PX_DIM_FLOOR
    or below 0.3 × median of the smaller-dim across all figures.
    """
    target = paper_dir / "images"
    if target.exists():
        for p in target.glob("*"):
            p.unlink()
    target.mkdir(parents=True, exist_ok=True)

    # Gather candidate refs in reading order
    refs: list[tuple[int, int, Path, str]] = []
    seen: set[str] = set()
    for block in content_list:
        typ = block.get("type") or block.get("block_type")
        if typ not in ("image", "table"):
            continue
        img_rel = block.get("img_path") or ""
        if not img_rel:
            continue
        src = _resolve_image_path(work_dir, img_rel)
        if src is None or not src.is_file():
            continue
        key = str(src)
        if key in seen:
            continue
        seen.add(key)
        page_idx = int(block.get("page_idx", 0))
        bbox = block.get("bbox") or [0, 0, 0, 0]
        y = int(bbox[1]) if isinstance(bbox, (list, tuple)) and len(bbox) == 4 else 0
        caps = block.get("image_caption") or block.get("table_caption") or []
        cap = (caps[0] if caps else "")[:80]
        refs.append((page_idx, y, src, cap))

    if not refs:
        return 0

    refs.sort(key=lambda r: (r[0], r[1]))

    try:
        from PIL import Image
        def dims(p: Path) -> tuple[int, int]:
            with Image.open(p) as im:
                return im.size
    except Exception:
        def dims(p: Path) -> tuple[int, int]:
            return (999, 999)

    measured: list[tuple[Path, str, int, int]] = []
    for _, _, src, cap in refs:
        try:
            w, h = dims(src)
        except Exception:
            w, h = (999, 999)
        measured.append((src, cap, w, h))

    mins = sorted(min(w, h) for _, _, w, h in measured)
    median_min = mins[len(mins) // 2] if mins else 0
    threshold = max(MIN_SIZE_PX_DIM_FLOOR, int(median_min * 0.3))

    n = 0
    for src, cap, w, h in measured:
        if min(w, h) < threshold:
            continue
        n += 1
        target_path = target / f"fig{n:03d}.jpg"
        # Copy MinerU's original, converting to JPEG for consistency
        try:
            from PIL import Image as PILImage
            im = PILImage.open(src)
            if im.mode in ("RGBA", "P"):
                im = im.convert("RGB")
            im.save(str(target_path), "JPEG", quality=92)
        except Exception:
            shutil.copy2(src, target_path)

    return n


# ---- main ----------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paper_id")
    ap.add_argument("project_root")
    ap.add_argument("--token", default=None)
    args = ap.parse_args()

    token = args.token or get_token()
    root = Path(args.project_root)
    paper_dir = root / "data" / "papers" / args.paper_id
    pdf_path = paper_dir / "source.pdf"
    if not pdf_path.exists():
        fail(f"no pdf at {pdf_path}")

    name = pdf_path.name
    print(f"[mineru_extract] requesting upload URL for {name}", file=sys.stderr)
    batch_id, upload_url = submit_batch(token, name)

    print(f"[mineru_extract] uploading {pdf_path.stat().st_size} bytes…", file=sys.stderr)
    upload_pdf(upload_url, pdf_path)

    print(f"[mineru_extract] batch_id={batch_id}; polling…", file=sys.stderr)
    result = poll_batch(token, batch_id)
    zip_url = result["full_zip_url"]
    print(f"[mineru_extract] downloading result zip…", file=sys.stderr)

    work_dir = Path(f"/tmp/paperpilot_mineru_{args.paper_id}")
    download_and_extract_zip(zip_url, work_dir)

    full_md = find_first(work_dir, "full.md")
    if full_md is None:
        full_md = next(iter(work_dir.rglob("*.md")), None)
    content_list_path = next(iter(work_dir.rglob("*_content_list.json")), None)
    if content_list_path is None:
        content_list_path = next(iter(work_dir.rglob("content_list.json")), None)

    if content_list_path is None:
        fail("MinerU result missing content_list.json", code=5)

    content_list = json.loads(content_list_path.read_text(encoding="utf-8"))
    paragraphs = build_paragraphs(content_list)

    # Save extraction JSON for the translation sub-agent.
    out_path = Path(f"/tmp/paperpilot_extract_{args.paper_id}.json")
    out_path.write_text(json.dumps({
        "paper_id": args.paper_id,
        "paragraphs": paragraphs,
        "n_pages": max((p["page"] for p in paragraphs), default=0),
        "source": "mineru",
        "mineru_full_md": str(full_md) if full_md else None,
    }, ensure_ascii=False))

    n_images = collect_images_in_order(work_dir, paper_dir, content_list)

    print(
        f"paragraphs={len(paragraphs)} images={n_images} "
        f"full_md={full_md} -> {out_path}"
    )


if __name__ == "__main__":
    main()
