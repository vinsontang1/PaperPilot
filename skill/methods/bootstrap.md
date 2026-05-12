# methods/bootstrap.md

**Purpose:** Ensure the PaperPilot server is running, MinerU API token is configured, and `data/origin/` has been scanned.

## Preconditions
- Current working directory is the PaperPilot project (contains `start.sh`, `server/`, `web/`).

## Steps

1. **Check Python deps.** If `fastapi` or `requests` are not importable:
   ```bash
   pip install -r requirements.txt
   ```

2. **Check `MINERU_TOKEN`.** Required by `methods/preprocess.md` to extract papers.
   ```bash
   if [ -z "${MINERU_TOKEN:-}" ]; then
     echo "WARN: MINERU_TOKEN is not set. Preprocess will fail."
   fi
   ```
   If unset, ask the user to configure it. Surface the instructions clearly:
   - 注册/登录：https://mineru.net/
   - 复制 Token：https://mineru.net/apiManage/token
   - `export MINERU_TOKEN='<粘贴的 token>'`
   - 建议写入 `~/.bashrc`：`echo "export MINERU_TOKEN='xxx'" >> ~/.bashrc && source ~/.bashrc`
   - `bash stop.sh && bash start.sh`（让服务进程继承新环境变量）
   You may proceed with bootstrap even when MINERU_TOKEN is missing — the user
   may want to read existing preprocessed papers; only `preprocess.md` requires it.

3. **Start the server in background (idempotent):**
   ```bash
   bash start.sh
   ```
   The script writes `./.pid` and `./.port`. It probes ports 7856–7870.

4. **Health check:**
   ```bash
   PORT=$(cat ./.port)
   curl -sf "http://127.0.0.1:$PORT/api/health"
   # → {"ok":true,"version":"0.1.0","port":<PORT>}
   ```
   If not healthy after 10 × 200 ms, tail `./.log` and surface the error.

5. **Rescan origin** — pulls any newly added PDFs from `data/origin/`:
   ```bash
   curl -sX POST "http://127.0.0.1:$PORT/api/system/rescan"
   ```

6. Report final state to the user: number of papers, pending vs preprocessed counts,
   the URL `http://127.0.0.1:$PORT/`, and whether MINERU_TOKEN is set.

## APIs used
- `GET /api/health`
- `POST /api/system/rescan`

## Files read/written
- `./.pid`, `./.port`, `./.log` (runtime only)
- `data/papers/<id>/*` (created for new origin PDFs)

## Failure modes
- Port 7856–7870 all busy → instruct user to `bash stop.sh` previous instance.
- `pip` blocked by sandbox → ask the user to approve or install manually.
- `start.sh` exits 1 → print `./.log` tail.
- `MINERU_TOKEN` missing → only blocks `preprocess.md`, not bootstrap itself.
