"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AICarousel } from "@/components/ai-carousel";
import { CandlestickChart } from "@/components/candlestick-chart";
import { DemoAccessGate } from "@/components/demo-access-gate";
import { SearchForm } from "@/components/search-form";
import { StockAnalysisProgress } from "@/components/stock-analysis-progress";
import { StockPanelLink } from "@/components/stock-panel-link";
import { getStockAnalysis, getStockNews, searchStocksWithOptions } from "@/lib/api";
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

    setAnalysisLoading(true);
    setAnalysisError("");

    getStockAnalysis(selected.code, { includeAi: shouldLoadAi, requestId: initialRequestId })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setAnalysis(result);
        setAnalysisIncludesAi(shouldLoadAi);
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
    <>
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
                  <th>评分</th>
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
                    <td data-label="评分">{item.score}</td>
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
              <p className="muted">
                匹配方式：{formatMatchType(selected.match_type)}，搜索评分 {selected.score}
              </p>
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
          <section className={`panel section ${activePanel === "overview" ? "focus-panel" : ""}`} id="overview">
            <div className="metric-grid">
              <div className="card">
                <div className="muted">最新价</div>
                <strong>{analysis.quote.current_price.toFixed(2)}</strong>
              </div>
              <div className="card">
                <div className="muted">涨跌幅</div>
                <strong className={analysis.quote.change_pct >= 0 ? "signal-up" : "signal-down"}>
                  {analysis.quote.change_pct.toFixed(2)}%
                </strong>
              </div>
              <div className="card">
                <div className="muted">综合信号</div>
                <strong>{analysis.signal_summary.overall_signal}</strong>
              </div>
              <div className="card">
                <div className="muted">评分</div>
                <strong>{analysis.signal_summary.overall_score}/5</strong>
              </div>
            </div>
          </section>

          <section className="content-grid">
            <div className="panel section" id="chart">
              <h2>K 线缩略</h2>
              <CandlestickChart data={analysis.chart_series} height={280} symbol={`${analysis.stock_name} ${analysis.stock_code}`} />
              <p className="muted">使用轻量级蜡烛图组件展示最近行情，支持自适应宽度。</p>
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
              ) : shouldLoadAi && analysis.ai_insight.enabled ? (
                <AICarousel content={analysis.ai_insight.content || analysis.ai_insight.error || ""} />
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
    </>
  );
}

function buildDirectCodeFallback(query: string): StockSearchResult[] {
  if (!/^[a-z]{2}\d{6}$/i.test(query)) {
    return [];
  }
  const code = query.toLowerCase();
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

function normalizePanel(value?: string | null) {
  if (value === "ai" || value === "news") {
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
