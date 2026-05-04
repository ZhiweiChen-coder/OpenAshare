"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";

import { StockAnalysisProgress } from "@/components/stock-analysis-progress";

const QUICK_EXAMPLES = ["招商银行", "宁德时代", "sh600519"] as const;
const QUICK_EXAMPLES_EN = ["sh600036", "sz300750", "sh600519"] as const;

type SearchFormLocale = "zh" | "en";

const SEARCH_COPY = {
  zh: {
    placeholder: "输入股票名称或代码，例如 招商银行 / sh600036",
    pending: "分析中...",
    submit: "开始分析",
    progress: "输入股票后，会自动完成：识别标的 → 拉取行情和技术指标 → 整理技术结论与页面结果。",
    quickLabel: "快捷搜索示例",
    examples: QUICK_EXAMPLES,
  },
  en: {
    placeholder: "Enter a stock name or code, e.g. sh600036",
    pending: "Analyzing...",
    submit: "Analyze",
    progress:
      "After you enter a stock, OpenAshare identifies the symbol, pulls market data and indicators, then prepares the research view.",
    quickLabel: "Quick search examples",
    examples: QUICK_EXAMPLES_EN,
  },
} as const;

export function SearchForm({
  initialValue = "",
  locale = "zh",
}: {
  initialValue?: string;
  locale?: SearchFormLocale;
}) {
  const [value, setValue] = useState(initialValue);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [requestId, setRequestId] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const copy = SEARCH_COPY[locale];

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
          placeholder={copy.placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={isPending}
        />
        <button className="button" type="submit" disabled={isPending}>
          {isPending ? copy.pending : copy.submit}
        </button>
      </form>
      {isPending ? (
        <div aria-live="polite">
          <StockAnalysisProgress query={submittedQuery} requestId={requestId} compact />
        </div>
      ) : (
        <div aria-live="polite" className="search-progress">
          <p className="muted">{copy.progress}</p>
          <div className="search-quick-list" aria-label={copy.quickLabel}>
            {copy.examples.map((example) => (
              <button
                className="search-quick-chip"
                key={example}
                type="button"
                onClick={() => setValue(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
