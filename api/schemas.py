from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class StockSearchResult(BaseModel):
    name: str
    code: str
    market: str
    category: str = ""
    score: int = 0
    match_type: str = ""


class QuoteSnapshot(BaseModel):
    stock_name: str
    stock_code: str
    current_price: float
    change: float
    change_pct: float
    open_price: float
    high_price: float
    low_price: float
    volume: float
    amplitude_pct: float
    timestamp: datetime


class SignalSummary(BaseModel):
    overall_score: int
    overall_signal: str
    categories: Dict[str, Any] = Field(default_factory=dict)


class AIInsight(BaseModel):
    enabled: bool
    content: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    error: Optional[str] = None


class ModelOption(BaseModel):
    value: str
    label: str
    description: Optional[str] = None


class StockAnalysisResponse(BaseModel):
    stock_name: str
    stock_code: str
    market: str
    quote: QuoteSnapshot
    technical_indicators: Dict[str, Optional[float]]
    signal_summary: SignalSummary
    technical_commentary: List[str]
    ai_insight: AIInsight
    chart_series: List[Dict[str, Any]]
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AnalysisProgressResponse(BaseModel):
    request_id: str
    status: Literal["pending", "completed", "error", "unknown"] = "unknown"
    stage: str = "unknown"
    progress_pct: int = 0
    message: str = ""
    stock_code: Optional[str] = None
    include_ai: bool = False
    updated_at: Optional[datetime] = None


class NewsItem(BaseModel):
    id: str
    stock_code: str
    stock_name: str
    source: str
    published_at: str
    title: str
    summary: str
    relation_type: str = "direct"
    sentiment: Literal["bullish", "bearish", "neutral"] = "neutral"
    impact_level: int = 1
    ai_takeaway: Optional[str] = None
    url: Optional[str] = None
    raw_payload: Dict[str, Any] = Field(default_factory=dict)


class GlobalNewsItem(BaseModel):
    id: str
    title: str
    summary: str
    source: str
    published_at: str
    category: str
    topic: str
    region: str = "global"
    sentiment: Literal["bullish", "bearish", "neutral"] = "neutral"
    impact_level: int = 1
    url: Optional[str] = None
    related_symbols: List[str] = Field(default_factory=list)
    raw_payload: Dict[str, Any] = Field(default_factory=dict)


class WebSearchResult(BaseModel):
    id: str
    title: str
    snippet: str
    url: str
    source: str
    published_at: Optional[str] = None
    provider: str
    query: str


class HotspotRelatedStock(BaseModel):
    stock_name: str
    stock_code: str
    reason: str


class HotspotItem(BaseModel):
    topic_name: str
    heat_score: float
    reason: str
    related_stocks: List[HotspotRelatedStock] = Field(default_factory=list)
    trend_direction: Literal["up", "down", "flat"] = "flat"
    ai_summary: Optional[str] = None
    source: str = "derived"


class HotspotHistoryPoint(BaseModel):
    date: str
    score: float
    count: int


class HotspotDetailResponse(BaseModel):
    topic: HotspotItem
    related_news: List[NewsItem] = Field(default_factory=list)
    history: List[HotspotHistoryPoint] = Field(default_factory=list)


class MarketIndexSnapshot(BaseModel):
    stock_code: str
    stock_name: str
    current_price: float
    change_pct: float
    above_ma20: bool = False
    above_ma60: bool = False
    trend_score: float = 0


class MarketRegimeResponse(BaseModel):
    regime: Literal["risk_on", "neutral", "risk_off"] = "neutral"
    score: float = 50
    action_bias: str = ""
    position_guidance: str = ""
    summary: str = ""
    notes: List[str] = Field(default_factory=list)
    indices: List[MarketIndexSnapshot] = Field(default_factory=list)
    updated_at: Optional[datetime] = None


class PortfolioPosition(BaseModel):
    id: Optional[int] = None
    stock_code: str
    stock_name: str
    cost_price: float
    quantity: float
    weight_pct: Optional[float] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PositionAnalysis(BaseModel):
    position: PortfolioPosition
    current_price: float
    market_value: float
    pnl: float
    pnl_pct: float
    risk_level: Literal["low", "medium", "high"]
    signal_summary: SignalSummary
    suggestion: str


class PortfolioAnalysisResponse(BaseModel):
    total_cost: float
    total_market_value: float
    total_pnl: float
    total_pnl_pct: float
    concentration_risk: str
    technical_risk: str
    rebalance_suggestions: List[str]
    positions: List[PositionAnalysis]


class StrategyScoreBreakdown(BaseModel):
    c: float = 0
    a: float = 0
    n: float = 0
    s: float = 0
    l: float = 0
    i: float = 0
    m: float = 0
    total: float = 0


class StrategyCandidate(BaseModel):
    strategy_key: str
    stock_code: str
    stock_name: str
    market: str
    score: StrategyScoreBreakdown
    factor_notes: Dict[str, str] = Field(default_factory=dict)
    reasons: List[str] = Field(default_factory=list)
    risks: List[str] = Field(default_factory=list)
    source_scope: Literal["hotspot", "market"] = "hotspot"
    source_topic: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class StrategyScreenResponse(BaseModel):
    strategy_key: str
    scope: Literal["hotspot", "market"]
    topic: Optional[str] = None
    generated_at: datetime
    candidates: List[StrategyCandidate] = Field(default_factory=list)


class StrategyHolding(BaseModel):
    id: Optional[int] = None
    strategy_key: str
    stock_code: str
    stock_name: str
    entry_price: float
    quantity: float
    entry_date: Optional[str] = None
    exit_price: Optional[float] = None
    exit_date: Optional[str] = None
    source_topic: Optional[str] = None
    plan_reason: Optional[str] = None
    plan_entry_trigger: Optional[str] = None
    plan_entry_zone: Optional[str] = None
    plan_stop_loss: Optional[float] = None
    plan_take_profit: Optional[float] = None
    plan_max_position_pct: Optional[float] = None
    notes: Optional[str] = None
    status: Literal["watching", "planned", "holding", "weakening", "exited", "invalidated"] = "planned"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class StrategyHoldingAnalysis(BaseModel):
    holding: StrategyHolding
    current_price: float
    market_value: float
    pnl: float
    pnl_pct: float
    realized_pnl: float = 0
    realized_pnl_pct: float = 0
    strategy_score: StrategyScoreBreakdown
    thesis_status: Literal["active", "weakening", "broken"]
    factor_notes: Dict[str, str] = Field(default_factory=dict)
    invalidation_reason: Optional[str] = None
    action_label: str = "继续持有"
    action_reason: str = ""
    trigger_hits: List[str] = Field(default_factory=list)
    alerts: List[str] = Field(default_factory=list)


class StrategyTodoItem(BaseModel):
    holding_id: Optional[int] = None
    stock_code: str
    stock_name: str
    status: str
    action_label: str
    action_reason: str
    priority: int = 0


class StrategyReviewItem(BaseModel):
    holding_id: Optional[int] = None
    stock_code: str
    stock_name: str
    status: str
    summary: str
    outcome_label: str


class StrategyHoldingAnalysisResponse(BaseModel):
    total_cost: float
    total_market_value: float
    total_pnl: float
    total_pnl_pct: float
    total_realized_pnl: float = 0
    holding_count: int = 0
    active_count: int = 0
    watching_count: int = 0
    planned_count: int = 0
    weakening_count: int = 0
    exited_count: int = 0
    invalidated_count: int = 0
    win_rate_pct: float = 0
    average_score: float = 0
    todo_items: List[StrategyTodoItem] = Field(default_factory=list)
    review_items: List[StrategyReviewItem] = Field(default_factory=list)
    holdings: List[StrategyHoldingAnalysis] = Field(default_factory=list)


class AgentHistoryTurn(BaseModel):
    role: Literal["user", "agent"]
    content: str
    intent: Optional[str] = None
    stock_code: Optional[str] = None
    stock_name: Optional[str] = None


class AgentQuery(BaseModel):
    query: str
    session_id: Optional[str] = None
    history: List[AgentHistoryTurn] = Field(default_factory=list)


class AgentResponse(BaseModel):
    intent: str
    summary: str
    actions: List[str] = Field(default_factory=list)
    citations: List[str] = Field(default_factory=list)
    payload: Dict[str, Any] = Field(default_factory=dict)


class ProgressEventBase(BaseModel):
    kind: Literal["start", "progress", "result", "error", "done"]
    flow: Literal["stock_analysis", "agent_query"]
    stage: str
    progress_pct: int = Field(ge=0, le=100)
    message: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)


class StockAnalysisProgressEvent(ProgressEventBase):
    flow: Literal["stock_analysis"] = "stock_analysis"
    stock_code: Optional[str] = None
    payload: Optional[StockAnalysisResponse] = None


class AgentProgressEvent(ProgressEventBase):
    flow: Literal["agent_query"] = "agent_query"
    payload: Optional[AgentResponse] = None


class ProgressErrorEvent(ProgressEventBase):
    kind: Literal["error"] = "error"


class ProgressDoneEvent(ProgressEventBase):
    kind: Literal["done"] = "done"
    progress_pct: int = 100


class UserSettingsResponse(BaseModel):
    llm_model: str
    llm_model_source: Literal["env", "user"] = "env"
    llm_base_url: Optional[str] = None
    llm_configured: bool = False
    updated_at: Optional[str] = None
    model_options: List[ModelOption] = Field(default_factory=list)


class UserSettingsUpdate(BaseModel):
    llm_model: str = Field(..., min_length=1, max_length=128)
    llm_base_url: Optional[str] = Field(None, max_length=512)
    llm_api_key: Optional[str] = Field(
        None,
        max_length=512,
        description="新的 API Key。为安全起见不会通过接口回显，仅用于更新服务端配置。",
    )
