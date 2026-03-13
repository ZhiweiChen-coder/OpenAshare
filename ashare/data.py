"""
股票数据获取模块

提供统一的股票数据获取接口，支持多种数据源
"""

import pandas as pd
from typing import Dict, List, Optional
from ashare.logging import get_logger
from ashare.stock_pool import get_exchange_label, is_valid_stock_code, normalize_stock_code

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
                print(f"警告: 加载 {path} 失败: {ex}")
        return None

    as_api = _load_ashare_module()
    if as_api is None:
        try:
            import Ashare as as_api  # noqa: fallback if path load failed
        except ImportError:
            as_api = None
except Exception as e:
    as_api = None
    print(f"警告: 无法加载Ashare数据源模块: {e}")

if as_api is None:
    print("警告: as_api 未就绪，将使用 akshare 作为日线数据源备选")

logger = get_logger(__name__)


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
