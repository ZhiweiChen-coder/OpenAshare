from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, Optional

from api.schemas import ModelOption, UserSettingsResponse
from ashare.config import Config


DEFAULT_MODEL_OPTIONS = [
    ModelOption(value="deepseek-chat", label="DeepSeek Chat", description="默认通用模型，适合大多数分析场景。"),
    ModelOption(value="deepseek-reasoner", label="DeepSeek Reasoner", description="更偏推理，响应可能更慢。"),
    ModelOption(value="gpt-4.1-mini", label="GPT-4.1 mini", description="成本更低，适合轻量问答。"),
    ModelOption(value="gpt-4.1", label="GPT-4.1", description="更稳的综合能力，需当前网关支持。"),
    ModelOption(value="qwen-max", label="Qwen Max", description="阿里系兼容模型，需当前网关支持。"),
]


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

    def _model_options(self) -> list[ModelOption]:
        options: list[ModelOption] = []
        seen: set[str] = set()
        for option in [ModelOption(value=self.base_config.llm_model, label="当前默认模型", description="来自环境变量配置。")] + DEFAULT_MODEL_OPTIONS:
            normalized = option.value.strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            options.append(option.model_copy(update={"value": normalized}))
        return options

    def get_settings(self) -> UserSettingsResponse:
        with self._lock:
            payload = self._read()
        stored_model = str(payload.get("llm_model", "")).strip()
        stored_base_url = str(payload.get("llm_base_url", "")).strip()
        stored_api_key = str(payload.get("llm_api_key", "")).strip()
        llm_model = stored_model or self.base_config.llm_model
        return UserSettingsResponse(
            llm_model=llm_model,
            llm_model_source="user" if stored_model else "env",
            llm_base_url=stored_base_url or self.base_config.llm_base_url,
            llm_configured=bool(stored_api_key or self.base_config.llm_api_key),
            updated_at=payload.get("updated_at"),
            model_options=self._model_options(),
        )

    def update_settings(
        self,
        *,
        llm_model: str,
        llm_base_url: Optional[str] = None,
        llm_api_key: Optional[str] = None,
    ) -> UserSettingsResponse:
        normalized_model = llm_model.strip()
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            payload = self._read()
            payload["llm_model"] = normalized_model
            if llm_base_url is not None:
                payload["llm_base_url"] = llm_base_url.strip()
            if llm_api_key is not None:
                payload["llm_api_key"] = llm_api_key.strip()
            payload["updated_at"] = now
            self._write(payload)
        return self.get_settings()

    def build_runtime_config(self, config: Optional[Config] = None) -> Config:
        runtime = copy.deepcopy(config or self.base_config)
        settings = self.get_settings()
        runtime.llm_model = settings.llm_model

        # 运行时优先使用用户在设置里保存的 Base URL 与 API Key
        with self._lock:
            payload = self._read()
        stored_base_url = str(payload.get("llm_base_url", "")).strip()
        stored_api_key = str(payload.get("llm_api_key", "")).strip()
        if stored_base_url:
            runtime.llm_base_url = stored_base_url
        if stored_api_key:
            runtime.llm_api_key = stored_api_key
        return runtime
