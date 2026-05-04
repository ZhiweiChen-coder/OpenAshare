"use client";

import { useDemoAccess } from "@/components/demo-access-provider";

export function DemoAccessGate({
  title,
  description,
  compact = false,
  unlockLabel = "解锁演示",
  clearLabel = "清除密钥",
}: {
  title: string;
  description: string;
  compact?: boolean;
  unlockLabel?: string;
  clearLabel?: string;
}) {
  const { unlocked, loaded, openDialog, revoke } = useDemoAccess();

  if (!loaded && unlocked) {
    return null;
  }
  if (unlocked) {
    return null;
  }

  return (
    <div className={`demo-access-gate ${compact ? "compact" : ""}`}>
      <div className="demo-access-gate-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="inline-actions">
        <button className="button" type="button" onClick={openDialog}>
          {unlockLabel}
        </button>
        <button className="button ghost" type="button" onClick={revoke}>
          {clearLabel}
        </button>
      </div>
    </div>
  );
}
