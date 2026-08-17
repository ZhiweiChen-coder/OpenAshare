"""Resolve the authenticated Supabase user from a request bearer token."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
from uuid import UUID

import requests
from fastapi import HTTPException, Request

from api.supabase_config import SupabaseConfig


@dataclass(frozen=True)
class SupabaseUser:
    id: UUID
    access_token: str
    email: Optional[str] = None


def _bearer_token(request: Request) -> Optional[str]:
    authorization = request.headers.get("authorization", "").strip()
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def require_supabase_user(request: Request, config: SupabaseConfig) -> SupabaseUser:
    if not config.enabled:
        raise HTTPException(status_code=503, detail="Supabase 尚未配置，请先设置 SUPABASE_URL 和 SUPABASE_ANON_KEY。")

    token = _bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="需要 Supabase 登录令牌。")

    try:
        response = requests.get(
            config.auth_url,
            headers={"apikey": config.anon_key, "Authorization": f"Bearer {token}"},
            timeout=config.request_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        user_id = UUID(str(payload.get("id", "")))
    except (requests.RequestException, ValueError, TypeError) as exc:
        raise HTTPException(status_code=401, detail="Supabase 登录状态无效或已过期。") from exc

    return SupabaseUser(id=user_id, access_token=token, email=payload.get("email"))
