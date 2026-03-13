import json
import os
from typing import Callable, Dict, Any, Optional

import openai
import pandas as pd
from openai import OpenAI
import re


def format_analysis_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    格式化分析结果，确保输出格式统一

    Args:
        result (Dict[str, Any]): 原始分析结果

    Returns:
        Dict[str, Any]: 格式化后的结果
    """
    if not result:
        return {
            "AI分析结果": {
                "分析状态": "分析失败",
                "失败原因": "无法获取API响应",
                "技术分析": "数据获取失败，无法提供分析。",
                "走势分析": "数据获取失败，无法提供分析。",
                "投资建议": "由于数据获取失败，暂不提供投资建议。",
                "风险提示": "数据不完整，投资决策需谨慎。"
            }
        }

    return result


def _create_system_prompt() -> str:
    """
    创建系统提示词

    Returns:
        str: 系统提示词
    """
    return """你是一个专业的金融分析师，将收到完整的股票历史数据和技术指标数据进行分析。
数据包括：
1. 历史数据：每日的开盘价、收盘价、最高价、最低价和成交量
2. 技术指标：所有交易日的各项技术指标数据
3. 市场趋势：当前的关键趋势数据

请基于这些完整的历史数据进行深入分析，包括以下方面：

1. 技术面分析
- 通过历史数据分析长期趋势
- 识别关键的支撑位和压力位
- 分析重要的技术形态
- 对所有技术指标进行综合研判
- 寻找指标之间的背离现象

2. 走势研判
- 判断当前趋势的强度和可能持续性
- 识别可能的趋势转折点
- 分析成交量和价格的配合情况
- 预判可能的运行区间

3. 投资建议
- 基于完整数据给出明确的操作建议
- 设置合理的止损和目标价位
- 建议适当的持仓时间和仓位控制
- 针对不同投资周期给出建议

4. 风险提示
- 通过历史数据识别潜在风险
- 列出需要警惕的技术信号
- 提供风险规避的具体建议
- 说明需要持续关注的指标

请注意：
- 结合全部历史数据做出判断
- 分析结果要有数据支持
- 避免过度简化或主观判断
- 必要时引用具体的历史数据点
- 结合多个维度的指标进行交叉验证

按照以下固定格式输出分析结果,不要包含任何markdown标记：

技术分析
1. 长期趋势分析：
趋势判断
突破情况
形态分析

2. 支撑和压力：
关键支撑位
关键压力位
突破可能性

3. 技术指标研判：
MACD指标
KDJ指标
RSI指标
布林带分析
其他关键指标

走势分析
1. 当前趋势：
趋势方向
趋势强度
持续性分析

2. 价量配合：
成交量变化
量价关系
市场活跃度

3. 关键位置：
当前位置
突破机会
调整空间

投资建议
1. 操作策略：
总体建议
买卖时机
仓位控制

2. 具体参数：
止损位设置
目标价位
持仓周期

3. 分类建议：
激进投资者建议
稳健投资者建议
保守投资者建议

风险提示
1. 风险因素：
技术面风险
趋势风险
位置风险

2. 防范措施：
止损设置
仓位控制
注意事项

3. 持续关注：
重点指标
关键价位
市场变化

最后给出总体总结。

请在最后单独输出一行：
情感分数: <分数>  # 取值范围[-1,1]，1为极度看多，-1为极度看空，0为中性
"""


def _format_data_for_prompt(df: pd.DataFrame, technical_indicators: pd.DataFrame) -> str:
    """
    将数据格式化为提示词，对早期数据进行采样处理

    Args:
        df (pd.DataFrame): 原始股票数据
        technical_indicators (pd.DataFrame): 技术指标数据

    Returns:
        str: 格式化后的数据字符串
    """
    # 复制数据框以避免修改原始数据
    df_dict = df.copy()
    technical_indicators_dict = technical_indicators.copy()

    # 将时间索引转换为字符串格式
    df_dict.index = df_dict.index.strftime('%Y-%m-%d')
    technical_indicators_dict.index = technical_indicators_dict.index.strftime('%Y-%m-%d')

    # 分割数据：最近60天的数据和之前的数据
    recent_dates = list(df_dict.index)[-60:]
    early_dates = list(df_dict.index)[:-60]

    # 对早期数据进行采样（每2天取一个点）
    sampled_early_dates = early_dates[::2]

    # 合并采样后的日期和最近日期
    selected_dates = sampled_early_dates + recent_dates

    # 构建完整的数据字典，只包含选定的日期
    data_dict = {
        "历史数据": {
            date: {
                "开盘价": f"{df_dict.loc[date, 'open']:.2f}",
                "收盘价": f"{df_dict.loc[date, 'close']:.2f}",
                "最高价": f"{df_dict.loc[date, 'high']:.2f}",
                "最低价": f"{df_dict.loc[date, 'low']:.2f}",
                "成交量": f"{int(df_dict.loc[date, 'volume']):,}"
            } for date in selected_dates
        },
        "技术指标": {
            date: {
                "趋势指标": {
                    "MACD": f"{technical_indicators_dict.loc[date, 'MACD']:.2f}",
                    "DIF": f"{technical_indicators_dict.loc[date, 'DIF']:.2f}",
                    "DEA": f"{technical_indicators_dict.loc[date, 'DEA']:.2f}",
                    "MA5": f"{technical_indicators_dict.loc[date, 'MA5']:.2f}",
                    "MA10": f"{technical_indicators_dict.loc[date, 'MA10']:.2f}",
                    "MA20": f"{technical_indicators_dict.loc[date, 'MA20']:.2f}",
                    "MA60": f"{technical_indicators_dict.loc[date, 'MA60']:.2f}",
                    "TRIX": f"{technical_indicators_dict.loc[date, 'TRIX']:.2f}",
                    "TRMA": f"{technical_indicators_dict.loc[date, 'TRMA']:.2f}"
                },
                "摆动指标": {
                    "KDJ-K": f"{technical_indicators_dict.loc[date, 'K']:.2f}",
                    "KDJ-D": f"{technical_indicators_dict.loc[date, 'D']:.2f}",
                    "KDJ-J": f"{technical_indicators_dict.loc[date, 'J']:.2f}",
                    "RSI": f"{technical_indicators_dict.loc[date, 'RSI']:.2f}",
                    "CCI": f"{technical_indicators_dict.loc[date, 'CCI']:.2f}",
                    "BIAS1": f"{technical_indicators_dict.loc[date, 'BIAS1']:.2f}",
                    "BIAS2": f"{technical_indicators_dict.loc[date, 'BIAS2']:.2f}",
                    "BIAS3": f"{technical_indicators_dict.loc[date, 'BIAS3']:.2f}"
                },
                "布林带": {
                    "上轨": f"{technical_indicators_dict.loc[date, 'BOLL_UP']:.2f}",
                    "中轨": f"{technical_indicators_dict.loc[date, 'BOLL_MID']:.2f}",
                    "下轨": f"{technical_indicators_dict.loc[date, 'BOLL_LOW']:.2f}"
                },
                "动向指标": {
                    "PDI": f"{technical_indicators_dict.loc[date, 'PDI']:.2f}",
                    "MDI": f"{technical_indicators_dict.loc[date, 'MDI']:.2f}",
                    "ADX": f"{technical_indicators_dict.loc[date, 'ADX']:.2f}",
                    "ADXR": f"{technical_indicators_dict.loc[date, 'ADXR']:.2f}"
                },
                "成交量指标": {
                    "VR": f"{technical_indicators_dict.loc[date, 'VR']:.2f}",
                    "AR": f"{technical_indicators_dict.loc[date, 'AR']:.2f}",
                    "BR": f"{technical_indicators_dict.loc[date, 'BR']:.2f}",
                },
                "动量指标": {
                    "ROC": f"{technical_indicators_dict.loc[date, 'ROC']:.2f}",
                    "MAROC": f"{technical_indicators_dict.loc[date, 'MAROC']:.2f}",
                    "MTM": f"{technical_indicators_dict.loc[date, 'MTM']:.2f}",
                    "MTMMA": f"{technical_indicators_dict.loc[date, 'MTMMA']:.2f}",
                    "DPO": f"{technical_indicators_dict.loc[date, 'DPO']:.2f}",
                    "MADPO": f"{technical_indicators_dict.loc[date, 'MADPO']:.2f}"
                },
                "其他指标": {
                    "EMV": f"{technical_indicators_dict.loc[date, 'EMV']:.2f}",
                    "MAEMV": f"{technical_indicators_dict.loc[date, 'MAEMV']:.2f}",
                    "DIF_DMA": f"{technical_indicators_dict.loc[date, 'DIF_DMA']:.2f}",
                    "DIFMA_DMA": f"{technical_indicators_dict.loc[date, 'DIFMA_DMA']:.2f}"
                }
            } for date in selected_dates
        }
    }

    # 计算关键变化率
    latest_close = df['close'].iloc[-1]
    prev_close = df['close'].iloc[-2]
    last_week_close = df['close'].iloc[-6] if len(df) > 5 else prev_close
    last_month_close = df['close'].iloc[-21] if len(df) > 20 else prev_close

    data_dict["市场趋势"] = {
        "日涨跌幅": f"{((latest_close - prev_close) / prev_close * 100):.2f}%",
        "周涨跌幅": f"{((latest_close - last_week_close) / last_week_close * 100):.2f}%",
        "月涨跌幅": f"{((latest_close - last_month_close) / last_month_close * 100):.2f}%",
        "最新收盘价": f"{latest_close:.2f}",
        "最高价": f"{df['high'].max():.2f}",
        "最低价": f"{df['low'].min():.2f}",
        "平均成交量": f"{int(df['volume'].mean()):,}"
    }

    return json.dumps(data_dict, ensure_ascii=False, indent=2)


def _parse_analysis_response(analysis_text: str) -> Dict[str, Any]:
    """解析API返回的文本分析结果为结构化数据"""

    def clean_markdown(text: str) -> str:
        """清理格式并处理换行"""
        lines = text.split('\n')
        cleaned_lines = []

        for _line in lines:
            _line = _line.strip()
            if not _line:
                continue

            # 识别大标题
            if _line in ['技术分析', '走势分析', '投资建议', '风险提示', '总结', '总体总结']:
                continue

            # 处理数字标题
            if _line.startswith(('1.', '2.', '3.')):
                if cleaned_lines:
                    cleaned_lines.append('')  # 添加空行
                cleaned_lines.append(f'<p class="section-title">{_line}</p>')
                continue

            # 处理正文内容
            if ':' in _line:
                title, content = _line.split(':', 1)
                if content.strip():
                    cleaned_lines.append(f'<p class="item-title">{title}:</p>')
                    cleaned_lines.append(f'<p class="item-content">{content.strip()}</p>')
            else:
                cleaned_lines.append(f'<p>{_line}</p>')

        return '\n'.join(cleaned_lines)

    sections = {
        "技术分析": "",
        "走势分析": "",
        "投资建议": "",
        "风险提示": "",
        "总结": ""
    }

    current_section = None
    buffer = []

    # 按行处理文本
    for line in analysis_text.split('\n'):
        line = line.strip()
        if not line:
            continue

        # 处理总结部分
        if line.startswith('总体总结'):
            if current_section:
                sections[current_section] = clean_markdown('\n'.join(buffer))
            current_section = "总结"
            buffer = [line.split('：', 1)[1] if '：' in line else line]
            continue

        # 处理主要部分
        if line in sections:
            if current_section and buffer:
                sections[current_section] = clean_markdown('\n'.join(buffer))
            current_section = line
            buffer = []
            continue

        if current_section:
            buffer.append(line)

    # 处理最后一个部分
    if current_section and buffer:
        sections[current_section] = clean_markdown('\n'.join(buffer))

    # 提取情感分数
    score_match = re.search(r'情感分数[:：]\s*([-+]?\d*\.?\d+)', analysis_text)
    if score_match:
        try:
            score = float(score_match.group(1))
            sections['情感分数'] = score
        except Exception:
            pass

    return {
        "AI分析结果": sections
    }


class APIBusyError(Exception):
    """API服务器繁忙时抛出的异常"""
    pass


class LLMAnalyzer:
    """使用 OpenAI SDK 与 llm API 交互的类"""

    def __init__(self, api_key: str, base_url: str, model: str = None):
        """
        初始化 llm 分析器

        Args:
            api_key (str): llm API 密钥
            base_url (str): llm API 基础 URL
            model (str): 使用的模型名称，默认为None则使用环境变量或空字符串
        """
        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url
        )
        self.model = model or os.environ.get('LLM_MODEL', '')

    def request_analysis(self, df: pd.DataFrame, technical_indicators: pd.DataFrame) -> Optional[Dict[str, Any]]:
        """
        向 llm API 发送分析请求

        Args:
            df (pd.DataFrame): 原始股票数据
            technical_indicators (pd.DataFrame): 技术指标数据

        Returns:
            Optional[Dict[str, Any]]: API 响应的分析结果
        """
        try:
            # 准备数据
            print("开始准备数据...")
            data_str = _format_data_for_prompt(df, technical_indicators)
            print(f"数据准备完成，数据长度: {len(data_str)}")

            # 构建消息
            print("构建API请求消息...")
            messages = [
                {"role": "system", "content": _create_system_prompt()},
                {"role": "user", "content": f"请分析以下股票数据并给出专业的分析意见：\n{data_str}"}
            ]
            print(f"消息构建完成，系统提示词长度: {len(messages[0]['content'])}")
            print(f"用户消息长度: {len(messages[1]['content'])}")

            # 发送请求
            print("开始发送API请求...")
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=1.0,
                    stream=False
                )
                print("API请求发送成功")
            except Exception as api_e:
                # 检查是否是空响应导致的JSON解析错误
                if str(api_e).startswith("Expecting value: line 1 column 1 (char 0)"):
                    print("API返回空响应，服务器可能繁忙")
                    raise APIBusyError("API服务器繁忙，返回空响应") from api_e
                print(f"API请求发送失败: {str(api_e)}")
                raise  # 重新抛出其他类型的异常

            # 记录原始响应以便调试
            print("API 原始响应类型:", type(response))
            print("API 原始响应内容:", response)

            # 检查响应内容
            if not response:
                print("API返回空响应")
                return format_analysis_result({})

            if not hasattr(response, 'choices'):
                print(f"API响应缺少choices属性，响应结构: {dir(response)}")
                return format_analysis_result({})

            if not response.choices:
                print("API响应的choices为空")
                return format_analysis_result({})

            # 解析响应
            try:
                analysis_text = response.choices[0].message.content
                print("成功获取分析文本内容")
                print("分析文本:", analysis_text)
            except Exception as text_e:
                print(f"获取分析文本失败: {str(text_e)}")
                raise

            # 将文本响应组织成结构化数据
            print("开始解析分析文本...")
            result = _parse_analysis_response(analysis_text)
            print("分析文本解析完成")
            return result

        except APIBusyError as be:  # 处理API繁忙异常
            print(f"=== API繁忙错误 ===")
            print(f"错误详情: {str(be)}")
            print(f"错误类型: {type(be)}")
            return format_analysis_result({})
        except json.JSONDecodeError as je:
            print(f"=== JSON解析错误 ===")
            print(f"错误详情: {str(je)}")
            print(f"错误类型: {type(je)}")
            print(f"错误位置: {je.pos}")
            print(f"错误行列: 行 {je.lineno}, 列 {je.colno}")
            print(f"错误的文档片段: {je.doc[:100] if je.doc else 'None'}")
            return format_analysis_result({})
        except openai.APITimeoutError as te:
            print(f"=== API超时错误 ===")
            print(f"错误详情: {str(te)}")
            print(f"错误类型: {type(te)}")
            return format_analysis_result({})
        except openai.APIConnectionError as ce:
            print(f"=== API连接错误 ===")
            print(f"错误详情: {str(ce)}")
            print(f"错误类型: {type(ce)}")
            return format_analysis_result({})
        except openai.APIError as ae:
            print(f"=== API错误 ===")
            print(f"错误详情: {str(ae)}")
            print(f"错误类型: {type(ae)}")
            return format_analysis_result({})
        except openai.RateLimitError as re:
            print(f"=== API频率限制错误 ===")
            print(f"错误详情: {str(re)}")
            print(f"错误类型: {type(re)}")
            return format_analysis_result({})
        except Exception as e:
            print(f"=== 未预期的错误 ===")
            print(f"错误详情: {str(e)}")
            print(f"错误类型: {type(e)}")
            print(f"错误追踪:")
            import traceback
            traceback.print_exc()
            return format_analysis_result({})
    
    def generate_pool_analysis(self, pool_summary: list) -> Optional[str]:
        """
        生成股票池综合分析
        
        Args:
            pool_summary: 股票池汇总信息列表
            
        Returns:
            AI分析文本，失败时返回None
        """
        try:
            print("开始生成股票池AI分析...")
            
            # 构建股票池分析的提示词
            pool_info = "股票池综合分析：\n\n"
            for stock in pool_summary:
                pool_info += f"股票名称: {stock['name']}\n"
                pool_info += f"股票代码: {stock['code']}\n"
                pool_info += f"最新价格: {stock['price']:.2f}\n"
                pool_info += f"涨跌幅: {stock['change_pct']:.2f}%\n"
                pool_info += f"成交量: {stock['volume']}\n"
                pool_info += f"RSI: {stock['rsi']:.2f}\n"
                pool_info += f"MACD: {stock['macd']:.2f}\n"
                pool_info += "-" * 40 + "\n"
            
            system_prompt = """你是一个专业的股票投资分析师。请基于提供的股票池信息，进行综合分析并提供投资建议。

请按以下结构回答：

1. **市场整体分析**
   - 分析当前股票池的整体表现
   - 识别市场趋势和行业特点

2. **个股亮点分析** 
   - 挑选表现最好的2-3只股票
   - 分析其技术指标和投资价值

3. **风险提示**
   - 识别潜在风险点
   - 提供风险控制建议

4. **投资建议**
   - 给出具体的买卖建议
   - 建议仓位配置比例

请用中文回答，语言专业且易懂。"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": pool_info}
            ]
            
            print("发送股票池分析请求...")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                stream=False
            )
            
            if response.choices and response.choices[0].message:
                analysis_text = response.choices[0].message.content.strip()
                print("股票池AI分析生成成功")
                return analysis_text
            else:
                print("股票池AI分析响应为空")
                return None
                
        except Exception as e:
            print(f"生成股票池AI分析失败: {str(e)}")
            return None

    def generate_fundamental_analysis(self, fundamental_data: list, analysis_params: Dict[str, Any]) -> Optional[str]:
        """
        生成基本面分析
        
        Args:
            fundamental_data: 基本面数据列表
            analysis_params: 分析参数
            
        Returns:
            基本面分析文本，失败时返回None
        """
        try:
            print(f"开始生成基本面分析: {analysis_params['type']}")
            
            # 构建基本面分析的数据信息
            fundamental_info = f"基本面分析 - {analysis_params['type']}：\n\n"
            fundamental_info += f"分析周期: {analysis_params['time_period']}\n"
            fundamental_info += f"分析日期: {pd.Timestamp.now().strftime('%Y-%m-%d')}\n\n"
            
            for stock in fundamental_data:
                fundamental_info += f"股票名称: {stock['name']}\n"
                fundamental_info += f"股票代码: {stock['code']}\n"
                fundamental_info += f"当前价格: {stock['current_price']:.2f}\n"
                fundamental_info += f"52周最高: {stock['high_52w']:.2f}\n"
                fundamental_info += f"52周最低: {stock['low_52w']:.2f}\n"
                fundamental_info += f"价格波动率: {stock['price_volatility']:.2f}%\n"
                fundamental_info += f"平均成交量: {stock['avg_volume']:,.0f}\n"
                fundamental_info += f"价格趋势强度: {stock['price_trend']:.2f}\n"
                fundamental_info += f"成交量趋势: {stock['volume_trend']}\n"
                fundamental_info += f"RSI: {stock['rsi']:.2f}\n"
                fundamental_info += f"MACD: {stock['macd']:.4f}\n"
                fundamental_info += "-" * 50 + "\n"
            
            # 构建基本面分析的系统提示词
            system_prompt = f"""你是一个专业的基本面分析师。请基于提供的股票数据进行{analysis_params['type']}分析。

分析要求：
- 分析类型：{analysis_params['type']}
- 时间周期：{analysis_params['time_period']}
- 包含宏观分析：{analysis_params.get('include_macro', False)}
- 包含行业分析：{analysis_params.get('include_industry', False)}
- 包含竞争对手分析：{analysis_params.get('include_competitors', False)}
- 深度风险评估：{analysis_params.get('risk_assessment', False)}

请按以下结构进行分析：

## 1. 财务健康度分析
- 基于价格波动率和成交量分析公司稳定性
- 通过技术指标判断资金流向和投资者信心

## 2. 估值分析  
- 分析当前价格相对于52周区间的位置
- 评估价格趋势和估值合理性

## 3. 成长性分析
- 基于价格趋势强度分析成长潜力
- 结合成交量趋势判断市场关注度

## 4. 风险评估
- 分析价格波动率风险
- 评估技术指标显示的风险信号

## 5. 投资建议
- 综合基本面因素给出投资建议
- 建议合适的投资策略和风险控制措施

请用专业、客观的语言进行分析，并提供具体的数据支撑。"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": fundamental_info}
            ]
            
            print("发送基本面分析请求...")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                stream=False
            )
            
            if response.choices and response.choices[0].message:
                analysis_text = response.choices[0].message.content.strip()
                print("基本面分析生成成功")
                return analysis_text
            else:
                print("基本面分析响应为空")
                return None
                
        except Exception as e:
            print(f"生成基本面分析失败: {str(e)}")
            return None

    def generate_sector_rotation_analysis(self, sector_data: list) -> Optional[str]:
        """
        生成板块轮动分析
        
        Args:
            sector_data: 板块数据列表
            
        Returns:
            板块轮动分析文本，失败时返回None
        """
        try:
            print("开始生成板块轮动分析...")
            
            # 构建板块轮动分析数据
            sector_info = "板块轮动分析：\n\n"
            for stock in sector_data:
                sector_info += f"股票名称: {stock['name']}\n"
                sector_info += f"股票代码: {stock['code']}\n"
                sector_info += f"日涨跌幅: {stock['daily_change']:.2f}%\n"
                sector_info += f"周涨跌幅: {stock['weekly_change']:.2f}%\n"
                sector_info += f"月涨跌幅: {stock['monthly_change']:.2f}%\n"
                sector_info += f"季度涨跌幅: {stock['quarterly_change']:.2f}%\n"
                sector_info += f"量比: {stock['volume_ratio']:.2f}\n"
                sector_info += f"动量指标: {stock['momentum']:.2f}%\n"
                sector_info += "-" * 40 + "\n"
            
            system_prompt = """你是一个专业的板块轮动分析师。请基于提供的多只股票在不同时间周期的表现数据，分析当前的板块轮动情况。

请按以下结构进行分析：

## 1. 板块表现排名
- 按不同时间周期（日、周、月、季）对股票表现进行排名
- 识别强势板块和弱势板块

## 2. 轮动趋势分析
- 分析板块轮动的时间节点和规律
- 识别资金流向和热点板块转换

## 3. 动量分析
- 基于动量指标和量比分析板块活跃度
- 预测可能的轮动方向

## 4. 投资策略建议
- 推荐当前应关注的强势板块
- 建议板块配置比例和轮动策略
- 提供进出时机建议

请用专业的语言分析，并基于数据给出具体的投资建议。"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": sector_info}
            ]
            
            print("发送板块轮动分析请求...")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                stream=False
            )
            
            if response.choices and response.choices[0].message:
                analysis_text = response.choices[0].message.content.strip()
                print("板块轮动分析生成成功")
                return analysis_text
            else:
                print("板块轮动分析响应为空")
                return None
                
        except Exception as e:
            print(f"生成板块轮动分析失败: {str(e)}")
            return None

    def generate_trend_strength_analysis(self, trend_data: list) -> Optional[str]:
        """
        生成趋势强度分析
        
        Args:
            trend_data: 趋势数据列表
            
        Returns:
            趋势强度分析文本，失败时返回None
        """
        try:
            print("开始生成趋势强度分析...")
            
            # 构建趋势强度分析数据
            trend_info = "趋势强度分析：\n\n"
            for stock in trend_data:
                trend_info += f"股票名称: {stock['name']}\n"
                trend_info += f"股票代码: {stock['code']}\n"
                trend_info += f"趋势方向: {stock['trend_direction']}\n"
                trend_info += f"趋势强度: {stock['trend_strength']:.2f}\n"
                trend_info += f"支撑位: {stock['support_level']:.2f}\n"
                trend_info += f"阻力位: {stock['resistance_level']:.2f}\n"
                trend_info += f"突破潜力: {stock['breakout_potential']}\n"
                trend_info += f"成交量确认: {'是' if stock['volume_confirmation'] else '否'}\n"
                trend_info += "-" * 40 + "\n"
            
            system_prompt = """你是一个专业的趋势分析师。请基于提供的趋势强度数据，分析各股票的趋势特征和投资机会。

请按以下结构进行分析：

## 1. 趋势强度排名
- 按趋势强度对股票进行排名
- 识别最强势和最弱势的股票

## 2. 支撑阻力分析
- 分析各股票的支撑阻力位有效性
- 识别关键的价格区间

## 3. 突破机会分析
- 评估各股票的突破潜力
- 结合成交量确认判断突破可信度

## 4. 趋势交易策略
- 基于趋势强度推荐交易策略
- 提供进场点位和止损建议
- 预测趋势可能的持续时间

## 5. 风险提示
- 识别趋势反转的早期信号
- 提醒关注的风险点

请结合技术分析理论，用专业的语言进行分析。"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": trend_info}
            ]
            
            print("发送趋势强度分析请求...")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                stream=False
            )
            
            if response.choices and response.choices[0].message:
                analysis_text = response.choices[0].message.content.strip()
                print("趋势强度分析生成成功")
                return analysis_text
            else:
                print("趋势强度分析响应为空")
                return None
                
        except Exception as e:
            print(f"生成趋势强度分析失败: {str(e)}")
            return None

    def generate_single_stock_analysis(
        self,
        detailed_data: Dict[str, Any],
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> Optional[str]:
        """
        生成单股深度分析
        
        Args:
            detailed_data: 详细的单股数据
            
        Returns:
            单股分析文本，失败时返回None
        """
        try:
            def report(progress: int, message: str) -> None:
                if progress_callback:
                    progress_callback(progress, message)

            print(f"开始生成 {detailed_data['name']} 的单股分析...")
            report(56, "正在整理提示词与上下文，准备发送模型请求")
            
            # 构建单股分析数据
            stock_info = f"单股深度分析 - {detailed_data['name']} ({detailed_data['code']})：\n\n"
            stock_info += f"分析深度: {detailed_data['analysis_depth']}\n"
            stock_info += f"分析日期: {pd.Timestamp.now().strftime('%Y-%m-%d')}\n\n"
            
            # 价格数据（详细版）
            price_data = detailed_data['price_data']
            stock_info += "=" * 60 + "\n"
            stock_info += "📊 价格数据详情\n"
            stock_info += "=" * 60 + "\n"
            stock_info += f"当前价格: {price_data['current']:.2f} 元\n"
            stock_info += f"今日开盘: {price_data.get('open', 0):.2f} 元\n"
            stock_info += f"今日最高: {price_data.get('high', 0):.2f} 元\n"
            stock_info += f"今日最低: {price_data.get('low', 0):.2f} 元\n"
            stock_info += f"52周最高: {price_data['high_52w']:.2f} 元"
            if price_data.get('high_52w_date'):
                stock_info += f" (日期: {price_data['high_52w_date']})"
            stock_info += "\n"
            stock_info += f"52周最低: {price_data['low_52w']:.2f} 元"
            if price_data.get('low_52w_date'):
                stock_info += f" (日期: {price_data['low_52w_date']})"
            stock_info += "\n"
            stock_info += f"52周价格位置: {price_data.get('price_position_52w', 0):.1f}% (0%为最低点, 100%为最高点)\n"
            stock_info += f"\n移动平均线:\n"
            stock_info += f"  5日均价: {price_data.get('avg_price_5d', 0):.2f} 元\n"
            stock_info += f"  10日均价: {price_data.get('avg_price_10d', 0):.2f} 元\n"
            stock_info += f"  20日均价: {price_data.get('avg_price_20d', 0):.2f} 元\n"
            stock_info += f"  30日均价: {price_data['avg_price_30d']:.2f} 元\n"
            stock_info += f"\n价格变化:\n"
            stock_info += f"  1日涨跌: {price_data.get('price_change_1d', 0):.2f}%\n"
            stock_info += f"  5日涨跌: {price_data.get('price_change_5d', 0):.2f}%\n"
            stock_info += f"  10日涨跌: {price_data.get('price_change_10d', 0):.2f}%\n"
            stock_info += f"  20日涨跌: {price_data.get('price_change_20d', 0):.2f}%\n"
            stock_info += f"  30日涨跌: {price_data.get('price_change_30d', 0):.2f}%\n"
            stock_info += f"\n价格波动率: {price_data['volatility']:.2f}% (标准差)\n\n"
            
            # 成交量数据（详细版）
            volume_data = detailed_data['volume_data']
            stock_info += "=" * 60 + "\n"
            stock_info += "📈 成交量数据详情\n"
            stock_info += "=" * 60 + "\n"
            stock_info += f"当前成交量: {volume_data['current']:,.0f} 手\n"
            stock_info += f"成交量比率: {volume_data.get('volume_ratio', 0):.2f} (当前/平均)\n"
            stock_info += f"成交量趋势: {volume_data['volume_trend']}\n"
            stock_info += f"\n平均成交量:\n"
            stock_info += f"  5日平均: {volume_data.get('avg_volume_5d', 0):,.0f} 手\n"
            stock_info += f"  10日平均: {volume_data.get('avg_volume_10d', 0):,.0f} 手\n"
            stock_info += f"  20日平均: {volume_data.get('avg_volume_20d', 0):,.0f} 手\n"
            stock_info += f"  30日平均: {volume_data['avg_volume_30d']:,.0f} 手\n"
            stock_info += f"\n30日成交量区间:\n"
            stock_info += f"  最大成交量: {volume_data.get('max_volume_30d', 0):,.0f} 手\n"
            stock_info += f"  最小成交量: {volume_data.get('min_volume_30d', 0):,.0f} 手\n\n"
            
            # 技术指标（详细版）
            tech_indicators = detailed_data['technical_indicators']
            stock_info += "=" * 60 + "\n"
            stock_info += "🔍 技术指标详情\n"
            stock_info += "=" * 60 + "\n"
            stock_info += f"RSI相对强弱指标:\n"
            stock_info += f"  当前RSI: {tech_indicators['rsi']:.2f}"
            if tech_indicators['rsi'] > 70:
                stock_info += " (超买区域)"
            elif tech_indicators['rsi'] < 30:
                stock_info += " (超卖区域)"
            else:
                stock_info += " (正常区域)"
            stock_info += "\n"
            if tech_indicators.get('rsi_5d_ago', 0) > 0:
                stock_info += f"  5日前RSI: {tech_indicators['rsi_5d_ago']:.2f}\n"
            if tech_indicators.get('rsi_10d_ago', 0) > 0:
                stock_info += f"  10日前RSI: {tech_indicators['rsi_10d_ago']:.2f}\n"
            
            stock_info += f"\nMACD指标:\n"
            stock_info += f"  MACD值: {tech_indicators['macd']:.4f}\n"
            if tech_indicators.get('macd_signal', 0) != 0:
                stock_info += f"  信号线: {tech_indicators['macd_signal']:.4f}\n"
            if tech_indicators.get('macd_hist', 0) != 0:
                hist_status = "金叉" if tech_indicators['macd_hist'] > 0 else "死叉"
                stock_info += f"  柱状图: {tech_indicators['macd_hist']:.4f} ({hist_status})\n"
            
            stock_info += f"\n移动平均线:\n"
            stock_info += f"  MA5: {tech_indicators['ma5']:.2f} 元\n"
            if tech_indicators.get('ma10', 0) > 0:
                stock_info += f"  MA10: {tech_indicators['ma10']:.2f} 元\n"
            stock_info += f"  MA20: {tech_indicators['ma20']:.2f} 元\n"
            if tech_indicators.get('ma30', 0) > 0:
                stock_info += f"  MA30: {tech_indicators['ma30']:.2f} 元\n"
            if tech_indicators.get('ma60', 0) > 0:
                stock_info += f"  MA60: {tech_indicators['ma60']:.2f} 元\n"
            
            stock_info += f"\n布林带指标:\n"
            stock_info += f"  上轨: {tech_indicators['bollinger_upper']:.2f} 元\n"
            if tech_indicators.get('bollinger_middle', 0) > 0:
                stock_info += f"  中轨: {tech_indicators['bollinger_middle']:.2f} 元\n"
            stock_info += f"  下轨: {tech_indicators['bollinger_lower']:.2f} 元\n"
            if tech_indicators.get('bollinger_width', 0) > 0:
                stock_info += f"  带宽: {tech_indicators['bollinger_width']:.2f}% (反映波动性)\n"
            
            if tech_indicators.get('momentum', 0) != 0:
                stock_info += f"\n动量指标: {tech_indicators['momentum']:.4f}\n"
            
            # 趋势分析
            trend_analysis = detailed_data['trend_analysis']
            stock_info += "\n" + "=" * 60 + "\n"
            stock_info += "📉 趋势分析\n"
            stock_info += "=" * 60 + "\n"
            stock_info += f"趋势方向: {trend_analysis['direction']}\n"
            stock_info += f"趋势强度: {trend_analysis['strength']:.2f} (0-1之间，越大越强)\n"
            stock_info += f"支撑位: {trend_analysis['support_resistance']['support']:.2f} 元\n"
            stock_info += f"阻力位: {trend_analysis['support_resistance']['resistance']:.2f} 元\n"
            if trend_analysis.get('breakout_potential'):
                stock_info += f"突破潜力: {trend_analysis['breakout_potential']}\n"
            
            # 近期表现
            if 'recent_performance' in detailed_data:
                recent = detailed_data['recent_performance']
                stock_info += "\n" + "=" * 60 + "\n"
                stock_info += "📊 近期表现统计 (30日)\n"
                stock_info += "=" * 60 + "\n"
                stock_info += f"最佳单日涨幅: {recent.get('best_day_30d', 0):.2f}%\n"
                stock_info += f"最差单日跌幅: {recent.get('worst_day_30d', 0):.2f}%\n"
                stock_info += f"上涨天数: {recent.get('up_days_30d', 0)} 天\n"
                stock_info += f"下跌天数: {recent.get('down_days_30d', 0)} 天\n"
                stock_info += f"平均日涨跌: {recent.get('avg_daily_change', 0):.2f}%\n"
            
            # 根据分析深度调整系统提示词
            if detailed_data['analysis_depth'] == "快速分析":
                analysis_sections = "技术面分析、短期走势判断、交易建议"
            elif detailed_data['analysis_depth'] == "深度分析":
                analysis_sections = "技术面分析、基本面推测、中期趋势判断、风险评估、详细交易策略"
            else:  # 全面评估
                analysis_sections = "全面技术分析、基本面综合评估、多时间框架分析、风险收益比分析、长中短期策略、资金管理建议"
            
            system_prompt = f"""你是一位资深的股票分析师，拥有丰富的市场经验和深厚的技术分析功底。请对 {detailed_data['name']} ({detailed_data['code']}) 进行{detailed_data['analysis_depth']}。

**重要要求：**
1. 必须提供详细、全面、深入的分析，每个部分都要充分展开
2. 分析内容要具体、有数据支撑，必须引用提供的数据，不能只是简单概括
3. 每个部分至少包含3-5个要点，每个要点都要详细阐述，每个要点至少50-100字
4. 总分析长度应在1500-3000字之间，确保内容非常充实和详细
5. 使用专业术语，但也要通俗易懂
6. 必须基于提供的数据进行分析，不能凭空猜测
7. 每个数据点都要有分析和解读，不能只是罗列数据

分析要求包含：{analysis_sections}

**报告格式要求：**
请严格按照以下结构生成完整的分析报告，必须包含所有部分：

## 📈 {detailed_data['name']} 深度分析报告

### 📋 分析摘要
- 分析深度：{detailed_data['analysis_depth']}
- 分析日期：当前日期
- 核心结论：用2-3句话总结最重要的分析结论

### 📋 概述
- 对股票当前整体状况的全面总结（200-300字）
- 核心观点和主要结论
- 当前市场位置和投资价值评估

## 1. 📊 股票概况
- **当前价格位置分析**：详细分析当前价格在52周区间中的位置（高、中、低），百分比位置，历史分位数
- **近期表现总结**：过去30天的价格走势、涨跌幅、波动特征
- **价格波动率分析**：波动率水平、与历史对比、市场风险程度
- **价格趋势特征**：短期、中期趋势方向，趋势的可持续性

## 2. 🔍 技术分析
- **技术指标深度解读**：
  * RSI指标：当前数值、超买超卖状态、历史对比、信号强度
  * MACD指标：金叉死叉状态、柱状图变化、趋势确认信号
  * 移动平均线：MA5、MA20位置关系、多头/空头排列、支撑压力作用
  * 布林带：价格在布林带中的位置、带宽变化、突破信号
- **支撑阻力位分析**：关键支撑位和阻力位的具体价位、强度、突破概率
- **趋势强度和方向判断**：趋势强度数值解读、方向确认、持续性评估
- **技术形态识别**：是否存在明显的技术形态（头肩顶、双底等）

## 3. 📈 成交量分析
- **成交量趋势变化**：近期成交量变化趋势、放量/缩量特征
- **量价关系分析**：价涨量增/价跌量缩等关系、量价背离情况
- **资金流向判断**：主力资金流入流出情况、散户参与度
- **换手率分析**：换手率水平、市场活跃度、筹码集中度

## 4. ⚠️ 风险评估
- **价格波动风险**：波动率风险、价格回调风险、具体风险点位
- **技术风险信号**：超买超卖风险、技术指标背离、趋势反转信号
- **关键风险点位**：止损位、关键支撑位跌破风险、阻力位压力
- **市场环境风险**：大盘风险、行业风险、个股特殊风险

## 5. 💡 投资建议
- **具体的买卖建议**：买入/卖出/持有建议，具体操作时机，必须基于前面的技术分析给出
- **目标价位设定**：短期目标价（1-2周）、中期目标价（1-3个月）、目标价位的合理性分析，必须给出具体数值
- **止损点位建议**：止损价位、止损比例、止损策略，必须给出具体数值
- **适合的投资周期**：短线/中线/长线建议、持仓时间建议、理由说明
- **仓位管理建议**：建议仓位比例、分批建仓策略、风险控制措施
- **操作策略**：具体的操作步骤、注意事项、最佳入场/出场时机、关键观察点

## 6. 📋 风险提示与免责声明
必须在报告最后添加以下格式的免责声明：

**📋 本分析报告基于公开数据和特定分析模型生成，仅作为信息参考和学术交流之用，不构成任何具体的投资建议。股票市场存在固有风险，投资者应基于自身独立判断进行决策，并承担相应风险。**

**重要提示：**
1. 以上分析仅供参考，不构成投资建议
2. 投资有风险，入市需谨慎
3. 请结合自身风险承受能力做出投资决策
4. 建议咨询专业投资顾问

**请确保：**
1. 分析内容详细、专业、可操作，每个部分都要充分展开，不能只是简单概括
2. 每个部分至少200-400字，确保内容丰富
3. 必须引用和解读提供的数据，不能只是罗列
4. 总报告长度应在1500-3000字之间
5. 使用专业但易懂的语言
6. 所有数据解读都要有逻辑支撑"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": stock_info}
            ]
            
            print("发送单股分析请求...")
            report(72, "模型请求已发送，正在等待 AI 返回完整报告")
            # 根据分析深度设置不同的max_tokens
            if detailed_data['analysis_depth'] == "快速分析":
                max_tokens = 1200
            elif detailed_data['analysis_depth'] == "深度分析":
                max_tokens = 2200
            else:  # 全面评估
                max_tokens = 3200
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.5,
                max_tokens=max_tokens,  # 设置足够的token数量
                stream=False
            )
            
            if response.choices and response.choices[0].message:
                analysis_text = response.choices[0].message.content.strip()
                print(f"{detailed_data['name']} 单股分析生成成功")
                report(92, "AI 已返回内容，正在整理结果")
                return analysis_text
            else:
                print("单股分析响应为空")
                report(92, "AI 请求已完成，但响应内容为空")
                return None
                
        except openai.APIConnectionError as ce:
            print(f"=== API连接错误 ===")
            print(f"生成单股分析失败: {str(ce)}")
            print(f"错误类型: {type(ce)}")
            print("可能的原因：")
            print("1. 网络连接问题，请检查网络连接")
            print("2. API服务不可用，请稍后重试")
            print("3. 代理设置问题，请检查代理配置")
            return None
        except openai.APITimeoutError as te:
            print(f"=== API超时错误 ===")
            print(f"生成单股分析失败: {str(te)}")
            print("请求超时，请稍后重试")
            return None
        except openai.RateLimitError as re:
            print(f"=== API频率限制错误 ===")
            print(f"生成单股分析失败: {str(re)}")
            print("API调用频率过高，请稍后重试")
            return None
        except openai.APIError as ae:
            print(f"=== API错误 ===")
            print(f"生成单股分析失败: {str(ae)}")
            print(f"错误类型: {type(ae)}")
            return None
        except Exception as e:
            print(f"=== 未预期的错误 ===")
            print(f"生成单股分析失败: {str(e)}")
            print(f"错误类型: {type(e)}")
            import traceback
            traceback.print_exc()
            return None

    def generate_market_insights(self, market_data: Dict[str, Any]) -> Optional[str]:
        """
        生成市场洞察
        
        Args:
            market_data: 市场数据
            
        Returns:
            市场洞察文本，失败时返回None
        """
        try:
            insight_type = market_data['insight_type']
            print(f"开始生成市场洞察: {insight_type}")
            
            # 构建市场洞察数据
            market_info = f"市场洞察分析 - {insight_type}：\n\n"
            
            # 市场概况
            summary = market_data['market_summary']
            market_info += "市场概况：\n"
            market_info += f"总股票数: {summary['total_stocks']}\n"
            market_info += f"上涨股票: {summary['rising_stocks']}\n"
            market_info += f"下跌股票: {summary['falling_stocks']}\n"
            market_info += f"平盘股票: {summary['flat_stocks']}\n"
            market_info += f"市场宽度: {summary['market_breadth']:.2%}\n\n"
            
            # 板块表现
            market_info += "板块表现前5名：\n"
            for i, stock in enumerate(market_data['sector_performance'][:5], 1):
                market_info += f"{i}. {stock['name']}: 日涨跌{stock['daily_change']:+.2f}%, "
                market_info += f"周涨跌{stock['weekly_change']:+.2f}%, 月涨跌{stock['monthly_change']:+.2f}%\n"
            market_info += "\n"
            
            # 市场广度指标
            breadth = market_data['market_breadth']
            market_info += "市场广度指标：\n"
            market_info += f"涨跌比率: {breadth['advance_decline_ratio']:.2%}\n"
            market_info += f"市场强度: {breadth['market_strength']:.1f}\n\n"
            
            # 情绪指标
            sentiment = market_data['sentiment_indicators']
            market_info += "市场情绪指标：\n"
            market_info += f"高成交量比例: {sentiment['high_volume_ratio']:.2%}\n"
            market_info += f"高波动率比例: {sentiment['high_volatility_ratio']:.2%}\n"
            market_info += f"市场活跃度: {sentiment['market_activity_level']:.2%}\n"
            
            # 根据洞察类型调整分析重点
            if insight_type == "市场趋势预测":
                focus = "基于当前数据预测未来1-3个月的市场趋势，识别关键转折点"
            elif insight_type == "热点板块分析":
                focus = "识别当前和未来的热点板块，分析资金轮动规律"
            elif insight_type == "资金流向分析":
                focus = "分析主力资金流向，判断增量资金和存量资金的配置偏好"
            else:  # 情绪指标分析
                focus = "分析投资者情绪变化，判断市场恐慌和贪婪程度"
            
            system_prompt = f"""你是一个资深的市场分析师。请基于提供的市场数据进行{insight_type}分析。

分析重点：{focus}

请按以下结构进行分析：

## 1. 市场现状分析
- 整体市场表现评估
- 市场宽度和参与度分析

## 2. 板块轮动分析
- 强势板块识别
- 资金流向特征
- 板块轮动规律

## 3. 市场情绪解读
- 投资者情绪状态判断
- 恐慌/贪婪指数评估
- 市场活跃度分析

## 4. 趋势预测
- 短期趋势判断（1-4周）
- 中期趋势预测（1-3个月）
- 关键节点识别

## 5. 投资策略建议
- 基于当前市场状态的投资建议
- 风险控制要点
- 关注重点和时机选择

请结合宏观经济和市场技术面，提供专业的市场洞察。"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": market_info}
            ]
            
            print("发送市场洞察分析请求...")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                stream=False
            )
            
            if response.choices and response.choices[0].message:
                analysis_text = response.choices[0].message.content.strip()
                print("市场洞察分析生成成功")
                return analysis_text
            else:
                print("市场洞察分析响应为空")
                return None
                
        except Exception as e:
            print(f"生成市场洞察失败: {str(e)}")
            return None
