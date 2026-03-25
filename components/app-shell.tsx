"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AgentChat } from "@/components/agent-chat";
import { useDemoAccess } from "@/components/demo-access-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const [sidebarOpen, setSidebarOpen] = useState(true);

  if (isLanding) {
    return (
      <div className="app-shell landing-shell">
        <div className="main-content">{children}</div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      <div className="main-content">{children}</div>
      <button
        type="button"
        className={`agent-sidebar-tab ${sidebarOpen ? "open" : "closed"}`}
        onClick={() => setSidebarOpen((open) => !open)}
        aria-label={sidebarOpen ? "Close Agent sidebar" : "Open Agent sidebar"}
      >
        Agent
      </button>
      <aside className={`agent-sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-body">
          <AgentChat compact />
        </div>
      </aside>
    </div>
  );
}

const NAV_ITEMS = [
  { href: "/work", label: "工作台" },
  { href: "/stocks", label: "单股分析" },
  { href: "/charts", label: "K 线图" },
  { href: "/portfolio", label: "持仓页" },
  { href: "/news", label: "消息页" },
  { href: "/hotspots", label: "热点页" },
  { href: "/settings", label: "设置" },
] as const;

export function Nav() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const { unlocked, loaded, openDialog, revoke } = useDemoAccess();

  const activePath = useMemo(() => pathname ?? "/", [pathname]);
  const isLanding = activePath === "/";

  useEffect(() => {
    if (!pendingHref) {
      return;
    }
    setVisible(true);
    setProgress(12);
    const timer = window.setInterval(() => {
      setProgress((value) => (value >= 88 ? value : value + Math.max(3, (92 - value) * 0.12)));
    }, 120);
    return () => window.clearInterval(timer);
  }, [pendingHref]);

  useEffect(() => {
    if (!pendingHref || activePath !== pendingHref) {
      return;
    }
    setProgress(100);
    const doneTimer = window.setTimeout(() => {
      setVisible(false);
      setProgress(0);
      setPendingHref(null);
    }, 220);
    return () => window.clearTimeout(doneTimer);
  }, [activePath, pendingHref]);

  function handleNavStart(href: string) {
    if (href === activePath) {
      return;
    }
    setPendingHref(href);
  }

  return (
    <nav className="nav">
      <div className={`nav-progress ${visible ? "visible" : ""}`} aria-hidden="true">
        <span style={{ transform: `scaleX(${progress / 100})` }} />
      </div>
      <Link href="/" className="logo" onClick={() => handleNavStart("/")}>
        OpenAshare
      </Link>
      {isLanding ? (
        <div className="nav-links">
          <button type="button" className={`nav-demo-button ${unlocked ? "active" : ""}`} onClick={openDialog}>
            {loaded ? (unlocked ? "演示已解锁" : "解锁演示") : "检查访问"}
          </button>
        </div>
      ) : (
        <div className="nav-links">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => handleNavStart(item.href)}
              className={activePath === item.href ? "active" : undefined}
            >
              {item.label}
            </Link>
          ))}
          <button type="button" className={`nav-demo-button ${unlocked ? "active" : ""}`} onClick={openDialog}>
            {loaded ? (unlocked ? "演示已解锁" : "解锁演示") : "检查访问"}
          </button>
          {unlocked ? (
            <button type="button" className="nav-demo-link" onClick={revoke}>
              退出演示
            </button>
          ) : null}
        </div>
      )}
    </nav>
  );
}
