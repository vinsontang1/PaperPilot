"""Pydantic models (request/response schemas)."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class HealthOut(BaseModel):
    ok: bool = True
    version: str = "0.1.0"
    port: int


class RescanOut(BaseModel):
    added: list[str]
    skipped: list[str]


class PaperSummary(BaseModel):
    id: str
    title: str
    status: str
    category: Optional[str] = None
    year: Optional[int] = None
    created_at: Optional[str] = None


class PaperCreateIn(BaseModel):
    origin_filename: str


class PaperPatchIn(BaseModel):
    status: Optional[Literal["unprocessed", "preprocessed", "read"]] = None
    title: Optional[str] = None


class PaperMoveIn(BaseModel):
    category: Optional[str] = None


class MarkdownOut(BaseModel):
    markdown: str


class MarkdownPutIn(BaseModel):
    markdown: str
    mode: Literal["replace", "merge"] = "replace"
    section: Optional[str] = None


class TranslationParagraph(BaseModel):
    pid: str
    page: int
    index_on_page: int
    bbox: list[float]
    text_en: str
    text_zh: str
    kind: Optional[str] = None


class TranslationOut(BaseModel):
    paragraphs: list[TranslationParagraph]


class TranslationPatchIn(BaseModel):
    paragraphs: list[dict]


class AnnotationIn(BaseModel):
    type: Literal["highlight", "underline", "comment"]
    tier: Literal[1, 2, 3]
    target: dict
    color: Optional[str] = None
    comment_markdown: Optional[str] = ""


class AnnotationPatchIn(BaseModel):
    type: Optional[str] = None
    tier: Optional[int] = None
    target: Optional[dict] = None
    color: Optional[str] = None
    comment_markdown: Optional[str] = None
    broken: Optional[bool] = None


class QACreateIn(BaseModel):
    tier: Literal[1, 2, 3]
    selection: dict
    question: Optional[str] = None


class QAPatchIn(BaseModel):
    question: Optional[str] = None
    answer_markdown: Optional[str] = None
    sync: Optional[bool] = None


class CategoryIn(BaseModel):
    path: str


class OkOut(BaseModel):
    ok: bool = True
