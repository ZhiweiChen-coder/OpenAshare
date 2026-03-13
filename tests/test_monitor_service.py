from pathlib import Path

from ashare.monitor import AlertEngine, HkHotRankTracker, MonitorService, MonitorStateStore, NewsTracker
from ashare.stock_pool import (
    get_monitor_support_level,
    load_stock_topics,
    normalize_stock_code,
    save_stock_topics,
)


class DummyConfig:
    llm_api_key = None
    llm_base_url = None
    llm_model = "deepseek-chat"
    monitor_db_path = "data/test_monitor.db"
    monitor_push_methods = ["serverchan"]
    news_keywords = ["回购", "业绩"]
    alert_min_priority = 2
    fund_flow_abs_threshold = 100.0
    fund_flow_pct_threshold = 20.0
    monitor_interval_seconds = 60
    news_tracking_enabled = True
    fund_flow_tracking_enabled = True
    stock_topic_keywords = {
        "中国海油": ["石油", "原油", "国际油价"]
    }


class FakeNotifier:
    def __init__(self):
        self.events = []

    def send_alert_event(self, event, push_methods):
        self.events.append((event, tuple(push_methods)))
        return True


class FakeNewsTracker:
    def __init__(self):
        self.calls = 0

    def fetch_stock_news(self, stock_code, stock_name):
        self.calls += 1
        return [
            {
                "title": f"{stock_name} 发布回购计划",
                "content": "公司公告拟实施回购",
                "source": "测试源",
                "occurred_at": "2026-03-07T10:00:00Z",
                "url": "https://example.com/news",
            }
        ]


class FakeFundFlowTracker:
    def __init__(self):
        self.value = 200.0

    def fetch_market_rankings(self):
        return {"600036": {"rank": 5}}

    def fetch_stock_fund_flow(self, stock_code):
        return (
            {
                "snapshot_at": "2026-03-07T10:05:00Z",
                "main_net_inflow": self.value,
                "main_net_ratio": 12.0,
                "raw_payload": {"日期": "2026-03-07"},
            },
            None,
        )


def test_news_events_use_keyword_priority():
    engine = AlertEngine(DummyConfig())
    events = engine.build_news_events(
        "招商银行",
        "sh600036",
        [
            {
                "title": "招商银行发布回购计划",
                "content": "拟回购股份",
                "source": "测试源",
                "occurred_at": "2026-03-07T10:00:00Z",
                "url": "",
            }
        ],
    )

    assert len(events) == 1
    assert events[0].priority >= 4
    assert "关键词" in events[0].summary


def test_news_tracker_supports_topic_related_market_news():
    import pandas as pd
    import ashare.monitor as monitor_module

    tracker = monitor_module.NewsTracker(DummyConfig())
    market_news = pd.DataFrame(
        [
            {
                "标题": "国际油价上涨带动油气板块走强",
                "内容": "原油与石油板块盘中走高",
                "来源": "测试源",
                "发布时间": "2026-03-07T09:30:00Z",
            }
        ]
    )
    result = tracker._filter_market_news(market_news, "中国海油", "00883.HK", ["石油", "原油"])
    assert len(result) == 1
    assert result[0]["relation_type"] == "topic"


def test_news_tracker_uses_cninfo_notices_as_primary_source(monkeypatch):
    import pandas as pd
    import ashare.monitor as monitor_module

    tracker = NewsTracker(DummyConfig())

    monkeypatch.setattr(
        monitor_module.ak,
        "stock_zh_a_disclosure_report_cninfo",
        lambda **kwargs: pd.DataFrame(
            [
                {
                    "代码": "688041",
                    "简称": "海光信息",
                    "公告标题": "关于回购股份方案的公告",
                    "公告时间": "2026-03-07 09:30:00",
                    "网址": "https://example.com/notice",
                }
            ]
        ),
    )
    monkeypatch.setattr(monitor_module.ak, "stock_news_em", lambda symbol: pd.DataFrame())
    monkeypatch.setattr(monitor_module.ak, "stock_info_global_cls", lambda symbol="全部": pd.DataFrame())
    monkeypatch.setattr(tracker, "_fetch_ak_news", lambda func_name: None)

    result = tracker.fetch_stock_news("sh688041", "海光信息")

    assert len(result) == 1
    assert result[0]["source"] == "巨潮资讯公告"
    assert result[0]["relation_type"] == "direct"


def test_news_tracker_logs_source_failure_no_result_and_filtered(monkeypatch, caplog):
    import pandas as pd
    import ashare.monitor as monitor_module

    tracker = NewsTracker(DummyConfig())

    monkeypatch.setattr(
        monitor_module.ak,
        "stock_zh_a_disclosure_report_cninfo",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    monkeypatch.setattr(monitor_module.ak, "stock_news_em", lambda symbol: pd.DataFrame())
    monkeypatch.setattr(
        monitor_module.ak,
        "stock_info_global_cls",
        lambda symbol="全部": pd.DataFrame(
            [
                {
                    "标题": "宏观市场消息",
                    "内容": "与个股和主题都无关",
                    "来源": "测试源",
                    "发布时间": "2026-03-07T09:30:00Z",
                }
            ]
        ),
    )
    monkeypatch.setattr(tracker, "_fetch_ak_news", lambda func_name: None)

    with caplog.at_level("INFO"):
        result = tracker.fetch_stock_news("sh688041", "海光信息")

    assert result == []
    assert "新闻源接口失败 [巨潮资讯公告]" in caplog.text
    assert "新闻源无结果 [东方财富个股新闻]" in caplog.text
    assert "新闻源被过滤 [财联社]" in caplog.text


def test_stock_code_normalization_and_support_levels():
    assert normalize_stock_code("688041.SH") == "sh688041"
    assert normalize_stock_code("300750.SZ") == "sz300750"
    assert normalize_stock_code("700.hk") == "00700.HK"
    assert get_monitor_support_level("sh688041") == "full"
    assert get_monitor_support_level("00700.HK") == "partial"
    assert get_monitor_support_level("sh000001") == "unsupported"


def test_hk_hot_rank_tracker_handles_empty_dataframe(monkeypatch):
    import pandas as pd
    import ashare.monitor as monitor_module

    monkeypatch.setattr(monitor_module.ak, "stock_hk_hot_rank_em", lambda: pd.DataFrame())
    tracker = HkHotRankTracker()
    assert tracker.fetch_hot_rankings() == []


def test_stock_topics_round_trip(tmp_path):
    topics_path = tmp_path / "stock_topics.json"
    save_stock_topics({"中国海油": ["石油", "原油"], "腾讯控股": ["AI", "游戏"]}, topics_path)
    loaded = load_stock_topics(topics_path)
    assert loaded["中国海油"] == ["石油", "原油"]
    assert loaded["腾讯控股"] == ["AI", "游戏"]


def test_monitor_service_deduplicates_news_and_records_fund_flow(tmp_path):
    db_path = tmp_path / "monitor.db"
    config = DummyConfig()
    config.monitor_db_path = str(db_path)

    notifier = FakeNotifier()
    news_tracker = FakeNewsTracker()
    fund_flow_tracker = FakeFundFlowTracker()
    state_store = MonitorStateStore(str(db_path))

    service = MonitorService(
        config=config,
        stock_pool_provider=lambda: {"招商银行": "sh600036", "腾讯控股": "00700.HK", "中国海油": "00883.HK"},
        notifier=notifier,
        state_store=state_store,
        news_tracker=news_tracker,
        fund_flow_tracker=fund_flow_tracker,
        alert_engine=AlertEngine(config),
    )

    first_cycle = service.run_cycle()
    second_cycle = service.run_cycle()

    assert first_cycle["generated_alerts"] == 4
    assert second_cycle["generated_alerts"] == 0
    assert len(notifier.events) == 4
    recent_alerts = state_store.get_recent_alerts(limit=10)
    assert any(item["stock_code"] == "00700.HK" and item["event_type"] == "news" for item in recent_alerts)
    assert not any(item["stock_code"] == "00700.HK" and item["event_type"] == "fund_flow" for item in recent_alerts)
