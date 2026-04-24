"use client";

import { useEffect, useState } from "react";

import { getPortfolioAnalysis } from "@/lib/api";
import type { PortfolioAnalysisResponse } from "@/lib/types";

export function PortfolioSnapshotPanel() {
  const [portfolio, setPortfolio] = useState<PortfolioAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);

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
      <h2>组合快照</h2>
      {loading ? (
        <p className="muted">正在加载组合快照...</p>
      ) : portfolio ? (
        <div className="metric-grid">
          <div className="card">
            <div className="muted">总市值</div>
            <strong>{portfolio.total_market_value.toFixed(2)}</strong>
          </div>
          <div className="card">
            <div className="muted">总盈亏</div>
            <strong className={portfolio.total_pnl >= 0 ? "signal-up" : "signal-down"}>
              {portfolio.total_pnl.toFixed(2)}
            </strong>
          </div>
          <div className="card">
            <div className="muted">收益率</div>
            <strong>{portfolio.total_pnl_pct.toFixed(2)}%</strong>
          </div>
          <div className="card">
            <div className="muted">技术风险</div>
            <strong>{portfolio.technical_risk}</strong>
          </div>
        </div>
      ) : (
        <p className="muted">后端不可达时，这里会显示组合快照。</p>
      )}
    </div>
  );
}
