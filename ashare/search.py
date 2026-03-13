"""
股票搜索工具模块

提供智能股票搜索功能，支持多种搜索方式和数据源
"""

import re
import requests
import json
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import time

from ashare.stock_pool import (
    get_base_stock_catalog,
    get_market_label,
    is_valid_stock_code,
    normalize_stock_code,
)


class StockSearcher:
    """智能股票搜索器"""
    
    def __init__(self):
        """初始化搜索器"""
        self.base_stock_db = get_base_stock_catalog()
        self.search_cache = {}
        self.cache_expiry = 3600  # 缓存1小时
    
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
        
        # 6. 智能代码格式识别
        if not results:
            code_validation = self._validate_and_create_stock(query)
            if code_validation:
                results.append(code_validation)
        
        # 7. 尝试在线搜索（如果本地搜索无结果）
        if not results:
            online_results = self._online_search(query)
            results.extend(online_results)
        
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
        """在线搜索股票（预留接口）"""
        # 这里可以集成第三方股票数据API
        # 例如：东方财富、新浪财经等
        return []
    
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
        
        # 如果本地没有，可以尝试在线获取
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
