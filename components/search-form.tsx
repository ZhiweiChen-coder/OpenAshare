"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";

import { StockAnalysisProgress } from "@/components/stock-analysis-progress";

export function SearchForm({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [requestId, setRequestId] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = value.trim();
    if (!q) {
      return;
    }
    const nextRequestId = crypto.randomUUID();
    const href = `/stocks?query=${encodeURIComponent(q)}&request_id=${encodeURIComponent(nextRequestId)}`;
    setSubmittedQuery(q);
    setRequestId(nextRequestId);
    startTransition(() => {
      router.push(href);
    });
  }

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
      {isPending ? (
        <div aria-live="polite">
          <StockAnalysisProgress query={submittedQuery} requestId={requestId} compact />
        </div>
      ) : (
        <div aria-live="polite" className="muted search-progress">
          输入股票后，会自动完成：识别标的 → 拉取行情和技术指标 → 整理技术结论与页面结果。
        </div>
      )}
    </div>
  );
}
