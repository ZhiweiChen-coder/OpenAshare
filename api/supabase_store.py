"""Small PostgREST repository for user-owned workspace data.

This uses Supabase's HTTP API instead of opening a new Postgres connection per
request. Authenticated requests carry the user's JWT, so Supabase RLS remains
the final tenant-isolation boundary.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional
from uuid import UUID

import requests

from api.supabase_config import SupabaseConfig


class SupabaseStoreError(RuntimeError):
    pass


class SupabaseRestClient:
    def __init__(self, config: SupabaseConfig, access_token: str):
        if not config.enabled:
            raise SupabaseStoreError("Supabase is not configured")
        self.config = config
        self.access_token = access_token
        self.session = requests.Session()

    def _headers(self, *, prefer: Optional[str] = None) -> dict[str, str]:
        headers = {
            "apikey": self.config.anon_key,
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    def request(
        self,
        method: str,
        table: str,
        *,
        params: Optional[Mapping[str, Any]] = None,
        body: Any = None,
        prefer: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        try:
            response = self.session.request(
                method,
                f"{self.config.rest_url}/{table}",
                headers=self._headers(prefer=prefer),
                params=dict(params or {}),
                json=body,
                timeout=self.config.request_timeout_seconds,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            detail = "Supabase 数据请求失败"
            if getattr(exc, "response", None) is not None:
                detail = f"{detail}: {exc.response.text[:240]}"
            raise SupabaseStoreError(detail) from exc

        if response.status_code == 204 or not response.content:
            return []
        payload = response.json()
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return [payload]
        return []

    def rpc(self, function: str, body: Mapping[str, Any]) -> list[dict[str, Any]]:
        """Call a Postgres function through Supabase's PostgREST RPC endpoint."""
        return self.request("POST", f"rpc/{function}", body=dict(body))

    def select(
        self,
        table: str,
        *,
        filters: Optional[Mapping[str, Any]] = None,
        select: str = "*",
        order: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"select": select}
        for key, value in (filters or {}).items():
            params[key] = f"eq.{value}"
        if order:
            params["order"] = order
        if limit is not None:
            params["limit"] = limit
        return self.request("GET", table, params=params)

    def insert(self, table: str, body: Mapping[str, Any]) -> dict[str, Any]:
        rows = self.request("POST", table, body=dict(body), prefer="return=representation")
        return rows[0] if rows else dict(body)

    def upsert(self, table: str, body: Mapping[str, Any], *, on_conflict: str) -> dict[str, Any]:
        rows = self.request(
            "POST",
            table,
            params={"on_conflict": on_conflict},
            body=dict(body),
            prefer="resolution=merge-duplicates,return=representation",
        )
        return rows[0] if rows else dict(body)

    def patch(self, table: str, *, row_id: UUID, body: Mapping[str, Any]) -> dict[str, Any]:
        rows = self.request(
            "PATCH",
            table,
            params={"id": f"eq.{row_id}"},
            body=dict(body),
            prefer="return=representation",
        )
        return rows[0] if rows else dict(body)


class SupabaseWorkspaceStore:
    def __init__(self, config: SupabaseConfig, access_token: str):
        self.user_id: Optional[UUID] = None
        self.client = SupabaseRestClient(config, access_token)

    def bootstrap(self, user_id: UUID) -> dict[str, Any]:
        self.user_id = user_id
        user_filter = {"user_id": str(user_id)}
        watchlists = self.client.select(
            "watchlists",
            filters=user_filter,
            order="is_default.desc,created_at.asc",
        )
        watchlist_ids = [item["id"] for item in watchlists if item.get("id")]
        items: list[dict[str, Any]] = []
        if watchlist_ids:
            # PostgREST's `in` filter avoids one query per watchlist.
            items = self.client.select(
                "watchlist_items",
                filters={"user_id": str(user_id)},
                order="sort_order.asc,created_at.asc",
            )
        item_groups = {watchlist_id: [] for watchlist_id in watchlist_ids}
        for item in items:
            if item.get("watchlist_id") in item_groups:
                item_groups[item["watchlist_id"]].append(item)
        for watchlist in watchlists:
            watchlist["items"] = item_groups.get(watchlist.get("id"), [])

        settings = self.client.select("user_settings", filters=user_filter, limit=1)
        sessions = self.client.select(
            "agent_sessions",
            filters=user_filter,
            order="updated_at.desc",
            limit=50,
        )
        pinned_contexts = self.client.select(
            "pinned_contexts",
            filters=user_filter,
            order="updated_at.desc",
            limit=20,
        )
        return {
            "storage": "supabase",
            "user_id": str(user_id),
            "settings": settings[0] if settings else None,
            "watchlists": watchlists,
            "sessions": sessions,
            "pinned_contexts": pinned_contexts,
        }
