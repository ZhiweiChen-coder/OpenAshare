"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useDemoAccess } from "@/components/demo-access-provider";
import {
  getChinaClock,
  getMarketPhase,
  type ResearchPulseLocale,
} from "@/components/research-pulse";
import { getPortfolioAnalysis } from "@/lib/api";
import type { PortfolioAnalysisResponse } from "@/lib/types";

const MINUTE = 60 * 1000;

const COPY = {
  zh: {
    eyebrow: "今日盘面",
    clockLabel: "北京时间",
    nextAction: "下一步",
    openPortfolio: "打开持仓页",
    totalMarketValue: "总市值",
    totalPnl: "总盈亏",
    returnRate: "收益率",
    technicalRisk: "技术风险",
    loading: "正在加载组合数据...",
    unavailable: "后端不可达，组合数据稍后显示。",
    calm: "暂无明确调仓提示，按节奏观察即可。",
    gateTitle: "组合数据已锁定",
    gateDescription: "解锁后这里会显示持仓盈亏、风险与调仓建议。",
    unlockLabel: "解锁演示",
    clearLabel: "清除密钥",
  },
  en: {
    eyebrow: "Today's Desk",
    clockLabel: "Beijing time",
    nextAction: "Next",
    openPortfolio: "Open portfolio",
    totalMarketValue: "Market Value",
    totalPnl: "Total P&L",
    returnRate: "Return",
    technicalRisk: "Technical Risk",
    loading: "Loading portfolio data...",
    unavailable: "Backend unavailable; portfolio data will appear later.",
    calm: "No urgent rebalance right now — keep watching the rhythm.",
    gateTitle: "Portfolio data locked",
    gateDescription: "Unlock to see holdings P&L, risk, and rebalance suggestions.",
    unlockLabel: "Unlock demo",
    clearLabel: "Clear key",
  },
} as const;

export function TodayDeskPanel({ locale = "zh" }: { locale?: ResearchPulseLocale }) {
  const copy = COPY[locale];
  const { unlocked, loaded, openDialog, revoke } = useDemoAccess();
  const [now, setNow] = useState(() => new Date());
  const [portfolio, setPortfolio] = useState<PortfolioAnalysisResponse | null>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), MINUTE);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!unlocked) {
      setPortfolio(null);
      return;
    }
    let cancelled = false;
    setLoadingPortfolio(true);
    void getPortfolioAnalysis()
      .then((data) => {
        if (!cancelled) setPortfolio(data);
      })
      .catch(() => {
        if (!cancelled) setPortfolio(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPortfolio(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  const chinaClock = useMemo(() => getChinaClock(now, locale), [locale, now]);
  const phase = useMemo(
    () => getMarketPhase(chinaClock.hour * 60 + chinaClock.minute, locale),
    [chinaClock, locale],
  );

  // 唯一的「下一步」：优先真实调仓建议，否则回退到阶段行动指引（去掉了与之重复的通用任务清单）
  const fallbackAction = phase.tasks[phase.tasks.length - 1];
  const nextAction =
    unlocked && portfolio ? portfolio.rebalance_suggestions[0] ?? copy.calm : fallbackAction;

  const ariaLabel = locale === "en" ? "Today's market desk" : "今日盘面";
  const progressLabel =
    locale === "en" ? `Trading day progress ${phase.progress}%` : `交易日进度 ${phase.progress}%`;
  const showGate = loaded && !unlocked;

  return (
    <section className={`panel research-pulse research-pulse--${phase.tone}`} aria-label={ariaLabel}>
      <div className="research-pulse-orb" aria-hidden="true" />
      <div className="research-pulse-head">
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h2>{phase.label}</h2>
        </div>
        <div className="research-pulse-clock">
          {chinaClock.label}
          <span>{copy.clockLabel}</span>
        </div>
      </div>
      <p>{phase.summary}</p>
      <div className="research-pulse-track" aria-label={progressLabel}>
        <span style={{ width: `${phase.progress}%` }} />
      </div>

      <div className="portfolio-snapshot-action">
        <div>
          <span>{copy.nextAction}</span>
          <strong>{nextAction}</strong>
        </div>
        {unlocked ? (
          <Link href="/portfolio" className="button ghost">
            {copy.openPortfolio}
          </Link>
        ) : null}
      </div>

      {showGate ? (
        <>
          <hr className="today-desk-divider" />
          <div className="demo-access-gate compact">
            <div className="demo-access-gate-copy">
              <h3>{copy.gateTitle}</h3>
              <p>{copy.gateDescription}</p>
            </div>
            <div className="inline-actions">
              <button className="button" type="button" onClick={openDialog}>
                {copy.unlockLabel}
              </button>
              <button className="button ghost" type="button" onClick={revoke}>
                {copy.clearLabel}
              </button>
            </div>
          </div>
        </>
      ) : loadingPortfolio ? (
        <p className="muted" style={{ marginTop: 14 }}>
          {copy.loading}
        </p>
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
      ) : unlocked ? (
        <p className="muted" style={{ marginTop: 14 }}>
          {copy.unavailable}
        </p>
      ) : null}
    </section>
  );
}
