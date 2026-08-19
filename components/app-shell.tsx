"use client";

import {
  CSSProperties,
  createContext,
  PointerEvent as ReactPointerEvent,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { AgentChat } from "@/components/agent-chat";

type AppShellContextValue = {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  isMobile: boolean;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  isResizing: boolean;
  startResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

function clampSidebarWidth(nextWidth: number) {
  if (typeof window === "undefined") {
    return nextWidth;
  }
  const maxWidth = Math.min(640, Math.max(360, window.innerWidth - 96));
  return Math.min(maxWidth, Math.max(360, nextWidth));
}

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");

    const applyMode = () => {
      const mobile = mediaQuery.matches;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };

    applyMode();
    mediaQuery.addEventListener("change", applyMode);
    return () => mediaQuery.removeEventListener("change", applyMode);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setIsResizing(false);
    }
  }, [isMobile]);

  function toggleSidebar() {
    setSidebarOpen((open) => !open);
  }

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (isMobile || !sidebarOpen) {
      return;
    }
    event.preventDefault();
    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: sidebarWidth,
    };
    setIsResizing(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const state = resizeStateRef.current;
      if (!state) {
        return;
      }
      const delta = moveEvent.clientX - state.startX;
      setSidebarWidth(clampSidebarWidth(state.startWidth - delta));
    };

    const handlePointerUp = () => {
      resizeStateRef.current = null;
      setIsResizing(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  const value = useMemo(
    () => ({
      sidebarOpen,
      toggleSidebar,
      isMobile,
      sidebarWidth,
      setSidebarWidth: (width: number) => setSidebarWidth(clampSidebarWidth(width)),
      isResizing,
      startResize,
    }),
    [isMobile, isResizing, sidebarOpen, sidebarWidth],
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

function useAppShell() {
  const value = useContext(AppShellContext);
  if (!value) {
    throw new Error("useAppShell must be used within AppShellProvider");
  }
  return value;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isLanding = pathname === "/";
  const isWorkspace = pathname === "/work";
  const isWaitlistFlow = pathname === "/waitlist" || pathname.startsWith("/admin");
  const isPreviewCapture = searchParams.get("preview") === "1";
  const { sidebarOpen, isMobile, sidebarWidth, isResizing, startResize } = useAppShell();
  const shellStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
  } as CSSProperties;

  if (isLanding || isPreviewCapture || isWorkspace || isWaitlistFlow) {
    return (
      <div className={`app-shell ${isLanding ? "landing-shell" : "no-sidebar"} ${isWorkspace ? "workspace-route" : ""}`}>
        <div className="main-content">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`app-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"} ${isMobile ? "mobile-shell" : ""} ${
        isResizing ? "resizing" : ""
      }`}
      style={shellStyle}
      data-mobile={isMobile ? "true" : "false"}
      data-resizing={isResizing ? "true" : "false"}
    >
      <div className="main-content">{children}</div>
      <aside
        className={`agent-sidebar ${sidebarOpen ? "open" : "closed"}`}
        id="agent-sidebar"
        aria-hidden={!sidebarOpen}
        data-state={sidebarOpen ? "open" : "closed"}
      >
        {sidebarOpen && !isMobile ? (
          <button
            type="button"
            className="agent-sidebar-resizer"
            onPointerDown={startResize}
            aria-label="拖动调整 Agent 宽度"
            title="拖动调整宽度"
          />
        ) : null}
        <div className="sidebar-body">
          <AgentChat compact />
        </div>
      </aside>
    </div>
  );
}
