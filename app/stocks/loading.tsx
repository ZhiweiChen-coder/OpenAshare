"use client";

import { useSearchParams } from "next/navigation";

import { StockAnalysisProgress } from "@/components/stock-analysis-progress";

export default function StocksLoading() {
  const searchParams = useSearchParams();
  const query = searchParams.get("query") ?? "";
  const requestId = searchParams.get("request_id") ?? "";
  const panel = searchParams.get("panel") ?? "overview";

  return (
    <>
      <section className="panel section loading-hero">
        <div className="section-kicker">Stocks</div>
        <h1>单股分析</h1>
        <p className="muted">页面已切换，正在后台准备搜索结果与技术分析。</p>
      </section>

      <StockAnalysisProgress query={query} requestId={requestId} panel={panel} />

      <section className="content-grid">
        <div className="panel section">
          <h2>搜索结果</h2>
          <p className="muted">正在返回匹配股票与市场信息...</p>
        </div>
        <div className="panel section">
          <h2>选中股票</h2>
          <p className="muted">正在准备报价、指标和结论卡片...</p>
        </div>
      </section>
    </>
  );
}
