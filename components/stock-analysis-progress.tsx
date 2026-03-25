"use client";

import { useEffect, useMemo, useState } from "react";

import type { AnalysisProgressResponse } from "@/lib/types";

type StockAnalysisProgressProps = {
  query?: string;
  requestId?: string;
  panel?: string;
  compact?: boolean;
};

const FALLBACK_PROGRESS: AnalysisProgressResponse = {
  request_id: "",
  status: "unknown",
  stage: "queued",
  progress_pct: 2,
  message: "已提交分析请求，等待后端开始处理",
  include_ai: false,
  updated_at: null,
};

export function StockAnalysisProgress({
  query = "",
  requestId = "",
  panel = "overview",
  compact = false,
}: StockAnalysisProgressProps) {
  const [progress, setProgress] = useState<AnalysisProgressResponse>(FALLBACK_PROGRESS);

  useEffect(() => {
    if (panel === "news") {
      const syntheticStages = [
        { stage: "searching", progress_pct: 16, message: "正在识别股票并定位相关新闻源" },
        { stage: "fetch_data", progress_pct: 48, message: "正在拉取相关新闻与时间线" },
        { stage: "summarize", progress_pct: 78, message: "正在整理标题、摘要和影响等级" },
        { stage: "completed", progress_pct: 100, message: "相关新闻已准备完成，正在渲染页面" },
      ] as const;
      setProgress({
        request_id: requestId || "news",
        status: "pending",
        stage: syntheticStages[0].stage,
        progress_pct: syntheticStages[0].progress_pct,
        message: syntheticStages[0].message,
        stock_code: query || null,
        include_ai: false,
        updated_at: null,
      });
      let index = 0;
      const timer = window.setInterval(() => {
        index = Math.min(index + 1, syntheticStages.length - 1);
        const next = syntheticStages[index]!;
        setProgress({
          request_id: requestId || "news",
          status: index === syntheticStages.length - 1 ? "completed" : "pending",
          stage: next.stage,
          progress_pct: next.progress_pct,
          message: next.message,
          stock_code: query || null,
          include_ai: false,
          updated_at: null,
        });
        if (index === syntheticStages.length - 1) {
          window.clearInterval(timer);
        }
      }, 450);
      return () => window.clearInterval(timer);
    }

    if (!requestId) {
      setProgress(FALLBACK_PROGRESS);
      return;
    }

    let active = true;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/stocks/progress/${encodeURIComponent(requestId)}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as AnalysisProgressResponse;
        if (!active) return;
        setProgress(data);
        if (data.status === "completed" || data.status === "error") {
          return;
        }
      } catch {
        if (!active) return;
      }
      timer = window.setTimeout(poll, 700);
    };

    poll();
    return () => {
      active = false;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [panel, query, requestId]);

  const steps = useMemo(() => buildSteps(progress.stage, panel), [progress.stage, panel]);
  const currentLabel = progress.message || "正在处理分析请求";
  const targetLabel = query || progress.stock_code || "当前标的";
  const progressPct = clampProgress(progress.progress_pct || 0);

  return (
    <section className={`analysis-progress-card ${compact ? "compact" : ""}`}>
      <div className="analysis-progress-backdrop" aria-hidden="true" />
      <div className="analysis-progress-head">
        <div>
          <div className="analysis-progress-kicker">Live Analysis Trace</div>
          <h2>{compact ? "分析处理中" : "分析进度"}</h2>
        </div>
        <div className={`analysis-progress-badge status-${progress.status}`}>{formatStatus(progress.status)}</div>
      </div>

      <div className="analysis-progress-meter">
        <div className="analysis-progress-ring">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="48" className="analysis-progress-ring-track" />
            <circle
              cx="60"
              cy="60"
              r="48"
              className="analysis-progress-ring-value"
              style={{ strokeDashoffset: `${302 - (302 * progressPct) / 100}` }}
            />
          </svg>
          <div className="analysis-progress-ring-copy">
            <strong>{progressPct}%</strong>
            <span>{panel === "ai" ? "AI 深析" : panel === "news" ? "新闻追踪" : "总览分析"}</span>
          </div>
        </div>

        <div className="analysis-progress-summary">
          <p className="analysis-progress-target">正在处理 {targetLabel}</p>
          <h3>{currentLabel}</h3>
          <div className="analysis-progress-bar" aria-hidden="true">
            <span style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      <div className="analysis-progress-step-grid">
        {steps.map((step, index) => (
          <div key={step.key} className={`analysis-progress-step ${step.state}`}>
            <span className="analysis-progress-step-index">{index + 1}</span>
            <div>
              <strong>{step.label}</strong>
              <p>{step.hint}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

type StepState = "pending" | "active" | "done";

function buildSteps(stage: string, panel: string) {
  if (panel === "news") {
    const base = [
      { key: "searching", label: "识别标的", hint: "确认股票代码与新闻关联范围" },
      { key: "fetch_data", label: "抓取新闻", hint: "拉取相关新闻、公告与时间线" },
      { key: "summarize", label: "整理摘要", hint: "提炼标题、摘要和影响等级" },
      { key: "completed", label: "装配结果", hint: "渲染新闻卡片与阅读入口" },
    ];
    const stageOrder = ["queued", "searching", "fetch_data", "summarize", "completed"];
    const currentIndex = stageOrder.indexOf(stage);

    return base.map((step) => {
      const stepIndex = stageOrder.indexOf(step.key);
      let state: StepState = "pending";
      if (currentIndex >= stepIndex && stepIndex >= 0) {
        state = currentIndex > stepIndex || stage === "completed" ? "done" : "active";
      }
      return { ...step, state };
    });
  }

  const base = [
    { key: "searching", label: "识别标的", hint: "股票代码、名称与市场归属" },
    { key: "fetch_data", label: "拉取行情", hint: "读取历史行情与日线数据" },
    { key: "calculate_indicators", label: "计算指标", hint: "MACD、RSI、均线与信号评分" },
    {
      key: panel === "ai" ? "ai_analysis" : "completed",
      label: panel === "ai" ? "生成 AI 报告" : "装配结果",
      hint: panel === "ai" ? "整理上下文并等待模型返回" : "汇总总览卡片与结果结构",
    },
  ];
  const stageOrder = ["queued", "searching", "search_done", "fetch_data", "calculate_indicators", "summarize", "ai_analysis", "cached", "completed"];
  const currentIndex = stageOrder.indexOf(stage);

  return base.map((step) => {
    const stepIndex = stageOrder.indexOf(step.key);
    let state: StepState = "pending";
    if (currentIndex >= stepIndex && stepIndex >= 0) {
      state = currentIndex > stepIndex || stage === "completed" || stage === "cached" ? "done" : "active";
    }
    if (stage === "error") {
      state = "pending";
    }
    return { ...step, state };
  });
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatStatus(status: AnalysisProgressResponse["status"]) {
  if (status === "completed") return "已完成";
  if (status === "error") return "失败";
  if (status === "pending") return "处理中";
  return "等待中";
}
