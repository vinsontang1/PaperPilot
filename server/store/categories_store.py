"""Categories (folder tree) + paper membership storage."""
from __future__ import annotations

from typing import Optional

from .paths import CATEGORIES_JSON, read_json, write_json_atomic, FOLDERS_DIR, read_text, write_text_atomic


def _load() -> dict:
    data = read_json(CATEGORIES_JSON, default={"tree": {}, "papers": {}})
    data.setdefault("tree", {})
    data.setdefault("papers", {})
    return data


def _save(data: dict) -> None:
    write_json_atomic(CATEGORIES_JSON, data)


def _walk(tree: dict, parts: list[str]) -> Optional[dict]:
    node = tree
    for p in parts:
        if p not in node:
            return None
        node = node[p]
    return node


def _ensure(tree: dict, parts: list[str]) -> dict:
    node = tree
    for p in parts:
        node = node.setdefault(p, {})
    return node


def get_tree() -> dict:
    return _load()


def create_category(path: str) -> None:
    if not path or path.strip("/") == "":
        return
    parts = [p for p in path.split("/") if p]
    data = _load()
    _ensure(data["tree"], parts)
    data["papers"].setdefault("/".join(parts), [])
    _save(data)


def delete_category(path: str) -> None:
    parts = [p for p in path.split("/") if p]
    if not parts:
        return
    data = _load()
    key = "/".join(parts)
    if data["papers"].get(key):
        raise ValueError("category is not empty")
    # Remove nested node
    parent = _walk(data["tree"], parts[:-1]) if parts[:-1] else data["tree"]
    if parent is None or parts[-1] not in parent:
        return
    # Recursively check: ensure all descendant papers lists are empty
    def _has_papers(sub_path: str, node: dict) -> bool:
        if data["papers"].get(sub_path):
            return True
        for name, child in node.items():
            if _has_papers(f"{sub_path}/{name}" if sub_path else name, child):
                return True
        return False

    if _has_papers(key, parent[parts[-1]]):
        raise ValueError("category subtree is not empty")

    del parent[parts[-1]]
    # Drop papers-map keys under this path
    data["papers"] = {k: v for k, v in data["papers"].items() if not (k == key or k.startswith(key + "/"))}
    _save(data)


def move_paper(paper_id: str, new_category: Optional[str]) -> None:
    data = _load()
    # Remove paper from all existing buckets
    for k, lst in list(data["papers"].items()):
        if paper_id in lst:
            lst.remove(paper_id)
    if new_category:
        parts = [p for p in new_category.split("/") if p]
        _ensure(data["tree"], parts)
        key = "/".join(parts)
        data["papers"].setdefault(key, []).append(paper_id)
    _save(data)


def papers_in_category(path: str) -> list[str]:
    data = _load()
    parts = [p for p in path.split("/") if p]
    key = "/".join(parts)
    # Include the node itself and all descendants
    out: list[str] = []
    for k, lst in data["papers"].items():
        if k == key or k.startswith(key + "/"):
            out.extend(lst)
    return out


def replace_paper_id(old_id: str, new_id: str) -> None:
    """Substitute every occurrence of `old_id` with `new_id` in papers map."""
    data = _load()
    changed = False
    for k, lst in list(data["papers"].items()):
        new_list = [new_id if p == old_id else p for p in lst]
        if new_list != lst:
            data["papers"][k] = new_list
            changed = True
    if changed:
        _save(data)


# --- Folder homepage markdown ----------------------------------------------

def _folder_homepage_path(path: str):
    parts = [p for p in path.split("/") if p]
    return FOLDERS_DIR.joinpath(*parts, "homepage.md")


def read_folder_homepage(path: str) -> str:
    return read_text(_folder_homepage_path(path))


def write_folder_homepage(path: str, markdown: str) -> None:
    write_text_atomic(_folder_homepage_path(path), markdown)
