"""Credit accounting boundary for public Agent usage.

The database owns the balance and concurrency guarantees. This module keeps
pricing heuristics and RPC response parsing out of the Agent orchestrator so a
future Stripe webhook can reuse the same ledger without changing Agent code.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Mapping, Optional
from uuid import UUID

from api.supabase_auth import SupabaseUser
from api.supabase_config import SupabaseConfig
from api.supabase_store import SupabaseRestClient, SupabaseStoreError


INITIAL_CREDIT_GRANT = 100
logger = logging.getLogger(__name__)


class CreditError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class CreditReservation:
    reservation_id: Optional[UUID]
    reserved_amount: int
    balance: Optional[int]
    bypassed: bool = False


@dataclass(frozen=True)
class CreditSettlement:
    balance: Optional[int]
    charged_amount: int
    released_amount: int


@dataclass(frozen=True)
class CreditBalance:
    balance: Optional[int]
    lifetime_granted: int = 0
    lifetime_purchased: int = 0
    lifetime_used: int = 0
    unlimited: bool = False


def estimate_request_cost(query: str) -> int:
    """Reserve a conservative amount before the Agent understands the query.

    The final charge is based on the returned intent, so this estimate is only
    a temporary hold. It deliberately does not force the routing decision.
    """
    text = (query or "").lower()
    if any(marker in text for marker in ("持仓", "组合", "深度研究", "专题研究", "全面分析")):
        return 8
    if any(marker in text for marker in ("消息", "新闻", "公告", "政策", "热点", "市场动态")):
        return 2
    if any(marker in text for marker in ("分析", "个股", "股票", "技术面", "基本面", "行情")):
        return 4
    return 1


def final_request_cost(intent: str) -> int:
    """Map the Agent's actual intent to a billable credit amount."""
    normalized = (intent or "").lower()
    if normalized in {"portfolio_analysis", "portfolio", "global_analysis", "deep_research"}:
        return 8
    if normalized in {"news", "news_lookup", "hotspots", "hotspot", "market_news"}:
        return 2
    if normalized in {"stock_analysis", "stock", "technical_analysis"}:
        return 4
    if normalized in {"error", "clarification", "unknown"}:
        return 0
    return 1


def _row(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return rows[0] if rows else {}


class CreditService:
    def __init__(self, config: SupabaseConfig):
        self.config = config
        self.enforced = config.enabled and config.require_auth

    def _client(self, user: SupabaseUser) -> SupabaseRestClient:
        if not self.enforced:
            raise CreditError("credits_unlimited", "本地模式不启用 Credit 扣费")
        return SupabaseRestClient(self.config, user.access_token)

    def reserve(
        self,
        user: Optional[SupabaseUser],
        request_id: str,
        amount: int,
        metadata: Optional[Mapping[str, Any]] = None,
    ) -> CreditReservation:
        if not self.enforced:
            return CreditReservation(None, 0, None, bypassed=True)
        if user is None:
            raise CreditError("auth_required", "请先登录后使用 Agent")
        try:
            row = _row(self._client(user).rpc("reserve_credits", {
                "p_request_id": request_id,
                "p_amount": amount,
                "p_metadata": dict(metadata or {}),
            }))
        except SupabaseStoreError as exc:
            self._raise_rpc_error(exc)
        try:
            return CreditReservation(UUID(str(row["reservation_id"])), int(row["reserved_amount"]), int(row["balance"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise CreditError("billing_unavailable", "Credit 账本暂时不可用，请稍后重试") from exc

    def settle(
        self,
        user: Optional[SupabaseUser],
        reservation: CreditReservation,
        actual_amount: int,
        metadata: Optional[Mapping[str, Any]] = None,
    ) -> CreditSettlement:
        if reservation.bypassed or reservation.reservation_id is None:
            return CreditSettlement(None, 0, 0)
        if user is None:
            raise CreditError("auth_required", "请先登录后使用 Agent")
        try:
            row = _row(self._client(user).rpc("settle_credits", {
                "p_reservation_id": str(reservation.reservation_id),
                "p_actual_amount": actual_amount,
                "p_metadata": dict(metadata or {}),
            }))
        except SupabaseStoreError as exc:
            self._raise_rpc_error(exc)
        try:
            return CreditSettlement(int(row["balance"]), int(row["charged_amount"]), int(row["released_amount"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise CreditError("billing_unavailable", "Credit 结算暂时不可用，请稍后重试") from exc

    def release(
        self,
        user: Optional[SupabaseUser],
        reservation: CreditReservation,
        metadata: Optional[Mapping[str, Any]] = None,
    ) -> Optional[int]:
        if reservation.bypassed or reservation.reservation_id is None:
            return None
        if user is None:
            return None
        try:
            row = _row(self._client(user).rpc("release_credits", {
                "p_reservation_id": str(reservation.reservation_id),
                "p_metadata": dict(metadata or {}),
            }))
            return int(row["balance"])
        except (SupabaseStoreError, KeyError, TypeError, ValueError) as exc:
            # Release is best-effort here; the reservation remains visible for
            # an operational retry instead of hiding the original Agent error.
            raise CreditError("billing_unavailable", "Credit 释放失败，请联系支持") from exc

    def balance(self, user: Optional[SupabaseUser]) -> CreditBalance:
        if not self.enforced:
            return CreditBalance(None, unlimited=True)
        if user is None:
            raise CreditError("auth_required", "请先登录后查看 Credit 余额")
        try:
            row = _row(self._client(user).rpc("get_credit_balance", {}))
            return CreditBalance(
                balance=int(row["balance"]),
                lifetime_granted=int(row.get("lifetime_granted", 0)),
                lifetime_purchased=int(row.get("lifetime_purchased", 0)),
                lifetime_used=int(row.get("lifetime_used", 0)),
            )
        except SupabaseStoreError as exc:
            self._raise_rpc_error(exc)
        except (KeyError, TypeError, ValueError) as exc:
            raise CreditError("billing_unavailable", "Credit 余额暂时不可用，请稍后重试") from exc

    @staticmethod
    def _raise_rpc_error(exc: SupabaseStoreError) -> None:
        detail = str(exc)
        logger.warning("Credit RPC failed: %s", detail[:800])
        if "INSUFFICIENT_CREDITS" in detail:
            raise CreditError("insufficient_credits", "Credit 余额不足，请充值后继续") from exc
        if "AUTH_REQUIRED" in detail:
            raise CreditError("auth_required", "请先登录后使用 Agent") from exc
        if "42702" in detail or "column reference \"balance\" is ambiguous" in detail:
            raise CreditError(
                "billing_unavailable",
                "Credit 扣费函数存在字段歧义。请执行 0003_fix_credit_rpc_ambiguity.sql 修复迁移。",
            ) from exc
        if "PGRST202" in detail or "Could not find the function" in detail:
            raise CreditError(
                "billing_unavailable",
                "Credit 扣费函数未生效。请在 Supabase 完整执行 0002_credit_system.sql 后再执行 NOTIFY pgrst, 'reload schema';",
            ) from exc
        if "42501" in detail or "permission denied" in detail.lower():
            raise CreditError(
                "billing_unavailable",
                "Credit 扣费函数权限不足。请确认 reserve_credits、settle_credits、release_credits 已授权给 authenticated。",
            ) from exc
        if "42P01" in detail or "does not exist" in detail.lower():
            raise CreditError(
                "billing_unavailable",
                "Credit 账本表结构不完整。请完整执行 0002_credit_system.sql。",
            ) from exc
        raise CreditError("billing_unavailable", "Credit 账本暂时不可用，请稍后重试") from exc
