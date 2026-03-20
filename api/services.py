from __future__ import annotations

import copy
import sqlite3
import time
import re
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlparse
from xml.etree import ElementTree

import pandas as pd
import requests
from bs4 import BeautifulSoup

from api.schemas import (
    AIInsight,
    AgentResponse,
    AgentHistoryTurn,
    GlobalNewsItem,
    HotspotDetailResponse,
    HotspotHistoryPoint,
    HotspotItem,
    HotspotRelatedStock,
    NewsItem,
    PortfolioAnalysisResponse,
    PortfolioPosition,
    PositionAnalysis,
    QuoteSnapshot,
    SignalSummary,
    StockAnalysisResponse,
    StockSearchResult,
    WebSearchResult,
)
from api.settings_store import UserSettingsStore
from ashare.analyzer import StockAnalyzer
from ashare.config import Config, PROJECT_ROOT
from ashare.monitor import HkHotRankTracker, MonitorStateStore, NewsTracker, normalize_text
from ashare.search import stock_searcher
from ashare.signals import SignalAnalyzer
from ashare.stock_pool import infer_market, load_stock_pool, load_stock_topics, normalize_stock_code

ProgressCallback = Callable[[str, int, str, Optional[Dict[str, Any]]], None]


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value is None or pd.isna(value):
            return None
        return float(value)
    except Exception:
        return None


def _parse_number(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace("%", "").replace(",", "")
    if not text:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def _sentiment_from_summary(text: str) -> str:
    lowered = text.lower()
    if any(token in lowered for token in ["利好", "看多", "上涨", "增持", "回购", "突破"]):
        return "bullish"
    if any(token in lowered for token in ["利空", "看空", "下跌", "减持", "风险", "回撤"]):
        return "bearish"
    return "neutral"


GLOBAL_TOPIC_RULES: List[Dict[str, Any]] = [
    {
        "topic": "AI与科技巨头",
        "category": "technology",
        "region": "global",
        "keywords": ["openai", "amazon", "microsoft", "nvidia", "meta", "google", "ai", "chip", "cloud"],
        "major_keywords": ["订单", "合作", "融资", "发布", "算力", "模型", "数据中心", "芯片"],
    },
    {
        "topic": "中东局势与战争",
        "category": "geopolitics",
        "region": "middle_east",
        "keywords": ["iran", "israel", "中东", "伊朗", "以色列", "红海", "war", "strike", "missile"],
        "major_keywords": ["战争", "冲突", "停火", "袭击", "制裁", "军事"],
    },
    {
        "topic": "全球宏观与央行",
        "category": "macro",
        "region": "global",
        "keywords": ["fed", "ecb", "boj", "cpi", "inflation", "rate", "美联储", "通胀", "降息", "加息"],
        "major_keywords": ["非农", "失业", "利率决议", "经济衰退", "关税", "财政刺激"],
    },
    {
        "topic": "能源与大宗商品",
        "category": "energy",
        "region": "global",
        "keywords": ["oil", "gas", "opec", "原油", "天然气", "煤炭", "航运"],
        "major_keywords": ["减产", "增产", "供应中断", "油价", "运价"],
    },
]

HOTSPOT_SECTOR_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "科技": {
        "aliases": ["科技", "ai", "人工智能", "算力", "芯片", "半导体", "云", "cloud", "openai", "nvidia", "amazon", "microsoft"],
        "categories": ["科技", "通信"],
    },
    "金融": {
        "aliases": ["金融", "银行", "保险", "利率", "加息", "降息", "央行", "通胀", "fed", "ecb", "boj", "cpi"],
        "categories": ["银行", "保险"],
    },
    "能源": {
        "aliases": ["能源", "原油", "油气", "石油", "天然气", "煤炭", "opec", "oil", "gas", "石油石化"],
        "categories": ["石油石化"],
    },
    "新能源": {
        "aliases": ["新能源", "光伏", "储能", "锂电", "电池", "风电", "太阳能", "新能源车"],
        "categories": ["新能源", "新能源车"],
    },
    "医药": {
        "aliases": ["医药", "创新药", "医疗", "制药"],
        "categories": ["医药"],
    },
    "消费": {
        "aliases": ["消费", "白酒", "家电", "电商", "免税"],
        "categories": ["白酒", "家电", "消费", "电商"],
    },
}

HOTSPOT_TOPIC_ALIASES: Dict[str, str] = {
    "原油": "能源",
    "油气": "能源",
    "石油": "能源",
    "石油石化": "能源",
    "银行": "金融",
    "保险": "金融",
    "ai与科技巨头": "科技",
    "半导体": "科技",
    "算力": "科技",
}

STOCK_NAME_ALIASES: Dict[str, str] = {
    "中国海洋石油": "中国海油",
    "中国石油天然气": "中国石油",
    "中国石油化工": "中国石化",
}


@dataclass
class AnalyzerBundle:
    analyzer: StockAnalyzer
    analysis: Dict[str, Any]
    signals: Dict[str, Any]
    dataframe: pd.DataFrame
    ai_text: Optional[str]


@dataclass
class IntentRewriteResult:
    intent: str
    rewritten_query: str
    target_stock: Optional[Dict[str, str]]
    wants_live_web: bool
    include_context: bool
    follow_up: bool
    comparison_mode: Optional[str] = None


@dataclass
class ContextSlots:
    current_stock: Optional[Dict[str, str]]
    current_topic: Optional[str]
    current_market_scope: str
    requested_action: str
    comparison_mode: Optional[str]
    time_horizon: str
    follow_up: bool


@dataclass
class StockResolution:
    target: Optional[Dict[str, str]]
    confidence: float
    source: str
    candidates: List[Dict[str, Any]]


class TTLCacheStore:
    def __init__(self):
        self._entries: Dict[str, Tuple[float, Any]] = {}

    def get(self, key: str) -> Optional[Any]:
        entry = self._entries.get(key)
        now = time.time()
        if not entry:
            return None
        expires_at, value = entry
        if expires_at <= now:
            self._entries.pop(key, None)
            return None
        return copy.deepcopy(value)

    def set(self, key: str, value: Any, ttl_seconds: int) -> Any:
        self._entries[key] = (time.time() + ttl_seconds, copy.deepcopy(value))
        return value

    def get_or_set(self, key: str, ttl_seconds: int, factory):
        cached = self.get(key)
        if cached is not None:
            return cached, True
        value = factory()
        self.set(key, value, ttl_seconds)
        return value, False

    def clear(self) -> None:
        self._entries.clear()


class StockAnalysisService:
    def __init__(self, config: Optional[Config] = None, settings_store: Optional[UserSettingsStore] = None):
        self.config = config or Config()
        self.settings_store = settings_store
        self.signal_analyzer = SignalAnalyzer()
        self._response_cache = TTLCacheStore()

    def _runtime_config(self) -> Config:
        if self.settings_store is None:
            return self.config
        return self.settings_store.build_runtime_config(self.config)

    def search_stocks(self, query: str, max_results: int = 10) -> List[StockSearchResult]:
        results = stock_searcher.search_stocks(query, max_results=max_results)
        return [StockSearchResult(**item) for item in results]

    def build_analysis_bundle(
        self,
        stock_code: str,
        include_ai: bool = True,
        progress_callback: Optional[ProgressCallback] = None,
    ) -> AnalyzerBundle:
        normalized = normalize_stock_code(stock_code)
        if progress_callback:
            progress_callback("resolve_stock", 15, f"已确认标的 {normalized}", {"stock_code": normalized})
        info = stock_searcher.get_stock_info(normalized)
        stock_name = info["name"] if info else normalized
        runtime_config = self._runtime_config()
        analyzer = StockAnalyzer(
            stock_info={stock_name: normalized},
            count=runtime_config.data_count,
            config=runtime_config,
            enable_push=False,
        )
        if progress_callback:
            progress_callback("fetch_data", 25, "正在拉取行情数据", {"stock_code": normalized})
        if not analyzer.fetch_data():
            raise ValueError(f"Unable to fetch stock data for {normalized}")
        if progress_callback:
            progress_callback("fetch_data", 35, "行情数据已加载完成", {"stock_code": normalized})
        if not analyzer.calculate_indicators():
            raise ValueError(f"Unable to calculate indicators for {normalized}")
        if progress_callback:
            progress_callback("calculate_indicators", 50, "技术指标计算完成", {"stock_code": normalized})

        analysis = analyzer.analyze_single_stock(normalized)
        dataframe = analysis["processed_data"]
        signals = self.signal_analyzer.analyze_all_signals(dataframe)
        if progress_callback:
            progress_callback("build_analysis", 65, "技术分析结果已整理完成", {"stock_code": normalized})
        ai_text: Optional[str] = None
        if include_ai and analyzer.llm and progress_callback:
            progress_callback("generate_ai_report", 85, "正在生成 AI 分析报告", {"stock_code": normalized})

            def report_ai(progress: int, message: str) -> None:
                progress_callback(
                    "generate_ai_report",
                    max(85, min(99, progress)),
                    message,
                    {"stock_code": normalized},
                )

            ai_text = analyzer.generate_single_stock_analysis(
                stock_name,
                analysis,
                "深度分析",
                progress_callback=report_ai,
            )
            analyzer.llm = None
        if include_ai and analyzer.llm:
            ai_text = analyzer.generate_single_stock_analysis(stock_name, analysis, "深度分析")
        return AnalyzerBundle(
            analyzer=analyzer,
            analysis=analysis,
            signals=signals,
            dataframe=dataframe,
            ai_text=ai_text,
        )

    def get_stock_analysis(
        self,
        stock_code: str,
        include_ai: bool = True,
        progress_callback: Optional[ProgressCallback] = None,
    ) -> StockAnalysisResponse:
        normalized = normalize_stock_code(stock_code)
        runtime_config = self._runtime_config()
        model_cache_key = runtime_config.llm_model if include_ai and runtime_config.llm_api_key else "no-ai"
        cache_key = f"analysis:{normalized}:{int(include_ai)}:{model_cache_key}"
        ttl = 300 if include_ai else 180
        cached = self._response_cache.get(cache_key)
        if cached is not None:
            if progress_callback:
                progress_callback("completed", 100, "命中缓存，分析结果已就绪", {"stock_code": normalized, "cached": True})
            return cached

        bundle = self.build_analysis_bundle(normalized, include_ai=include_ai, progress_callback=progress_callback)
        basic_data = bundle.analysis.get("基础数据", {})
        latest = bundle.dataframe.iloc[-1]
        # K 线图默认展示最近约 5 年日 K（~250 交易日 * 5），方便观察中长期趋势
        chart_df = bundle.dataframe.tail(1250).copy().reset_index()
        chart_series = [
            {
                "date": str(row[chart_df.columns[0]])[:10],
                "open": _safe_float(row.get("open")),
                "high": _safe_float(row.get("high")),
                "low": _safe_float(row.get("low")),
                "close": _safe_float(row.get("close")),
                "volume": _safe_float(row.get("volume")),
            }
            for _, row in chart_df.iterrows()
        ]
        indicators = {
            key: _safe_float(latest.get(key))
            for key in [
                "MA5",
                "MA10",
                "MA20",
                "MA60",
                "RSI",
                "MACD",
                "DIF",
                "DEA",
                "K",
                "D",
                "J",
                "BOLL_UP",
                "BOLL_MID",
                "BOLL_LOW",
            ]
        }
        quote = QuoteSnapshot(
            stock_name=bundle.analysis.get("股票名称", normalize_stock_code(stock_code)),
            stock_code=bundle.analysis.get("股票代码", normalize_stock_code(stock_code)),
            current_price=_parse_number(basic_data.get("最新价格")),
            change=_parse_number(basic_data.get("涨跌")),
            change_pct=_parse_number(basic_data.get("涨跌幅")),
            open_price=_parse_number(basic_data.get("开盘价")),
            high_price=_parse_number(basic_data.get("最高价")),
            low_price=_parse_number(basic_data.get("最低价")),
            volume=_parse_number(basic_data.get("成交量")),
            amplitude_pct=_parse_number(basic_data.get("振幅")),
            timestamp=_now_utc(),
        )
        ai_insight = AIInsight(
            enabled=include_ai and bundle.analyzer.llm is not None,
            content=bundle.ai_text,
            provider=bundle.analyzer.llm_base_url if bundle.analyzer.llm else None,
            model=bundle.analyzer.llm_model if bundle.analyzer.llm else None,
            error=None if bundle.ai_text or bundle.analyzer.llm is None or not include_ai else "AI analysis returned empty content",
        )
        response = StockAnalysisResponse(
            stock_name=quote.stock_name,
            stock_code=quote.stock_code,
            market=infer_market(quote.stock_code),
            quote=quote,
            technical_indicators=indicators,
            signal_summary=SignalSummary(
                overall_score=int(bundle.signals.get("overall_score", 2)),
                overall_signal=str(bundle.signals.get("overall_signal", "中性")),
                categories=bundle.signals,
            ),
            technical_commentary=bundle.analysis.get("技术分析建议", []),
            ai_insight=ai_insight,
            chart_series=chart_series,
            metadata={
                "data_points": len(bundle.dataframe),
                "source": "akshare",
                "generated_at": quote.timestamp.isoformat(),
            },
        )
        self._response_cache.set(cache_key, response, ttl)
        if progress_callback:
            progress_callback("completed", 100, "分析结果已生成", {"stock_code": normalized})
        return response


class NewsService:
    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()
        self.state_store = MonitorStateStore(self.config.monitor_db_path)
        self.tracker = NewsTracker(self.config)
        self._response_cache = TTLCacheStore()

    def get_stock_news(self, stock_code: str, stock_name: Optional[str] = None, limit: int = 20) -> List[NewsItem]:
        normalized = normalize_stock_code(stock_code)
        search_info = stock_searcher.get_stock_info(normalized)
        resolved_name = stock_name or (search_info["name"] if search_info else normalized)
        cache_key = f"stock_news:{normalized}:{resolved_name}:{limit}"
        cached = self._response_cache.get(cache_key)
        if cached is not None:
            return cached

        stored_items = [
            item
            for item in self.state_store.get_recent_alerts(limit=limit * 5)
            if item["stock_code"] == normalized and item["event_type"] == "news"
        ]
        news_items = [self._map_alert_to_news(item) for item in stored_items[:limit]]

        if news_items:
            self._response_cache.set(cache_key, news_items, 120)
            return news_items

        fetched = self.tracker.fetch_stock_news(normalized, resolved_name)
        result = [self._map_fetched_news(normalized, resolved_name, item) for item in fetched[:limit]]
        self._response_cache.set(cache_key, result, 120)
        return result

    def get_global_news(self, limit: int = 20) -> List[GlobalNewsItem]:
        cache_key = f"global_news:{limit}"
        cached = self._response_cache.get(cache_key)
        if cached is not None:
            return cached
        records: List[Dict[str, Any]] = []
        sources = [
            ("财联社", lambda: self.tracker._fetch_ak_news("stock_info_global_cls")),
            ("财联社快讯", lambda: self.tracker._fetch_ak_news("stock_news_main_cx")),
            ("新浪财经", lambda: self.tracker._fetch_ak_news("stock_info_global_sina")),
            ("同花顺", lambda: self.tracker._fetch_ak_news("stock_info_global_ths")),
        ]

        for source_name, fetch_fn in sources:
            try:
                data_frame = fetch_fn()
            except Exception:
                data_frame = None
            try:
                records.extend(self._normalize_global_news_dataframe(data_frame, source_name))
            except Exception:
                pass  # skip this source if normalization fails (e.g. column mismatch)

        if not records:
            try:
                records.extend(self._global_news_from_alerts())
            except Exception:
                pass

        deduped: List[Dict[str, Any]] = []
        seen_keys: set[str] = set()
        for item in sorted(records, key=self._global_news_sort_key, reverse=True):
            title_key = re.sub(r"\W+", "", item.get("title", "").strip().lower())
            url_key = str(item.get("url") or "").strip().lower()
            dedupe_key = url_key or title_key
            if not dedupe_key or dedupe_key in seen_keys:
                continue
            seen_keys.add(dedupe_key)
            deduped.append(item)

        result: List[GlobalNewsItem] = []
        for item in deduped[:limit]:
            try:
                result.append(GlobalNewsItem(**item))
            except Exception:
                pass  # skip invalid item
        self._response_cache.set(cache_key, result, 90)
        return result

    def get_context_news_for_query(self, query: str, limit: int = 6) -> List[GlobalNewsItem]:
        cache_key = f"context_news:{query.strip().lower()}:{limit}"
        cached = self._response_cache.get(cache_key)
        if cached is not None:
            return cached
        lowered = query.lower()
        news = self.get_global_news(limit=30)
        matched = [
            item
            for item in news
            if any(token in lowered for token in self._build_global_query_tokens(item))
        ]
        result = (matched or news)[:limit]
        self._response_cache.set(cache_key, result, 60)
        return result

    def _map_alert_to_news(self, item: Dict[str, Any]) -> NewsItem:
        payload = item.get("raw_payload", {})
        url = payload.get("url") or payload.get("网址")
        return NewsItem(
            id=item["dedupe_key"],
            stock_code=item["stock_code"],
            stock_name=item["stock_name"],
            source=item["source"] or "monitor",
            published_at=item["occurred_at"],
            title=item["title"],
            summary=item["summary"],
            relation_type=payload.get("relation_type", "direct"),
            sentiment=_sentiment_from_summary(item["summary"]),
            impact_level=int(item["priority"]),
            ai_takeaway=item["summary"],
            url=url,
            raw_payload=payload,
        )

    def _map_fetched_news(self, stock_code: str, stock_name: str, item: Dict[str, Any]) -> NewsItem:
        raw = dict(item)
        summary = item.get("content") or item.get("summary") or item.get("title") or ""
        return NewsItem(
            id=f"{stock_code}:{item.get('occurred_at', '')}:{item.get('title', '')}",
            stock_code=stock_code,
            stock_name=stock_name,
            source=item.get("source", "live"),
            published_at=str(item.get("occurred_at", "")),
            title=item.get("title", ""),
            summary=summary[:280],
            relation_type=item.get("relation_type", "direct"),
            sentiment=_sentiment_from_summary(summary),
            impact_level=3 if item.get("relation_type") == "direct" else 2,
            ai_takeaway=summary[:160] if summary else None,
            url=item.get("url"),
            raw_payload=raw,
        )

    def _normalize_global_news_dataframe(self, data_frame: Optional[pd.DataFrame], source_name: str) -> List[Dict[str, Any]]:
        if data_frame is None or data_frame.empty:
            return []

        normalized: List[Dict[str, Any]] = []
        for row in data_frame.to_dict(orient="records"):
            title = normalize_text(
                self._get_first_available(row, ["标题", "新闻标题", "title", "内容", "新闻内容"])
            )
            summary = normalize_text(
                self._get_first_available(row, ["摘要", "内容", "新闻内容", "content"])
            ) or title
            published_at = normalize_text(
                self._get_first_available(row, ["发布时间", "日期", "时间", "datetime"])
            ) or _now_utc().isoformat()
            url = normalize_text(self._get_first_available(row, ["链接", "网址", "url", "新闻链接"]))
            if not title:
                continue
            topic_meta = self._classify_global_topic(title, summary, source_name)
            normalized.append(
                {
                    "id": f"{source_name}:{published_at}:{title}",
                    "title": title,
                    "summary": summary[:280],
                    "source": source_name,
                    "published_at": published_at,
                    "category": topic_meta["category"],
                    "topic": topic_meta["topic"],
                    "region": topic_meta["region"],
                    "sentiment": _sentiment_from_summary(summary),
                    "impact_level": topic_meta["impact_level"],
                    "url": url,
                    "related_symbols": topic_meta["related_symbols"],
                    "raw_payload": dict(row),
                }
            )
        return normalized

    def _global_news_from_alerts(self) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        for alert in self.state_store.get_recent_alerts(limit=120):
            title = alert.get("title", "")
            summary = alert.get("summary", "")
            topic_meta = self._classify_global_topic(title, summary, alert.get("source") or "monitor")
            if topic_meta["impact_level"] < 3:
                continue
            items.append(
                {
                    "id": alert["dedupe_key"],
                    "title": title,
                    "summary": summary[:280],
                    "source": alert.get("source") or "monitor",
                    "published_at": alert.get("occurred_at") or _now_utc().isoformat(),
                    "category": topic_meta["category"],
                    "topic": topic_meta["topic"],
                    "region": topic_meta["region"],
                    "sentiment": _sentiment_from_summary(summary),
                    "impact_level": topic_meta["impact_level"],
                    "url": alert.get("raw_payload", {}).get("url"),
                    "related_symbols": topic_meta["related_symbols"],
                    "raw_payload": alert.get("raw_payload", {}),
                }
            )
        return items

    def _classify_global_topic(self, title: str, summary: str, source_name: str) -> Dict[str, Any]:
        haystack = f"{title} {summary}".lower()
        best_rule = {"topic": "全球市场动态", "category": "general", "region": "global"}
        best_score = 0

        for rule in GLOBAL_TOPIC_RULES:
            score = sum(2 for token in rule["keywords"] if token in haystack)
            score += sum(3 for token in rule["major_keywords"] if token in haystack)
            if score > best_score:
                best_score = score
                best_rule = rule

        impact_level = 2
        if any(token in haystack for token in ["breaking", "突发", "订单", "战争", "停火", "制裁", "加息", "降息"]):
            impact_level += 1
        if best_score >= 4:
            impact_level += 1
        if best_score >= 7:
            impact_level += 1

        related_symbols = []
        for symbol in ["OpenAI", "Amazon", "Microsoft", "NVIDIA", "Iran", "Israel", "OPEC", "Fed"]:
            if symbol.lower() in haystack:
                related_symbols.append(symbol)

        return {
            "topic": best_rule["topic"],
            "category": best_rule["category"],
            "region": best_rule["region"],
            "impact_level": min(impact_level, 5),
            "related_symbols": related_symbols,
            "source_name": source_name,
        }

    def _global_news_sort_key(self, item: Dict[str, Any]) -> tuple:
        return (int(item.get("impact_level", 1)), str(item.get("published_at", "")))

    def _build_global_query_tokens(self, item: GlobalNewsItem) -> List[str]:
        tokens = [item.category.lower(), item.topic.lower(), item.region.lower(), item.title.lower()]
        tokens.extend(symbol.lower() for symbol in item.related_symbols)
        return tokens

    @staticmethod
    def _get_first_available(row: Dict[str, Any], keys: List[str]) -> Any:
        for key in keys:
            value = row.get(key)
            if value is not None and not pd.isna(value) and str(value).strip():
                return value
        return None


class WebSearchService:
    GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"
    DDG_HTML = "https://html.duckduckgo.com/html/"

    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()
        self.timeout = self.config.web_search_timeout
        self.session = requests.Session()
        self._response_cache = TTLCacheStore()
        self.session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
                )
            }
        )

    def search(self, query: str, limit: int = 8) -> List[WebSearchResult]:
        if not self.config.web_search_enabled:
            return []
        cache_key = f"web_search:{query.strip().lower()}:{limit}"
        cached = self._response_cache.get(cache_key)
        if cached is not None:
            return cached

        records: List[WebSearchResult] = []
        records.extend(self._search_google_news(query, limit=limit))
        records.extend(self._search_duckduckgo(query, limit=limit))

        deduped: List[WebSearchResult] = []
        seen_urls: set[str] = set()
        for item in records:
            normalized_url = item.url.strip()
            if not normalized_url or normalized_url in seen_urls:
                continue
            seen_urls.add(normalized_url)
            deduped.append(item)
        result = deduped[:limit]
        self._response_cache.set(cache_key, result, 120)
        return result

    def _search_google_news(self, query: str, limit: int) -> List[WebSearchResult]:
        params = {
            "q": query,
            "hl": "zh-CN",
            "gl": "CN",
            "ceid": "CN:zh-Hans",
        }
        try:
            response = self.session.get(self.GOOGLE_NEWS_RSS, params=params, timeout=self.timeout)
            response.raise_for_status()
            root = ElementTree.fromstring(response.text)
        except Exception:
            return []

        results: List[WebSearchResult] = []
        for item in root.findall("./channel/item")[:limit]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            pub_date = (item.findtext("pubDate") or "").strip() or None
            source = (item.findtext("source") or "Google News").strip()
            description = self._strip_html(item.findtext("description") or "")
            if not title or not link:
                continue
            results.append(
                WebSearchResult(
                    id=f"gnews:{query}:{link}",
                    title=title,
                    snippet=description[:280] or title,
                    url=link,
                    source=source,
                    published_at=pub_date,
                    provider="google_news_rss",
                    query=query,
                )
            )
        return results

    def _search_duckduckgo(self, query: str, limit: int) -> List[WebSearchResult]:
        try:
            response = self.session.get(self.DDG_HTML, params={"q": query}, timeout=self.timeout)
            response.raise_for_status()
        except Exception:
            return []

        soup = BeautifulSoup(response.text, "html.parser")
        results: List[WebSearchResult] = []
        for node in soup.select(".result")[: limit * 2]:
            title_node = node.select_one(".result__title a")
            snippet_node = node.select_one(".result__snippet")
            if title_node is None:
                continue
            title = title_node.get_text(" ", strip=True)
            href = (title_node.get("href") or "").strip()
            snippet = snippet_node.get_text(" ", strip=True) if snippet_node else title
            if not title or not href:
                continue
            source = self._domain_from_url(href)
            results.append(
                WebSearchResult(
                    id=f"ddg:{query}:{href}",
                    title=title,
                    snippet=snippet[:280],
                    url=href,
                    source=source,
                    published_at=None,
                    provider="duckduckgo_html",
                    query=query,
                )
            )
            if len(results) >= limit:
                break
        return results

    @staticmethod
    def _strip_html(value: str) -> str:
        return BeautifulSoup(value, "html.parser").get_text(" ", strip=True)

    @staticmethod
    def _domain_from_url(value: str) -> str:
        try:
            return urlparse(value).netloc or "web"
        except Exception:
            return "web"


_HOTSPOTS_CACHE: Optional[List[HotspotItem]] = None
_HOTSPOTS_CACHE_TIME: float = 0
_HOTSPOTS_CACHE_TTL_SEC = 45
_HK_RANK_DISABLED_UNTIL: float = 0.0
_HK_RANK_COOLDOWN_SEC = 600  # 10 min after a connection failure


class HotspotService:
    def __init__(self, config: Optional[Config] = None, news_service: Optional[NewsService] = None):
        self.config = config or Config()
        self.state_store = MonitorStateStore(self.config.monitor_db_path)
        self.hk_tracker = HkHotRankTracker()
        self.news_service = news_service or NewsService(self.config)
        self._response_cache = TTLCacheStore()

    def _fetch_hk_rankings_with_timeout(self, timeout_sec: float = 4.0) -> List[Dict[str, Any]]:
        global _HK_RANK_DISABLED_UNTIL
        try:
            with ThreadPoolExecutor(max_workers=1) as ex:
                fut = ex.submit(self.hk_tracker.fetch_hot_rankings)
                return fut.result(timeout=timeout_sec)[:10]
        except (FuturesTimeout, Exception):
            _HK_RANK_DISABLED_UNTIL = time.monotonic() + _HK_RANK_COOLDOWN_SEC
            return []

    def _build_sector_map(self) -> Dict[str, Dict[str, Any]]:
        stock_pool = load_stock_pool(self.config.stock_pool_path)
        stock_topics = load_stock_topics(self.config.stock_topics_path)
        sectors: Dict[str, Dict[str, Any]] = {}

        for sector_name, template in HOTSPOT_SECTOR_TEMPLATES.items():
            sector = sectors.setdefault(
                sector_name,
                {
                    "keywords": {sector_name.lower()},
                    "stocks": [],
                },
            )
            sector["keywords"].update(alias.lower() for alias in template.get("aliases", []))
            for stock_name, info in stock_searcher.base_stock_db.items():
                category = str(info.get("category") or "").strip()
                if category not in template.get("categories", []):
                    continue
                stock_code = normalize_stock_code(str(info.get("code") or ""))
                if not stock_code:
                    continue
                sector["keywords"].add(stock_name.lower())
                sector["keywords"].add(stock_code.lower())
                sector["stocks"].append(
                    HotspotRelatedStock(
                        stock_name=stock_name,
                        stock_code=stock_code,
                        reason=f"属于 {sector_name} 代表股",
                    )
                )

        for stock_name, keywords in stock_topics.items():
            stock_code = stock_pool.get(stock_name, normalize_stock_code(stock_name))
            for keyword in keywords:
                sector_name = self._canonical_hotspot_name(str(keyword).strip())
                if not sector_name:
                    continue
                sector = sectors.setdefault(
                    sector_name,
                    {
                        "keywords": {sector_name.lower()},
                        "stocks": [],
                    },
                )
                sector["keywords"].add(stock_name.lower())
                sector["keywords"].add(stock_code.lower())
                sector["stocks"].append(
                    HotspotRelatedStock(
                        stock_name=stock_name,
                        stock_code=stock_code,
                        reason=f"属于 {sector_name} 板块配置",
                    )
                )

        return sectors

    @staticmethod
    def _canonical_hotspot_name(name: str) -> str:
        lowered = name.strip().lower()
        if not lowered:
            return ""
        mapped = HOTSPOT_TOPIC_ALIASES.get(lowered)
        if mapped:
            return mapped
        return name.strip()

    @staticmethod
    def _dedupe_related_stocks(stocks: List[HotspotRelatedStock], limit: int = 5) -> List[HotspotRelatedStock]:
        deduped: List[HotspotRelatedStock] = []
        seen_codes = set()
        for stock in stocks:
            if not stock.stock_code or stock.stock_code in seen_codes:
                continue
            deduped.append(stock)
            seen_codes.add(stock.stock_code)
            if len(deduped) >= limit:
                break
        return deduped

    @staticmethod
    def _sector_keywords_match(keywords: set[str], *values: str) -> bool:
        haystack = " ".join(value.lower() for value in values if value).strip()
        if not haystack:
            return False
        return any(keyword in haystack for keyword in keywords)

    def list_hotspots(self, limit: int = 10) -> List[HotspotItem]:
        global _HOTSPOTS_CACHE, _HOTSPOTS_CACHE_TIME
        now = time.monotonic()
        if _HOTSPOTS_CACHE is not None and (now - _HOTSPOTS_CACHE_TIME) < _HOTSPOTS_CACHE_TTL_SEC:
            return _HOTSPOTS_CACHE[:limit]

        sectors = self._build_sector_map()
        alerts = self.state_store.get_recent_alerts(limit=100)

        topic_counter: Counter[str] = Counter()
        topic_stocks: Dict[str, List[HotspotRelatedStock]] = defaultdict(list)
        topic_reasons: Dict[str, List[str]] = defaultdict(list)

        for alert in alerts:
            title = alert.get("title", "")
            summary = alert.get("summary", "")
            stock_name = alert.get("stock_name", "")
            stock_code = alert.get("stock_code", "")
            priority = max(1, int(alert.get("priority", 1)))
            for sector_name, sector in sectors.items():
                if not self._sector_keywords_match(sector["keywords"], title, summary, stock_name, stock_code):
                    continue
                topic_counter[sector_name] += priority
                topic_reasons[sector_name].append(title or summary)
                topic_stocks[sector_name].append(
                    HotspotRelatedStock(
                        stock_name=stock_name,
                        stock_code=stock_code,
                        reason=f"最近消息触发: {title[:24]}",
                    )
                )

        for global_news in self.news_service.get_global_news(limit=20):
            for sector_name, sector in sectors.items():
                if not self._sector_keywords_match(
                    sector["keywords"],
                    global_news.title,
                    global_news.summary,
                    global_news.topic,
                    " ".join(global_news.related_symbols),
                ):
                    continue
                topic_counter[sector_name] += max(2, global_news.impact_level)
                topic_reasons[sector_name].append(global_news.title)
                topic_stocks[sector_name].extend(sector["stocks"][:2])

        now_ts = time.monotonic()
        if now_ts >= _HK_RANK_DISABLED_UNTIL:
            for rank in self._fetch_hk_rankings_with_timeout():
                rank_name = str(rank.get("stock_name") or "")
                rank_code = str(rank.get("stock_code") or "")
                for sector_name, sector in sectors.items():
                    if not self._sector_keywords_match(sector["keywords"], rank_name, rank_code):
                        continue
                    topic_counter[sector_name] += 1
                    topic_reasons[sector_name].append(f"热度排名 {rank.get('rank', '未知')}")
                    topic_stocks[sector_name].append(
                        HotspotRelatedStock(
                            stock_name=rank_name or rank_code,
                            stock_code=rank_code,
                            reason=f"热度排名 {rank.get('rank', '未知')}",
                        )
                    )

        items: List[HotspotItem] = []
        build_limit = max(limit, 50)
        for topic_name, score in topic_counter.most_common(build_limit):
            related_stocks = self._dedupe_related_stocks(topic_stocks[topic_name], limit=5)
            if not related_stocks:
                sector = sectors.get(topic_name)
                if sector:
                    related_stocks = self._dedupe_related_stocks(sector["stocks"], limit=5)
            if not related_stocks or score <= 0:
                continue
            sector = sectors.get(topic_name, {"stocks": []})
            top_reason = next((item for item in topic_reasons[topic_name] if item), f"{topic_name} 相关消息密度提升")
            items.append(
                HotspotItem(
                    topic_name=topic_name,
                    heat_score=float(score),
                    reason=f"{top_reason[:40]}，累计热度 {int(score)}",
                    related_stocks=related_stocks,
                    trend_direction="up" if score >= 4 else "flat",
                    ai_summary=f"{topic_name} 近期被多条消息和异动共同触发，可优先跟踪相关代表股。",
                    source="sector_config+monitor+news+hk_rank",
                )
            )
        _HOTSPOTS_CACHE = items
        _HOTSPOTS_CACHE_TIME = time.monotonic()
        return items[: min(limit, len(items))]

    def get_hotspot_detail(self, topic_name: str) -> HotspotDetailResponse:
        cache_key = f"hotspot_detail:{topic_name}"
        cached = self._response_cache.get(cache_key)
        if cached is not None:
            return cached
        topic = next((item for item in self.list_hotspots(limit=50) if item.topic_name == topic_name), None)
        if topic is None:
            raise ValueError(f"Unknown hotspot topic: {topic_name}")

        sectors = self._build_sector_map()
        sector = sectors.get(topic_name, {"keywords": {topic_name.lower()}})
        alerts = self.state_store.get_recent_alerts(limit=200)
        related_codes = {stock.stock_code for stock in topic.related_stocks}
        related_names = {stock.stock_name.lower() for stock in topic.related_stocks}
        related_news: List[NewsItem] = []
        history_bucket: Dict[str, Dict[str, float]] = defaultdict(lambda: {"score": 0.0, "count": 0})

        for alert in alerts:
            title = alert.get("title", "")
            summary = alert.get("summary", "")
            stock_code = alert.get("stock_code", "")
            stock_name = alert.get("stock_name", "")
            occurred_at = str(alert.get("occurred_at", ""))
            day = occurred_at[:10] if occurred_at else "unknown"
            matches_topic = (
                stock_code in related_codes
                or stock_name.lower() in related_names
                or self._sector_keywords_match(sector["keywords"], title, summary, stock_name, stock_code)
            )
            if not matches_topic:
                continue

            related_news.append(
                NewsItem(
                    id=alert["dedupe_key"],
                    stock_code=stock_code,
                    stock_name=stock_name,
                    source=alert.get("source") or "monitor",
                    published_at=occurred_at,
                    title=title,
                    summary=summary,
                    relation_type=alert.get("raw_payload", {}).get("relation_type", "sector"),
                    sentiment=_sentiment_from_summary(summary),
                    impact_level=int(alert.get("priority", 1)),
                    ai_takeaway=summary,
                    url=alert.get("raw_payload", {}).get("url"),
                    raw_payload=alert.get("raw_payload", {}),
                )
            )
            history_bucket[day]["score"] += float(alert.get("priority", 1))
            history_bucket[day]["count"] += 1

        history = [
            HotspotHistoryPoint(date=day, score=value["score"], count=int(value["count"]))
            for day, value in sorted(history_bucket.items(), key=lambda item: item[0], reverse=True)[:7]
        ]

        response = HotspotDetailResponse(
            topic=topic,
            related_news=related_news[:10],
            history=list(reversed(history)),
        )
        self._response_cache.set(cache_key, response, 120)
        return response


class PortfolioStore:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = Path(db_path or PROJECT_ROOT / "data" / "portfolio.db")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _init_db(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS portfolio_positions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stock_code TEXT NOT NULL,
                    stock_name TEXT NOT NULL,
                    cost_price REAL NOT NULL,
                    quantity REAL NOT NULL,
                    weight_pct REAL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def list_positions(self) -> List[PortfolioPosition]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, stock_code, stock_name, cost_price, quantity, weight_pct, created_at, updated_at
                FROM portfolio_positions
                ORDER BY updated_at DESC, id DESC
                """
            ).fetchall()
        return [PortfolioPosition(**dict(row)) for row in rows]

    def create_position(self, position: PortfolioPosition) -> PortfolioPosition:
        now = _now_utc().isoformat()
        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO portfolio_positions (
                    stock_code, stock_name, cost_price, quantity, weight_pct, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    normalize_stock_code(position.stock_code),
                    position.stock_name,
                    position.cost_price,
                    position.quantity,
                    position.weight_pct,
                    now,
                    now,
                ),
            )
            position_id = cursor.lastrowid
        return PortfolioPosition(
            id=position_id,
            stock_code=normalize_stock_code(position.stock_code),
            stock_name=position.stock_name,
            cost_price=position.cost_price,
            quantity=position.quantity,
            weight_pct=position.weight_pct,
            created_at=now,
            updated_at=now,
        )

    def update_position(self, position_id: int, position: PortfolioPosition) -> PortfolioPosition:
        now = _now_utc().isoformat()
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE portfolio_positions
                SET stock_code = ?, stock_name = ?, cost_price = ?, quantity = ?, weight_pct = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    normalize_stock_code(position.stock_code),
                    position.stock_name,
                    position.cost_price,
                    position.quantity,
                    position.weight_pct,
                    now,
                    position_id,
                ),
            )
        return PortfolioPosition(
            id=position_id,
            stock_code=normalize_stock_code(position.stock_code),
            stock_name=position.stock_name,
            cost_price=position.cost_price,
            quantity=position.quantity,
            weight_pct=position.weight_pct,
            updated_at=now,
        )

    def delete_position(self, position_id: int) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM portfolio_positions WHERE id = ?", (position_id,))


class PortfolioService:
    def __init__(self, config: Optional[Config] = None, store: Optional[PortfolioStore] = None):
        self.config = config or Config()
        self.store = store or PortfolioStore()
        self.analysis_service = StockAnalysisService(self.config)

    def list_positions(self) -> List[PortfolioPosition]:
        return self.store.list_positions()

    def create_position(self, position: PortfolioPosition) -> PortfolioPosition:
        return self.store.create_position(position)

    def update_position(self, position_id: int, position: PortfolioPosition) -> PortfolioPosition:
        return self.store.update_position(position_id, position)

    def delete_position(self, position_id: int) -> None:
        self.store.delete_position(position_id)

    def analyze_portfolio(self) -> PortfolioAnalysisResponse:
        positions = self.store.list_positions()
        if not positions:
            return PortfolioAnalysisResponse(
                total_cost=0,
                total_market_value=0,
                total_pnl=0,
                total_pnl_pct=0,
                concentration_risk="no_positions",
                technical_risk="no_positions",
                rebalance_suggestions=["当前没有持仓，可先从单股分析页添加股票后再查看组合建议。"],
                positions=[],
            )

        analyses: List[PositionAnalysis] = []
        total_cost = 0.0
        total_market_value = 0.0
        high_risk_count = 0

        for position in positions:
            stock_analysis = self.analysis_service.get_stock_analysis(position.stock_code)
            current_price = stock_analysis.quote.current_price
            market_value = current_price * position.quantity
            cost = position.cost_price * position.quantity
            pnl = market_value - cost
            pnl_pct = (pnl / cost * 100) if cost else 0
            score = stock_analysis.signal_summary.overall_score
            risk_level = "low" if score >= 4 else "medium" if score >= 2 else "high"
            if risk_level == "high":
                high_risk_count += 1
            suggestion = "继续持有观察" if score >= 3 else "建议降低仓位或设置更紧止损"
            analyses.append(
                PositionAnalysis(
                    position=position,
                    current_price=current_price,
                    market_value=market_value,
                    pnl=pnl,
                    pnl_pct=pnl_pct,
                    risk_level=risk_level,
                    signal_summary=stock_analysis.signal_summary,
                    suggestion=suggestion,
                )
            )
            total_cost += cost
            total_market_value += market_value

        concentration_risk = "high" if len(positions) <= 2 else "medium" if len(positions) <= 5 else "low"
        technical_risk = "high" if high_risk_count >= max(1, len(positions) // 2) else "medium"
        total_pnl = total_market_value - total_cost
        total_pnl_pct = (total_pnl / total_cost * 100) if total_cost else 0
        suggestions = []
        if concentration_risk == "high":
            suggestions.append("组合集中度偏高，建议分散至 3 只以上标的。")
        if technical_risk == "high":
            suggestions.append("高风险信号持仓占比较高，建议优先复核止损位。")
        if not suggestions:
            suggestions.append("当前组合风险可控，建议继续跟踪消息和技术面变化。")

        return PortfolioAnalysisResponse(
            total_cost=total_cost,
            total_market_value=total_market_value,
            total_pnl=total_pnl,
            total_pnl_pct=total_pnl_pct,
            concentration_risk=concentration_risk,
            technical_risk=technical_risk,
            rebalance_suggestions=suggestions,
            positions=analyses,
        )


class AgentService:
    def __init__(
        self,
        stock_service: StockAnalysisService,
        news_service: NewsService,
        hotspot_service: HotspotService,
        portfolio_service: PortfolioService,
        web_search_service: WebSearchService,
    ):
        self.stock_service = stock_service
        self.news_service = news_service
        self.hotspot_service = hotspot_service
        self.portfolio_service = portfolio_service
        self.web_search_service = web_search_service
        self._stock_topics = load_stock_topics(self.stock_service.config.stock_topics_path)
        self._cache: Dict[Tuple[str, str], Tuple[float, Any]] = {}
        self._cache_ttl = {
            "stock_analysis": 120,
            "stock_news": 90,
            "context_news": 90,
            "web_search": 120,
            "hotspots": 60,
            "portfolio": 30,
            "stock_extract": 300,
            "comparison_peers": 300,
        }

    def query(
        self,
        user_query: str,
        history: Optional[List[AgentHistoryTurn]] = None,
        memory_profile: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[ProgressCallback] = None,
    ) -> AgentResponse:
        def report(stage: str, progress_pct: int, message: str, meta: Optional[Dict[str, Any]] = None) -> None:
            if progress_callback:
                progress_callback(stage, progress_pct, message, meta)

        def report_tool_start(progress_pct: int, message: str, tool: str) -> None:
            report("tool_running", progress_pct, message, {"tool": tool})

        def report_tool_done(progress_pct: int, message: str, tool: str, cached: bool = False) -> None:
            report("tool_completed", progress_pct, message, {"tool": tool, "cached": cached})

        query = user_query.strip()
        history = history or []
        memory_profile = memory_profile or {}
        tools_used: List[str] = []
        cache_hits: List[str] = []
        report("understand_query", 5, "已接收问题，开始理解查询意图")
        report("load_memory", 15, "已加载会话记忆与历史上下文")
        context_target = self._extract_stock_from_history(history, memory_profile)
        target: Optional[Dict[str, str]] = None
        stock_resolution: Optional[StockResolution] = None
        if self._should_extract_stock(query, history, memory_profile):
            report("tool_running", 35, "正在识别股票目标", {"tool": "search_stocks"})
            stock_resolution, search_cached = self._cached_call(
                "stock_extract",
                query,
                self._resolve_stock_from_query,
                query,
                history,
                memory_profile,
            )
            tools_used.append("search_stocks")
            if search_cached:
                cache_hits.append("search_stocks")
            report(
                "tool_completed",
                45,
                "股票目标识别完成",
                {"tool": "search_stocks", "cached": search_cached},
            )
            if stock_resolution and stock_resolution.confidence >= 0.85:
                target = stock_resolution.target
        rewrite = self._rewrite_query(query, history, memory_profile, target or context_target)
        slots = self._build_context_slots(query, rewrite, history, memory_profile)
        report("select_engine", 25, "已完成意图路由，准备执行对应分析")

        if rewrite.intent == "help":
            return AgentResponse(
                intent="help",
                summary=(
                    "## 当前支持的能力\n"
                    "- 单股分析：输入股票代码或名称，查看技术面判断\n"
                    "- 个股消息：查看某只股票最近消息面变化\n"
                    "- 热点追踪：查看今日热点、全球新闻和科技大事\n"
                    "- 持仓分析：分析当前组合风险、收益和调仓建议\n"
                    "\n## 示例\n"
                    "- 分析 sh600036\n"
                    "- 看看海光信息最近消息\n"
                    "- 今日热点是什么\n"
                    "- 分析我的持仓"
                ),
                actions=[
                    "分析 sh600036",
                    "看看海光信息最近消息",
                    "今日热点是什么",
                    "分析我的持仓",
                ],
                citations=[
                    "/api/stocks/search",
                    "/api/stocks/{code}/analysis",
                    "/api/stocks/{code}/news",
                    "/api/hotspots",
                    "/api/portfolio/analysis",
                ],
                payload={"_meta": self._meta_payload(tools_used, cache_hits, rewrite, slots)},
            )

        if rewrite.intent == "portfolio_analysis":
            report_tool_start(35, "正在获取持仓组合分析", "portfolio_analysis")
            analysis, portfolio_cached = self._cached_call("portfolio", "default", self.portfolio_service.analyze_portfolio)
            tools_used.append("portfolio_analysis")
            if portfolio_cached:
                cache_hits.append("portfolio_analysis")
            report_tool_done(50, "持仓组合分析已完成", "portfolio_analysis", portfolio_cached)
            summary = (
                "## 组合快照\n"
                f"- 总盈亏 {analysis.total_pnl:.2f}，收益率 {analysis.total_pnl_pct:.2f}%\n"
                f"- 集中度风险 {analysis.concentration_risk}，技术风险 {analysis.technical_risk}\n"
                "## 当前判断\n"
                f"- {analysis.rebalance_suggestions[0]}"
            )
            context_news: List[GlobalNewsItem] = []
            if rewrite.include_context:
                context_news, news_cached = self._cached_call(
                    "context_news",
                    f"{rewrite.rewritten_query}|3",
                    self.news_service.get_context_news_for_query,
                    rewrite.rewritten_query,
                    3,
                )
                tools_used.append("global_news")
                if news_cached:
                    cache_hits.append("global_news")
            web_results: List[WebSearchResult] = []
            if rewrite.wants_live_web:
                web_results, web_cached = self._cached_call(
                    "web_search",
                    f"{rewrite.rewritten_query} 全球市场|4",
                    self.web_search_service.search,
                    f"{rewrite.rewritten_query} 全球市场",
                    4,
                )
                tools_used.append("web_search")
                if web_cached:
                    cache_hits.append("web_search")
            if context_news:
                summary += f"\n- 已补充 {len(context_news)} 条全球背景消息"
            if web_results:
                summary += f"\n- 已联网检索 {len(web_results)} 条实时网页结果"
            return AgentResponse(
                intent="portfolio_analysis",
                summary=summary,
                actions=analysis.rebalance_suggestions,
                citations=["/api/portfolio/analysis", "/api/news/global"],
                payload={
                    **analysis.model_dump(),
                    "global_news": [item.model_dump() for item in context_news[:2]],
                    "web_results": [item.model_dump() for item in web_results[:2]],
                    "_meta": self._meta_payload(tools_used, cache_hits, rewrite, slots),
                },
            )

        if rewrite.intent == "hotspot_lookup":
            report_tool_start(35, "正在获取热点列表", "hotspots")
            hotspots, hotspots_cached = self._cached_call("hotspots", "limit=5", self.hotspot_service.list_hotspots, 5)
            tools_used.append("hotspots")
            if hotspots_cached:
                cache_hits.append("hotspots")
            report_tool_done(48, "热点列表已加载", "hotspots", hotspots_cached)
            global_news, news_cached = self._cached_call(
                "context_news",
                f"{rewrite.rewritten_query}|5",
                self.news_service.get_context_news_for_query,
                rewrite.rewritten_query,
                5,
            )
            tools_used.append("global_news")
            if news_cached:
                cache_hits.append("global_news")
            web_results: List[WebSearchResult] = []
            if rewrite.wants_live_web:
                web_results, web_cached = self._cached_call(
                    "web_search",
                    f"{rewrite.rewritten_query}|4",
                    self.web_search_service.search,
                    rewrite.rewritten_query,
                    4,
                )
                tools_used.append("web_search")
                if web_cached:
                    cache_hits.append("web_search")
            hotspot_briefs = self._compress_hotspots(hotspots, limit=2)
            news_briefs = self._compress_global_news(global_news, limit=2)
            web_briefs = self._compress_web_results(web_results, limit=2)
            hotspot_summary = "\n".join(f"- {item['topic']}" for item in hotspot_briefs)
            news_summary = "\n".join(f"- {item['topic']}: {item['title']}" for item in news_briefs)
            web_summary = "\n".join(f"- {item['title']}" for item in web_briefs)
            summary = "## 热点概览\n" + (hotspot_summary or "- 当前暂无可用热点数据")
            if news_summary:
                summary = f"{summary}\n## 背景新闻\n{news_summary}"
            if web_summary:
                summary = f"{summary}\n## 联网补充\n{web_summary}"
            return AgentResponse(
                intent="hotspot_lookup",
                summary=summary,
                actions=["查看热点页获取关联股票后再做单股分析。", "如需单股判断，可继续问：某股票是否受这些全球事件影响？"],
                citations=["/api/hotspots", "/api/news/global", "/api/web/search"],
                payload={
                    "hotspot_briefs": hotspot_briefs,
                    "global_news_briefs": news_briefs,
                    "web_briefs": web_briefs,
                    "_meta": self._meta_payload(tools_used, cache_hits, rewrite, slots),
                },
            )

        if rewrite.intent == "news_lookup":
            target = rewrite.target_stock or context_target
            if not target:
                report_tool_start(40, "正在获取全球重点新闻", "global_news")
                global_news, news_cached = self._cached_call(
                    "context_news",
                    f"{rewrite.rewritten_query}|6",
                    self.news_service.get_context_news_for_query,
                    rewrite.rewritten_query,
                    6,
                )
                tools_used.append("global_news")
                if news_cached:
                    cache_hits.append("global_news")
                report_tool_done(58, "全球重点新闻已加载", "global_news", news_cached)
                web_results: List[WebSearchResult] = []
                if rewrite.wants_live_web:
                    web_results, web_cached = self._cached_call(
                        "web_search",
                        f"{rewrite.rewritten_query}|4",
                        self.web_search_service.search,
                        rewrite.rewritten_query,
                        4,
                    )
                    tools_used.append("web_search")
                    if web_cached:
                        cache_hits.append("web_search")
                news_briefs = self._compress_global_news(global_news, limit=3)
                web_briefs = self._compress_web_results(web_results, limit=2)
                summary = (
                    "## 今日消息\n" + "\n".join([f"- {item['topic']}: {item['title']}" for item in news_briefs])
                    if news_briefs
                    else "## 今日消息\n- 当前没有抓到可用的全球重点新闻"
                )
                if web_briefs:
                    summary = f"{summary}\n## 联网补充\n" + "\n".join(f"- {item['title']}" for item in web_briefs)
                return AgentResponse(
                    intent="web_search_lookup",
                    summary=summary,
                    actions=["继续追问：这些事件利好哪些A股/港股？"],
                    citations=["/api/news/global", "/api/web/search"],
                    payload={
                        "global_news_briefs": news_briefs,
                        "web_briefs": web_briefs,
                        "_meta": self._meta_payload(tools_used, cache_hits, rewrite, slots),
                    },
                )
            report_tool_start(40, f"正在获取 {target['name']} 的个股消息", "stock_news")
            results, stock_news_cached = self._cached_call(
                "stock_news",
                f"{target['code']}|{target['name']}|6",
                self.news_service.get_stock_news,
                target["code"],
                target["name"],
                6,
            )
            tools_used.append("stock_news")
            if stock_news_cached:
                cache_hits.append("stock_news")
            report_tool_done(55, "个股消息已加载", "stock_news", stock_news_cached)
            context_news: List[GlobalNewsItem] = []
            if rewrite.include_context:
                context_news, news_cached = self._cached_call(
                    "context_news",
                    f"{rewrite.rewritten_query}|3",
                    self.news_service.get_context_news_for_query,
                    rewrite.rewritten_query,
                    3,
                )
                tools_used.append("global_news")
                if news_cached:
                    cache_hits.append("global_news")
            web_query = f"{target['name']} {target['code']} 最新新闻"
            web_results: List[WebSearchResult] = []
            if rewrite.wants_live_web or not results:
                web_results, web_cached = self._cached_call("web_search", f"{web_query}|4", self.web_search_service.search, web_query, 4)
                tools_used.append("web_search")
                if web_cached:
                    cache_hits.append("web_search")
            compressed_news = self._compress_stock_news(results, limit=3)
            context_briefs = self._compress_global_news(context_news, limit=2)
            web_briefs = self._compress_web_results(web_results, limit=2)
            summary = (
                f"## {target['name']} 消息面\n"
                + (f"- 最近重点消息 {len(compressed_news)} 条，最新标题：{compressed_news[0]['title']}" if compressed_news else "- 暂无最新消息")
            )
            if compressed_news:
                summary += "\n## 核心催化\n" + "\n".join(f"- {item['title']}：{item['takeaway']}" for item in compressed_news[:2])
            if context_briefs:
                summary += "\n## 背景变量\n" + "\n".join(f"- {item['topic']}：{item['title']}" for item in context_briefs[:2])
            if web_briefs:
                summary += "\n## 联网补充\n" + "\n".join(f"- {item['title']}" for item in web_briefs)
            return AgentResponse(
                intent="news_lookup",
                summary=summary,
                actions=["查看消息页或单股分析页中的相关新闻模块。", "继续问：这只股票是否会受全球局势影响？"],
                citations=[f"/api/stocks/{target['code']}/news", "/api/news/global", "/api/web/search"],
                payload={
                    "stock_code": target["code"],
                    "stock_name": target["name"],
                    "stock": target,
                    "news": [item.model_dump() for item in results[:3]],
                    "news_briefs": compressed_news,
                    "global_news_briefs": context_briefs,
                    "web_briefs": web_briefs,
                    "_meta": self._meta_payload(tools_used, cache_hits, rewrite, slots),
                },
            )

        if rewrite.intent == "web_search_lookup":
            web_results, web_cached = self._cached_call(
                "web_search",
                f"{rewrite.rewritten_query}|4",
                self.web_search_service.search,
                rewrite.rewritten_query,
                4,
            )
            tools_used.append("web_search")
            if web_cached:
                cache_hits.append("web_search")
            if web_results:
                web_briefs = self._compress_web_results(web_results, limit=3)
                summary = "## 联网结果\n" + "\n".join(f"- {item['title']}" for item in web_briefs)
                return AgentResponse(
                    intent="web_search_lookup",
                    summary=summary,
                    actions=["继续追问：这些结果对哪些股票有影响？"],
                    citations=["/api/web/search"],
                    payload={
                        "web_results": [item.model_dump() for item in web_results[:3]],
                        "web_briefs": web_briefs,
                        "_meta": self._meta_payload(tools_used, cache_hits, rewrite, slots),
                    },
                )

        target = rewrite.target_stock or context_target
        if not target and stock_resolution and stock_resolution.candidates:
            candidate_lines = [
                f"- {item['name']} ({item['code']})"
                for item in stock_resolution.candidates[:3]
            ]
            return AgentResponse(
                intent="stock_candidates",
                summary="## 可能的股票目标\n" + "\n".join(candidate_lines),
                actions=["请直接点名股票代码或更完整名称。", "示例: 分析 sh600938", "示例: 分析 中国海油"],
                payload={
                    "candidates": stock_resolution.candidates[:3],
                    "_meta": self._meta_payload(tools_used, cache_hits, rewrite, slots),
                },
            )
        if rewrite.intent == "stock_comparison" and target:
            return self._build_comparison_response(target, rewrite, slots, tools_used, cache_hits)

        if target:
            report_tool_start(40, f"正在获取 {target['name']} 的技术分析", "stock_analysis")
            analysis, analysis_cached = self._cached_call(
                "stock_analysis",
                f"{target['code']}|0",
                self.stock_service.get_stock_analysis,
                target["code"],
                False,
            )
            tools_used.append("stock_analysis")
            if analysis_cached:
                cache_hits.append("stock_analysis")
            report_tool_done(55, "技术分析已加载", "stock_analysis", analysis_cached)
            context_news: List[GlobalNewsItem] = []
            if rewrite.include_context:
                context_news, news_cached = self._cached_call(
                    "context_news",
                    f"{rewrite.rewritten_query}|3",
                    self.news_service.get_context_news_for_query,
                    rewrite.rewritten_query,
                    3,
                )
                tools_used.append("global_news")
                if news_cached:
                    cache_hits.append("global_news")
            web_query = f"{target['name']} {target['code']} 宏观 行业 最新消息"
            web_results: List[WebSearchResult] = []
            if rewrite.wants_live_web:
                web_results, web_cached = self._cached_call("web_search", f"{web_query}|4", self.web_search_service.search, web_query, 4)
                tools_used.append("web_search")
                if web_cached:
                    cache_hits.append("web_search")
            stance = self._signal_to_stance(analysis.signal_summary.overall_score)
            summary = (
                f"## 一句话判断\n"
                f"- {analysis.stock_name} 当前偏{stance}，信号 {analysis.signal_summary.overall_score}/5，最新价 {analysis.quote.current_price:.2f}\n"
                "## 关键点\n"
            )
            key_points = analysis.technical_commentary[:2] or ["当前先看信号修复，再决定是否介入。"]
            summary += "\n".join(f"- {item}" for item in key_points)
            summary += "\n## 风险点\n"
            summary += f"- 需重点防范 {self._risk_hint_from_signal(analysis.signal_summary.overall_score, analysis.signal_summary.overall_signal)}"
            context_briefs = self._compress_global_news(context_news, limit=2)
            web_briefs = self._compress_web_results(web_results, limit=2)
            if context_briefs:
                summary += "\n## 背景变量\n" + "\n".join(f"- {item['topic']}：{item['title']}" for item in context_briefs)
            if web_briefs:
                summary += "\n## 联网补充\n" + "\n".join(f"- {item['title']}" for item in web_briefs)
            actions = ["查看这只股票最新消息", "对比同板块股票表现", "打开完整单股分析页"]
            if not context_briefs and not web_briefs:
                actions = [f"继续问：{target['name']} 最近消息面有什么变化？", "对比同板块股票表现", "打开完整单股分析页"]
            return AgentResponse(
                intent="stock_analysis",
                summary=summary,
                actions=actions,
                citations=[f"/api/stocks/{target['code']}/analysis", "/api/news/global", "/api/web/search"],
                payload={
                    **analysis.model_dump(),
                    "global_news_briefs": context_briefs,
                    "web_briefs": web_briefs,
                    "_meta": self._meta_payload(tools_used, cache_hits, rewrite, slots),
                },
            )

        return AgentResponse(
            intent="unknown",
            summary="没有识别出明确目标。当前支持单股分析、消息查询、热点查看和持仓分析。",
            actions=[
                "示例: 分析 sh600036",
                "示例: 看看海光信息最近消息",
                "示例: 今日热点是什么",
                "示例: 分析我的持仓",
            ],
            payload={"_meta": self._meta_payload(tools_used, cache_hits, rewrite, slots)},
        )

    @staticmethod
    def should_use_fast_path(user_query: str) -> bool:
        query = user_query.strip().lower()
        if not query:
            return True
        explicit_fast = [
            "持仓", "组合", "仓位", "热点", "新闻", "消息", "全球", "宏观", "国际", "科技大事",
            "股票", "个股", "sh", "sz", ".hk", "对比", "同行", "同板块", "板块",
        ]
        if any(token in query for token in explicit_fast):
            return True
        if len(query) <= 24:
            return True
        complex_markers = ["结合", "综合", "同时", "为什么", "逻辑", "推演", "如果", "情景", "多角度"]
        return not any(token in query for token in complex_markers)

    @staticmethod
    def _signal_to_stance(score: int) -> str:
        if score >= 4:
            return "偏强"
        if score <= 2:
            return "偏弱"
        return "中性"

    @staticmethod
    def _risk_hint_from_signal(score: int, signal: str) -> str:
        if score <= 2:
            return "短线继续走弱和跌破支撑的风险"
        if score >= 4:
            return "追高后的回撤风险"
        return f"{signal}状态下方向不明的震荡风险"

    def _cached_call(self, namespace: str, key: str, fn, *args):
        now = time.time()
        cache_key = (namespace, key)
        entry = self._cache.get(cache_key)
        if entry and entry[0] > now:
            return entry[1], True
        value = fn(*args)
        ttl = self._cache_ttl.get(namespace, 60)
        self._cache[cache_key] = (now + ttl, value)
        return value, False

    @staticmethod
    def _meta_payload(
        tools_used: List[str],
        cache_hits: List[str],
        rewrite: Optional[IntentRewriteResult] = None,
        slots: Optional[ContextSlots] = None,
    ) -> Dict[str, Any]:
        unique_tools = list(dict.fromkeys(tools_used))
        unique_cache_hits = list(dict.fromkeys(cache_hits))
        payload = {
            "tools_used": unique_tools,
            "cache_hits": unique_cache_hits,
        }
        if rewrite:
            payload["rewritten_query"] = rewrite.rewritten_query
        if slots:
            payload["slots"] = {
                "current_stock": slots.current_stock,
                "current_topic": slots.current_topic,
                "current_market_scope": slots.current_market_scope,
                "requested_action": slots.requested_action,
                "comparison_mode": slots.comparison_mode,
                "time_horizon": slots.time_horizon,
                "follow_up": slots.follow_up,
            }
        return payload

    def _should_extract_stock(
        self,
        query: str,
        history: Optional[List[AgentHistoryTurn]] = None,
        memory_profile: Optional[Dict[str, Any]] = None,
    ) -> bool:
        lower_query = query.lower()
        if re.search(r"\b(?:sh|sz)\d{6}\b|\b\d{5}\.hk\b", lower_query, re.IGNORECASE):
            return True
        strong_markers = [
            "股票", "个股", "分析", "表现", "走势", "股价", "消息面", "同板块", "同行", "对比", "龙头", "银行股",
        ]
        if any(token in query for token in strong_markers):
            return True
        if self._extract_named_stock_from_text(query):
            return True
        context_target = self._extract_stock_from_history(history or [], memory_profile or {})
        if context_target and any(token in query for token in ["那", "这只", "这家", "它", "继续", "再看", "消息面", "对比", "板块"]):
            return True
        return False

    def _rewrite_query(
        self,
        query: str,
        history: List[AgentHistoryTurn],
        memory_profile: Dict[str, Any],
        target_hint: Optional[Dict[str, str]],
    ) -> IntentRewriteResult:
        lower_query = query.lower()
        follow_up = bool(target_hint) and any(
            token in query for token in ["那", "这只", "这家", "它", "刚才", "继续", "再看", "再比较", "消息面", "同板块"]
        )
        wants_live_web = any(
            token in lower_query for token in ["latest", "breaking", "search", "实时", "最新", "刚刚", "突发", "联网"]
        )
        include_context = any(token in query for token in ["世界", "全球", "宏观", "局势", "国际", "科技大事", "伊朗", "油价"])
        if any(token in lower_query for token in ["help", "what can you do"]) or any(
            token in query for token in ["你能做什么", "你会什么", "怎么用", "如何用", "支持什么", "支持哪些功能", "能做什么", "帮助"]
        ):
            return IntentRewriteResult(
                intent="help",
                rewritten_query="介绍当前支持的能力和示例用法",
                target_stock=None,
                wants_live_web=False,
                include_context=False,
                follow_up=False,
            )
        if any(token in query for token in ["持仓", "组合", "仓位"]):
            return IntentRewriteResult(
                intent="portfolio_analysis",
                rewritten_query="分析当前持仓组合风险与操作建议",
                target_stock=None,
                wants_live_web=wants_live_web,
                include_context=include_context,
                follow_up=False,
            )

        target = target_hint
        if any(token in query for token in ["对比", "比较", "同板块", "同行", "同业", "板块内"]):
            rewritten = query
            if target:
                rewritten = f"对比 {target['name']} 与同板块代表股近期技术表现"
            return IntentRewriteResult(
                intent="stock_comparison",
                rewritten_query=rewritten,
                target_stock=target,
                wants_live_web=wants_live_web,
                include_context=include_context,
                follow_up=follow_up,
                comparison_mode="sector",
            )

        if any(token in query for token in ["热点", "全球新闻", "国际新闻", "世界局势", "科技大事"]):
            rewritten = "梳理今日全球热点和科技大事"
            return IntentRewriteResult(
                intent="hotspot_lookup",
                rewritten_query=rewritten,
                target_stock=None,
                wants_live_web=wants_live_web,
                include_context=True,
                follow_up=False,
            )

        if "消息" in query or "新闻" in query or "消息面" in query:
            rewritten = query
            if target:
                rewritten = f"查看 {target['name']} 最近消息面变化"
            return IntentRewriteResult(
                intent="news_lookup",
                rewritten_query=rewritten,
                target_stock=target,
                wants_live_web=wants_live_web,
                include_context=include_context or ("影响" in query),
                follow_up=follow_up,
            )

        if wants_live_web and not target:
            return IntentRewriteResult(
                intent="web_search_lookup",
                rewritten_query=query,
                target_stock=None,
                wants_live_web=True,
                include_context=include_context,
                follow_up=False,
            )

        if target:
            rewritten = query
            if follow_up and any(token in query for token in ["表现", "怎么样", "走势", "看法"]):
                rewritten = f"分析 {target['name']} 当前技术表现"
            return IntentRewriteResult(
                intent="stock_analysis",
                rewritten_query=rewritten,
                target_stock=target,
                wants_live_web=wants_live_web,
                include_context=include_context,
                follow_up=follow_up,
            )

        return IntentRewriteResult(
            intent="unknown",
            rewritten_query=query,
            target_stock=self._extract_stock_from_history(history, memory_profile),
            wants_live_web=wants_live_web,
            include_context=include_context,
            follow_up=False,
        )

    def _build_context_slots(
        self,
        query: str,
        rewrite: IntentRewriteResult,
        history: List[AgentHistoryTurn],
        memory_profile: Dict[str, Any],
    ) -> ContextSlots:
        current_stock = rewrite.target_stock or self._extract_stock_from_history(history, memory_profile)
        current_market_scope = "global"
        if any(token in query for token in ["A股", "沪深"]):
            current_market_scope = "a_share"
        elif any(token in query for token in ["港股", "HK"]):
            current_market_scope = "hk"
        elif isinstance(memory_profile.get("preferred_market"), str) and memory_profile["preferred_market"]:
            current_market_scope = str(memory_profile["preferred_market"])
        current_topic = self._infer_topic_from_query(query, current_stock)
        time_horizon = "today" if "今日" in query else "recent" if "最近" in query else "short_term" if "短线" in query else "current"
        return ContextSlots(
            current_stock=current_stock,
            current_topic=current_topic,
            current_market_scope=current_market_scope,
            requested_action=rewrite.intent,
            comparison_mode=rewrite.comparison_mode,
            time_horizon=time_horizon,
            follow_up=rewrite.follow_up,
        )

    def _build_comparison_response(
        self,
        target: Dict[str, str],
        rewrite: IntentRewriteResult,
        slots: ContextSlots,
        tools_used: List[str],
        cache_hits: List[str],
    ) -> AgentResponse:
        peers, peers_cached = self._cached_call("comparison_peers", target["code"], self._find_comparison_peers, target)
        tools_used.append("stock_peers")
        if peers_cached:
            cache_hits.append("stock_peers")
        analysis, analysis_cached = self._cached_call(
            "stock_analysis",
            f"{target['code']}|0",
            self.stock_service.get_stock_analysis,
            target["code"],
            False,
        )
        tools_used.append("stock_analysis")
        if analysis_cached:
            cache_hits.append("stock_analysis")

        peer_analyses: List[StockAnalysisResponse] = []
        for peer in peers[:2]:
            item, peer_cached = self._cached_call(
                "stock_analysis",
                f"{peer['code']}|0",
                self.stock_service.get_stock_analysis,
                peer["code"],
                False,
            )
            peer_analyses.append(item)
            tools_used.append("stock_analysis")
            if peer_cached:
                cache_hits.append("stock_analysis")

        all_items = [analysis, *peer_analyses]
        ranked = sorted(all_items, key=lambda item: item.signal_summary.overall_score, reverse=True)
        rank = next((index + 1 for index, item in enumerate(ranked) if item.stock_code == analysis.stock_code), 1)
        category = self._category_for_stock(target) or "同板块"
        comparison_rows = [self._comparison_snapshot(item) for item in all_items]
        summary = (
            "## 对比结论\n"
            f"- {analysis.stock_name} 在 {category} 代表股中信号排名第 {rank}/{len(all_items)}，"
            f"当前 {analysis.signal_summary.overall_score}/5\n"
            "## 横向观察\n"
            + "\n".join(
                f"- {item['stock_name']}：{item['stance']}，信号 {item['score']}/5，涨跌幅 {item['change_pct']:.2f}%"
                for item in comparison_rows
            )
            + "\n## 操作提示\n"
            + f"- 若想继续判断强弱切换，可继续追问：{analysis.stock_name} 和板块龙头相比差在哪？"
        )
        return AgentResponse(
            intent="stock_comparison",
            summary=summary,
            actions=[f"继续问：{analysis.stock_name} 最近消息面有什么变化？", "打开完整单股分析页", "查看这只股票最新消息"],
            citations=[f"/api/stocks/{target['code']}/analysis"],
            payload={
                **analysis.model_dump(),
                "comparison": {
                    "category": category,
                    "items": comparison_rows,
                },
                "_meta": self._meta_payload(tools_used, cache_hits, rewrite, slots),
            },
        )

    def _find_comparison_peers(self, target: Dict[str, str], limit: int = 2) -> List[Dict[str, str]]:
        category = self._category_for_stock(target)
        topics = self._stock_topics.get(target["name"], [])
        candidates: List[Dict[str, str]] = []
        seen_codes = {target["code"]}

        for name, info in stock_searcher.base_stock_db.items():
            code = normalize_stock_code(str(info.get("code", "")))
            if not code or code in seen_codes:
                continue
            if category and info.get("category") == category:
                candidates.append({"name": name, "code": code, "reason": f"同属 {category}"})
                seen_codes.add(code)
            if len(candidates) >= limit:
                return candidates[:limit]

        if topics:
            stock_pool = load_stock_pool()
            for stock_name, stock_topics in self._stock_topics.items():
                code = normalize_stock_code(stock_pool.get(stock_name, ""))
                if not code or code in seen_codes or stock_name == target["name"]:
                    continue
                if set(stock_topics) & set(topics):
                    candidates.append({"name": stock_name, "code": code, "reason": f"同属主题 {stock_topics[0]}"})
                    seen_codes.add(code)
                if len(candidates) >= limit:
                    break
        return candidates[:limit]

    def _category_for_stock(self, target: Dict[str, str]) -> Optional[str]:
        info = stock_searcher.get_stock_info(target["code"])
        if isinstance(info, dict) and info.get("category"):
            return str(info["category"])
        search_results = self.stock_service.search_stocks(target["name"], max_results=1)
        if search_results and search_results[0].category:
            return search_results[0].category
        return None

    def _comparison_snapshot(self, analysis: StockAnalysisResponse) -> Dict[str, Any]:
        return {
            "stock_name": analysis.stock_name,
            "stock_code": analysis.stock_code,
            "score": analysis.signal_summary.overall_score,
            "signal": analysis.signal_summary.overall_signal,
            "stance": self._signal_to_stance(analysis.signal_summary.overall_score),
            "current_price": analysis.quote.current_price,
            "change_pct": analysis.quote.change_pct,
        }

    def _infer_topic_from_query(self, query: str, current_stock: Optional[Dict[str, str]]) -> Optional[str]:
        if any(token in query for token in ["热点", "科技大事"]):
            return "global_hotspot"
        if current_stock and current_stock["name"] in self._stock_topics:
            return self._stock_topics[current_stock["name"]][0]
        if "消息" in query or "新闻" in query:
            return "news"
        if "对比" in query:
            return "comparison"
        return None

    @staticmethod
    def _compress_stock_news(items: List[NewsItem], limit: int = 3) -> List[Dict[str, Any]]:
        return [
            {
                "title": item.title,
                "source": item.source,
                "impact_level": item.impact_level,
                "sentiment": item.sentiment,
                "published_at": item.published_at,
                "takeaway": (item.ai_takeaway or item.summary or item.title)[:72],
                "url": item.url,
            }
            for item in items[:limit]
        ]

    @staticmethod
    def _compress_global_news(items: List[GlobalNewsItem], limit: int = 3) -> List[Dict[str, Any]]:
        return [
            {
                "topic": item.topic,
                "title": item.title,
                "impact_level": item.impact_level,
                "source": item.source,
                "published_at": item.published_at,
            }
            for item in items[:limit]
        ]

    @staticmethod
    def _compress_web_results(items: List[WebSearchResult], limit: int = 2) -> List[Dict[str, Any]]:
        return [
            {
                "title": item.title,
                "source": item.source,
                "url": item.url,
                "published_at": item.published_at,
            }
            for item in items[:limit]
        ]

    @staticmethod
    def _compress_hotspots(items: List[HotspotItem], limit: int = 2) -> List[Dict[str, Any]]:
        return [
            {
                "topic": f"{item.topic_name}（热度 {item.heat_score:.0f}）",
                "lead_stock": item.related_stocks[0].stock_name if item.related_stocks else None,
                "summary": item.ai_summary or item.reason,
            }
            for item in items[:limit]
        ]

    def _extract_named_stock_from_text(self, query: str) -> Optional[Dict[str, str]]:
        for alias, canonical_name in STOCK_NAME_ALIASES.items():
            if alias in query:
                info = stock_searcher.base_stock_db.get(canonical_name)
                if isinstance(info, dict) and info.get("code"):
                    return {"name": canonical_name, "code": normalize_stock_code(str(info["code"]))}
        merged_names: Dict[str, str] = {
            name: info["code"]
            for name, info in stock_searcher.base_stock_db.items()
            if isinstance(info, dict) and info.get("code")
        }
        for name, code in load_stock_pool().items():
            merged_names.setdefault(name, code)
        for name in sorted((item for item in merged_names.keys() if item), key=len, reverse=True):
            if name in query:
                normalized_code = normalize_stock_code(merged_names[name])
                if normalized_code:
                    return {"name": name, "code": normalized_code}
        return None

    def _resolve_stock_from_query(
        self,
        query: str,
        history: Optional[List[AgentHistoryTurn]] = None,
        memory_profile: Optional[Dict[str, Any]] = None,
    ) -> StockResolution:
        history = history or []
        memory_profile = memory_profile or {}
        fallback_candidates: List[Dict[str, Any]] = []
        code_match = re.search(r"\b(?:sh|sz)\d{6}\b|\b\d{5}\.HK\b", query, re.IGNORECASE)
        if code_match:
            code = normalize_stock_code(code_match.group(0))
            info = stock_searcher.get_stock_info(code)
            target = {"name": info["name"] if info else code, "code": code}
            return StockResolution(target=target, confidence=1.0, source="explicit_code", candidates=[target])

        named_match = self._extract_named_stock_from_text(query)
        if named_match:
            return StockResolution(target=named_match, confidence=0.99, source="local_alias", candidates=[named_match])

        direct_results = self.stock_service.search_stocks(query, max_results=3)
        if direct_results:
            candidates = [self._search_result_to_candidate(item) for item in direct_results[:3]]
            fallback_candidates = candidates
            top = direct_results[0]
            top_candidate = candidates[0]
            confidence = self._confidence_from_search_result(query, top)
            margin = top.score - (direct_results[1].score if len(direct_results) > 1 else 0)
            if confidence >= 0.85 and margin >= 8:
                return StockResolution(target=top_candidate, confidence=confidence, source="search_full_query", candidates=candidates)
            if confidence >= 0.95:
                return StockResolution(target=top_candidate, confidence=confidence, source="search_full_query", candidates=candidates)

        cleaned_query = re.sub(r"[，。！？、,.?!:：；;（）()“”\"'‘’]", " ", query)
        cleaned_query = re.sub(
            r"(这只股票|这只|股票|个股|表现|怎么样|最近|帮我|看看|分析|一下|可以吗|好吗|对比|同板块|同行|板块|消息面)",
            " ",
            cleaned_query,
        )
        for token in cleaned_query.split():
            normalized_token = token.strip()
            if len(normalized_token) < 2:
                continue
            if normalized_token in {"能", "下", "吗", "呀", "啊", "吧", "呢"}:
                continue
            results = self.stock_service.search_stocks(token, max_results=3)
            if results:
                top = results[0]
                confidence = self._confidence_from_search_result(normalized_token, top)
                if confidence < 0.9:
                    continue
                candidates = [self._search_result_to_candidate(item) for item in results[:3]]
                return StockResolution(
                    target=candidates[0],
                    confidence=confidence,
                    source="search_token",
                    candidates=candidates,
                )
        history_target = self._extract_stock_from_history(history, memory_profile)
        if history_target:
            return StockResolution(target=history_target, confidence=0.8, source="history", candidates=[history_target])
        return StockResolution(target=None, confidence=0.0, source="none", candidates=fallback_candidates)

    def _extract_stock_from_query(
        self,
        query: str,
        history: Optional[List[AgentHistoryTurn]] = None,
        memory_profile: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, str]]:
        resolution = self._resolve_stock_from_query(query, history, memory_profile)
        if resolution.confidence >= 0.85:
            return resolution.target
        return self._extract_stock_from_history(history or [], memory_profile or {})

    @staticmethod
    def _search_result_to_candidate(item: StockSearchResult) -> Dict[str, Any]:
        return {
            "name": item.name,
            "code": item.code,
            "market": item.market,
            "category": item.category,
            "score": item.score,
            "match_type": item.match_type,
        }

    @staticmethod
    def _confidence_from_search_result(query: str, item: StockSearchResult) -> float:
        normalized_query = query.strip().lower()
        normalized_name = item.name.strip().lower()
        if item.match_type in {"exact_code", "exact_name"}:
            return 0.98
        if normalized_query and normalized_query == normalized_name:
            return 0.96
        if len(normalized_query) >= 4 and normalized_query in normalized_name and item.match_type == "fuzzy_name":
            return 0.88
        if len(normalized_query) >= 3 and item.score >= 90:
            return 0.85
        if item.match_type == "category":
            return 0.35
        return 0.2

    @staticmethod
    def _extract_stock_from_history(history: List[AgentHistoryTurn], memory_profile: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, str]]:
        for turn in reversed(history):
            if turn.stock_code:
                return {
                    "name": turn.stock_name or turn.stock_code,
                    "code": normalize_stock_code(turn.stock_code),
                }
        if memory_profile:
            stock_code = memory_profile.get("last_stock_code")
            if isinstance(stock_code, str) and stock_code:
                stock_name = memory_profile.get("last_stock_name")
                return {
                    "name": str(stock_name) if isinstance(stock_name, str) and stock_name else stock_code,
                    "code": normalize_stock_code(stock_code),
                }
        return None

