"""Optional Supabase configuration for the multi-user workspace.

The application remains usable in local mode when these variables are absent.
Never expose SUPABASE_SERVICE_ROLE_KEY to the browser or commit it to git.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class SupabaseConfig:
    url: str = ""
    anon_key: str = ""
    service_role_key: str = ""
    require_auth: bool = True
    request_timeout_seconds: float = 8.0

    @classmethod
    def from_env(cls) -> "SupabaseConfig":
        # The frontend setup wizard uses NEXT_PUBLIC_* names. Accept them as
        # a local-development fallback, while keeping server-only names as
        # the preferred deployment configuration.
        url = (os.getenv("SUPABASE_URL", "") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")).strip().rstrip("/")
        publishable_key = (
            os.getenv("SUPABASE_ANON_KEY", "")
            or os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
            or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
        ).strip()
        return cls(
            url=url,
            anon_key=publishable_key,
            service_role_key=(
                os.getenv("SUPABASE_SECRET_KEY", "")
                or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
            ).strip(),
            require_auth=_env_bool("SUPABASE_REQUIRE_AUTH", True),
            request_timeout_seconds=float(os.getenv("SUPABASE_REQUEST_TIMEOUT_SECONDS", "8")),
        )

    @property
    def enabled(self) -> bool:
        return bool(self.url and self.anon_key)

    @property
    def auth_url(self) -> str:
        return f"{self.url}/auth/v1/user"

    @property
    def rest_url(self) -> str:
        return f"{self.url}/rest/v1"
