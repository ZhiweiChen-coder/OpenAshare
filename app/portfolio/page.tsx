import { cookies } from "next/headers";

import { DemoAccessGate } from "@/components/demo-access-gate";
import { PortfolioShell } from "@/components/portfolio-shell";
import { DEMO_ACCESS_COOKIE_NAME } from "@/lib/demo-access";
import { getDemoAccessStatusFromToken } from "@/lib/demo-access-server";

type PageProps = {
  searchParams: Promise<{
    stock_code?: string;
    stock_name?: string;
    quantity?: string;
    cost_price?: string;
    focus?: string;
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
  }>;
};

export default async function PortfolioPage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const demoAccess = getDemoAccessStatusFromToken(cookieStore.get(DEMO_ACCESS_COOKIE_NAME)?.value);
  const prefills = await searchParams;
  if (!demoAccess.unlocked) {
    return (
      <section className="panel section">
        <DemoAccessGate title="策略持股已锁定" description="解锁后可以查看和编辑策略持股，并刷新策略分析。" />
      </section>
    );
  }

  return (
    <PortfolioShell
      initialStrategyHoldings={[]}
      initialStrategyAnalysis={{
        total_cost: 0,
        total_market_value: 0,
        total_pnl: 0,
        total_pnl_pct: 0,
        total_realized_pnl: 0,
        holding_count: 0,
        active_count: 0,
        watching_count: 0,
        planned_count: 0,
        weakening_count: 0,
        exited_count: 0,
        invalidated_count: 0,
        win_rate_pct: 0,
        average_score: 0,
        todo_items: [],
        review_items: [],
        holdings: [],
      }}
      initialMarketRegime={null}
      initialPrefill={prefills}
    />
  );
}
