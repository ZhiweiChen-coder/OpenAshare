from ashare.data import DataFetcher
from ashare.search import stock_searcher
from ashare.stock_pool import (
    get_base_stock_catalog,
    get_exchange_label,
    get_market_label,
    is_valid_stock_code,
    normalize_stock_code,
)


def test_shared_stock_code_helpers_cover_common_formats():
    assert normalize_stock_code("600036.SH") == "sh600036"
    assert normalize_stock_code("700.hk") == "00700.HK"
    assert is_valid_stock_code("600036.SH") is True
    assert is_valid_stock_code("00700.HK") is True
    assert is_valid_stock_code("600036") is False
    assert get_market_label("sh688041") == "A股-科创板"
    assert get_market_label("sz300750") == "A股-创业板"
    assert get_market_label("00700.HK") == "港股"
    assert get_exchange_label("00700.HK") == "港交所"


def test_searcher_and_fetcher_use_shared_normalization_rules():
    assert stock_searcher.get_stock_info("600036.SH")["name"] == "招商银行"
    assert get_base_stock_catalog()["招商银行"]["code"] == "sh600036"

    fetcher = DataFetcher()
    assert fetcher.validate_stock_code("700.hk") is True
    assert fetcher.get_stock_info("700.hk")["code"] == "00700.HK"
    assert fetcher.get_stock_info("700.hk")["exchange"] == "港交所"
