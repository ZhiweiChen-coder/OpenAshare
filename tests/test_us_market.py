"""美股支持的单元测试：代码身份系统、搜索、数据获取路由与解析。"""

import pandas as pd
import pytest

from ashare.data import DataFetcher
from ashare.search import StockSearcher
from ashare.stock_pool import (
    extract_symbol,
    get_exchange_label,
    get_market_label,
    get_monitor_support_level,
    infer_market,
    is_us_stock,
    is_valid_stock_code,
    normalize_stock_code,
)


def test_normalize_us_codes():
    assert normalize_stock_code("AAPL") == "US.AAPL"
    assert normalize_stock_code("aapl") == "US.AAPL"
    assert normalize_stock_code("US.AAPL") == "US.AAPL"
    assert normalize_stock_code("BRK.B") == "US.BRK.B"
    assert normalize_stock_code("us.brk.b") == "US.BRK.B"
    # 不影响 A股/港股
    assert normalize_stock_code("600036.SH") == "sh600036"
    assert normalize_stock_code("700.hk") == "00700.HK"
    # 中文名不会被误判成 ticker
    assert normalize_stock_code("腾讯") == "腾讯"


def test_us_identity_helpers():
    assert is_valid_stock_code("AAPL") is True
    assert is_valid_stock_code("US.BRK.B") is True
    assert is_us_stock("NVDA") is True
    assert is_us_stock("sh600036") is False
    assert infer_market("AAPL") == "us"
    assert get_market_label("AAPL") == "美股"
    assert get_exchange_label("AAPL") == "美股"
    assert extract_symbol("US.BRK.B") == "BRK.B"
    # 美股监控为完整级别（技术面），A股 特有数据会自动跳过
    assert get_monitor_support_level("AAPL") == "full"


def test_search_resolves_us_stocks():
    searcher = StockSearcher()
    assert searcher.search_stocks("苹果", max_results=1)[0]["code"] == "US.AAPL"
    assert searcher.search_stocks("AAPL", max_results=1)[0]["code"] == "US.AAPL"
    assert searcher.search_stocks("英伟达", max_results=1)[0]["code"] == "US.NVDA"
    # 未收录的 ticker 兜底为合法美股代码
    fallback = searcher.search_stocks("ROKU", max_results=1)
    assert fallback and fallback[0]["code"] == "US.ROKU"
    assert fallback[0]["market"] == "美股"


def test_us_yf_symbol_converts_class_shares():
    assert DataFetcher._us_yf_symbol("US.AAPL") == "AAPL"
    assert DataFetcher._us_yf_symbol("US.BRK.B") == "BRK-B"


def test_normalize_us_dataframe_handles_multiindex():
    fetcher = DataFetcher()
    idx = pd.to_datetime(["2026-01-02", "2026-01-03"])
    columns = pd.MultiIndex.from_product(
        [["Open", "High", "Low", "Close", "Volume"], ["AAPL"]]
    )
    raw = pd.DataFrame(
        [[1, 2, 0.5, 1.5, 1000], [1.5, 2.5, 1.0, 2.0, 1200]],
        index=idx,
        columns=columns,
    )
    out = fetcher._normalize_us_dataframe(raw, count=10, source="test")
    assert list(out.columns) == ["open", "close", "high", "low", "volume"]
    assert len(out) == 2
    assert out["close"].iloc[-1] == 2.0
    assert out.index.name == ""


def test_fetch_stock_data_routes_us_through_us_pipeline(monkeypatch):
    fetcher = DataFetcher()
    sentinel = pd.DataFrame(
        {"open": [1.0], "close": [1.1], "high": [1.2], "low": [0.9], "volume": [10.0]},
        index=pd.to_datetime(["2026-01-02"]),
    )

    called = {}

    def fake_us(code, count, frequency):
        called["code"] = code
        return sentinel

    monkeypatch.setattr(fetcher, "_fetch_stock_data_us", fake_us)
    out = fetcher.fetch_stock_data("AAPL")
    assert called["code"] == "US.AAPL"
    assert out is sentinel


def test_finnhub_parsing(monkeypatch):
    fetcher = DataFetcher()

    class FakeResp:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "s": "ok",
                "o": [1.0, 1.5],
                "c": [1.1, 2.0],
                "h": [1.2, 2.5],
                "l": [0.9, 1.0],
                "v": [100, 120],
                "t": [1735776000, 1735862400],
            }

    monkeypatch.setattr(
        "ashare.config.Config",
        type("C", (), {"finnhub_api_key": "test-key", "__init__": lambda self: None}),
    )

    import requests

    monkeypatch.setattr(requests, "get", lambda *a, **k: FakeResp())
    out = fetcher._fetch_stock_data_finnhub("US.AAPL", count=10, frequency="1d")
    assert out is not None
    assert list(out.columns) == ["open", "close", "high", "low", "volume"]
    assert out["close"].iloc[-1] == 2.0


def test_finnhub_skipped_without_key(monkeypatch):
    fetcher = DataFetcher()
    monkeypatch.setattr(
        "ashare.config.Config",
        type("C", (), {"finnhub_api_key": None, "__init__": lambda self: None}),
    )
    assert fetcher._fetch_stock_data_finnhub("US.AAPL", count=10, frequency="1d") is None
