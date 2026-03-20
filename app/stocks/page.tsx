"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CandlestickChart } from "@/components/candlestick-chart";
import { AICarousel } from "@/components/ai-carousel";
import { SearchForm } from "@/components/search-form";
import { getStockNews, searchStocks, streamStockAnalysis } from "@/lib/api";
import type { NewsItem, StockAnalysisProgressEvent, StockAnalysisResponse, StockSearchResult } from "@/lib/types";

export default function StocksPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [analysisError, setAnalysisError] = useState("");
  const [newsError, setNewsError] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [progressLabel, setProgressLabel] = useState("等待分析请求");
  const [progressPct, setProgressPct] = useState(0);

  useEffect(() => {
    setQuery(searchParams.get("query") ?? "");
    setPanel(searchParams.get("panel") ?? "");
  }, [searchParams]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      setAnalysis(null);
      setNews([]);
      setAnalysisStatus("idle");
      setAnalysisError("");
      setNewsError("");
      return;
    }

    let cancelled = false;
    setAnalysisStatus("loading");
    setProgressLabel("正在识别股票目标");
    setProgressPct(0);
    setAnalysis(null);
    setNews([]);
    setAnalysisError("");
    setNewsError("");

    searchStocks(q)
      .then((results) => {
        if (cancelled) return;
        let nextResults = results;
        if (!nextResults.length && /^[a-z]{2}\d{6}$/i.test(q)) {
          const code = q.toLowerCase();
          nextResults = [
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
        setSearchResults(nextResults);
        const selected = nextResults[0];
        if (!selected) {
          setAnalysisStatus("error");
          setAnalysisError("未找到匹配股票。");
          return;
        }

        const controller = new AbortController();
        streamStockAnalysis(
          selected.code,
          { includeAi: true, signal: controller.signal },
          {
            onStart: (event: StockAnalysisProgressEvent) => {
              if (cancelled) return;
              setProgressLabel(event.message || "已接收分析请求");
              setProgressPct(event.progress_pct ?? 0);
            },
            onProgress: (event: StockAnalysisProgressEvent) => {
              if (cancelled) return;
              setProgressLabel(event.message || "正在分析");
              setProgressPct(event.progress_pct ?? 0);
            },
            onResult: (event: StockAnalysisProgressEvent) => {
              if (cancelled || !event.payload) return;
              setAnalysis(event.payload);
              setAnalysisStatus("ok");
              setProgressLabel(event.message || "分析结果已生成");
              setProgressPct(event.progress_pct ?? 100);
            },
            onError: (event: StockAnalysisProgressEvent) => {
              if (cancelled) return;
              setAnalysisStatus("error");
              setAnalysisError(event.message || "单股分析生成失败");
            },
          },
        ).catch((error) => {
          if (cancelled) return;
          setAnalysisStatus("error");
          setAnalysisError(error instanceof Error ? error.message : "单股分析生成失败");
        });

        getStockNews(selected.code)
          .then((items) => {
            if (!cancelled) setNews(items);
          })
          .catch((error) => {
            if (!cancelled) {
              setNewsError(error instanceof Error ? error.message : "相关新闻加载失败");
            }
          });

        return () => controller.abort();
      })
      .catch((error) => {
        if (cancelled) return;
        setAnalysisStatus("error");
        setAnalysisError(error instanceof Error ? error.message : "股票搜索失败");
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  const selected = searchResults[0] ?? null;
  const showProgress = analysisStatus === "loading";
  const indicatorEntries = useMemo(() => Object.entries(analysis?.technical_indicators ?? {}), [analysis]);

  return (
    <>
      <section className="panel section">
        <h1>单股分析</h1>
        <p className="muted">围绕一只股票集中展示技术指标、AI 观点和相关新闻，帮助你快速判断是否值得出手或继续持有。</p>
        <SearchForm initialValue={query} />
      </section>

      {showProgress ? (
        <section className="panel section news-warning-strip">
          <h2>分析进度</h2>
          <p className="muted">{progressLabel}</p>
          <p className="muted">当前进度 {progressPct}%</p>
        </section>
      ) : null}

      <section className="content-grid">
        <div className="panel section">
          <h2>搜索结果</h2>
          {searchResults.length ? (
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
                    <td>
                      <Link href={`/stocks?query=${encodeURIComponent(item.code)}`}>
                        {item.name} ({item.code})
                      </Link>
                    </td>
                    <td>{item.market}</td>
                    <td>{item.category || "-"}</td>
                    <td>{item.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">输入关键词后，这里会显示匹配股票。</p>
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

      {selected && analysisStatus === "error" ? (
        <section className="panel section news-warning-strip">
          <h2>分析状态</h2>
          <p className="muted">
            {selected.name} ({selected.code}) 的单股分析暂时没有成功返回。
          </p>
          <p className="muted">{analysisError || "后端正在处理或分析服务暂时不可用。"}</p>
        </section>
      ) : null}

      {analysis ? (
        <>
          <section className={`panel section ${panel === "overview" ? "focus-panel" : ""}`} id="overview">
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
            <div className={`panel section ${panel === "chart" ? "focus-panel" : ""}`} id="chart">
              <h2>K 线缩略</h2>
              <CandlestickChart data={analysis.chart_series} height={280} symbol={`${analysis.stock_name} ${analysis.stock_code}`} />
              <p className="muted">使用轻量级蜡烛图组件展示最近行情，支持自适应宽度。</p>
            </div>

            <div className={`panel section ${panel === "indicators" ? "focus-panel" : ""}`} id="indicators">
              <h2>指标快照</h2>
              <div className="metric-grid">
                {indicatorEntries.map(([key, value]) => (
                  <div className="card" key={key}>
                    <div className="muted">{key}</div>
                    <strong>{value == null ? "-" : Number(value).toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="content-grid">
            <div className={`panel section ${panel === "commentary" ? "focus-panel" : ""}`} id="commentary">
              <h2>技术分析建议</h2>
              <div className="news-grid">
                {analysis.technical_commentary.map((item) => (
                  <div className="card" key={item}>
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className={`panel section ${panel === "ai" ? "focus-panel" : ""}`} id="ai">
              <h2>AI 分析</h2>
              {analysis.ai_insight.enabled ? (
                <AICarousel content={analysis.ai_insight.content || analysis.ai_insight.error || ""} />
              ) : (
                <p className="muted">当前未配置 LLM API，已保留纯技术分析链路。</p>
              )}
            </div>
          </section>

          <section className={`panel section ${panel === "news" ? "focus-panel" : ""}`} id="news">
            <h2>相关新闻</h2>
            {newsError ? <p className="muted">新闻加载部分失败：{newsError}</p> : null}
            <div className="news-grid">
              {news.length ? (
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
              ) : (
                <div className="card">
                  <p className="muted">当前暂无相关新闻。</p>
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}

function formatMatchType(value?: string | null) {
  if (!value) return "搜索推荐";
  if (value === "exact_code" || value === "direct_code") return "代码精确匹配";
  if (value === "fuzzy_name" || value === "fuzzy") return "名称模糊匹配";
  if (value === "alias") return "别名匹配";
  return "搜索推荐";
}

function formatSentiment(sentiment: NewsItem["sentiment"]) {
  if (sentiment === "bullish") return "偏利好";
  if (sentiment === "bearish") return "偏利空";
  return "中性";
}
