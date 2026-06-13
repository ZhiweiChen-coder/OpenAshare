"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AICarousel } from "@/components/ai-carousel";
import { CandlestickChart } from "@/components/candlestick-chart";
import { DemoAccessGate } from "@/components/demo-access-gate";
import { SearchForm } from "@/components/search-form";
import { StockAnalysisProgress } from "@/components/stock-analysis-progress";
import { StockPanelLink } from "@/components/stock-panel-link";
import { getStockAnalysis, getStockNews, searchStocksWithOptions, streamStockAnalysis } from "@/lib/api";
import type { NewsItem, StockAnalysisResponse, StockSearchResult } from "@/lib/types";

type StocksPageClientProps = {
  initialQuery?: string;
  initialPanel?: string;
  initialRequestId?: string;
  demoAccessUnlocked: boolean;
};

export function StocksPageClient({
  initialQuery = "",
  initialPanel = "overview",
  initialRequestId = "",
  demoAccessUnlocked,
}: StocksPageClientProps) {
  const activePanel = normalizePanel(initialPanel);
  const query = initialQuery.trim();
  const queryForSearch = useMemo(
    () => (/^[a-z]{2}\d+$/i.test(query) ? query.toLowerCase() : query),
    [query],
  );
  const shouldLoadAi = activePanel === "ai" && demoAccessUnlocked;
  const shouldLoadNews = activePanel === "news";
  const showAiGate = activePanel === "ai" && !demoAccessUnlocked;

  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisIncludesAi, setAnalysisIncludesAi] = useState(false);
  // AI 流式生成：逐字累积的文本与当前处理步骤
  const [aiStreamText, setAiStreamText] = useState("");
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiStreamStage, setAiStreamStage] = useState<{ message: string; pct: number } | null>(null);

  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");
  const [loadedNewsCode, setLoadedNewsCode] = useState("");

  useEffect(() => {
    let cancelled = false;

    setSearchResults([]);
    setAnalysis(null);
    setAnalysisError("");
    setAnalysisIncludesAi(false);
    setNews([]);
    setNewsError("");
    setLoadedNewsCode("");

    if (!queryForSearch) {
      setSearchError("");
      setSearchLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setSearchLoading(true);
    setSearchError("");

    searchStocksWithOptions(queryForSearch, { requestId: initialRequestId })
      .then((results) => {
        if (cancelled) {
          return;
        }
        const normalizedResults = results.length ? results : buildDirectCodeFallback(queryForSearch);
        setSearchResults(normalizedResults);
        setSearchError("");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const normalizedResults = buildDirectCodeFallback(queryForSearch);
        setSearchResults(normalizedResults);
        setSearchError(
          normalizedResults.length
            ? ""
            : error instanceof Error
              ? error.message
              : "搜索结果加载失败",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setSearchLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialRequestId, queryForSearch]);

  const selected = searchResults[0];

  useEffect(() => {
    let cancelled = false;

    if (!selected) {
      setAnalysis(null);
      setAnalysisError("");
      setAnalysisLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const sameStockLoaded = analysis?.stock_code === selected.code;
    const canReuseAnalysis = sameStockLoaded && (!shouldLoadAi || analysisIncludesAi);

    if (canReuseAnalysis) {
      setAnalysisError("");
      setAnalysisLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setAnalysisError("");

    // 两段式加载：先用 include_ai=false 快速拿到行情/指标/K 线渲染出来，
    // 再在后台补充 AI 文本，整个过程图表不会被清空或被进度条接管。
    if (!sameStockLoaded) {
      setAnalysisLoading(true);
      getStockAnalysis(selected.code, { includeAi: false, requestId: initialRequestId })
        .then((base) => {
          if (cancelled) {
            return;
          }
          setAnalysis(base);
          setAnalysisIncludesAi(false);
          // shouldLoadAi 为真时，下一次 effect 重跑会进入下面的 AI 补充分支。
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          setAnalysis(null);
          setAnalysisIncludesAi(false);
          setAnalysisError(error instanceof Error ? error.message : "单股分析生成失败");
        })
        .finally(() => {
          if (!cancelled) {
            setAnalysisLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }

    // 已经有该股票的基础分析，仅缺 AI：流式增量加载，逐字写出报告，保留图表可见。
    const controller = new AbortController();
    setAiStreaming(true);
    setAiStreamText("");
    setAiStreamStage(null);
    streamStockAnalysis(selected.code, {
      signal: controller.signal,
      onStage: (stage) => {
        if (cancelled) return;
        if (stage.message) {
          setAiStreamStage({ message: stage.message, pct: stage.progress_pct });
        }
      },
      onToken: (delta) => {
        if (cancelled) return;
        setAiStreamText((prev) => prev + delta);
      },
      onResult: (payload) => {
        if (cancelled) return;
        setAnalysis(payload);
        setAnalysisIncludesAi(true);
      },
      onError: (message) => {
        if (cancelled) return;
        setAnalysisError(message || "AI 分析生成失败");
      },
    })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) return;
        // AI 补充失败时保留已显示的基础分析，仅提示 AI 部分出错。
        setAnalysisError(error instanceof Error ? error.message : "AI 分析生成失败");
      })
      .finally(() => {
        if (cancelled) return;
        setAiStreaming(false);
        setAiStreamStage(null);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [analysis?.stock_code, analysisIncludesAi, initialRequestId, selected, shouldLoadAi]);

  useEffect(() => {
    let cancelled = false;

    if (!selected || !shouldLoadNews) {
      setNews([]);
      setNewsError("");
      setNewsLoading(false);
      setLoadedNewsCode("");
      return () => {
        cancelled = true;
      };
    }

    if (loadedNewsCode === selected.code) {
      setNewsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setNewsLoading(true);
    setNewsError("");

    getStockNews(selected.code)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setNews(result);
        setLoadedNewsCode(selected.code);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setNews([]);
        setLoadedNewsCode("");
        setNewsError(error instanceof Error ? error.message : "相关新闻加载失败");
      })
      .finally(() => {
        if (!cancelled) {
          setNewsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadedNewsCode, selected, shouldLoadNews]);

  return (
    <div className="stocks-page">
      <section className="panel section">
        <h1>单股分析</h1>
        <p className="muted">围绕一只股票集中展示技术指标、AI 观点和相关新闻，帮你快速判断是否值得出手或继续持有。</p>
        <SearchForm initialValue={initialQuery} />
      </section>

      <section className="content-grid">
        <div className="panel section">
          <h2>搜索结果</h2>
          {searchLoading ? (
            <p className="muted">正在识别股票并整理匹配结果...</p>
          ) : searchResults.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>股票</th>
                  <th>市场</th>
                  <th>分类</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((item) => (
                  <tr key={item.code}>
                    <td data-label="股票">
                      <Link prefetch={false} href={`/stocks?query=${encodeURIComponent(item.code)}`}>
                        {item.name} ({item.code})
                      </Link>
                    </td>
                    <td data-label="市场">{item.market}</td>
                    <td data-label="分类">{item.category || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">{searchError || "输入关键词后，这里会显示匹配股票。"}</p>
          )}
        </div>

        <div className="panel section">
          <h2>选中股票</h2>
          {selected ? (
            <>
              <div className="pill">{selected.market}</div>
              <h3 style={{ marginTop: 12 }}>
                {selected.name} ({selected.code})
              </h3>
              <p className="muted">匹配方式：{formatMatchType(selected.match_type)}</p>
            </>
          ) : (
            <p className="muted">还没有选中股票。</p>
          )}
        </div>
      </section>

      {selected && (analysisLoading || (shouldLoadNews && newsLoading)) ? (
        <StockAnalysisProgress query={selected.code} requestId={initialRequestId} panel={activePanel} />
      ) : null}

      {selected && !analysis && !analysisLoading ? (
        <section className="panel section news-warning-strip">
          <h2>分析状态</h2>
          <p className="muted">
            {selected.name} ({selected.code}) 的单股分析暂时没有成功返回。
          </p>
          <p className="muted">
            {analysisError || "后端正在处理或分析服务暂时不可用。请检查 API、模型网络连接和日志后重试。"}
          </p>
        </section>
      ) : null}

      {analysis ? (
        <>
          <section className="stocks-focus-bar" aria-label="当前股票快捷概览">
            <div className="stocks-focus-main">
              <span className="stocks-focus-market">{analysis.market || selected.market}</span>
              <strong>{analysis.stock_name} ({analysis.stock_code})</strong>
              <span className="muted">信号 {analysis.signal_summary.overall_signal} · 评分 {analysis.signal_summary.overall_score}/5</span>
            </div>
            <div className="stocks-focus-metrics">
              <span>
                现价 <strong>{analysis.quote.current_price.toFixed(2)}</strong>
              </span>
              <span
                className={`stocks-focus-change ${analysis.quote.change_pct >= 0 ? "signal-up" : "signal-down"}`}
              >
                {analysis.quote.change_pct >= 0 ? "+" : ""}
                {analysis.quote.change_pct.toFixed(2)}%
              </span>
            </div>
            <div className="stocks-focus-actions">
              <Link href={`/stocks?query=${encodeURIComponent(selected.code)}&panel=chart#chart`} prefetch={false}>K线</Link>
              <StockPanelLink stockCode={selected.code} panel="ai">AI</StockPanelLink>
              <StockPanelLink stockCode={selected.code} panel="news">新闻</StockPanelLink>
              <Link href={`/portfolio?stock_code=${encodeURIComponent(analysis.stock_code)}&stock_name=${encodeURIComponent(analysis.stock_name)}&cost_price=${encodeURIComponent(String(analysis.quote.current_price))}&status=planned&return_to=${encodeURIComponent(`/stocks?query=${analysis.stock_code}`)}&return_label=${encodeURIComponent("单股分析")}`} className="button ghost">
                加计划
              </Link>
            </div>
          </section>

          <section className={`panel section ${activePanel === "overview" ? "focus-panel" : ""}`} id="overview">
            <div className="news-section-head">
              <div>
                <div className="section-kicker">Technical Context</div>
                <h2>技术环境</h2>
              </div>
              <span className="muted">减少重复价格信息，优先看关键指标。</span>
            </div>
            <div className="metric-grid">
              {buildOverviewIndicators(analysis.technical_indicators).map(([key, value]) => (
                <div className="card" key={key}>
                  <div className="muted">{formatIndicatorLabel(key)}</div>
                  <strong>{value === null ? "-" : value.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="content-grid">
            <div className={`panel section ${activePanel === "chart" ? "focus-panel" : ""}`} id="chart">
              <h2>K 线图</h2>
              <CandlestickChart data={analysis.chart_series} height={activePanel === "chart" ? 420 : 280} symbol={`${analysis.stock_name} ${analysis.stock_code}`} />
              <p className="muted">展示最近行情的日 K 线，支持自适应宽度；配合上方价格与涨跌幅做节奏判断。</p>
              <div style={{ marginTop: 18 }}>
                <h3 style={{ marginBottom: 12 }}>技术分析建议</h3>
                <div className="news-grid stocks-tech-grid">
                  {analysis.technical_commentary.map((item) => (
                    <div className="card stocks-tech-card" key={item}>
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel section" id="indicators">
              <h2>指标快照</h2>
              <div className="metric-grid">
                {Object.entries(analysis.technical_indicators).map(([key, value]) => (
                  <div className="card" key={key}>
                    <div className="muted">{key}</div>
                    <strong>{value === null ? "-" : value.toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className={`panel section stocks-ai-panel ${activePanel === "ai" ? "focus-panel" : ""}`} id="ai">
              <h2>AI 分析</h2>
              {showAiGate ? (
                <DemoAccessGate
                  title="AI 分析已锁定"
                  description="解锁后可以查看更长的 AI 观点、结论和操作建议。"
                />
              ) : shouldLoadAi && aiStreaming && !aiStreamText ? (
                <div className="ai-thinking" aria-live="polite" aria-busy="true">
                  <span className="ai-thinking-orb" aria-hidden="true" />
                  <div className="ai-thinking-copy">
                    <strong className="ai-thinking-title">
                      AI 正在思考
                      <span className="ai-thinking-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    </strong>
                    <span className="ai-thinking-step">
                      {aiStreamStage?.message || "正在准备分析上下文"}
                      {aiStreamStage ? ` · ${aiStreamStage.pct}%` : ""}
                    </span>
                  </div>
                  <span className="ai-thinking-shimmer" aria-hidden="true" />
                </div>
              ) : shouldLoadAi && aiStreaming ? (
                <>
                  <div className="ai-stream-status" aria-live="polite">
                    <span className="ai-stream-dot" aria-hidden="true" />
                    <span className="ai-stream-message">
                      {aiStreamStage?.message || "AI 正在逐字生成报告…"}
                    </span>
                    {aiStreamStage ? <span className="ai-stream-pct">{aiStreamStage.pct}%</span> : null}
                  </div>
                  <AICarousel
                    content={aiStreamText}
                    stockName={analysis.stock_name || selected.name}
                    stockCode={analysis.stock_code || selected.code}
                  />
                </>
              ) : shouldLoadAi && analysis.ai_insight.enabled ? (
                <AICarousel
                  content={analysis.ai_insight.content || analysis.ai_insight.error || ""}
                  stockName={analysis.stock_name}
                  stockCode={analysis.stock_code}
                  provider={analysis.ai_insight.provider}
                  model={analysis.ai_insight.model}
                />
              ) : shouldLoadAi ? (
                <p className="muted">当前未配置 LLM API，已保留纯技术分析链路。</p>
              ) : (
                <div className="card">
                  <StockPanelLink stockCode={selected.code} panel="ai">打开 AI 分析</StockPanelLink>
                </div>
              )}
          </section>

          <section className={`panel section ${activePanel === "news" ? "focus-panel" : ""}`} id="news">
            <h2>相关新闻</h2>
            {!shouldLoadNews ? (
              <div className="card">
                <StockPanelLink stockCode={selected.code} panel="news">打开相关新闻</StockPanelLink>
              </div>
            ) : null}
            {shouldLoadNews && newsError ? <p className="muted">新闻加载部分失败：{newsError}</p> : null}
            <div className="news-grid">
              {shouldLoadNews && news.length ? (
                news.map((item) => (
                  <div className="card" key={item.id}>
                    <div className="pill">{item.source}</div>
                    <h3 style={{ marginTop: 12 }}>{item.title}</h3>
                    <p className="muted">{item.summary}</p>
                    <p className="muted">
                      {item.published_at} · 影响等级 {item.impact_level} · {formatSentiment(item.sentiment)}
                    </p>
                  </div>
                ))
              ) : shouldLoadNews && !newsLoading ? (
                <div className="card">
                  <p className="muted">当前暂无相关新闻。</p>
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function buildDirectCodeFallback(query: string): StockSearchResult[] {
  const trimmed = query.trim();
  // A股 sh/sz 数字代码
  if (/^[a-z]{2}\d{6}$/i.test(trimmed)) {
    const code = trimmed.toLowerCase();
    return [
      {
        name: `代码 ${code}`,
        code,
        market: code.startsWith("sh") ? "A股-上海" : "A股-深圳",
        category: "",
        score: 50,
        match_type: "direct_code",
      },
    ];
  }
  // 美股 ticker（纯字母，可带类别后缀，如 AAPL、BRK.B）
  if (/^[a-z]{1,5}(\.[a-z]{1,2})?$/i.test(trimmed)) {
    const code = `US.${trimmed.toUpperCase()}`;
    return [
      {
        name: `代码 ${code}`,
        code,
        market: "美股",
        category: "",
        score: 50,
        match_type: "direct_code",
      },
    ];
  }
  return [];
}

function normalizePanel(value?: string | null) {
  if (value === "ai" || value === "news" || value === "chart") {
    return value;
  }
  return "overview";
}

function formatMatchType(value?: string | null) {
  if (!value) return "搜索推荐";
  if (value === "exact_code" || value === "direct_code") return "代码精确匹配";
  if (value === "fuzzy_name" || value === "fuzzy") return "名称模糊匹配";
  if (value === "alias") return "别名匹配";
  return "搜索推荐";
}

function formatSentiment(value: NewsItem["sentiment"]) {
  if (value === "bullish") return "偏利多";
  if (value === "bearish") return "偏利空";
  return "中性";
}

function buildOverviewIndicators(indicators: StockAnalysisResponse["technical_indicators"]) {
  const preferredKeys = ["MA5", "MA20", "MA60", "RSI", "MACD"];
  const preferred = preferredKeys
    .filter((key) => Object.prototype.hasOwnProperty.call(indicators, key))
    .map((key) => [key, indicators[key]] as [string, number | null]);
  const fallback = Object.entries(indicators).filter(([key]) => !preferredKeys.includes(key));
  return [...preferred, ...fallback].slice(0, 4);
}

function formatIndicatorLabel(key: string) {
  const labels: Record<string, string> = {
    MA5: "MA5",
    MA20: "MA20",
    MA60: "MA60",
    RSI: "RSI",
    MACD: "MACD",
  };
  return labels[key] ?? key;
}
