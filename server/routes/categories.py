"""Category (folder tree) routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..models import CategoryIn, OkOut
from ..store import categories_store

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("")
def get_categories():
    return categories_store.get_tree()


@router.post("", response_model=OkOut)
def create(body: CategoryIn):
    categories_store.create_category(body.path)
    return OkOut()


@router.delete("", response_model=OkOut)
def delete(body: CategoryIn):
    try:
        categories_store.delete_category(body.path)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return OkOut()


@router.get("/{path:path}/papers")
def papers_under(path: str):
    return {"papers": categories_store.papers_in_category(path)}
