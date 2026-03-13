"""
监控服务命令行入口
"""

import argparse

from ashare.config import Config
from ashare.logging import get_logger
from ashare.monitor import MonitorService
from ashare.notify import PushNotifier
from ashare.stock_pool import load_stock_pool

logger = get_logger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="A股实时新闻与资金流监控服务")
    parser.add_argument(
        "--once",
        action="store_true",
        help="只执行一轮监控，不进入持续轮询",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    config = Config()

    if not config.monitor_enabled:
        logger.warning("MONITOR_ENABLED=false，监控服务未启动")
        return

    pool_path = config.stock_pool_path.resolve()
    def _stock_pool_provider():
        pool = load_stock_pool(pool_path)
        logger.info("股票池加载: %s 共 %d 只", pool_path, len(pool))
        return pool

    service = MonitorService(
        config=config,
        stock_pool_provider=_stock_pool_provider,
        notifier=PushNotifier(),
    )

    if args.once:
        service.run_cycle()
        return

    service.run_forever()


if __name__ == "__main__":
    main()
