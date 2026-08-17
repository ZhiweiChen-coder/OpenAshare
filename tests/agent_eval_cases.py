"""Public, non-sensitive Agent evaluation cases."""

from api.agent_eval import EvalCase


PUBLIC_EVAL_CASES = [
    EvalCase(
        case_id="greeting_is_brief",
        query="你好",
        description="问候不应触发数据工具，并应保持简短。",
        forbidden_tools=("all",),
        clarification=False,
        max_chars=180,
    ),
    EvalCase(
        case_id="ambiguous_stock_asks_clarification",
        query="这票怎么样？",
        description="没有股票对象时先澄清，而不是编造判断。",
        forbidden_tools=("all",),
        clarification=True,
        max_chars=240,
    ),
    EvalCase(
        case_id="ambiguous_news_asks_clarification",
        query="这个消息利好谁？",
        description="没有消息或主题对象时先询问具体对象。",
        forbidden_tools=("all",),
        clarification=True,
        max_chars=240,
    ),
    EvalCase(
        case_id="stock_analysis_uses_analysis_tool",
        query="分析 sh600036",
        description="明确股票分析必须使用真实分析工具并给出来源。",
        expected_tools=("stock_analysis",),
        required_payload_keys=("stock_code",),
        required_terms=("招商银行",),
        require_citation=True,
    ),
    EvalCase(
        case_id="stock_news_uses_news_tool",
        query="招商银行最近有什么消息？",
        description="个股新闻问题必须使用个股新闻工具。",
        expected_tools=("stock_news",),
        forbidden_tools=("stock_analysis",),
        required_payload_keys=("news",),
        required_terms=("招商银行",),
        require_citation=True,
    ),
    EvalCase(
        case_id="stock_analysis_does_not_require_news",
        query="分析 sh600036",
        description="纯技术分析问题不应自动调用个股新闻工具。",
        expected_tools=("stock_analysis",),
        forbidden_tools=("stock_news",),
        required_payload_keys=("stock_code",),
        require_citation=True,
    ),
    EvalCase(
        case_id="hotspot_uses_hotspot_tool",
        query="今天有什么热点？",
        description="热点问题使用热点工具，不需要泛化成长文。",
        required_tool_groups=(("hotspots",),),
        forbidden_tools=("web_search", "hotspot_detail"),
        required_payload_groups=(("hotspots", "hotspot_briefs"),),
        require_citation=True,
    ),
    EvalCase(
        case_id="market_uses_context_tool",
        query="今天A股市场怎么看？",
        description="市场问题至少使用全球新闻或热点上下文工具。",
        required_tool_groups=(("global_news", "hotspots"),),
        required_payload_groups=(("global_news", "global_news_briefs", "hotspots", "hotspot_briefs"),),
        require_citation=True,
    ),
    EvalCase(
        case_id="explicit_web_search_uses_web_tool",
        query="请联网搜索 DeepSeek V4 Flash 最近的公开信息，并给出来源",
        description="用户明确要求联网时必须使用 web search 并返回引用。",
        expected_tools=("web_search",),
        required_payload_groups=(("web_results", "web_briefs"),),
        require_citation=True,
    ),
    EvalCase(
        case_id="followup_reuses_stock_context",
        query="它现在怎么样？",
        description="后续问题应从已有历史继承股票对象。",
        history=(
            {"role": "user", "content": "分析 sh600519"},
            {"role": "agent", "content": "已完成贵州茅台分析", "stock_code": "sh600519", "stock_name": "贵州茅台"},
        ),
        expected_tools=("stock_analysis",),
        required_payload_keys=("stock_code",),
        required_terms=("贵州茅台",),
        require_citation=True,
    ),
]


ONLINE_EVAL_CASES = [
    EvalCase(
        case_id="online_stock_code_lookup",
        query="请联网搜索并确认寒武纪的股票代码和交易市场。",
        description="股票代码查询可以使用在线股票搜索 fallback，不应只依赖本地代码库。",
        required_tool_groups=(("stock_search", "web_search"),),
        required_payload_groups=(("search_results", "web_results"),),
        required_payload_terms=("寒武纪", "sh688256"),
        require_citation=True,
    ),
]


PRIVATE_EVAL_CASES = [
    EvalCase(
        case_id="portfolio_is_private",
        query="分析我的持仓",
        description="持仓评测只能在本地已授权环境执行。",
        expected_tools=("portfolio_analysis",),
        require_citation=True,
        private=True,
    ),
]
