"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { DEMO_ACCESS_STATUS_PATH, type DemoAccessStatus } from "@/lib/demo-access";

type DemoAccessContextValue = DemoAccessStatus & {
  loaded: boolean;
  refresh: () => Promise<void>;
  unlock: (code: string) => Promise<void>;
  revoke: () => Promise<void>;
  openDialog: () => void;
  closeDialog: () => void;
  dialogOpen: boolean;
};

const DemoAccessContext = createContext<DemoAccessContextValue | null>(null);

async function readJsonResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  if (!raw) {
    return {} as T;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    const trimmed = raw.trimStart();
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
      throw new Error(
        "演示接口返回了 HTML 页面，通常是 Vercel 域名还在重定向，或者 /api/demo/access 没有落在当前主域上。请检查主域是否已经固定到 openashare.com。",
      );
    }
    throw new Error("演示接口返回了非 JSON 响应");
  }
}

export function DemoAccessProvider({
  children,
  initialStatus,
}: {
  children: React.ReactNode;
  initialStatus: DemoAccessStatus;
}) {
  const [status, setStatus] = useState<DemoAccessStatus>(initialStatus);
  const [loaded, setLoaded] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(DEMO_ACCESS_STATUS_PATH, { cache: "no-store" });
    const payload = await readJsonResponse<DemoAccessStatus>(response);
    setStatus(payload);
    setLoaded(true);
  }, []);

  const unlock = useCallback(async (code: string) => {
    const response = await fetch(DEMO_ACCESS_STATUS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
    });
    const payload = await readJsonResponse<DemoAccessStatus & { detail?: string }>(response);
    if (!response.ok) {
      throw new Error(payload.detail || "演示密钥验证失败");
    }
    setStatus(payload);
    setLoaded(true);
    setDialogOpen(false);
  }, []);

  const revoke = useCallback(async () => {
    const response = await fetch(DEMO_ACCESS_STATUS_PATH, {
      method: "DELETE",
      cache: "no-store",
    });
    const payload = await readJsonResponse<DemoAccessStatus>(response);
    setStatus(payload);
    setLoaded(true);
  }, []);

  const openDialog = useCallback(() => setDialogOpen(true), []);
  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const value = useMemo<DemoAccessContextValue>(
    () => ({
      ...status,
      loaded,
      refresh,
      unlock,
      revoke,
      openDialog,
      closeDialog,
      dialogOpen,
    }),
    [closeDialog, dialogOpen, loaded, openDialog, refresh, revoke, status, unlock],
  );

  return <DemoAccessContext.Provider value={value}>{children}</DemoAccessContext.Provider>;
}

export function useDemoAccess() {
  const context = useContext(DemoAccessContext);
  if (!context) {
    throw new Error("useDemoAccess must be used within DemoAccessProvider");
  }
  return context;
}
