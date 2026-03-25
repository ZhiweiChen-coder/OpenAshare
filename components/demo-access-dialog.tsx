"use client";

import { FormEvent, useState } from "react";

import { useDemoAccess } from "@/components/demo-access-provider";

export function DemoAccessDialog() {
  const { dialogOpen, closeDialog, unlock, enabled, unlocked, loaded, openDialog } = useDemoAccess();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!loaded) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={`demo-access-fab ${unlocked ? "active" : ""}`}
        onClick={openDialog}
      >
        {unlocked ? "演示已解锁" : enabled ? "解锁演示" : "演示开放"}
      </button>

      {dialogOpen ? (
        <div className="demo-access-overlay" role="presentation" onClick={closeDialog}>
          <div
            className="demo-access-modal panel"
            role="dialog"
            aria-modal="true"
            aria-label="演示访问"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-kicker">Demo Access</div>
            <h2>{enabled ? "输入演示密钥" : "演示模式已开放"}</h2>
            <p className="muted">
              解锁后可以使用 AI 分析、Agent 聊天、持仓管理和设置。公开浏览仍然保持可见。
            </p>

            {enabled ? (
              <form
                className="stack"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  setError("");
                  setIsSubmitting(true);
                  unlock(code.trim())
                    .catch((err) => setError(err instanceof Error ? err.message : "解锁失败"))
                    .finally(() => setIsSubmitting(false));
                }}
              >
                <input
                  className="input"
                  type="password"
                  placeholder="输入演示密钥"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
                {error ? <p className="settings-status settings-status-error">{error}</p> : null}
                <div className="inline-actions">
                  <button className="button" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "验证中..." : "解锁"}
                  </button>
                  <button className="button ghost" type="button" onClick={closeDialog}>
                    关闭
                  </button>
                </div>
              </form>
            ) : (
              <div className="inline-actions">
                <button className="button" type="button" onClick={closeDialog}>
                  关闭
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

