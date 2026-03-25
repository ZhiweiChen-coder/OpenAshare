"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

type StockPanelLinkProps = {
  stockCode: string;
  panel: "overview" | "ai" | "news";
  className?: string;
  children: ReactNode;
};

export function StockPanelLink({ stockCode, panel, className, children }: StockPanelLinkProps) {
  const router = useRouter();
  const fallbackHref = `/stocks?query=${encodeURIComponent(stockCode)}&panel=${panel}#${panel}`;
  const [isNavigating, setIsNavigating] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const openingSteps = panel === "news" ? NEWS_OPENING_STEPS : AI_OPENING_STEPS;

  useEffect(() => {
    if (!isNavigating || (panel !== "ai" && panel !== "news")) {
      setStepIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setStepIndex((current) => (current + 1) % openingSteps.length);
    }, 700);
    return () => window.clearInterval(timer);
  }, [isNavigating, openingSteps, panel]);

  useEffect(() => {
    if (panel !== "ai" && panel !== "news") {
      return;
    }
    router.prefetch(`/stocks?query=${encodeURIComponent(stockCode)}&panel=${panel}`);
  }, [panel, router, stockCode]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (panel !== "ai" && panel !== "news") {
      return;
    }
    event.preventDefault();
    if (isNavigating) {
      return;
    }
    setIsNavigating(true);
    const requestId = crypto.randomUUID();
    router.push(`/stocks?query=${encodeURIComponent(stockCode)}&panel=${panel}&request_id=${encodeURIComponent(requestId)}#${panel}`);
  }

  return (
    <Link
      href={fallbackHref}
      className={`${className ?? ""}${isNavigating ? " is-loading is-loading-steps" : ""}`}
      onClick={handleClick}
      aria-busy={isNavigating}
    >
      {isNavigating && (panel === "ai" || panel === "news") ? (
        <span className="button-loading-copy">
          <strong>{panel === "ai" ? "AI 分析" : "相关新闻"}</strong>
          <span>{openingSteps[stepIndex]}</span>
        </span>
      ) : (
        children
      )}
    </Link>
  );
}

const AI_OPENING_STEPS = ["准备上下文", "建立分析请求", "打开 AI 面板"];
const NEWS_OPENING_STEPS = ["锁定相关标的", "拉取关联新闻", "打开新闻面板"];
