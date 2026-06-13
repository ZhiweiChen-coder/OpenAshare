"""
股票数据获取模块

提供统一的股票数据获取接口，支持多种数据源
"""

import pandas as pd
from typing import Dict, List, Optional
from ashare.logging import get_logger
from ashare.stock_pool import (
    extract_symbol,
    get_exchange_label,
    is_us_stock,
    is_valid_stock_code,
    normalize_stock_code,
)

logger = get_logger(__name__)

# 尝试导入数据源（pip 的 ashare 包可能与项目根目录 Ashare.py 冲突，用文件路径显式加载）
as_api = None
try:
    import sys
    import importlib.util
    from pathlib import Path

    project_root = Path(__file__).parent.parent.resolve()
    sys.path.insert(0, str(project_root))

    def _load_ashare_module():
        """Load project Ashare.py by path to avoid name clash with installed 'ashare' package."""
        for name, path in [
            ("ashare_data_source", project_root / "Ashare.py"),
            ("ashare_backup", project_root / "_backup" / "_old_Ashare.py"),
        ]:
            if not path.exists():
                continue
            try:
                spec = importlib.util.spec_from_file_location(name, path)
                if spec and spec.loader:
                    mod = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(mod)
                    if hasattr(mod, "get_price"):
                        return mod
            except Exception as ex:
                logger.warning("加载 %s 失败: %s", path, ex)
        return None

    as_api = _load_ashare_module()
    if as_api is None:
        try:
            import Ashare as as_api  # noqa: fallback if path load failed
        except ImportError:
            as_api = None
except Exception as e:
    as_api = None
    logger.warning("无法加载 Ashare 数据源模块: %s", e)

if as_api is None:
    logger.warning("as_api 未就绪，将使用 akshare 作为日线数据源备选")


class DataFetcher:
    """股票数据获取器"""
    
    def __init__(self, default_count: int = 120):
        """
        初始化数据获取器
        
        Args:
            default_count: 默认获取的数据条数
        """
        self.default_count = default_count
        self.data_cache = {}
        logger.info(f"数据获取器已初始化，默认获取{default_count}条数据")
    
    def fetch_stock_data(self, code: str, count: Optional[int] = None, 
                        frequency: str = '1d') -> Optional[pd.DataFrame]:
        """
        获取单只股票数据
        
        Args:
            code: 股票代码
            count: 获取的数据条数
            frequency: 数据频率 ('1d', '1w', '1m' 等)
            
        Returns:
            股票数据DataFrame，失败时返回None
        """
        count = count or self.default_count
        code = normalize_stock_code(code)
        cache_key = f"{code}_{count}_{frequency}"
        
        # 检查缓存
        if cache_key in self.data_cache:
            logger.debug(f"从缓存获取股票数据: {code}")
            return self.data_cache[cache_key]
        
        try:
            logger.info(f"正在获取股票 {code} 的数据...")
            df = None
            if is_us_stock(code):
                # 美股走独立链路：yfinance 主源，Finnhub 备选
                df = self._fetch_stock_data_us(code, count, frequency)
            else:
                if as_api is not None and hasattr(as_api, "get_price"):
                    try:
                        df = as_api.get_price(code, count=count, frequency=frequency)
                    except Exception as ex:
                        logger.warning("Ashare.get_price failed for %s: %s", code, ex)
                        df = None
                if (df is None or (isinstance(df, pd.DataFrame) and df.empty)) and frequency == "1d":
                    df = self._fetch_stock_data_akshare(code, count)
            
            # 检查数据是否有效
            if df is None or df.empty:
                logger.warning(f"股票 {code} 返回空数据")
                self._log_stock_code_help(code)
                return None
            
            logger.info(f"成功获取 {code} 数据，共 {len(df)} 条记录")
            logger.info(f"数据时间范围: {df.index[0]} 到 {df.index[-1]}")
            
            # 缓存数据
            self.data_cache[cache_key] = df
            return df
            
        except Exception as e:
            logger.error(f"获取股票 {code} 数据失败: {str(e)}")
            self._log_stock_code_help(code)
            return None
    
    def fetch_multiple_stocks(self, codes: List[str], count: Optional[int] = None,
                             frequency: str = '1d') -> Dict[str, pd.DataFrame]:
        """
        批量获取多只股票数据
        
        Args:
            codes: 股票代码列表
            count: 获取的数据条数
            frequency: 数据频率
            
        Returns:
            股票代码到DataFrame的映射
        """
        logger.info(f"开始批量获取{len(codes)}只股票的数据")
        result = {}
        
        for code in codes:
            df = self.fetch_stock_data(code, count, frequency)
            if df is not None:
                result[code] = df
        
        logger.info(f"成功获取{len(result)}只股票的数据")
        return result
    
    def get_stock_info(self, code: str) -> Dict[str, str]:
        """
        获取股票基本信息
        
        Args:
            code: 股票代码
            
        Returns:
            股票基本信息字典
        """
        normalized = normalize_stock_code(code)
        try:
            return {
                'code': normalized,
                'exchange': get_exchange_label(normalized),
                'status': 'active'  # 可以扩展获取实际状态
            }
        except Exception as e:
            logger.error(f"获取股票 {normalized} 信息失败: {str(e)}")
            return {'code': normalized, 'exchange': 'unknown', 'status': 'unknown'}
    
    def validate_stock_code(self, code: str) -> bool:
        """
        验证股票代码格式
        
        Args:
            code: 股票代码
            
        Returns:
            是否为有效格式
        """
        if not code:
            return False
        
        normalized = normalize_stock_code(code)
        if is_valid_stock_code(normalized):
            return True

        logger.warning(f"股票代码格式可能不正确: {normalized}")
        return False
    
    def clear_cache(self):
        """清空数据缓存"""
        self.data_cache.clear()
        logger.info("数据缓存已清空")
    
    def get_cache_info(self) -> Dict[str, int]:
        """获取缓存信息"""
        return {
            'cached_items': len(self.data_cache),
            'cache_keys': list(self.data_cache.keys())
        }
    
    # ------------------------------------------------------------------
    # 美股数据源
    # ------------------------------------------------------------------
    # yfinance 频率映射
    _YF_INTERVAL = {
        "1d": "1d", "1w": "1wk", "1M": "1mo",
        "60m": "60m", "30m": "30m", "15m": "15m", "5m": "5m", "1m": "1m",
    }
    # Finnhub 频率映射（resolution）
    _FINNHUB_RESOLUTION = {
        "1d": "D", "1w": "W", "1M": "M",
        "60m": "60", "30m": "30", "15m": "15", "5m": "5", "1m": "1",
    }
    # 估算需要回溯的自然日数（按频率把 count 转成日历跨度，留足非交易日冗余）
    _LOOKBACK_DAYS_PER_BAR = {
        "1d": 2, "1w": 9, "1M": 40,
        "60m": 1, "30m": 1, "15m": 1, "5m": 1, "1m": 1,
    }

    @staticmethod
    def _us_yf_symbol(code: str) -> str:
        """US.BRK.B -> BRK-B（yfinance 用 ``-`` 表示类别股）。"""
        return extract_symbol(code).replace(".", "-")

    def _fetch_stock_data_us(self, code: str, count: int, frequency: str) -> Optional[pd.DataFrame]:
        """美股行情：yfinance 主源，失败时降级到 Finnhub。"""
        df = self._fetch_stock_data_yfinance(code, count, frequency)
        if df is not None and not df.empty:
            return df
        logger.info("yfinance 未取到 %s 数据，尝试 Finnhub 备选源", code)
        return self._fetch_stock_data_finnhub(code, count, frequency)

    def _fetch_stock_data_yfinance(self, code: str, count: int, frequency: str) -> Optional[pd.DataFrame]:
        try:
            import yfinance as yf
        except ImportError:
            logger.warning("yfinance 未安装，无法获取美股数据")
            return None

        interval = self._YF_INTERVAL.get(frequency)
        if interval is None:
            logger.warning("yfinance 不支持的频率: %s", frequency)
            return None

        symbol = self._us_yf_symbol(code)
        lookback = max(7, count * self._LOOKBACK_DAYS_PER_BAR.get(frequency, 2))
        start = (pd.Timestamp.now() - pd.Timedelta(days=lookback)).strftime("%Y-%m-%d")
        end = (pd.Timestamp.now() + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
        try:
            raw = yf.download(
                symbol, start=start, end=end, interval=interval,
                auto_adjust=True, progress=False, threads=False,
            )
        except Exception as e:
            logger.warning("yfinance download failed %s: %s", symbol, e)
            return None
        return self._normalize_us_dataframe(raw, count, source=f"yfinance({symbol})")

    def _normalize_us_dataframe(self, raw, count: int, source: str) -> Optional[pd.DataFrame]:
        if raw is None or raw.empty:
            return None
        df = raw.copy()
        # yfinance 多 ticker 时返回 MultiIndex 列，单 ticker 也可能带一层，统一压平
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        col_map = {"Open": "open", "Close": "close", "High": "high", "Low": "low", "Volume": "volume"}
        rename = {k: v for k, v in col_map.items() if k in df.columns}
        df = df.rename(columns=rename)
        for c in ["open", "close", "high", "low", "volume"]:
            if c not in df.columns:
                logger.warning("%s 缺少必要列 %s", source, c)
                return None
        df = df[["open", "close", "high", "low", "volume"]].astype(float)
        df.index = pd.to_datetime(df.index)
        df.index.name = ""
        df.columns.name = None
        df = df.dropna().tail(count)
        if df.empty:
            return None
        logger.info("%s 成功，共 %d 条", source, len(df))
        return df

    def _fetch_stock_data_finnhub(self, code: str, count: int, frequency: str) -> Optional[pd.DataFrame]:
        try:
            from ashare.config import Config
        except ImportError:
            Config = None
        api_key = None
        if Config is not None:
            try:
                api_key = Config().finnhub_api_key
            except Exception:
                api_key = None
        if not api_key:
            logger.info("未配置 FINNHUB_API_KEY，跳过 Finnhub 备选源")
            return None

        resolution = self._FINNHUB_RESOLUTION.get(frequency)
        if resolution is None:
            logger.warning("Finnhub 不支持的频率: %s", frequency)
            return None

        symbol = extract_symbol(code).replace(".", "-")
        lookback = max(7, count * self._LOOKBACK_DAYS_PER_BAR.get(frequency, 2))
        to_ts = int(pd.Timestamp.now().timestamp())
        from_ts = int((pd.Timestamp.now() - pd.Timedelta(days=lookback)).timestamp())
        try:
            import requests
            resp = requests.get(
                "https://finnhub.io/api/v1/stock/candle",
                params={"symbol": symbol, "resolution": resolution,
                        "from": from_ts, "to": to_ts, "token": api_key},
                timeout=10,
            )
            resp.raise_for_status()
            payload = resp.json()
        except Exception as e:
            logger.warning("Finnhub request failed %s: %s", symbol, e)
            return None

        if not isinstance(payload, dict) or payload.get("s") != "ok":
            logger.warning("Finnhub 返回无效数据 %s: status=%s", symbol, payload.get("s") if isinstance(payload, dict) else payload)
            return None
        try:
            df = pd.DataFrame({
                "open": payload["o"], "close": payload["c"],
                "high": payload["h"], "low": payload["l"],
                "volume": payload["v"],
            }, index=pd.to_datetime(payload["t"], unit="s")).astype(float)
        except (KeyError, ValueError, TypeError) as e:
            logger.warning("Finnhub 数据解析失败 %s: %s", symbol, e)
            return None
        df.index.name = ""
        df = df.dropna().tail(count)
        if df.empty:
            return None
        logger.info("Finnhub(%s) 成功，共 %d 条", symbol, len(df))
        return df

    def _fetch_stock_data_akshare(self, code: str, count: int) -> Optional[pd.DataFrame]:
        """
        akshare 日线备选：当 Ashare.get_price 不可用时使用。
        symbol 为 6 位数字，不含 sh/sz 前缀。
        """
        try:
            import akshare as ak
        except ImportError:
            return None
        code = normalize_stock_code(code).lower()
        if not (code.startswith("sh") or code.startswith("sz")) or len(code) < 8:
            return None
        symbol = code[2:8]  # 600036
        try:
            # 多取一些再 tail，避免节假日导致条数不足
            end = pd.Timestamp.now().strftime("%Y%m%d")
            start = (pd.Timestamp.now() - pd.Timedelta(days=count * 3)).strftime("%Y%m%d")
            df = ak.stock_zh_a_hist(symbol=symbol, period="daily", start_date=start, end_date=end, adjust="qfq")
        except Exception as e:
            logger.warning("akshare stock_zh_a_hist failed %s: %s", code, e)
            return None
        if df is None or df.empty:
            return None
        # akshare 列名：日期 开盘 收盘 最高 最低 成交量 ...
        col_map = {
            "日期": "time",
            "开盘": "open",
            "收盘": "close",
            "最高": "high",
            "最低": "low",
            "成交量": "volume",
        }
        rename = {k: v for k, v in col_map.items() if k in df.columns}
        if not rename:
            return None
        df = df.rename(columns=rename)
        for c in ["open", "close", "high", "low", "volume"]:
            if c not in df.columns:
                return None
        time_col = "time" if "time" in df.columns else df.columns[0]
        df[time_col] = pd.to_datetime(df[time_col])
        df = df.set_index(time_col)
        df.index.name = ""
        df = df[["open", "close", "high", "low", "volume"]].astype(float)
        df = df.tail(count)
        if df.empty:
            return None
        logger.info(f"akshare 备选成功 {code} 共 {len(df)} 条")
        return df

    def _log_stock_code_help(self, code: str):
        """记录股票代码格式帮助信息"""
        logger.info("请检查股票代码格式是否正确。常见格式:")
        logger.info("  - 上交所: sh000001 (上证指数), sh600036 (招商银行)")
        logger.info("  - 深交所: sz399001 (深证成指), sz000001 (平安银行)")
        logger.info("  - 港股: 00700.HK (腾讯控股)")
        logger.info("建议检查:")
        logger.info("  1. 股票代码格式是否正确")
        logger.info("  2. 网络连接是否正常")
        logger.info("  3. 股票是否已停牌或退市")
    
    def fetch_multi_timeframe_data(self, code: str, count: Optional[int] = None) -> Dict[str, pd.DataFrame]:
        """
        获取多个时间框架的股票数据
        
        Args:
            code: 股票代码  
            count: 获取的数据条数
            
        Returns:
            包含不同时间框架数据的字典
        """
        timeframes = {
            '日线': '1d',
            '周线': '1w', 
            '月线': '1M'
        }
        
        results = {}
        for name, freq in timeframes.items():
            try:
                df = self.fetch_stock_data(code, count, freq)
                if df is not None:
                    results[name] = df
                    logger.info(f"{code} {name}数据获取成功，共{len(df)}条记录")
                else:
                    logger.warning(f"{code} {name}数据获取失败")
            except Exception as e:
                logger.error(f"获取{code} {name}数据失败: {str(e)}")
                
        return results 
