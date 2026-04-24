from types import SimpleNamespace
from datetime import datetime, timezone

from fastapi.testclient import TestClient
import pandas as pd

import api.services as services_module
from api.main import AgentMemoryStore, _attach_memory_profile, _get_pydantic_agent, _warm_read_caches, agent_service, app, news_service
from api.schemas import (
    AIInsight,
    AgentResponse,
    HotspotDetailResponse,
    HotspotHistoryPoint,
    HotspotItem,
    HotspotRelatedStock,
    GlobalNewsItem,
    ModelOption,
    MarketRegimeResponse,
    NewsItem,
    QuoteSnapshot,
    SignalSummary,
    StrategyCandidate,
    StrategyHolding,
    StrategyHoldingAnalysis,
    StrategyHoldingAnalysisResponse,
    StrategyReviewItem,
    StrategyScoreBreakdown,
    StrategyScreenResponse,
    StrategyTodoItem,
    StockAnalysisResponse,
    StockSearchResult,
    UserSettingsResponse,
    WebSearchResult,
)
from api.agent_pydantic import AgentOutput, SYSTEM_PROMPT, build_agent_response


client = TestClient(app)


def _make_stock_analysis(code: str, name: str, score: int, signal: str, price: float, change_pct: float) -> StockAnalysisResponse:
    return StockAnalysisResponse(
        stock_name=name,
        stock_code=code,
        market="sh" if code.startswith("sh") else "sz",
        quote=QuoteSnapshot(
            stock_name=name,
            stock_code=code,
            current_price=price,
            change=round(price * change_pct / 100, 2),
            change_pct=change_pct,
            open_price=price - 0.3,
            high_price=price + 0.5,
            low_price=price - 0.6,
            volume=123456,
            amplitude_pct=4.6,
            timestamp=datetime.now(timezone.utc),
        ),
        technical_indicators={"RSI": 58.0, "MACD": 0.42},
        signal_summary=SignalSummary(overall_score=score, overall_signal=signal, categories={}),
        technical_commentary=["均线多头排列", "量能平稳"],
        ai_insight=AIInsight(enabled=False),
        chart_series=[],
        metadata={},
    )


def test_search_endpoint(monkeypatch):
    monkeypatch.setattr(
        "api.main.stock_service.search_stocks",
        lambda q, max_results=10: [
            StockSearchResult(
                name="招商银行",
                code="sh600036",
                market="A股-上海",
                category="银行",
                score=95,
                match_type="exact_name",
            )
        ],
    )
    response = client.get("/api/stocks/search", params={"q": "招商银行"})
    assert response.status_code == 200
    assert response.json()[0]["code"] == "sh600036"


def test_analysis_endpoint(monkeypatch):
    monkeypatch.setattr(
        "api.main.stock_service.get_stock_analysis",
        lambda code, include_ai=True: StockAnalysisResponse(
            stock_name="招商银行",
            stock_code=code,
            market="sh",
            quote=QuoteSnapshot(
                stock_name="招商银行",
                stock_code=code,
                current_price=42.5,
                change=1.2,
                change_pct=2.9,
                open_price=41.1,
                high_price=42.8,
                low_price=40.9,
                volume=123456,
                amplitude_pct=4.6,
                timestamp=datetime.now(timezone.utc),
            ),
            technical_indicators={"RSI": 58.0, "MACD": 0.42},
            signal_summary=SignalSummary(overall_score=4, overall_signal="看涨", categories={}),
            technical_commentary=["均线多头排列"],
            ai_insight=AIInsight(enabled=False),
            chart_series=[],
            metadata={},
        ),
    )
    response = client.get("/api/stocks/sh600036/analysis")
    assert response.status_code == 200
    payload = response.json()
    assert payload["stock_name"] == "招商银行"
    assert payload["signal_summary"]["overall_score"] == 4


def test_get_settings_endpoint(monkeypatch):
    monkeypatch.setattr(
        "api.main.settings_store.get_settings",
        lambda: UserSettingsResponse(
            llm_model="deepseek-reasoner",
            llm_model_source="user",
            llm_base_url="https://api.deepseek.com",
            llm_configured=True,
            updated_at="2026-03-12T10:00:00+00:00",
            model_options=[
                ModelOption(value="deepseek-chat", label="DeepSeek Chat"),
                ModelOption(value="deepseek-reasoner", label="DeepSeek Reasoner"),
            ],
        ),
    )
    response = client.get("/api/settings")
    assert response.status_code == 200
    payload = response.json()
    assert payload["llm_model"] == "deepseek-reasoner"
    assert payload["model_options"][1]["value"] == "deepseek-reasoner"


def test_update_settings_endpoint(monkeypatch):
    monkeypatch.setattr(
        "api.main.settings_store.update_settings",
        lambda llm_model, llm_base_url=None, llm_api_key=None: UserSettingsResponse(
            llm_model=llm_model,
            llm_model_source="user",
            llm_base_url=llm_base_url or "https://api.deepseek.com",
            llm_configured=True,
            updated_at="2026-03-12T10:05:00+00:00",
            model_options=[ModelOption(value=llm_model, label=llm_model)],
        ),
    )
    response = client.put("/api/settings", json={"llm_model": "deepseek-reasoner"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["llm_model"] == "deepseek-reasoner"
    assert payload["llm_model_source"] == "user"


def test_news_endpoint(monkeypatch):
    monkeypatch.setattr(
        "api.main.news_service.get_stock_news",
        lambda code, limit=20: [
            NewsItem(
                id="1",
                stock_code=code,
                stock_name="招商银行",
                source="测试源",
                published_at="2026-03-08T00:00:00Z",
                title="招商银行回购计划",
                summary="利好消息",
                sentiment="bullish",
                impact_level=4,
                ai_takeaway="偏利好",
            )
        ],
    )
    response = client.get("/api/stocks/sh600036/news")
    assert response.status_code == 200
    assert response.json()[0]["sentiment"] == "bullish"


def test_hotspots_endpoint(monkeypatch):
    monkeypatch.setattr(
        "api.main.hotspot_service.list_hotspots",
        lambda limit=10: [
            HotspotItem(
                topic_name="AI算力",
                heat_score=8,
                reason="多条消息提及",
                related_stocks=[HotspotRelatedStock(stock_name="海光信息", stock_code="sh688041", reason="主题相关")],
                trend_direction="up",
                ai_summary="算力主题升温",
            )
        ],
    )
    response = client.get("/api/hotspots")
    assert response.status_code == 200
    assert response.json()[0]["topic_name"] == "AI算力"


def test_global_news_endpoint(monkeypatch):
    monkeypatch.setattr(
        "api.main.news_service.get_global_news",
        lambda limit=20: [
            GlobalNewsItem(
                id="global-1",
                title="OpenAI 与 Amazon 签下新算力订单",
                summary="科技大厂加码 AI 基础设施。",
                source="财联社",
                published_at="2026-03-08T00:00:00Z",
                category="technology",
                topic="AI与科技巨头",
                impact_level=5,
                related_symbols=["OpenAI", "Amazon"],
            )
        ],
    )
    response = client.get("/api/news/global")
    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["topic"] == "AI与科技巨头"
    assert payload[0]["impact_level"] == 5


def test_web_search_endpoint(monkeypatch):
    monkeypatch.setattr(
        "api.main.web_search_service.search",
        lambda q, limit=8: [
            WebSearchResult(
                id="web-1",
                title="OpenAI signs cloud deal with Amazon",
                snippet="Live web result for AI infrastructure expansion.",
                url="https://example.com/openai-amazon",
                source="example.com",
                provider="duckduckgo_html",
                query=q,
            )
        ],
    )
    response = client.get("/api/web/search", params={"q": "OpenAI Amazon order"})
    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["provider"] == "duckduckgo_html"
    assert payload[0]["url"] == "https://example.com/openai-amazon"


def test_hotspot_detail_endpoint(monkeypatch):
    monkeypatch.setattr(
        "api.main.hotspot_service.get_hotspot_detail",
        lambda topic_name: HotspotDetailResponse(
            topic=HotspotItem(
                topic_name=topic_name,
                heat_score=8,
                reason="多条消息提及",
                related_stocks=[HotspotRelatedStock(stock_name="海光信息", stock_code="sh688041", reason="主题相关")],
                trend_direction="up",
                ai_summary="算力主题升温",
            ),
            related_news=[
                NewsItem(
                    id="news-1",
                    stock_code="sh688041",
                    stock_name="海光信息",
                    source="测试源",
                    published_at="2026-03-08T00:00:00Z",
                    title="海光信息与算力主题相关",
                    summary="消息摘要",
                    sentiment="bullish",
                    impact_level=4,
                )
            ],
            history=[HotspotHistoryPoint(date="2026-03-08", score=8, count=2)],
        ),
    )
    response = client.get("/api/hotspots/AI%E7%AE%97%E5%8A%9B")
    assert response.status_code == 200
    payload = response.json()
    assert payload["topic"]["topic_name"] == "AI算力"
    assert payload["related_news"][0]["stock_code"] == "sh688041"


def test_can_slim_screen_endpoint(monkeypatch):
    monkeypatch.setattr(
        "api.main.strategy_service.screen_can_slim",
        lambda scope="hotspot", topic=None, limit=8: StrategyScreenResponse(
            strategy_key="can_slim",
            scope=scope,
            topic=topic,
            generated_at=datetime.now(timezone.utc),
            candidates=[
                {
                    "strategy_key": "can_slim",
                    "stock_code": "sh688041",
                    "stock_name": "海光信息",
                    "market": "sh",
                    "score": StrategyScoreBreakdown(c=80, a=75, n=88, s=70, l=82, i=68, m=76, total=79.1),
                    "factor_notes": {"c": "动量偏强"},
                    "reasons": ["接近阶段新高"],
                    "risks": ["量能持续性需要确认"],
                    "source_scope": scope,
                    "source_topic": topic,
                    "metadata": {},
                }
            ],
        ),
    )
    response = client.get("/api/strategies/can-slim/screen", params={"scope": "hotspot", "topic": "AI算力"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["strategy_key"] == "can_slim"
    assert payload["candidates"][0]["stock_code"] == "sh688041"


def test_strategy_holdings_endpoints(monkeypatch):
    fixture_holding = StrategyHolding(
        id=1,
        strategy_key="can_slim",
        stock_code="sh688041",
        stock_name="海光信息",
        entry_price=120.5,
        quantity=100,
        entry_date="2026-03-08",
        status="holding",
    )
    fixture_analysis = StrategyHoldingAnalysisResponse(
        total_cost=12050,
        total_market_value=12800,
        total_pnl=750,
        total_pnl_pct=6.22,
        total_realized_pnl=0,
        holding_count=1,
        active_count=1,
        exited_count=0,
        invalidated_count=0,
        win_rate_pct=0,
        average_score=79.1,
        todo_items=[
            StrategyTodoItem(
                holding_id=1,
                stock_code="sh688041",
                stock_name="海光信息",
                status="holding",
                action_label="继续持有",
                action_reason="趋势仍然有效",
                priority=40,
            )
        ],
        review_items=[],
        holdings=[
            StrategyHoldingAnalysis(
                holding=fixture_holding,
                current_price=128,
                market_value=12800,
                pnl=750,
                pnl_pct=6.22,
                realized_pnl=0,
                realized_pnl_pct=0,
                strategy_score=StrategyScoreBreakdown(c=80, a=75, n=88, s=70, l=82, i=68, m=76, total=79.1),
                thesis_status="active",
                factor_notes={"c": "动量偏强"},
                action_label="继续持有",
                action_reason="趋势仍然有效",
                trigger_hits=[],
                alerts=["趋势仍然有效"],
            )
        ],
    )
    monkeypatch.setattr("api.main._require_demo_access", lambda request, feature_name: None)
    monkeypatch.setattr("api.main.strategy_service.list_holdings", lambda: [fixture_holding])
    monkeypatch.setattr("api.main.strategy_service.create_holding", lambda holding: fixture_holding)
    monkeypatch.setattr("api.main.strategy_service.analyze_holdings", lambda: fixture_analysis)
    monkeypatch.setattr("api.main.strategy_service.refresh_holdings", lambda: fixture_analysis)

    list_response = client.get("/api/strategy-holdings")
    assert list_response.status_code == 200
    assert list_response.json()[0]["strategy_key"] == "can_slim"

    create_response = client.post(
        "/api/strategy-holdings",
        json={
            "strategy_key": "can_slim",
            "stock_code": "sh688041",
            "stock_name": "海光信息",
            "entry_price": 120.5,
            "quantity": 100,
            "status": "holding",
        },
    )
    assert create_response.status_code == 201
    assert create_response.json()["stock_code"] == "sh688041"

    analysis_response = client.get("/api/strategy-holdings/analysis")
    assert analysis_response.status_code == 200
    assert analysis_response.json()["holdings"][0]["thesis_status"] == "active"
    assert analysis_response.json()["todo_items"][0]["stock_code"] == "sh688041"

    refresh_response = client.post("/api/strategy-holdings/refresh")
    assert refresh_response.status_code == 200
    assert refresh_response.json()["total_pnl"] == 750


def test_market_regime_endpoint(monkeypatch):
    monkeypatch.setattr(
        "api.main.market_service.get_market_regime",
        lambda: MarketRegimeResponse(
            regime="risk_on",
            score=74.5,
            action_bias="允许跟随主线做多。",
            position_guidance="建议总仓 50%-70%。",
            summary="市场偏进攻。",
            notes=["主要指数大多站上 MA20。"],
            indices=[],
        ),
    )
    response = client.get("/api/market-regime")
    assert response.status_code == 200
    payload = response.json()
    assert payload["regime"] == "risk_on"
    assert payload["score"] == 74.5


def test_strategy_holding_store_normalizes_exit_fields(tmp_path):
    from api.services import StrategyHoldingStore

    store = StrategyHoldingStore(db_path=str(tmp_path / "strategy.db"))
    created = store.create_holding(
        StrategyHolding(
            strategy_key="can_slim",
            stock_code="sh688041",
            stock_name="海光信息",
            entry_price=120.5,
            quantity=100,
            status="exited",
        )
    )

    assert created.exit_price == 120.5
    assert created.exit_date is not None


def test_strategy_holding_store_persists_trade_plan_fields(tmp_path):
    from api.services import StrategyHoldingStore

    store = StrategyHoldingStore(db_path=str(tmp_path / "strategy.db"))
    created = store.create_holding(
        StrategyHolding(
            strategy_key="can_slim",
            stock_code="sh688041",
            stock_name="海光信息",
            entry_price=120.5,
            quantity=100,
            status="planned",
            source_topic="AI算力",
            plan_reason="主线热度高，趋势结构完整。",
            plan_entry_trigger="放量突破前高",
            plan_entry_zone="118.00-122.00",
            plan_stop_loss=111.0,
            plan_take_profit=138.0,
            plan_max_position_pct=15,
        )
    )

    assert created.source_topic == "AI算力"
    assert created.plan_entry_zone == "118.00-122.00"
    assert created.plan_stop_loss == 111.0
    assert created.plan_take_profit == 138.0
    assert created.plan_max_position_pct == 15

    loaded = store.list_holdings()[0]
    assert loaded.plan_reason == "主线热度高，趋势结构完整。"
    assert loaded.status == "planned"


def test_strategy_holdings_analysis_keeps_saved_records_when_quote_fetch_fails(monkeypatch):
    holding = StrategyHolding(
        id=9,
        strategy_key="can_slim",
        stock_code="sh600105",
        stock_name="永鼎股份",
        entry_price=41.4,
        quantity=900,
        status="holding",
    )
    monkeypatch.setattr("api.main._require_demo_access", lambda request, feature_name: None)
    monkeypatch.setattr("api.main.strategy_service.store.list_holdings", lambda: [holding])
    monkeypatch.setattr(
        "api.main.strategy_service.market_service.get_market_regime",
        lambda: MarketRegimeResponse(
            regime="neutral",
            score=50,
            action_bias="轻仓试错。",
            position_guidance="建议控制仓位。",
            summary="市场中性。",
            notes=[],
            indices=[],
        ),
    )

    def raise_unavailable(candidate, scope, topic):
        raise ValueError(f"Unable to fetch stock data for {candidate['code']}")

    monkeypatch.setattr("api.main.strategy_service._score_candidate", raise_unavailable)

    response = client.get("/api/strategy-holdings/analysis")

    assert response.status_code == 200
    payload = response.json()
    assert payload["holding_count"] == 1
    assert payload["holdings"][0]["holding"]["stock_code"] == "sh600105"
    assert payload["holdings"][0]["current_price"] == 41.4
    assert payload["holdings"][0]["action_label"] == "继续持有"
    assert "持仓记录已保存" in payload["holdings"][0]["action_reason"]
    assert "行情暂不可用" in payload["holdings"][0]["alerts"][0]


def test_strategy_holdings_sync_portfolio_snapshot_store(tmp_path):
    from api.services import PortfolioStore, StrategyHoldingStore, StrategyService

    db_path = str(tmp_path / "portfolio.db")
    strategy_store = StrategyHoldingStore(db_path=db_path)
    portfolio_store = PortfolioStore(db_path=db_path)
    service = StrategyService(
        stock_service=SimpleNamespace(),
        news_service=SimpleNamespace(),
        hotspot_service=SimpleNamespace(),
        store=strategy_store,
        portfolio_store=portfolio_store,
    )

    created = service.create_holding(
        StrategyHolding(
            strategy_key="can_slim",
            stock_code="sh603986",
            stock_name="兆易创新",
            entry_price=274.63,
            quantity=1300,
            status="holding",
        )
    )
    positions = portfolio_store.list_positions()
    assert len(positions) == 1
    assert positions[0].stock_code == "sh603986"
    assert positions[0].cost_price == 274.63
    assert positions[0].quantity == 1300

    service.update_holding(
        created.id,
        StrategyHolding(
            strategy_key="can_slim",
            stock_code="sh603986",
            stock_name="兆易创新",
            entry_price=274.63,
            quantity=1300,
            status="planned",
        ),
    )
    assert portfolio_store.list_positions() == []


def test_hotspots_are_news_driven_not_single_stock_topic(monkeypatch):
    services_module._HOTSPOTS_CACHE = None
    services_module._HOTSPOTS_CACHE_TIME = 0
    monkeypatch.setattr("api.main.hotspot_service.state_store.get_recent_alerts", lambda limit=100: [])
    monkeypatch.setattr("api.main.hotspot_service._fetch_hk_rankings_with_timeout", lambda timeout_sec=4.0: [])
    monkeypatch.setattr(
        "api.main.hotspot_service.news_service.get_global_news",
        lambda limit=20: [
            GlobalNewsItem(
                id="global-tech-1",
                title="OpenAI 与 Amazon 扩大算力合作",
                summary="AI 基础设施和芯片需求继续提升。",
                source="财联社",
                published_at="2026-03-12T00:00:00Z",
                category="technology",
                topic="AI与科技巨头",
                impact_level=5,
                related_symbols=["OpenAI", "Amazon", "NVIDIA"],
            )
        ],
    )
    response = client.get("/api/hotspots")
    assert response.status_code == 200
    payload = response.json()
    topic_names = [item["topic_name"] for item in payload]
    assert "科技" in topic_names
    assert "原油" not in topic_names
    assert "油气" not in topic_names


def test_hotspot_related_stocks_stay_inside_sector(monkeypatch):
    services_module._HOTSPOTS_CACHE = None
    services_module._HOTSPOTS_CACHE_TIME = 0
    monkeypatch.setattr("api.main.hotspot_service.state_store.get_recent_alerts", lambda limit=100: [])
    monkeypatch.setattr("api.main.hotspot_service._fetch_hk_rankings_with_timeout", lambda timeout_sec=4.0: [])
    monkeypatch.setattr(
        "api.main.hotspot_service.news_service.get_global_news",
        lambda limit=20: [
            GlobalNewsItem(
                id="global-mixed-1",
                title="OpenAI 与 Amazon 扩大算力合作，中国石油供应链消息同步发酵",
                summary="AI 基础设施和芯片需求继续提升，同时能源供应链也受关注。",
                source="财联社",
                published_at="2026-04-24T00:00:00Z",
                category="technology",
                topic="AI与科技巨头",
                impact_level=5,
                related_symbols=["OpenAI", "Amazon", "NVIDIA", "中国石油", "中国海油"],
            )
        ],
    )
    response = client.get("/api/hotspots")
    assert response.status_code == 200
    technology = next(item for item in response.json() if item["topic_name"] == "科技")
    stock_names = {stock["stock_name"] for stock in technology["related_stocks"]}
    assert "中国石油" not in stock_names
    assert "中国海油" not in stock_names
    assert {"海光信息", "海康威视"} & stock_names


def test_hotspot_related_stocks_dedupe_company_aliases():
    from api.services import HotspotService

    stocks = HotspotService._dedupe_related_stocks(
        [
            HotspotRelatedStock(stock_name="中国海油", stock_code="00883.HK", reason="H股"),
            HotspotRelatedStock(stock_name="中国海洋石油", stock_code="sh600938", reason="A股"),
            HotspotRelatedStock(stock_name="中国石油", stock_code="00857.HK", reason="能源"),
        ],
        limit=5,
    )
    assert [stock.stock_name for stock in stocks] == ["中国海油", "中国石油"]


def test_classify_global_topic_detects_cctv_digest():
    title = (
        "【4月18日《新闻联播》主要内容】今天《新闻联播》主要内容有：1.【新思想引领新征程】"
        "推进数字中国建设 打造高质量发展新引擎； 2.丁薛祥访问土库曼斯坦"
    )
    meta = news_service._classify_global_topic(title, title, "test")
    assert meta["topic"].startswith("国内时政 ·")
    assert "数字中国" in meta["topic"]
    assert meta["category"] == "domestic"
    assert meta["region"] == "asia"


def test_classify_global_topic_plain_openai_still_uses_rules():
    meta = news_service._classify_global_topic(
        "OpenAI 与 Amazon 签下新算力订单",
        "科技大厂加码 AI 基础设施。",
        "test",
    )
    assert meta["topic"] == "AI与科技巨头"


def test_global_news_service_uses_cache(monkeypatch):
    news_service._response_cache.clear()
    call_counter = {"count": 0}

    def fake_fetch(dataset_name):
        call_counter["count"] += 1
        return pd.DataFrame(
            [
                {
                    "标题": f"{dataset_name} OpenAI 扩大算力合作",
                    "摘要": "AI 算力链继续升温",
                    "发布时间": "2026-03-12T00:00:00Z",
                }
            ]
        )

    monkeypatch.setattr("api.main.news_service.tracker._fetch_ak_news", fake_fetch)
    first = news_service.get_global_news(limit=3)
    second = news_service.get_global_news(limit=3)
    assert len(first) == len(second) == 3
    assert call_counter["count"] == 4


def test_global_news_endpoint_supports_etag(monkeypatch):
    monkeypatch.setattr(
        "api.main.news_service.get_global_news",
        lambda limit=20: [
            GlobalNewsItem(
                id="global-etag-1",
                title="OpenAI 与 Amazon 签下新算力订单",
                summary="科技大厂加码 AI 基础设施。",
                source="财联社",
                published_at="2026-03-08T00:00:00Z",
                category="technology",
                topic="AI与科技巨头",
                impact_level=5,
                related_symbols=["OpenAI", "Amazon"],
            )
        ],
    )
    first = client.get("/api/news/global")
    assert first.status_code == 200
    assert "etag" in first.headers
    assert "max-age=60" in first.headers.get("cache-control", "")
    second = client.get("/api/news/global", headers={"If-None-Match": first.headers["etag"]})
    assert second.status_code == 304


def test_warm_read_caches_calls_news_and_hotspots(monkeypatch):
    counters = {"global_news": 0, "hotspots": 0}

    def fake_global_news(limit=20):
        counters["global_news"] += 1
        return []

    def fake_hotspots(limit=10):
        counters["hotspots"] += 1
        return []

    monkeypatch.setattr("api.main.news_service.get_global_news", fake_global_news)
    monkeypatch.setattr("api.main.hotspot_service.list_hotspots", fake_hotspots)
    _warm_read_caches()
    assert counters == {"global_news": 1, "hotspots": 1}


def test_agent_query_supports_chinese_stock_name(monkeypatch):
    agent_service._cache.clear()
    monkeypatch.setattr(
        "api.main.agent_service.stock_service.get_stock_analysis",
        lambda code, include_ai=False: _make_stock_analysis(code, "中国海油", 4, "看涨", 28.6, 1.8),
    )
    response = client.post("/api/agent/query", json={"query": "分析中国海油", "session_id": "test-cn-name"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "stock_analysis"
    assert payload["payload"]["stock_code"] == "sh600938"
    assert payload["payload"]["_meta"]["slots"]["current_stock"]["name"] == "中国海油"
    assert payload["payload"]["_meta"]["rewritten_query"] == "分析中国海油"


def test_agent_query_supports_chinese_alias_name(monkeypatch):
    agent_service._cache.clear()
    monkeypatch.setattr(
        "api.main.agent_service.stock_service.get_stock_analysis",
        lambda code, include_ai=False: _make_stock_analysis(code, "中国海油", 4, "看涨", 28.6, 1.8),
    )
    response = client.post("/api/agent/query", json={"query": "能分析下中国海洋石油吗", "session_id": "test-cn-alias"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "stock_analysis"
    assert payload["payload"]["stock_code"] == "sh600938"
    assert payload["payload"]["stock_name"] == "中国海油"
    assert payload["payload"]["_meta"]["slots"]["current_stock"]["name"] == "中国海油"


def test_agent_query_uses_history_for_sector_comparison(monkeypatch):
    agent_service._cache.clear()

    def fake_get_stock_analysis(code, include_ai=False):
        fixtures = {
            "sh600036": _make_stock_analysis("sh600036", "招商银行", 5, "看涨", 39.5, 1.2),
            "sz000001": _make_stock_analysis("sz000001", "平安银行", 4, "看涨", 12.3, 0.9),
            "sh601398": _make_stock_analysis("sh601398", "工商银行", 4, "看涨", 7.2, 0.8),
            "sh601939": _make_stock_analysis("sh601939", "建设银行", 3, "中性", 8.8, 0.4),
        }
        return fixtures[code]

    monkeypatch.setattr("api.main.agent_service.stock_service.get_stock_analysis", fake_get_stock_analysis)

    response = client.post(
        "/api/agent/query",
        json={
            "query": "对比同板块股票表现",
            "session_id": "test-compare",
            "history": [
                {
                    "role": "agent",
                    "content": "招商银行 当前偏强",
                    "intent": "stock_analysis",
                    "stock_code": "sh600036",
                    "stock_name": "招商银行",
                }
            ],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "stock_comparison"
    assert payload["payload"]["stock_code"] == "sh600036"
    assert payload["payload"]["comparison"]["category"] == "银行"
    assert len(payload["payload"]["comparison"]["items"]) >= 2
    assert payload["payload"]["_meta"]["slots"]["comparison_mode"] == "sector"


def test_agent_query_returns_candidates_for_low_confidence_stock_match(monkeypatch):
    agent_service._cache.clear()

    def fake_search(query, max_results=10):
        return [
            StockSearchResult(
                name="隆基绿能",
                code="sh601012",
                market="A股-上海",
                category="新能源",
                score=62,
                match_type="fuzzy_name",
            )
        ]

    monkeypatch.setattr("api.main.agent_service.stock_service.search_stocks", fake_search)
    response = client.post("/api/agent/query", json={"query": "分析能吗", "session_id": "test-stock-candidates"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "stock_candidates"
    assert payload["payload"]["candidates"][0]["code"] == "sh601012"


def test_agent_query_returns_help_for_capability_questions():
    agent_service._cache.clear()
    response = client.post("/api/agent/query", json={"query": "你能做什么", "session_id": "test-help"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "help"
    assert "当前支持的能力" in payload["summary"]
    assert "分析 sh600036" in payload["actions"]
    assert payload["payload"]["_meta"]["rewritten_query"] == "介绍当前支持的能力和示例用法"


def test_agent_query_returns_model_info_for_model_question():
    agent_service._cache.clear()
    response = client.post("/api/agent/query", json={"query": "你现在用的是什么模型", "session_id": "test-model-info"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "model_info"
    assert payload["payload"]["model"] == agent_service.stock_service._runtime_config().llm_model
    assert "/api/settings" in payload["citations"]


def test_agent_query_prefers_pydantic_agent_when_available(monkeypatch):
    async def fake_run_agent_async(agent, deps, user_query):
        return AgentResponse(
            intent="pydantic_ai_agent",
            summary="## 回答\n- 由 PydanticAI 处理",
            actions=["继续提问"],
            citations=[],
            payload={"echo_query": user_query, "_meta": {"tools_used": [], "cache_hits": []}},
        )

    monkeypatch.setattr("api.main._get_pydantic_agent", lambda: (object(), object()))
    monkeypatch.setattr("api.main.run_agent_async", fake_run_agent_async)
    monkeypatch.setattr("api.main.agent_service.query", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("should not use fallback")))

    response = client.post("/api/agent/query", json={"query": "分析中国海油", "session_id": "test-pydantic-first"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "pydantic_ai_agent"
    assert "当前问题：分析中国海油" in payload["payload"]["echo_query"] or payload["payload"]["echo_query"] == "分析中国海油"


def test_agent_query_falls_back_when_pydantic_agent_fails(monkeypatch):
    async def fake_run_agent_async(agent, deps, user_query):
        raise RuntimeError("llm timeout")

    monkeypatch.setattr("api.main._get_pydantic_agent", lambda: (object(), object()))
    monkeypatch.setattr("api.main.run_agent_async", fake_run_agent_async)
    monkeypatch.setattr(
        "api.main.agent_service.query",
        lambda query, history, memory_profile: AgentResponse(
            intent="help",
            summary="fallback response",
            actions=[],
            citations=[],
            payload={},
        ),
    )

    response = client.post("/api/agent/query", json={"query": "你能做什么", "session_id": "test-pydantic-fallback"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "help"
    assert payload["summary"] == "fallback response"


def test_get_pydantic_agent_rebuilds_when_model_changes(monkeypatch):
    monkeypatch.setattr(
        "api.main.settings_store.build_runtime_config",
        lambda config: SimpleNamespace(
            llm_api_key="test-key",
            llm_base_url="https://api.deepseek.com",
            llm_model="deepseek-chat",
        ),
    )
    created = []

    def fake_create_agent(*, api_key=None, base_url=None, model="deepseek-chat"):
        created.append((api_key, base_url, model))
        return object()

    monkeypatch.setattr("api.main.create_agent", fake_create_agent)
    import api.main as main_module

    main_module._pydantic_agent = None
    main_module._agent_deps = None
    main_module._pydantic_agent_signature = None

    _get_pydantic_agent()

    monkeypatch.setattr(
        "api.main.settings_store.build_runtime_config",
        lambda config: SimpleNamespace(
            llm_api_key="test-key",
            llm_base_url="https://api.deepseek.com",
            llm_model="deepseek-reasoner",
        ),
    )
    _get_pydantic_agent()

    assert created == [
        ("test-key", "https://api.deepseek.com", "deepseek-chat"),
        ("test-key", "https://api.deepseek.com", "deepseek-reasoner"),
    ]


def test_build_agent_response_includes_full_stock_analysis_payload():
    response = build_agent_response(
        AgentOutput(summary="## 回答\n- ok", actions=["继续"]),
        [{"tool": "get_stock_analysis", "data": _make_stock_analysis("sh600036", "招商银行", 4, "看涨", 42.5, 2.9).model_dump(mode="json")}],
    )

    assert response.intent == "pydantic_ai_agent"
    assert response.payload["stock_name"] == "招商银行"
    assert response.payload["market"] == "sh"
    assert response.payload["technical_indicators"]["RSI"] == 58.0
    assert response.payload["ai_insight"]["enabled"] is False
    assert response.payload["chart_series"] == []


def test_build_agent_response_includes_full_portfolio_payload():
    portfolio_data = {
        "total_cost": 100000.0,
        "total_market_value": 108000.0,
        "total_pnl": 8000.0,
        "total_pnl_pct": 8.0,
        "concentration_risk": "medium",
        "technical_risk": "low",
        "rebalance_suggestions": ["控制单一个股仓位"],
        "positions": [],
    }
    response = build_agent_response(
        AgentOutput(summary="## 持仓\n- ok", actions=[]),
        [{"tool": "get_portfolio_analysis", "data": portfolio_data}],
    )

    assert response.payload["total_cost"] == 100000.0
    assert response.payload["concentration_risk"] == "medium"
    assert response.payload["rebalance_suggestions"] == ["控制单一个股仓位"]


def test_pydantic_system_prompt_includes_clarification_and_truthfulness_rules():
    assert "不知道就明确说不知道" in SYSTEM_PROMPT
    assert "先提出一个简短澄清问题" in SYSTEM_PROMPT
    assert "这票怎么样" in SYSTEM_PROMPT
    assert "这个消息利好谁" in SYSTEM_PROMPT
    assert "今天市场怎么看" in SYSTEM_PROMPT


def test_agent_memory_store_supports_pinned_memory_and_goal_state(tmp_path):
    store = AgentMemoryStore(tmp_path / "agent_memory.db")
    store.update_profile(
        "session-goal",
        preferred_market="hk",
        last_stock_code="00700.HK",
        last_stock_name="腾讯控股",
        watchlist=[{"code": "00700.HK", "name": "腾讯控股"}],
        pinned_memory=["偏好港股红利", "长期关注腾讯控股"],
        active_goal="跟踪腾讯控股近期变化",
    )

    profile = store.get_profile("session-goal")
    assert profile["preferred_market"] == "hk"
    assert profile["pinned_memory"] == ["偏好港股红利", "长期关注腾讯控股"]
    assert profile["active_goal"] == "跟踪腾讯控股近期变化"


def test_attach_memory_profile_exposes_pinned_memory_and_goal():
    resp = AgentResponse(intent="help", summary="ok", actions=[], citations=[], payload={})
    enriched = _attach_memory_profile(
        resp,
        {
            "preferred_market": "a_share",
            "last_stock_code": "sh600036",
            "last_stock_name": "招商银行",
            "watchlist": [{"code": "sh600036", "name": "招商银行"}],
            "pinned_memory": ["偏好高股息"],
            "active_goal": "跟踪银行股分化",
        },
    )
    meta = enriched.payload["_meta"]["memory_profile"]
    assert meta["pinned_memory"] == ["偏好高股息"]
    assert meta["active_goal"] == "跟踪银行股分化"
