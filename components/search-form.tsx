"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";

export function SearchForm({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [progressStep, setProgressStep] = useState(0);
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);
  const router = useRouter();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = value.trim();
    if (!q) {
      return;
    }
    const href = `/stocks?query=${encodeURIComponent(q)}`;
    setSubmittedQuery(q);
    startTransition(() => {
      router.push(href);
    });
  }

  useEffect(() => {
    if (!isPending) {
      setProgressStep(0);
      return;
    }
    setProgressStep(0);
    const timer = window.setInterval(
      () => setProgressStep((current) => (current + 1) % SEARCH_PROGRESS_STEPS.length),
      1300,
    );
    return () => window.clearInterval(timer);
  }, [isPending]);

  return (
    <div className="stack">
      <form className="form" onSubmit={onSubmit}>
        <input
          className="search"
          placeholder="输入股票名称或代码，例如 招商银行 / sh600036"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={isPending}
        />
        <button className="button" type="submit" disabled={isPending}>
          {isPending ? "分析中..." : "开始分析"}
        </button>
      </form>
      <div aria-live="polite" className="muted search-progress">
        {isPending ? (
          <>
            <strong>{SEARCH_PROGRESS_STEPS[progressStep]}</strong>
            <span> · 正在为 {submittedQuery || "该标的"} 生成完整分析</span>
          </>
        ) : (
          "输入股票后，会自动完成：识别标的 → 拉取行情和技术指标 → 整合 AI 观点与相关新闻。"
        )}
      </div>
    </div>
  );
}

const SEARCH_PROGRESS_STEPS = [
  "1. 识别股票与市场",
  "2. 拉取行情与技术指标",
  "3. 整理技术结论和要点",
];
