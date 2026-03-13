"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getHotspotDetail, getHotspots } from "@/lib/api";
import type { HotspotDetailResponse, HotspotItem } from "@/lib/types";

export function HotspotsPageClient() {
  const searchParams = useSearchParams();
  const topicParam = searchParams.get("topic") ?? "";
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [detail, setDetail] = useState<HotspotDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedHotspots = [...hotspots].sort((a, b) => {
    if (a.topic_name === topicParam) return -1;
    if (b.topic_name === topicParam) return 1;
    return b.heat_score - a.heat_score;
  });
  const selectedTopic = sortedHotspots.find((i) => i.topic_name === topicParam) ?? sortedHotspots[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getHotspots()
      .then((list) => {
        if (!cancelled) {
          setHotspots(list);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setHotspots([]);
          setError(err instanceof Error ? `热点数据暂时不可用：${err.message}` : "热点数据暂时不可用");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDetail = useCallback((topicName: string) => {
    setDetailLoading(true);
    getHotspotDetail(topicName)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedTopic) {
      setDetail(null);
      return;
    }
    loadDetail(selectedTopic.topic_name);
  }, [selectedTopic?.topic_name, loadDetail]);

  return (
    <>
        <section className="panel section news-hero">
        <div className="section-kicker">Sector Radar</div>
        <h1>热点板块</h1>
        <p className="muted">
          从板块视角梳理当前市场最热的交易方向，结合代表个股、催化消息和热度变化，帮你快速锁定值得跟踪的主题。
        </p>
      </section>

      {loading ? (
        <section className="panel section">
          <div className="hotspot-skeleton-layout" aria-hidden="true">
            <div className="hotspot-skeleton-column">
              <div className="news-section-head">
                <div>
                  <div className="section-kicker">Sector Board</div>
                  <h2>热点板块榜单</h2>
                </div>
                <span className="muted">加载中…</span>
              </div>
              <div className="hotspot-skeleton-list">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className="hotspot-skeleton-row" key={index}>
                    <div className="hotspot-skeleton-rank" />
                    <div className="hotspot-skeleton-body">
                      <div className="hotspot-skeleton-line hotspot-skeleton-line-sm" />
                      <div className="hotspot-skeleton-line" />
                      <div className="hotspot-skeleton-line hotspot-skeleton-line-faded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="hotspot-skeleton-column">
              <div className="news-section-head">
                <div>
                  <div className="section-kicker">Sector Detail</div>
                  <h2>板块详情</h2>
                </div>
                <span className="pill">加载中</span>
              </div>
              <div className="hotspot-skeleton-detail">
                <div className="hotspot-skeleton-line hotspot-skeleton-line-sm" />
                <div className="hotspot-skeleton-line" />
                <div className="hotspot-skeleton-line hotspot-skeleton-line-faded" />
                <div className="hotspot-skeleton-metrics">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <>
          {error ? (
            <section className="panel section news-warning-strip">
              <p className="muted">{error}</p>
            </section>
          ) : null}

          <section className="hotspot-layout">
            <div className="hotspot-board">
              <section className="panel section">
                <div className="news-section-head">
                    <div>
                    <div className="section-kicker">Sector Board</div>
                    <h2>热点板块榜单</h2>
                  </div>
                  <span className="muted">{sortedHotspots.length} 个板块</span>
                </div>

                {sortedHotspots.length ? (
                  <div className="hotspot-board-scroll">
                    <div className="hotspot-board-list">
                      {sortedHotspots.map((item, index) => {
                        const active = item.topic_name === selectedTopic?.topic_name;
                        const linkedStocks = summarizeLinkedStocks(item);
                        return (
                          <Link
                            className={`hotspot-board-item ${active ? "active" : ""}`}
                            href={`/hotspots?topic=${encodeURIComponent(item.topic_name)}#topic-${encodeURIComponent(item.topic_name)}`}
                            key={item.topic_name}
                            id={`topic-${encodeURIComponent(item.topic_name)}`}
                          >
                            <div className="hotspot-board-rank">{String(index + 1).padStart(2, "0")}</div>
                            <div className="hotspot-board-content">
                              <div className="hotspot-board-topline">
                                <div className="hotspot-title-block">
                                  <span className="hotspot-eyebrow">Sector Pulse</span>
                                  <h3>{item.topic_name}</h3>
                                </div>
                                <div className="hotspot-heat-pill">
                                  <span>热度</span>
                                  <strong>{item.heat_score.toFixed(0)}</strong>
                                </div>
                              </div>
                              <p>{truncate(item.ai_summary || item.reason, 120)}</p>
                              <div className="hotspot-meta-row">
                                <span className={`hotspot-trend-pill hotspot-trend-pill-${item.trend_direction}`}>
                                  {trendLabel(item.trend_direction)}
                                </span>
                                <span className="hotspot-stock-count">
                                  代表股 {linkedStocks.visible.length + linkedStocks.extraCount}
                                </span>
                              </div>
                              {linkedStocks.visible.length ? (
                                <div className="hotspot-linked-stocks">
                                  {linkedStocks.visible.map((stock) => (
                                    <span className="hotspot-linked-stock" key={`${item.topic_name}-${stock.stock_code}`}>
                                      {stock.stock_name}
                                    </span>
                                  ))}
                                  {linkedStocks.extraCount ? (
                                    <span className="hotspot-linked-stock hotspot-linked-stock-more">
                                      +{linkedStocks.extraCount}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="muted">暂无热点数据。</p>
                )}
              </section>
            </div>

            <aside className="hotspot-detail-rail">
              <section className={`panel section hotspot-detail-panel ${selectedTopic ? "focus-panel" : ""}`}>
                <div className="news-section-head">
                  <div>
                    <div className="section-kicker">Sector Detail</div>
                    <h2>{selectedTopic?.topic_name ?? "板块详情"}</h2>
                  </div>
                  {selectedTopic ? <span className="pill">热度 {selectedTopic.heat_score.toFixed(0)}</span> : null}
                </div>

                {detailLoading ? (
                  <div className="hotspot-detail-scroll">
                    <p className="muted">加载详情…</p>
                  </div>
                ) : selectedTopic && detail ? (
                  <div className="hotspot-detail-scroll">
                    <div className="stack">
                      <div className="hotspot-detail-summary">
                        <p>{detail.topic.ai_summary || detail.topic.reason}</p>
                      </div>

                      <div className="metric-grid">
                        <div className="hotspot-metric">
                          <span>热度趋势</span>
                          <strong>{trendLabel(detail.topic.trend_direction)}</strong>
                        </div>
                        <div className="hotspot-metric">
                          <span>关联个股</span>
                          <strong>{detail.topic.related_stocks.length}</strong>
                        </div>
                        <div className="hotspot-metric">
                          <span>催化消息</span>
                          <strong>{detail.related_news.length}</strong>
                        </div>
                      </div>

                      <section className="detail-block">
                        <div className="detail-block-head">
                          <h3>板块关联个股</h3>
                          <span className="muted">板块内优先关注的代表标的</span>
                        </div>
                        {detail.topic.related_stocks.length ? (
                          <div className="stock-link-list">
                            {detail.topic.related_stocks.map((stock) => (
                              <div className="stock-link-card" key={`${detail.topic.topic_name}-${stock.stock_code}`}>
                                <div>
                                  <strong>
                                    {stock.stock_name} ({stock.stock_code})
                                  </strong>
                                  <p>{stock.reason}</p>
                                </div>
                                <div className="inline-actions">
                                  <Link href={`/stocks?query=${encodeURIComponent(stock.stock_code)}`} className="button ghost">
                                    查看股票
                                  </Link>
                                  <Link
                                    href={`/portfolio?stock_code=${encodeURIComponent(stock.stock_code)}&stock_name=${encodeURIComponent(
                                      stock.stock_name,
                                    )}&quantity=100&focus=cost&return_to=${encodeURIComponent(
                                      `/hotspots?topic=${encodeURIComponent(detail.topic.topic_name)}#topic-${encodeURIComponent(detail.topic.topic_name)}`,
                                    )}&return_label=${encodeURIComponent("热点详情")}`}
                                    className="button"
                                  >
                                    加入持仓
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="muted">暂无关联股票。</p>
                        )}
                      </section>

                      <section className="detail-block">
                        <div className="detail-block-head">
                          <h3>板块催化消息</h3>
                          <span className="muted">只保留标题、来源、摘要和影响级别</span>
                        </div>
                        {detail.related_news.length ? (
                          <div className="detail-news-list">
                            {detail.related_news.slice(0, 6).map((item) => (
                              <article className="detail-news-item" key={item.id}>
                                <div className="detail-news-meta">
                                  <span>{item.source}</span>
                                  <span>{formatDateLabel(item.published_at)}</span>
                                  <span>影响 {item.impact_level}</span>
                                </div>
                                <h4>{item.title}</h4>
                                <p>{truncate(item.summary, 180)}</p>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="muted">当前没有抓到与该板块直接相关的最新消息。</p>
                        )}
                      </section>

                      <section className="detail-block">
                        <div className="detail-block-head">
                          <h3>板块热度快照</h3>
                          <span className="muted">看板块热度是否持续升温</span>
                        </div>
                        {detail.history.length ? (
                          <div className="history-strip">
                            {detail.history.map((item) => (
                              <div className="history-point" key={item.date}>
                                <strong>{item.score.toFixed(0)}</strong>
                                <span>{item.date}</span>
                                <small>{item.count} 次触发</small>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="muted">暂无可用历史快照。</p>
                        )}
                      </section>
                    </div>
                  </div>
                ) : (
                  <div className="hotspot-detail-scroll">
                    <p className="muted">选择一个板块后，这里会显示板块逻辑、关联个股和催化消息。</p>
                  </div>
                )}
              </section>
            </aside>
          </section>
        </>
      )}
    </>
  );
}

function truncate(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
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

function trendLabel(direction: HotspotItem["trend_direction"]) {
  if (direction === "up") return "升温";
  if (direction === "down") return "降温";
  return "平稳";
}

function summarizeLinkedStocks(item: HotspotItem) {
  const seenNames = new Set<string>();
  const visible = item.related_stocks.filter((stock) => {
    const key = stock.stock_name.trim();
    if (!key || seenNames.has(key)) {
      return false;
    }
    seenNames.add(key);
    return true;
  });
  return {
    visible: visible.slice(0, 3),
    extraCount: Math.max(visible.length - 3, 0),
  };
}
