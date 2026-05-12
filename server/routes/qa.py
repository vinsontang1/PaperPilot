"""QA routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..models import OkOut, QACreateIn, QAPatchIn
from ..store import papers_store, qa_store

router = APIRouter(prefix="/papers/{paper_id}/qa", tags=["qa"])


@router.get("")
def list_all(paper_id: str):
    if papers_store.load_meta(paper_id) is None:
        raise HTTPException(status_code=404, detail="paper not found")
    return qa_store.list_qa(paper_id)


@router.post("")
def create(paper_id: str, body: QACreateIn):
    if papers_store.load_meta(paper_id) is None:
        raise HTTPException(status_code=404, detail="paper not found")
    return qa_store.create_qa(paper_id, body.model_dump())


@router.get("/{qid}")
def get(paper_id: str, qid: str):
    qa = qa_store.get_qa(paper_id, qid)
    if qa is None:
        raise HTTPException(status_code=404, detail="qa not found")
    return qa


@router.patch("/{qid}")
def patch(paper_id: str, qid: str, body: QAPatchIn):
    if papers_store.load_meta(paper_id) is None:
        raise HTTPException(status_code=404, detail="paper not found")
    qa = qa_store.update_qa(paper_id, qid, body.model_dump(exclude_none=True))
    if qa is None:
        raise HTTPException(status_code=404, detail="qa not found")
    return qa


@router.delete("/{qid}", response_model=OkOut)
def delete(paper_id: str, qid: str):
    if not qa_store.delete_qa(paper_id, qid):
        raise HTTPException(status_code=404, detail="qa not found")
    return OkOut()
