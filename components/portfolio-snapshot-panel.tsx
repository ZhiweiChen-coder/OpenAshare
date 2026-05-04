"use client";

import { useEffect, useState } from "react";

import { getPortfolioAnalysis } from "@/lib/api";
import type { PortfolioAnalysisResponse } from "@/lib/types";

type PortfolioSnapshotLocale = "zh" | "en";

const PORTFOLIO_COPY = {
  zh: {
    title: "组合快照",
    loading: "正在加载组合快照...",
    totalMarketValue: "总市值",
    totalPnl: "总盈亏",
    returnRate: "收益率",
    technicalRisk: "技术风险",
    unavailable: "后端不可达时，这里会显示组合快照。",
  },
  en: {
    title: "Portfolio Snapshot",
    loading: "Loading portfolio snapshot...",
    totalMarketValue: "Market Value",
    totalPnl: "Total P&L",
    returnRate: "Return",
    technicalRisk: "Technical Risk",
    unavailable: "Portfolio metrics will appear here after the backend is available.",
  },
} as const;

export function PortfolioSnapshotPanel({ locale = "zh" }: { locale?: PortfolioSnapshotLocale }) {
  const [portfolio, setPortfolio] = useState<PortfolioAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const copy = PORTFOLIO_COPY[locale];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getPortfolioAnalysis()
      .then((data) => {
        if (!cancelled) {
          setPortfolio(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPortfolio(null);
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

  return (
    <div className="panel section">
      <h2>{copy.title}</h2>
      {loading ? (
        <p className="muted">{copy.loading}</p>
      ) : portfolio ? (
        <div className="metric-grid">
          <div className="card">
            <div className="muted">{copy.totalMarketValue}</div>
            <strong>{portfolio.total_market_value.toFixed(2)}</strong>
          </div>
          <div className="card">
            <div className="muted">{copy.totalPnl}</div>
            <strong className={portfolio.total_pnl >= 0 ? "signal-up" : "signal-down"}>
              {portfolio.total_pnl.toFixed(2)}
            </strong>
          </div>
          <div className="card">
            <div className="muted">{copy.returnRate}</div>
            <strong>{portfolio.total_pnl_pct.toFixed(2)}%</strong>
          </div>
          <div className="card">
            <div className="muted">{copy.technicalRisk}</div>
            <strong>{portfolio.technical_risk}</strong>
          </div>
        </div>
      ) : (
        <p className="muted">{copy.unavailable}</p>
      )}
    </div>
  );
}
