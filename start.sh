#!/usr/bin/env bash
# start.sh — launch PaperPilot FastAPI server in background.
# Writes ./.pid and ./.port; tries port 7856 then 7857..7870.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

LOCKFILE="./.pid.lock"
exec 9>"$LOCKFILE"
flock 9

# Reuse existing healthy server if pid is alive.
if [[ -f ./.pid ]] && kill -0 "$(cat ./.pid)" 2>/dev/null; then
    PORT="$(cat ./.port 2>/dev/null || echo 7856)"
    echo "PaperPilot already running (pid=$(cat ./.pid), port=$PORT)"
    exit 0
fi

# Pick a free port.
pick_port() {
    for p in 7856 7857 7858 7859 7860 7861 7862 7863 7864 7865 7866 7867 7868 7869 7870; do
        if ! (echo > "/dev/tcp/127.0.0.1/$p") >/dev/null 2>&1; then
            echo "$p"; return 0
        fi
    done
    echo "ERROR: no free port in 7856-7870" >&2
    return 1
}

PORT="${1:-$(pick_port)}"

# Start uvicorn in background.
nohup python -m uvicorn server.app:app --host 127.0.0.1 --port "$PORT" \
    > ./.log 2>&1 &

echo $! > ./.pid
echo "$PORT" > ./.port

# Wait for health.
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
        echo "PaperPilot started (pid=$(cat ./.pid), port=$PORT)"
        exit 0
    fi
    sleep 0.2
done

echo "ERROR: PaperPilot failed to become healthy. See ./.log" >&2
exit 1
