"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MarketRegimeBanner } from "@/components/market-regime-banner";
import { getCanSlimScreen, getHotspotDetail, getHotspots, getMarketRegime } from "@/lib/api";
import type { HotspotDetailResponse, HotspotItem, MarketRegimeResponse, StrategyCandidate, StrategyScreenResponse } from "@/lib/types";

export function HotspotsPageClient() {
  const searchParams = useSearchParams();
  const topicParam = searchParams.get("topic") ?? "";
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [detail, setDetail] = useState<HotspotDetailResponse | null>(null);
  const [detailTopicName, setDetailTopicName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [screenScope, setScreenScope] = useState<"hotspot" | "market">("hotspot");
  const [screening, setScreening] = useState<StrategyScreenResponse | null>(null);
  const [screeningTopicName, setScreeningTopicName] = useState<string | null>(null);
  const [screeningScopeLoaded, setScreeningScopeLoaded] = useState<"hotspot" | "market" | null>(null);
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [activeCandidateKey, setActiveCandidateKey] = useState<string | null>(null);
  const [marketRegime, setMarketRegime] = useState<MarketRegimeResponse | null>(null);
  const [marketRegimeLoading, setMarketRegimeLoading] = useState(true);
  const [marketRegimeError, setMarketRegimeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const detailRequestRef = useRef(0);
  const screeningRequestRef = useRef(0);
  const screeningCarouselRef = useRef<HTMLDivElement | null>(null);

  const sortedHotspots = [...hotspots].sort((a, b) => {
    if (a.topic_name === topicParam) return -1;
    if (b.topic_name === topicParam) return 1;
    return b.heat_score - a.heat_score;
  });
  const selectedTopic = sortedHotspots.find((i) => i.topic_name === topicParam) ?? sortedHotspots[0] ?? null;

  const loadHotspots = useCallback(() => {
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
    const requestId = ++detailRequestRef.current;
    setDetailLoading(true);
    getHotspotDetail(topicName)
      .then((nextDetail) => {
        if (requestId !== detailRequestRef.current) {
          return;
        }
        setDetail(nextDetail);
        setDetailTopicName(nextDetail.topic.topic_name);
      })
      .catch(() => {
        if (requestId !== detailRequestRef.current) {
          return;
        }
        setDetail(null);
        setDetailTopicName(null);
      })
      .finally(() => {
        if (requestId === detailRequestRef.current) {
          setDetailLoading(false);
        }
      });
  }, []);

  const loadScreening = useCallback((scope: "hotspot" | "market", topicName?: string) => {
    const requestId = ++screeningRequestRef.current;
    setScreeningLoading(true);
    getCanSlimScreen({ scope, topic: topicName, limit: scope === "hotspot" ? 6 : 10 })
      .then((nextScreening) => {
        if (requestId !== screeningRequestRef.current) {
          return;
        }
        setScreening(nextScreening);
        setScreeningScopeLoaded(scope);
        setScreeningTopicName(topicName ?? null);
      })
      .catch(() => {
        if (requestId !== screeningRequestRef.current) {
          return;
        }
        setScreening(null);
        setScreeningScopeLoaded(null);
        setScreeningTopicName(null);
      })
      .finally(() => {
        if (requestId === screeningRequestRef.current) {
          setScreeningLoading(false);
        }
      });
  }, []);

  const loadMarketRegime = useCallback(() => {
    setMarketRegimeLoading(true);
    setMarketRegimeError(null);
    getMarketRegime()
      .then(setMarketRegime)
      .catch((err) => {
        setMarketRegime(null);
        setMarketRegimeError(err instanceof Error ? `市场状态暂时不可用：${err.message}` : "市场状态暂时不可用");
      })
      .finally(() => setMarketRegimeLoading(false));
  }, []);

  useEffect(() => loadHotspots(), [loadHotspots]);
  useEffect(() => loadMarketRegime(), [loadMarketRegime]);

  useEffect(() => {
    if (!selectedTopic) {
      setDetail(null);
      return;
    }
    loadDetail(selectedTopic.topic_name);
  }, [selectedTopic?.topic_name, loadDetail]);

  useEffect(() => {
    if (screenScope === "hotspot" && selectedTopic?.topic_name) {
      loadScreening("hotspot", selectedTopic.topic_name);
      return;
    }
    if (screenScope === "market") {
      loadScreening("market");
    }
  }, [loadScreening, screenScope, selectedTopic?.topic_name]);

  const refreshPage = useCallback(() => {
    setManualRefreshing(true);
    const cleanup = loadHotspots();
    loadMarketRegime();
    if (selectedTopic) {
      loadDetail(selectedTopic.topic_name);
    }
    if (screenScope === "hotspot" && selectedTopic) {
      loadScreening("hotspot", selectedTopic.topic_name);
    } else if (screenScope === "market") {
      loadScreening("market");
    }
    window.setTimeout(() => {
      cleanup();
      setManualRefreshing(false);
    }, 400);
  }, [loadDetail, loadHotspots, loadMarketRegime, loadScreening, screenScope, selectedTopic]);

  const isDetailReady = Boolean(selectedTopic && detail && detailTopicName === selectedTopic.topic_name);
  const isScreeningReady = Boolean(
    screening &&
      screeningScopeLoaded === screenScope &&
      (screenScope === "market" || screeningTopicName === selectedTopic?.topic_name),
  );
  const currentDetail = isDetailReady ? detail : null;
  const currentScreening = isScreeningReady ? screening : null;
  const screenCandidates = currentScreening?.candidates ?? [];
  const activeCandidate =
    screenCandidates.find((candidate) => candidateKey(candidate) === activeCandidateKey) ?? screenCandidates[0] ?? null;

  useEffect(() => {
    if (!screenCandidates.length) {
      setActiveCandidateKey(null);
      return;
    }
    if (!activeCandidateKey || !screenCandidates.some((candidate) => candidateKey(candidate) === activeCandidateKey)) {
      setActiveCandidateKey(candidateKey(screenCandidates[0]));
    }
  }, [activeCandidateKey, screenCandidates]);

  const scrollScreeningCarousel = useCallback((direction: "prev" | "next") => {
    const node = screeningCarouselRef.current;
    if (!node) {
      return;
    }
    node.scrollBy({
      left: direction === "next" ? node.clientWidth * 0.82 : -node.clientWidth * 0.82,
      behavior: "smooth",
    });
  }, []);

  return (
    <>
      <section className="panel section news-hero">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button className="button ghost" type="button" onClick={refreshPage} disabled={manualRefreshing}>
            {manualRefreshing ? "刷新中..." : "手动刷新"}
          </button>
        </div>
        <div className="section-kicker">Sector Radar</div>
        <h1>热点板块</h1>
        <p className="muted">
          从板块视角梳理当前市场最热的交易方向，结合代表个股、催化消息和热度变化，帮你快速锁定值得跟踪的主题。
        </p>
      </section>

      <MarketRegimeBanner
        marketRegime={marketRegime}
        compact
        isLoading={marketRegimeLoading}
        error={marketRegimeError}
      />

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
              <span className="muted">{loading ? "加载中…" : `${sortedHotspots.length} 个板块`}</span>
            </div>

            {loading && !sortedHotspots.length ? (
              <div className="hotspot-skeleton-list" aria-hidden="true">
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
            ) : sortedHotspots.length ? (
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
                            {marketRegime ? (
                              <span className="hotspot-stock-count">
                                {marketRegime.regime === "risk_on" ? "允许交易" : marketRegime.regime === "neutral" ? "轻仓试错" : "优先观察"}
                              </span>
                            ) : null}
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
              {selectedTopic ? (
                <span className="pill">{detailLoading && isDetailReady ? "更新中" : `热度 ${selectedTopic.heat_score.toFixed(0)}`}</span>
              ) : null}
            </div>

            {selectedTopic && currentDetail ? (
              <div className="hotspot-detail-scroll">
                {detailLoading ? <p className="muted">详情更新中，先展示上一版内容…</p> : null}
                <div className="stack">
                  <div className="hotspot-detail-summary">
                    <p>{currentDetail.topic.ai_summary || currentDetail.topic.reason}</p>
                  </div>

                  <div className="metric-grid">
                    <div className="hotspot-metric">
                      <span>热度趋势</span>
                      <strong>{trendLabel(currentDetail.topic.trend_direction)}</strong>
                    </div>
                    <div className="hotspot-metric">
                      <span>关联个股</span>
                      <strong>{currentDetail.topic.related_stocks.length}</strong>
                    </div>
                    <div className="hotspot-metric">
                      <span>催化消息</span>
                      <strong>{currentDetail.related_news.length}</strong>
                    </div>
                  </div>

                  <section className="detail-block">
                    <div className="detail-block-head">
                      <h3>板块关联个股</h3>
                      <span className="muted">板块内优先关注的代表标的</span>
                    </div>
                    {currentDetail.topic.related_stocks.length ? (
                      <div className="stock-link-list">
                        {currentDetail.topic.related_stocks.map((stock) => (
                          <div className="stock-link-card" key={`${currentDetail.topic.topic_name}-${stock.stock_code}`}>
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
                                )}&quantity=100&cost_price=0&status=watching&focus=cost&return_to=${encodeURIComponent(
                                  `/hotspots?topic=${encodeURIComponent(currentDetail.topic.topic_name)}#topic-${encodeURIComponent(currentDetail.topic.topic_name)}`,
                                )}&return_label=${encodeURIComponent("热点详情")}&source_topic=${encodeURIComponent(currentDetail.topic.topic_name)}&plan_reason=${encodeURIComponent(`来自${currentDetail.topic.topic_name}主题的代表股，先生成观察计划后再决定是否买入。`)}`}
                                className="button"
                              >
                                生成观察计划
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
                      <div>
                        <h3>CAN SLIM 选股</h3>
                        <span className="muted">默认先看热点内筛选，再切到全市场候选。</span>
                      </div>
                      <div className="inline-actions">
                        <button
                          className={`button ${screenScope === "hotspot" ? "" : "ghost"}`}
                          type="button"
                          onClick={() => setScreenScope("hotspot")}
                        >
                          热点内筛选
                        </button>
                        <button
                          className={`button ${screenScope === "market" ? "" : "ghost"}`}
                          type="button"
                          onClick={() => setScreenScope("market")}
                        >
                          全市场筛选
                        </button>
                      </div>
                    </div>
                    {screenCandidates.length ? (
                      <div className="strategy-carousel-shell">
                        <div className="strategy-carousel-toolbar">
                          <div className="strategy-carousel-copy">
                            <strong>{screenScope === "hotspot" ? "热点内候选" : "全市场候选"}</strong>
                            <span>{screenCandidates.length} 只，点击卡片切换详情</span>
                          </div>
                          <div className="inline-actions strategy-carousel-nav">
                            <button className="button ghost" type="button" onClick={() => scrollScreeningCarousel("prev")}>
                              上一组
                            </button>
                            <button className="button ghost" type="button" onClick={() => scrollScreeningCarousel("next")}>
                              下一组
                            </button>
                          </div>
                        </div>
                        <div className="strategy-candidate-carousel" ref={screeningCarouselRef}>
                          {screenCandidates.map((candidate) => {
                            const active = activeCandidate ? candidateKey(candidate) === candidateKey(activeCandidate) : false;
                            return (
                              <button
                                className={`strategy-candidate-slide ${active ? "active" : ""}`}
                                key={candidateKey(candidate)}
                                type="button"
                                onClick={() => setActiveCandidateKey(candidateKey(candidate))}
                              >
                                <span className="strategy-slide-rank">{candidate.score.total.toFixed(1)}</span>
                                <strong>
                                  {candidate.stock_name} ({candidate.stock_code})
                                </strong>
                                <span className="strategy-slide-meta">
                                  {candidate.source_scope === "hotspot" ? candidate.source_topic ?? "热点主题" : "全市场"}
                                </span>
                                <span className="strategy-slide-score-row">
                                  C {candidate.score.c.toFixed(0)} / A {candidate.score.a.toFixed(0)} / N {candidate.score.n.toFixed(0)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {activeCandidate ? (
                          <div className="strategy-candidate-detail">
                            <div className="strategy-detail-head">
                              <div>
                                <span className="section-kicker">CAN SLIM Focus</span>
                                <h3>
                                  {activeCandidate.stock_name} ({activeCandidate.stock_code})
                                </h3>
                              </div>
                              <span className="pill">总分 {activeCandidate.score.total.toFixed(1)}</span>
                            </div>
                            <div className="tag-list">
                              <span className="tag">C {activeCandidate.score.c.toFixed(0)}</span>
                              <span className="tag">A {activeCandidate.score.a.toFixed(0)}</span>
                              <span className="tag">N {activeCandidate.score.n.toFixed(0)}</span>
                              <span className="tag">S {activeCandidate.score.s.toFixed(0)}</span>
                              <span className="tag">L {activeCandidate.score.l.toFixed(0)}</span>
                              <span className="tag">I {activeCandidate.score.i.toFixed(0)}</span>
                              <span className="tag">M {activeCandidate.score.m.toFixed(0)}</span>
                            </div>
                            <div className="strategy-factor-grid">
                              {Object.entries(activeCandidate.factor_notes).map(([key, note]) => (
                                <div className="strategy-factor-card" key={`${activeCandidate.stock_code}-${key}`}>
                                  <strong>{key.toUpperCase()}</strong>
                                  <p>{note}</p>
                                </div>
                              ))}
                            </div>
                            {activeCandidate.reasons.length ? (
                              <div className="stack" style={{ gap: 6 }}>
                                {activeCandidate.reasons.map((reason) => (
                                  <p className="muted" key={`${activeCandidate.stock_code}-${reason}`}>
                                    {reason}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                            {activeCandidate.risks.length ? (
                              <div className="tag-list">
                                {activeCandidate.risks.map((risk) => (
                                  <span className="tag" key={`${activeCandidate.stock_code}-${risk}`}>
                                    风险: {risk}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            <div className="strategy-plan-card">
                              <div className="detail-block-head">
                                <h3>交易计划草案</h3>
                                <span className="muted">
                                  {marketRegime?.regime === "risk_on" ? "可按计划试仓" : marketRegime?.regime === "neutral" ? "只建议轻仓试错" : "优先加入观察"}
                                </span>
                              </div>
                              {renderPlanDraft(activeCandidate, currentDetail.topic.topic_name, marketRegime)}
                            </div>
                            <div className="inline-actions">
                              <Link href={`/stocks?query=${encodeURIComponent(activeCandidate.stock_code)}`} className="button ghost">
                                查看股票
                              </Link>
                              <Link
                                href={buildTradePlanHref(activeCandidate, currentDetail.topic.topic_name, marketRegime)}
                                className="button"
                              >
                                {marketRegime?.regime === "risk_off" ? "生成观察计划" : "生成交易计划"}
                              </Link>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : screeningLoading ? (
                      <p className="muted">正在计算 CAN SLIM 候选，结果会单独补上…</p>
                    ) : (
                      <p className="muted">当前没有可用的策略候选结果。</p>
                    )}
                  </section>

                  <section className="detail-block">
                    <div className="detail-block-head">
                      <h3>板块催化消息</h3>
                      <span className="muted">只保留标题、来源、摘要和影响级别</span>
                    </div>
                    {currentDetail.related_news.length ? (
                      <div className="detail-news-list">
                        {currentDetail.related_news.slice(0, 6).map((item) => (
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
                    {currentDetail.history.length ? (
                      <div className="history-strip">
                        {currentDetail.history.map((item) => (
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
            ) : loading ? (
              <div className="hotspot-detail-scroll">
                <div className="hotspot-skeleton-detail" aria-hidden="true">
                  <div className="hotspot-skeleton-line hotspot-skeleton-line-sm" />
                  <div className="hotspot-skeleton-line" />
                  <div className="hotspot-skeleton-line hotspot-skeleton-line-faded" />
                  <div className="hotspot-skeleton-metrics">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
                <p className="muted">热点榜单加载后，这里会继续补上板块详情与候选结果。</p>
              </div>
            ) : detailLoading ? (
              <div className="hotspot-detail-scroll">
                <p className="muted">加载详情…</p>
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

function candidateKey(candidate: StrategyCandidate) {
  return `${candidate.source_scope}-${candidate.source_topic ?? "market"}-${candidate.stock_code}`;
}

function renderPlanDraft(
  candidate: StrategyCandidate,
  topicName?: string,
  marketRegime?: MarketRegimeResponse | null,
) {
  const plan = buildTradePlan(candidate, topicName, marketRegime);
  return (
    <>
      <div className="tag-list">
        <span className="tag">入场 {plan.entryTrigger}</span>
        <span className="tag">买点 {plan.entryZone}</span>
        <span className="tag">止损 {plan.stopLoss.toFixed(2)}</span>
        <span className="tag">目标 {plan.takeProfit.toFixed(2)}</span>
        <span className="tag">仓位 {plan.maxPositionPct.toFixed(1)}%</span>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>{plan.reason}</p>
    </>
  );
}

function buildTradePlanHref(
  candidate: StrategyCandidate,
  topicName?: string,
  marketRegime?: MarketRegimeResponse | null,
) {
  const plan = buildTradePlan(candidate, topicName, marketRegime);
  const returnTo = topicName
    ? `/hotspots?topic=${encodeURIComponent(topicName)}#topic-${encodeURIComponent(topicName)}`
    : "/hotspots";
  const params = new URLSearchParams({
    mode: "strategy",
    strategy_key: candidate.strategy_key,
    stock_code: candidate.stock_code,
    stock_name: candidate.stock_name,
    cost_price: plan.referencePrice.toFixed(2),
    quantity: "100",
    status: marketRegime?.regime === "risk_off" ? "watching" : "planned",
    return_to: returnTo,
    return_label: "热点策略页",
    source_topic: topicName ?? "",
    plan_reason: plan.reason,
    plan_entry_trigger: plan.entryTrigger,
    plan_entry_zone: plan.entryZone,
    plan_stop_loss: plan.stopLoss.toFixed(2),
    plan_take_profit: plan.takeProfit.toFixed(2),
    plan_max_position_pct: plan.maxPositionPct.toFixed(1),
  });
  return `/portfolio?${params.toString()}`;
}

function buildTradePlan(
  candidate: StrategyCandidate,
  topicName?: string,
  marketRegime?: MarketRegimeResponse | null,
) {
  const currentPrice = Number(candidate.metadata.current_price ?? 0) || 0;
  const entryTrigger = candidate.score.n >= 84 ? "放量突破跟随" : "回踩关键均线再确认";
  const entryZone = currentPrice > 0
    ? `${(currentPrice * 0.99).toFixed(2)}-${(currentPrice * 1.02).toFixed(2)}`
    : "等待确认";
  const stopLoss = currentPrice > 0 ? currentPrice * 0.92 : 0;
  const takeProfit = currentPrice > 0 ? currentPrice * 1.15 : 0;
  const maxPositionPct = marketRegime?.regime === "risk_on" ? 15 : marketRegime?.regime === "neutral" ? 10 : 5;
  const reason = [
    topicName ? `主题 ${topicName} 仍在活跃区间` : null,
    candidate.reasons[0] ?? "个股评分与题材逻辑同步共振",
    marketRegime?.action_bias ?? null,
  ].filter(Boolean).join("；");

  return {
    entryTrigger,
    entryZone,
    stopLoss,
    takeProfit,
    maxPositionPct,
    reason,
    referencePrice: currentPrice,
  };
}
