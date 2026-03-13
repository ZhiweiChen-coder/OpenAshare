#!/bin/bash
# 启动实时监控服务

echo "🔔 启动 A 股实时新闻与资金流监控服务..."

cd "$(dirname "$0")/.." || exit 1

if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装"
    exit 1
fi

python3 -m ashare.monitor_runner
