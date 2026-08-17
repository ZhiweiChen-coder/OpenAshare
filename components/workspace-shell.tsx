"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";

import { AgentChat } from "@/components/agent-chat";
import { AgentLabBar } from "@/components/agent-lab-bar";
import { ResearchChart } from "@/components/research-chart";
import {
  getGlobalNews,
  getCreditBalance,
  getHotspotDetail,
  getMarketRegime,
  getPortfolioAnalysis,
  getStockAnalysis,
  getStockNews,
  getWorkspaceBootstrap,
  searchStocks,
} from "@/lib/api";
import type {
  GlobalNewsItem,
  HotspotDetailResponse,
  MarketRegimeResponse,
  NewsItem,
  PortfolioAnalysisResponse,
  StockAnalysisResponse,
  CreditBalanceResponse,
} from "@/lib/types";
import {
  contextFromStock,
  compactHeadline,
  type AgentLabTrace,
  type ResearchContext,
  type WorkspaceSessionSummary,
} from "@/lib/workspace";
import { SupabaseAuthPanel, type SupabaseAuthSnapshot } from "@/components/supabase-auth-panel";
import { OFFICIAL_SITE_URL } from "@/lib/site";

type WatchItem = {
  code: string;
  name: string;
};

type WorkspaceProject = {
  id: string;
  name: string;
  createdAt: number;
};

type SessionContextMenu = {
  sessionId: string;
  x: number;
  y: number;
  renaming: boolean;
};

type ProjectContextMenu = {
  projectId: string;
  x: number;
  y: number;
  renaming: boolean;
};

const WATCHLIST_STORAGE_KEY = "ashare-workspace-watchlist-v3";
const PROJECTS_STORAGE_KEY = "ashare-workspace-projects-v1";
const SESSION_PROJECTS_STORAGE_KEY = "ashare-workspace-session-projects-v1";

const DEFAULT_WATCHLIST: WatchItem[] = [
  { code: "sh000001", name: "上证指数" },
  { code: "sz399001", name: "深证成指" },
  { code: "HK.HSI", name: "恒生指数" },
  { code: "sh000300", name: "沪深300" },
];

export function WorkspaceShell({ labMode = false }: { labMode?: boolean }) {
  const searchParams = useSearchParams();
  const [watchlist, setWatchlist] = useState<WatchItem[]>(DEFAULT_WATCHLIST);
  const [watchlistInput, setWatchlistInput] = useState("");
  const [sessions, setSessions] = useState<WorkspaceSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [sessionProjects, setSessionProjects] = useState<Record<string, string>>({});
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string>("all");
  const [projectComposerOpen, setProjectComposerOpen] = useState(false);
  const [projectDraft, setProjectDraft] = useState("");
  const [sessionMenu, setSessionMenu] = useState<SessionContextMenu | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [projectMenu, setProjectMenu] = useState<ProjectContextMenu | null>(null);
  const [projectRenameDraft, setProjectRenameDraft] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [activeContext, setActiveContext] = useState<ResearchContext | null>(() => ({
    type: "market",
    title: "市场脉搏",
    payload: {},
    updatedAt: new Date().toISOString(),
  }));
  const [pinnedContext, setPinnedContext] = useState<ResearchContext | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const sessionMenuRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const [labTraces, setLabTraces] = useState<AgentLabTrace[]>([]);
  const [cloudStatus, setCloudStatus] = useState<"local" | "syncing" | "connected" | "error">("local");
  const [cloudError, setCloudError] = useState("");
  const [creditBalance, setCreditBalance] = useState<CreditBalanceResponse | null>(null);

  const refreshCreditBalance = useCallback(async () => {
    try {
      setCreditBalance(await getCreditBalance());
    } catch {
      setCreditBalance(null);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as WatchItem[];
      if (Array.isArray(parsed) && parsed.every((item) => item?.code && item?.name)) {
        setWatchlist(parsed);
      }
    } catch {
      // Keep the useful starter list when local state is invalid.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    try {
      const storedProjects = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
      const storedAssignments = window.localStorage.getItem(SESSION_PROJECTS_STORAGE_KEY);
      if (storedProjects) {
        const parsed = JSON.parse(storedProjects) as WorkspaceProject[];
        if (Array.isArray(parsed) && parsed.every((project) => project?.id && project?.name)) {
          setProjects(parsed);
        }
      }
      if (storedAssignments) {
        const parsed = JSON.parse(storedAssignments) as Record<string, string>;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setSessionProjects(parsed);
        }
      }
    } catch {
      // Project grouping is an enhancement; invalid local state should not block chats.
    } finally {
      setProjectsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!projectsLoaded) return;
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  }, [projects, projectsLoaded]);

  useEffect(() => {
    if (!projectsLoaded) return;
    window.localStorage.setItem(SESSION_PROJECTS_STORAGE_KEY, JSON.stringify(sessionProjects));
  }, [projectsLoaded, sessionProjects]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!sessionMenu) return;

    function closeSessionMenu(event: PointerEvent) {
      if (!sessionMenuRef.current?.contains(event.target as Node)) {
        setSessionMenu(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSessionMenu(null);
    }

    document.addEventListener("pointerdown", closeSessionMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeSessionMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [sessionMenu]);

  useEffect(() => {
    if (!projectMenu) return;

    function closeProjectMenu(event: PointerEvent) {
      if (!projectMenuRef.current?.contains(event.target as Node)) {
        setProjectMenu(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setProjectMenu(null);
    }

    document.addEventListener("pointerdown", closeProjectMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeProjectMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [projectMenu]);

  useEffect(() => {
    function assignNewSession(event: Event) {
      const sessionId = (event as CustomEvent<string>).detail;
      if (!sessionId || activeProjectId === "all" || activeProjectId === "unassigned") return;
      setSessionProjects((current) => ({ ...current, [sessionId]: activeProjectId }));
    }

    window.addEventListener("ashare:session-created", assignNewSession);
    return () => window.removeEventListener("ashare:session-created", assignNewSession);
  }, [activeProjectId]);

  const handleSupabaseAuth = useCallback(async (snapshot: SupabaseAuthSnapshot) => {
    if (!snapshot.session?.access_token) {
      setCloudStatus("local");
      setCloudError(snapshot.error ?? "");
      void refreshCreditBalance();
      return;
    }
    setCloudStatus("syncing");
    setCloudError("");
    try {
      const bootstrap = await getWorkspaceBootstrap(snapshot.session.access_token);
      const defaultWatchlist = bootstrap.watchlists.find((item) => item.is_default) ?? bootstrap.watchlists[0];
      const cloudItems = defaultWatchlist?.items ?? [];
      if (cloudItems.length) {
        setWatchlist(cloudItems.map((item) => ({ code: item.symbol, name: item.display_name ?? item.symbol })));
      }
      setCloudStatus("connected");
      await refreshCreditBalance();
    } catch (syncError) {
      setCloudStatus("error");
      setCloudError(syncError instanceof Error ? syncError.message : "Supabase 工作台同步失败");
    }
  }, [refreshCreditBalance]);

  useEffect(() => {
    void refreshCreditBalance();
  }, [refreshCreditBalance]);

  useEffect(() => {
    const symbol = searchParams.get("symbol");
    const context = searchParams.get("context");
    if (symbol) {
      const existing = watchlist.find((item) => item.code.toLowerCase() === symbol.toLowerCase());
      openStock(existing?.code ?? symbol, existing?.name);
    } else if (context === "portfolio") {
      setActiveContext({ type: "portfolio", title: "我的持仓", payload: {}, updatedAt: new Date().toISOString() });
    } else if (context === "market") {
      setActiveContext({ type: "market", title: "市场脉搏", payload: {}, updatedAt: new Date().toISOString() });
    }
    // URL state is an initial deep-link, not a live source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        if (Boolean(b.pinned) !== Boolean(a.pinned)) return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
        return b.updatedAt - a.updatedAt;
      }),
    [sessions],
  );

  const visibleSessions = useMemo(() => {
    if (activeProjectId === "all") return sortedSessions;
    if (activeProjectId === "unassigned") return sortedSessions.filter((session) => !sessionProjects[session.id]);
    return sortedSessions.filter((session) => sessionProjects[session.id] === activeProjectId);
  }, [activeProjectId, sessionProjects, sortedSessions]);

  function openStock(code: string, name?: string) {
    if (pinnedContext) return;
    const normalized = normalizeSymbol(code);
    setSelectedSymbol(normalized);
    setActiveContext(contextFromStock(normalized, name));
    setRightPanelOpen(true);
  }

  function addWatchItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = watchlistInput.trim();
    if (!value) return;
    const code = normalizeSymbol(value);
    if (watchlist.some((item) => item.code.toLowerCase() === code.toLowerCase())) {
      openStock(code);
      setWatchlistInput("");
      return;
    }
    const next = { code, name: value === code ? code : value };
    setWatchlist((items) => [next, ...items]);
    setWatchlistInput("");
    openStock(next.code, next.name);
  }

  function removeWatchItem(code: string) {
    setWatchlist((items) => items.filter((item) => item.code !== code));
    if (selectedSymbol === code) {
      setSelectedSymbol(null);
      setActiveContext(null);
    }
  }

  function selectSession(sessionId: string) {
    setActiveSessionId(sessionId);
    window.dispatchEvent(new CustomEvent("ashare:select-session", { detail: sessionId }));
  }

  function createSession() {
    window.dispatchEvent(new Event("ashare:new-session"));
  }

  function handleSessionsChange(nextSessions: WorkspaceSessionSummary[]) {
    setSessions(nextSessions);
    setSessionProjects((current) => {
      const liveIds = new Set(nextSessions.map((session) => session.id));
      const nextEntries = Object.entries(current).filter(([sessionId]) => liveIds.has(sessionId));
      if (nextEntries.length === Object.keys(current).length) return current;
      return Object.fromEntries(nextEntries);
    });
  }

  function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = projectDraft.trim();
    if (!name) return;
    const project: WorkspaceProject = {
      id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.slice(0, 48),
      createdAt: Date.now(),
    };
    setProjects((current) => [project, ...current]);
    setActiveProjectId(project.id);
    setProjectDraft("");
    setProjectComposerOpen(false);
  }

  function openProjectMenu(event: React.MouseEvent<HTMLButtonElement>, project: WorkspaceProject) {
    event.preventDefault();
    const menuWidth = 210;
    const menuHeight = 150;
    setProjectRenameDraft(project.name);
    setProjectMenu({
      projectId: project.id,
      x: Math.max(12, Math.min(event.clientX, window.innerWidth - menuWidth)),
      y: Math.max(12, Math.min(event.clientY, window.innerHeight - menuHeight)),
      renaming: false,
    });
  }

  function renameProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectMenu || !projectRenameDraft.trim()) return;
    const name = projectRenameDraft.trim().slice(0, 48);
    setProjects((current) => current.map((project) => (
      project.id === projectMenu.projectId ? { ...project, name } : project
    )));
    setProjectMenu(null);
  }

  function deleteProject(projectId: string) {
    setProjects((current) => current.filter((project) => project.id !== projectId));
    setSessionProjects((current) => {
      const next = { ...current };
      for (const [sessionId, assignedProjectId] of Object.entries(next)) {
        if (assignedProjectId === projectId) delete next[sessionId];
      }
      return next;
    });
    if (activeProjectId === projectId) setActiveProjectId("all");
    setProjectMenu(null);
  }

  function openSessionMenu(event: React.MouseEvent<HTMLButtonElement>, session: WorkspaceSessionSummary) {
    event.preventDefault();
    const menuWidth = 224;
    const menuHeight = 272;
    setRenameDraft(session.title === "新对话" ? "" : session.title);
    setSessionMenu({
      sessionId: session.id,
      x: Math.max(12, Math.min(event.clientX, window.innerWidth - menuWidth)),
      y: Math.max(12, Math.min(event.clientY, window.innerHeight - menuHeight)),
      renaming: false,
    });
  }

  function renameSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionMenu || !renameDraft.trim()) return;
    window.dispatchEvent(new CustomEvent("ashare:rename-session", {
      detail: { sessionId: sessionMenu.sessionId, title: renameDraft.trim().slice(0, 80) },
    }));
    setSessionMenu(null);
  }

  function moveSessionToProject(sessionId: string, projectId: string | null) {
    setSessionProjects((current) => {
      if (!projectId) {
        const next = { ...current };
        delete next[sessionId];
        return next;
      }
      return { ...current, [sessionId]: projectId };
    });
    setSessionMenu(null);
  }

  function deleteSession(sessionId: string) {
    window.dispatchEvent(new CustomEvent("ashare:delete-session", { detail: sessionId }));
    setSessionMenu(null);
  }

  function projectSessionCount(projectId: string) {
    return sessions.filter((session) => sessionProjects[session.id] === projectId).length;
  }

  function handleContextUpdate(context: ResearchContext) {
    if (pinnedContext) return;
    setActiveContext(context);
    if (context.type === "stock" && context.entityId) setSelectedSymbol(context.entityId);
    setRightPanelOpen(true);
  }

  function handleLabTrace(trace: AgentLabTrace) {
    setLabTraces((current) => [...current, trace].slice(-30));
  }

  return (
    <main className={`workspace-page ${labMode ? "workspace-page--lab" : ""}`}>
      <header className="workspace-header">
        <a
          className="workspace-brand-lockup"
          href={OFFICIAL_SITE_URL}
          aria-label="返回 OpenAshare 首页"
        >
          <span className="workspace-brand-mark">
            <Image src="/favicon.svg" alt="OpenAshare" width={44} height={44} priority />
          </span>
          <div>
            <strong>OpenAshare</strong>
            <span>研究工作台</span>
          </div>
        </a>
        <div className="workspace-header-status">
          <span className="workspace-live-dot" />
          <span>市场研究中</span>
          <span className={`workspace-cloud-status ${cloudStatus}`} title={cloudError || undefined}>
            {cloudStatus === "connected" ? "云端已连接" : cloudStatus === "syncing" ? "同步中" : cloudStatus === "error" ? "云端异常" : "本地模式"}
          </span>
          <span className="workspace-credit-pill" title="Agent 使用 Credit 余额">
            {creditBalance?.unlimited ? "本地模式 · Credits 不限" : creditBalance ? `${creditBalance.balance ?? 0} Credits` : "Credits"}
          </span>
          <button className="workspace-icon-button" type="button" onClick={() => setLeftPanelOpen((open) => !open)}>
            {leftPanelOpen ? "隐藏列表" : "显示列表"}
          </button>
          <button className="workspace-icon-button" type="button" onClick={() => setRightPanelOpen((open) => !open)}>
            {rightPanelOpen ? "隐藏研究" : "显示研究"}
          </button>
        </div>
      </header>

      {labMode ? <AgentLabBar traces={labTraces} onClear={() => setLabTraces([])} /> : null}

      <div className={`workspace-grid ${leftPanelOpen ? "left-open" : "left-closed"} ${rightPanelOpen ? "right-open" : "right-closed"}`}>
        {leftPanelOpen ? (
          <aside className="workspace-left-panel" aria-label="自选股和会话">
            <div className="workspace-panel-heading">
              <div>
                <span className="workspace-kicker">研究工作台</span>
                <h1>我的研究</h1>
              </div>
              <button className="workspace-round-button" type="button" onClick={createSession} aria-label="新建对话">
                +
              </button>
            </div>

            <form className="workspace-watch-search" onSubmit={addWatchItem}>
              <span aria-hidden="true">⌕</span>
              <input
                value={watchlistInput}
                onChange={(event) => setWatchlistInput(event.target.value)}
                placeholder="添加股票或代码"
                aria-label="添加股票或代码"
              />
            </form>

            <section className="workspace-list-section">
              <div className="workspace-section-heading">
                <span>自选股</span>
                <span className="workspace-count">{watchlist.length}</span>
              </div>
              <div className="workspace-watchlist">
                {watchlist.map((item) => (
                  <div className={`workspace-watch-item ${selectedSymbol === item.code ? "active" : ""}`} key={item.code}>
                    <button type="button" onClick={() => openStock(item.code, item.name)}>
                      <span className="workspace-watch-symbol">{item.code.toUpperCase()}</span>
                      <span className="workspace-watch-name">{item.name}</span>
                    </button>
                    <button
                      type="button"
                      className="workspace-remove-button"
                      onClick={() => removeWatchItem(item.code)}
                      aria-label={`移除 ${item.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="workspace-list-section workspace-project-section">
              <div className="workspace-section-heading workspace-project-heading">
                <span>项目</span>
                <button
                  type="button"
                  className="workspace-project-add"
                  aria-label="建立项目"
                  aria-expanded={projectComposerOpen}
                  onClick={() => setProjectComposerOpen((open) => !open)}
                >
                  +
                </button>
              </div>
              {projectComposerOpen ? (
                <form className="workspace-project-composer" onSubmit={createProject}>
                  <input
                    value={projectDraft}
                    onChange={(event) => setProjectDraft(event.target.value)}
                    placeholder="例如：新能源产业链"
                    aria-label="项目名称"
                    autoFocus
                  />
                  <button type="submit">建立</button>
                </form>
              ) : null}
              <div className="workspace-project-list" aria-label="项目筛选">
                <button
                  className={`workspace-project-item ${activeProjectId === "all" ? "active" : ""}`}
                  type="button"
                  onClick={() => setActiveProjectId("all")}
                >
                  <span>全部对话</span>
                  <b>{sessions.length}</b>
                </button>
                <button
                  className={`workspace-project-item ${activeProjectId === "unassigned" ? "active" : ""}`}
                  type="button"
                  onClick={() => setActiveProjectId("unassigned")}
                >
                  <span>未归类</span>
                  <b>{sessions.filter((session) => !sessionProjects[session.id]).length}</b>
                </button>
                {projects.map((project) => (
                  <button
                    className={`workspace-project-item ${activeProjectId === project.id ? "active" : ""}`}
                    type="button"
                    key={project.id}
                    onClick={() => setActiveProjectId(project.id)}
                    onContextMenu={(event) => openProjectMenu(event, project)}
                    title={project.name}
                  >
                    <span>{project.name}</span>
                    <b>{projectSessionCount(project.id)}</b>
                  </button>
                ))}
              </div>
            </section>

            <section className="workspace-list-section workspace-conversation-section">
              <div className="workspace-section-heading">
                <span>{activeProjectId === "all" ? "最近会话" : activeProjectId === "unassigned" ? "未归类对话" : "项目对话"}</span>
                <span className="workspace-count">{visibleSessions.length}</span>
              </div>
              <div className="workspace-session-list">
                {visibleSessions.map((session) => (
                  <button
                    className={`workspace-session-item ${activeSessionId === session.id ? "active" : ""}`}
                    type="button"
                    key={session.id}
                    onClick={() => selectSession(session.id)}
                    onContextMenu={(event) => openSessionMenu(event, session)}
                  >
                    <span className="workspace-session-title">{session.pinned ? "✦ " : ""}{session.title === "新对话" ? "未命名对话" : session.title}</span>
                    <span className="workspace-session-time">{formatRelativeTime(session.updatedAt)}</span>
                  </button>
                ))}
                {!visibleSessions.length ? <p className="workspace-empty-copy">这个项目还没有对话。点击右键可移动已有对话，或新建一个。</p> : null}
              </div>
            </section>

            <div className="workspace-left-footer">
              <div className="workspace-account-menu" ref={accountMenuRef}>
                {accountMenuOpen ? (
                  <div className="workspace-account-popover" role="dialog" aria-label="账户菜单">
                    <div className="workspace-account-popover-head">
                      <span className="workspace-avatar workspace-avatar--large">P</span>
                      <div className="workspace-account-copy">
                        <strong>Peter</strong>
                        <span>个人研究空间</span>
                      </div>
                    </div>
                    <SupabaseAuthPanel placement="profile" onAuthChange={handleSupabaseAuth} />
                  </div>
                ) : null}
                <button
                  type="button"
                  className={`workspace-account-trigger ${accountMenuOpen ? "open" : ""}`}
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="dialog"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                >
                  <span className="workspace-account-card">
                    <span className="workspace-avatar">P</span>
                    <span className="workspace-account-copy">
                      <strong>Peter</strong>
                      <span>个人研究空间</span>
                    </span>
                  </span>
                  <span className="workspace-account-menu-icon" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </button>
              </div>
            </div>
          </aside>
        ) : null}

        <section className="workspace-chat-panel" aria-label="Agent 对话">
          <AgentChat
            compact
            workspace
            onSessionsChange={handleSessionsChange}
            onCurrentSessionChange={setActiveSessionId}
            onContextUpdate={handleContextUpdate}
            onLabTrace={labMode ? handleLabTrace : undefined}
            onCreditUpdate={(usage) => {
              if (usage.remaining == null || usage.unlimited) return;
              setCreditBalance((current) => current ? {
                ...current,
                balance: usage.remaining ?? current.balance,
                lifetime_used: current.lifetime_used + usage.charged,
              } : current);
            }}
          />
        </section>

        {rightPanelOpen ? (
          <aside className="workspace-right-panel" aria-label="研究上下文">
            <ResearchContextPanel
              context={activeContext}
              pinned={Boolean(pinnedContext)}
              onTogglePin={() => setPinnedContext((current) => (current ? null : activeContext))}
              onSelectStock={openStock}
            />
          </aside>
        ) : null}
      </div>

      {sessionMenu ? (
        <div
          className="workspace-session-menu"
          ref={sessionMenuRef}
          role="menu"
          aria-label="对话操作"
          style={{ left: sessionMenu.x, top: sessionMenu.y }}
        >
          {sessionMenu.renaming ? (
            <form className="workspace-session-rename" onSubmit={renameSession}>
              <label htmlFor="workspace-session-rename-input">对话名称</label>
              <input
                id="workspace-session-rename-input"
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                placeholder="输入新名称"
                autoFocus
              />
              <div>
                <button type="button" onClick={() => setSessionMenu(null)}>取消</button>
                <button type="submit">保存</button>
              </div>
            </form>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => setSessionMenu((current) => current ? { ...current, renaming: true } : current)}
              >
                重命名对话
              </button>
              <div className="workspace-session-menu-group">
                <span>移动到项目</span>
                <button type="button" role="menuitem" onClick={() => moveSessionToProject(sessionMenu.sessionId, null)}>未归类</button>
                {projects.map((project) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={project.id}
                    onClick={() => moveSessionToProject(sessionMenu.sessionId, project.id)}
                  >
                    {project.name}
                  </button>
                ))}
                {!projects.length ? <em>先建立一个项目</em> : null}
              </div>
              <button
                type="button"
                role="menuitem"
                className="workspace-session-menu-delete"
                onClick={() => deleteSession(sessionMenu.sessionId)}
              >
                删除对话
              </button>
            </>
          )}
        </div>
      ) : null}

      {projectMenu ? (
        <div
          className="workspace-project-menu"
          ref={projectMenuRef}
          role="menu"
          aria-label="项目操作"
          style={{ left: projectMenu.x, top: projectMenu.y }}
        >
          {projectMenu.renaming ? (
            <form className="workspace-session-rename" onSubmit={renameProject}>
              <label htmlFor="workspace-project-rename-input">项目名称</label>
              <input
                id="workspace-project-rename-input"
                value={projectRenameDraft}
                onChange={(event) => setProjectRenameDraft(event.target.value)}
                placeholder="输入项目名称"
                autoFocus
              />
              <div>
                <button type="button" onClick={() => setProjectMenu(null)}>取消</button>
                <button type="submit">保存</button>
              </div>
            </form>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => setProjectMenu((current) => current ? { ...current, renaming: true } : current)}
              >
                重命名项目
              </button>
              <button
                type="button"
                role="menuitem"
                className="workspace-session-menu-delete"
                onClick={() => deleteProject(projectMenu.projectId)}
              >
                删除项目
              </button>
              <p>项目内对话将保留到“未归类”。</p>
            </>
          )}
        </div>
      ) : null}
    </main>
  );
}

function ResearchContextPanel({
  context,
  pinned,
  onTogglePin,
  onSelectStock,
}: {
  context: ResearchContext | null;
  pinned: boolean;
  onTogglePin: () => void;
  onSelectStock: (code: string, name?: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [stock, setStock] = useState<StockAnalysisResponse | null>(null);
  const [resolvedStockName, setResolvedStockName] = useState<string | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [hotspot, setHotspot] = useState<HotspotDetailResponse | null>(null);
  const [market, setMarket] = useState<MarketRegimeResponse | null>(null);
  const [globalNews, setGlobalNews] = useState<GlobalNewsItem[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioAnalysisResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    setStock(null);
    setResolvedStockName(null);
    setNews([]);
    setHotspot(null);
    setMarket(null);
    setGlobalNews([]);
    setPortfolio(null);

    if (!context) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const load = async () => {
      try {
        if (context.type === "stock" && context.entityId) {
          const requestedSymbol = context.entityId;
          const payloadStock = payloadToStock(context.payload);
          let searchResults: Awaited<ReturnType<typeof searchStocks>> = [];
          try {
            searchResults = await searchStocks(requestedSymbol);
          } catch {
            // A temporary search outage should not block a request that already has a code.
          }
          const exactMatch = searchResults.find((item) =>
            item.code.toLowerCase() === requestedSymbol.toLowerCase() ||
            item.name.trim().toLowerCase() === requestedSymbol.trim().toLowerCase(),
          );
          const stockCode = exactMatch?.code ?? payloadStock?.stock_code ?? requestedSymbol;
          const stockName = exactMatch?.name ?? payloadStock?.stock_name;
          if (stockName && stockName !== stockCode) setResolvedStockName(stockName);
          const [analysis, relatedNews] = await Promise.all([
            getStockAnalysis(stockCode, { includeAi: false }),
            getStockNews(stockCode),
          ]);
          if (!cancelled) {
            setStock(analysis);
            setResolvedStockName(analysis.stock_name);
            setNews(relatedNews);
          }
        } else if (context.type === "topic" && context.entityId) {
          const detail = await getHotspotDetail(context.entityId);
          if (!cancelled) setHotspot(detail);
        } else if (context.type === "portfolio") {
          setPortfolio((await getPortfolioAnalysis()) ?? null);
        } else {
          const [regime, headlines] = await Promise.all([getMarketRegime(), getGlobalNews()]);
          if (!cancelled) {
            setMarket(regime);
            setGlobalNews(headlines);
          }
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "研究数据暂时不可用");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [context]);

  const contextStock = context?.type === "stock" ? payloadToStock(context.payload) : null;
  const contextStockCode = stock?.stock_code ?? contextStock?.stock_code ?? context?.entityId;
  const contextTitle = context?.type === "stock" && contextStockCode && resolvedStockName
    ? `${resolvedStockName} · ${contextStockCode}`
    : context?.title ?? "研究上下文";

  return (
    <div className="research-context-panel">
      <div className="research-context-head">
        <div>
          <span className="workspace-kicker">Live context</span>
          <h2>{contextTitle}</h2>
        </div>
        <button
          type="button"
          className={`workspace-context-action ${pinned ? "active" : ""}`}
          onClick={onTogglePin}
          aria-label={pinned ? "取消固定研究上下文" : "固定当前研究上下文"}
        >
          {pinned ? "◆" : "◇"}
        </button>
      </div>

      {!context ? <EmptyResearchContext /> : null}
      {loading ? <ContextLoading /> : null}
      {error ? <div className="research-error">{error}</div> : null}
      {!loading && !error && context?.type === "stock" ? (
        <StockContext analysis={stock} news={news} fallback={payloadToStock(context.payload)} onSelectStock={onSelectStock} />
      ) : null}
      {!loading && !error && context?.type === "topic" ? <TopicContext detail={hotspot} /> : null}
      {!loading && !error && context?.type === "market" ? <MarketContext market={market} news={globalNews} /> : null}
      {!loading && !error && context?.type === "portfolio" ? <PortfolioContext portfolio={portfolio} /> : null}
    </div>
  );
}

function StockContext({
  analysis,
  news,
  fallback,
  onSelectStock,
}: {
  analysis: StockAnalysisResponse | null;
  news: NewsItem[];
  fallback: StockAnalysisResponse | null;
  onSelectStock: (code: string, name?: string) => void;
}) {
  const [chartExpanded, setChartExpanded] = useState(false);
  const data = analysis ?? fallback;
  if (!data) return <div className="research-empty-state">等待股票研究结果…</div>;
  const direction = data.quote.change_pct >= 0 ? "up" : "down";
  return (
    <div className="research-context-content">
      <div className="research-quote-row">
        <div>
          <span className="research-label">最新价</span>
          <strong className="research-price">{data.quote.current_price.toFixed(2)}</strong>
        </div>
        <div className={`research-change ${direction}`}>
          {data.quote.change_pct >= 0 ? "+" : ""}{data.quote.change_pct.toFixed(2)}%
        </div>
      </div>
      {data.chart_series?.length ? (
        <div className="research-chart-preview">
          <ResearchChart data={data.chart_series} height={142} symbol={data.stock_code} compact />
          <button type="button" className="research-chart-expand" onClick={() => setChartExpanded(true)}>
            <span>展开 K 线</span><b>↗</b>
          </button>
        </div>
      ) : null}
      {chartExpanded && data.chart_series?.length ? (
        <div className="research-chart-overlay" role="dialog" aria-modal="true" aria-label={`${data.stock_name} K 线图`}>
          <div className="research-chart-dialog">
            <div className="research-chart-dialog-head">
              <div><span className="workspace-kicker">Full chart</span><h3>{data.stock_name} · {data.stock_code}</h3></div>
              <button type="button" className="workspace-context-action" onClick={() => setChartExpanded(false)} aria-label="关闭 K 线图">×</button>
            </div>
            <ResearchChart data={data.chart_series} height={600} symbol={data.stock_code} />
          </div>
        </div>
      ) : null}
      <div className="research-metric-grid">
        <ResearchMetric label="MACD" value={formatIndicatorValue(data.technical_indicators.MACD)} />
        <ResearchMetric label="RSI（14）" value={formatIndicatorValue(data.technical_indicators.RSI)} />
        <ResearchMetric label="振幅" value={`${data.quote.amplitude_pct.toFixed(2)}%`} />
        <ResearchMetric label="成交量" value={formatCompactNumber(data.quote.volume)} />
      </div>
      <TechnicalIndicatorSummary analysis={data} />
      <ContextSection title="技术观察">
        {data.technical_commentary?.slice(0, 2).map((item) => <p className="research-note" key={item}>{item}</p>)}
      </ContextSection>
      <ContextSection title="相关新闻">
        {news.slice(0, 4).map((item) => (
          <article className="research-news-item" key={item.id}>
            <strong title={item.title}>{compactHeadline(item.title, 42)}</strong>
            <span>{item.source} · {item.published_at}</span>
          </article>
        ))}
        {!news.length ? <p className="research-muted">暂无相关新闻</p> : null}
      </ContextSection>
      <div className="research-action-row">
        <button type="button" onClick={() => onSelectStock(data.stock_code, data.stock_name)}>刷新研究</button>
      </div>
    </div>
  );
}

function TopicContext({ detail }: { detail: HotspotDetailResponse | null }) {
  if (!detail) return <div className="research-empty-state">等待热点研究结果…</div>;
  return (
    <div className="research-context-content">
      <div className="research-topic-score">
        <span>热度</span>
        <strong>{detail.topic.heat_score.toFixed(0)}</strong>
        <span className={`research-trend ${detail.topic.trend_direction}`}>{detail.topic.trend_direction}</span>
      </div>
      <p className="research-summary">{detail.topic.ai_summary || detail.topic.reason}</p>
      <ContextSection title="相关标的">
        {detail.topic.related_stocks.slice(0, 6).map((stock) => (
          <div className="research-stock-row" key={stock.stock_code}>
            <span><strong>{stock.stock_name}</strong><small>{stock.stock_code}</small></span>
            <span>{stock.reason}</span>
          </div>
        ))}
      </ContextSection>
      <ContextSection title="相关消息">
        {detail.related_news.slice(0, 3).map((item) => <article className="research-news-item" key={item.id}><strong title={item.title}>{compactHeadline(item.title, 42)}</strong><span>{item.source}</span></article>)}
      </ContextSection>
    </div>
  );
}

function MarketContext({ market, news }: { market: MarketRegimeResponse | null; news: GlobalNewsItem[] }) {
  if (!market) return <div className="research-empty-state">等待市场数据…</div>;
  if (market.is_loading) return <div className="research-empty-state" aria-busy="true">市场数据加载中…</div>;
  return (
    <div className="research-context-content">
      <div className="research-regime-card">
        <span>市场状态</span>
        <strong>{market.regime === "risk_on" ? "风险偏好" : market.regime === "risk_off" ? "风险收缩" : "中性盘面"}</strong>
        <small>评分 {market.score.toFixed(0)} · {market.action_bias}</small>
      </div>
      <p className="research-summary">{market.summary || market.position_guidance}</p>
      <ContextSection title="主要指数">
        {market.indices.slice(0, 5).map((index) => (
          <div className="research-index-row" key={index.stock_code}><span>{index.stock_name}</span><strong className={index.change_pct >= 0 ? "up" : "down"}>{index.change_pct >= 0 ? "+" : ""}{index.change_pct.toFixed(2)}%</strong></div>
        ))}
      </ContextSection>
      <ContextSection title="全球新闻">
        {news.slice(0, 4).map((item) => <article className="research-news-item" key={item.id}><strong title={item.title}>{compactHeadline(item.title, 42)}</strong><span>{item.source} · {item.topic}</span></article>)}
      </ContextSection>
    </div>
  );
}

function PortfolioContext({ portfolio }: { portfolio: PortfolioAnalysisResponse | null }) {
  if (!portfolio) return <div className="research-empty-state">等待持仓数据…</div>;
  return (
    <div className="research-context-content">
      <div className="research-metric-grid portfolio-metrics">
        <ResearchMetric label="总市值" value={portfolio.total_market_value.toFixed(2)} />
        <ResearchMetric label="总盈亏" value={portfolio.total_pnl.toFixed(2)} tone={portfolio.total_pnl >= 0 ? "up" : "down"} />
        <ResearchMetric label="收益率" value={`${portfolio.total_pnl_pct.toFixed(2)}%`} />
        <ResearchMetric label="技术风险" value={portfolio.technical_risk} />
      </div>
      <ContextSection title="组合提示">
        {portfolio.rebalance_suggestions.slice(0, 5).map((item) => <p className="research-note" key={item}>{item}</p>)}
      </ContextSection>
      <ContextSection title="重点持仓">
        {portfolio.positions.slice(0, 6).map((item) => <div className="research-index-row" key={item.position.stock_code}><span>{item.position.stock_name}</span><strong className={item.pnl >= 0 ? "up" : "down"}>{item.pnl_pct >= 0 ? "+" : ""}{item.pnl_pct.toFixed(2)}%</strong></div>)}
      </ContextSection>
    </div>
  );
}

function ContextSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="research-context-section"><div className="research-section-title">{title}</div>{children}</section>;
}

function ResearchMetric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return <div className="research-metric"><span>{label}</span><strong className={tone ?? ""}>{value}</strong></div>;
}

function TechnicalIndicatorSummary({ analysis }: { analysis: StockAnalysisResponse }) {
  const factorRows = [
    ["MACD", analysis.technical_indicators.MACD, "动能差值"],
    ["RSI", analysis.technical_indicators.RSI, "14日强弱"],
    ["KDJ", analysis.technical_indicators.KDJ, "摆动指标"],
    ["MA20", analysis.technical_indicators.MA20, "20日均线"],
  ].filter(([, value]) => typeof value === "number") as Array<[string, number, string]>;

  return (
    <section className="research-indicator-summary" aria-label="技术指标">
      <div className="research-indicator-summary-head">
        <span>技术指标</span>
        <small>基于最新行情计算</small>
      </div>
      {factorRows.length ? (
        <div className="research-indicator-factors">
          {factorRows.map(([name, value, label]) => <span key={name}><b>{name}</b><strong>{value.toFixed(2)}</strong><small>{label}</small></span>)}
        </div>
      ) : null}
      <p>指标用于描述历史价格与成交量状态，不构成投资建议。</p>
    </section>
  );
}

function EmptyResearchContext() {
  return <div className="research-empty-state research-empty-state--welcome"><span className="research-empty-orbit">✦</span><h3>你的研究会出现在这里</h3><p>点击左侧自选股，或直接问 Agent 一个问题。</p><div className="research-empty-tags"><span>K 线</span><span>新闻</span><span>热点</span></div></div>;
}

function ContextLoading() {
  return <div className="research-loading"><span /><span /><span /><p>正在整理研究上下文</p></div>;
}

function payloadToStock(payload: Record<string, unknown>): StockAnalysisResponse | null {
  if (!payload.quote || typeof payload.stock_code !== "string") return null;
  return payload as unknown as StockAnalysisResponse;
}

function normalizeSymbol(value: string) {
  const trimmed = value.trim();
  if (/^(sh|sz|us\.)/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^6\d{5}$/.test(trimmed)) return `sh${trimmed}`;
  if (/^\d{6}$/.test(trimmed)) return `sz${trimmed}`;
  return trimmed;
}

function formatCompactNumber(value: number) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return value.toLocaleString("zh-CN");
}

function formatIndicatorValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";
}

function formatRelativeTime(timestamp: number) {
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}
