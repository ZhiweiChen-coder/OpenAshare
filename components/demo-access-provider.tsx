"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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
    const payload = (await response.json()) as DemoAccessStatus;
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
    const payload = (await response.json()) as DemoAccessStatus & { detail?: string };
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
    const payload = (await response.json()) as DemoAccessStatus;
    setStatus(payload);
    setLoaded(true);
  }, []);

  const openDialog = useCallback(() => setDialogOpen(true), []);
  const closeDialog = useCallback(() => setDialogOpen(false), []);

  useEffect(() => {
    void refresh().catch(() => setLoaded(true));
  }, [refresh]);

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
