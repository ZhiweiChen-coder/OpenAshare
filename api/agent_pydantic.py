"""
PydanticAI agent with Python tools to gather and analyze data from multiple APIs.
Used for stock analysis, news, hotspots, portfolio, and web search; wired to the chat UI.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from pydantic import BaseModel, Field
from openai import AsyncOpenAI

try:
    from pydantic_ai import Agent, RunContext
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider
    PYDANTIC_AI_AVAILABLE = True
except ModuleNotFoundError:
    Agent = Any
    RunContext = Any
    OpenAIChatModel = None
    OpenAIProvider = None
    PYDANTIC_AI_AVAILABLE = False

from api.schemas import AgentResponse
from api.services import (
    HotspotService,
    NewsService,
    ProgressCallback,
    PortfolioService,
    StockAnalysisService,
    WebSearchService,
)


class AgentOutput(BaseModel):
    """Structured output from the agent for the chat UI."""

    summary: str = Field(
        description=(
            "Chinese markdown, very concise. Use 2-4 '##' headings only. "
            "Each section should be short and actionable."
        )
    )
    actions: List[str] = Field(default_factory=list, description="1-3 short follow-up actions.")


SYSTEM_PROMPT = """你是 Ashare Agent（中文输出）。目标：尽量少调用工具，先给短、可操作的结论，而不是长文章。

## 真实性要求
- 不知道就明确说不知道、不确定、信息不足；不要编造股票、新闻、价格、结论。
- 如果问题缺少关键对象（股票、主题、时间范围），先提出一个简短澄清问题。
- 如果无法从现有工具得到答案，要直接说明目前拿不到，而不是假装已经验证。

## 工具使用策略（智能、少而准）
- 只有在需要数据时才调用工具；避免为了“看起来更全”而把所有工具都跑一遍。
- 问候/闲聊（如“你好”）不要调用任何工具，直接一句欢迎+可选示例即可。
- 单股：先 search_stocks→get_stock_analysis；只有用户明确要“消息/新闻/公告/最新”才 get_stock_news。
- 世界/宏观/突发：优先 get_global_news；只有用户明确要实时/最新/联网时才 web_search（最多 3 条）。
- 热点：list_hotspots；用户点名某主题才 get_hotspot_detail。
- 持仓：get_portfolio_analysis。

## 澄清优先级
- 用户说“这票怎么样”“能不能上车”“要不要减仓”但没点名股票时：先问股票名称或代码。
- 用户问“这个消息利好谁”“这个新闻怎么看”但没给消息对象时：先问是哪个消息、哪条新闻或哪个主题。
- 用户问“市场怎么看”“今天怎么操作”但没说明范围时：先按 A股/港股/全球 三选一澄清，或在答案开头明确你暂按哪个范围理解。
- 如果历史上下文里已有明确标的，可优先承接上下文，但要避免误判到无关股票。

## few-shot 示例
示例 1
用户：这票怎么样
你的做法：如果没有明确股票，先问“你指的是哪只股票？直接发代码或名称即可，例如 sh600036 / 招商银行。”

示例 2
用户：能不能上车
你的做法：如果没有明确股票，先澄清标的；如果已有明确股票，先给短结论，再提示风险，不要直接绝对化下判断。

示例 3
用户：这个消息利好谁
你的做法：如果没有明确消息内容，先问“你指的是哪条消息？可以直接贴标题或一句话概述。”

示例 4
用户：今天市场怎么看
你的做法：优先判断用户要 A股、港股还是全球市场；不明确时先简短澄清，或明确说明“以下先按 A股理解”。

示例 5
用户：海光信息为什么走强
你的做法：这是开放问题，可以结合个股分析、消息、热点来回答；如果证据不足，要明确说“目前只能从技术面/消息面做有限判断”。

## 输出格式（用于前端 carousel）
- summary 必须是 markdown，并用 2~4 个 '## 标题' 分段（每段就是一个 topic card）。
- 每个段落最多 4 行；每行尽量短；总字数尽量 < 450 字。
- 不要输出超长原文，不要贴大段新闻全文；新闻只给“标题+一句影响”。
- 对单股要包含：价格/信号评分/1-2 条关键结论/一个风险点。
- actions 给 1~3 条下一步问题（短句）。
"""


@dataclass
class AgentDeps:
    """Dependencies injected into the agent: services and accumulator for tool results."""

    stock_service: StockAnalysisService
    news_service: NewsService
    hotspot_service: HotspotService
    portfolio_service: PortfolioService
    web_search_service: WebSearchService
    tool_results: List[Dict[str, Any]] = field(default_factory=list)
    progress_callback: Optional[ProgressCallback] = None

    def report(self, stage: str, progress_pct: int, message: str, meta: Optional[Dict[str, Any]] = None) -> None:
        if self.progress_callback:
            self.progress_callback(stage, progress_pct, message, meta)


def _bounded_limit(value: int, *, default: int, minimum: int = 1, maximum: int) -> int:
    try:
        normalized = int(value)
    except Exception:
        normalized = default
    return max(minimum, min(normalized, maximum))


def _format_web_result_for_agent(item: Any) -> str:
    title = str(getattr(item, "title", "") or "").strip()
    source = str(getattr(item, "source", "") or "").strip()
    published_at = str(getattr(item, "published_at", "") or "").strip()
    if source and source not in title:
        title = f"{title}（{source}）"
    if published_at:
        title = f"{title} [{published_at[:16]}]"
    return title


def create_agent(
    *,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    model: str = "deepseek-chat",
) -> Agent[AgentDeps, AgentOutput]:
    """Build the PydanticAI agent with tools. Use env vars if api_key/base_url/model not passed."""
    import os
    if not PYDANTIC_AI_AVAILABLE:
        raise RuntimeError("pydantic_ai is not installed")
    key = api_key or os.environ.get("LLM_API_KEY")
    url = base_url or os.environ.get("LLM_BASE_URL", "https://api.deepseek.com")
    model_name = model or os.environ.get("LLM_MODEL", "deepseek-chat")
    if not key:
        raise ValueError("LLM_API_KEY (or api_key) is required for PydanticAI agent")
    client = AsyncOpenAI(api_key=key, base_url=url)
    provider = OpenAIProvider(openai_client=client)
    chat_model = OpenAIChatModel(model_name, provider=provider)

    agent = Agent(
        chat_model,
        deps_type=AgentDeps,
        output_type=AgentOutput,
        system_prompt=SYSTEM_PROMPT,
    )

    @agent.tool
    async def search_stocks(ctx: RunContext[AgentDeps], query: str, limit: int = 5) -> str:
        """Search stocks by name or code. Returns matching stock name/code list."""
        deps = ctx.deps
        try:
            limit = _bounded_limit(limit, default=5, maximum=5)
            deps.report("tool_running", 35, "正在识别股票目标", {"tool": "search_stocks"})
            results = await asyncio.to_thread(
                deps.stock_service.search_stocks, query, max_results=limit
            )
            out = [{"name": r.name, "code": r.code, "market": r.market} for r in results]
            deps.tool_results.append({"tool": "search_stocks", "data": [r.model_dump() for r in results]})
            deps.report("tool_completed", 48, "股票目标识别完成", {"tool": "search_stocks"})
            return f"Found {len(results)} stocks: " + ", ".join(f"{r.name}({r.code})" for r in results)
        except Exception as e:
            return f"Search failed: {e}"

    @agent.tool
    async def get_stock_analysis(ctx: RunContext[AgentDeps], stock_code: str) -> str:
        """Get technical analysis and quote for a stock by code (e.g. sh600036, sz000001)."""
        deps = ctx.deps
        try:
            deps.report("tool_running", 40, f"正在获取 {stock_code} 的技术分析", {"tool": "get_stock_analysis"})
            analysis = await asyncio.to_thread(
                deps.stock_service.get_stock_analysis, stock_code, False
            )
            deps.tool_results.append({"tool": "get_stock_analysis", "data": analysis.model_dump()})
            deps.report("tool_completed", 60, "技术分析已完成", {"tool": "get_stock_analysis"})
            s = analysis.signal_summary
            return (
                f"{analysis.stock_name}({analysis.stock_code}) "
                f"price={analysis.quote.current_price}, signal={s.overall_signal}({s.overall_score}/5)."
            )
        except Exception as e:
            return f"Stock analysis failed: {e}"

    @agent.tool
    async def get_stock_news(ctx: RunContext[AgentDeps], stock_code: str, limit: int = 10) -> str:
        """Get recent news for a stock by code."""
        deps = ctx.deps
        try:
            limit = _bounded_limit(limit, default=10, maximum=10)
            deps.report("tool_running", 40, f"正在获取 {stock_code} 的个股消息", {"tool": "get_stock_news"})
            items = await asyncio.to_thread(
                deps.news_service.get_stock_news, stock_code, limit=limit
            )
            deps.tool_results.append({"tool": "get_stock_news", "data": [n.model_dump() for n in items]})
            deps.report("tool_completed", 58, "个股消息已获取完成", {"tool": "get_stock_news"})
            if not items:
                return f"No news for {stock_code}."
            return f"Found {len(items)} news items. Latest: {items[0].title}"
        except Exception as e:
            return f"Stock news failed: {e}"

    @agent.tool
    async def get_global_news(ctx: RunContext[AgentDeps], limit: int = 15) -> str:
        """Get global/macro news (finance, tech, geopolitics)."""
        deps = ctx.deps
        try:
            limit = _bounded_limit(limit, default=10, maximum=10)
            deps.report("tool_running", 40, "正在获取全球新闻摘要", {"tool": "get_global_news"})
            items = await asyncio.to_thread(
                deps.news_service.get_global_news, limit=limit
            )
            deps.tool_results.append({"tool": "get_global_news", "data": [n.model_dump() for n in items]})
            deps.report("tool_completed", 58, "全球新闻摘要已获取完成", {"tool": "get_global_news"})
            if not items:
                return "No global news available."
            return f"Found {len(items)} global news. Top: " + "; ".join(n.title[:40] for n in items[:3])
        except Exception as e:
            return f"Global news failed: {e}"

    @agent.tool
    async def list_hotspots(ctx: RunContext[AgentDeps], limit: int = 8) -> str:
        """List current market hotspots and related stocks."""
        deps = ctx.deps
        try:
            limit = _bounded_limit(limit, default=8, maximum=8)
            deps.report("tool_running", 40, "正在获取热点列表", {"tool": "list_hotspots"})
            items = await asyncio.to_thread(
                deps.hotspot_service.list_hotspots, limit=limit
            )
            deps.tool_results.append({"tool": "list_hotspots", "data": [h.model_dump() for h in items]})
            deps.report("tool_completed", 58, "热点列表已获取完成", {"tool": "list_hotspots"})
            if not items:
                return "No hotspots data."
            return "Hotspots: " + "; ".join(f"{h.topic_name}(heat {h.heat_score:.0f})" for h in items[:5])
        except Exception as e:
            return f"Hotspots failed: {e}"

    @agent.tool
    async def web_search(ctx: RunContext[AgentDeps], query: str, limit: int = 8) -> str:
        """Search the web for latest news/articles (e.g. OpenAI, Iran, Fed)."""
        deps = ctx.deps
        try:
            limit = _bounded_limit(limit, default=3, maximum=3)
            deps.report("tool_running", 45, "正在联网检索网页结果", {"tool": "web_search"})
            results = await asyncio.to_thread(
                deps.web_search_service.search, query, limit=limit
            )
            deps.tool_results.append({"tool": "web_search", "data": [r.model_dump() for r in results]})
            deps.report("tool_completed", 65, "网页检索已完成", {"tool": "web_search"})
            if not results:
                return "No web results."
            return "Web results: " + "; ".join(_format_web_result_for_agent(r)[:90] for r in results[:3])
        except Exception as e:
            return f"Web search failed: {e}"

    @agent.tool
    async def get_portfolio_analysis(ctx: RunContext[AgentDeps]) -> str:
        """Get current portfolio positions and PnL analysis."""
        deps = ctx.deps
        try:
            deps.report("tool_running", 40, "正在获取持仓组合分析", {"tool": "get_portfolio_analysis"})
            analysis = await asyncio.to_thread(deps.portfolio_service.analyze_portfolio)
            deps.tool_results.append({"tool": "get_portfolio_analysis", "data": analysis.model_dump()})
            deps.report("tool_completed", 58, "持仓组合分析已完成", {"tool": "get_portfolio_analysis"})
            return (
                f"Portfolio: total_pnl={analysis.total_pnl:.2f}, "
                f"pnl_pct={analysis.total_pnl_pct:.2f}%, "
                f"positions={len(analysis.positions)}."
            )
        except Exception as e:
            return f"Portfolio analysis failed: {e}"

    @agent.tool
    async def get_hotspot_detail(ctx: RunContext[AgentDeps], topic_name: str) -> str:
        """Get detail for a hotspot topic (related news and stocks)."""
        deps = ctx.deps
        try:
            deps.report("tool_running", 40, "正在获取热点详情", {"tool": "get_hotspot_detail"})
            detail = await asyncio.to_thread(
                deps.hotspot_service.get_hotspot_detail, topic_name
            )
            deps.tool_results.append({
                "tool": "get_hotspot_detail",
                "data": {
                    "topic": detail.topic.model_dump(),
                    "related_news": [n.model_dump() for n in detail.related_news],
                },
            })
            deps.report("tool_completed", 58, "热点详情已获取完成", {"tool": "get_hotspot_detail"})
            return f"Topic {topic_name}: {len(detail.related_news)} related news."
        except Exception as e:
            return f"Hotspot detail failed: {e}"

    return agent


def build_agent_response(
    output: AgentOutput,
    tool_results: List[Dict[str, Any]],
) -> AgentResponse:
    """Convert agent output and tool results into the API response for the chat."""
    payload: Dict[str, Any] = {}
    citations: List[str] = []
    for item in tool_results:
        name = item.get("tool", "")
        data = item.get("data")
        if name == "get_stock_analysis" and data:
            payload.update(
                {
                    "stock_name": data.get("stock_name"),
                    "stock_code": data.get("stock_code"),
                    "market": data.get("market"),
                    "quote": data.get("quote"),
                    "technical_indicators": data.get("technical_indicators", {}),
                    "signal_summary": data.get("signal_summary"),
                    "technical_commentary": data.get("technical_commentary", []),
                    "ai_insight": data.get("ai_insight", {"enabled": False}),
                    "chart_series": data.get("chart_series", []),
                    "metadata": data.get("metadata", {}),
                }
            )
            citations.append(f"/api/stocks/{data.get('stock_code', '')}/analysis")
        elif name == "get_stock_news" and data:
            payload["news"] = data
            if data:
                payload["stock_code"] = data[0].get("stock_code")
                payload["stock_name"] = payload.get("stock_name") or data[0].get("stock_name")
            citations.append("/api/stocks/.../news")
        elif name == "get_global_news" and data:
            payload["global_news"] = data
            citations.append("/api/news/global")
        elif name == "list_hotspots" and data:
            payload["hotspots"] = data
            citations.append("/api/hotspots")
        elif name == "web_search" and data:
            payload["web_results"] = data
            citations.append("/api/web/search")
        elif name == "get_portfolio_analysis" and data:
            payload.update(
                {
                    "total_cost": data.get("total_cost"),
                    "total_market_value": data.get("total_market_value"),
                    "total_pnl": data.get("total_pnl"),
                    "total_pnl_pct": data.get("total_pnl_pct"),
                    "concentration_risk": data.get("concentration_risk"),
                    "technical_risk": data.get("technical_risk"),
                    "rebalance_suggestions": data.get("rebalance_suggestions", []),
                    "positions": data.get("positions", []),
                }
            )
            citations.append("/api/portfolio/analysis")
        elif name == "search_stocks" and data:
            payload["search_results"] = data
            citations.append("/api/stocks/search")
        elif name == "get_hotspot_detail" and data:
            payload["hotspot_detail"] = data
            citations.append("/api/hotspots/...")
    payload["_meta"] = {
        "tools_used": list(dict.fromkeys([item.get("tool", "") for item in tool_results if item.get("tool")])),
        "cache_hits": [],
    }

    summary = (output.summary or "").strip()
    if len(summary) > 1200:
        summary = summary[:1200].rstrip() + "\n\n（已截断）"
    actions = [str(item).strip() for item in (output.actions or []) if str(item).strip()]
    actions = actions[:3]
    citations = list(dict.fromkeys(citations))

    return AgentResponse(
        intent="pydantic_ai_agent",
        summary=summary,
        actions=actions,
        citations=citations or ["agent_tools"],
        payload=payload,
    )


async def run_agent_async(
    agent: Agent[AgentDeps, AgentOutput],
    deps: AgentDeps,
    user_query: str,
    progress_callback: Optional[Callable[[str, int, str, Optional[Dict[str, Any]]], None]] = None,
) -> AgentResponse:
    """Run the agent and return the chat response."""
    deps.tool_results.clear()
    deps.progress_callback = progress_callback
    result = await agent.run(user_query.strip(), deps=deps)
    if result.output is None:
        return AgentResponse(
            intent="error",
            summary="Agent did not return a valid response.",
            actions=[],
            citations=[],
            payload={},
        )
    deps.report("compose_response", 85, "正在整理最终回答")
    return build_agent_response(result.output, deps.tool_results)


def run_agent_sync(
    agent: Agent[AgentDeps, AgentOutput],
    deps: AgentDeps,
    user_query: str,
) -> AgentResponse:
    """Synchronous wrapper for use in FastAPI (e.g. sync endpoint)."""
    return asyncio.run(run_agent_async(agent, deps, user_query))
