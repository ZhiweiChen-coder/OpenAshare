#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"
# Keep matplotlib/fontconfig caches in writable temp dirs so reloads don't stall on cache rebuild.
export MPLCONFIGDIR="${TMPDIR:-/tmp}/ashare-mpl-cache"
export XDG_CACHE_HOME="${TMPDIR:-/tmp}/ashare-xdg-cache"
mkdir -p "$MPLCONFIGDIR" "$XDG_CACHE_HOME"
# Watch only api/ and ashare/ so .venv changes don't trigger reloads
exec ./.venv/bin/uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 --reload-dir api --reload-dir ashare
