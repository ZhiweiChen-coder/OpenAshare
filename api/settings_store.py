from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, Optional

from api.schemas import UserSettingsResponse
from ashare.config import Config

class UserSettingsStore:
    def __init__(self, path: Path, base_config: Optional[Config] = None):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.base_config = base_config or Config()
        self._lock = Lock()

    def _read(self) -> Dict[str, Any]:
        if not self.path.exists():
            return {}
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def _write(self, payload: Dict[str, Any]) -> None:
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def get_settings(self) -> UserSettingsResponse:
        with self._lock:
            payload = self._read()
        stored_base_url = str(payload.get("llm_base_url", "")).strip()
        stored_api_key = str(payload.get("llm_api_key", "")).strip()
        return UserSettingsResponse(
            llm_model=self.base_config.llm_model,
            llm_model_source="env",
            llm_base_url=stored_base_url or self.base_config.llm_base_url,
            llm_configured=bool(stored_api_key or self.base_config.llm_api_key),
            updated_at=payload.get("updated_at"),
        )

    def update_settings(
        self,
        *,
        llm_base_url: Optional[str] = None,
        llm_api_key: Optional[str] = None,
    ) -> UserSettingsResponse:
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            payload = self._read()
            if llm_base_url is not None:
                payload["llm_base_url"] = llm_base_url.strip()
            if llm_api_key is not None:
                payload["llm_api_key"] = llm_api_key.strip()
            payload["updated_at"] = now
            self._write(payload)
        return self.get_settings()

    def build_runtime_config(self, config: Optional[Config] = None) -> Config:
        runtime = copy.deepcopy(config or self.base_config)

        # 模型始终来自服务端配置；用户设置只允许覆盖连接凭据。
        with self._lock:
            payload = self._read()
        stored_base_url = str(payload.get("llm_base_url", "")).strip()
        stored_api_key = str(payload.get("llm_api_key", "")).strip()
        if stored_base_url:
            runtime.llm_base_url = stored_base_url
        if stored_api_key:
            runtime.llm_api_key = stored_api_key
        return runtime
