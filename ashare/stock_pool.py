"""
股票池持久化工具
"""

import json
import re
from pathlib import Path
from typing import Dict, List


DEFAULT_STOCK_POOL_PATH = Path("data/stock_pool.json")
DEFAULT_STOCK_TOPICS_PATH = Path("data/stock_topics.json")

BASE_STOCK_CATALOG: Dict[str, Dict[str, str]] = {
    # A股主要股票
    "招商银行": {"code": "sh600036", "market": "A股-上海", "category": "银行"},
    "平安银行": {"code": "sz000001", "market": "A股-深圳", "category": "银行"},
    "贵州茅台": {"code": "sh600519", "market": "A股-上海", "category": "白酒"},
    "五粮液": {"code": "sz000858", "market": "A股-深圳", "category": "白酒"},
    "中国平安": {"code": "sh601318", "market": "A股-上海", "category": "保险"},
    "中国海油": {"code": "sh600938", "market": "A股-上海", "category": "石油石化"},
    "中国海洋石油": {"code": "sh600938", "market": "A股-上海", "category": "石油石化"},
    "中国石油": {"code": "sh601857", "market": "A股-上海", "category": "石油石化"},
    "中国石化": {"code": "sh600028", "market": "A股-上海", "category": "石油石化"},
    "万科A": {"code": "sz000002", "market": "A股-深圳", "category": "地产"},
    "格力电器": {"code": "sz000651", "market": "A股-深圳", "category": "家电"},
    "美的集团": {"code": "sz000333", "market": "A股-深圳", "category": "家电"},
    "海康威视": {"code": "sz002415", "market": "A股-深圳", "category": "科技"},
    "比亚迪": {"code": "sz002594", "market": "A股-深圳", "category": "新能源车"},
    "宁德时代": {"code": "sz300750", "market": "A股-创业板", "category": "新能源"},
    "隆基绿能": {"code": "sh601012", "market": "A股-上海", "category": "新能源"},
    "中国中免": {"code": "sh601888", "market": "A股-上海", "category": "消费"},
    "恒瑞医药": {"code": "sh600276", "market": "A股-上海", "category": "医药"},
    # 主要指数
    "上证指数": {"code": "sh000001", "market": "指数-上海", "category": "指数"},
    "深证成指": {"code": "sz399001", "market": "指数-深圳", "category": "指数"},
    "创业板指": {"code": "sz399006", "market": "指数-创业板", "category": "指数"},
    "科创50": {"code": "sh000688", "market": "指数-科创板", "category": "指数"},
    "沪深300": {"code": "sh000300", "market": "指数-沪深", "category": "指数"},
    "中证500": {"code": "sh000905", "market": "指数-中证", "category": "指数"},
    # 港股主要股票
    "腾讯控股": {"code": "00700.HK", "market": "港股", "category": "科技"},
    "阿里巴巴": {"code": "09988.HK", "market": "港股", "category": "科技"},
    "美团": {"code": "03690.HK", "market": "港股", "category": "科技"},
    "小米集团": {"code": "01810.HK", "market": "港股", "category": "科技"},
    "京东集团": {"code": "09618.HK", "market": "港股", "category": "电商"},
    "网易": {"code": "09999.HK", "market": "港股", "category": "科技"},
    "百度集团": {"code": "09888.HK", "market": "港股", "category": "科技"},
    "快手": {"code": "01024.HK", "market": "港股", "category": "科技"},
    "比亚迪股份": {"code": "01211.HK", "market": "港股", "category": "新能源车"},
    "中国移动": {"code": "00941.HK", "market": "港股", "category": "通信"},
    "中国联通": {"code": "00762.HK", "market": "港股", "category": "通信"},
    "中国电信": {"code": "00728.HK", "market": "港股", "category": "通信"},
    # 银行股
    "工商银行": {"code": "sh601398", "market": "A股-上海", "category": "银行"},
    "建设银行": {"code": "sh601939", "market": "A股-上海", "category": "银行"},
    "农业银行": {"code": "sh601288", "market": "A股-上海", "category": "银行"},
    "中国银行": {"code": "sh601988", "market": "A股-上海", "category": "银行"},
    "交通银行": {"code": "sh601328", "market": "A股-上海", "category": "银行"},
    "浦发银行": {"code": "sh600000", "market": "A股-上海", "category": "银行"},
    "兴业银行": {"code": "sh601166", "market": "A股-上海", "category": "银行"},
    "民生银行": {"code": "sh600016", "market": "A股-上海", "category": "银行"},
    "中信银行": {"code": "sh601998", "market": "A股-上海", "category": "银行"},
    "光大银行": {"code": "sh601818", "market": "A股-上海", "category": "银行"},
    # 科技股
    "中兴通讯": {"code": "sz000063", "market": "A股-深圳", "category": "科技"},
    "京东方A": {"code": "sz000725", "market": "A股-深圳", "category": "科技"},
    "TCL科技": {"code": "sz000100", "market": "A股-深圳", "category": "科技"},
    "立讯精密": {"code": "sz002475", "market": "A股-深圳", "category": "科技"},
    "歌尔股份": {"code": "sz002241", "market": "A股-深圳", "category": "科技"},
    "蓝思科技": {"code": "sz300433", "market": "A股-创业板", "category": "科技"},
    "欧菲光": {"code": "sz002456", "market": "A股-深圳", "category": "科技"},
    "海光信息": {"code": "sh688041", "market": "A股-科创板", "category": "科技"},
    "寒武纪": {"code": "sh688256", "market": "A股-科创板", "category": "科技"},
    "兆易创新": {"code": "sh603986", "market": "A股-上海", "category": "科技"},
    # 新能源
    "阳光电源": {"code": "sz300274", "market": "A股-创业板", "category": "新能源"},
    "通威股份": {"code": "sh600438", "market": "A股-上海", "category": "新能源"},
    "天合光能": {"code": "sh688599", "market": "A股-科创板", "category": "新能源"},
    "晶澳科技": {"code": "sz002459", "market": "A股-深圳", "category": "新能源"},
    "福斯特": {"code": "sh603806", "market": "A股-上海", "category": "新能源"},
    "中环股份": {"code": "sz002129", "market": "A股-深圳", "category": "新能源"},
    # 医药股
    "复星医药": {"code": "sh600196", "market": "A股-上海", "category": "医药"},
    "云南白药": {"code": "sz000538", "market": "A股-深圳", "category": "医药"},
    "片仔癀": {"code": "sh600436", "market": "A股-上海", "category": "医药"},
    "同仁堂": {"code": "sh600085", "market": "A股-上海", "category": "医药"},
    "东阿阿胶": {"code": "sz000423", "market": "A股-深圳", "category": "医药"},
    "华润三九": {"code": "sz000999", "market": "A股-深圳", "category": "医药"},
    "丽珠集团": {"code": "sz000513", "market": "A股-深圳", "category": "医药"},
    "长春高新": {"code": "sz000661", "market": "A股-深圳", "category": "医药"},
    # 美股龙头（含中文名映射，方便中文搜索）
    "苹果": {"code": "US.AAPL", "market": "美股", "category": "科技"},
    "微软": {"code": "US.MSFT", "market": "美股", "category": "科技"},
    "英伟达": {"code": "US.NVDA", "market": "美股", "category": "半导体"},
    "谷歌": {"code": "US.GOOGL", "market": "美股", "category": "科技"},
    "谷歌C": {"code": "US.GOOG", "market": "美股", "category": "科技"},
    "亚马逊": {"code": "US.AMZN", "market": "美股", "category": "电商"},
    "Meta": {"code": "US.META", "market": "美股", "category": "科技"},
    "脸书": {"code": "US.META", "market": "美股", "category": "科技"},
    "特斯拉": {"code": "US.TSLA", "market": "美股", "category": "新能源车"},
    "博通": {"code": "US.AVGO", "market": "美股", "category": "半导体"},
    "台积电": {"code": "US.TSM", "market": "美股", "category": "半导体"},
    "AMD": {"code": "US.AMD", "market": "美股", "category": "半导体"},
    "英特尔": {"code": "US.INTC", "market": "美股", "category": "半导体"},
    "高通": {"code": "US.QCOM", "market": "美股", "category": "半导体"},
    "美光": {"code": "US.MU", "market": "美股", "category": "半导体"},
    "奈飞": {"code": "US.NFLX", "market": "美股", "category": "科技"},
    "甲骨文": {"code": "US.ORCL", "market": "美股", "category": "科技"},
    "Adobe": {"code": "US.ADBE", "market": "美股", "category": "科技"},
    "Salesforce": {"code": "US.CRM", "market": "美股", "category": "科技"},
    "伯克希尔": {"code": "US.BRK.B", "market": "美股", "category": "金融"},
    "摩根大通": {"code": "US.JPM", "market": "美股", "category": "金融"},
    "visa": {"code": "US.V", "market": "美股", "category": "金融"},
    "万事达": {"code": "US.MA", "market": "美股", "category": "金融"},
    "美国银行": {"code": "US.BAC", "market": "美股", "category": "金融"},
    "强生": {"code": "US.JNJ", "market": "美股", "category": "医药"},
    "礼来": {"code": "US.LLY", "market": "美股", "category": "医药"},
    "联合健康": {"code": "US.UNH", "market": "美股", "category": "医疗"},
    "辉瑞": {"code": "US.PFE", "market": "美股", "category": "医药"},
    "可口可乐": {"code": "US.KO", "market": "美股", "category": "消费"},
    "百事": {"code": "US.PEP", "market": "美股", "category": "消费"},
    "麦当劳": {"code": "US.MCD", "market": "美股", "category": "消费"},
    "星巴克": {"code": "US.SBUX", "market": "美股", "category": "消费"},
    "耐克": {"code": "US.NKE", "market": "美股", "category": "消费"},
    "沃尔玛": {"code": "US.WMT", "market": "美股", "category": "零售"},
    "好市多": {"code": "US.COST", "market": "美股", "category": "零售"},
    "迪士尼": {"code": "US.DIS", "market": "美股", "category": "传媒"},
    "波音": {"code": "US.BA", "market": "美股", "category": "工业"},
    "埃克森美孚": {"code": "US.XOM", "market": "美股", "category": "能源"},
    "雪佛龙": {"code": "US.CVX", "market": "美股", "category": "能源"},
    "Palantir": {"code": "US.PLTR", "market": "美股", "category": "科技"},
    "超微电脑": {"code": "US.SMCI", "market": "美股", "category": "科技"},
    "阿斯麦": {"code": "US.ASML", "market": "美股", "category": "半导体"},
    "Coinbase": {"code": "US.COIN", "market": "美股", "category": "金融科技"},
    "Uber": {"code": "US.UBER", "market": "美股", "category": "科技"},
    # 美股主要指数 ETF / 指数
    "标普500": {"code": "US.SPY", "market": "美股", "category": "指数"},
    "纳斯达克100": {"code": "US.QQQ", "market": "美股", "category": "指数"},
    "道琼斯": {"code": "US.DIA", "market": "美股", "category": "指数"},
}


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def load_stock_pool(path: Path = DEFAULT_STOCK_POOL_PATH) -> Dict[str, str]:
    """从本地文件加载股票池。路径会转为绝对路径以便从任意工作目录运行。"""
    path = path.resolve()
    if not path.exists():
        return {}

    try:
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except (json.JSONDecodeError, OSError, TypeError):
        return {}

    if not isinstance(data, dict):
        return {}

    return {
        str(name): normalize_stock_code(str(code))
        for name, code in data.items()
        if isinstance(name, str) and isinstance(code, str)
    }


def save_stock_pool(stock_pool: Dict[str, str], path: Path = DEFAULT_STOCK_POOL_PATH) -> None:
    """保存股票池到本地文件。"""
    path = path.resolve()
    _ensure_parent(path)
    normalized = {
        name: normalize_stock_code(code)
        for name, code in sorted(stock_pool.items(), key=lambda item: item[0])
    }
    with path.open("w", encoding="utf-8") as file:
        json.dump(normalized, file, ensure_ascii=False, indent=2)


def load_stock_topics(path: Path = DEFAULT_STOCK_TOPICS_PATH) -> Dict[str, List[str]]:
    """从本地文件加载自定义主题词。"""
    if not path.exists():
        return {}

    try:
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except (json.JSONDecodeError, OSError, TypeError):
        return {}

    if not isinstance(data, dict):
        return {}

    topics: Dict[str, List[str]] = {}
    for stock_name, keywords in data.items():
        if not isinstance(stock_name, str):
            continue
        if isinstance(keywords, list):
            cleaned = [str(item).strip() for item in keywords if str(item).strip()]
        else:
            cleaned = [item.strip() for item in str(keywords).split(",") if item.strip()]
        if cleaned:
            topics[stock_name] = cleaned
    return topics


def save_stock_topics(stock_topics: Dict[str, List[str]], path: Path = DEFAULT_STOCK_TOPICS_PATH) -> None:
    """保存自定义主题词到本地文件。"""
    _ensure_parent(path)
    normalized = {
        stock_name: [str(item).strip() for item in keywords if str(item).strip()]
        for stock_name, keywords in sorted(stock_topics.items(), key=lambda item: item[0])
    }
    normalized = {stock_name: keywords for stock_name, keywords in normalized.items() if keywords}
    with path.open("w", encoding="utf-8") as file:
        json.dump(normalized, file, ensure_ascii=False, indent=2)


def get_base_stock_catalog() -> Dict[str, Dict[str, str]]:
    return {
        name: {
            **info,
            "code": normalize_stock_code(str(info["code"])),
        }
        for name, info in BASE_STOCK_CATALOG.items()
    }


US_TICKER_PATTERN = r"[A-Z]{1,5}(\.[A-Z]{1,2})?"


def normalize_stock_code(code: str) -> str:
    """标准化股票代码格式。

    支持三类市场：
      - A股：``sh######`` / ``sz######``
      - 港股：``#####.HK``
      - 美股：``US.TICKER``（如 ``US.AAPL``、``US.BRK.B``）

    美股统一加 ``US.`` 前缀，以便和港股 ``.HK``、A股数字代码区分，避免
    诸如 ``BRK.B`` 这类含点的代码被误判成港股。
    """
    raw = code.strip()
    if not raw:
        return raw

    upper = raw.upper()
    lower = raw.lower()

    if re.fullmatch(r"(SH|SZ)\d{6}", upper):
        return lower
    if re.fullmatch(r"\d{6}\.(SH|SZ)", upper):
        market = upper[-2:].lower()
        symbol = upper[:6]
        return f"{market}{symbol}"
    if re.fullmatch(r"\d{5}\.HK", upper):
        return upper
    if re.fullmatch(r"\d{1,4}\.HK", upper):
        symbol = upper.split(".")[0].zfill(5)
        return f"{symbol}.HK"

    # 美股：显式 ``US.`` 前缀
    if upper.startswith("US.") and re.fullmatch(US_TICKER_PATTERN, upper[3:]):
        return f"US.{upper[3:]}"
    # 美股：裸 ticker（纯字母，区别于全数字的 A股/港股代码）
    if re.fullmatch(US_TICKER_PATTERN, upper):
        return f"US.{upper}"

    return raw


def extract_symbol(code: str) -> str:
    normalized = normalize_stock_code(code)
    if normalized.lower().startswith(("sh", "sz")):
        return normalized[2:]
    if normalized.upper().endswith(".HK"):
        return normalized[:-3]
    if normalized.upper().startswith("US."):
        return normalized[3:]
    return normalized


def infer_market(code: str) -> str:
    normalized = normalize_stock_code(code)
    lower = normalized.lower()
    upper = normalized.upper()
    if lower.startswith("sh"):
        return "sh"
    if lower.startswith("sz"):
        return "sz"
    if upper.endswith(".HK"):
        return "hk"
    if upper.startswith("US."):
        return "us"
    return "unknown"


def is_valid_stock_code(code: str) -> bool:
    normalized = normalize_stock_code(code)
    upper = normalized.upper()
    lower = normalized.lower()
    return bool(
        re.fullmatch(r"(sh|sz)\d{6}", lower)
        or re.fullmatch(r"\d{5}\.HK", upper)
        or re.fullmatch(rf"US\.{US_TICKER_PATTERN}", upper)
    )


def get_market_label(code: str) -> str:
    normalized = normalize_stock_code(code)
    lower = normalized.lower()
    upper = normalized.upper()
    if lower.startswith("sh"):
        if lower.startswith("sh000"):
            return "指数-上海"
        if lower.startswith("sh688"):
            return "A股-科创板"
        return "A股-上海"
    if lower.startswith("sz"):
        if lower.startswith("sz399"):
            return "指数-深圳"
        if lower.startswith("sz300"):
            return "A股-创业板"
        return "A股-深圳"
    if upper.endswith(".HK"):
        return "港股"
    if upper.startswith("US."):
        return "美股"
    return "未知市场"


def get_exchange_label(code: str) -> str:
    market = infer_market(code)
    if market == "sh":
        return "上交所"
    if market == "sz":
        return "深交所"
    if market == "hk":
        return "港交所"
    if market == "us":
        return "美股"
    return "未知"


def is_a_share_individual_stock(code: str) -> bool:
    normalized = normalize_stock_code(code).lower()
    if not normalized.startswith(("sh", "sz")):
        return False
    symbol = extract_symbol(normalized)
    if not re.fullmatch(r"\d{6}", symbol):
        return False
    if normalized.startswith("sh000") or normalized.startswith("sz399"):
        return False
    return True


def is_hk_stock(code: str) -> bool:
    normalized = normalize_stock_code(code).upper()
    return bool(re.fullmatch(r"\d{5}\.HK", normalized))


def is_us_stock(code: str) -> bool:
    normalized = normalize_stock_code(code).upper()
    return bool(re.fullmatch(rf"US\.{US_TICKER_PATTERN}", normalized))


def get_monitor_support_level(code: str) -> str:
    """返回监控支持级别: full, partial, unsupported。

    A股个股支持完整监控（含资金流/龙虎榜等 A股 特有数据）；美股支持
    完整的行情与技术面监控，但 A股 特有数据会自动跳过；港股为部分支持。
    """
    if is_a_share_individual_stock(code):
        return "full"
    if is_us_stock(code):
        return "full"
    if is_hk_stock(code):
        return "partial"
    return "unsupported"
