from ashare.search import StockSearcher


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload
        self.text = ""

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def test_search_stocks_uses_online_result_for_unknown_code(monkeypatch):
    def fake_get(url, params=None, headers=None, timeout=None):
        assert params is not None
        assert params["input"] == "sh688256"
        return _FakeResponse(
            {
                "QuotationCodeTable": {
                    "Data": [
                        {
                            "Code": "688256",
                            "Name": "寒武纪",
                            "Classify": "AStock",
                            "SecurityTypeName": "沪A",
                            "QuoteID": "1.688256",
                        }
                    ]
                }
            }
        )

    monkeypatch.setattr("ashare.search.requests.get", fake_get)
    monkeypatch.setattr("ashare.search.load_stock_pool", lambda: {})
    monkeypatch.setattr("ashare.search.save_stock_pool", lambda stock_pool: None)
    searcher = StockSearcher()

    results = searcher.search_stocks("sh688256", max_results=5)

    assert results[0]["name"] == "寒武纪"
    assert results[0]["code"] == "sh688256"
    assert results[0]["match_type"] == "online_eastmoney"


def test_get_stock_info_resolves_online_name(monkeypatch):
    def fake_get(url, params=None, headers=None, timeout=None):
        assert params is not None
        assert params["input"] == "688256"
        return _FakeResponse(
            {
                "QuotationCodeTable": {
                    "Data": [
                        {
                            "Code": "688256",
                            "Name": "寒武纪",
                            "Classify": "AStock",
                            "SecurityTypeName": "沪A",
                            "QuoteID": "1.688256",
                        }
                    ]
                }
            }
        )

    monkeypatch.setattr("ashare.search.requests.get", fake_get)
    monkeypatch.setattr("ashare.search.load_stock_pool", lambda: {})
    monkeypatch.setattr("ashare.search.save_stock_pool", lambda stock_pool: None)
    searcher = StockSearcher()

    info = searcher.get_stock_info("sh688256")

    assert info is not None
    assert info["name"] == "寒武纪"
    assert info["code"] == "sh688256"
    assert info["source"] == "online_eastmoney"


def test_searcher_loads_local_stock_pool(monkeypatch):
    monkeypatch.setattr("ashare.search.load_stock_pool", lambda: {"寒武纪": "sh688256"})

    searcher = StockSearcher()

    results = searcher.search_stocks("寒武纪", max_results=5)

    assert results[0]["name"] == "寒武纪"
    assert results[0]["code"] == "sh688256"


def test_online_result_is_persisted_to_local_stock_pool(monkeypatch):
    saved = {}

    def fake_get(url, params=None, headers=None, timeout=None):
        return _FakeResponse(
            {
                "QuotationCodeTable": {
                    "Data": [
                        {
                            "Code": "688256",
                            "Name": "寒武纪",
                            "Classify": "AStock",
                            "SecurityTypeName": "沪A",
                            "QuoteID": "1.688256",
                        }
                    ]
                }
            }
        )

    def fake_save(stock_pool):
        saved.update(stock_pool)

    monkeypatch.setattr("ashare.search.requests.get", fake_get)
    monkeypatch.setattr("ashare.search.load_stock_pool", lambda: {})
    monkeypatch.setattr("ashare.search.save_stock_pool", fake_save)

    searcher = StockSearcher()
    searcher.search_stocks("sh688256", max_results=5)

    assert saved["寒武纪"] == "sh688256"
