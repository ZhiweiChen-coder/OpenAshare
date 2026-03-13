"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { getUserSettings, updateUserSettings } from "@/lib/api";
import type { UserSettingsResponse } from "@/lib/types";

const CUSTOM_MODEL_VALUE = "__custom__";

export function SettingsForm() {
  const [settings, setSettings] = useState<UserSettingsResponse | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiBaseUrlTouched, setApiBaseUrlTouched] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyTouched, setApiKeyTouched] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getUserSettings()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setSettings(payload);
        syncDraft(payload);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "设置加载失败");
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function syncDraft(payload: UserSettingsResponse) {
    const hasPreset = payload.model_options.some((option) => option.value === payload.llm_model);
    setSelectedModel(hasPreset ? payload.llm_model : CUSTOM_MODEL_VALUE);
    setCustomModel(hasPreset ? "" : payload.llm_model);
    setApiBaseUrl(payload.llm_base_url ?? "");
    setApiBaseUrlTouched(false);
    setApiKey("");
    setApiKeyTouched(false);
  }

  const effectiveModel = useMemo(() => {
    if (selectedModel === CUSTOM_MODEL_VALUE) {
      return customModel.trim();
    }
    return selectedModel.trim();
  }, [customModel, selectedModel]);

  const isModelDirty = Boolean(settings && effectiveModel && effectiveModel !== settings.llm_model);
  const isBaseUrlDirty = Boolean(
    settings && apiBaseUrl.trim() !== (settings.llm_base_url ?? "").trim(),
  );
  const isKeyDirty = apiKeyTouched && apiKey.trim().length > 0;
  const isDirty = Boolean(isModelDirty || isBaseUrlDirty || isKeyDirty);

  function handleSave() {
    const llmModel = effectiveModel.trim();
    if (!llmModel) {
      setError("请先选择模型，或输入自定义模型名。");
      setNotice("");
      return;
    }
    const baseUrlDraft = apiBaseUrl.trim();
    const apiKeyDraft = apiKey.trim();

    setError("");
    setNotice("");
    startTransition(() => {
      const payload: {
        llm_model: string;
        llm_base_url?: string | null;
        llm_api_key?: string | null;
      } = { llm_model: llmModel };

      if (apiBaseUrlTouched) {
        payload.llm_base_url = baseUrlDraft || null;
      }
      if (apiKeyTouched) {
        payload.llm_api_key = apiKeyDraft || null;
      }

      void updateUserSettings(payload)
        .then((payload) => {
          setSettings(payload);
          syncDraft(payload);
          setNotice(`已保存，当前模型为 ${payload.llm_model}`);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "保存失败");
        });
    });
  }

  if (isLoading) {
    return (
      <div className="card">
        <p className="muted">正在加载当前设置...</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="panel section">
        <div className="section-kicker">User Settings</div>
        <h1>用户设置</h1>
        <p className="muted">
          当前先开放模型选择。保存后会影响单股分析页里的 AI 分析，以及 Agent 对话的模型。
        </p>
      </section>

      <section className="content-grid settings-grid">
        <div className="panel section">
          <h2>模型选择</h2>
          <div className="settings-option-grid">
            {settings?.model_options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`settings-option-card ${selectedModel === option.value ? "active" : ""}`}
                onClick={() => {
                  setSelectedModel(option.value);
                  setError("");
                  setNotice("");
                }}
              >
                <strong>{option.label}</strong>
                <span>{option.value}</span>
                <p className="muted">{option.description || "OpenAI 兼容接口可直接尝试。"}</p>
              </button>
            ))}

            <button
              type="button"
              className={`settings-option-card ${selectedModel === CUSTOM_MODEL_VALUE ? "active" : ""}`}
              onClick={() => {
                setSelectedModel(CUSTOM_MODEL_VALUE);
                setError("");
                setNotice("");
              }}
            >
              <strong>自定义模型</strong>
              <span>custom</span>
              <p className="muted">用于填写当前网关支持、但不在预设列表里的模型名。</p>
            </button>
          </div>

          {selectedModel === CUSTOM_MODEL_VALUE ? (
            <div className="stack" style={{ marginTop: 16 }}>
              <label htmlFor="custom-model">自定义模型名</label>
              <input
                id="custom-model"
                className="input"
                placeholder="例如：deepseek-v3 / gpt-4.1 / qwen-plus"
                value={customModel}
                onChange={(event) => setCustomModel(event.target.value)}
              />
            </div>
          ) : null}

          <div className="stack" style={{ marginTop: 24 }}>
            <h3>API 网关与 Key</h3>
            <p className="muted">
              若不填写则继续使用环境变量中的配置。出于安全考虑，保存后不会在页面回显完整 API Key。
            </p>
            <label className="stack">
              <span>LLM Base URL</span>
              <input
                className="input"
                placeholder="例如：https://api.deepseek.com"
                value={apiBaseUrl}
                onChange={(event) => {
                  setApiBaseUrl(event.target.value);
                  setApiBaseUrlTouched(true);
                  setError("");
                  setNotice("");
                }}
              />
            </label>
            <label className="stack">
              <span>API Key</span>
              <input
                className="input"
                type="password"
                placeholder={settings?.llm_configured ? "已配置，可在此更新或留空保持不变" : "在此填写后端使用的 LLM_API_KEY"}
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setApiKeyTouched(true);
                  setError("");
                  setNotice("");
                }}
              />
            </label>
          </div>

          <div className="form" style={{ marginTop: 24 }}>
            <button className="button" type="button" disabled={isPending || !isDirty} onClick={handleSave}>
              {isPending ? "保存中..." : "保存设置"}
            </button>
          </div>

          {notice ? <p className="settings-status settings-status-success">{notice}</p> : null}
          {error ? <p className="settings-status settings-status-error">{error}</p> : null}
        </div>

        <div className="panel section">
          <h2>当前生效信息</h2>
          <div className="news-grid">
            <div className="card">
              <div className="muted">当前模型</div>
              <strong>{settings?.llm_model || "-"}</strong>
              <p className="muted">来源：{settings?.llm_model_source === "user" ? "用户设置" : "环境变量默认值"}</p>
            </div>
            <div className="card">
              <div className="muted">LLM Base URL</div>
              <strong style={{ wordBreak: "break-all" }}>{settings?.llm_base_url || "-"}</strong>
              <p className="muted">模型名必须与当前网关兼容，否则请求会失败。</p>
            </div>
            <div className="card">
              <div className="muted">API Key</div>
              <strong>{settings?.llm_configured ? "已配置" : "未配置"}</strong>
              <p className="muted">若未配置 API Key，前端仍可保存，但 AI 分析不会启用。</p>
            </div>
            <div className="card">
              <div className="muted">最近更新时间</div>
              <strong>{formatUpdatedAt(settings?.updated_at)}</strong>
              <p className="muted">设置保存在服务端 `data/user_settings.json`。</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function formatUpdatedAt(value?: string | null) {
  if (!value) {
    return "尚未修改";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
