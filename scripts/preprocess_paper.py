"""preprocess_paper.py — 一键完成论文抽取 + 重命名 + 图表索引构建。

用法:
    python scripts/preprocess_paper.py <paper_id>

前提:
    - 服务已启动（.port 文件存在）
    - MINERU_TOKEN 环境变量已设置

输出:
    向 stdout 打印一个 JSON，包含 sub-agent 所需的全部变量。
    Agent 只需读这个 JSON 即可派发 summary/detail/translation 三个 sub-agent。

退出码:
    0 = 成功
    1 = 一般错误
    2 = MINERU_TOKEN 缺失
    3 = 服务未启动
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import requests


def fail(msg: str, code: int = 1):
    print(json.dumps({"error": msg, "code": code}))
    sys.exit(code)


def main():
    if len(sys.argv) < 2:
        fail("用法: python scripts/preprocess_paper.py <paper_id>")

    paper_id = sys.argv[1]
    project_root = Path(__file__).resolve().parent.parent
    os.chdir(project_root)

    # --- 检查前置条件 ---
    token = os.environ.get("MINERU_TOKEN", "").strip()
    if not token:
        fail(
            "MINERU_TOKEN 环境变量未设置。请先配置: export MINERU_TOKEN='<your_token>'\n"
            "Token 获取地址: https://mineru.net/apiManage/token",
            code=2,
        )

    port_file = project_root / ".port"
    if not port_file.exists():
        fail("服务未启动（.port 文件不存在）。请先运行: bash start.sh", code=3)
    port = port_file.read_text().strip()
    base = f"http://127.0.0.1:{port}/api"

    # 验证服务健康
    try:
        r = requests.get(f"{base}/health", timeout=5)
        r.raise_for_status()
    except Exception as e:
        fail(f"服务不可用: {e}", code=3)

    # 验证 paper 存在
    r = requests.get(f"{base}/papers/{paper_id}", timeout=5)
    if r.status_code != 200:
        fail(f"论文 '{paper_id}' 不存在。请先 rescan: POST /api/system/rescan")

    # --- Step 1: MinerU 抽取 ---
    print(f"[preprocess] 步骤1: MinerU 抽取 {paper_id}...", file=sys.stderr)
    result = subprocess.run(
        [sys.executable, "scripts/mineru_extract.py", paper_id, str(project_root)],
        capture_output=True, text=True, env={**os.environ, "MINERU_TOKEN": token},
    )
    if result.returncode != 0:
        fail(f"MinerU 抽取失败: {result.stderr or result.stdout}", code=result.returncode or 1)
    print(result.stderr, file=sys.stderr, end="")

    # 读取抽取结果
    extract_path = Path(f"/tmp/paperpilot_extract_{paper_id}.json")
    if not extract_path.exists():
        fail("抽取完成但 JSON 文件未找到")
    extract_data = json.loads(extract_path.read_text())
    full_md_path = extract_data.get("mineru_full_md")

    # --- Step 2: 推断标题 ---
    print("[preprocess] 步骤2: 推断标题...", file=sys.stderr)
    title = ""
    if full_md_path and Path(full_md_path).exists():
        for line in Path(full_md_path).read_text(encoding="utf-8").splitlines():
            if line.startswith("# "):
                title = line[2:].strip()
                break
    if not title:
        # fallback: 用 pypdf 读第一页
        try:
            import pypdf
            reader = pypdf.PdfReader(str(project_root / "data" / "papers" / paper_id / "source.pdf"))
            text = (reader.pages[0].extract_text() or "").strip().splitlines()
            title = text[0] if text else paper_id
        except Exception:
            title = paper_id
    print(f"[preprocess] 标题: {title}", file=sys.stderr)

    # --- Step 3: 重命名 ---
    print("[preprocess] 步骤3: 重命名...", file=sys.stderr)
    rename_resp = requests.post(
        f"{base}/papers/{paper_id}/rename",
        json={"title": title}, timeout=10,
    )
    if rename_resp.status_code != 200:
        fail(f"重命名失败: {rename_resp.text}")
    new_meta = rename_resp.json()
    new_id = new_meta["id"]
    print(f"[preprocess] {paper_id} → {new_id}", file=sys.stderr)

    # --- Step 4: 同步抽取文件到新 id ---
    if new_id != paper_id:
        new_extract = Path(f"/tmp/paperpilot_extract_{new_id}.json")
        shutil.copy2(extract_path, new_extract)
        # patch paper_id inside
        d = json.loads(new_extract.read_text())
        d["paper_id"] = new_id
        # patch full_md_path if mineru dir was old-named
        old_mineru = Path(f"/tmp/paperpilot_mineru_{paper_id}")
        new_mineru = Path(f"/tmp/paperpilot_mineru_{new_id}")
        if old_mineru.exists() and not new_mineru.exists():
            old_mineru.rename(new_mineru)
        d["mineru_full_md"] = str(new_mineru / "full.md") if (new_mineru / "full.md").exists() else full_md_path
        new_extract.write_text(json.dumps(d, ensure_ascii=False))
        extract_path = new_extract
        full_md_path = d["mineru_full_md"]
    else:
        extract_path = Path(f"/tmp/paperpilot_extract_{new_id}.json")

    # --- Step 5: 构建 FIGURE_LIST ---
    print("[preprocess] 步骤5: 构建图表索引...", file=sys.stderr)
    import glob as globmod
    mineru_dir = Path(f"/tmp/paperpilot_mineru_{new_id}")
    content_list_files = list(mineru_dir.glob("*_content_list.json"))
    figure_lines = []
    if content_list_files:
        items = json.loads(content_list_files[0].read_text(encoding="utf-8"))
        img_blocks = sorted(
            [it for it in items if it.get("type") in ("image", "table") and it.get("img_path")],
            key=lambda b: ((b.get("page_idx") or 0), (b.get("bbox") or [0, 0, 0, 0])[1]),
        )
        actual_images = sorted(os.listdir(project_root / "data" / "papers" / new_id / "images"))
        for i, (block, fname) in enumerate(zip(img_blocks, actual_images), 1):
            caps = block.get("image_caption") or block.get("table_caption") or []
            cap = (caps[0] if caps else "").replace("\n", " ").strip()[:160]
            page = (block.get("page_idx") or 0) + 1
            figure_lines.append(f"FIG_{i} ({fname}) — page {page} — [{block.get('type')}] {cap}")

    figure_list_text = "\n".join(figure_lines)
    figure_list_path = Path(f"/tmp/{new_id}_figure_list.txt")
    figure_list_path.write_text(figure_list_text, encoding="utf-8")

    # --- 输出最终 JSON ---
    output = {
        "old_id": paper_id,
        "paper_id": new_id,
        "title": title,
        "port": int(port),
        "full_md_path": full_md_path,
        "extract_path": str(extract_path),
        "figure_list_path": str(figure_list_path),
        "figure_list_text": figure_list_text,
        "paragraph_count": len(json.loads(extract_path.read_text()).get("paragraphs", [])),
        "image_count": len(figure_lines),
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    print(f"[preprocess] 完成！Agent 可读取上面 JSON 派发 sub-agent。", file=sys.stderr)


if __name__ == "__main__":
    main()
