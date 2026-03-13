"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";

import {
  createPortfolioPosition,
  getPortfolioAnalysis,
  deletePortfolioPosition,
  searchStocks,
  updatePortfolioPosition,
} from "@/lib/api";
import { PortfolioAnalysisResponse, PortfolioPosition, StockSearchResult } from "@/lib/types";

type Props = {
  initialPositions: PortfolioPosition[];
  initialAnalysis: PortfolioAnalysisResponse;
  initialPrefill?: {
    stock_code?: string;
    stock_name?: string;
    quantity?: string;
    cost_price?: string;
    focus?: string;
    return_to?: string;
    return_label?: string;
  };
};

type FormState = {
  id?: number;
  stock_code: string;
  stock_name: string;
  cost_price: string;
  quantity: string;
  weight_pct: string;
};

const EMPTY_FORM: FormState = {
  stock_code: "",
  stock_name: "",
  cost_price: "",
  quantity: "",
  weight_pct: "",
};

export function PortfolioShell({ initialPositions, initialAnalysis, initialPrefill }: Props) {
  const [positions, setPositions] = useState(initialPositions);
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [message, setMessage] = useState("可直接录入持仓，随后刷新页面查看最新分析。");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const costInputRef = useRef<HTMLInputElement | null>(null);
  const quantityInputRef = useRef<HTMLInputElement | null>(null);
  const [focusTarget, setFocusTarget] = useState<"cost" | "quantity" | null>(null);
  const [lastSubmitted, setLastSubmitted] = useState<{ stock_code: string; stock_name: string } | null>(null);

  function fillForm(position: PortfolioPosition) {
    setForm({
      id: position.id,
      stock_code: position.stock_code,
      stock_name: position.stock_name,
      cost_price: String(position.cost_price),
      quantity: String(position.quantity),
      weight_pct: position.weight_pct == null ? "" : String(position.weight_pct),
    });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  useEffect(() => {
    if (focusTarget === "cost") {
      costInputRef.current?.focus();
      costInputRef.current?.select();
    }
    if (focusTarget === "quantity") {
      quantityInputRef.current?.focus();
      quantityInputRef.current?.select();
    }
  }, [focusTarget, form.cost_price, form.quantity]);

  useEffect(() => {
    if (!initialPrefill?.stock_code && !initialPrefill?.stock_name) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      id: undefined,
      stock_code: initialPrefill.stock_code ?? prev.stock_code,
      stock_name: initialPrefill.stock_name ?? prev.stock_name,
      quantity: initialPrefill.quantity ?? (prev.quantity || "100"),
      cost_price: initialPrefill.cost_price ?? prev.cost_price,
    }));
    setSearchQuery(initialPrefill.stock_name ?? initialPrefill.stock_code ?? "");
    setFocusTarget(initialPrefill.focus === "quantity" ? "quantity" : "cost");
    setMessage(
      `已从快捷入口带入 ${initialPrefill.stock_name ?? initialPrefill.stock_code}，继续录入后即可加入持仓。`,
    );
  }, [initialPrefill]);

  function applySearchResult(item: StockSearchResult, quickAdd: boolean) {
    setForm((prev) => ({
      ...prev,
      id: undefined,
      stock_code: item.code,
      stock_name: item.name,
      cost_price: quickAdd ? "" : prev.cost_price,
      quantity: quickAdd ? prev.quantity || "100" : prev.quantity,
    }));
    setSearchQuery(item.name);
    setSearchResults([]);
    setFocusTarget("cost");
    setMessage(
      quickAdd
        ? `已将 ${item.name} (${item.code}) 带入持仓表单，默认数量 100，当前焦点在成本价。`
        : `已带入 ${item.name} (${item.code})，补充成本价和数量后即可提交。`,
    );
  }

  async function refreshAnalysis(nextPositions: PortfolioPosition[]) {
    setPositions(nextPositions);
    const nextAnalysis = await getPortfolioAnalysis();
    setAnalysis(nextAnalysis);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: PortfolioPosition = {
      stock_code: form.stock_code.trim(),
      stock_name: form.stock_name.trim(),
      cost_price: Number(form.cost_price),
      quantity: Number(form.quantity),
      weight_pct: form.weight_pct ? Number(form.weight_pct) : null,
    };

    startTransition(async () => {
      try {
        if (form.id) {
          const updated = await updatePortfolioPosition(form.id, payload);
          const nextPositions = positions.map((item) => (item.id === form.id ? updated : item));
          await refreshAnalysis(nextPositions);
          setMessage(`已更新 ${updated.stock_name} 持仓，组合分析已同步刷新。`);
          setLastSubmitted({ stock_code: updated.stock_code, stock_name: updated.stock_name });
        } else {
          const created = await createPortfolioPosition(payload);
          const nextPositions = [created, ...positions];
          await refreshAnalysis(nextPositions);
          setMessage(`已新增 ${created.stock_name} 持仓，组合分析已同步刷新。`);
          setLastSubmitted({ stock_code: created.stock_code, stock_name: created.stock_name });
        }
        resetForm();
      } catch (error) {
        setMessage(`提交失败: ${error instanceof Error ? error.message : "未知错误"}`);
      }
    });
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    startTransition(async () => {
      try {
        const results = await searchStocks(searchQuery.trim());
        setSearchResults(results);
        setMessage(results.length ? `找到 ${results.length} 条匹配结果。` : "没有找到匹配股票。");
      } catch (error) {
        setMessage(`搜索失败: ${error instanceof Error ? error.message : "未知错误"}`);
      }
    });
  }

  function onDelete(position: PortfolioPosition) {
    if (!position.id) {
      return;
    }
    startTransition(async () => {
      try {
        await deletePortfolioPosition(position.id as number);
        const nextPositions = positions.filter((item) => item.id !== position.id);
        await refreshAnalysis(nextPositions);
        setMessage(`已删除 ${position.stock_name} 持仓，组合分析已同步刷新。`);
        if (form.id === position.id) {
          resetForm();
        }
      } catch (error) {
        setMessage(`删除失败: ${error instanceof Error ? error.message : "未知错误"}`);
      }
    });
  }

  return (
    <div className="stack">
      <section className="content-grid">
        <div className="panel section">
          <h2>组合概览</h2>
          <div className="metric-grid">
            <div className="card">
              <div className="muted">总成本</div>
              <strong>{analysis.total_cost.toFixed(2)}</strong>
            </div>
            <div className="card">
              <div className="muted">总市值</div>
              <strong>{analysis.total_market_value.toFixed(2)}</strong>
            </div>
            <div className="card">
              <div className="muted">总盈亏</div>
              <strong className={analysis.total_pnl >= 0 ? "signal-up" : "signal-down"}>
                {analysis.total_pnl.toFixed(2)}
              </strong>
            </div>
            <div className="card">
              <div className="muted">收益率</div>
              <strong>{analysis.total_pnl_pct.toFixed(2)}%</strong>
            </div>
          </div>
          <div className="inline-actions" style={{ marginTop: 16 }}>
            <span className="tag">集中度风险: {analysis.concentration_risk}</span>
            <span className="tag">技术风险: {analysis.technical_risk}</span>
          </div>
          <p className="muted" style={{ marginTop: 16 }}>
            {message}
          </p>
          {initialPrefill?.return_to || lastSubmitted ? (
            <div className="inline-actions" style={{ marginTop: 12 }}>
              {initialPrefill?.return_to ? (
                <Link href={initialPrefill.return_to} className="button ghost">
                  返回{initialPrefill.return_label || "来源页"}
                </Link>
              ) : null}
              {lastSubmitted ? (
                <Link
                  href={`/stocks?query=${encodeURIComponent(lastSubmitted.stock_code)}&panel=overview#overview`}
                  className="button"
                >
                  继续分析 {lastSubmitted.stock_name}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="panel section">
          <h2>{form.id ? "编辑持仓" : "新增持仓"}</h2>
          <form className="stack" onSubmit={onSearch}>
            <label className="label">
              先搜索股票
              <div className="inline-actions">
                <input
                  className="input"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="输入股票名称或代码，例如 招商银行 / sh600036"
                />
                <button className="button ghost" type="submit" disabled={isPending}>
                  搜索并带入
                </button>
              </div>
            </label>
          </form>
          {searchResults.length ? (
            <div className="search-results" style={{ marginBottom: 18 }}>
              {searchResults.slice(0, 6).map((item) => (
                <div className="result-button" key={`${item.code}-${item.match_type}`}>
                  <strong>
                    {item.name} ({item.code})
                  </strong>
                  <span className="muted">
                    {item.market} · {item.category || "未分类"} · 搜索评分 {item.score}
                  </span>
                  <div className="inline-actions" style={{ marginTop: 12 }}>
                    <button className="button" onClick={() => applySearchResult(item, true)} type="button">
                      快速加入持仓
                    </button>
                    <button className="button ghost" onClick={() => applySearchResult(item, false)} type="button">
                      仅带入代码和名称
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <form className="stack" onSubmit={onSubmit}>
            <label className="label">
              股票代码
              <input
                className="input"
                value={form.stock_code}
                onChange={(event) => setForm((prev) => ({ ...prev, stock_code: event.target.value }))}
                placeholder="sh600036"
                required
              />
            </label>
            <label className="label">
              股票名称
              <input
                className="input"
                value={form.stock_name}
                onChange={(event) => setForm((prev) => ({ ...prev, stock_name: event.target.value }))}
                placeholder="招商银行"
                required
              />
            </label>
            <label className="label">
              成本价
              <input
                className="input"
                ref={costInputRef}
                type="number"
                min="0"
                step="0.01"
                value={form.cost_price}
                onChange={(event) => setForm((prev) => ({ ...prev, cost_price: event.target.value }))}
                required
              />
            </label>
            <label className="label">
              持仓数量
              <input
                className="input"
                ref={quantityInputRef}
                type="number"
                min="0"
                step="1"
                value={form.quantity}
                onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))}
                required
              />
            </label>
            <label className="label">
              仓位占比（可选）
              <input
                className="input"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.weight_pct}
                onChange={(event) => setForm((prev) => ({ ...prev, weight_pct: event.target.value }))}
              />
            </label>
            <div className="inline-actions">
              <button className="button" type="submit" disabled={isPending}>
                {form.id ? "保存修改" : "添加持仓"}
              </button>
              <button className="button ghost" type="button" onClick={resetForm} disabled={isPending}>
                清空表单
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => setFocusTarget(form.cost_price ? "quantity" : "cost")}
                disabled={isPending}
              >
                跳到录入焦点
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="panel section">
        <h2>持仓列表</h2>
        {positions.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>股票</th>
                <th>成本价</th>
                <th>数量</th>
                <th>仓位</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((item) => (
                <tr key={`${item.id}-${item.stock_code}`}>
                  <td>
                    {item.stock_name} ({item.stock_code})
                  </td>
                  <td>{item.cost_price}</td>
                  <td>{item.quantity}</td>
                  <td>{item.weight_pct ?? "-"}</td>
                  <td>
                    <div className="inline-actions">
                      <button className="button ghost" type="button" onClick={() => fillForm(item)}>
                        编辑
                      </button>
                      <button className="button ghost" type="button" onClick={() => onDelete(item)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">当前还没有持仓记录。</p>
        )}
      </section>

      <section className="panel section">
        <h2>组合分析</h2>
        {analysis.positions.length ? (
          <div className="position-grid">
            {analysis.positions.map((item) => (
              <div className="card" key={`${item.position.id}-${item.position.stock_code}`}>
                <h3>
                  {item.position.stock_name} ({item.position.stock_code})
                </h3>
                <p className="muted">
                  现价 {item.current_price.toFixed(2)} · 市值 {item.market_value.toFixed(2)}
                </p>
                <p className={item.pnl >= 0 ? "signal-up" : "signal-down"}>
                  盈亏 {item.pnl.toFixed(2)} ({item.pnl_pct.toFixed(2)}%)
                </p>
                <div className="tag-list">
                  <span className="tag">风险: {item.risk_level}</span>
                  <span className="tag">
                    信号: {item.signal_summary.overall_signal} / {item.signal_summary.overall_score}
                  </span>
                </div>
                <p style={{ marginTop: 12 }}>{item.suggestion}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">组合分析将在录入持仓后展示。</p>
        )}
        <div className="stack" style={{ marginTop: 18 }}>
          {analysis.rebalance_suggestions.map((item) => (
            <div className="card" key={item}>
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
