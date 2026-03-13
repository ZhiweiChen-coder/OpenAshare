"""
股票分析器核心模块

主要的股票分析器类，整合数据获取、技术指标计算和分析逻辑
"""

import pandas as pd
from typing import Callable, Dict, List, Optional, Any
import numpy as np
import os
import pytz
from datetime import datetime

from ashare.data import DataFetcher
from ashare.indicators import TechnicalIndicators
from ashare.report import ReportGenerator
from ashare.logging import get_logger
from ashare.signals import generate_trading_signals
from ashare.llm import LLMAnalyzer
from ashare.notify import PushNotifier
from ashare.config import Config

logger = get_logger(__name__)


class StockAnalyzer:
    """股票分析器主类"""
    
    def __init__(self, stock_info: Dict[str, str], count: int = 120, 
                 llm_api_key: Optional[str] = None, llm_base_url: Optional[str] = None, 
                 llm_model: Optional[str] = None, enable_push: bool = True, 
                 config: Optional[Config] = None):
        """
        初始化股票分析器

        Args:
            stock_info: 股票信息字典 {股票名称: 股票代码}
            count: 获取的数据条数
            llm_api_key: LLM API密钥，默认从配置文件获取
            llm_base_url: LLM API基础URL，默认从配置文件获取
            llm_model: LLM 模型名称，默认从配置文件获取
            enable_push: 是否启用推送通知
            config: 配置实例，如果不提供则创建新的
        """
        logger.info("初始化股票分析器...")
        
        # 加载配置
        self.config = config or Config()
        
        # 股票池信息
        self.stock_names = stock_info if stock_info else self._get_default_stock_pool()
        self.stock_codes = list(self.stock_names.values())
        self.count = count
        
        # 数据存储
        self.data_dict = {}
        self.processed_data_dict = {}
        
        # 配置相关
        self.enable_push = enable_push

        # 初始化子组件
        self.data_fetcher = DataFetcher(default_count=self.count)
        self.indicators_calculator = TechnicalIndicators()
        self.report_generator = ReportGenerator()
        self._matplotlib_fonts_ready = False
        
        # 初始化交互式图表生成器
        try:
            from ashare.charts import InteractiveCharts
            self.interactive_charts = InteractiveCharts()
            logger.info("交互式图表功能已启用")
        except ImportError as e:
            logger.warning(f"无法启用交互式图表功能: {str(e)}")
            self.interactive_charts = None
        
        # 从配置获取API密钥和基础URL
        self.llm_api_key = llm_api_key or self.config.llm_api_key
        self.llm_base_url = llm_base_url or self.config.llm_base_url
        self.llm_model = llm_model or self.config.llm_model

        # 初始化LLM分析器
        self.llm = LLMAnalyzer(self.llm_api_key, self.llm_base_url, self.llm_model) if self.llm_api_key else None
        
        # 初始化推送通知器
        self.push_notifier = PushNotifier() if self.enable_push else None
        
        logger.info(f"股票分析器初始化完成，将分析{len(self.stock_codes)}只股票")

    def _setup_matplotlib_fonts(self):
        """设置matplotlib中文字体"""
        if self._matplotlib_fonts_ready:
            return
        try:
            import matplotlib.font_manager as fm
            import matplotlib.pyplot as plt

            plt.rcParams['font.sans-serif'] = ['SimHei']
            plt.rcParams['axes.unicode_minus'] = False

            # 检查字体文件是否存在
            font_path = './static/fonts/微软雅黑.ttf'
            if os.path.exists(font_path):
                try:
                    # 注册字体文件
                    custom_font = fm.FontProperties(fname=font_path)
                    fm.fontManager.addfont(font_path)
                    # 设置字体
                    plt.rcParams['font.sans-serif'] = [custom_font.get_name()]
                    logger.info("成功加载自定义字体")
                except Exception as e:
                    logger.warning(f"字体文件加载失败，使用默认字体: {str(e)}")
            else:
                logger.info(f"字体文件不存在: {font_path}，使用默认字体")
                plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans', 'Arial Unicode MS']
            self._matplotlib_fonts_ready = True
                
        except Exception as e:
            logger.error(f"设置matplotlib字体失败: {str(e)}")

    def get_stock_name(self, code: str) -> str:
        """根据股票代码获取股票名称"""
        return {v: k for k, v in self.stock_names.items()}.get(code, code)

    def fetch_data(self) -> bool:
        """
        获取所有股票数据
        
        Returns:
            是否成功获取数据
        """
        logger.info("开始获取股票数据...")
        
        try:
            # 批量获取数据
            self.data_dict = self.data_fetcher.fetch_multiple_stocks(self.stock_codes, self.count)
            
            success_count = len(self.data_dict)
            total_count = len(self.stock_codes)
            
            logger.info(f"数据获取完成: {success_count}/{total_count} 只股票成功")
            
            if success_count == 0:
                logger.error("所有股票数据获取失败")
                return False
                
            return True
            
        except Exception as e:
            logger.error(f"批量获取数据失败: {str(e)}")
            return False

    def calculate_indicators(self) -> bool:
        """
        计算技术指标
        
        Returns:
            是否成功计算指标
        """
        logger.info("开始计算技术指标...")
        
        try:
            success_count = 0
            for code, df in self.data_dict.items():
                try:
                    # 计算技术指标
                    df_with_indicators = self.indicators_calculator.calculate_all_indicators(df)
                    if df_with_indicators is not None:
                        self.processed_data_dict[code] = df_with_indicators
                        success_count += 1
                        logger.debug(f"股票 {code} 技术指标计算成功")
                    else:
                        logger.warning(f"股票 {code} 技术指标计算失败")
                        
                except Exception as e:
                    logger.error(f"股票 {code} 技术指标计算出错: {str(e)}")
            
            logger.info(f"技术指标计算完成: {success_count}/{len(self.data_dict)} 只股票成功")
            return success_count > 0
            
        except Exception as e:
            logger.error(f"技术指标计算失败: {str(e)}")
            return False

    def analyze_single_stock(self, code: str) -> Dict[str, Any]:
        """
        分析单只股票
        
        Args:
            code: 股票代码
            
        Returns:
            分析结果字典
        """
        analysis_data = {}
        
        try:
            stock_name = self.get_stock_name(code)
            logger.debug(f"开始分析股票: {stock_name} ({code})")
            
            # 检查是否有处理后的数据
            if code not in self.processed_data_dict:
                analysis_data['数据状态'] = f'数据获取失败'
                analysis_data['股票名称'] = stock_name
                analysis_data['股票代码'] = code
                return analysis_data
                
            df = self.processed_data_dict[code]
            
            # 基础数据分析
            analysis_data['基础数据'] = self._analyze_basic_data(df, stock_name)
            analysis_data['股票名称'] = stock_name
            analysis_data['股票代码'] = code
            
            # 生成技术分析建议
            analysis_data['技术分析建议'] = generate_trading_signals(df)
            
            # 存储处理后的数据供图表生成使用
            analysis_data['processed_data'] = df
            
            logger.debug(f"股票 {stock_name} 分析完成")
            return analysis_data
            
        except Exception as e:
            logger.error(f"分析股票 {code} 失败: {str(e)}")
            analysis_data['数据状态'] = f'分析失败: {str(e)}'
            return analysis_data

    def _analyze_basic_data(self, df: pd.DataFrame, stock_name: str) -> Dict[str, Any]:
        """分析股票基础数据"""
        try:
            latest_data = df.iloc[-1]
            previous_data = df.iloc[-2] if len(df) > 1 else latest_data
            
            # 基础价格数据
            current_price = latest_data['close']
            open_price = latest_data['open']
            high_price = latest_data['high']
            low_price = latest_data['low']
            volume = latest_data['volume']
            
            # 涨跌计算
            prev_close = previous_data['close']
            change = current_price - prev_close
            change_pct = (change / prev_close) * 100 if prev_close != 0 else 0
            
            # 振幅计算
            amplitude = ((high_price - low_price) / prev_close) * 100 if prev_close != 0 else 0
            
            # 技术指标最新值
            indicators = self.indicators_calculator.get_latest_indicator_values(df)
            
            basic_data = {
                '股票名称': stock_name,
                '最新价格': f"{current_price:.2f}",
                '涨跌': f"{change:+.2f}",
                '涨跌幅': f"{change_pct:+.2f}%",
                '开盘价': f"{open_price:.2f}",
                '最高价': f"{high_price:.2f}",
                '最低价': f"{low_price:.2f}",
                '成交量': f"{volume:.0f}",
                '振幅': f"{amplitude:.2f}%",
                '数据状态': '正常'
            }
            
            # 添加重要技术指标
            if 'MA5' in indicators and not pd.isna(indicators['MA5']):
                basic_data['MA5'] = f"{indicators['MA5']:.2f}"
            if 'MA20' in indicators and not pd.isna(indicators['MA20']):
                basic_data['MA20'] = f"{indicators['MA20']:.2f}"
            if 'RSI' in indicators and not pd.isna(indicators['RSI']):
                basic_data['RSI'] = f"{indicators['RSI']:.1f}"
            if 'MACD' in indicators and not pd.isna(indicators['MACD']):
                basic_data['MACD'] = f"{indicators['MACD']:.4f}"
            
            return basic_data
            
        except Exception as e:
            logger.error(f"分析基础数据失败: {str(e)}")
            return {'数据状态': f'基础数据分析失败: {str(e)}'}

    def generate_pool_ai_analysis(self) -> Optional[str]:
        """
        生成股票池的AI综合分析
        
        Returns:
            AI分析结果文本，失败时返回None
        """
        if not self.llm:
            logger.warning("LLM未配置，跳过AI分析")
            return None
            
        try:
            logger.info("开始生成股票池AI分析...")
            
            # 收集所有股票的基本信息
            pool_summary = []
            for code in self.processed_data_dict.keys():
                df = self.processed_data_dict[code]
                stock_name = self.get_stock_name(code)
                
                latest = df.iloc[-1]
                prev = df.iloc[-2] if len(df) > 1 else latest
                
                change_pct = ((latest['close'] - prev['close']) / prev['close']) * 100
                
                pool_summary.append({
                    'name': stock_name,
                    'code': code,
                    'price': latest['close'],
                    'change_pct': change_pct,
                    'volume': latest['volume'],
                    'rsi': latest.get('RSI', 0),
                    'macd': latest.get('MACD', 0)
                })
            
            # 构造AI分析prompt
            analysis_text = self.llm.generate_pool_analysis(pool_summary)
            
            if analysis_text:
                logger.info("股票池AI分析生成成功")
                self.pool_ai_analysis = analysis_text
                return analysis_text
            else:
                logger.warning("股票池AI分析生成失败")
                return None
                
        except Exception as e:
            logger.error(f"生成股票池AI分析失败: {str(e)}")
            return None

    def generate_fundamental_analysis(self, analysis_params: Dict[str, Any]) -> Optional[str]:
        """
        生成基本面分析
        
        Args:
            analysis_params: 分析参数字典
            
        Returns:
            基本面分析结果文本，失败时返回None
        """
        if not self.llm:
            logger.warning("LLM未配置，跳过基本面分析")
            return None
            
        try:
            logger.info("开始生成基本面分析...")
            
            # 收集股票的基本信息和技术数据
            fundamental_data = []
            for code in self.processed_data_dict.keys():
                df = self.processed_data_dict[code]
                stock_name = self.get_stock_name(code)
                
                # 计算一些基本的财务指标（基于技术数据的近似值）
                recent_data = df.tail(60)  # 最近60个交易日
                
                # 价格相关指标
                current_price = df.iloc[-1]['close']
                high_52w = df['high'].max()
                low_52w = df['low'].min()
                avg_volume = df['volume'].mean()
                price_volatility = df['close'].pct_change().std() * 100
                
                # 技术指标
                rsi = df.iloc[-1].get('RSI', 0)
                macd = df.iloc[-1].get('MACD', 0)
                
                # 构建基本面数据字典
                stock_fundamental = {
                    'name': stock_name,
                    'code': code,
                    'current_price': current_price,
                    'high_52w': high_52w,
                    'low_52w': low_52w,
                    'price_volatility': price_volatility,
                    'avg_volume': avg_volume,
                    'rsi': rsi,
                    'macd': macd,
                    'price_trend': self._calculate_trend_strength(df),
                    'volume_trend': self._calculate_volume_trend(df)
                }
                
                fundamental_data.append(stock_fundamental)
            
            # 调用LLM生成基本面分析
            analysis_text = self.llm.generate_fundamental_analysis(fundamental_data, analysis_params)
            
            if analysis_text:
                logger.info("基本面分析生成成功")
                return analysis_text
            else:
                logger.warning("基本面分析生成失败")
                return None
                
        except Exception as e:
            logger.error(f"生成基本面分析失败: {str(e)}")
            return None

    def generate_sector_rotation_analysis(self) -> Optional[str]:
        """
        生成板块轮动分析
        
        Returns:
            板块轮动分析结果文本，失败时返回None
        """
        if not self.llm:
            logger.warning("LLM未配置，跳过板块轮动分析")
            return None
            
        try:
            logger.info("开始生成板块轮动分析...")
            
            # 收集不同股票的表现数据
            sector_data = []
            for code in self.processed_data_dict.keys():
                df = self.processed_data_dict[code]
                stock_name = self.get_stock_name(code)
                
                # 计算不同时间周期的表现
                performance_data = {
                    'name': stock_name,
                    'code': code,
                    'daily_change': self._calculate_change(df, 1),
                    'weekly_change': self._calculate_change(df, 5),
                    'monthly_change': self._calculate_change(df, 22),
                    'quarterly_change': self._calculate_change(df, 66),
                    'volume_ratio': self._calculate_volume_ratio(df),
                    'momentum': self._calculate_momentum(df)
                }
                
                sector_data.append(performance_data)
            
            # 调用LLM生成板块轮动分析
            analysis_text = self.llm.generate_sector_rotation_analysis(sector_data)
            
            if analysis_text:
                logger.info("板块轮动分析生成成功")
                return analysis_text
            else:
                logger.warning("板块轮动分析生成失败")
                return None
                
        except Exception as e:
            logger.error(f"生成板块轮动分析失败: {str(e)}")
            return None

    def generate_trend_strength_analysis(self) -> Optional[str]:
        """
        生成趋势强度分析
        
        Returns:
            趋势强度分析结果文本，失败时返回None
        """
        if not self.llm:
            logger.warning("LLM未配置，跳过趋势强度分析")
            return None
            
        try:
            logger.info("开始生成趋势强度分析...")
            
            # 收集趋势强度数据
            trend_data = []
            for code in self.processed_data_dict.keys():
                df = self.processed_data_dict[code]
                stock_name = self.get_stock_name(code)
                
                # 计算多个趋势强度指标
                trend_strength = {
                    'name': stock_name,
                    'code': code,
                    'trend_direction': self._calculate_trend_direction(df),
                    'trend_strength': self._calculate_trend_strength(df),
                    'support_level': self._calculate_support_resistance(df)['support'],
                    'resistance_level': self._calculate_support_resistance(df)['resistance'],
                    'breakout_potential': self._calculate_breakout_potential(df),
                    'volume_confirmation': self._check_volume_confirmation(df)
                }
                
                trend_data.append(trend_strength)
            
            # 调用LLM生成趋势强度分析
            analysis_text = self.llm.generate_trend_strength_analysis(trend_data)
            
            if analysis_text:
                logger.info("趋势强度分析生成成功")
                return analysis_text
            else:
                logger.warning("趋势强度分析生成失败")
                return None
                
        except Exception as e:
            logger.error(f"生成趋势强度分析失败: {str(e)}")
            return None

    def generate_single_stock_analysis(
        self,
        stock_name: str,
        stock_data: Dict,
        analysis_depth: str,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> Optional[str]:
        """
        生成单股深度分析
        
        Args:
            stock_name: 股票名称
            stock_data: 股票数据
            analysis_depth: 分析深度（快速分析/深度分析/全面评估）
            
        Returns:
            单股分析结果文本，失败时返回None
        """
        if not self.llm:
            logger.warning("LLM未配置，跳过单股分析")
            return None
            
        try:
            def report(progress: int, message: str) -> None:
                if progress_callback:
                    progress_callback(progress, message)

            logger.info(f"开始生成 {stock_name} 的单股分析...")
            report(10, f"已确认标的 {stock_name}，准备整理技术与统计数据")
            
            # 获取股票的完整数据
            stock_code = None
            for name, code in self.stock_names.items():
                if name == stock_name:
                    stock_code = code
                    break
            
            if not stock_code or stock_code not in self.processed_data_dict:
                logger.error(f"未找到股票 {stock_name} 的数据")
                return None
            
            df = self.processed_data_dict[stock_code]
            report(28, "已读取本地行情与技术指标，开始构建分析上下文")
            
            # 计算更多统计数据
            current_price = df.iloc[-1]['close']
            price_5d_ago = df.iloc[-6]['close'] if len(df) >= 6 else current_price
            price_10d_ago = df.iloc[-11]['close'] if len(df) >= 11 else current_price
            price_20d_ago = df.iloc[-21]['close'] if len(df) >= 21 else current_price
            price_30d_ago = df.iloc[-31]['close'] if len(df) >= 31 else current_price
            
            # 构建详细的单股分析数据
            detailed_data = {
                'name': stock_name,
                'code': stock_code,
                'analysis_depth': analysis_depth,
                'price_data': {
                    'current': current_price,
                    'open': df.iloc[-1]['open'],
                    'high': df.iloc[-1]['high'],
                    'low': df.iloc[-1]['low'],
                    'high_52w': df['high'].max(),
                    'low_52w': df['low'].min(),
                    'high_52w_date': df.loc[df['high'].idxmax(), 'date'] if 'date' in df.columns else None,
                    'low_52w_date': df.loc[df['low'].idxmin(), 'date'] if 'date' in df.columns else None,
                    'avg_price_5d': df.tail(5)['close'].mean(),
                    'avg_price_10d': df.tail(10)['close'].mean(),
                    'avg_price_20d': df.tail(20)['close'].mean(),
                    'avg_price_30d': df.tail(30)['close'].mean(),
                    'volatility': df['close'].pct_change().std() * 100,
                    'price_change_1d': self._calculate_change(df, 1),
                    'price_change_5d': self._calculate_change(df, 5),
                    'price_change_10d': self._calculate_change(df, 10),
                    'price_change_20d': self._calculate_change(df, 20),
                    'price_change_30d': self._calculate_change(df, 30),
                    'price_position_52w': (current_price - df['low'].min()) / (df['high'].max() - df['low'].min()) * 100 if df['high'].max() != df['low'].min() else 50
                },
                'volume_data': {
                    'current': df.iloc[-1]['volume'],
                    'avg_volume_5d': df.tail(5)['volume'].mean(),
                    'avg_volume_10d': df.tail(10)['volume'].mean(),
                    'avg_volume_20d': df.tail(20)['volume'].mean(),
                    'avg_volume_30d': df.tail(30)['volume'].mean(),
                    'volume_ratio': self._calculate_volume_ratio(df),
                    'volume_trend': self._calculate_volume_trend(df),
                    'max_volume_30d': df.tail(30)['volume'].max(),
                    'min_volume_30d': df.tail(30)['volume'].min()
                },
                'technical_indicators': {
                    'rsi': df.iloc[-1].get('RSI', 0),
                    'rsi_5d_ago': df.iloc[-6].get('RSI', 0) if len(df) >= 6 else 0,
                    'rsi_10d_ago': df.iloc[-11].get('RSI', 0) if len(df) >= 11 else 0,
                    'macd': df.iloc[-1].get('MACD', 0),
                    'macd_signal': df.iloc[-1].get('MACD_Signal', 0),
                    'macd_hist': df.iloc[-1].get('MACD_Hist', 0),
                    'ma5': df.iloc[-1].get('MA5', 0),
                    'ma10': df.iloc[-1].get('MA10', 0) if 'MA10' in df.columns else 0,
                    'ma20': df.iloc[-1].get('MA20', 0),
                    'ma30': df.iloc[-1].get('MA30', 0) if 'MA30' in df.columns else 0,
                    'ma60': df.iloc[-1].get('MA60', 0) if 'MA60' in df.columns else 0,
                    'bollinger_upper': df.iloc[-1].get('BOLL_UB', 0),
                    'bollinger_middle': df.iloc[-1].get('BOLL', 0),
                    'bollinger_lower': df.iloc[-1].get('BOLL_LB', 0),
                    'bollinger_width': (df.iloc[-1].get('BOLL_UB', 0) - df.iloc[-1].get('BOLL_LB', 0)) / df.iloc[-1].get('BOLL', 1) * 100 if df.iloc[-1].get('BOLL', 0) > 0 else 0,
                    'momentum': self._calculate_momentum(df)
                },
                'trend_analysis': {
                    'direction': self._calculate_trend_direction(df),
                    'strength': self._calculate_trend_strength(df),
                    'support_resistance': self._calculate_support_resistance(df),
                    'breakout_potential': self._calculate_breakout_potential(df)
                },
                'recent_performance': {
                    'best_day_30d': df.tail(30)['close'].pct_change().max() * 100,
                    'worst_day_30d': df.tail(30)['close'].pct_change().min() * 100,
                    'up_days_30d': (df.tail(30)['close'].pct_change() > 0).sum(),
                    'down_days_30d': (df.tail(30)['close'].pct_change() < 0).sum(),
                    'avg_daily_change': df.tail(30)['close'].pct_change().mean() * 100
                }
            }
            report(46, "分析上下文整理完成，准备调用 AI 生成报告")
            
            # 调用LLM生成单股分析
            analysis_text = self.llm.generate_single_stock_analysis(detailed_data, progress_callback=progress_callback)
            
            if analysis_text:
                logger.info(f"{stock_name} 单股分析生成成功")
                report(100, "AI 报告已返回，结果已写入当前页面")
                return analysis_text
            else:
                logger.warning(f"{stock_name} 单股分析生成失败")
                report(100, "AI 未返回有效报告")
                return None
                
        except Exception as e:
            logger.error(f"生成 {stock_name} 单股分析失败: {str(e)}")
            return None

    def generate_market_insights(self, insight_type: str) -> Optional[str]:
        """
        生成市场洞察
        
        Args:
            insight_type: 洞察类型
            
        Returns:
            市场洞察结果文本，失败时返回None
        """
        if not self.llm:
            logger.warning("LLM未配置，跳过市场洞察")
            return None
            
        try:
            logger.info(f"开始生成市场洞察: {insight_type}")
            
            # 收集市场整体数据
            market_data = {
                'insight_type': insight_type,
                'market_summary': self._generate_market_summary(),
                'sector_performance': self._analyze_sector_performance(),
                'market_breadth': self._calculate_market_breadth(),
                'sentiment_indicators': self._analyze_sentiment_indicators()
            }
            
            # 调用LLM生成市场洞察
            analysis_text = self.llm.generate_market_insights(market_data)
            
            if analysis_text:
                logger.info("市场洞察生成成功")
                return analysis_text
            else:
                logger.warning("市场洞察生成失败")
                return None
                
        except Exception as e:
            logger.error(f"生成市场洞察失败: {str(e)}")
            return None

    def generate_html_report(self) -> str:
        """
        生成HTML分析报告
        
        Returns:
            HTML报告内容
        """
        logger.info("开始生成HTML报告...")
        
        try:
            self._setup_matplotlib_fonts()
            # 分析所有股票
            stock_analyses = []
            for code in self.processed_data_dict.keys():
                stock_name = self.get_stock_name(code)
                analysis_data = self.analyze_single_stock(code)
                stock_analyses.append((stock_name, analysis_data))
            
            # 生成AI综合分析
            ai_analysis = self.generate_pool_ai_analysis()
            
            # 为每个股票生成交互式图表
            if self.interactive_charts:
                for stock_name, analysis in stock_analyses:
                    try:
                        if 'processed_data' in analysis:
                            df = analysis['processed_data']
                            # 生成主要分析图表
                            interactive_chart_html = self.interactive_charts.create_main_analysis_chart(
                                df, stock_name
                            )
                            analysis['interactive_chart'] = interactive_chart_html
                            
                            # 生成多时间框架图表
                            multi_timeframe_chart_html = self._generate_multi_timeframe_chart(stock_name, df)
                            if multi_timeframe_chart_html:
                                analysis['multi_timeframe_chart'] = multi_timeframe_chart_html
                            
                            logger.info(f"为{stock_name}生成交互式图表成功")
                    except Exception as e:
                        logger.warning(f"为{stock_name}生成交互式图表失败: {str(e)}")
                        analysis['interactive_chart'] = None
            
            # 使用报告生成器生成HTML
            html_content = self.report_generator.generate_report(
                stock_analyses, 
                getattr(self, 'pool_ai_analysis', None)
            )
            
            logger.info("HTML报告生成完成")
            return html_content
            
        except Exception as e:
            logger.error(f"生成HTML报告失败: {str(e)}")
            raise

    def run_analysis(self, output_path: str = 'public/index.html') -> Optional[str]:
        """
        运行完整的股票分析流程
        
        Args:
            output_path: 输出文件路径
            
        Returns:
            成功时返回输出文件路径，失败时返回None
        """
        logger.info("开始运行股票分析...")

        try:
            # 1. 获取数据
            logger.info("步骤1: 获取股票数据")
            if not self.fetch_data():
                logger.error("数据获取失败，终止分析")
                return None

            # 2. 计算技术指标
            logger.info("步骤2: 计算技术指标")
            if not self.calculate_indicators():
                logger.error("技术指标计算失败，终止分析")
                return None

            # 3. 生成报告
            logger.info("步骤3: 生成HTML报告")
            html_report = self.generate_html_report()

            # 4. 保存报告
            logger.info("步骤4: 保存报告文件")
            success = self._save_report(html_report, output_path)
            
            if success:
                logger.info(f"✅ 分析完成！报告已保存到: {output_path}")
                return output_path
            else:
                logger.error("保存报告失败")
                return None

        except Exception as e:
            logger.error(f"分析过程出错: {str(e)}")
            return None

    def _save_report(self, html_content: str, output_path: str) -> bool:
        """
        保存HTML报告到文件
        
        Args:
            html_content: HTML内容
            output_path: 输出文件路径
            
        Returns:
            是否保存成功
        """
        try:
            # 创建输出目录
            output_dir = os.path.dirname(output_path)
            if output_dir and not os.path.exists(output_dir):
                os.makedirs(output_dir)

            # 写入HTML报告
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(html_content)
                
            logger.info(f"报告已保存到: {output_path}")
            
            # 尝试打开浏览器
            try:
                import webbrowser
                webbrowser.open(output_path)
            except Exception as e:
                logger.warning(f"打开浏览器失败: {str(e)}")
            
            return True
            
        except Exception as e:
            logger.error(f"保存报告文件失败: {str(e)}")
            return False
    
    def _get_default_stock_pool(self) -> Dict[str, str]:
        """
        获取默认的股票池
        
        Returns:
            默认股票池字典
        """
        return {
            '上证指数': 'sh000001',
            '深证成指': 'sz399001',
            '创业板指': 'sz399006'
        }
    
    def _generate_multi_timeframe_chart(self, stock_name: str, daily_df: pd.DataFrame) -> Optional[str]:
        """
        生成多时间框架对比图表
        
        Args:
            stock_name: 股票名称
            daily_df: 日线数据DataFrame
            
        Returns:
            多时间框架图表的HTML字符串，失败时返回None
        """
        if not self.interactive_charts:
            return None
            
        try:
            # 获取股票代码
            stock_code = None
            for code, name in self.stock_names.items():
                if name == stock_name:
                    stock_code = code
                    break
            
            if not stock_code:
                logger.warning(f"未找到{stock_name}对应的股票代码")
                return None
            
            # 获取多时间框架数据
            logger.info(f"开始获取{stock_name}的多时间框架数据")
            multi_data = self.data_fetcher.fetch_multi_timeframe_data(stock_code, 60)  # 获取60个周期
            
            if not multi_data:
                logger.warning(f"未获取到{stock_name}的多时间框架数据")
                return None
            
            # 为每个时间框架计算简单技术指标
            for timeframe, df in multi_data.items():
                if len(df) >= 20:  # 至少需要20个数据点计算MA20
                    df['MA20'] = df['close'].rolling(20).mean()
            
            # 生成多时间框架图表
            chart_html = self.interactive_charts.create_multi_timeframe_chart(
                multi_data, stock_name
            )
            
            logger.info(f"为{stock_name}生成多时间框架图表成功")
            return chart_html
            
        except Exception as e:
            logger.warning(f"生成{stock_name}多时间框架图表失败: {str(e)}")
            return None 

    # 辅助方法
    def _calculate_trend_strength(self, df: pd.DataFrame) -> float:
        """计算趋势强度"""
        try:
            # 使用移动平均线斜率计算趋势强度
            ma20 = df['close'].rolling(window=20).mean()
            trend_slope = (ma20.iloc[-1] - ma20.iloc[-20]) / ma20.iloc[-20] * 100
            return abs(trend_slope)
        except:
            return 0.0

    def _calculate_volume_trend(self, df: pd.DataFrame) -> str:
        """计算成交量趋势"""
        try:
            recent_vol = df.tail(10)['volume'].mean()
            historical_vol = df.tail(30)['volume'].mean()
            
            ratio = recent_vol / historical_vol
            if ratio > 1.2:
                return "放量"
            elif ratio < 0.8:
                return "缩量"
            else:
                return "平量"
        except:
            return "未知"

    def _calculate_change(self, df: pd.DataFrame, periods: int) -> float:
        """计算指定周期的涨跌幅"""
        try:
            if len(df) < periods:
                return 0.0
            current = df.iloc[-1]['close']
            previous = df.iloc[-(periods+1)]['close']
            return ((current - previous) / previous) * 100
        except:
            return 0.0

    def _calculate_volume_ratio(self, df: pd.DataFrame) -> float:
        """计算量比"""
        try:
            current_volume = df.iloc[-1]['volume']
            avg_volume = df.tail(30)['volume'].mean()
            return current_volume / avg_volume if avg_volume > 0 else 1.0
        except:
            return 1.0

    def _calculate_momentum(self, df: pd.DataFrame) -> float:
        """计算动量指标"""
        try:
            current = df.iloc[-1]['close']
            previous = df.iloc[-10]['close'] if len(df) > 10 else df.iloc[0]['close']
            return ((current - previous) / previous) * 100
        except:
            return 0.0

    def _calculate_trend_direction(self, df: pd.DataFrame) -> str:
        """计算趋势方向"""
        try:
            ma5 = df['close'].rolling(window=5).mean().iloc[-1]
            ma20 = df['close'].rolling(window=20).mean().iloc[-1]
            current_price = df.iloc[-1]['close']
            
            if current_price > ma5 > ma20:
                return "强势上涨"
            elif current_price > ma5 and ma5 < ma20:
                return "弱势上涨"
            elif current_price < ma5 < ma20:
                return "强势下跌"
            else:
                return "弱势下跌"
        except:
            return "横盘整理"

    def _calculate_support_resistance(self, df: pd.DataFrame) -> Dict[str, float]:
        """计算支撑阻力位"""
        try:
            recent_data = df.tail(60)
            current_price = df.iloc[-1]['close']
            
            # 简单的支撑阻力位计算
            high_levels = recent_data['high'].nlargest(3).mean()
            low_levels = recent_data['low'].nsmallest(3).mean()
            
            return {
                'support': low_levels,
                'resistance': high_levels
            }
        except:
            return {'support': 0.0, 'resistance': 0.0}

    def _calculate_breakout_potential(self, df: pd.DataFrame) -> str:
        """计算突破潜力"""
        try:
            current_price = df.iloc[-1]['close']
            support_resistance = self._calculate_support_resistance(df)
            
            support = support_resistance['support']
            resistance = support_resistance['resistance']
            
            distance_to_resistance = (resistance - current_price) / current_price * 100
            distance_to_support = (current_price - support) / current_price * 100
            
            if distance_to_resistance < 2:
                return "接近阻力位，突破概率高"
            elif distance_to_support < 2:
                return "接近支撑位，反弹概率高"
            else:
                return "在支撑阻力区间内"
        except:
            return "数据不足"

    def _check_volume_confirmation(self, df: pd.DataFrame) -> bool:
        """检查成交量确认"""
        try:
            recent_volume = df.tail(5)['volume'].mean()
            historical_volume = df.tail(20)['volume'].mean()
            
            return recent_volume > historical_volume * 1.2
        except:
            return False

    def _generate_market_summary(self) -> Dict[str, Any]:
        """生成市场总体概况"""
        total_stocks = len(self.processed_data_dict)
        rising_stocks = 0
        falling_stocks = 0
        
        for df in self.processed_data_dict.values():
            if len(df) >= 2:
                change = self._calculate_change(df, 1)
                if change > 0:
                    rising_stocks += 1
                elif change < 0:
                    falling_stocks += 1
        
        return {
            'total_stocks': total_stocks,
            'rising_stocks': rising_stocks,
            'falling_stocks': falling_stocks,
            'flat_stocks': total_stocks - rising_stocks - falling_stocks,
            'market_breadth': rising_stocks / total_stocks if total_stocks > 0 else 0
        }

    def _analyze_sector_performance(self) -> List[Dict[str, Any]]:
        """分析板块表现"""
        sector_performance = []
        
        for code in self.processed_data_dict.keys():
            df = self.processed_data_dict[code]
            stock_name = self.get_stock_name(code)
            
            performance = {
                'name': stock_name,
                'code': code,
                'daily_change': self._calculate_change(df, 1),
                'weekly_change': self._calculate_change(df, 5),
                'monthly_change': self._calculate_change(df, 22)
            }
            
            sector_performance.append(performance)
        
        return sorted(sector_performance, key=lambda x: x['daily_change'], reverse=True)

    def _calculate_market_breadth(self) -> Dict[str, float]:
        """计算市场广度指标"""
        advance_decline_ratio = self._generate_market_summary()['market_breadth']
        
        return {
            'advance_decline_ratio': advance_decline_ratio,
            'market_strength': advance_decline_ratio * 100
        }

    def _analyze_sentiment_indicators(self) -> Dict[str, Any]:
        """分析市场情绪指标"""
        high_volume_count = 0
        high_volatility_count = 0
        total_count = len(self.processed_data_dict)
        
        for df in self.processed_data_dict.values():
            try:
                # 检查成交量
                volume_ratio = self._calculate_volume_ratio(df)
                if volume_ratio > 1.5:
                    high_volume_count += 1
                
                # 检查波动率
                volatility = df['close'].pct_change().std() * 100
                if volatility > 3:  # 3%以上波动率认为是高波动
                    high_volatility_count += 1
            except:
                continue
        
        return {
            'high_volume_ratio': high_volume_count / total_count if total_count > 0 else 0,
            'high_volatility_ratio': high_volatility_count / total_count if total_count > 0 else 0,
            'market_activity_level': (high_volume_count + high_volatility_count) / (2 * total_count) if total_count > 0 else 0
        } 
