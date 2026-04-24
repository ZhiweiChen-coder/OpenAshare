"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DemoAccessGate } from "@/components/demo-access-gate";
import { useDemoAccess } from "@/components/demo-access-provider";
import { getGlobalNews, queryAgent } from "@/lib/api";
import type { GlobalNewsItem } from "@/lib/types";

type SummarySection = {
  title: string;
  bullets: string[];
  paragraphs: string[];
  table?: SummaryTable | null;
};

type SummaryTable = {
  headers: string[];
  rows: string[][];
};

type AgentSummary = {
  intent: string;
  summary: string;
  actions: string[];
};

type BlockStatus = "idle" | "loading" | "ok" | "error";

const AGENT_PROMPT = "今日全球热点和科技大事是什么";
const AGENT_TIMEOUT_MS = 25_000;

export function NewsPageClient() {
  const { loaded, unlocked } = useDemoAccess();
  const agentAbortRef = useRef<AbortController | null>(null);
  const [agentStatus, setAgentStatus] = useState<BlockStatus>("idle");
  const [agentResponse, setAgentResponse] = useState<AgentSummary | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentProgress, setAgentProgress] = useState("正在连接 Agent...");
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const [newsStatus, setNewsStatus] = useState<BlockStatus>("idle");
  const [globalNews, setGlobalNews] = useState<GlobalNewsItem[]>([]);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [selectedNews, setSelectedNews] = useState<GlobalNewsItem | null>(null);

  const loadNews = useCallback(() => {
    let cancelled = false;
    setNewsStatus("loading");
    setNewsError(null);
    getGlobalNews()
      .then((items) => {
        if (!cancelled) {
          setGlobalNews(items);
          setNewsStatus("ok");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setGlobalNews([]);
          setNewsError(error instanceof Error ? error.message : "未知错误");
          setNewsStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAgent = useCallback(() => {
    if (!unlocked) {
      return;
    }
    agentAbortRef.current?.abort();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort("timeout"), AGENT_TIMEOUT_MS);
    agentAbortRef.current = controller;

    setAgentStatus("loading");
    setAgentError(null);
    setAgentResponse(null);
    setAgentProgress("正在连接 Agent...");

    setAgentProgress("正在整理今日重点...");

    queryAgent(AGENT_PROMPT, [], undefined, { signal: controller.signal, timeoutMs: AGENT_TIMEOUT_MS })
      .then((response) => {
        setAgentResponse({
          intent: response.intent,
          summary: response.summary,
          actions: response.actions,
        });
        setAgentStatus("ok");
      })
      .catch((error) => {
        if (controller.signal.aborted && controller.signal.reason !== "timeout") {
          return;
        }
        setAgentResponse(null);
        setAgentError(
          controller.signal.reason === "timeout"
            ? `Agent 请求超时（${Math.round(AGENT_TIMEOUT_MS / 1000)}s）`
            : error instanceof Error
              ? error.message
              : "未知错误",
        );
        setAgentStatus("error");
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (agentAbortRef.current === controller) {
          agentAbortRef.current = null;
        }
      });
  }, [unlocked]);

  useEffect(() => loadNews(), [loadNews]);

  useEffect(() => {
    if (!unlocked) {
      setAgentStatus("idle");
      setAgentResponse(null);
      setAgentError(null);
      return;
    }
    loadAgent();
    return () => {
      agentAbortRef.current?.abort();
    };
  }, [loadAgent, unlocked]);

  const refreshPage = useCallback(() => {
    setManualRefreshing(true);
    const cleanup = loadNews();
    if (unlocked) {
      loadAgent();
    }
    window.setTimeout(() => {
      cleanup();
      setManualRefreshing(false);
    }, 400);
  }, [loadAgent, loadNews, unlocked]);

  const leadNews = globalNews[0] ?? null;
  const secondaryNews = globalNews.slice(1, 7);
  const summarySections = useMemo(() => parseSummarySections(agentResponse?.summary), [agentResponse?.summary]);
  const summaryLead = useMemo(() => buildSummaryLead(summarySections), [summarySections]);
  const topicGroups = useMemo(() => buildTopicGroups(globalNews), [globalNews]);
  const showAgentGate = loaded && !unlocked;

  return (
    <>
      <section className="panel section news-hero">
        <div className="news-section-head">
          <div>
            <div className="section-kicker">News Desk</div>
            <h1>消息页</h1>
            <p className="muted">汇总全球重点新闻，并用 Agent 自动提炼今日对市场最重要的几件事。</p>
          </div>
          <button className="button ghost" type="button" onClick={refreshPage} disabled={manualRefreshing}>
            {manualRefreshing ? "刷新中..." : "手动刷新"}
          </button>
        </div>
      </section>

      <section className="news-stack-layout">
        <section className="panel section news-summary-panel">
          <div className="news-section-head">
            <div>
              <div className="section-kicker">Agent Summary</div>
              <h2>今日判断</h2>
            </div>
            {showAgentGate ? <span className="pill">未解锁</span> : null}
            {!showAgentGate && agentStatus === "loading" ? <span className="pill">加载中</span> : null}
            {!showAgentGate && agentStatus === "ok" && agentResponse ? (
              formatIntentLabel(agentResponse.intent) ? <span className="pill">{formatIntentLabel(agentResponse.intent)}</span> : null
            ) : null}
            {!showAgentGate && agentStatus === "error" ? (
              <button className="button ghost" type="button" onClick={loadAgent}>
                重试 Agent
              </button>
            ) : null}
          </div>

          {showAgentGate ? (
            <DemoAccessGate
              title="Agent 摘要已锁定"
              description="解锁后可以看到今日判断、AI 结论和行动建议。"
            />
          ) : null}

          {!showAgentGate && agentStatus === "loading" ? (
            <div className="news-agent-skeleton">
              <p className="muted">{agentProgress}</p>
              <p className="muted">Agent 正在整理今日重点，请稍候...</p>
              <div className="news-skeleton-lines">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : null}

          {!showAgentGate && agentStatus === "error" ? <p className="muted">Agent 摘要加载失败：{agentError}</p> : null}

          {!showAgentGate && agentStatus === "ok" && agentResponse ? (
            <>
              <div className="summary-overview-card">
                <div className="summary-overview-topline">
                  <span className="summary-overview-label">重点结论</span>
                  <span className="summary-overview-intent">{formatIntentLabel(agentResponse.intent)}</span>
                </div>
                <h3>{summaryLead.title}</h3>
                <p>{summaryLead.description}</p>
              </div>

              {summarySections.length ? (
                <div className="summary-section-grid">
                  {summarySections.map((section, index) => (
                    <article className="summary-section-card" key={`${section.title}-${index}`}>
                      <div className="summary-section-head">
                        <span className="summary-section-index">{String(index + 1).padStart(2, "0")}</span>
                        <h3>{section.title}</h3>
                      </div>
                      {section.paragraphs.length ? (
                        <div className="summary-paragraph-list">
                          {section.paragraphs.map((paragraph) => (
                            <p key={paragraph}>{paragraph}</p>
                          ))}
                        </div>
                      ) : null}
                      {section.bullets.length ? (
                        <ul className="summary-bullet-list">
                          {section.bullets.map((bullet) => (
                            <li key={bullet}>{bullet}</li>
                          ))}
                        </ul>
                      ) : null}
                      {section.table ? (
                        <div className="summary-table-wrap">
                          <table className="summary-table">
                            <thead>
                              <tr>
                                {section.table.headers.map((header) => (
                                  <th key={header}>{header}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {section.table.rows.map((row, rowIndex) => (
                                <tr key={`${section.title}-row-${rowIndex}`}>
                                  {section.table?.headers.map((header, cellIndex) => (
                                    <td key={`${header}-${cellIndex}`}>{row[cellIndex] ?? ""}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="summary-text-flow">
                  <p>{agentResponse.summary}</p>
                </div>
              )}

              {agentResponse.actions.length ? (
                <div className="news-action-row">
                  {agentResponse.actions.map((action) => (
                    <span className="tag" key={action}>
                      {action}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          {agentStatus === "idle" ? <p className="muted">等待加载...</p> : null}
        </section>

        {newsStatus === "loading" ? (
          <section className="panel section news-lead-panel">
            <div className="news-section-head">
              <h2>全球重点新闻</h2>
            </div>
            <div className="news-skeleton-grid" aria-hidden="true">
              <article className="news-skeleton-card">
                <div className="news-skeleton-meta">
                  <span className="pill" />
                  <span className="news-skeleton-chip" />
                </div>
                <div className="news-skeleton-line news-skeleton-line-lg" />
                <div className="news-skeleton-line" />
                <div className="news-skeleton-line news-skeleton-line-faded" />
              </article>
              <article className="news-skeleton-card">
                <div className="news-skeleton-meta">
                  <span className="pill" />
                  <span className="news-skeleton-chip" />
                </div>
                <div className="news-skeleton-line news-skeleton-line-lg" />
                <div className="news-skeleton-line" />
                <div className="news-skeleton-line news-skeleton-line-faded" />
              </article>
            </div>
          </section>
        ) : null}

        {newsStatus === "error" ? (
          <section className="panel section news-warning-strip">
            <p className="muted">全球新闻加载失败：{newsError}</p>
            <button className="button ghost" type="button" onClick={loadNews}>
              重试新闻
            </button>
          </section>
        ) : null}

        {newsStatus === "ok" && topicGroups.length ? (
          <section className="panel section topic-strip-panel">
            <div className="news-section-head">
              <div>
                <div className="section-kicker">Topics</div>
                <h2>全球热点主题</h2>
              </div>
            </div>
            <div className="topic-strip-grid">
              {topicGroups.map((group) => (
                <article className="topic-strip-card" key={group.topic}>
                  <div className="topic-strip-head">
                    <h3>{group.topic}</h3>
                    <span>{group.count} 条</span>
                  </div>
                  <p>{truncate(group.summary, 88)}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {newsStatus === "ok" ? (
          <section className="panel section news-lead-panel">
            <div className="news-section-head">
              <div>
                <div className="section-kicker">Lead Story</div>
                <h2>全球重点新闻</h2>
              </div>
              <span className="muted">{globalNews.length ? `${globalNews.length} 条` : "暂无数据"}</span>
            </div>

            {leadNews ? (
              <article
                className="lead-story clickable-card"
                onClick={() => setSelectedNews(leadNews)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedNews(leadNews);
                  }
                }}
              >
                <div className="lead-story-meta">
                  <span className="pill">{leadNews.topic}</span>
                  <span className="news-meta-text">
                    {leadNews.source} · {formatDateLabel(leadNews.published_at)}
                  </span>
                </div>
                <h3>{formatNewsTitle(leadNews)}</h3>
                <p className="lead-story-summary">{truncate(leadNews.summary, 260)}</p>
                <div className="news-tag-row">
                  <span className="tag">影响 {leadNews.impact_level}</span>
                  <span className="tag">{labelSentiment(leadNews.sentiment)}</span>
                  {formatRegionLabel(leadNews.region) ? <span className="tag">{formatRegionLabel(leadNews.region)}</span> : null}
                  <span className="tag">点击查看详情</span>
                </div>
              </article>
            ) : (
              <p className="muted">当前没有可展示的全球新闻。</p>
            )}

            {secondaryNews.length ? (
              <div className="news-story-list">
                {secondaryNews.map((item) => (
                  <article
                    className="story-row clickable-card"
                    key={item.id}
                    onClick={() => setSelectedNews(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedNews(item);
                      }
                    }}
                  >
                    <div className="story-row-top">
                      <span className="story-topic">{item.topic}</span>
                      <span className="news-meta-text">
                        {item.source} · {formatDateLabel(item.published_at)}
                      </span>
                    </div>
                    <h4>{item.title}</h4>
                    <p>{truncate(item.summary, 140)}</p>
                    <div className="news-inline-hint">点击查看完整摘要{item.url ? "或打开原文" : ""}</div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </section>

      {selectedNews ? (
        <div className="news-detail-overlay" onClick={() => setSelectedNews(null)} role="presentation">
          <section
            className="news-detail-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="news-detail-title"
          >
            <div className="news-detail-head">
              <div>
                <div className="section-kicker">News Detail</div>
                <h2 id="news-detail-title">{formatNewsTitle(selectedNews)}</h2>
              </div>
              <button className="button ghost" type="button" onClick={() => setSelectedNews(null)}>
                关闭
              </button>
            </div>

            <div className="news-tag-row">
              <span className="tag">{selectedNews.source}</span>
              <span className="tag">{formatDateLabel(selectedNews.published_at)}</span>
              <span className="tag">{selectedNews.topic}</span>
              <span className="tag">影响 {selectedNews.impact_level}</span>
              <span className="tag">{labelSentiment(selectedNews.sentiment)}</span>
              {formatRegionLabel(selectedNews.region) ? <span className="tag">{formatRegionLabel(selectedNews.region)}</span> : null}
            </div>

            <div className="news-detail-body">
              <p>{selectedNews.summary}</p>
            </div>

            <div className="news-detail-actions">
              {selectedNews.url ? (
                <a href={selectedNews.url} target="_blank" rel="noreferrer" className="button">
                  打开原文
                </a>
              ) : (
                <span className="muted">当前数据源没有提供原文链接。</span>
              )}
              <button className="button ghost" type="button" onClick={() => setSelectedNews(null)}>
                返回消息页
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function buildTopicGroups(items: GlobalNewsItem[]) {
  const groups = new Map<string, { topic: string; count: number; summary: string }>();
  items.forEach((item) => {
    const current = groups.get(item.topic);
    if (current) {
      current.count += 1;
      return;
    }
    groups.set(item.topic, {
      topic: item.topic,
      count: 1,
      summary: item.summary,
    });
  });
  return Array.from(groups.values()).slice(0, 4);
}

function truncate(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function formatRegionLabel(region?: GlobalNewsItem["region"]) {
  if (!region) return null;
  const map: Record<string, string> = {
    global: "全球",
    middle_east: "中东",
    asia: "亚洲",
    europe: "欧洲",
    us: "美国",
  };
  return map[region] ?? region;
}

function formatNewsTitle(item: GlobalNewsItem) {
  const raw = (item.title || "").trim();
  const summary = (item.summary || "").trim();
  if (raw && raw.length <= 60) {
    return raw;
  }

  const source = raw || summary;
  const index = source.indexOf("】");
  if (index > 0 && index < 80) {
    return source.slice(0, index + 1).trim();
  }

  return truncate(source || "全球重点新闻", 60);
}

function formatDateLabel(value: string) {
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

function labelSentiment(sentiment: GlobalNewsItem["sentiment"]) {
  if (sentiment === "bullish") return "偏利好";
  if (sentiment === "bearish") return "偏利空";
  return "中性";
}

function parseSummarySections(summary?: string | null): SummarySection[] {
  if (!summary) {
    return [];
  }

  const cleaned = summary.replace(/\r/g, "").trim();
  if (!cleaned) {
    return [];
  }

  const sections: SummarySection[] = [];
  let current: SummarySection | null = null;
  let pendingTableHeader: string[] | null = null;

  const ensureCurrent = () => {
    if (!current) {
      current = { title: "总体概览", bullets: [], paragraphs: [], table: null };
    }
    return current;
  };

  cleaned.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    if (line.startsWith("##")) {
      if (current) {
        sections.push(current);
      }
      current = {
        title: line.replace(/^##+\s*/, "").trim() || "重点",
        bullets: [],
        paragraphs: [],
        table: null,
      };
      pendingTableHeader = null;
      return;
    }

    const tableCells = parseMarkdownTableRow(line);
    if (tableCells) {
      const section = ensureCurrent();
      if (isMarkdownTableDivider(tableCells)) {
        return;
      }
      if (!pendingTableHeader) {
        pendingTableHeader = tableCells;
        return;
      }
      if (!section.table) {
        section.table = {
          headers: pendingTableHeader,
          rows: [],
        };
      }
      section.table.rows.push(tableCells);
      return;
    }
    pendingTableHeader = null;

    const normalized = cleanSummaryLine(line.replace(/^[-*]\s*/, "").trim());
    const section = ensureCurrent();

    if (/^[-*]\s+/.test(line)) {
      if (normalized) {
        section.bullets.push(normalized);
      }
      return;
    }

    if (normalized) {
      section.paragraphs.push(normalized);
    }
  });

  if (current) {
    sections.push(current);
  }

  return dedupeSummarySections(
    sections.filter((section) => section.title || section.bullets.length || section.paragraphs.length),
  );
}

function buildSummaryLead(sections: SummarySection[]) {
  if (!sections.length) {
    return {
      title: "正在整理今日重点",
      description: "Agent 会把全球宏观、科技和地缘政治拆成几个可读主题。",
    };
  }

  const first = sections[0];
  const firstBullet = first.bullets[0];
  const firstParagraph = first.paragraphs[0];
  return {
    title: first.title,
    description: firstBullet || firstParagraph || "已生成今日重点判断。",
  };
}

function formatIntentLabel(intent: string) {
  if (intent === "pydantic_ai_agent") return null;
  if (intent === "web_search_lookup") return "联网检索";
  if (intent === "news_lookup") return "消息追踪";
  return intent;
}

function cleanSummaryLine(value: string) {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*/g, "$1")
    .replace(/[*_`#]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseMarkdownTableRow(line: string) {
  if (!line.startsWith("|") || !line.endsWith("|")) {
    return null;
  }
  const cells = line
    .slice(1, -1)
    .split("|")
    .map((cell) => cleanSummaryLine(cell))
    .filter(Boolean);
  return cells.length >= 2 ? cells : null;
}

function isMarkdownTableDivider(cells: string[]) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
}

function dedupeSummarySections(sections: SummarySection[]) {
  const seen = new Set<string>();

  return sections
    .map((section) => {
      const paragraphs = section.paragraphs.filter((paragraph) => {
        const key = paragraph.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      const bullets = section.bullets.filter((bullet) => {
        const key = bullet.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      return {
        ...section,
        title: cleanSummaryLine(section.title),
        paragraphs,
        bullets,
        table: section.table && section.table.rows.length ? section.table : null,
      };
    })
    .filter((section) => section.title || section.paragraphs.length || section.bullets.length || section.table);
}
