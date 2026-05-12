"""FastAPI app factory; mounts /api and static web assets."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from .routes import system, papers, annotations, qa, categories, folders
from .store.paths import ROOT, ensure_dirs

app = FastAPI(title="PaperPilot", version="0.1.0")

ensure_dirs()

app.include_router(system.router, prefix="/api")
app.include_router(papers.router, prefix="/api")
app.include_router(annotations.router, prefix="/api")
app.include_router(qa.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(folders.router, prefix="/api")

WEB_DIR = ROOT / "web"
if WEB_DIR.exists():
    app.mount(
        "/web",
        StaticFiles(directory=str(WEB_DIR), html=True),
        name="web",
    )


@app.get("/")
def index_redirect():
    if (WEB_DIR / "index.html").exists():
        return RedirectResponse(url="/web/")
    return {"ok": True, "hint": "PaperPilot: place UI in web/index.html"}
