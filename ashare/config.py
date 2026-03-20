from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _env_text(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.environ.get(name)
    if value is None:
        return default
    stripped = value.strip()
    return stripped if stripped else default


def _env_bool(name: str, default: bool) -> bool:
    value = _env_text(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = _env_text(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    value = _env_text(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _env_path(name: str, default: Path) -> Path:
    raw_value = _env_text(name)
    if raw_value is None:
        return default
    path = Path(raw_value).expanduser()
    return path if path.is_absolute() else (PROJECT_ROOT / path).resolve()


def _env_list(name: str, default: List[str]) -> List[str]:
    raw_value = _env_text(name)
    if raw_value is None:
        return list(default)
    if raw_value.startswith("["):
        try:
            parsed = json.loads(raw_value)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except json.JSONDecodeError:
            pass
    return [item.strip() for item in raw_value.split(",") if item.strip()]


@dataclass
class Config:
    llm_api_key: Optional[str] = field(default_factory=lambda: _env_text("LLM_API_KEY"))
    llm_base_url: str = field(default_factory=lambda: _env_text("LLM_BASE_URL", "https://api.deepseek.com") or "https://api.deepseek.com")
    llm_model: str = field(default_factory=lambda: _env_text("LLM_MODEL", "deepseek-chat") or "deepseek-chat")

    data_count: int = field(default_factory=lambda: _env_int("DATA_COUNT", 180))

    stock_pool_path: Path = field(default_factory=lambda: _env_path("STOCK_POOL_PATH", PROJECT_ROOT / "data" / "stock_pool.json"))
    stock_topics_path: Path = field(default_factory=lambda: _env_path("STOCK_TOPICS_PATH", PROJECT_ROOT / "data" / "stock_topics.json"))
    monitor_db_path: str = field(default_factory=lambda: str(_env_path("MONITOR_DB_PATH", PROJECT_ROOT / "data" / "monitor.db")))

    monitor_enabled: bool = field(default_factory=lambda: _env_bool("MONITOR_ENABLED", False))
    monitor_interval_seconds: int = field(default_factory=lambda: _env_int("MONITOR_INTERVAL_SECONDS", 300))
    monitor_push_methods: List[str] = field(default_factory=lambda: _env_list("MONITOR_PUSH_METHODS", ["serverchan"]))

    news_tracking_enabled: bool = field(default_factory=lambda: _env_bool("NEWS_TRACKING_ENABLED", True))
    fund_flow_tracking_enabled: bool = field(default_factory=lambda: _env_bool("FUND_FLOW_TRACKING_ENABLED", True))
    news_keywords: List[str] = field(
        default_factory=lambda: _env_list(
            "NEWS_KEYWORDS",
            ["业绩", "公告", "回购", "增持", "减持", "订单", "中标", "停牌", "监管", "并购"],
        )
    )
    alert_min_priority: int = field(default_factory=lambda: _env_int("ALERT_MIN_PRIORITY", 3))
    fund_flow_abs_threshold: float = field(default_factory=lambda: _env_float("FUND_FLOW_ABS_THRESHOLD", 50_000_000.0))
    fund_flow_pct_threshold: float = field(default_factory=lambda: _env_float("FUND_FLOW_PCT_THRESHOLD", 30.0))
    fund_flow_lookback_period: int = field(default_factory=lambda: _env_int("FUND_FLOW_LOOKBACK_PERIOD", 5))

    web_search_enabled: bool = field(default_factory=lambda: _env_bool("WEB_SEARCH_ENABLED", True))
    web_search_timeout: int = field(default_factory=lambda: _env_int("WEB_SEARCH_TIMEOUT", 8))

    def __post_init__(self) -> None:
        self.stock_pool_path = Path(self.stock_pool_path)
        self.stock_topics_path = Path(self.stock_topics_path)
        self.monitor_db_path = str(Path(self.monitor_db_path))
        self.data_count = max(30, self.data_count)
        self.monitor_interval_seconds = max(10, self.monitor_interval_seconds)
        self.alert_min_priority = min(5, max(1, self.alert_min_priority))
        self.fund_flow_lookback_period = max(1, self.fund_flow_lookback_period)
        self.web_search_timeout = max(1, self.web_search_timeout)
        self.monitor_push_methods = [method for method in self.monitor_push_methods if method]
        self.news_keywords = [keyword for keyword in self.news_keywords if keyword]

