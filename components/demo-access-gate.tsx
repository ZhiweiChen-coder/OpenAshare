"use client";

import { useDemoAccess } from "@/components/demo-access-provider";

export function DemoAccessGate({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
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
          解锁演示
        </button>
        <button className="button ghost" type="button" onClick={revoke}>
          清除密钥
        </button>
      </div>
    </div>
  );
}

