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

HOST="${API_HOST:-0.0.0.0}"
PORT="${API_PORT:-8000}"
WORKERS="${API_WORKERS:-2}"

# Keep matplotlib/fontconfig caches in writable temp dirs so server starts reliably on minimal VMs.
export MPLCONFIGDIR="${MPLCONFIGDIR:-${TMPDIR:-/tmp}/ashare-mpl-cache}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-${TMPDIR:-/tmp}/ashare-xdg-cache}"
mkdir -p "$MPLCONFIGDIR" "$XDG_CACHE_HOME" "$ROOT_DIR/data" "$ROOT_DIR/logs"

exec ./.venv/bin/uvicorn api.main:app \
  --host "$HOST" \
  --port "$PORT" \
  --workers "$WORKERS"
