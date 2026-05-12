"""Annotation routes."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException

from ..models import AnnotationIn, AnnotationPatchIn, OkOut
from ..store import annotations_store, papers_store

router = APIRouter(prefix="/papers/{paper_id}/annotations", tags=["annotations"])


@router.get("")
def list_all(paper_id: str, tier: Optional[int] = None, broken: Optional[bool] = None):
    if papers_store.load_meta(paper_id) is None:
        raise HTTPException(status_code=404, detail="paper not found")
    return annotations_store.list_annotations(paper_id, tier=tier, broken=broken)


@router.post("")
def create(paper_id: str, body: AnnotationIn):
    if papers_store.load_meta(paper_id) is None:
        raise HTTPException(status_code=404, detail="paper not found")
    return annotations_store.create_annotation(paper_id, body.model_dump())


@router.patch("/{aid}")
def patch(paper_id: str, aid: str, body: AnnotationPatchIn):
    if papers_store.load_meta(paper_id) is None:
        raise HTTPException(status_code=404, detail="paper not found")
    ann = annotations_store.update_annotation(paper_id, aid, body.model_dump(exclude_none=True))
    if ann is None:
        raise HTTPException(status_code=404, detail="annotation not found")
    return ann


@router.delete("/{aid}", response_model=OkOut)
def delete(paper_id: str, aid: str):
    if not annotations_store.delete_annotation(paper_id, aid):
        raise HTTPException(status_code=404, detail="annotation not found")
    return OkOut()
