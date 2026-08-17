"use client";

import { useEffect, useState, useTransition } from "react";

import { getUserSettings, updateUserSettings } from "@/lib/api";
import type { UserSettingsResponse } from "@/lib/types";

const hostedCloudMode = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

export function SettingsForm() {
  const [settings, setSettings] = useState<UserSettingsResponse | null>(null);
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
    getUserSettings()
      .then((payload) => {
        if (cancelled) return;
        setSettings(payload);
        setApiBaseUrl(payload.llm_base_url ?? "");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "设置加载失败");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = !hostedCloudMode && Boolean(
    settings &&
      (apiBaseUrl.trim() !== (settings.llm_base_url ?? "").trim() || apiKeyTouched),
  );

  function handleSave() {
    setError("");
    setNotice("");
    startTransition(() => {
      void updateUserSettings({
        ...(apiBaseUrlTouched ? { llm_base_url: apiBaseUrl.trim() || null } : {}),
        ...(apiKeyTouched ? { llm_api_key: apiKey.trim() || null } : {}),
      })
        .then((payload) => {
          setSettings(payload);
          setApiBaseUrl(payload.llm_base_url ?? "");
          setApiBaseUrlTouched(false);
          setApiKey("");
          setApiKeyTouched(false);
          setNotice("连接设置已保存。模型仍由平台统一管理。");
        })
        .catch((err) => setError(err instanceof Error ? err.message : "保存失败"));
    });
  }

  if (isLoading) {
    return <div className="card"><p className="muted">正在加载当前设置...</p></div>;
  }

  return (
    <div className="stack settings-page">
      <section className="panel section">
        <div className="section-kicker">Platform Settings</div>
        <h1>连接设置</h1>
        <p className="muted">模型由平台统一托管，用户不能选择或替换模型。这里仅管理连接状态。</p>
      </section>

      <section className="content-grid settings-grid">
        <div className="panel section">
          <h2>平台模型</h2>
          <div className="card">
            <div className="muted">当前使用模型</div>
            <strong>{settings?.llm_model || "由平台配置"}</strong>
            <p className="muted">统一模型策略由服务端控制，用于 credit system 的成本和用量管理。</p>
          </div>

          {hostedCloudMode ? (
            <p className="muted" style={{ marginTop: 24 }}>
              云端 Beta 使用平台托管的模型与密钥，连接配置不会暴露给账户或写入共享服务。
            </p>
          ) : (
            <>
              <div className="stack" style={{ marginTop: 24 }}>
                <h2>本地 API 连接</h2>
                <label className="stack">
                  <span>LLM Base URL</span>
                  <input
                    className="input"
                    value={apiBaseUrl}
                    placeholder="留空则使用服务端默认地址"
                    onChange={(event) => {
                      setApiBaseUrl(event.target.value);
                      setApiBaseUrlTouched(true);
                      setNotice("");
                      setError("");
                    }}
                  />
                </label>
                <label className="stack">
                  <span>API Key</span>
                  <input
                    className="input"
                    type="password"
                    placeholder={settings?.llm_configured ? "已配置，可留空保持不变" : "填写服务端使用的 API Key"}
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      setApiKeyTouched(true);
                      setNotice("");
                      setError("");
                    }}
                  />
                </label>
              </div>
              <button className="button" type="button" disabled={isPending || !isDirty} onClick={handleSave} style={{ marginTop: 24 }}>
                {isPending ? "保存中..." : "保存连接设置"}
              </button>
            </>
          )}
          {notice ? <p className="settings-status settings-status-success">{notice}</p> : null}
          {error ? <p className="settings-status settings-status-error">{error}</p> : null}
        </div>

        <div className="panel section">
          <h2>运行状态</h2>
          <div className="card"><div className="muted">模型策略</div><strong>平台统一管理</strong></div>
          <div className="card"><div className="muted">API Key</div><strong>{settings?.llm_configured ? "已配置" : "未配置"}</strong></div>
          <div className="card"><div className="muted">Base URL</div><strong style={{ wordBreak: "break-all" }}>{settings?.llm_base_url || "服务端默认"}</strong></div>
        </div>
      </section>
    </div>
  );
}
