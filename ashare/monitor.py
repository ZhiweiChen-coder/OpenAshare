"""
A股实时新闻与资金流监控模块
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import akshare as ak
import pandas as pd
from openai import OpenAI

from ashare.logging import get_logger
from ashare.stock_pool import (
    extract_symbol,
    get_monitor_support_level,
    infer_market,
    is_hk_stock,
    normalize_stock_code,
)

logger = get_logger(__name__)

DEFAULT_STOCK_TOPIC_KEYWORDS = {
    "中国海油": ["石油", "原油", "国际油价", "布伦特", "OPEC", "油气", "能源", "中海油"],
    "中国石油": ["石油", "原油", "国际油价", "布伦特", "OPEC", "油气", "能源", "中石油"],
    "阿里巴巴": ["电商", "消费", "平台经济", "云计算", "阿里云"],
    "腾讯控股": ["游戏", "社交", "广告", "AI", "云服务"],
}


def utcnow_text() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def is_supported_monitor_stock(code: str) -> bool:
    return get_monitor_support_level(code) in {"full", "partial"}


def safe_json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def get_first_available(row: Dict[str, Any], candidates: Sequence[str]) -> Any:
    for key in candidates:
        if key in row and pd.notna(row[key]):
            return row[key]
    return None


def parse_chinese_number(value: Any) -> float:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip().replace(",", "").replace("%", "")
    if not text or text == "--":
        return 0.0

    multiplier = 1.0
    if text.endswith("亿"):
        multiplier = 100000000.0
        text = text[:-1]
    elif text.endswith("万"):
        multiplier = 10000.0
        text = text[:-1]

    try:
        return float(text) * multiplier
    except ValueError:
        return 0.0


@dataclass
class AlertEvent:
    event_type: str
    stock_code: str
    stock_name: str
    source: str
    occurred_at: str
    priority: int
    title: str
    summary: str
    raw_payload: Dict[str, Any]
    dedupe_key: str

    def to_record(self) -> Dict[str, Any]:
        record = asdict(self)
        record["raw_payload"] = safe_json_dumps(self.raw_payload)
        return record


class MonitorStateStore:
    """使用 SQLite 保存监控状态。"""

    def __init__(self, db_path: str):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS alert_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    stock_code TEXT NOT NULL,
                    stock_name TEXT NOT NULL,
                    source TEXT,
                    occurred_at TEXT NOT NULL,
                    priority INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    raw_payload TEXT NOT NULL,
                    dedupe_key TEXT NOT NULL UNIQUE,
                    pushed INTEGER NOT NULL DEFAULT 0,
                    push_status TEXT NOT NULL DEFAULT 'pending',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS fund_flow_snapshots (
                    stock_code TEXT PRIMARY KEY,
                    snapshot_at TEXT NOT NULL,
                    main_net_inflow REAL NOT NULL,
                    main_net_ratio REAL NOT NULL,
                    raw_payload TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS monitor_status (
                    status_key TEXT PRIMARY KEY,
                    status_value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )

    def has_alert(self, dedupe_key: str) -> bool:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT 1 FROM alert_events WHERE dedupe_key = ? LIMIT 1",
                (dedupe_key,),
            ).fetchone()
        return row is not None

    def has_sent_alert(self, dedupe_key: str) -> bool:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT 1 FROM alert_events WHERE dedupe_key = ? AND pushed = 1 LIMIT 1",
                (dedupe_key,),
            ).fetchone()
        return row is not None

    def record_alert(self, event: AlertEvent, pushed: bool, push_status: str) -> None:
        record = event.to_record()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO alert_events (
                    event_type, stock_code, stock_name, source, occurred_at,
                    priority, title, summary, raw_payload, dedupe_key,
                    pushed, push_status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(dedupe_key) DO UPDATE SET
                    pushed = excluded.pushed,
                    push_status = excluded.push_status,
                    created_at = excluded.created_at
                WHERE alert_events.pushed = 0 AND excluded.pushed = 1
                """,
                (
                    record["event_type"],
                    record["stock_code"],
                    record["stock_name"],
                    record["source"],
                    record["occurred_at"],
                    record["priority"],
                    record["title"],
                    record["summary"],
                    record["raw_payload"],
                    record["dedupe_key"],
                    1 if pushed else 0,
                    push_status,
                    utcnow_text(),
                ),
            )

    def get_last_fund_flow_snapshot(self, stock_code: str) -> Optional[Dict[str, Any]]:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT stock_code, snapshot_at, main_net_inflow, main_net_ratio, raw_payload
                FROM fund_flow_snapshots
                WHERE stock_code = ?
                """,
                (stock_code,),
            ).fetchone()

        if not row:
            return None

        return {
            "stock_code": row["stock_code"],
            "snapshot_at": row["snapshot_at"],
            "main_net_inflow": row["main_net_inflow"],
            "main_net_ratio": row["main_net_ratio"],
            "raw_payload": json.loads(row["raw_payload"]),
        }

    def upsert_fund_flow_snapshot(
        self,
        stock_code: str,
        snapshot_at: str,
        main_net_inflow: float,
        main_net_ratio: float,
        raw_payload: Dict[str, Any],
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO fund_flow_snapshots (
                    stock_code, snapshot_at, main_net_inflow, main_net_ratio, raw_payload
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(stock_code) DO UPDATE SET
                    snapshot_at = excluded.snapshot_at,
                    main_net_inflow = excluded.main_net_inflow,
                    main_net_ratio = excluded.main_net_ratio,
                    raw_payload = excluded.raw_payload
                """,
                (
                    stock_code,
                    snapshot_at,
                    main_net_inflow,
                    main_net_ratio,
                    safe_json_dumps(raw_payload),
                ),
            )

    def set_status(self, status_key: str, status_value: Any) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO monitor_status (status_key, status_value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(status_key) DO UPDATE SET
                    status_value = excluded.status_value,
                    updated_at = excluded.updated_at
                """,
                (status_key, safe_json_dumps(status_value), utcnow_text()),
            )

    def get_status(self) -> Dict[str, Any]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT status_key, status_value, updated_at FROM monitor_status"
            ).fetchall()

        result: Dict[str, Any] = {}
        for row in rows:
            try:
                parsed = json.loads(row["status_value"])
            except json.JSONDecodeError:
                parsed = row["status_value"]
            result[row["status_key"]] = {
                "value": parsed,
                "updated_at": row["updated_at"],
            }
        return result

    def get_recent_alerts(self, limit: int = 20) -> List[Dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT event_type, stock_code, stock_name, source, occurred_at,
                       priority, title, summary, raw_payload, dedupe_key,
                       pushed, push_status, created_at
                FROM alert_events
                ORDER BY occurred_at DESC, id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

        results = []
        for row in rows:
            payload = json.loads(row["raw_payload"])
            results.append(
                {
                    "event_type": row["event_type"],
                    "stock_code": row["stock_code"],
                    "stock_name": row["stock_name"],
                    "source": row["source"],
                    "occurred_at": row["occurred_at"],
                    "priority": row["priority"],
                    "title": row["title"],
                    "summary": row["summary"],
                    "raw_payload": payload,
                    "dedupe_key": row["dedupe_key"],
                    "pushed": bool(row["pushed"]),
                    "push_status": row["push_status"],
                    "created_at": row["created_at"],
                }
            )
        return results


class NewsTracker:
    """个股新闻抓取器。"""

    NOTICE_LOOKBACK_DAYS = 7

    def __init__(self, config=None):
        self.config = config

    def fetch_stock_news(self, stock_code: str, stock_name: str) -> List[Dict[str, Any]]:
        symbol = extract_symbol(stock_code)
        results: List[Dict[str, Any]] = []
        topic_keywords = self._get_topic_keywords(stock_name, stock_code)

        if not is_hk_stock(stock_code):
            primary_sources = [
                (
                    "巨潮资讯公告",
                    lambda: self._fetch_cninfo_notices(symbol),
                    lambda df: self._normalize_news_dataframe(
                        df,
                        stock_name,
                        stock_code,
                        "巨潮资讯公告",
                        topic_keywords,
                        default_relation_type="direct",
                    ),
                ),
                (
                    "东方财富个股新闻",
                    lambda: ak.stock_news_em(symbol=symbol),
                    lambda df: self._normalize_news_dataframe(
                        df,
                        stock_name,
                        stock_code,
                        "东方财富",
                        topic_keywords,
                        default_relation_type="direct",
                    ),
                ),
            ]
            for source_name, fetch_fn, transform_fn in primary_sources:
                results.extend(
                    self._collect_source_items(source_name, stock_name, stock_code, fetch_fn, transform_fn)
                )

        # Market-wide feeds are fallback only; keep topic/name filtering.
        extra_sources = [
            (
                "财联社",
                lambda: ak.stock_info_global_cls(symbol="全部"),
                lambda df: self._filter_market_news(df, stock_name, stock_code, topic_keywords, "财联社"),
            ),
            (
                "财联社快讯",
                lambda: self._fetch_ak_news("stock_news_main_cx"),
                lambda df: self._filter_market_news(df, stock_name, stock_code, topic_keywords, "财联社快讯"),
            ),
            (
                "新浪财经",
                lambda: self._fetch_ak_news("stock_info_global_sina"),
                lambda df: self._filter_market_news(df, stock_name, stock_code, topic_keywords, "新浪财经"),
            ),
            (
                "同花顺",
                lambda: self._fetch_ak_news("stock_info_global_ths"),
                lambda df: self._filter_market_news(df, stock_name, stock_code, topic_keywords, "同花顺"),
            ),
        ]
        for source_name, fetch_fn, transform_fn in extra_sources:
            results.extend(
                self._collect_source_items(source_name, stock_name, stock_code, fetch_fn, transform_fn)
            )

        # Dedupe by (title, stock_code) keeping first occurrence
        seen_keys: set = set()
        deduped: List[Dict[str, Any]] = []
        for item in results:
            key = (normalize_text(item.get("title")), item.get("stock_code", ""))
            if key in seen_keys:
                continue
            seen_keys.add(key)
            deduped.append(item)

        deduped.sort(key=lambda item: item["occurred_at"], reverse=True)
        return deduped

    def _normalize_news_dataframe(
        self,
        data_frame: Optional[pd.DataFrame],
        stock_name: str,
        stock_code: str,
        source_name: str,
        topic_keywords: Sequence[str],
        default_relation_type: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        if data_frame is None or data_frame.empty:
            return []

        normalized: List[Dict[str, Any]] = []
        for row in data_frame.to_dict(orient="records"):
            title = normalize_text(
                get_first_available(row, ["标题", "新闻标题", "公告标题", "title", "新闻内容"])
            )
            content = normalize_text(
                get_first_available(row, ["内容", "新闻内容", "公告内容", "摘要", "content"])
            )
            source = normalize_text(
                get_first_available(row, ["文章来源", "来源", "媒体名称", "公告来源", "source"])
            ) or source_name
            occurred_at = normalize_text(
                get_first_available(row, ["发布时间", "公告时间", "日期", "时间", "datetime", "发布时间戳"])
            ) or utcnow_text()
            url = normalize_text(get_first_available(row, ["新闻链接", "网址", "链接", "url", "article_url"]))
            if not title:
                continue
            relation_type = default_relation_type or self._classify_relation_type(
                stock_name,
                stock_code,
                title,
                content,
                topic_keywords,
            )
            if relation_type == "none":
                continue
            normalized.append(
                {
                    "stock_name": stock_name,
                    "stock_code": stock_code,
                    "title": title,
                    "content": content,
                    "source": source,
                    "occurred_at": occurred_at,
                    "url": url,
                    "relation_type": relation_type,
                    "topic_keywords": list(topic_keywords),
                }
            )
        return normalized

    def _filter_market_news(
        self,
        data_frame: Optional[pd.DataFrame],
        stock_name: str,
        stock_code: str,
        topic_keywords: Sequence[str],
        source_name: str = "财联社",
    ) -> List[Dict[str, Any]]:
        return self._normalize_news_dataframe(
            data_frame,
            stock_name,
            stock_code,
            source_name,
            topic_keywords,
        )

    def _fetch_ak_news(self, func_name: str) -> Optional[pd.DataFrame]:
        """Call akshare news function by name; return DataFrame or None on failure."""
        try:
            fn = getattr(ak, func_name, None)
            if fn is None:
                return None
            result = fn()
            if result is not None and isinstance(result, pd.DataFrame) and not result.empty:
                return result
        except Exception:
            pass
        return None

    def _fetch_cninfo_notices(self, symbol: str) -> Optional[pd.DataFrame]:
        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=self.NOTICE_LOOKBACK_DAYS)).strftime("%Y%m%d")
        return ak.stock_zh_a_disclosure_report_cninfo(
            symbol=symbol,
            market="沪深京",
            start_date=start_date,
            end_date=end_date,
        )

    def _collect_source_items(
        self,
        source_name: str,
        stock_name: str,
        stock_code: str,
        fetch_fn,
        transform_fn,
    ) -> List[Dict[str, Any]]:
        try:
            data_frame = fetch_fn()
        except Exception as exc:
            logger.warning("新闻源接口失败 [%s] %s(%s): %s", source_name, stock_name, stock_code, exc)
            return []

        if data_frame is None or data_frame.empty:
            logger.info("新闻源无结果 [%s] %s(%s)", source_name, stock_name, stock_code)
            return []

        raw_count = len(data_frame)
        items = transform_fn(data_frame)
        if not items:
            logger.info(
                "新闻源被过滤 [%s] %s(%s): 原始 %d 条, 命中 0 条",
                source_name,
                stock_name,
                stock_code,
                raw_count,
            )
            return []

        logger.info(
            "新闻源命中 [%s] %s(%s): 原始 %d 条, 命中 %d 条",
            source_name,
            stock_name,
            stock_code,
            raw_count,
            len(items),
        )
        return items

    def _get_topic_keywords(self, stock_name: str, stock_code: str) -> List[str]:
        keywords = list(DEFAULT_STOCK_TOPIC_KEYWORDS.get(stock_name, []))
        config_keywords = getattr(self.config, "stock_topic_keywords", {}) if self.config else {}
        # Always include global NEWS_KEYWORDS (e.g. 业绩, 回购, 增持) so default config is used
        news_keywords = getattr(self.config, "news_keywords", None) or []
        keywords.extend(news_keywords)

        code_key = normalize_stock_code(stock_code)
        for key in (stock_name, code_key):
            keywords.extend(config_keywords.get(key, []))

        deduped = []
        seen = set()
        for keyword in keywords:
            normalized = normalize_text(keyword)
            if normalized and normalized not in seen:
                deduped.append(normalized)
                seen.add(normalized)
        return deduped

    def _classify_relation_type(
        self,
        stock_name: str,
        stock_code: str,
        title: str,
        content: str,
        topic_keywords: Sequence[str],
    ) -> str:
        haystack = f"{title} {content}".lower()
        direct_terms = [stock_name.lower(), extract_symbol(stock_code).lower(), normalize_stock_code(stock_code).lower()]
        if any(term and term in haystack for term in direct_terms):
            return "direct"
        if any(keyword.lower() in haystack for keyword in topic_keywords):
            return "topic"
        return "none"


class FundFlowTracker:
    """个股资金流追踪器。"""

    def fetch_stock_fund_flow(self, stock_code: str) -> Tuple[Optional[Dict[str, Any]], Optional[pd.DataFrame]]:
        market = infer_market(stock_code)
        symbol = extract_symbol(stock_code)

        if market not in {"sh", "sz"} or not symbol:
            return None, None

        try:
            data_frame = ak.stock_individual_fund_flow(stock=symbol, market=market)
            latest = self._extract_latest_snapshot(data_frame)
            return latest, data_frame
        except Exception as exc:
            logger.warning("获取个股资金流失败 %s: %s", stock_code, exc)
            return None, None

    def fetch_market_rankings(self) -> Dict[str, Dict[str, Any]]:
        try:
            data_frame = ak.stock_fund_flow_individual(symbol="即时")
        except Exception as exc:
            logger.warning("获取全市场资金流排行失败: %s", exc)
            return {}

        if data_frame is None or data_frame.empty:
            return {}

        results: Dict[str, Dict[str, Any]] = {}
        for index, row in enumerate(data_frame.to_dict(orient="records"), start=1):
            code = normalize_text(get_first_available(row, ["股票代码", "代码", "code"]))
            if not code:
                continue
            results[code] = {
                "rank": index,
                "stock_name": normalize_text(get_first_available(row, ["股票简称", "名称", "股票名称"])),
                "main_net_inflow": parse_chinese_number(
                    get_first_available(row, ["主力净流入", "主力净流入-净额", "今日主力净流入-净额"])
                ),
            }
        return results

    def _extract_latest_snapshot(self, data_frame: Optional[pd.DataFrame]) -> Optional[Dict[str, Any]]:
        if data_frame is None or data_frame.empty:
            return None

        latest_row = data_frame.to_dict(orient="records")[-1]
        snapshot_at = normalize_text(get_first_available(latest_row, ["日期", "date", "时间"])) or utcnow_text()
        main_net_inflow = parse_chinese_number(
            get_first_available(
                latest_row,
                [
                    "主力净流入-净额",
                    "主力净流入",
                    "今日主力净流入-净额",
                    "main_net_inflow",
                ],
            )
        )
        main_net_ratio = parse_chinese_number(
            get_first_available(
                latest_row,
                ["主力净占比", "今日主力净占比", "主力净流入-净占比", "main_net_ratio"],
            )
        )

        return {
            "snapshot_at": snapshot_at,
            "main_net_inflow": main_net_inflow,
            "main_net_ratio": main_net_ratio,
            "raw_payload": latest_row,
        }


class HkHotRankTracker:
    """港股热度排行辅助指标。"""

    def fetch_hot_rankings(self) -> List[Dict[str, Any]]:
        try:
            data_frame = ak.stock_hk_hot_rank_em()
        except Exception as exc:
            logger.debug("获取港股热度排行失败(已跳过): %s", exc)
            return []

        if data_frame is None or data_frame.empty:
            return []

        rankings: List[Dict[str, Any]] = []
        for row in data_frame.to_dict(orient="records"):
            raw_code = normalize_text(
                get_first_available(row, ["代码", "股票代码", "证券代码", "symbol", "code"])
            )
            if not raw_code:
                continue

            code = normalize_stock_code(raw_code if ".HK" in raw_code.upper() else f"{raw_code}.HK")
            rank_value = get_first_available(row, ["当前排名", "排名", "rank"])
            try:
                rank = int(float(rank_value))
            except (TypeError, ValueError):
                rank = None

            rankings.append(
                {
                    "stock_code": code,
                    "stock_name": normalize_text(
                        get_first_available(row, ["股票名称", "股票简称", "名称", "name"])
                    ),
                    "rank": rank,
                    "heat": normalize_text(
                        get_first_available(row, ["热度", "人气", "热度值", "最新热度"])
                    ),
                    "rank_change": normalize_text(
                        get_first_available(row, ["排名变化", "排名升降", "change"])
                    ),
                    "raw_payload": row,
                }
            )

        rankings.sort(key=lambda item: item["rank"] if item["rank"] is not None else 999999)
        return rankings


class AlertEngine:
    """统一的告警生成和优先级判断。"""

    def __init__(self, config):
        self.config = config
        self.llm_client: Optional[OpenAI] = None
        if getattr(config, "llm_api_key", None):
            try:
                self.llm_client = OpenAI(api_key=config.llm_api_key, base_url=config.llm_base_url)
            except Exception as exc:
                logger.warning("初始化监控摘要 LLM 失败: %s", exc)

    def build_news_events(
        self,
        stock_name: str,
        stock_code: str,
        news_items: Iterable[Dict[str, Any]],
    ) -> List[AlertEvent]:
        events: List[AlertEvent] = []
        keywords = [keyword.lower() for keyword in self.config.news_keywords]
        min_priority = self.config.alert_min_priority

        for item in news_items:
            title = normalize_text(item.get("title"))
            content = normalize_text(item.get("content"))
            source = normalize_text(item.get("source")) or "未知来源"
            occurred_at = normalize_text(item.get("occurred_at")) or utcnow_text()
            url = normalize_text(item.get("url"))
            keyword_hits = [
                keyword
                for keyword in keywords
                if keyword and (keyword in title.lower() or keyword in content.lower())
            ]
            topic_keyword_hits = [
                keyword
                for keyword in item.get("topic_keywords", [])
                if keyword and (keyword.lower() in title.lower() or keyword.lower() in content.lower())
            ]
            relation_type = item.get("relation_type", "direct")

            priority = 2
            if keyword_hits:
                priority += 2
            if relation_type == "topic":
                priority += 1
            if any(token in title for token in ["停牌", "业绩", "回购", "减持", "增持", "订单", "中标"]):
                priority += 1
            priority = min(priority, 5)

            if priority < min_priority:
                continue

            summary = f"{stock_name} 出现相关新闻，来源 {source}。"
            if keyword_hits:
                summary += f" 命中关键词: {', '.join(keyword_hits)}。"
            if topic_keyword_hits:
                summary += f" 关联主题: {', '.join(topic_keyword_hits)}。"
            if relation_type == "topic":
                summary += " 这是行业/主题关联新闻。"
            if url:
                summary += f" 链接: {url}"
            summary = self._append_ai_summary(summary, title, content)

            dedupe_key = self._build_dedupe_key("news", stock_code, title, occurred_at)
            events.append(
                AlertEvent(
                    event_type="news",
                    stock_code=stock_code,
                    stock_name=stock_name,
                    source=source,
                    occurred_at=occurred_at,
                    priority=priority,
                    title=f"新闻追踪 | {stock_name} | {title}",
                    summary=summary,
                    raw_payload={
                        "title": title,
                        "content": content,
                        "url": url,
                        "keyword_hits": keyword_hits,
                        "topic_keyword_hits": topic_keyword_hits,
                        "relation_type": relation_type,
                        "source": source,
                    },
                    dedupe_key=dedupe_key,
                )
            )

        return events

    def build_fund_flow_event(
        self,
        stock_name: str,
        stock_code: str,
        current_snapshot: Dict[str, Any],
        previous_snapshot: Optional[Dict[str, Any]],
        ranking: Optional[Dict[str, Any]],
    ) -> Optional[AlertEvent]:
        current_flow = float(current_snapshot.get("main_net_inflow", 0.0))
        current_ratio = float(current_snapshot.get("main_net_ratio", 0.0))
        current_at = normalize_text(current_snapshot.get("snapshot_at")) or utcnow_text()

        baseline_flow = 0.0
        if previous_snapshot:
            baseline_flow = float(previous_snapshot.get("main_net_inflow", 0.0))

        delta = current_flow - baseline_flow
        pct_change = 0.0
        if baseline_flow:
            pct_change = abs(delta) / abs(baseline_flow) * 100.0
        elif current_flow:
            pct_change = 100.0

        triggered_reasons: List[str] = []
        priority = 1

        if abs(current_flow) >= self.config.fund_flow_abs_threshold:
            triggered_reasons.append("主力净流入绝对值超过阈值")
            priority += 2
        if pct_change >= self.config.fund_flow_pct_threshold:
            triggered_reasons.append("相对上一轮变化幅度超过阈值")
            priority += 2
        if ranking and ranking.get("rank", 999) <= 20:
            triggered_reasons.append(f"进入全市场资金流前 {ranking['rank']} 名")
            priority += 1

        priority = min(priority, 5)
        if not triggered_reasons or priority < self.config.alert_min_priority:
            return None

        direction = "净流入" if current_flow >= 0 else "净流出"
        ranking_text = ""
        if ranking:
            ranking_text = f" 当前市场排名第 {ranking['rank']}。"

        summary = (
            f"{stock_name} {direction} {current_flow:,.0f}，主力净占比 {current_ratio:.2f}% 。"
            f" 相比上一轮变化 {delta:,.0f} ({pct_change:.2f}%)。"
            f" 触发原因: {'；'.join(triggered_reasons)}。{ranking_text}"
        )
        summary = self._append_ai_summary(summary, stock_name, safe_json_dumps(current_snapshot))

        dedupe_key = self._build_dedupe_key(
            "fund_flow",
            stock_code,
            current_at,
            f"{round(current_flow, 2)}:{round(current_ratio, 2)}",
        )
        return AlertEvent(
            event_type="fund_flow",
            stock_code=stock_code,
            stock_name=stock_name,
            source="东方财富资金流",
            occurred_at=current_at,
            priority=priority,
            title=f"资金流追踪 | {stock_name} | {direction} {current_flow:,.0f}",
            summary=summary,
            raw_payload={
                "current_snapshot": current_snapshot,
                "previous_snapshot": previous_snapshot,
                "ranking": ranking,
                "triggered_reasons": triggered_reasons,
                "delta": delta,
                "pct_change": pct_change,
            },
            dedupe_key=dedupe_key,
        )

    def _build_dedupe_key(self, event_type: str, stock_code: str, *parts: str) -> str:
        raw_value = "|".join([event_type, stock_code, *[normalize_text(part) for part in parts]])
        return hashlib.sha256(raw_value.encode("utf-8")).hexdigest()

    def _append_ai_summary(self, base_summary: str, title: str, content: str) -> str:
        if not self.llm_client:
            return base_summary

        try:
            response = self.llm_client.chat.completions.create(
                model=self.config.llm_model,
                temperature=0.2,
                messages=[
                    {
                        "role": "system",
                        "content": "你是A股盘中监控助手，请用一句中文总结该事件对交易监控的意义，不超过40字。",
                    },
                    {
                        "role": "user",
                        "content": f"标题: {title}\n内容: {content}\n已有摘要: {base_summary}",
                    },
                ],
            )
            ai_text = normalize_text(response.choices[0].message.content)
            if not ai_text:
                return base_summary
            return f"{base_summary}\nAI摘要: {ai_text}"
        except Exception as exc:
            logger.warning("生成 AI 监控摘要失败: %s", exc)
            return base_summary


class MonitorService:
    """独立监控服务。"""

    def __init__(
        self,
        config,
        stock_pool_provider,
        notifier,
        state_store: Optional[MonitorStateStore] = None,
        news_tracker: Optional[NewsTracker] = None,
        fund_flow_tracker: Optional[FundFlowTracker] = None,
        alert_engine: Optional[AlertEngine] = None,
    ):
        self.config = config
        self.stock_pool_provider = stock_pool_provider
        self.notifier = notifier
        self.state_store = state_store or MonitorStateStore(config.monitor_db_path)
        self.news_tracker = news_tracker or NewsTracker(config)
        self.fund_flow_tracker = fund_flow_tracker or FundFlowTracker()
        self.alert_engine = alert_engine or AlertEngine(config)

    def run_forever(self) -> None:
        logger.info("启动实时监控服务，轮询间隔 %s 秒", self.config.monitor_interval_seconds)
        while True:
            self.run_cycle()
            time.sleep(self.config.monitor_interval_seconds)

    def run_cycle(self) -> Dict[str, Any]:
        started_at = utcnow_text()
        stock_pool = self.stock_pool_provider()
        supported, unsupported = self._split_supported_stock_pool(stock_pool)
        partially_supported = {
            name: code for name, code in supported.items() if get_monitor_support_level(code) == "partial"
        }
        fully_supported = {
            name: code for name, code in supported.items() if get_monitor_support_level(code) == "full"
        }

        self.state_store.set_status("last_started_at", started_at)
        self.state_store.set_status("supported_symbols", fully_supported)
        self.state_store.set_status("partially_supported_symbols", partially_supported)
        self.state_store.set_status("unsupported_symbols", unsupported)

        ranking_map = (
            self.fund_flow_tracker.fetch_market_rankings()
            if self.config.fund_flow_tracking_enabled
            else {}
        )

        pushed_count = 0
        generated_count = 0

        try:
            for stock_name, stock_code in supported.items():
                if self.config.news_tracking_enabled:
                    pushed, generated = self._handle_news(stock_name, stock_code)
                    pushed_count += pushed
                    generated_count += generated

                if self.config.fund_flow_tracking_enabled and not is_hk_stock(stock_code):
                    pushed, generated = self._handle_fund_flow(stock_name, stock_code, ranking_map)
                    pushed_count += pushed
                    generated_count += generated

            self.state_store.set_status("last_success_at", utcnow_text())
            self.state_store.set_status("last_error", "")
            self.state_store.set_status(
                "last_cycle_stats",
                {
                "supported_count": len(supported),
                "full_support_count": len(fully_supported),
                "partial_support_count": len(partially_supported),
                "unsupported_count": len(unsupported),
                "generated_alerts": generated_count,
                "pushed_alerts": pushed_count,
                },
            )
            return {
                "supported": supported,
                "unsupported": unsupported,
                "generated_alerts": generated_count,
                "pushed_alerts": pushed_count,
            }
        except Exception as exc:
            logger.exception("监控轮询失败: %s", exc)
            self.state_store.set_status("last_error", str(exc))
            raise

    def _handle_news(self, stock_name: str, stock_code: str) -> Tuple[int, int]:
        news_items = self.news_tracker.fetch_stock_news(stock_code, stock_name)
        events = self.alert_engine.build_news_events(stock_name, stock_code, news_items)
        return self._dispatch_events(events)

    def _handle_fund_flow(
        self,
        stock_name: str,
        stock_code: str,
        ranking_map: Dict[str, Dict[str, Any]],
    ) -> Tuple[int, int]:
        snapshot, data_frame = self.fund_flow_tracker.fetch_stock_fund_flow(stock_code)
        if not snapshot:
            return 0, 0

        previous_snapshot = self.state_store.get_last_fund_flow_snapshot(stock_code)
        if not previous_snapshot and data_frame is not None and len(data_frame) > self.config.fund_flow_lookback_period:
            baseline_row = data_frame.to_dict(orient="records")[-self.config.fund_flow_lookback_period - 1]
            previous_snapshot = {
                "snapshot_at": normalize_text(
                    get_first_available(baseline_row, ["日期", "date", "时间"])
                ) or utcnow_text(),
                "main_net_inflow": parse_chinese_number(
                    get_first_available(
                        baseline_row,
                        ["主力净流入-净额", "主力净流入", "今日主力净流入-净额", "main_net_inflow"],
                    )
                ),
                "main_net_ratio": parse_chinese_number(
                    get_first_available(
                        baseline_row,
                        ["主力净占比", "今日主力净占比", "主力净流入-净占比", "main_net_ratio"],
                    )
                ),
                "raw_payload": baseline_row,
            }
        ranking = ranking_map.get(extract_symbol(stock_code))
        event = self.alert_engine.build_fund_flow_event(
            stock_name,
            stock_code,
            snapshot,
            previous_snapshot,
            ranking,
        )
        self.state_store.upsert_fund_flow_snapshot(
            stock_code=stock_code,
            snapshot_at=snapshot["snapshot_at"],
            main_net_inflow=float(snapshot["main_net_inflow"]),
            main_net_ratio=float(snapshot["main_net_ratio"]),
            raw_payload=snapshot["raw_payload"],
        )
        if not event:
            return 0, 0
        return self._dispatch_events([event])

    def _dispatch_events(self, events: Sequence[AlertEvent]) -> Tuple[int, int]:
        pushed_count = 0
        generated_count = 0
        for event in events:
            if self.state_store.has_sent_alert(event.dedupe_key):
                continue
            generated_count += 1
            pushed = self.notifier.send_alert_event(event, self.config.monitor_push_methods)
            self.state_store.record_alert(
                event=event,
                pushed=pushed,
                push_status="sent" if pushed else "failed",
            )
            if pushed:
                pushed_count += 1
        return pushed_count, generated_count

    def _split_supported_stock_pool(
        self,
        stock_pool: Dict[str, str],
    ) -> Tuple[Dict[str, str], Dict[str, str]]:
        supported: Dict[str, str] = {}
        unsupported: Dict[str, str] = {}

        for stock_name, stock_code in stock_pool.items():
            normalized_code = normalize_stock_code(stock_code)
            if is_supported_monitor_stock(normalized_code):
                supported[stock_name] = normalized_code
            else:
                unsupported[stock_name] = normalized_code

        return supported, unsupported
