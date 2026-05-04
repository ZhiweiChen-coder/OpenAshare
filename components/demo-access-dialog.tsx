"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useDemoAccess } from "@/components/demo-access-provider";

export function DemoAccessDialog() {
  const searchParams = useSearchParams();
  const { dialogOpen, closeDialog, unlock, enabled, unlocked, loaded, openDialog } = useDemoAccess();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isPreviewCapture = searchParams.get("preview") === "1";
  const isEnglish = searchParams.get("lang") === "en";
  const copy = isEnglish
    ? {
        fabUnlocked: "Demo unlocked",
        fabUnlock: "Unlock demo",
        fabOpen: "Demo open",
        aria: "Demo access",
        lockedTitle: "Enter demo key",
        openTitle: "Demo mode is open",
        description:
          "Unlock AI analysis, agent chat, portfolio management, and settings. Public browsing remains visible.",
        placeholder: "Enter demo key",
        failure: "Unlock failed",
        verifying: "Verifying...",
        unlock: "Unlock",
        close: "Close",
      }
    : {
        fabUnlocked: "演示已解锁",
        fabUnlock: "解锁演示",
        fabOpen: "演示开放",
        aria: "演示访问",
        lockedTitle: "输入演示密钥",
        openTitle: "演示模式已开放",
        description: "解锁后可以使用 AI 分析、Agent 聊天、持仓管理和设置。公开浏览仍然保持可见。",
        placeholder: "输入演示密钥",
        failure: "解锁失败",
        verifying: "验证中...",
        unlock: "解锁",
        close: "关闭",
      };

  if (!loaded || isPreviewCapture) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={`demo-access-fab ${unlocked ? "active" : ""}`}
        onClick={openDialog}
      >
        {unlocked ? copy.fabUnlocked : enabled ? copy.fabUnlock : copy.fabOpen}
      </button>

      {dialogOpen ? (
        <div className="demo-access-overlay" role="presentation" onClick={closeDialog}>
          <div
            className="demo-access-modal panel"
            role="dialog"
            aria-modal="true"
            aria-label={copy.aria}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-kicker">Demo Access</div>
            <h2>{enabled ? copy.lockedTitle : copy.openTitle}</h2>
            <p className="muted">{copy.description}</p>

            {enabled ? (
              <form
                className="stack"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  setError("");
                  setIsSubmitting(true);
                  unlock(code.trim())
                    .catch((err) => setError(err instanceof Error ? err.message : copy.failure))
                    .finally(() => setIsSubmitting(false));
                }}
              >
                <input
                  className="input"
                  type="password"
                  placeholder={copy.placeholder}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
                {error ? <p className="settings-status settings-status-error">{error}</p> : null}
                <div className="inline-actions">
                  <button className="button" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? copy.verifying : copy.unlock}
                  </button>
                  <button className="button ghost" type="button" onClick={closeDialog}>
                    {copy.close}
                  </button>
                </div>
              </form>
            ) : (
              <div className="inline-actions">
                <button className="button" type="button" onClick={closeDialog}>
                  {copy.close}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
