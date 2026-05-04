"use client";

import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";

import { DemoAccessGate } from "@/components/demo-access-gate";
import { useDemoAccess } from "@/components/demo-access-provider";
import { StockPanelLink } from "@/components/stock-panel-link";
import { queryAgent } from "@/lib/api";
import {
  AgentHistoryTurn,
  AgentResponse,
  GlobalNewsItem,
  HotspotItem,
  NewsItem,
  PortfolioAnalysisResponse,
  StockAnalysisResponse,
  WebSearchResult,
} from "@/lib/types";

type Message = {
  id: string;
  role: "user" | "agent";
  content: string;
  actions?: string[];
  citations?: string[];
  response?: AgentResponse;
};

type ChatSession = {
  id: string;
  title: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
};

const DEFAULT_PROMPTS = ["分析 sh600036", "看看海光信息最近消息", "分析我的持仓并结合世界局势"];

const STORAGE_KEY = "ashare-agent-sessions-v1";

type AgentChatProps = { compact?: boolean };
type StreamState = "idle" | "connecting" | "streaming" | "completed" | "error";

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createWelcomeMessage(): Message {
  return {
    id: createId("msg"),
    role: "agent",
    content: "你好，我是 Ashare Agent。可以直接问全球新闻、热点、个股和持仓。",
    actions: DEFAULT_PROMPTS,
  };
}

function createSession(title = "新对话"): ChatSession {
  const now = Date.now();
  return {
    id: createId("session"),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [createWelcomeMessage()],
  };
}

export function AgentChat({ compact = false }: AgentChatProps) {
  const { loaded, unlocked } = useDemoAccess();
  const [sessions, setSessions] = useState<ChatSession[]>(() => [createSession()]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [streamState, setStreamState] = useState<StreamState>("idle");
  const [pendingQuery, setPendingQuery] = useState("");
  const [currentStageLabel, setCurrentStageLabel] = useState("等待输入");
  const [progressPct, setProgressPct] = useState(0);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const isComposingRef = useRef(false);
  const compactLogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as ChatSession[];
      if (!Array.isArray(parsed) || !parsed.length) {
        return;
      }
      const normalized = parsed
        .filter((session) => Array.isArray(session.messages) && session.messages.length)
        .map((session) => ({
          ...session,
          pinned: Boolean(session.pinned),
          messages: session.messages.map((message) => ({
            ...message,
            id: message.id || createId("msg"),
          })),
        }));
      if (!normalized.length) {
        return;
      }
      setSessions(normalized);
      setCurrentSessionId(normalized[0].id);
    } catch {
      // Ignore invalid local state and keep a fresh session.
    }
  }, []);

  useEffect(() => {
    if (currentSessionId) {
      return;
    }
    setCurrentSessionId(sessions[0]?.id ?? null);
  }, [currentSessionId, sessions]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) ?? sessions[0],
    [currentSessionId, sessions],
  );
  const messages = currentSession?.messages ?? [];
  const visibleMessages = messages.slice(-40); // cap rendering to last 40 messages to avoid infinite scroll
  const busy = isPending || streamState === "connecting" || streamState === "streaming";
  const progressStages = useMemo(() => [currentStageLabel || "处理中"], [currentStageLabel]);
  const progressStep = 0;
  const sortedSessions = useMemo(
    () =>
      [...sessions]
        .filter((session) => {
          const target = `${session.title} ${session.messages.at(-1)?.content ?? ""}`.toLowerCase();
          return target.includes(historySearch.trim().toLowerCase());
        })
        .sort((a, b) => {
          if (Boolean(b.pinned) !== Boolean(a.pinned)) {
            return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
          }
          return b.updatedAt - a.updatedAt;
        }),
    [historySearch, sessions],
  );
  const memoryMeta = useMemo(() => findLatestMemoryMeta(messages), [messages]);

  useEffect(() => {
    if (!compact || !compactLogRef.current) {
      return;
    }
    compactLogRef.current.scrollTop = compactLogRef.current.scrollHeight;
  }, [compact, messages, busy, currentSessionId]);

  useEffect(() => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.style.height = "0px";
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    if (!busy) {
      setCurrentStageLabel("等待输入");
      setProgressPct(0);
      setActiveTool(null);
    }
  }, [busy]);

  if (loaded && !unlocked) {
    return (
      <div className={compact ? "stack" : "panel section"}>
        <DemoAccessGate
          title="Agent 聊天已锁定"
          description="解锁后可以使用统一问答、个股问答、持仓问答和消息追踪。"
          compact={compact}
        />
      </div>
    );
  }

  function patchCurrentSession(updater: (session: ChatSession) => ChatSession) {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== currentSession?.id) {
          return session;
        }
        return updater(session);
      }),
    );
  }

  function appendMessage(message: Message) {
    patchCurrentSession((session) => ({
      ...session,
      title: session.title === "新对话" && message.role === "user" ? summarizeTitle(message.content) : session.title,
      updatedAt: Date.now(),
      messages: [...session.messages, message],
    }));
  }

  function updateMessage(messageId: string, updater: (message: Message) => Message) {
    patchCurrentSession((session) => ({
      ...session,
      updatedAt: Date.now(),
      messages: session.messages.map((message) => (message.id === messageId ? updater(message) : message)),
    }));
  }

  function appendAgentResponse(response: AgentResponse) {
    appendMessage({
      id: createId("msg"),
      role: "agent",
      content: response.summary,
      actions: response.actions,
      citations: response.citations,
      response,
    });
  }

  function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) {
      return;
    }

    appendMessage({
      id: createId("msg"),
      role: "user",
      content: trimmed,
    });
    setInput("");
    setPendingQuery(trimmed);
    setCurrentStageLabel("正在连接进度流");
    setProgressPct(0);
    setActiveTool(null);
    const history = buildAgentHistory(messages);
    let encounteredError = false;

    startTransition(async () => {
      try {
        setStreamState("connecting");
        setCurrentStageLabel("正在请求分析结果");
        setProgressPct(28);
        const response = await queryAgent(trimmed, history, currentSession?.id ?? undefined);
        appendAgentResponse(response);
        setCurrentStageLabel("回答已生成");
        setProgressPct(100);
        setStreamState("completed");
        setPendingQuery("");
      } catch (error) {
        encounteredError = true;
        setPendingQuery("");
        setStreamState("error");
        appendMessage({
          id: createId("msg"),
          role: "agent",
          content: `请求失败：${error instanceof Error ? error.message : "未知错误"}`,
        });
      }
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(input);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || isComposingRef.current) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask(input);
    }
  }

  function onNewChat() {
    const session = createSession();
    setSessions((prev) => [session, ...prev]);
    setCurrentSessionId(session.id);
    setInput("");
  }

  function onClearChat() {
    patchCurrentSession((session) => ({
      ...session,
      title: "新对话",
      updatedAt: Date.now(),
      messages: [createWelcomeMessage()],
    }));
    setInput("");
  }

  function onSelectSession(sessionId: string) {
    setCurrentSessionId(sessionId);
    setHistoryOpen(false);
  }

  function onDeleteSession(sessionId: string) {
    setSessions((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      const next = prev.filter((session) => session.id !== sessionId);
      if (!next.length) {
        const fresh = createSession();
        setCurrentSessionId(fresh.id);
        return [fresh];
      }
      setCurrentSessionId((current) => {
        if (!current || current === sessionId) {
          return next[0].id;
        }
        const stillExists = next.some((session) => session.id === current);
        return stillExists ? current : next[0].id;
      });
      return next;
    });
  }

  function onTogglePinned(sessionId: string) {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              pinned: !session.pinned,
              updatedAt: Date.now(),
            }
          : session,
      ),
    );
  }

  function onStartRename(session: ChatSession) {
    setRenamingSessionId(session.id);
    setRenameDraft(session.title === "新对话" ? "" : session.title);
  }

  function onCommitRename(sessionId: string) {
    const nextTitle = renameDraft.trim() || "新对话";
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              title: nextTitle,
              updatedAt: Date.now(),
            }
          : session,
      ),
    );
    setRenamingSessionId(null);
    setRenameDraft("");
  }

  if (compact) {
    const compactMessages = messages.length <= 1 ? [] : visibleMessages;

    return (
      <div className="agent-chat-compact gpt-chat">
        <div className="gpt-chat-topbar">
          <div className="gpt-chat-heading">
            <div className="gpt-chat-title">Agent</div>
            <div className="gpt-chat-subtitle">消息、热点、个股统一问答</div>
          </div>
          <div className="gpt-topbar-actions">
            <button
              className="button ghost gpt-topbar-button"
              onClick={() => setHistoryOpen((open) => !open)}
              type="button"
            >
              {historyOpen ? "收起历史" : "历史记录"}
            </button>
            <button className="button ghost gpt-topbar-button" onClick={onNewChat} type="button">
              新对话
            </button>
          </div>
        </div>

        {historyOpen ? (
          <div className="agent-history-panel">
            <div className="agent-history-head">
              <span className="agent-history-title">历史对话</span>
              <span className="agent-history-hint">切换、搜索、置顶、重命名</span>
            </div>
            <input
              className="agent-history-search"
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
              placeholder="搜索历史记录"
            />
            <div className="agent-history-list">
              {sortedSessions.map((session) => (
                <div
                  key={session.id}
                  className={`agent-history-item ${
                    session.id === currentSession?.id ? "active" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="agent-history-main"
                    onClick={() => onSelectSession(session.id)}
                  >
                    <div className="agent-history-text">
                      <span className="agent-history-name">
                        {session.pinned ? "置顶 · " : ""}
                        {session.title === "新对话" ? "未命名对话" : session.title}
                      </span>
                      <span className="agent-history-meta">
                        {new Date(session.updatedAt).toLocaleString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </button>
                  <div className="agent-history-actions">
                    <button
                      type="button"
                      className="agent-history-action"
                      onClick={() => onTogglePinned(session.id)}
                    >
                      {session.pinned ? "取消置顶" : "置顶"}
                    </button>
                    <button
                      type="button"
                      className="agent-history-action"
                      onClick={() => onStartRename(session)}
                    >
                      重命名
                    </button>
                    <button
                      type="button"
                      className="agent-history-delete"
                      onClick={() => onDeleteSession(session.id)}
                    >
                      删除
                    </button>
                  </div>
                  {renamingSessionId === session.id ? (
                    <div className="agent-history-rename">
                      <input
                        className="agent-history-rename-input"
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onCommitRename(session.id);
                          }
                        }}
                        placeholder="输入会话名称"
                        autoFocus
                      />
                      <button
                        type="button"
                        className="agent-history-action"
                        onClick={() => onCommitRename(session.id)}
                      >
                        保存
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {!sortedSessions.length ? <div className="agent-history-empty">暂无历史对话</div> : null}
            </div>
          </div>
        ) : null}

        <div className="gpt-chat-log" ref={compactLogRef}>
          <div className="agent-session-surface" key={currentSession?.id ?? "empty"}>
            {memoryMeta ? <MemoryPanel meta={memoryMeta} /> : null}
            {messages.length <= 1 ? (
              <section className="gpt-welcome-card">
                <h3>直接提问</h3>
                <p className="muted">支持全球新闻、热点、个股和持仓问答。</p>
                <div className="gpt-suggestion-grid">
                  {DEFAULT_PROMPTS.map((prompt) => (
                    <button className="gpt-suggestion" key={prompt} onClick={() => ask(prompt)} type="button">
                      {prompt}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            <div className="chat-log chat-log-full">
            {compactMessages.map((message) => (
              <div className={`chat-row ${message.role}`} key={message.id}>
                <div className={`chat-avatar ${message.role}`}>{message.role === "user" ? "你" : "A"}</div>
                <div className={`gpt-bubble ${message.role}`}>
                  <MarkdownText content={message.content} />
                  {message.response ? <PayloadCards response={message.response} /> : null}
                  {message.actions?.length ? (
                    <div className="tag-list agent-suggested-actions" style={{ marginTop: 10 }}>
                      {message.actions.slice(0, 3).map((action) => (
                        <button className="tag" key={action} onClick={() => ask(action)} type="button">
                          {compactActionLabel(action)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
              {busy ? (
                <div className="chat-row agent">
                  <div className="chat-avatar agent">A</div>
                  <div className="gpt-bubble agent">
                    <div className="gpt-thinking">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="gpt-progress-copy">
                      <strong>{progressStages[progressStep] ?? "处理中"}</strong>
                      <p>{progressStages.map((stage, index) => `${index + 1}. ${stage}`).join(" · ")}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <form className="gpt-input-shell" onSubmit={onSubmit}>
          <div className="gpt-input-frame">
            <textarea
              ref={inputRef}
              className="gpt-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
              }}
              placeholder="输入问题，Enter 发送，Shift+Enter 换行"
              rows={3}
            />
            <div className="gpt-input-meta">
              <button className="button ghost gpt-topbar-button" onClick={onClearChat} type="button" disabled={!currentSession}>
                清空
              </button>
              <button className="button" type="submit" disabled={busy || !input.trim()}>
                发送
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="panel section">
        <h1>Agent 对话页</h1>
        <p className="muted">当前接入的是后端轻量 Agent，负责意图判断、服务调度和结果整合。</p>
      </section>

      <section className="content-grid">
        <div className="panel section">
          <h2>对话</h2>
          <div className="chat-log">
            {visibleMessages.map((message) => (
              <div className={`bubble ${message.role}`} key={message.id}>
                <strong>{message.role === "user" ? "你" : "Agent"}</strong>
                <MarkdownText content={message.content} />
                {message.response ? <PayloadCards response={message.response} /> : null}
                {message.actions?.length ? (
                  <div className="tag-list" style={{ marginTop: 12 }}>
                    {message.actions.map((action) => (
                      <button className="tag" key={action} onClick={() => ask(action)} type="button">
                        {action}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="panel section">
          <h2>提问</h2>
          <form className="stack" onSubmit={onSubmit}>
            <label className="label">
              你的问题
              <textarea
                className="input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  isComposingRef.current = false;
                }}
                placeholder="例如：分析我的持仓"
                rows={4}
              />
            </label>
            <button className="button" type="submit" disabled={busy}>
              发送给 Agent
            </button>
          </form>
          <div className="stack" style={{ marginTop: 18 }}>
            {DEFAULT_PROMPTS.map((prompt) => (
              <button className="button ghost" key={prompt} onClick={() => ask(prompt)} type="button">
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function MarkdownText({ content }: { content: string }) {
  const blocks = buildMarkdownBlocks(content);
  return (
    <div className="markdown-body">
      {blocks.map((block, index) => {
        if (block.type === "pre") {
          return (
            <pre key={`${index}-${block.content.slice(0, 12)}`}>
              <code>{block.content}</code>
            </pre>
          );
        }
        if (block.type === "h3") {
          return <h3 key={`${index}-${block.content}`}>{block.content}</h3>;
        }
        if (block.type === "h2") {
          return <h2 key={`${index}-${block.content}`}>{block.content}</h2>;
        }
        if (block.type === "h1") {
          return <h1 key={`${index}-${block.content}`}>{block.content}</h1>;
        }
        if (block.type === "ul") {
          return (
            <ul key={`${index}-${block.items.join("-").slice(0, 12)}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${itemIndex}-${item}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={`${index}-${block.items.join("-").slice(0, 12)}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${itemIndex}-${item}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ol>
          );
        }
        if (block.type === "p") {
          return <p key={`${index}-${block.content.slice(0, 12)}`}>{renderInlineMarkdown(block.content)}</p>;
        }
        return null;
      })}
    </div>
  );
}

type MarkdownBlock =
  | { type: "h1" | "h2" | "h3" | "p" | "pre"; content: string }
  | { type: "ul" | "ol"; items: string[] };

function buildMarkdownBlocks(content: string): MarkdownBlock[] {
  const normalized = normalizeMarkdownContent(content);
  const lines = normalized.split("\n");
  const blocks: MarkdownBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "pre", content: codeLines.join("\n") });
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({ type: "h3", content: line.slice(4).trim() });
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", content: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push({ type: "h1", content: line.slice(2).trim() });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [line.replace(/^[-*]\s+/, "").trim()];
      while (index + 1 < lines.length && /^[-*]\s+/.test(lines[index + 1].trim())) {
        index += 1;
        items.push(lines[index].trim().replace(/^[-*]\s+/, "").trim());
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [line.replace(/^\d+\.\s+/, "").trim()];
      while (index + 1 < lines.length && /^\d+\.\s+/.test(lines[index + 1].trim())) {
        index += 1;
        items.push(lines[index].trim().replace(/^\d+\.\s+/, "").trim());
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const paragraphLines = [line];
    while (index + 1 < lines.length) {
      const next = lines[index + 1].trim();
      if (!next || next.startsWith("#") || /^[-*]\s+/.test(next) || /^\d+\.\s+/.test(next) || next.startsWith("```")) {
        break;
      }
      index += 1;
      paragraphLines.push(next);
    }
    blocks.push({ type: "p", content: paragraphLines.join(" ") });
  }

  return blocks;
}

function normalizeMarkdownContent(content: string) {
  return content
    .replace(/\r/g, "")
    .replace(/([^\n])\s+(#{1,3}\s)/g, "$1\n$2")
    .replace(/([^\n])\s+([-*]\s)/g, "$1\n$2")
    .replace(/([^\n])\s+(\d+\.\s)/g, "$1\n$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={`${token}-${index}`}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={`${token}-${index}`}>{token.slice(1, -1)}</code>;
    }
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a href={linkMatch[2]} key={`${token}-${index}`} target="_blank" rel="noreferrer">
          {linkMatch[1]}
        </a>
      );
    }
    return <span key={`${token}-${index}`}>{token}</span>;
  });
}

function summarizeTitle(input: string) {
  return input.replace(/\s+/g, " ").trim().slice(0, 24) || "新对话";
}

function truncate(text: string, maxLength: number) {
  const normalized = text?.trim() ?? "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized;
}

function compactActionLabel(action: string) {
  if (action.includes("最新消息")) return "最新消息";
  if (action.includes("同板块")) return "板块对比";
  if (action.includes("完整单股分析")) return "完整分析";
  if (action.includes("全球局势")) return "全球影响";
  return truncate(action.replace(/^继续问[：:]/, "").trim(), 12);
}

function inferProgressStages(query: string) {
  if (!query.trim()) {
    return ["理解问题", "调用相关数据", "整理回答"];
  }
  return ["理解问题", "调用相关数据", "整理回答"];
}

function PayloadCards({ response }: { response: AgentResponse }) {
  const payload = response.payload;
  const meta = payload._meta;
  const hasStockAnalysis = Boolean(payload.stock_code && payload.quote);
  const hasPortfolio = Array.isArray(payload.positions);
  const news = Array.isArray(payload.news) ? (payload.news as NewsItem[]) : [];
  const hotspots = Array.isArray(payload.hotspots) ? (payload.hotspots as HotspotItem[]) : [];
  const globalNews = Array.isArray(payload.global_news) ? (payload.global_news as GlobalNewsItem[]) : [];
  const webResults = Array.isArray(payload.web_results) ? (payload.web_results as WebSearchResult[]) : [];
  const showStock =
    response.intent === "stock_analysis" || response.intent === "stock_comparison" || response.intent === "pydantic_ai_agent";
  const showNews = response.intent === "news_lookup" || response.intent === "pydantic_ai_agent";
  const showPortfolio = response.intent === "portfolio_analysis" || response.intent === "pydantic_ai_agent";
  const showGlobalNews = response.intent === "pydantic_ai_agent";
  const showWebResults = response.intent === "pydantic_ai_agent";
  const showHotspots = response.intent === "pydantic_ai_agent";

  return (
    <div className="stack" style={{ marginTop: 14 }}>
      {meta?.tools_used?.length ? <AgentMetaChips toolsUsed={meta.tools_used} cacheHits={meta.cache_hits ?? []} /> : null}
      {showStock && hasStockAnalysis ? <StockAnalysisCard analysis={payload as unknown as StockAnalysisResponse} /> : null}
      {showNews && news.length ? <NewsCards news={news} /> : null}
      {showGlobalNews && globalNews.length ? <GlobalNewsCards news={globalNews} /> : null}
      {showWebResults && webResults.length ? <WebResultCards results={webResults} /> : null}
      {showHotspots && hotspots.length ? <HotspotCards hotspots={hotspots} /> : null}
      {showPortfolio && hasPortfolio ? <PortfolioCard analysis={payload as unknown as PortfolioAnalysisResponse} /> : null}
    </div>
  );
}

function AgentMetaChips({ toolsUsed, cacheHits }: { toolsUsed: string[]; cacheHits: string[] }) {
  const cacheSet = new Set(cacheHits);
  return (
    <div className="agent-meta-strip">
      <span className="agent-meta-label">本次调用</span>
      <div className="tag-list">
        {toolsUsed.map((tool) => (
          <span className="tag" key={tool}>
            {formatToolName(tool)}
            {cacheSet.has(tool) ? " · 缓存" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function StockAnalysisCard({ analysis }: { analysis: StockAnalysisResponse }) {
  const portfolioHref = `/portfolio?stock_code=${encodeURIComponent(analysis.stock_code)}&stock_name=${encodeURIComponent(
    analysis.stock_name,
  )}&quantity=100&focus=cost&return_to=${encodeURIComponent("/agent")}&return_label=${encodeURIComponent("Agent")}`;
  const technicalNotes = analysis.technical_commentary?.slice(0, 2) ?? [];
  return (
    <div className="agent-payload-card agent-stock-card">
      <div className="agent-card-head">
        <div>
          <div className="agent-card-kicker">股票</div>
          <h3>
            {analysis.stock_name} <span>{analysis.stock_code}</span>
          </h3>
        </div>
        <span className="agent-signal-pill">
          {analysis.signal_summary.overall_signal} · {analysis.signal_summary.overall_score}
        </span>
      </div>
      <div className="agent-card-metrics">
        <div className="agent-card-metric">
          <span>最新价</span>
          <strong>{analysis.quote.current_price.toFixed(2)}</strong>
        </div>
        <div className="agent-card-metric">
          <span>结论</span>
          <strong>{analysis.signal_summary.overall_signal}</strong>
        </div>
      </div>
      {technicalNotes.length ? (
        <div className="agent-note-list">
          {technicalNotes.map((item) => (
            <span className="agent-note" key={item}>
              {truncate(item, 20)}
            </span>
          ))}
        </div>
      ) : null}
      <div className="agent-card-actions agent-stock-actions">
        <Link
          href={`/stocks?query=${encodeURIComponent(analysis.stock_code)}&panel=overview#overview`}
          className="button ghost"
        >
          总览
        </Link>
        <StockPanelLink stockCode={analysis.stock_code} panel="ai" className="button ghost" compactLoading>
          AI
        </StockPanelLink>
        <StockPanelLink stockCode={analysis.stock_code} panel="news" className="button ghost" compactLoading>
          新闻
        </StockPanelLink>
        <Link href={portfolioHref} className="button">
          持仓
        </Link>
      </div>
    </div>
  );
}

function GlobalNewsCards({ news }: { news: GlobalNewsItem[] }) {
  return (
    <div className="agent-payload-card">
      <div className="agent-card-kicker">全球重点新闻</div>
      <div className="agent-card-list">
        {news.slice(0, 4).map((item) => (
          <div className="agent-card-row" key={item.id}>
            <div className="agent-card-row-head">
              <strong>{item.title}</strong>
              <span className="muted">{item.source}</span>
            </div>
            <p className="muted">{truncate(item.summary, 160)}</p>
            <div className="tag-list">
              <span className="tag">{item.topic}</span>
              <span className="tag">影响 {item.impact_level}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WebResultCards({ results }: { results: WebSearchResult[] }) {
  return (
    <div className="agent-payload-card">
      <div className="agent-card-kicker">联网搜索结果</div>
      <div className="agent-card-list">
        {results.slice(0, 4).map((item) => (
          <div className="agent-card-row" key={item.id}>
            <div className="agent-card-row-head">
              <a href={item.url} target="_blank" rel="noreferrer" className="agent-card-row-link">
                <strong>{item.title}</strong>
              </a>
              <span className="muted">{item.source}</span>
            </div>
            <p className="muted">{truncate(item.snippet, 160)}</p>
            <div className="tag-list">
              <span className="tag">{item.provider}</span>
              {item.published_at ? <span className="tag">{item.published_at}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewsCards({ news }: { news: NewsItem[] }) {
  return (
    <div className="agent-payload-card">
      <div className="agent-card-kicker">消息卡片</div>
      <div className="agent-card-list">
        {news.slice(0, 3).map((item) => (
          <div className="agent-card-row" key={item.id}>
            <div className="agent-card-row-head">
              <strong>{item.title}</strong>
              <span className="muted">{item.source}</span>
            </div>
            <p className="muted">{truncate(item.summary, 160)}</p>
            <div className="tag-list">
              <span className="tag">影响 {item.impact_level}</span>
              <span className="tag">{item.sentiment}</span>
            </div>
            <div className="inline-actions agent-card-actions">
              <StockPanelLink stockCode={item.stock_code} panel="news" className="button ghost">
                查看该股消息
              </StockPanelLink>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HotspotCards({ hotspots }: { hotspots: HotspotItem[] }) {
  return (
    <div className="agent-payload-card">
      <div className="agent-card-kicker">热点卡片</div>
      <div className="agent-card-list">
        {hotspots.slice(0, 3).map((item) => (
          <div className="agent-card-row" key={item.topic_name}>
            <div className="agent-card-row-head">
              <strong>{item.topic_name}</strong>
              <span className="muted">{item.related_stocks.length} 只相关标的</span>
            </div>
            <p className="muted">{item.ai_summary || item.reason}</p>
            <div className="tag-list">
              {item.related_stocks.slice(0, 3).map((stock) => (
                <Link
                  href={`/stocks?query=${encodeURIComponent(stock.stock_code)}`}
                  className="tag"
                  key={`${item.topic_name}-${stock.stock_code}`}
                >
                  {stock.stock_name}
                </Link>
              ))}
            </div>
            <div className="inline-actions agent-card-actions">
              <Link
                href={`/hotspots?topic=${encodeURIComponent(item.topic_name)}#topic-${encodeURIComponent(item.topic_name)}`}
                className="button ghost"
              >
                打开热点详情
              </Link>
              {item.related_stocks[0] ? (
                <Link
                  href={`/portfolio?stock_code=${encodeURIComponent(item.related_stocks[0].stock_code)}&stock_name=${encodeURIComponent(
                    item.related_stocks[0].stock_name,
                  )}&quantity=100&focus=cost&return_to=${encodeURIComponent(
                    `/hotspots?topic=${encodeURIComponent(item.topic_name)}#topic-${encodeURIComponent(item.topic_name)}`,
                  )}&return_label=${encodeURIComponent("热点详情")}`}
                  className="button"
                >
                  将龙头加入持仓
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortfolioCard({ analysis }: { analysis: PortfolioAnalysisResponse }) {
  return (
    <div className="agent-payload-card">
      <div className="agent-card-kicker">持仓卡片</div>
      <div className="agent-card-head">
        <h3>组合表现</h3>
        <div className="agent-card-subtitle">把盈亏、收益率和重点持仓收进一张卡片里。</div>
      </div>
      <div className="agent-card-metrics">
        <div className="agent-card-metric">
          <span>总盈亏</span>
          <strong className={analysis.total_pnl >= 0 ? "signal-up" : "signal-down"}>{analysis.total_pnl.toFixed(2)}</strong>
        </div>
        <div className="agent-card-metric">
          <span>收益率</span>
          <strong>{analysis.total_pnl_pct.toFixed(2)}%</strong>
        </div>
      </div>
      {analysis.positions?.length ? (
        <div className="agent-card-list">
          {analysis.positions.slice(0, 3).map((item) => (
            <div className="agent-card-row" key={`${item.position.id}-${item.position.stock_code}`}>
              <div className="agent-card-row-head">
                <strong>
                  {item.position.stock_name} ({item.position.stock_code})
                </strong>
                <span className="muted">风险 {item.risk_level}</span>
              </div>
              <p className="muted">
                盈亏 {item.pnl.toFixed(2)} ({item.pnl_pct.toFixed(2)}%)
              </p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="agent-card-actions inline-actions">
        <Link href="/portfolio" className="button ghost">
          打开持仓页
        </Link>
      </div>
    </div>
  );
}

function formatToolName(tool: string) {
  const names: Record<string, string> = {
    search_stocks: "股票检索",
    stock_analysis: "技术分析",
    get_stock_analysis: "技术分析",
    stock_news: "个股消息",
    get_stock_news: "个股消息",
    global_news: "全球消息",
    get_global_news: "全球消息",
    hotspots: "热点列表",
    list_hotspots: "热点列表",
    get_hotspot_detail: "热点详情",
    web_search: "联网搜索",
    portfolio_analysis: "持仓分析",
    get_portfolio_analysis: "持仓分析",
  };
  return names[tool] ?? tool;
}

function buildAgentHistory(messages: Message[]): AgentHistoryTurn[] {
  return messages
    .slice(-6)
    .map((message) => ({
      role: message.role,
      content: message.content,
      intent: message.response?.intent ?? null,
      stock_code: typeof message.response?.payload?.stock_code === "string" ? message.response.payload.stock_code : null,
      stock_name: typeof message.response?.payload?.stock_name === "string" ? message.response.payload.stock_name : null,
    }))
    .filter((item) => item.content.trim());
}

function findLatestMemoryMeta(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const meta = messages[index].response?.payload?._meta;
    if (meta?.memory_profile || meta?.heartbeat) {
      return meta;
    }
  }
  return null;
}

function MemoryPanel({
  meta,
}: {
  meta: NonNullable<AgentResponse["payload"]["_meta"]>;
}) {
  const profile = meta.memory_profile;
  const heartbeat = meta.heartbeat;
  const watchlist: Array<{ code: string; name?: string | null }> = Array.isArray(profile?.watchlist) ? profile.watchlist : [];
  const lastStock = profile?.last_stock_name || profile?.last_stock_code;
  const preferredMarket = formatMarketPreference(profile?.preferred_market);
  const activeGoal = typeof profile?.active_goal === "string" && profile.active_goal.trim() ? profile.active_goal.trim() : null;
  const pinnedMemory: string[] = Array.isArray(profile?.pinned_memory)
    ? profile.pinned_memory.filter(Boolean).map((item: unknown) => String(item)).slice(0, 5)
    : [];
  const heartbeatTime = heartbeat?.last_heartbeat_at ? formatHeartbeatTime(heartbeat.last_heartbeat_at) : null;
  const heartbeatSummary = heartbeat?.summary_text ? formatHeartbeatSummary(heartbeat.summary_text, profile) : null;

  if (!profile && !heartbeat) {
    return null;
  }

  return (
    <section className="memory-panel">
      <div className="memory-panel-head">
        <div>
          <div className="memory-panel-kicker">记忆</div>
          <h3>已记住这些偏好</h3>
        </div>
        {heartbeat?.heartbeat_count ? <span className="pill">最近更新</span> : null}
      </div>

      <div className="memory-metric-grid">
        <div className="memory-metric">
          <span>偏好市场</span>
          <strong>{preferredMarket}</strong>
        </div>
        <div className="memory-metric">
          <span>最近标的</span>
          <strong>{lastStock || "暂无"}</strong>
        </div>
      </div>

      {activeGoal ? (
        <div className="memory-metric" style={{ marginTop: 12 }}>
          <span>当前目标</span>
          <strong>{activeGoal}</strong>
        </div>
      ) : null}

      {watchlist.length ? (
        <div className="memory-watchlist">
          {watchlist.slice(0, 5).map((item) => (
            <span className="tag" key={item.code}>
              {item.name || item.code}
            </span>
          ))}
        </div>
      ) : null}

      {pinnedMemory.length ? (
        <div className="memory-watchlist">
          {pinnedMemory.map((item) => (
            <span className="tag" key={String(item)}>
              {String(item)}
            </span>
          ))}
        </div>
      ) : null}

      {heartbeatSummary ? <p className="memory-summary">{heartbeatSummary}</p> : null}
      {heartbeatTime ? <p className="memory-footnote">上次整理 · {heartbeatTime}</p> : null}
    </section>
  );
}

function formatMarketPreference(value?: string | null) {
  if (value === "a_share") return "A股";
  if (value === "hk") return "港股";
  return "未形成";
}

function formatHeartbeatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatHeartbeatSummary(
  raw: string,
  profile?: { preferred_market?: string | null; active_goal?: string | null } | null,
) {
  let text = (raw || "").trim();
  if (!text) return "";

  // 去掉前缀里的 session / 时间戳等技术字段
  text = text.replace(/会话\s+session-[^。]+。?/u, "").trim();

  // 如果有“关注清单：”，说明后面是细节列表，可以省略
  const watchlistIndex = text.indexOf("关注清单：");
  if (watchlistIndex > 0) {
    text = text.slice(0, watchlistIndex).trim();
  }

  const pinnedIndex = text.indexOf("固定记忆：");
  if (pinnedIndex > 0) {
    text = text.slice(0, pinnedIndex).trim();
  }

  // 统一偏好市场文案
  if (profile?.preferred_market === "a_share") {
    text = text.replace(/偏好市场：?a_share/gi, "偏好市场：A股");
  } else if (profile?.preferred_market === "hk") {
    text = text.replace(/偏好市场：?hk/gi, "偏好市场：港股");
  }

  if (profile?.active_goal) {
    text = text.replace(/当前目标：?\s*/g, "当前目标：");
  }

  // 限制长度，避免一整段塞满
  return text.length > 80 ? `${text.slice(0, 80).trim()}…` : text;
}
