#!/usr/bin/env bash
# stop.sh — stop the PaperPilot server and clean runtime files.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

if [[ -f ./.pid ]]; then
    PID="$(cat ./.pid)"
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID" || true
        for _ in 1 2 3 4 5 6 7 8 9 10; do
            kill -0 "$PID" 2>/dev/null || break
            sleep 0.2
        done
        kill -0 "$PID" 2>/dev/null && kill -9 "$PID" || true
    fi
fi

rm -f ./.pid ./.port
echo "PaperPilot stopped"
