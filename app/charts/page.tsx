"use client";

import { useCallback, useState } from "react";
import { CandlestickChart } from "@/components/candlestick-chart";
import { getStockAnalysis, searchStocks } from "@/lib/api";
import type { StockAnalysisResponse, StockSearchResult } from "@/lib/types";

type ChartPoint = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume?: number | null;
};

export default function ChartsPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  const onSearch = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    searchStocks(q)
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
    setAnalysis(null);
  }, [query]);

  const onSelectStock = useCallback((code: string) => {
    setLoading(true);
    getStockAnalysis(code, { includeAi: false })
      .then(setAnalysis)
      .catch(() => setAnalysis(null))
      .finally(() => setLoading(false));
  }, []);

  const chartData: ChartPoint[] = analysis?.chart_series ?? [];
  const closeValues = chartData
    .map((point) => point.close)
    .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));

  return (
    <>
      <section className="panel section">
        <h1>K 线图</h1>
        <p className="muted">为重点标的快速拉出一张干净的日 K 线，配合价格与涨跌幅做节奏判断。</p>
        <div className="form" style={{ marginTop: 16 }}>
          <input
            className="input search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            placeholder="输入股票名称或代码，例如 招商银行 / sh600036"
          />
          <button type="button" className="button" onClick={onSearch} disabled={searching}>
            {searching ? "搜索中…" : "搜索"}
          </button>
        </div>
      </section>

      {results.length > 0 && (
        <section className="panel section">
          <h2>搜索结果</h2>
          <div className="search-results">
            {results.map((item) => (
              <button
                type="button"
                className="result-button"
                key={item.code}
                onClick={() => onSelectStock(item.code)}
                disabled={loading}
              >
                <strong>{item.name} ({item.code})</strong>
                <span className="muted">{item.market} · {item.category || "-"}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {analysis && (
        <section className="panel section">
          <h2>
            {analysis.stock_name} ({analysis.stock_code}) — 日 K 线
          </h2>
          <div className="metric-grid" style={{ marginBottom: 16 }}>
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
          </div>
          <CandlestickChart
            data={chartData}
            height={420}
            symbol={`${analysis.stock_name} (${analysis.stock_code})`}
          />
          <div className="metric-grid" style={{ marginTop: 18 }}>
            <div className="card">
              <div className="muted">MACD</div>
              <strong>{formatIndicator(analysis.technical_indicators.MACD)}</strong>
            </div>
            <div className="card">
              <div className="muted">DIF / DEA</div>
              <strong>
                {formatIndicator(analysis.technical_indicators.DIF)} /{" "}
                {formatIndicator(analysis.technical_indicators.DEA)}
              </strong>
            </div>
            <div className="card">
              <div className="muted">RSI</div>
              <strong>{formatIndicator(analysis.technical_indicators.RSI)}</strong>
            </div>
            <div className="card">
              <div className="muted">K / D / J</div>
              <strong>
                {formatIndicator(analysis.technical_indicators.K)} /{" "}
                {formatIndicator(analysis.technical_indicators.D)} /{" "}
                {formatIndicator(analysis.technical_indicators.J)}
              </strong>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function formatIndicator(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toFixed(2);
}
