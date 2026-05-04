"use client";

import { useEffect, useMemo, useState } from "react";

type MarketPhase = {
  label: string;
  tone: string;
  summary: string;
  tasks: string[];
  progress: number;
};

type ResearchPulseLocale = "zh" | "en";

const MINUTE = 60 * 1000;
const CHINA_TIME_ZONE = "Asia/Shanghai";

function getChinaClock(date: Date, locale: ResearchPulseLocale) {
  const parts = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    timeZone: CHINA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return {
    hour,
    minute,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function getMarketPhase(minutes: number, locale: ResearchPulseLocale): MarketPhase {
  const open = 9 * 60 + 30;
  const lunch = 11 * 60 + 30;
  const afternoon = 13 * 60;
  const close = 15 * 60;

  if (minutes < open) {
    return locale === "en"
      ? {
          label: "Pre-market prep",
          tone: "calm",
          summary: "Set the watchlist first, then let the agent compress overnight context into testable ideas.",
          tasks: ["Check market tone", "Review watchlist", "Mark catalysts"],
          progress: Math.max(8, Math.round((minutes / open) * 24)),
        }
      : {
          label: "盘前准备",
          tone: "calm",
          summary: "先定观察清单，再让 Agent 帮你把昨夜消息压缩成交易假设。",
          tasks: ["看市场状态", "整理自选股", "标记今日催化"],
          progress: Math.max(8, Math.round((minutes / open) * 24)),
        };
  }

  if (minutes < lunch) {
    return locale === "en"
      ? {
          label: "Morning tracking",
          tone: "live",
          summary: "Watch volume, breakouts, and hotspot diffusion. Capture facts before forcing a conclusion.",
          tasks: ["Scan volume shifts", "Track hotspot strength", "Review portfolio risk"],
          progress: 24 + Math.round(((minutes - open) / (lunch - open)) * 28),
        }
      : {
          label: "早盘追踪",
          tone: "live",
          summary: "重点观察放量、突破和热点扩散，先记录事实，少急着下结论。",
          tasks: ["检查量价异动", "追踪热点强度", "复核持仓风险"],
          progress: 24 + Math.round(((minutes - open) / (lunch - open)) * 28),
        };
  }

  if (minutes < afternoon) {
    return locale === "en"
      ? {
          label: "Midday review",
          tone: "pause",
          summary: "Compress morning noise into a few hypotheses, then focus on the variables that matter.",
          tasks: ["Summarize leaders", "Drop weak links", "Update PM watchpoints"],
          progress: 56,
        }
      : {
          label: "午间复盘",
          tone: "pause",
          summary: "把早盘噪音收束成几条可验证的假设，下午只盯关键变量。",
          tasks: ["总结早盘主线", "筛掉弱相关标的", "更新下午观察点"],
          progress: 56,
        };
  }

  if (minutes < close) {
    return locale === "en"
      ? {
          label: "Afternoon watch",
          tone: "live",
          summary: "Watch late-session capital, sector persistence, and portfolio fit before acting.",
          tasks: ["Watch late flows", "Check strategy rules", "Draft action list"],
          progress: 58 + Math.round(((minutes - afternoon) / (close - afternoon)) * 34),
        }
      : {
          label: "午后观察",
          tone: "live",
          summary: "关注回封、尾盘资金和板块持续性，用组合视角决定是否行动。",
          tasks: ["观察尾盘资金", "对照策略条件", "生成行动清单"],
          progress: 58 + Math.round(((minutes - afternoon) / (close - afternoon)) * 34),
        };
  }

  return locale === "en"
    ? {
        label: "Post-market review",
        tone: "review",
        summary: "Review which assumptions held, then hand tomorrow's questions to the system early.",
        tasks: ["Review holdings", "Log strategy notes", "Prepare tomorrow"],
        progress: 100,
      }
    : {
        label: "盘后复盘",
        tone: "review",
        summary: "收盘后适合复盘假设是否成立，把明天的问题提前交给系统。",
        tasks: ["复盘持仓表现", "沉淀策略记录", "准备明日问题"],
        progress: 100,
      };
}

export function ResearchPulse({ locale = "zh" }: { locale?: ResearchPulseLocale }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), MINUTE);
    return () => window.clearInterval(timer);
  }, []);

  const chinaClock = useMemo(() => getChinaClock(now, locale), [locale, now]);
  const phase = useMemo(() => getMarketPhase(chinaClock.hour * 60 + chinaClock.minute, locale), [chinaClock, locale]);
  const ariaLabel = locale === "en" ? "Today's research rhythm" : "今日研究节奏";
  const clockLabel = locale === "en" ? "Beijing time" : "北京时间";
  const progressLabel =
    locale === "en" ? `Trading day progress ${phase.progress}%` : `交易日进度 ${phase.progress}%`;

  return (
    <section className={`panel research-pulse research-pulse--${phase.tone}`} aria-label={ariaLabel}>
      <div className="research-pulse-orb" aria-hidden="true" />
      <div className="research-pulse-head">
        <div>
          <span className="eyebrow">Research Pulse</span>
          <h2>{phase.label}</h2>
        </div>
        <div className="research-pulse-clock">
          {chinaClock.label}
          <span>{clockLabel}</span>
        </div>
      </div>
      <p>{phase.summary}</p>
      <div className="research-pulse-track" aria-label={progressLabel}>
        <span style={{ width: `${phase.progress}%` }} />
      </div>
      <div className="research-pulse-tasks">
        {phase.tasks.map((task, index) => (
          <span key={task}>
            <b>{String(index + 1).padStart(2, "0")}</b>
            {task}
          </span>
        ))}
      </div>
    </section>
  );
}
