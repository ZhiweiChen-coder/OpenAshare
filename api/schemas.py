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
