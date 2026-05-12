"""System routes: /health, /system/rescan."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter

from ..models import HealthOut, RescanOut
from ..store import papers_store

router = APIRouter(tags=["system"])


def _current_port() -> int:
    try:
        p = Path(__file__).resolve().parent.parent.parent / ".port"
        if p.exists():
            return int(p.read_text().strip())
    except Exception:
        pass
    return 0


@router.get("/health", response_model=HealthOut)
def health():
    return HealthOut(ok=True, version="0.1.0", port=_current_port())


@router.post("/system/rescan", response_model=RescanOut)
def rescan():
    res = papers_store.rescan_origin()
    return RescanOut(**res)
