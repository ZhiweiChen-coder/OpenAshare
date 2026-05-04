#!/usr/bin/env bash

set -euo pipefail

if command -v pm2 >/dev/null 2>&1; then
  pm2 flush
fi

PM2_LOG_DIR="${PM2_HOME:-$HOME/.pm2}/logs"

if [ ! -d "$PM2_LOG_DIR" ]; then
  echo "No PM2 log directory found: $PM2_LOG_DIR"
  exit 0
fi

find "$PM2_LOG_DIR" -type f -name "*.log" -exec sh -c ': > "$1"' _ {} \;
echo "PM2 logs truncated in $PM2_LOG_DIR"
