"""Filesystem paths and JSON helpers with fcntl.flock locking."""
from __future__ import annotations

import fcntl
import json
import os
import re
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

# Project root = the paper_reader/ directory (one level up from server/).
ROOT: Path = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
ORIGIN_DIR = DATA / "origin"
PAPERS_DIR = DATA / "papers"
FOLDERS_DIR = DATA / "folders"
CATEGORIES_JSON = DATA / "categories.json"


def ensure_dirs() -> None:
    for d in (DATA, ORIGIN_DIR, PAPERS_DIR, FOLDERS_DIR):
        d.mkdir(parents=True, exist_ok=True)
    if not CATEGORIES_JSON.exists():
        write_json_atomic(CATEGORIES_JSON, {"tree": {}, "papers": {}})


def paper_dir(paper_id: str) -> Path:
    return PAPERS_DIR / paper_id


# --- Locking ---------------------------------------------------------------

@contextmanager
def file_lock(path: Path, exclusive: bool = True) -> Iterator[None]:
    """fcntl-based lock keyed on a sibling .lock file; safe for JSON/MD writes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = path.with_suffix(path.suffix + ".lock")
    # Ensure lock file exists
    with open(lock_path, "a"):
        pass
    f = open(lock_path, "r+")
    try:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
        yield
    finally:
        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        f.close()


# --- JSON helpers ----------------------------------------------------------

def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    with file_lock(path, exclusive=False):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)


def write_json_atomic(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with file_lock(path, exclusive=True):
        tmp = path.with_suffix(path.suffix + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)


def read_text(path: Path, default: str = "") -> str:
    if not path.exists():
        return default
    with file_lock(path, exclusive=False):
        return path.read_text(encoding="utf-8")


def write_text_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with file_lock(path, exclusive=True):
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(text, encoding="utf-8")
        os.replace(tmp, path)


# --- Slug / id utilities ---------------------------------------------------

_slug_re = re.compile(r"[^a-zA-Z0-9]+")


def slugify(text: str, max_len: int = 60) -> str:
    s = _slug_re.sub("-", text).strip("-").lower()
    return (s[:max_len] or "untitled").strip("-")


def unique_paper_id(base: str) -> str:
    """Return a paper dir name that does not exist yet, appending _2, _3, ..."""
    candidate = base
    i = 2
    while (PAPERS_DIR / candidate).exists():
        candidate = f"{base}_{i}"
        i += 1
    return candidate
