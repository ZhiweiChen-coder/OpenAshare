#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

# Keep matplotlib/fontconfig caches in writable temp dirs so reloads don't stall on cache rebuild.
export MPLCONFIGDIR="${TMPDIR:-/tmp}/ashare-mpl-cache"
export XDG_CACHE_HOME="${TMPDIR:-/tmp}/ashare-xdg-cache"
mkdir -p "$MPLCONFIGDIR" "$XDG_CACHE_HOME"
# Watch only api/ and ashare/ so .venv changes don't trigger reloads
API_PORT="${API_PORT:-8000}"
exec ./.venv/bin/uvicorn api.main:app --reload --host 0.0.0.0 --port "${API_PORT}" --reload-dir api --reload-dir ashare
