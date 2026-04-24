"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { DemoAccessGate } from "@/components/demo-access-gate";
import { useDemoAccess } from "@/components/demo-access-provider";
import { MarketRegimeBanner } from "@/components/market-regime-banner";
import {
  createStrategyHolding,
  deleteStrategyHolding,
  getClientErrorMessage,
  getMarketRegime,
  getStrategyHoldingsAnalysis,
  searchStocks,
  updateStrategyHolding,
} from "@/lib/api";
import {
  MarketRegimeResponse,
  StockSearchResult,
  StrategyHolding,
  StrategyHoldingAnalysis,
  StrategyHoldingAnalysisResponse,
} from "@/lib/types";

type PrefillState = {
  stock_code?: string;
  stock_name?: string;
  quantity?: string;
  cost_price?: string;
  focus?: string;
  return_to?: string;
  return_label?: string;
  strategy_key?: string;
  mode?: string;
  source_topic?: string;
  plan_reason?: string;
  plan_entry_trigger?: string;
  plan_entry_zone?: string;
  plan_stop_loss?: string;
  plan_take_profit?: string;
  plan_max_position_pct?: string;
  status?: string;
};

type Props = {
  initialStrategyAnalysis: StrategyHoldingAnalysisResponse;
  initialStrategyHoldings: StrategyHolding[];
  initialMarketRegime: MarketRegimeResponse | null;
  initialPrefill?: PrefillState;
};

type StrategyFormState = {
  id?: number;
  strategy_key: string;
  stock_code: string;
  stock_name: string;
  entry_price: string;
  quantity: string;
  entry_date: string;
  exit_price: string;
  exit_date: string;
  source_topic: string;
  plan_reason: string;
  plan_entry_trigger: string;
  plan_entry_zone: string;
  plan_stop_loss: string;
  plan_take_profit: string;
  plan_max_position_pct: string;
  notes: string;
  status: "watching" | "planned" | "holding" | "weakening" | "exited" | "invalidated";
};

type PendingAction =
  | { type: "search" }
  | { type: "create" }
  | { type: "update" }
  | { type: "delete"; holdingId: number }
  | { type: "refresh" }
  | { type: "exit"; holdingId: number }
  | { type: "invalidate"; holdingId: number };

const EMPTY_STRATEGY_FORM: StrategyFormState = {
  strategy_key: "can_slim",
  stock_code: "",
  stock_name: "",
  entry_price: "",
  quantity: "100",
  entry_date: "",
  exit_price: "",
  exit_date: "",
  source_topic: "",
  plan_reason: "",
  plan_entry_trigger: "",
  plan_entry_zone: "",
  plan_stop_loss: "",
  plan_take_profit: "",
  plan_max_position_pct: "",
  notes: "",
  status: "planned",
};

const HOLDING_STATUS_GROUPS: Array<{
  key: StrategyFormState["status"];
  title: string;
  description: string;
}> = [
  { key: "watching", title: "观察中", description: "还没形成明确执行计划，先看主题和价格是否配合。" },
  { key: "planned", title: "待执行", description: "交易计划已建立，等待价格进入买点区间。" },
  { key: "holding", title: "持有中", description: "已经执行买入，按计划继续跟踪。" },
  { key: "weakening", title: "走弱中", description: "逻辑开始转弱，限制加仓并准备处理。" },
  { key: "invalidated", title: "已失效", description: "原假设失效但仍保留记录，优先复盘处理。" },
  { key: "exited", title: "已退出", description: "交易已经结束，可用于复盘胜率和执行质量。" },
];

export function PortfolioShell({
  initialStrategyHoldings,
  initialStrategyAnalysis,
  initialMarketRegime,
  initialPrefill,
}: Props) {
  const { loaded, unlocked } = useDemoAccess();
  const [strategyHoldings, setStrategyHoldings] = useState(initialStrategyHoldings);
  const [strategyAnalysis, setStrategyAnalysis] = useState(() => normalizeStrategyAnalysis(initialStrategyAnalysis));
  const [marketRegime, setMarketRegime] = useState(initialMarketRegime);
  const [marketRegimeLoading, setMarketRegimeLoading] = useState(initialMarketRegime === null);
  const [marketRegimeError, setMarketRegimeError] = useState<string | null>(null);
  const [strategyForm, setStrategyForm] = useState<StrategyFormState>(EMPTY_STRATEGY_FORM);
  const [message, setMessage] = useState("可直接录入策略持股，随后刷新查看最新分析。");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isAnalysisRefreshing, setIsAnalysisRefreshing] = useState(false);
  const strategyPriceInputRef = useRef<HTMLInputElement | null>(null);
  const initialLoadInFlightRef = useRef(false);
  const localMutationVersionRef = useRef(0);
  const [focusTarget, setFocusTarget] = useState<"strategy_price" | null>(null);
  const [lastSubmitted, setLastSubmitted] = useState<{ stock_code: string; stock_name: string } | null>(null);
  const prefillLabel = initialPrefill?.stock_name ?? initialPrefill?.stock_code ?? "";
  const isBusy = pendingAction !== null;
  const safeStrategyAnalysis = normalizeStrategyAnalysis(strategyAnalysis);

  function fillStrategyForm(holding: StrategyHolding) {
    setStrategyForm({
      id: holding.id,
      strategy_key: holding.strategy_key,
      stock_code: holding.stock_code,
      stock_name: holding.stock_name,
      entry_price: String(holding.entry_price),
      quantity: String(holding.quantity),
      entry_date: holding.entry_date ?? "",
      exit_price: holding.exit_price == null ? "" : String(holding.exit_price),
      exit_date: holding.exit_date ?? "",
      source_topic: holding.source_topic ?? "",
      plan_reason: holding.plan_reason ?? "",
      plan_entry_trigger: holding.plan_entry_trigger ?? "",
      plan_entry_zone: holding.plan_entry_zone ?? "",
      plan_stop_loss: holding.plan_stop_loss == null ? "" : String(holding.plan_stop_loss),
      plan_take_profit: holding.plan_take_profit == null ? "" : String(holding.plan_take_profit),
      plan_max_position_pct: holding.plan_max_position_pct == null ? "" : String(holding.plan_max_position_pct),
      notes: holding.notes ?? "",
      status: holding.status,
    });
  }

  function resetStrategyForm() {
    setStrategyForm(EMPTY_STRATEGY_FORM);
  }

  function markLocalMutation() {
    localMutationVersionRef.current += 1;
  }

  useEffect(() => {
    if (focusTarget === "strategy_price") {
      strategyPriceInputRef.current?.focus();
      strategyPriceInputRef.current?.select();
      setFocusTarget(null);
    }
  }, [focusTarget]);

  useEffect(() => {
    if (!initialPrefill?.stock_code && !initialPrefill?.stock_name) {
      return;
    }
    setSearchQuery(prefillLabel);
    setStrategyForm((prev) => ({
      ...prev,
      id: undefined,
      strategy_key: initialPrefill.strategy_key || prev.strategy_key,
      stock_code: initialPrefill.stock_code ?? prev.stock_code,
      stock_name: initialPrefill.stock_name ?? prev.stock_name,
      quantity: initialPrefill.quantity ?? prev.quantity,
      entry_price: initialPrefill.cost_price ?? prev.entry_price,
      source_topic: initialPrefill.source_topic ?? prev.source_topic,
      plan_reason: initialPrefill.plan_reason ?? prev.plan_reason,
      plan_entry_trigger: initialPrefill.plan_entry_trigger ?? prev.plan_entry_trigger,
      plan_entry_zone: initialPrefill.plan_entry_zone ?? prev.plan_entry_zone,
      plan_stop_loss: initialPrefill.plan_stop_loss ?? prev.plan_stop_loss,
      plan_take_profit: initialPrefill.plan_take_profit ?? prev.plan_take_profit,
      plan_max_position_pct: initialPrefill.plan_max_position_pct ?? prev.plan_max_position_pct,
      status: (initialPrefill.status as StrategyFormState["status"]) ?? prev.status,
    }));
    setFocusTarget("strategy_price");
    setMessage(`已从计划入口带入 ${prefillLabel}，补充后即可按计划录入策略持股。`);
  }, [initialPrefill, prefillLabel]);

  useEffect(() => {
    if (!loaded || !unlocked || initialLoadInFlightRef.current) {
      return;
    }
    if (safeStrategyAnalysis.holdings.length && marketRegime) {
      return;
    }
    initialLoadInFlightRef.current = true;
    const requestMutationVersion = localMutationVersionRef.current;
    setIsAnalysisRefreshing(true);
    setMarketRegimeLoading(true);
    setMarketRegimeError(null);
    void Promise.allSettled([
      getStrategyHoldingsAnalysis(),
      getMarketRegime(),
    ])
      .then(([analysisResult, marketRegimeResult]) => {
        if (analysisResult.status === "fulfilled") {
          if (localMutationVersionRef.current === requestMutationVersion) {
            const analysis = normalizeStrategyAnalysis(analysisResult.value);
            setStrategyAnalysis(analysis);
            setStrategyHoldings(toHoldingList(analysis));
          }
        }
        if (marketRegimeResult.status === "fulfilled") {
          setMarketRegime(marketRegimeResult.value);
        } else {
          setMarketRegime(null);
          setMarketRegimeError(
            marketRegimeResult.reason instanceof Error
              ? `市场状态暂时不可用：${marketRegimeResult.reason.message}`
              : "市场状态暂时不可用",
          );
        }
      })
      .finally(() => {
        initialLoadInFlightRef.current = false;
        setIsAnalysisRefreshing(false);
        setMarketRegimeLoading(false);
      });
  }, [loaded, unlocked, safeStrategyAnalysis.holdings.length, marketRegime]);

  function applySearchResult(item: StockSearchResult) {
    setSearchQuery(item.name);
    setSearchResults([]);
    setStrategyForm((prev) => ({
      ...prev,
      id: undefined,
      stock_code: item.code,
      stock_name: item.name,
    }));
    setFocusTarget("strategy_price");
    setMessage(`已将 ${item.name} (${item.code}) 带入策略持股表单。`);
  }

  function toHoldingList(analysis: StrategyHoldingAnalysisResponse) {
    return normalizeStrategyAnalysis(analysis).holdings.map((item) => item.holding);
  }

  function recalculateAnalysisSummary(holdings: StrategyHoldingAnalysisResponse["holdings"]): StrategyHoldingAnalysisResponse {
    const investedHoldings = holdings.filter((item) => item.holding.status !== "watching" && item.holding.status !== "planned");
    const total_cost = investedHoldings.reduce((sum, item) => sum + item.holding.entry_price * item.holding.quantity, 0);
    const total_market_value = investedHoldings.reduce((sum, item) => sum + item.market_value, 0);
    const total_realized_pnl = investedHoldings.reduce((sum, item) => sum + item.realized_pnl, 0);
    const active_count = holdings.filter((item) => item.holding.status === "holding" || item.holding.status === "weakening").length;
    const watching_count = holdings.filter((item) => item.holding.status === "watching").length;
    const planned_count = holdings.filter((item) => item.holding.status === "planned").length;
    const weakening_count = holdings.filter((item) => item.holding.status === "weakening").length;
    const exited_count = holdings.filter((item) => item.holding.status === "exited").length;
    const invalidated_count = holdings.filter((item) => item.holding.status === "invalidated").length;
    const exited_win_count = holdings.filter((item) => item.holding.status === "exited" && item.realized_pnl > 0).length;
    const average_score = holdings.length
      ? holdings.reduce((sum, item) => sum + item.strategy_score.total, 0) / holdings.length
      : 0;
    const total_pnl = total_market_value - total_cost;
    const total_pnl_pct = total_cost ? (total_pnl / total_cost) * 100 : 0;
    const win_rate_pct = exited_count ? (exited_win_count / exited_count) * 100 : 0;

    return {
      total_cost,
      total_market_value,
      total_pnl,
      total_pnl_pct,
      total_realized_pnl,
      holding_count: holdings.length,
      active_count,
      watching_count,
      planned_count,
      weakening_count,
      exited_count,
      invalidated_count,
      win_rate_pct,
      average_score,
      todo_items: buildTodoItems(holdings),
      review_items: buildReviewItems(holdings),
      holdings,
    };
  }

  async function refreshStrategyAnalysis(options?: { successMessage?: string; errorPrefix?: string }) {
    setIsAnalysisRefreshing(true);
    try {
      const latest = await getStrategyHoldingsAnalysis();
      setStrategyAnalysis(normalizeStrategyAnalysis(latest));
      setStrategyHoldings(toHoldingList(latest));
      if (options?.successMessage) {
        setMessage(options.successMessage);
      }
    } catch (error) {
      setMessage(`${options?.errorPrefix ?? "刷新失败"}: ${getClientErrorMessage(error)}`);
    } finally {
      setIsAnalysisRefreshing(false);
    }
  }

  function syncHoldingInAnalysis(updatedHolding: StrategyHolding) {
    setStrategyAnalysis((prev) => {
      const existing = prev.holdings.find((item) => item.holding.id === updatedHolding.id);
      const nextItem = buildLocalHoldingAnalysis(updatedHolding, existing);
      const nextHoldings = existing
        ? prev.holdings.map((item) => (item.holding.id === updatedHolding.id ? nextItem : item))
        : [nextItem, ...prev.holdings];
      return recalculateAnalysisSummary(nextHoldings);
    });
  }

  function removeHoldingFromAnalysis(holdingId: number) {
    setStrategyAnalysis((prev) =>
      recalculateAnalysisSummary(prev.holdings.filter((item) => item.holding.id !== holdingId)),
    );
  }

  function currentDateLabel() {
    return new Date().toISOString().slice(0, 10);
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setPendingAction({ type: "search" });
    setMessage(`正在搜索 ${searchQuery.trim()}...`);
    void (async () => {
      try {
        const results = await searchStocks(searchQuery.trim());
        setSearchResults(results);
        setMessage(results.length ? `找到 ${results.length} 条匹配结果。` : "没有找到匹配股票。");
      } catch (error) {
        setMessage(`搜索失败: ${getClientErrorMessage(error)}`);
      } finally {
        setPendingAction(null);
      }
    })();
  }

  function onSubmitStrategy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entryPrice = Number(strategyForm.entry_price);
    const quantity = Number(strategyForm.quantity);
    if (!strategyForm.stock_code.trim() || !strategyForm.stock_name.trim()) {
      setMessage("请填写股票代码与名称。");
      return;
    }
    if (!Number.isFinite(entryPrice) || !Number.isFinite(quantity)) {
      setMessage("请填写有效的计划价/成本与数量（数字）。");
      return;
    }
    const payload: StrategyHolding = {
      strategy_key: strategyForm.strategy_key,
      stock_code: strategyForm.stock_code.trim(),
      stock_name: strategyForm.stock_name.trim(),
      entry_price: entryPrice,
      quantity,
      entry_date: strategyForm.entry_date || null,
      exit_price: strategyForm.exit_price ? Number(strategyForm.exit_price) : null,
      exit_date: strategyForm.exit_date || null,
      source_topic: strategyForm.source_topic || null,
      plan_reason: strategyForm.plan_reason || null,
      plan_entry_trigger: strategyForm.plan_entry_trigger || null,
      plan_entry_zone: strategyForm.plan_entry_zone || null,
      plan_stop_loss: strategyForm.plan_stop_loss ? Number(strategyForm.plan_stop_loss) : null,
      plan_take_profit: strategyForm.plan_take_profit ? Number(strategyForm.plan_take_profit) : null,
      plan_max_position_pct: strategyForm.plan_max_position_pct ? Number(strategyForm.plan_max_position_pct) : null,
      notes: strategyForm.notes || null,
      status: strategyForm.status,
    };

    const isEditing = Boolean(strategyForm.id);
    setPendingAction({ type: isEditing ? "update" : "create" });
    setMessage(isEditing ? `正在保存 ${payload.stock_name}...` : `正在加入 ${payload.stock_name}...`);
    void (async () => {
      try {
        if (strategyForm.id) {
          const updated = await updateStrategyHolding(strategyForm.id, payload);
          markLocalMutation();
          const nextHoldings = strategyHoldings.map((item) => (item.id === strategyForm.id ? updated : item));
          setStrategyHoldings(nextHoldings);
          syncHoldingInAnalysis(updated);
          setMessage(`已更新 ${updated.stock_name} 策略持股，可手动刷新分析。`);
          setLastSubmitted({ stock_code: updated.stock_code, stock_name: updated.stock_name });
        } else {
          const created = await createStrategyHolding(payload);
          markLocalMutation();
          setStrategyHoldings((prev) => [created, ...prev]);
          syncHoldingInAnalysis(created);
          setMessage(`已新增 ${created.stock_name} 策略持股，可手动刷新分析。`);
          setLastSubmitted({ stock_code: created.stock_code, stock_name: created.stock_name });
        }
        resetStrategyForm();
      } catch (error) {
        setMessage(`提交失败: ${getClientErrorMessage(error)}`);
      } finally {
        setPendingAction(null);
      }
    })();
  }

  function onDeleteStrategy(holding: StrategyHolding) {
    if (!holding.id) {
      return;
    }
    const holdingId = holding.id;
    setPendingAction({ type: "delete", holdingId });
    setMessage(`正在移除 ${holding.stock_name}...`);
    void (async () => {
      try {
        await deleteStrategyHolding(holdingId);
        markLocalMutation();
        const nextHoldings = strategyHoldings.filter((item) => item.id !== holdingId);
        setStrategyHoldings(nextHoldings);
        removeHoldingFromAnalysis(holdingId);
        setMessage(`已移除 ${holding.stock_name}，可手动刷新分析。`);
        if (strategyForm.id === holdingId) {
          resetStrategyForm();
        }
      } catch (error) {
        setMessage(`删除失败: ${getClientErrorMessage(error)}`);
      } finally {
        setPendingAction(null);
      }
    })();
  }

  function onRefreshStrategyAnalysis() {
    setPendingAction({ type: "refresh" });
    setMessage("正在刷新策略持股分析...");
    setMarketRegimeLoading(true);
    setMarketRegimeError(null);
    void (async () => {
      try {
        const [latestResult, marketRegimeResult] = await Promise.allSettled([
          getStrategyHoldingsAnalysis(),
          getMarketRegime(),
        ]);
        if (latestResult.status === "fulfilled") {
          const latest = normalizeStrategyAnalysis(latestResult.value);
          setStrategyAnalysis(latest);
          setStrategyHoldings(toHoldingList(latest));
        } else {
          throw latestResult.reason;
        }
        if (marketRegimeResult.status === "fulfilled") {
          setMarketRegime(marketRegimeResult.value);
        } else {
          setMarketRegime(null);
          setMarketRegimeError(
            marketRegimeResult.reason instanceof Error
              ? `市场状态暂时不可用：${marketRegimeResult.reason.message}`
              : "市场状态暂时不可用",
          );
        }
        setMessage("已刷新策略持股分析。");
      } catch (error) {
        setMessage(`刷新失败: ${getClientErrorMessage(error)}`);
      } finally {
        setMarketRegimeLoading(false);
        setPendingAction(null);
      }
    })();
  }

  function onQuickExit(holding: StrategyHolding, exitPrice: number) {
    if (!holding.id) {
      return;
    }
    const holdingId = holding.id;
    setPendingAction({ type: "exit", holdingId });
    setMessage(`正在将 ${holding.stock_name} 标记为退出...`);
    void (async () => {
      try {
        const updated = await updateStrategyHolding(holdingId, {
          ...holding,
          exit_price: exitPrice,
          exit_date: currentDateLabel(),
          status: "exited",
        });
        markLocalMutation();
        const nextHoldings = strategyHoldings.map((item) => (item.id === holdingId ? updated : item));
        setStrategyHoldings(nextHoldings);
        syncHoldingInAnalysis(updated);
        setMessage(`已将 ${holding.stock_name} 按当前价 ${exitPrice.toFixed(2)} 标记为退出，可手动刷新分析。`);
      } catch (error) {
        setMessage(`退出失败: ${getClientErrorMessage(error)}`);
      } finally {
        setPendingAction(null);
      }
    })();
  }

  function onActivatePosition(holding: StrategyHolding, entryPrice: number) {
    if (!holding.id) {
      return;
    }
    const holdingId = holding.id;
    setPendingAction({ type: "update" });
    setMessage(`正在将 ${holding.stock_name} 转为持仓...`);
    void (async () => {
      try {
        const updated = await updateStrategyHolding(holdingId, {
          ...holding,
          entry_price: entryPrice || holding.entry_price,
          entry_date: currentDateLabel(),
          status: "holding",
        });
        markLocalMutation();
        const nextHoldings = strategyHoldings.map((item) => (item.id === holdingId ? updated : item));
        setStrategyHoldings(nextHoldings);
        syncHoldingInAnalysis(updated);
        setMessage(`已将 ${holding.stock_name} 按当前价转为持仓，可手动刷新分析。`);
      } catch (error) {
        setMessage(`转持仓失败: ${getClientErrorMessage(error)}`);
      } finally {
        setPendingAction(null);
      }
    })();
  }

  function onMarkWeakening(holding: StrategyHolding) {
    if (!holding.id) {
      return;
    }
    const holdingId = holding.id;
    setPendingAction({ type: "update" });
    setMessage(`正在将 ${holding.stock_name} 标记为走弱...`);
    void (async () => {
      try {
        const updated = await updateStrategyHolding(holdingId, {
          ...holding,
          status: "weakening",
        });
        markLocalMutation();
        const nextHoldings = strategyHoldings.map((item) => (item.id === holdingId ? updated : item));
        setStrategyHoldings(nextHoldings);
        syncHoldingInAnalysis(updated);
        setMessage(`已将 ${holding.stock_name} 标记为走弱，可手动刷新分析。`);
      } catch (error) {
        setMessage(`标记走弱失败: ${getClientErrorMessage(error)}`);
      } finally {
        setPendingAction(null);
      }
    })();
  }

  function onMoveToPlanned(holding: StrategyHolding) {
    if (!holding.id) {
      return;
    }
    const holdingId = holding.id;
    setPendingAction({ type: "update" });
    setMessage(`正在将 ${holding.stock_name} 升级为待执行计划...`);
    void (async () => {
      try {
        const updated = await updateStrategyHolding(holdingId, {
          ...holding,
          status: "planned",
        });
        markLocalMutation();
        const nextHoldings = strategyHoldings.map((item) => (item.id === holdingId ? updated : item));
        setStrategyHoldings(nextHoldings);
        syncHoldingInAnalysis(updated);
        setMessage(`已将 ${holding.stock_name} 升级为待执行计划，可手动刷新分析。`);
      } catch (error) {
        setMessage(`升级计划失败: ${getClientErrorMessage(error)}`);
      } finally {
        setPendingAction(null);
      }
    })();
  }

  function onMarkInvalidated(holding: StrategyHolding) {
    if (!holding.id) {
      return;
    }
    const holdingId = holding.id;
    setPendingAction({ type: "invalidate", holdingId });
    setMessage(`正在将 ${holding.stock_name} 标记为失效...`);
    void (async () => {
      try {
        const updated = await updateStrategyHolding(holdingId, {
          ...holding,
          status: "invalidated",
          exit_price: null,
          exit_date: null,
        });
        markLocalMutation();
        const nextHoldings = strategyHoldings.map((item) => (item.id === holdingId ? updated : item));
        setStrategyHoldings(nextHoldings);
        syncHoldingInAnalysis(updated);
        setMessage(`已将 ${holding.stock_name} 标记为策略失效，可手动刷新分析。`);
      } catch (error) {
        setMessage(`标记失败: ${getClientErrorMessage(error)}`);
      } finally {
        setPendingAction(null);
      }
    })();
  }

  if (loaded && !unlocked) {
    return (
      <section className="panel section">
        <DemoAccessGate title="策略持股已锁定" description="解锁后可以录入策略持股、编辑仓位并查看策略分析。" />
      </section>
    );
  }

  return (
    <div className="stack">
      <MarketRegimeBanner
        marketRegime={marketRegime}
        compact
        isLoading={marketRegimeLoading}
        error={marketRegimeError}
      />

      <section className="content-grid">
        <div className="panel section">
          <h2>策略总览</h2>
          <div className="metric-grid">
            <div className="card">
              <div className="muted">策略持股总成本</div>
              <strong>{safeStrategyAnalysis.total_cost.toFixed(2)}</strong>
            </div>
            <div className="card">
              <div className="muted">策略持股总盈亏</div>
              <strong className={safeStrategyAnalysis.total_pnl >= 0 ? "signal-up" : "signal-down"}>
                {safeStrategyAnalysis.total_pnl.toFixed(2)}
              </strong>
            </div>
            <div className="card">
              <div className="muted">策略已实现收益</div>
              <strong className={safeStrategyAnalysis.total_realized_pnl >= 0 ? "signal-up" : "signal-down"}>
                {safeStrategyAnalysis.total_realized_pnl.toFixed(2)}
              </strong>
            </div>
            <div className="card">
              <div className="muted">策略胜率</div>
              <strong>{safeStrategyAnalysis.win_rate_pct.toFixed(2)}%</strong>
            </div>
          </div>
          <div className="inline-actions" style={{ marginTop: 16 }}>
            <span className="tag">策略持股数量: {safeStrategyAnalysis.holdings.length}</span>
            <span className="tag">持仓中: {safeStrategyAnalysis.active_count}</span>
            <span className="tag">待执行: {safeStrategyAnalysis.planned_count}</span>
            <span className="tag">观察中: {safeStrategyAnalysis.watching_count}</span>
            {isAnalysisRefreshing ? <span className="tag">分析刷新中...</span> : null}
          </div>
          <p className="muted" style={{ marginTop: 16 }}>{message}</p>
          {initialPrefill?.return_to || lastSubmitted ? (
            <div className="inline-actions" style={{ marginTop: 12 }}>
              {initialPrefill?.return_to ? (
                <Link href={initialPrefill.return_to} className="button ghost">
                  返回{initialPrefill.return_label || "来源页"}
                </Link>
              ) : null}
              {lastSubmitted ? (
                <Link href={`/stocks?query=${encodeURIComponent(lastSubmitted.stock_code)}&panel=overview#overview`} className="button">
                  继续分析 {lastSubmitted.stock_name}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="panel section">
          <form className="stack" onSubmit={onSearch}>
            <label className="label">
              搜索股票（可选，带入下方表单）
              <div className="inline-actions">
                <input
                  className="input"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="代码或名称，如 sh600036"
                />
                <button className="button ghost" type="submit" disabled={isBusy}>
                  {pendingAction?.type === "search" ? "搜索中…" : "搜索"}
                </button>
              </div>
            </label>
          </form>

          {searchResults.length ? (
            <div className="search-results" style={{ marginBottom: 18 }}>
              {searchResults.slice(0, 6).map((item) => (
                <div className="result-button" key={`${item.code}-${item.match_type}`}>
                  <strong>{item.name} ({item.code})</strong>
                  <span className="muted">{item.market} · {item.category || "未分类"} · 搜索评分 {item.score}</span>
                  <div className="inline-actions" style={{ marginTop: 12 }}>
                    <button className="button" onClick={() => applySearchResult(item)} type="button">
                      填入表单
                    </button>
                    <Link href={`/stocks?query=${encodeURIComponent(item.code)}`} className="button ghost">
                      查看股票
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <form className="stack" onSubmit={onSubmitStrategy} style={{ marginTop: 18 }}>
            <div>
              <h2 style={{ marginBottom: 6 }}>{strategyForm.id ? "编辑策略持股" : "新增策略持股"}</h2>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                {strategyForm.id
                  ? "改完点保存；计划细节在下方折叠里。"
                  : "只需代码、名称、成本、股数；其它字段点「展开」再填。"}
              </p>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
              策略：CAN SLIM
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "12px 16px",
              }}
            >
              <label className="label" style={{ marginBottom: 0 }}>
                代码
                <input
                  className="input"
                  value={strategyForm.stock_code}
                  onChange={(event) => setStrategyForm((prev) => ({ ...prev, stock_code: event.target.value }))}
                  placeholder="sh600036"
                  autoComplete="off"
                  required
                />
              </label>
              <label className="label" style={{ marginBottom: 0 }}>
                名称
                <input
                  className="input"
                  value={strategyForm.stock_name}
                  onChange={(event) => setStrategyForm((prev) => ({ ...prev, stock_name: event.target.value }))}
                  placeholder="招商银行"
                  autoComplete="off"
                  required
                />
              </label>
              <label className="label" style={{ marginBottom: 0 }}>
                成本价
                <input
                  className="input"
                  ref={strategyPriceInputRef}
                  type="number"
                  min="0"
                  step="0.01"
                  value={strategyForm.entry_price}
                  onChange={(event) => setStrategyForm((prev) => ({ ...prev, entry_price: event.target.value }))}
                  required
                />
              </label>
              <label className="label" style={{ marginBottom: 0 }}>
                股数
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={strategyForm.quantity}
                  onChange={(event) => setStrategyForm((prev) => ({ ...prev, quantity: event.target.value }))}
                  required
                />
              </label>
            </div>

            <details open={Boolean(strategyForm.id)} style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, listStyle: "none" }}>计划与风控（选填）</summary>
              <div className="stack" style={{ marginTop: 14, gap: 12 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "12px 16px",
                  }}
                >
                  <label className="label" style={{ marginBottom: 0 }}>
                    买入日
                    <input
                      className="input"
                      type="date"
                      value={strategyForm.entry_date}
                      onChange={(event) => setStrategyForm((prev) => ({ ...prev, entry_date: event.target.value }))}
                    />
                  </label>
                  <label className="label" style={{ marginBottom: 0 }}>
                    状态
                    <select
                      className="input"
                      value={strategyForm.status}
                      onChange={(event) =>
                        setStrategyForm((prev) => ({ ...prev, status: event.target.value as StrategyFormState["status"] }))
                      }
                    >
                      <option value="watching">观察中</option>
                      <option value="planned">待执行</option>
                      <option value="holding">持有中</option>
                      <option value="weakening">走弱中</option>
                      <option value="exited">已退出</option>
                      <option value="invalidated">已失效</option>
                    </select>
                  </label>
                </div>
                {strategyForm.status === "exited" ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "12px 16px",
                    }}
                  >
                    <label className="label" style={{ marginBottom: 0 }}>
                      卖出价
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={strategyForm.exit_price}
                        onChange={(event) => setStrategyForm((prev) => ({ ...prev, exit_price: event.target.value }))}
                      />
                    </label>
                    <label className="label" style={{ marginBottom: 0 }}>
                      卖出日
                      <input
                        className="input"
                        type="date"
                        value={strategyForm.exit_date}
                        onChange={(event) => setStrategyForm((prev) => ({ ...prev, exit_date: event.target.value }))}
                      />
                    </label>
                  </div>
                ) : null}
                <label className="label">
                  来源主题
                  <input
                    className="input"
                    value={strategyForm.source_topic}
                    onChange={(event) => setStrategyForm((prev) => ({ ...prev, source_topic: event.target.value }))}
                    placeholder="如：AI 算力"
                  />
                </label>
                <label className="label">
                  买入逻辑
                  <input
                    className="input"
                    value={strategyForm.plan_reason}
                    onChange={(event) => setStrategyForm((prev) => ({ ...prev, plan_reason: event.target.value }))}
                    placeholder="一句话说明"
                  />
                </label>
                <label className="label">
                  入场方式
                  <input
                    className="input"
                    value={strategyForm.plan_entry_trigger}
                    onChange={(event) => setStrategyForm((prev) => ({ ...prev, plan_entry_trigger: event.target.value }))}
                    placeholder="如：回踩 MA20"
                  />
                </label>
                <label className="label">
                  计划买点区间
                  <input
                    className="input"
                    value={strategyForm.plan_entry_zone}
                    onChange={(event) => setStrategyForm((prev) => ({ ...prev, plan_entry_zone: event.target.value }))}
                    placeholder="如：118–122"
                  />
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "12px 16px",
                  }}
                >
                  <label className="label" style={{ marginBottom: 0 }}>
                    止损价
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={strategyForm.plan_stop_loss}
                      onChange={(event) => setStrategyForm((prev) => ({ ...prev, plan_stop_loss: event.target.value }))}
                    />
                  </label>
                  <label className="label" style={{ marginBottom: 0 }}>
                    目标价
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={strategyForm.plan_take_profit}
                      onChange={(event) => setStrategyForm((prev) => ({ ...prev, plan_take_profit: event.target.value }))}
                    />
                  </label>
                </div>
                <label className="label">
                  建议最大仓位 %
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.1"
                    value={strategyForm.plan_max_position_pct}
                    onChange={(event) => setStrategyForm((prev) => ({ ...prev, plan_max_position_pct: event.target.value }))}
                    placeholder="如：15"
                  />
                </label>
                <label className="label">
                  备注
                  <input
                    className="input"
                    value={strategyForm.notes}
                    onChange={(event) => setStrategyForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="可选"
                  />
                </label>
              </div>
            </details>
            <div className="inline-actions" style={{ marginTop: 4 }}>
              <button className="button" type="submit" disabled={isBusy}>
                {pendingAction?.type === "update"
                  ? "保存中…"
                  : pendingAction?.type === "create"
                    ? "提交中…"
                    : strategyForm.id
                      ? "保存"
                      : "添加持股"}
              </button>
              <button className="button ghost" type="button" onClick={resetStrategyForm} disabled={isBusy}>
                清空
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="panel section">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h2>策略持股</h2>
            <p className="muted">记录按策略买入的模型组合，并按需手动刷新评分与盈亏。</p>
          </div>
          <div className="inline-actions">
            <button className="button ghost" type="button" onClick={onRefreshStrategyAnalysis} disabled={isBusy || isAnalysisRefreshing}>
              {pendingAction?.type === "refresh" || isAnalysisRefreshing ? "刷新中..." : "刷新策略持股"}
            </button>
          </div>
        </div>
        {safeStrategyAnalysis.holdings.length ? (
          <>
            {safeStrategyAnalysis.todo_items.length ? (
              <section className="strategy-summary-block" style={{ marginTop: 16 }}>
                <div className="detail-block-head">
                  <h3>今日待处理</h3>
                  <span className="muted">优先处理最关键的交易动作</span>
                </div>
                <div className="stack" style={{ gap: 10 }}>
                  {safeStrategyAnalysis.todo_items.map((item) => (
                    <div className="card" key={`${item.holding_id}-${item.stock_code}-${item.action_label}`}>
                      <strong>{item.stock_name} ({item.stock_code})</strong>
                      <div className="tag-list" style={{ marginTop: 8 }}>
                        <span className="tag">{statusLabel(item.status as StrategyHolding["status"])}</span>
                        <span className="tag">动作 {item.action_label}</span>
                      </div>
                      <p className="muted" style={{ marginTop: 8 }}>{item.action_reason}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {safeStrategyAnalysis.review_items.length ? (
              <section className="strategy-summary-block" style={{ marginTop: 16 }}>
                <div className="detail-block-head">
                  <h3>近期复盘</h3>
                  <span className="muted">退出和失效记录优先沉淀复盘结论</span>
                </div>
                <div className="position-grid">
                  {safeStrategyAnalysis.review_items.map((item) => (
                    <div className="card" key={`${item.holding_id}-${item.stock_code}-${item.outcome_label}`}>
                      <strong>{item.stock_name} ({item.stock_code})</strong>
                      <div className="tag-list" style={{ marginTop: 8 }}>
                        <span className="tag">{item.outcome_label}</span>
                        <span className="tag">{statusLabel(item.status as StrategyHolding["status"])}</span>
                      </div>
                      <p className="muted" style={{ marginTop: 8 }}>{item.summary}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="metric-grid" style={{ marginTop: 16, marginBottom: 18, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div className="card">
                <div className="muted">持仓中</div>
                <strong>{safeStrategyAnalysis.active_count}</strong>
              </div>
              <div className="card">
                <div className="muted">待处理</div>
                <strong>{safeStrategyAnalysis.planned_count + safeStrategyAnalysis.watching_count + safeStrategyAnalysis.weakening_count}</strong>
                <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  待执行 {safeStrategyAnalysis.planned_count} · 观察中 {safeStrategyAnalysis.watching_count} · 走弱中 {safeStrategyAnalysis.weakening_count}
                </p>
              </div>
              <div className="card">
                <div className="muted">已结束</div>
                <strong>{safeStrategyAnalysis.exited_count + safeStrategyAnalysis.invalidated_count}</strong>
                <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  已退出 {safeStrategyAnalysis.exited_count} · 已失效 {safeStrategyAnalysis.invalidated_count}
                </p>
              </div>
              <div className="card">
                <div className="muted">平均策略分</div>
                <strong>{safeStrategyAnalysis.average_score.toFixed(2)}</strong>
              </div>
            </div>
            <div className="stack" style={{ gap: 18 }}>
              {HOLDING_STATUS_GROUPS.map((group) => {
                const items = safeStrategyAnalysis.holdings.filter((item) => item.holding.status === group.key);
                if (!items.length) {
                  return null;
                }
                return (
                  <section className="stack" key={group.key} style={{ gap: 12 }}>
                    <div>
                      <h3>{group.title}</h3>
                      <p className="muted">{group.description}</p>
                    </div>
                    <div className="position-grid portfolio-holding-grid">
                      {items.map((item) => (
                        <div className="card portfolio-holding-card" key={`${item.holding.id}-${item.holding.stock_code}`}>
                          <h3>{item.holding.stock_name} ({item.holding.stock_code})</h3>
                          <p className="muted">
                            {item.holding.strategy_key} · 计划价/成本 {item.holding.entry_price.toFixed(2)} · 数量 {item.holding.quantity}
                          </p>
                          <div className="portfolio-key-metrics">
                            <div className="card portfolio-key-metric">
                              <div className="muted portfolio-key-metric-label">动作</div>
                              <strong>{item.action_label}</strong>
                            </div>
                            <div className="card portfolio-key-metric">
                              <div className="muted portfolio-key-metric-label">现价</div>
                              <strong>{item.current_price.toFixed(2)}</strong>
                            </div>
                            <div className="card portfolio-key-metric">
                              <div className="muted portfolio-key-metric-label">总分</div>
                              <strong>{item.strategy_score.total.toFixed(1)}</strong>
                            </div>
                            <div className="card portfolio-key-metric">
                              <div className="muted portfolio-key-metric-label">状态</div>
                              <strong>{statusLabel(item.holding.status)}</strong>
                            </div>
                          </div>
                          {item.holding.status === "watching" || item.holding.status === "planned" ? (
                            <p className="muted" style={{ marginTop: 10 }}>当前未正式买入，跟踪触发条件。</p>
                          ) : (
                            <p className={item.pnl >= 0 ? "signal-up" : "signal-down"} style={{ marginTop: 10 }}>
                              浮动盈亏 {item.pnl.toFixed(2)} ({item.pnl_pct.toFixed(2)}%)
                            </p>
                          )}
                          {item.holding.status === "exited" ? (
                            <p className={item.realized_pnl >= 0 ? "signal-up" : "signal-down"}>
                              已实现 {item.realized_pnl.toFixed(2)} ({item.realized_pnl_pct.toFixed(2)}%)
                            </p>
                          ) : null}

                          <div className="portfolio-canslim">
                            <div className="portfolio-canslim-title">CANSLIM</div>
                            <div className="portfolio-canslim-grid">
                              {([
                                ["C", item.strategy_score.c],
                                ["A", item.strategy_score.a],
                                ["N", item.strategy_score.n],
                                ["S", item.strategy_score.s],
                                ["L", item.strategy_score.l],
                                ["I", item.strategy_score.i],
                                ["M", item.strategy_score.m],
                              ] as const).map(([label, score]) => (
                                <div key={`${item.holding.id}-${label}`} className="portfolio-canslim-item">
                                  <div className="portfolio-canslim-item-head">
                                    <span>{label}</span>
                                    <span>{score.toFixed(0)}</span>
                                  </div>
                                  <div className="portfolio-canslim-track">
                                    <div
                                      style={{
                                        width: `${Math.max(0, Math.min(100, score))}%`,
                                        height: "100%",
                                        background: scoreTone(score),
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="stack portfolio-risk-list">
                            {buildRiskNotes(item).map((risk) => (
                              <div className="muted portfolio-risk-item" key={`${item.holding.id}-${risk}`}>
                                {risk}
                              </div>
                            ))}
                          </div>

                          {item.holding.source_topic || item.holding.plan_reason || item.holding.plan_entry_trigger ? (
                            <div className="strategy-plan-card" style={{ marginTop: 12 }}>
                              <div className="detail-block-head">
                                <h3>交易计划快照</h3>
                                {item.holding.source_topic ? <span className="muted">主题 {item.holding.source_topic}</span> : null}
                              </div>
                              <div className="tag-list">
                                {item.holding.plan_entry_trigger ? <span className="tag">入场 {item.holding.plan_entry_trigger}</span> : null}
                                {item.holding.plan_entry_zone ? <span className="tag">买点 {item.holding.plan_entry_zone}</span> : null}
                                {item.holding.plan_stop_loss != null ? <span className="tag">止损 {item.holding.plan_stop_loss.toFixed(2)}</span> : null}
                                {item.holding.plan_take_profit != null ? <span className="tag">目标 {item.holding.plan_take_profit.toFixed(2)}</span> : null}
                                {item.holding.plan_max_position_pct != null ? <span className="tag">最大仓位 {item.holding.plan_max_position_pct.toFixed(1)}%</span> : null}
                              </div>
                              {item.holding.plan_reason ? <p className="muted" style={{ marginTop: 10 }}>{item.holding.plan_reason}</p> : null}
                            </div>
                          ) : null}
                          <div className="inline-actions" style={{ marginTop: 12 }}>
                            {(item.holding.status === "watching" || item.holding.status === "planned") ? (
                              <button className="button" type="button" onClick={() => onActivatePosition(item.holding, item.current_price)} disabled={isBusy}>
                                按当前价买入
                              </button>
                            ) : null}
                            {item.holding.status === "watching" ? (
                              <button className="button ghost" type="button" onClick={() => onMoveToPlanned(item.holding)} disabled={isBusy}>
                                升级计划
                              </button>
                            ) : null}
                            {(item.holding.status === "holding" || item.holding.status === "weakening" || item.holding.status === "invalidated") ? (
                              <button className="button" type="button" onClick={() => onQuickExit(item.holding, item.current_price)} disabled={isBusy}>
                                {pendingAction?.type === "exit" && pendingAction.holdingId === item.holding.id ? "退出中..." : "按当前价退出"}
                              </button>
                            ) : null}
                          </div>
                          <details style={{ marginTop: 10 }}>
                            <summary style={{ cursor: "pointer", fontWeight: 600 }}>更多操作与详情</summary>
                            <div className="inline-actions" style={{ marginTop: 10 }}>
                              {item.holding.status === "holding" ? (
                                <button className="button ghost" type="button" onClick={() => onMarkWeakening(item.holding)} disabled={isBusy}>
                                  标记走弱
                                </button>
                              ) : null}
                              {(item.holding.status === "holding" || item.holding.status === "weakening") ? (
                                <button className="button ghost" type="button" onClick={() => onMarkInvalidated(item.holding)} disabled={isBusy}>
                                  {pendingAction?.type === "invalidate" && pendingAction.holdingId === item.holding.id ? "标记中..." : "标记失效"}
                                </button>
                              ) : null}
                              <button className="button ghost" type="button" onClick={() => fillStrategyForm(item.holding)} disabled={isBusy}>编辑</button>
                              <button className="button ghost" type="button" onClick={() => onDeleteStrategy(item.holding)} disabled={isBusy}>
                                {pendingAction?.type === "delete" && pendingAction.holdingId === item.holding.id ? "移除中..." : "移除"}
                              </button>
                            </div>
                            {Object.keys(item.factor_notes).length ? (
                              <div className="strategy-factor-grid" style={{ marginTop: 12 }}>
                                {Object.entries(item.factor_notes).map(([key, note]) => (
                                  <div className="strategy-factor-card" key={`${item.holding.id}-${key}`}>
                                    <strong>{key.toUpperCase()}</strong>
                                    <p>{note}</p>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {item.invalidation_reason ? (
                              <div className="strategy-invalidation-note" style={{ marginTop: 12 }}>
                                {item.invalidation_reason}
                              </div>
                            ) : null}
                            {item.trigger_hits.length ? (
                              <div className="tag-list" style={{ marginTop: 10 }}>
                                {item.trigger_hits.map((trigger) => (
                                  <span className="tag" key={`${item.holding.id}-${trigger}`}>触发 {trigger}</span>
                                ))}
                              </div>
                            ) : null}
                          </details>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        ) : (
          <p className="muted" style={{ marginTop: 16 }}>当前还没有策略持股记录。</p>
        )}
      </section>
    </div>
  );
}

function statusLabel(status: StrategyHolding["status"]) {
  if (status === "watching") return "观察中";
  if (status === "planned") return "待执行";
  if (status === "holding") return "持有中";
  if (status === "weakening") return "走弱中";
  if (status === "exited") return "已退出";
  return "已失效";
}

function buildTodoItems(holdings: StrategyHoldingAnalysisResponse["holdings"]) {
  return holdings
    .map((item) => ({
      holding_id: item.holding.id ?? null,
      stock_code: item.holding.stock_code,
      stock_name: item.holding.stock_name,
      status: item.holding.status,
      action_label: item.action_label,
      action_reason: item.action_reason,
      priority: todoPriority(item.action_label),
    }))
    .filter((item) => item.priority > 0)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6);
}

function buildReviewItems(holdings: StrategyHoldingAnalysisResponse["holdings"]) {
  return holdings
    .filter((item) => item.holding.status === "exited" || item.holding.status === "invalidated")
    .map((item) => ({
      holding_id: item.holding.id ?? null,
      stock_code: item.holding.stock_code,
      stock_name: item.holding.stock_name,
      status: item.holding.status,
      outcome_label: item.holding.status === "invalidated" ? "假设失效" : item.realized_pnl >= 0 ? "正收益退出" : "亏损退出",
      summary:
        item.holding.status === "invalidated"
          ? "原交易假设已失效，建议复盘问题出在市场、主题还是执行。"
          : item.realized_pnl >= 0
            ? `该笔交易已实现 ${item.realized_pnl.toFixed(2)}，适合复盘盈利来自趋势还是纪律。`
            : `该笔交易已实现 ${item.realized_pnl.toFixed(2)}，建议复盘止损与买点执行。`,
    }))
    .slice(0, 6);
}

function todoPriority(actionLabel: string) {
  if (actionLabel === "触发卖出") return 100;
  if (actionLabel === "可执行买入") return 90;
  if (actionLabel === "暂停执行") return 85;
  if (actionLabel === "减仓观察") return 80;
  if (actionLabel === "升级计划") return 70;
  return 0;
}

function normalizeStrategyAnalysis(
  analysis: StrategyHoldingAnalysisResponse,
): StrategyHoldingAnalysisResponse {
  return {
    ...analysis,
    holdings: Array.isArray(analysis.holdings)
      ? analysis.holdings.map((item) => ({
          ...item,
          factor_notes: item?.factor_notes && typeof item.factor_notes === "object" ? item.factor_notes : {},
          trigger_hits: Array.isArray(item?.trigger_hits) ? item.trigger_hits : [],
          alerts: Array.isArray(item?.alerts) ? item.alerts : [],
          action_label: item?.action_label ?? "继续持有",
          action_reason: item?.action_reason ?? "",
          invalidation_reason: item?.invalidation_reason ?? null,
        }))
      : [],
    todo_items: Array.isArray(analysis.todo_items) ? analysis.todo_items : [],
    review_items: Array.isArray(analysis.review_items) ? analysis.review_items : [],
  };
}

function buildLocalHoldingAnalysis(
  holding: StrategyHolding,
  existing?: StrategyHoldingAnalysis,
): StrategyHoldingAnalysis {
  const currentPrice =
    holding.status === "exited" && holding.exit_price != null
      ? holding.exit_price
      : existing?.current_price ?? holding.entry_price;
  const isPrePosition = holding.status === "watching" || holding.status === "planned";
  const cost = holding.entry_price * holding.quantity;
  const marketValue = isPrePosition ? 0 : currentPrice * holding.quantity;
  const pnl = isPrePosition ? 0 : marketValue - cost;
  const realizedPnl =
    holding.status === "exited" && holding.exit_price != null
      ? (holding.exit_price - holding.entry_price) * holding.quantity
      : 0;

  return {
    holding,
    current_price: currentPrice,
    market_value: marketValue,
    pnl,
    pnl_pct: isPrePosition ? 0 : cost ? (pnl / cost) * 100 : 0,
    realized_pnl: realizedPnl,
    realized_pnl_pct: realizedPnl && cost ? (realizedPnl / cost) * 100 : 0,
    strategy_score: existing?.strategy_score ?? { c: 0, a: 0, n: 0, s: 0, l: 0, i: 0, m: 0, total: 0 },
    thesis_status:
      existing?.thesis_status ??
      (holding.status === "invalidated" ? "broken" : holding.status === "weakening" ? "weakening" : "active"),
    factor_notes:
      existing?.factor_notes ?? {
        data: "已保存本地记录，点击“刷新策略持股”获取最新评分与行情。",
      },
    invalidation_reason:
      holding.status === "invalidated"
        ? existing?.invalidation_reason ?? "该记录已被标记为策略失效。"
        : existing?.invalidation_reason ?? null,
    action_label: existing?.action_label ?? localActionLabel(holding.status),
    action_reason: existing?.action_reason ?? "本地记录已更新，点击“刷新策略持股”同步最新策略分析。",
    trigger_hits: existing?.trigger_hits ?? [],
    alerts:
      existing?.alerts ?? ["当前展示的是本地记录快照，最新评分与盈亏请手动刷新。"],
  };
}

function localActionLabel(status: StrategyHolding["status"]) {
  if (status === "watching") return "继续观察";
  if (status === "planned") return "等待触发";
  if (status === "weakening") return "减仓观察";
  if (status === "exited") return "已退出";
  if (status === "invalidated") return "触发卖出";
  return "继续持有";
}

function scoreTone(score: number) {
  if (score >= 80) return "linear-gradient(90deg, #10b981, #22c55e)";
  if (score >= 60) return "linear-gradient(90deg, #f59e0b, #fbbf24)";
  return "linear-gradient(90deg, #ef4444, #f87171)";
}

function buildRiskNotes(item: StrategyHoldingAnalysis) {
  const notes: string[] = [];
  const lowFactors = ([
    ["C", item.strategy_score.c],
    ["A", item.strategy_score.a],
    ["N", item.strategy_score.n],
    ["S", item.strategy_score.s],
    ["L", item.strategy_score.l],
    ["I", item.strategy_score.i],
    ["M", item.strategy_score.m],
  ] as const)
    .filter(([, score]) => score < 55)
    .map(([label]) => label);

  if (lowFactors.length) {
    notes.push(`CANSLIM 薄弱项：${lowFactors.join(" / ")}`);
  }
  if (item.invalidation_reason) {
    notes.push(item.invalidation_reason);
  }
  for (const alert of item.alerts) {
    if (notes.length >= 2) break;
    if (!notes.includes(alert)) notes.push(alert);
  }
  if (!notes.length && item.action_reason) {
    notes.push(item.action_reason);
  }
  return notes.slice(0, 2);
}
