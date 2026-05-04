"""
股票搜索工具模块

提供智能股票搜索功能，支持多种搜索方式和数据源
"""

import os
import re
import requests
from typing import Dict, List, Optional
import time

from ashare.stock_pool import (
    extract_symbol,
    get_base_stock_catalog,
    get_market_label,
    is_valid_stock_code,
    load_stock_pool,
    normalize_stock_code,
    save_stock_pool,
)


class StockSearcher:
    """智能股票搜索器"""

    DEFAULT_EASTMONEY_SUGGEST_URL = "https://searchapi.eastmoney.com/api/suggest/get"
    DEFAULT_SINA_SUGGEST_URL = "https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15&key="
    DEFAULT_ONLINE_TIMEOUT = 5
    
    def __init__(self):
        """初始化搜索器"""
        self.base_stock_db = self._load_stock_db()
        self.search_cache = {}
        self.cache_expiry = 3600  # 缓存1小时
        self.eastmoney_suggest_url = self._env_text(
            "EASTMONEY_SUGGEST_URL",
            self.DEFAULT_EASTMONEY_SUGGEST_URL,
        )
        self.eastmoney_token = self._env_text("EASTMONEY_TOKEN", "")
        self.sina_suggest_url = self._env_text(
            "SINA_SUGGEST_URL",
            self.DEFAULT_SINA_SUGGEST_URL,
        )
        self.online_timeout = self._env_int("ONLINE_TIMEOUT", self.DEFAULT_ONLINE_TIMEOUT)

    @staticmethod
    def _env_text(name: str, default: str) -> str:
        value = os.environ.get(name)
        if value is None:
            return default
        stripped = value.strip()
        return stripped or default

    @staticmethod
    def _env_int(name: str, default: int) -> int:
        value = os.environ.get(name)
        if value is None:
            return default
        try:
            return max(1, int(value.strip()))
        except ValueError:
            return default

    def _load_stock_db(self) -> Dict[str, Dict[str, str]]:
        stock_db = get_base_stock_catalog()
        for name, code in load_stock_pool().items():
            stock_db.setdefault(
                name,
                {
                    "code": code,
                    "market": get_market_label(code),
                    "category": "",
                },
            )
        return stock_db
    
    def search_stocks(self, query: str, max_results: int = 10) -> List[Dict]:
        """
        智能搜索股票
        
        Args:
            query: 搜索查询
            max_results: 最大结果数量
            
        Returns:
            搜索结果列表
        """
        query = query.strip()
        if not query:
            return []
        
        # 检查缓存
        cache_key = f"{query}_{max_results}"
        if cache_key in self.search_cache:
            cache_time, cache_results = self.search_cache[cache_key]
            if time.time() - cache_time < self.cache_expiry:
                return cache_results
        
        results = []
        normalized_query = normalize_stock_code(query)
        query_lower = normalized_query.lower()
        
        # 1. 精确匹配股票代码
        exact_code_matches = self._exact_code_match(query_lower)
        results.extend(exact_code_matches)
        
        # 2. 精确匹配股票名称
        if not results:
            exact_name_matches = self._exact_name_match(query_lower)
            results.extend(exact_name_matches)
        
        # 3. 模糊匹配股票名称
        if not results:
            fuzzy_name_matches = self._fuzzy_name_match(query_lower)
            results.extend(fuzzy_name_matches)
        
        # 4. 模糊匹配股票代码
        if not results:
            fuzzy_code_matches = self._fuzzy_code_match(query_lower)
            results.extend(fuzzy_code_matches)
        
        # 5. 按行业/分类搜索
        if not results:
            category_matches = self._category_match(query_lower)
            results.extend(category_matches)
        
        # 6. 先尝试在线搜索，补齐本地股票库未收录的标的名称
        if not results:
            online_results = self._online_search(query)
            for item in online_results:
                self._persist_online_result(item)
            results.extend(online_results)

        # 7. 智能代码格式识别，作为最终兜底
        if not results:
            code_validation = self._validate_and_create_stock(query)
            if code_validation:
                results.append(code_validation)
        
        # 去重和排序
        unique_results = self._deduplicate_results(results)
        sorted_results = self._sort_results(unique_results, query_lower)
        
        # 限制结果数量
        final_results = sorted_results[:max_results]
        
        # 缓存结果
        self.search_cache[cache_key] = (time.time(), final_results)
        
        return final_results
    
    def _exact_code_match(self, query: str) -> List[Dict]:
        """精确匹配股票代码"""
        results = []
        for name, info in self.base_stock_db.items():
            if query == info['code'].lower():
                results.append({
                    'name': name,
                    'code': info['code'],
                    'market': info['market'],
                    'category': info.get('category', ''),
                    'score': 100,  # 最高分
                    'match_type': 'exact_code'
                })
        return results
    
    def _exact_name_match(self, query: str) -> List[Dict]:
        """精确匹配股票名称"""
        results = []
        for name, info in self.base_stock_db.items():
            if query == name.lower():
                results.append({
                    'name': name,
                    'code': info['code'],
                    'market': info['market'],
                    'category': info.get('category', ''),
                    'score': 95,
                    'match_type': 'exact_name'
                })
        return results
    
    def _fuzzy_name_match(self, query: str) -> List[Dict]:
        """模糊匹配股票名称"""
        results = []
        for name, info in self.base_stock_db.items():
            if query in name.lower():
                # 计算匹配分数
                score = self._calculate_fuzzy_score(name.lower(), query)
                results.append({
                    'name': name,
                    'code': info['code'],
                    'market': info['market'],
                    'category': info.get('category', ''),
                    'score': score,
                    'match_type': 'fuzzy_name'
                })
        return results
    
    def _fuzzy_code_match(self, query: str) -> List[Dict]:
        """模糊匹配股票代码"""
        results = []
        for name, info in self.base_stock_db.items():
            if query in info['code'].lower():
                score = self._calculate_fuzzy_score(info['code'].lower(), query)
                results.append({
                    'name': name,
                    'code': info['code'],
                    'market': info['market'],
                    'category': info.get('category', ''),
                    'score': score - 10,  # 代码匹配分数稍低
                    'match_type': 'fuzzy_code'
                })
        return results
    
    def _category_match(self, query: str) -> List[Dict]:
        """按行业/分类搜索"""
        results = []
        for name, info in self.base_stock_db.items():
            if 'category' in info and query in info['category'].lower():
                score = self._calculate_fuzzy_score(info['category'].lower(), query)
                results.append({
                    'name': name,
                    'code': info['code'],
                    'market': info['market'],
                    'category': info.get('category', ''),
                    'score': score - 20,  # 分类匹配分数更低
                    'match_type': 'category'
                })
        return results
    
    def _validate_and_create_stock(self, query: str) -> Optional[Dict]:
        """验证股票代码格式并创建临时结果"""
        normalized = normalize_stock_code(query)
        if is_valid_stock_code(normalized):
            return {
                'name': f"未知股票 ({normalized})",
                'code': normalized,
                'market': get_market_label(normalized),
                'category': '未知',
                'score': 50,
                'match_type': 'code_validation',
                'is_unknown': True
            }
        return None
    
    def _online_search(self, query: str) -> List[Dict]:
        """在线搜索股票，补齐本地股票库未覆盖的名称和代码映射。"""
        eastmoney_results = self._search_eastmoney(query)
        if eastmoney_results:
            return eastmoney_results

        normalized = normalize_stock_code(query)
        if is_valid_stock_code(normalized):
            sina_result = self._search_sina_by_code(normalized)
            if sina_result:
                return [sina_result]

        return []

    def _search_eastmoney(self, query: str) -> List[Dict]:
        if not self.eastmoney_token:
            return []

        params = {
            "input": query,
            "type": "14",
            "token": self.eastmoney_token,
            "count": "10",
        }
        headers = {"User-Agent": "Mozilla/5.0"}
        try:
            response = requests.get(
                self.eastmoney_suggest_url,
                params=params,
                headers=headers,
                timeout=self.online_timeout,
            )
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError):
            return []

        data = payload.get("QuotationCodeTable", {}).get("Data", [])
        if not isinstance(data, list):
            return []

        results: List[Dict] = []
        for item in data:
            parsed = self._parse_eastmoney_result(item, query)
            if parsed:
                results.append(parsed)
        return results

    def _parse_eastmoney_result(self, item: Dict, query: str) -> Optional[Dict]:
        if not isinstance(item, dict):
            return None

        name = str(item.get("Name", "")).strip()
        raw_code = str(item.get("Code", "")).strip()
        security_type = str(item.get("SecurityTypeName", "")).strip()
        classify = str(item.get("Classify", "")).strip()
        if not name or not raw_code:
            return None
        if classify not in {"AStock", "Index", "HK"}:
            return None

        normalized_code = self._normalize_online_code(item)
        if not normalized_code:
            return None

        normalized_query = normalize_stock_code(query).lower()
        raw_query = query.strip().lower()
        exact_name = raw_query == name.lower()
        exact_code = normalized_query == normalized_code.lower() or raw_query == raw_code.lower()
        score = 88 if (exact_name or exact_code) else 72
        if exact_name and exact_code:
            score = 96

        category = classify
        if security_type == "指数":
            category = "指数"

        return {
            "name": name,
            "code": normalized_code,
            "market": get_market_label(normalized_code),
            "category": category,
            "score": score,
            "match_type": "online_eastmoney",
        }

    def _normalize_online_code(self, item: Dict) -> Optional[str]:
        quote_id = str(item.get("QuoteID", "")).strip()
        raw_code = str(item.get("Code", "")).strip()
        if not raw_code:
            return None

        prefix = ""
        symbol = raw_code
        if "." in quote_id:
            prefix, symbol = quote_id.split(".", 1)

        if prefix == "1":
            return f"sh{symbol.zfill(6)}"
        if prefix == "0":
            return f"sz{symbol.zfill(6)}"
        if prefix == "116":
            return f"{symbol.zfill(5)}.HK"

        security_type = str(item.get("SecurityTypeName", "")).strip()
        classify = str(item.get("Classify", "")).strip()
        if classify == "HK" or "港" in security_type:
            return f"{raw_code.zfill(5)}.HK"
        if "沪" in security_type:
            return f"sh{raw_code.zfill(6)}"
        if "深" in security_type or "创业" in security_type:
            return f"sz{raw_code.zfill(6)}"
        return normalize_stock_code(raw_code)

    def _search_sina_by_code(self, normalized_code: str) -> Optional[Dict]:
        symbol = extract_symbol(normalized_code)
        headers = {"User-Agent": "Mozilla/5.0"}
        try:
            response = requests.get(
                f"{self.sina_suggest_url}{symbol}",
                headers=headers,
                timeout=self.online_timeout,
            )
            response.raise_for_status()
        except requests.RequestException:
            return None

        match = re.search(r'"([^"]+)"', response.text)
        if not match:
            return None

        entries = [item for item in match.group(1).split(";") if item.strip()]
        for entry in entries:
            parts = entry.split(",")
            if len(parts) < 5:
                continue
            sina_code = normalize_stock_code(parts[0].strip())
            if sina_code.lower() != normalized_code.lower():
                continue
            name = parts[4].strip()
            if not name:
                continue
            return {
                "name": name,
                "code": sina_code,
                "market": get_market_label(sina_code),
                "category": "",
                "score": 86,
                "match_type": "online_sina",
            }
        return None

    def _persist_online_result(self, item: Dict) -> None:
        name = str(item.get("name", "")).strip()
        code = normalize_stock_code(str(item.get("code", "")).strip())
        if not name or not is_valid_stock_code(code):
            return

        existing = self.base_stock_db.get(name)
        if existing and normalize_stock_code(existing.get("code", "")) == code:
            return

        try:
            stock_pool = load_stock_pool()
            if stock_pool.get(name) == code:
                self.base_stock_db.setdefault(
                    name,
                    {
                        "code": code,
                        "market": item.get("market") or get_market_label(code),
                        "category": item.get("category", ""),
                    },
                )
                return

            stock_pool[name] = code
            save_stock_pool(stock_pool)
            self.base_stock_db[name] = {
                "code": code,
                "market": item.get("market") or get_market_label(code),
                "category": item.get("category", ""),
            }
            self.search_cache.clear()
        except OSError:
            return
    
    def _calculate_fuzzy_score(self, text: str, query: str) -> int:
        """计算模糊匹配分数"""
        if query in text:
            # 基础分数
            base_score = 80
            
            # 位置加分：越靠前分数越高
            position = text.find(query)
            if position == 0:
                base_score += 10
            elif position < len(text) // 2:
                base_score += 5
            
            # 长度匹配加分：查询词越长分数越高
            length_bonus = min(len(query) * 2, 10)
            base_score += length_bonus
            
            return min(base_score, 95)
        return 0
    
    def _deduplicate_results(self, results: List[Dict]) -> List[Dict]:
        """去重结果"""
        seen_codes = set()
        unique_results = []
        for result in results:
            if result['code'] not in seen_codes:
                seen_codes.add(result['code'])
                unique_results.append(result)
        return unique_results
    
    def _sort_results(self, results: List[Dict], query: str) -> List[Dict]:
        """排序结果"""
        # 按分数排序，分数相同时按名称长度排序
        return sorted(results, key=lambda x: (-x['score'], len(x['name'])))
    
    def get_stock_info(self, code: str) -> Optional[Dict]:
        """获取股票详细信息"""
        normalized = normalize_stock_code(code)
        # 从基础数据库查找
        for name, info in self.base_stock_db.items():
            if info['code'] == normalized:
                return {
                    'name': name,
                    'code': normalized,
                    'market': info['market'],
                    'category': info.get('category', ''),
                    'source': 'local'
                }
        
        # 如果本地没有，在线补充股票名称
        online_matches = self._online_search(extract_symbol(normalized))
        for item in online_matches:
            if item["code"].lower() == normalized.lower():
                self._persist_online_result(item)
                return {
                    'name': item['name'],
                    'code': normalized,
                    'market': item['market'],
                    'category': item.get('category', ''),
                    'source': item.get('match_type', 'online'),
                }

        if is_valid_stock_code(normalized):
            online_item = self._search_sina_by_code(normalized)
            if online_item:
                self._persist_online_result(online_item)
                return {
                    'name': online_item['name'],
                    'code': normalized,
                    'market': online_item['market'],
                    'category': online_item.get('category', ''),
                    'source': online_item.get('match_type', 'online'),
                }

        return None
    
    def suggest_keywords(self, partial_query: str) -> List[str]:
        """建议搜索关键词"""
        suggestions = []
        partial_lower = partial_query.lower()
        
        # 从股票名称中提取建议
        for name in self.base_stock_db.keys():
            if partial_lower in name.lower() and len(suggestions) < 5:
                suggestions.append(name)
        
        # 从分类中提取建议
        categories = set()
        for info in self.base_stock_db.values():
            if 'category' in info:
                categories.add(info['category'])
        
        for category in categories:
            if partial_lower in category.lower() and len(suggestions) < 8:
                suggestions.append(category)
        
        return suggestions[:8]


# 全局搜索器实例
stock_searcher = StockSearcher() 
