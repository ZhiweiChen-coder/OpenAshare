import Link from "next/link";
import { cookies } from "next/headers";

import { CandlestickChart } from "@/components/candlestick-chart";
import { AICarousel } from "@/components/ai-carousel";
import { DemoAccessGate } from "@/components/demo-access-gate";
import { SearchForm } from "@/components/search-form";
import { StockPanelLink } from "@/components/stock-panel-link";
import { getStockAnalysis, getStockNews, searchStocksWithOptions } from "@/lib/api";
import { DEMO_ACCESS_COOKIE_NAME } from "@/lib/demo-access";
import { getDemoAccessStatusFromToken } from "@/lib/demo-access-server";
import type { NewsItem, StockAnalysisResponse } from "@/lib/types";

type PageProps = {
  searchParams: Promise<{ query?: string; panel?: string; request_id?: string }>;
};

export default async function StocksPage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");
  const demoAccess = getDemoAccessStatusFromToken(cookieStore.get(DEMO_ACCESS_COOKIE_NAME)?.value);
  const { query = "", panel = "", request_id: requestId = "" } = await searchParams;
  const activePanel = panel || "overview";
  const shouldLoadAi = activePanel === "ai" && demoAccess.unlocked;
  const shouldLoadNews = activePanel === "news";
  const showAiGate = activePanel === "ai" && !demoAccess.unlocked;
  const q = query.trim();
  const qForSearch = /^[a-z]{2}\d+$/i.test(q) ? q.toLowerCase() : q;
  let searchResults = qForSearch ? await searchStocksWithOptions(qForSearch, { requestId }).catch(() => []) : [];

  if (!searchResults.length && qForSearch && /^[a-z]{2}\d{6}$/i.test(qForSearch)) {
    const code = qForSearch.toLowerCase();
    searchResults = [
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

  const selected = searchResults[0];
  let analysis: StockAnalysisResponse | null = null;
  let news: NewsItem[] = [];
  let analysisError = "";
  let newsError = "";

  if (selected) {
    const [analysisResult, newsResult] = await Promise.allSettled([
      getStockAnalysis(selected.code, { includeAi: shouldLoadAi, requestId, requestInit: { headers: { cookie: cookieHeader } } }),
      shouldLoadNews ? getStockNews(selected.code) : Promise.resolve([]),
    ]);

    if (analysisResult.status === "fulfilled") {
      analysis = analysisResult.value;
    } else {
      analysisError = analysisResult.reason instanceof Error ? analysisResult.reason.message : "单股分析生成失败";
    }

    if (newsResult.status === "fulfilled") {
      news = newsResult.value;
    } else {
      newsError = newsResult.reason instanceof Error ? newsResult.reason.message : "相关新闻加载失败";
    }
  }

  return (
    <>
      <section className="panel section">
        <h1>单股分析</h1>
        <p className="muted">围绕一只股票集中展示技术指标、AI 观点和相关新闻，帮你快速判断是否值得出手或继续持有。</p>
        <SearchForm initialValue={query} />
      </section>

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

      {selected && !analysis ? (
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
            <div className={`panel section ${panel === "chart" ? "focus-panel" : ""}`} id="chart">
              <h2>K 线缩略</h2>
              <CandlestickChart data={analysis.chart_series} height={280} symbol={`${analysis.stock_name} ${analysis.stock_code}`} />
              <p className="muted">使用轻量级蜡烛图组件展示最近行情，支持自适应宽度。</p>
            </div>

            <div className={`panel section ${panel === "indicators" ? "focus-panel" : ""}`} id="indicators">
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

            <div className={`panel section ${activePanel === "ai" ? "focus-panel" : ""}`} id="ai">
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
            </div>
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
              ) : shouldLoadNews ? (
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
