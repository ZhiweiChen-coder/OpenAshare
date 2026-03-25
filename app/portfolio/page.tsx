import { cookies } from "next/headers";

import { DemoAccessGate } from "@/components/demo-access-gate";
import { PortfolioShell } from "@/components/portfolio-shell";
import { getPortfolioAnalysis, listPortfolioPositions } from "@/lib/api";
import { DEMO_ACCESS_COOKIE_NAME } from "@/lib/demo-access";
import { getDemoAccessStatusFromToken } from "@/lib/demo-access-server";

type PageProps = {
  searchParams: Promise<{
    stock_code?: string;
    stock_name?: string;
    quantity?: string;
    cost_price?: string;
    focus?: string;
  }>;
};

export default async function PortfolioPage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");
  const demoAccess = getDemoAccessStatusFromToken(cookieStore.get(DEMO_ACCESS_COOKIE_NAME)?.value);
  const prefills = await searchParams;
  if (!demoAccess.unlocked) {
    return (
      <section className="panel section">
        <DemoAccessGate title="持仓管理已锁定" description="解锁后可以查看和编辑持仓、刷新组合分析。" />
      </section>
    );
  }
  const [positions, analysis] = await Promise.all([
    listPortfolioPositions({ requestInit: { headers: { cookie: cookieHeader } } }).catch(() => []),
    getPortfolioAnalysis({ requestInit: { headers: { cookie: cookieHeader } } }).catch(() => ({
      total_cost: 0,
      total_market_value: 0,
      total_pnl: 0,
      total_pnl_pct: 0,
      concentration_risk: "unavailable",
      technical_risk: "unavailable",
      rebalance_suggestions: ["后端不可达时，组合分析会显示在这里。"],
      positions: [],
    })),
  ]);

  return <PortfolioShell initialPositions={positions} initialAnalysis={analysis} initialPrefill={prefills} />;
}
