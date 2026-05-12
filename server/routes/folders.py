"""Folder homepage routes."""
from __future__ import annotations

from fastapi import APIRouter

from ..models import MarkdownOut, MarkdownPutIn, OkOut
from ..store import categories_store

router = APIRouter(prefix="/folders", tags=["folders"])


@router.get("/{path:path}/homepage", response_model=MarkdownOut)
def get_homepage(path: str):
    return MarkdownOut(markdown=categories_store.read_folder_homepage(path))


@router.put("/{path:path}/homepage", response_model=OkOut)
def put_homepage(path: str, body: MarkdownPutIn):
    categories_store.write_folder_homepage(path, body.markdown)
    return OkOut()
