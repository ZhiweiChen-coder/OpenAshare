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

HOSTNAME="${WEB_HOSTNAME:-${HOSTNAME:-127.0.0.1}}"
PORT="${WEB_PORT:-${PORT:-3000}}"

exec npm run start -- --hostname "$HOSTNAME" --port "$PORT"
