from __future__ import annotations

import hashlib
import base64
import asyncio
import hmac
import json
import logging
import os
import sqlite3
from contextlib import asynccontextmanager
from typing import Any, List, Optional
from pathlib import Path
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.agent_pydantic import (
    AgentDeps,
    create_agent,
    run_agent_async,
)
from api.schemas import (
    AnalysisProgressResponse,
    AgentProgressEvent,
    AgentHistoryTurn,
    AgentQuery,
    AgentResponse,
    GlobalNewsItem,
    HotspotDetailResponse,
    HotspotItem,
    NewsItem,
    StockAnalysisProgressEvent,
    PortfolioAnalysisResponse,
    PortfolioPosition,
    StockAnalysisResponse,
    StockSearchResult,
    UserSettingsResponse,
    UserSettingsUpdate,
    WebSearchResult,
)
from api.sse import encode_sse, sse_response
from api.settings_store import UserSettingsStore
from api.services import AgentService, HotspotService, NewsService, PortfolioService, StockAnalysisService, WebSearchService
from ashare.config import PROJECT_ROOT

settings_store = UserSettingsStore(PROJECT_ROOT / "data" / "user_settings.json")
stock_service = StockAnalysisService(settings_store=settings_store)
news_service = NewsService()
hotspot_service = HotspotService(news_service=news_service)
portfolio_service = PortfolioService()
web_search_service = WebSearchService()
agent_service = AgentService(stock_service, news_service, hotspot_service, portfolio_service, web_search_service)

DEMO_ACCESS_COOKIE_NAME = "ashare_demo_access"
DEMO_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 30


def _get_demo_access_code() -> str:
    return os.getenv("DEMO_ACCESS_CODE", "").strip()


def _get_demo_access_secret() -> str:
    return os.getenv("DEMO_ACCESS_SECRET", "").strip() or _get_demo_access_code()


def _demo_access_enabled() -> bool:
    return bool(_get_demo_access_code() and _get_demo_access_secret())


def _demo_access_signature(issued_at: int, secret: str | None = None) -> str:
    secret_value = secret or _get_demo_access_secret()
    digest = hmac.new(secret_value.encode("utf-8"), str(issued_at).encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _build_demo_access_token(now: datetime | None = None) -> tuple[str, datetime]:
    issued_at = int((now or datetime.now(timezone.utc)).timestamp())
    expires_at = datetime.fromtimestamp(issued_at + DEMO_ACCESS_MAX_AGE_SECONDS, tz=timezone.utc)
    return f"{issued_at}.{_demo_access_signature(issued_at)}", expires_at


def _demo_access_status_from_token(token: Optional[str]) -> dict[str, Any]:
    if not _demo_access_enabled():
        return {"enabled": False, "unlocked": True, "expires_at": None}
    if not token:
        return {"enabled": True, "unlocked": False, "expires_at": None}
    try:
        issued_at_raw, signature = token.split(".", 1)
        issued_at = int(issued_at_raw)
    except (ValueError, TypeError):
        return {"enabled": True, "unlocked": False, "expires_at": None}
    expected = _demo_access_signature(issued_at)
    if not hmac.compare_digest(expected, signature):
        return {"enabled": True, "unlocked": False, "expires_at": None}
    now_seconds = int(datetime.now(timezone.utc).timestamp())
    if issued_at + DEMO_ACCESS_MAX_AGE_SECONDS < now_seconds:
        expires_at = datetime.fromtimestamp(issued_at + DEMO_ACCESS_MAX_AGE_SECONDS, tz=timezone.utc)
        return {"enabled": True, "unlocked": False, "expires_at": expires_at.isoformat()}
    expires_at = datetime.fromtimestamp(issued_at + DEMO_ACCESS_MAX_AGE_SECONDS, tz=timezone.utc)
    return {"enabled": True, "unlocked": True, "expires_at": expires_at.isoformat()}


def _require_demo_access(request: Request, feature_name: str) -> None:
    if not _demo_access_enabled():
        return
    token = request.cookies.get(DEMO_ACCESS_COOKIE_NAME)
    if _demo_access_status_from_token(token).get("unlocked"):
        return
    raise HTTPException(status_code=403, detail=f"{feature_name}需要先解锁演示访问。")


def _build_etag(payload: Any) -> str:
    encoded = jsonable_encoder(payload)
    raw = json.dumps(encoded, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return f'W/"{hashlib.sha1(raw.encode("utf-8")).hexdigest()}"'


def _cached_json_response(
    request: Request,
    payload: Any,
    *,
    max_age: int,
    stale_while_revalidate: int = 120,
) -> Response:
    etag = _build_etag(payload)
    headers = {
        "Cache-Control": f"public, max-age={max_age}, stale-while-revalidate={stale_while_revalidate}",
        "ETag": etag,
    }
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return JSONResponse(content=jsonable_encoder(payload), headers=headers)


def _emit_stock_progress(
    queue: "asyncio.Queue[str | None]",
    loop: asyncio.AbstractEventLoop,
    *,
    kind: str,
    stage: str,
    progress_pct: int,
    message: str,
    stock_code: Optional[str] = None,
    meta: Optional[dict[str, Any]] = None,
    payload: Optional[StockAnalysisResponse] = None,
) -> None:
    event = StockAnalysisProgressEvent(
        kind=kind,
        flow="stock_analysis",
        stage=stage,
        progress_pct=progress_pct,
        message=message,
        stock_code=stock_code,
        meta=meta or {},
        payload=payload,
    )
    loop.call_soon_threadsafe(queue.put_nowait, encode_sse(kind, event.model_dump(mode="json", exclude_none=True)))


def _normalize_agent_progress_message(
    stage: str,
    message: str,
    meta: Optional[dict[str, Any]] = None,
    *,
    kind: str,
    progress_pct: int,
) -> str:
    normalized_meta = meta or {}
    tool = normalized_meta.get("tool")
    engine = normalized_meta.get("engine")

    tool_messages = {
        ("tool_running", "portfolio_analysis"): "正在获取持仓组合分析",
        ("tool_completed", "portfolio_analysis"): "持仓组合分析已完成",
        ("tool_running", "hotspots"): "正在获取热点列表",
        ("tool_completed", "hotspots"): "热点列表已加载",
        ("tool_running", "global_news"): "正在获取全球重点新闻",
        ("tool_completed", "global_news"): "全球重点新闻已加载",
        ("tool_running", "stock_news"): "正在获取个股消息",
        ("tool_completed", "stock_news"): "个股消息已加载",
        ("tool_running", "stock_analysis"): "正在获取技术分析",
        ("tool_completed", "stock_analysis"): "技术分析已加载",
    }
    if (stage, tool) in tool_messages:
        return tool_messages[(stage, tool)]

    if stage == "select_engine" and engine == "pydantic_ai":
        return "已选择智能引擎，准备执行工具调用"
    if stage == "select_engine" and engine == "deterministic" and progress_pct >= 30:
        return "智能引擎失败，切换到规则分析"
    if stage == "select_engine" and engine == "deterministic":
        return "已选择规则分析引擎"
    if stage == "persist_memory":
        return "会话记忆已更新"
    if kind == "result" and stage == "completed":
        return "最终回答已生成"

    return message


def _emit_agent_progress(
    queue: "asyncio.Queue[str | None]",
    loop: asyncio.AbstractEventLoop,
    *,
    kind: str,
    stage: str,
    progress_pct: int,
    message: str,
    meta: Optional[dict[str, Any]] = None,
    payload: Optional[AgentResponse] = None,
) -> None:
    event = AgentProgressEvent(
        kind=kind,
        flow="agent_query",
        stage=stage,
        progress_pct=progress_pct,
        message=_normalize_agent_progress_message(stage, message, meta, kind=kind, progress_pct=progress_pct),
        meta=meta or {},
        payload=payload,
    )
    loop.call_soon_threadsafe(queue.put_nowait, encode_sse(kind, event.model_dump(mode="json", exclude_none=True)))


def _warm_read_caches() -> None:
    try:
        news_service.get_global_news(limit=20)
    except Exception:
        logger.exception("Warmup failed for global news")
    try:
        hotspot_service.list_hotspots(limit=10)
    except Exception:
        logger.exception("Warmup failed for hotspots")


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        asyncio.create_task(asyncio.to_thread(_warm_read_caches))
    except Exception:
        logger.exception("Failed to schedule cache warmup")
    yield


app = FastAPI(
    title="OpenAshare API",
    version="0.1.0",
    description="API layer for stock analysis, portfolio insights, news and hotspots.",
    lifespan=lifespan,
)

def _load_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOWED_ORIGINS", "")
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    defaults = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    if origins:
        return origins
    return defaults


def _load_cors_origin_regex() -> str:
    value = os.getenv("CORS_ALLOWED_ORIGIN_REGEX", "").strip()
    return value


app.add_middleware(
    CORSMiddleware,
    allow_origins=_load_cors_origins(),
    allow_origin_regex=_load_cors_origin_regex() or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Log unhandled exceptions and return 500 with a JSON body so the client gets a message."""
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__},
    )


class AgentMemoryStore:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    intent TEXT,
                    stock_code TEXT,
                    stock_name TEXT
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_agent_memory_session_id_id ON agent_memory(session_id, id)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_profile (
                    session_id TEXT PRIMARY KEY,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    preferred_market TEXT,
                    last_stock_code TEXT,
                    last_stock_name TEXT,
                    watchlist_json TEXT NOT NULL DEFAULT '[]',
                    pinned_memory_json TEXT NOT NULL DEFAULT '[]',
                    active_goal TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_profile_summary (
                    session_id TEXT PRIMARY KEY,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_heartbeat_at TEXT,
                    heartbeat_count INTEGER NOT NULL DEFAULT 0,
                    summary_text TEXT,
                    memory_markdown_path TEXT
                )
                """
            )
            columns = {
                row[1]
                for row in conn.execute("PRAGMA table_info(agent_profile)").fetchall()
            }
            if "pinned_memory_json" not in columns:
                conn.execute(
                    "ALTER TABLE agent_profile ADD COLUMN pinned_memory_json TEXT NOT NULL DEFAULT '[]'"
                )
            if "active_goal" not in columns:
                conn.execute(
                    "ALTER TABLE agent_profile ADD COLUMN active_goal TEXT"
                )

    def append_turn(
        self,
        session_id: str,
        *,
        role: str,
        content: str,
        intent: Optional[str] = None,
        stock_code: Optional[str] = None,
        stock_name: Optional[str] = None,
    ) -> None:
        if not session_id or not content.strip():
            return
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO agent_memory (session_id, role, content, intent, stock_code, stock_name)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (session_id, role, content.strip(), intent, stock_code, stock_name),
            )

    def get_recent_history(self, session_id: str, limit: int = 12) -> List[dict[str, Any]]:
        if not session_id:
            return []
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT role, content, intent, stock_code, stock_name
                FROM agent_memory
                WHERE session_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (session_id, limit),
            ).fetchall()
        return [
            {
                "role": row[0],
                "content": row[1],
                "intent": row[2],
                "stock_code": row[3],
                "stock_name": row[4],
            }
            for row in reversed(rows)
        ]

    def get_profile(self, session_id: str) -> dict[str, Any]:
        if not session_id:
            return {
                "preferred_market": None,
                "last_stock_code": None,
                "last_stock_name": None,
                "watchlist": [],
                "pinned_memory": [],
                "active_goal": None,
            }
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT preferred_market, last_stock_code, last_stock_name, watchlist_json, pinned_memory_json, active_goal
                FROM agent_profile
                WHERE session_id = ?
                """,
                (session_id,),
            ).fetchone()
        if not row:
            return {
                "preferred_market": None,
                "last_stock_code": None,
                "last_stock_name": None,
                "watchlist": [],
                "pinned_memory": [],
                "active_goal": None,
            }
        import json

        try:
            watchlist = json.loads(row[3] or "[]")
        except Exception:
            watchlist = []
        try:
            pinned_memory = json.loads(row[4] or "[]")
        except Exception:
            pinned_memory = []
        return {
            "preferred_market": row[0],
            "last_stock_code": row[1],
            "last_stock_name": row[2],
            "watchlist": watchlist if isinstance(watchlist, list) else [],
            "pinned_memory": pinned_memory if isinstance(pinned_memory, list) else [],
            "active_goal": row[5],
        }

    def update_profile(
        self,
        session_id: str,
        *,
        preferred_market: Optional[str] = None,
        last_stock_code: Optional[str] = None,
        last_stock_name: Optional[str] = None,
        watchlist: Optional[List[dict[str, str]]] = None,
        pinned_memory: Optional[List[str]] = None,
        active_goal: Optional[str] = None,
    ) -> None:
        if not session_id:
            return
        import json

        current = self.get_profile(session_id)
        merged_watchlist = watchlist if watchlist is not None else current.get("watchlist", [])
        merged_pinned_memory = pinned_memory if pinned_memory is not None else current.get("pinned_memory", [])
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO agent_profile (
                    session_id, updated_at, preferred_market, last_stock_code, last_stock_name, watchlist_json, pinned_memory_json, active_goal
                )
                VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    updated_at = CURRENT_TIMESTAMP,
                    preferred_market = excluded.preferred_market,
                    last_stock_code = excluded.last_stock_code,
                    last_stock_name = excluded.last_stock_name,
                    watchlist_json = excluded.watchlist_json,
                    pinned_memory_json = excluded.pinned_memory_json,
                    active_goal = excluded.active_goal
                """,
                (
                    session_id,
                    preferred_market if preferred_market is not None else current.get("preferred_market"),
                    last_stock_code if last_stock_code is not None else current.get("last_stock_code"),
                    last_stock_name if last_stock_name is not None else current.get("last_stock_name"),
                    json.dumps(merged_watchlist, ensure_ascii=False),
                    json.dumps(merged_pinned_memory, ensure_ascii=False),
                    active_goal if active_goal is not None else current.get("active_goal"),
                ),
            )

    def get_profile_summary(self, session_id: str) -> dict[str, Any]:
        if not session_id:
            return {
                "last_heartbeat_at": None,
                "heartbeat_count": 0,
                "summary_text": None,
                "memory_markdown_path": None,
            }
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT last_heartbeat_at, heartbeat_count, summary_text, memory_markdown_path
                FROM agent_profile_summary
                WHERE session_id = ?
                """,
                (session_id,),
            ).fetchone()
        if not row:
            return {
                "last_heartbeat_at": None,
                "heartbeat_count": 0,
                "summary_text": None,
                "memory_markdown_path": None,
            }
        return {
            "last_heartbeat_at": row[0],
            "heartbeat_count": row[1] or 0,
            "summary_text": row[2],
            "memory_markdown_path": row[3],
        }

    def update_profile_summary(
        self,
        session_id: str,
        *,
        last_heartbeat_at: str,
        heartbeat_count: int,
        summary_text: str,
        memory_markdown_path: str,
    ) -> None:
        if not session_id:
            return
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO agent_profile_summary (
                    session_id, updated_at, last_heartbeat_at, heartbeat_count, summary_text, memory_markdown_path
                )
                VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    updated_at = CURRENT_TIMESTAMP,
                    last_heartbeat_at = excluded.last_heartbeat_at,
                    heartbeat_count = excluded.heartbeat_count,
                    summary_text = excluded.summary_text,
                    memory_markdown_path = excluded.memory_markdown_path
                """,
                (session_id, last_heartbeat_at, heartbeat_count, summary_text, memory_markdown_path),
            )


agent_memory_store = AgentMemoryStore(PROJECT_ROOT / "data" / "agent_memory.db")
AGENT_MEMORY_DIR = PROJECT_ROOT / "data" / "agent_memory"
AGENT_MEMORY_DIR.mkdir(parents=True, exist_ok=True)
HEARTBEAT_INTERVAL_MINUTES = int(os.environ.get("AGENT_HEARTBEAT_MINUTES", "15"))

# PydanticAI agent (used when LLM_API_KEY is set)
_pydantic_agent: Optional[object] = None
_agent_deps: Optional[AgentDeps] = None
_pydantic_agent_signature: Optional[tuple[str, str, str]] = None


def _get_pydantic_agent():
    global _pydantic_agent, _agent_deps, _pydantic_agent_signature
    runtime_config = settings_store.build_runtime_config(stock_service.config)
    if not runtime_config.llm_api_key:
        _pydantic_agent = None
        _agent_deps = None
        _pydantic_agent_signature = None
        return None, None
    signature = (
        runtime_config.llm_api_key,
        runtime_config.llm_base_url,
        runtime_config.llm_model,
    )
    if _pydantic_agent is not None and _pydantic_agent_signature == signature:
        return _pydantic_agent, _agent_deps
    try:
        _pydantic_agent = create_agent(
            api_key=runtime_config.llm_api_key,
            base_url=runtime_config.llm_base_url,
            model=runtime_config.llm_model,
        )
        _agent_deps = AgentDeps(
            stock_service=stock_service,
            news_service=news_service,
            hotspot_service=hotspot_service,
            portfolio_service=portfolio_service,
            web_search_service=web_search_service,
        )
        _pydantic_agent_signature = signature
        return _pydantic_agent, _agent_deps
    except Exception:
        _pydantic_agent_signature = None
        return None, None


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}


@app.get("/api/settings", response_model=UserSettingsResponse)
def get_user_settings(request: Request) -> UserSettingsResponse:
    _require_demo_access(request, "设置")
    return settings_store.get_settings()


@app.put("/api/settings", response_model=UserSettingsResponse)
def update_user_settings(request: Request, payload: UserSettingsUpdate) -> UserSettingsResponse:
    _require_demo_access(request, "设置")
    global _pydantic_agent, _agent_deps, _pydantic_agent_signature
    updated = settings_store.update_settings(
        llm_model=payload.llm_model,
        llm_base_url=payload.llm_base_url,
        llm_api_key=payload.llm_api_key,
    )
    stock_service._response_cache.clear()
    agent_service._cache.clear()
    _pydantic_agent = None
    _agent_deps = None
    _pydantic_agent_signature = None
    return updated


@app.get("/api/stocks/search", response_model=List[StockSearchResult])
def search_stocks(
    request: Request,
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=20),
    request_id: Optional[str] = Query(None),
) -> Response:
    try:
        if request_id:
            payload = stock_service.search_stocks(q, max_results=limit, request_id=request_id)
        else:
            payload = stock_service.search_stocks(q, max_results=limit)
        return _cached_json_response(request, payload, max_age=300, stale_while_revalidate=600)
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        stock_service.progress_store.update(
            request_id,
            status="error",
            stage="search_error",
            progress_pct=100,
            message=f"标的识别失败：{exc}",
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/stocks/{stock_code}/analysis", response_model=StockAnalysisResponse)
def get_stock_analysis(
    request: Request,
    stock_code: str,
    include_ai: bool = Query(True, description="是否生成 AI 文本分析，默认开启"),
    request_id: Optional[str] = Query(None, description="用于跟踪单次分析进度的请求 ID"),
) -> Response:
    try:
        if include_ai:
            _require_demo_access(request, "AI 分析")
        if request_id:
            payload = stock_service.get_stock_analysis(stock_code, include_ai=include_ai, request_id=request_id)
        else:
            payload = stock_service.get_stock_analysis(stock_code, include_ai=include_ai)
        return _cached_json_response(request, payload, max_age=120, stale_while_revalidate=240)
    except HTTPException:
        raise
    except Exception as exc:
        stock_service.progress_store.update(
            request_id,
            status="error",
            stage="analysis_error",
            progress_pct=100,
            message=f"单股分析失败：{exc}",
            stock_code=stock_code,
            include_ai=include_ai,
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@app.get("/api/stocks/{stock_code}/analysis/stream")
async def stream_stock_analysis(
    request: Request,
    stock_code: str,
    include_ai: bool = Query(True, description="是否生成 AI 文本分析，默认开启"),
):
    if include_ai:
        _require_demo_access(request, "AI 分析")
    queue: asyncio.Queue[str | None] = asyncio.Queue()
    loop = asyncio.get_running_loop()
    normalized_code = stock_code.strip()

    async def runner() -> None:
        _emit_stock_progress(
            queue,
            loop,
            kind="start",
            stage="resolve_stock",
            progress_pct=5,
            message="已接收分析请求，准备解析股票标的",
            stock_code=normalized_code,
        )

        def report(stage: str, progress_pct: int, message: str, meta: Optional[dict[str, Any]] = None) -> None:
            _emit_stock_progress(
                queue,
                loop,
                kind="progress",
                stage=stage,
                progress_pct=progress_pct,
                message=message,
                stock_code=normalized_code,
                meta=meta,
            )

        try:
            payload = await asyncio.to_thread(
                stock_service.get_stock_analysis,
                stock_code,
                include_ai,
                report,
            )
            _emit_stock_progress(
                queue,
                loop,
                kind="result",
                stage="completed",
                progress_pct=100,
                message="分析结果已生成",
                stock_code=payload.stock_code,
                payload=payload,
            )
        except Exception as exc:
            logger.exception("stream_stock_analysis failed")
            _emit_stock_progress(
                queue,
                loop,
                kind="error",
                stage="error",
                progress_pct=100,
                message=f"分析失败：{exc}",
                stock_code=normalized_code,
            )
        finally:
            _emit_stock_progress(
                queue,
                loop,
                kind="done",
                stage="completed",
                progress_pct=100,
                message="分析流已结束",
                stock_code=normalized_code,
            )
            await queue.put(None)

    asyncio.create_task(runner())
    return sse_response(queue)

@app.get("/api/stocks/progress/{request_id}", response_model=AnalysisProgressResponse)
def get_stock_analysis_progress(request_id: str) -> AnalysisProgressResponse:
    return stock_service.get_analysis_progress(request_id)


@app.get("/api/stocks/{stock_code}/news", response_model=List[NewsItem])
def get_stock_news(request: Request, stock_code: str, limit: int = Query(20, ge=1, le=50)) -> Response:
    try:
        payload = news_service.get_stock_news(stock_code, limit=limit)
        return _cached_json_response(request, payload, max_age=90, stale_while_revalidate=180)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/hotspots", response_model=List[HotspotItem])
def list_hotspots(request: Request, limit: int = Query(10, ge=1, le=20)) -> Response:
    try:
        payload = hotspot_service.list_hotspots(limit=limit)
        return _cached_json_response(request, payload, max_age=60, stale_while_revalidate=180)
    except Exception as exc:
        logger.exception("list_hotspots failed")
        return JSONResponse(content=[], headers={"Cache-Control": "no-store"})


@app.get("/api/news/global", response_model=List[GlobalNewsItem])
def list_global_news(request: Request, limit: int = Query(20, ge=1, le=50)) -> Response:
    try:
        payload = news_service.get_global_news(limit=limit)
        return _cached_json_response(request, payload, max_age=60, stale_while_revalidate=180)
    except Exception as exc:
        logger.exception("get_global_news failed")
        return JSONResponse(content=[], headers={"Cache-Control": "no-store"})


@app.get("/api/web/search", response_model=List[WebSearchResult])
def web_search(request: Request, q: str = Query(..., min_length=1), limit: int = Query(8, ge=1, le=20)) -> Response:
    payload = web_search_service.search(q, limit=limit)
    return _cached_json_response(request, payload, max_age=120, stale_while_revalidate=240)


@app.get("/api/hotspots/{topic_name}", response_model=HotspotDetailResponse)
def get_hotspot_detail(request: Request, topic_name: str) -> Response:
    try:
        payload = hotspot_service.get_hotspot_detail(topic_name)
        return _cached_json_response(request, payload, max_age=90, stale_while_revalidate=180)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/portfolio", response_model=List[PortfolioPosition])
def list_portfolio_positions(request: Request) -> List[PortfolioPosition]:
    _require_demo_access(request, "持仓管理")
    return portfolio_service.list_positions()


@app.post("/api/portfolio/positions", response_model=PortfolioPosition, status_code=201)
def create_portfolio_position(request: Request, position: PortfolioPosition) -> PortfolioPosition:
    _require_demo_access(request, "持仓管理")
    return portfolio_service.create_position(position)


@app.put("/api/portfolio/positions/{position_id}", response_model=PortfolioPosition)
def update_portfolio_position(request: Request, position_id: int, position: PortfolioPosition) -> PortfolioPosition:
    _require_demo_access(request, "持仓管理")
    return portfolio_service.update_position(position_id, position)


@app.delete("/api/portfolio/positions/{position_id}", status_code=204)
def delete_portfolio_position(request: Request, position_id: int) -> Response:
    _require_demo_access(request, "持仓管理")
    portfolio_service.delete_position(position_id)
    return Response(status_code=204)


@app.get("/api/portfolio/analysis", response_model=PortfolioAnalysisResponse)
def analyze_portfolio(request: Request) -> PortfolioAnalysisResponse:
    _require_demo_access(request, "持仓分析")
    return portfolio_service.analyze_portfolio()


# Minimal JSON body for agent error - always 200 so frontend never sees 500
_AGENT_ERROR_JSON = {
    "intent": "error",
    "summary": "Request failed. See server logs for details.",
    "actions": ["Try again later or check backend logs."],
    "citations": [],
    "payload": {},
}


def _agent_response_to_json(resp: AgentResponse) -> dict[str, Any]:
    """Convert AgentResponse to a JSON-serializable dict (datetime, etc. to string)."""
    try:
        return resp.model_dump(mode="json")
    except Exception:
        return {
            "intent": getattr(resp, "intent", "error"),
            "summary": str(getattr(resp, "summary", ""))[:2000],
            "actions": list(getattr(resp, "actions", [])),
            "citations": list(getattr(resp, "citations", [])),
            "payload": {},
        }


def _error_response(message: str, actions: Optional[List[str]] = None) -> AgentResponse:
    """Build a safe error AgentResponse."""
    safe_msg = (message or "Unknown error")[:2000]
    return AgentResponse(
        intent="error",
        summary=safe_msg,
        actions=actions or ["Try again or check backend logs."],
        citations=[],
        payload={},
    )


def _safe_agent_json(resp: AgentResponse) -> dict[str, Any]:
    """Serialize agent response to JSON-safe dict; on failure return error body."""
    try:
        return _agent_response_to_json(resp)
    except BaseException:
        return {**_AGENT_ERROR_JSON, "summary": "Response serialization failed. See server logs."}


def _attach_memory_profile(resp: AgentResponse, profile: dict[str, Any], heartbeat: Optional[dict[str, Any]] = None) -> AgentResponse:
    payload = dict(resp.payload or {})
    meta = dict(payload.get("_meta") or {})
    meta["memory_profile"] = {
        "preferred_market": profile.get("preferred_market"),
        "last_stock_code": profile.get("last_stock_code"),
        "last_stock_name": profile.get("last_stock_name"),
        "watchlist": profile.get("watchlist", []),
        "pinned_memory": profile.get("pinned_memory", []),
        "active_goal": profile.get("active_goal"),
    }
    if heartbeat is not None:
        meta["heartbeat"] = heartbeat
    payload["_meta"] = meta
    resp.payload = payload
    return resp


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except Exception:
        return None


def _generate_memory_summary(session_id: str, history: List[AgentHistoryTurn], profile: dict[str, Any]) -> str:
    recent_user_msgs = [turn.content.strip() for turn in history if turn.role == "user" and turn.content.strip()]
    recent_topics = recent_user_msgs[-3:]
    watchlist = profile.get("watchlist", [])[:5]
    watchlist_text = "、".join(
        item.get("name") or item.get("code") or ""
        for item in watchlist
        if isinstance(item, dict) and (item.get("name") or item.get("code"))
    ) or "暂无"
    preferred_market = profile.get("preferred_market") or "未形成"
    last_stock = profile.get("last_stock_name") or profile.get("last_stock_code") or "暂无"
    active_goal = profile.get("active_goal") or "暂无"
    pinned_memory = profile.get("pinned_memory", [])[:3]
    pinned_text = "；".join(str(item) for item in pinned_memory if str(item).strip()) or "暂无"
    topics_text = "；".join(recent_topics) if recent_topics else "暂无"
    return (
        f"会话 {session_id} 最近重点关注：{topics_text}。"
        f"最近标的：{last_stock}。偏好市场：{preferred_market}。"
        f"当前目标：{active_goal}。固定记忆：{pinned_text}。关注清单：{watchlist_text}。"
    )


def _write_memory_markdown(session_id: str, summary_text: str, history: List[AgentHistoryTurn], profile: dict[str, Any]) -> str:
    safe_session_id = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in session_id)[:80] or "default"
    path = AGENT_MEMORY_DIR / f"{safe_session_id}.md"
    watchlist = profile.get("watchlist", [])[:5]
    recent_turns = history[-6:]
    pinned_memory = profile.get("pinned_memory", [])[:6]
    markdown = [
        "# Agent Memory",
        "",
        f"- Session: `{session_id}`",
        f"- Preferred market: `{profile.get('preferred_market') or 'unknown'}`",
        f"- Last stock: `{profile.get('last_stock_name') or profile.get('last_stock_code') or 'none'}`",
        f"- Active goal: `{profile.get('active_goal') or 'none'}`",
        "",
        "## Summary",
        "",
        summary_text,
        "",
        "## Pinned Memory",
        "",
    ]
    if pinned_memory:
        markdown.extend(f"- {str(item).strip()}" for item in pinned_memory if str(item).strip())
    else:
        markdown.append("- 暂无")
    markdown.extend([
        "",
        "## Watchlist",
        "",
    ])
    if watchlist:
        markdown.extend(
            f"- {item.get('name') or item.get('code')} ({item.get('code')})"
            for item in watchlist
            if isinstance(item, dict) and item.get("code")
        )
    else:
        markdown.append("- 暂无")
    markdown.extend(["", "## Recent Context", ""])
    if recent_turns:
        markdown.extend(f"- {turn.role}: {turn.content}" for turn in recent_turns)
    else:
        markdown.append("- 暂无")
    path.write_text("\n".join(markdown), encoding="utf-8")
    return str(path)


def _maybe_run_heartbeat(session_id: Optional[str]) -> dict[str, Any]:
    if not session_id:
        return {
            "ran": False,
            "summary_text": None,
            "memory_markdown_path": None,
            "heartbeat_count": 0,
            "last_heartbeat_at": None,
        }
    profile = agent_memory_store.get_profile(session_id)
    summary_row = agent_memory_store.get_profile_summary(session_id)
    history = [
        AgentHistoryTurn(
            role=str(item.get("role", "user")),
            content=str(item.get("content", "")),
            intent=item.get("intent"),
            stock_code=item.get("stock_code"),
            stock_name=item.get("stock_name"),
        )
        for item in agent_memory_store.get_recent_history(session_id, limit=16)
    ]
    if len(history) < 2:
        return {
            "ran": False,
            **summary_row,
        }
    now = datetime.now(timezone.utc)
    last_heartbeat_at = _parse_iso_datetime(summary_row.get("last_heartbeat_at"))
    if last_heartbeat_at and now - last_heartbeat_at < timedelta(minutes=HEARTBEAT_INTERVAL_MINUTES):
        return {
            "ran": False,
            **summary_row,
        }
    summary_text = _generate_memory_summary(session_id, history, profile)
    markdown_path = _write_memory_markdown(session_id, summary_text, history, profile)
    heartbeat_count = int(summary_row.get("heartbeat_count") or 0) + 1
    iso_now = now.isoformat()
    agent_memory_store.update_profile_summary(
        session_id,
        last_heartbeat_at=iso_now,
        heartbeat_count=heartbeat_count,
        summary_text=summary_text,
        memory_markdown_path=markdown_path,
    )
    return {
        "ran": True,
        "last_heartbeat_at": iso_now,
        "heartbeat_count": heartbeat_count,
        "summary_text": summary_text,
        "memory_markdown_path": markdown_path,
    }


def _merge_agent_history(payload: AgentQuery) -> List[AgentHistoryTurn]:
    persisted = agent_memory_store.get_recent_history(payload.session_id or "", limit=12)
    persisted_turns = [
        AgentHistoryTurn(
            role=str(item.get("role", "user")),
            content=str(item.get("content", "")),
            intent=item.get("intent"),
            stock_code=item.get("stock_code"),
            stock_name=item.get("stock_name"),
        )
        for item in persisted
    ]
    client_turns = list(payload.history)
    if not persisted_turns:
        return client_turns[-12:]
    if not client_turns:
        return persisted_turns[-12:]

    def turn_key(turn: AgentHistoryTurn) -> tuple[str, str, Optional[str], Optional[str], Optional[str]]:
        return (
            turn.role,
            turn.content,
            turn.intent,
            turn.stock_code,
            turn.stock_name,
        )

    overlap = 0
    max_overlap = min(len(persisted_turns), len(client_turns))
    for size in range(max_overlap, 0, -1):
        if [turn_key(turn) for turn in persisted_turns[-size:]] == [turn_key(turn) for turn in client_turns[:size]]:
            overlap = size
            break

    merged = persisted_turns + client_turns[overlap:]
    return merged[-12:]


def _build_watchlist(history: List[AgentHistoryTurn], profile: dict[str, Any]) -> List[dict[str, str]]:
    watchlist: List[dict[str, str]] = []
    seen_codes: set[str] = set()
    for item in profile.get("watchlist", []):
        code = item.get("code")
        name = item.get("name")
        if isinstance(code, str) and code and code not in seen_codes:
            seen_codes.add(code)
            watchlist.append({"code": code, "name": name or code})
    for turn in reversed(history):
        if turn.stock_code and turn.stock_code not in seen_codes:
            seen_codes.add(turn.stock_code)
            watchlist.append({"code": turn.stock_code, "name": turn.stock_name or turn.stock_code})
        if len(watchlist) >= 5:
            break
    return watchlist[:5]


def _merge_pinned_memory(profile: dict[str, Any], additions: List[str]) -> List[str]:
    existing = [str(item).strip() for item in profile.get("pinned_memory", []) if str(item).strip()]
    merged = list(existing)
    for item in additions:
        cleaned = str(item).strip().strip("。；;，, ")
        if cleaned and cleaned not in merged:
            merged.append(cleaned)
    return merged[:8]


def _extract_pinned_memory_updates(payload: AgentQuery, response: AgentResponse, profile: dict[str, Any]) -> List[str]:
    query = payload.query.strip()
    additions: List[str] = []
    remember_prefixes = ["记住", "帮我记住", "请记住", "记一下"]
    for prefix in remember_prefixes:
        if query.startswith(prefix):
            candidate = query[len(prefix):].strip(" ：:，,。")
            if candidate:
                additions.append(candidate)
            break
    if any(token in query for token in ["长期关注", "长期观察", "重点跟踪", "盯住"]) and isinstance(response.payload, dict):
        stock_code = response.payload.get("stock_code")
        stock_name = response.payload.get("stock_name") or stock_code
        if isinstance(stock_code, str) and stock_code:
            additions.append(f"长期关注 {stock_name} ({stock_code})")
    return _merge_pinned_memory(profile, additions) if additions else profile.get("pinned_memory", [])


def _extract_goal_update(payload: AgentQuery, response: AgentResponse, profile: dict[str, Any]) -> Optional[str]:
    query = payload.query.strip()
    clear_tokens = ["清除目标", "取消目标", "重置目标"]
    if any(token in query for token in clear_tokens):
        return ""
    explicit_prefixes = ["当前目标是", "目标是", "设当前目标为", "设目标为", "我的目标是"]
    for prefix in explicit_prefixes:
        if query.startswith(prefix):
            candidate = query[len(prefix):].strip(" ：:，,。")
            if candidate:
                return candidate[:120]
    if any(token in query for token in ["帮我盯着", "重点跟踪", "持续跟踪"]) and isinstance(response.payload, dict):
        stock_name = response.payload.get("stock_name")
        if isinstance(stock_name, str) and stock_name:
            return f"跟踪 {stock_name} 近期变化"
    return profile.get("active_goal")


def _infer_market_preference(profile: dict[str, Any], watchlist: List[dict[str, str]]) -> Optional[str]:
    if profile.get("preferred_market"):
        return profile["preferred_market"]
    markets: List[str] = []
    for item in watchlist:
        code = str(item.get("code", "")).lower()
        if code.startswith("sh") or code.startswith("sz"):
            markets.append("a_share")
        elif code.endswith(".hk"):
            markets.append("hk")
    if not markets:
        return None
    return max(set(markets), key=markets.count)


def _persist_agent_turns(session_id: Optional[str], payload: AgentQuery, response: AgentResponse) -> None:
    if not session_id:
        return
    agent_memory_store.append_turn(session_id, role="user", content=payload.query)
    stock_code = response.payload.get("stock_code") if isinstance(response.payload, dict) else None
    stock_name = response.payload.get("stock_name") if isinstance(response.payload, dict) else None
    agent_memory_store.append_turn(
        session_id,
        role="agent",
        content=response.summary,
        intent=response.intent,
        stock_code=stock_code if isinstance(stock_code, str) else None,
        stock_name=stock_name if isinstance(stock_name, str) else None,
    )
    profile = agent_memory_store.get_profile(session_id)
    recent_history = agent_memory_store.get_recent_history(session_id, limit=12)
    merged_history = [
        AgentHistoryTurn(
            role=str(item.get("role", "user")),
            content=str(item.get("content", "")),
            intent=item.get("intent"),
            stock_code=item.get("stock_code"),
            stock_name=item.get("stock_name"),
        )
        for item in recent_history
    ]
    watchlist = _build_watchlist(merged_history, profile)
    preferred_market = _infer_market_preference(profile, watchlist)
    pinned_memory = _extract_pinned_memory_updates(payload, response, profile)
    active_goal = _extract_goal_update(payload, response, profile)
    agent_memory_store.update_profile(
        session_id,
        preferred_market=preferred_market,
        last_stock_code=stock_code if isinstance(stock_code, str) else profile.get("last_stock_code"),
        last_stock_name=stock_name if isinstance(stock_name, str) else profile.get("last_stock_name"),
        watchlist=watchlist,
        pinned_memory=pinned_memory,
        active_goal=active_goal,
    )


def _build_enriched_agent_query(query: str, history: List[AgentHistoryTurn], memory_profile: dict[str, Any]) -> str:
    enriched_query = query
    context_blocks: list[str] = []
    if history:
        history_text = "\n".join(f"{item.role}: {item.content}" for item in history[-8:])
        context_blocks.append(f"对话上下文：\n{history_text}")
    if memory_profile:
        memory_lines = []
        if memory_profile.get("preferred_market"):
            memory_lines.append(f"偏好市场: {memory_profile['preferred_market']}")
        if memory_profile.get("active_goal"):
            memory_lines.append(f"当前目标: {memory_profile['active_goal']}")
        if memory_profile.get("last_stock_name") or memory_profile.get("last_stock_code"):
            memory_lines.append(
                f"最近关注标的: {memory_profile.get('last_stock_name') or memory_profile.get('last_stock_code')}"
            )
        pinned_memory = memory_profile.get("pinned_memory") or []
        if pinned_memory:
            pinned_items = [str(item).strip() for item in pinned_memory[:5] if str(item).strip()]
            if pinned_items:
                memory_lines.append(f"固定记忆: {'; '.join(pinned_items)}")
        watchlist = memory_profile.get("watchlist") or []
        if watchlist:
            focus_names = [
                item.get("name") or item.get("code")
                for item in watchlist[:5]
                if isinstance(item, dict) and (item.get("name") or item.get("code"))
            ]
            if focus_names:
                memory_lines.append(f"关注清单: {', '.join(focus_names)}")
        if memory_lines:
            context_blocks.append("记忆信息：\n" + "\n".join(memory_lines))
    if context_blocks:
        enriched_query = "\n\n".join([*context_blocks, f"当前问题：{query}"])
    return enriched_query

async def _run_agent_request(
    payload: AgentQuery,
    merged_history: List[AgentHistoryTurn],
    memory_profile: dict[str, Any],
    progress_callback=None,
) -> AgentResponse:
    agent, deps = _get_pydantic_agent()
    if agent is not None and deps is not None:
        if progress_callback:
            progress_callback("select_engine", 25, "已选择智能引擎，准备执行工具调用", {"engine": "pydantic_ai"})
        try:
            enriched_query = _build_enriched_agent_query(payload.query, merged_history, memory_profile)
            if progress_callback is not None:
                try:
                    return await run_agent_async(
                        agent,
                        deps,
                        enriched_query,
                        progress_callback=progress_callback,
                    )
                except TypeError as exc:
                    if "progress_callback" not in str(exc):
                        raise
            return await run_agent_async(agent, deps, enriched_query)
        except BaseException as exc:
            if isinstance(exc, (SystemExit, KeyboardInterrupt)):
                raise
            logger.exception("PydanticAI agent run failed, falling back to deterministic agent")
            if progress_callback:
                progress_callback("select_engine", 30, "智能引擎失败，切换到规则分析", {"engine": "deterministic"})
    elif progress_callback:
        progress_callback("select_engine", 25, "已选择规则分析引擎", {"engine": "deterministic"})

    if progress_callback is not None:
        try:
            return await asyncio.to_thread(
                agent_service.query,
                payload.query,
                merged_history,
                memory_profile,
                progress_callback,
            )
        except TypeError as exc:
            if "positional argument" not in str(exc) and "given" not in str(exc):
                raise
    return await asyncio.to_thread(
        agent_service.query,
        payload.query,
        merged_history,
        memory_profile,
    )


@app.post("/api/agent/query")
async def agent_query(request: Request, payload: AgentQuery) -> Response:
    """Always return 200 + JSON. Never 500 - errors go in body."""
    try:
        _require_demo_access(request, "Agent 聊天")
        merged_history = _merge_agent_history(payload)
        memory_profile = agent_memory_store.get_profile(payload.session_id or "")
        resp = await _run_agent_request(payload, merged_history, memory_profile)
        _persist_agent_turns(payload.session_id, payload, resp)
        heartbeat = _maybe_run_heartbeat(payload.session_id)
        resp = _attach_memory_profile(resp, agent_memory_store.get_profile(payload.session_id or ""), heartbeat)
        return JSONResponse(content=_safe_agent_json(resp), status_code=200)
    except HTTPException:
        raise
    except BaseException as e:
        if isinstance(e, (SystemExit, KeyboardInterrupt)):
            raise
        logger.exception("agent_query failed")
        try:
            return JSONResponse(
                content=_safe_agent_json(_error_response(f"Request failed: {e!s}")),
                status_code=200,
            )
        except BaseException:
            return JSONResponse(content=_AGENT_ERROR_JSON, status_code=200)




@app.post("/api/agent/query/stream")
async def agent_query_stream(request: Request, payload: AgentQuery) -> Response:
    _require_demo_access(request, "Agent 聊天")
    queue: asyncio.Queue[str | None] = asyncio.Queue()
    loop = asyncio.get_running_loop()

    async def runner() -> None:
        _emit_agent_progress(
            queue,
            loop,
            kind="start",
            stage="understand_query",
            progress_pct=5,
            message="已接收问题，开始理解查询意图",
        )
        try:
            merged_history = _merge_agent_history(payload)
            memory_profile = agent_memory_store.get_profile(payload.session_id or "")
            _emit_agent_progress(
                queue,
                loop,
                kind="progress",
                stage="load_memory",
                progress_pct=15,
                message="已加载会话记忆与历史上下文",
            )

            def report(stage: str, progress_pct: int, message: str, meta: Optional[dict[str, Any]] = None) -> None:
                _emit_agent_progress(
                    queue,
                    loop,
                    kind="progress",
                    stage=stage,
                    progress_pct=progress_pct,
                    message=message,
                    meta=meta,
                )

            resp = await _run_agent_request(payload, merged_history, memory_profile, report)
            _persist_agent_turns(payload.session_id, payload, resp)
            report("persist_memory", 95, "会话记忆已更新")
            heartbeat = _maybe_run_heartbeat(payload.session_id)
            resp = _attach_memory_profile(resp, agent_memory_store.get_profile(payload.session_id or ""), heartbeat)
            _emit_agent_progress(
                queue,
                loop,
                kind="result",
                stage="completed",
                progress_pct=100,
                message="最终回答已生成",
                payload=resp,
            )
        except BaseException as exc:
            if isinstance(exc, (SystemExit, KeyboardInterrupt)):
                raise
            logger.exception("agent_query_stream failed")
            _emit_agent_progress(
                queue,
                loop,
                kind="error",
                stage="error",
                progress_pct=100,
                message=f"请求失败：{exc}",
            )
        finally:
            _emit_agent_progress(
                queue,
                loop,
                kind="done",
                stage="completed",
                progress_pct=100,
                message="响应流已结束",
            )
            await queue.put(None)

    asyncio.create_task(runner())
    return sse_response(queue)
