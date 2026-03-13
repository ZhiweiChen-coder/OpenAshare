import { PortfolioShell } from "@/components/portfolio-shell";
import { getPortfolioAnalysis, listPortfolioPositions } from "@/lib/api";

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
  const prefills = await searchParams;
  const [positions, analysis] = await Promise.all([
    listPortfolioPositions().catch(() => []),
    getPortfolioAnalysis().catch(() => ({
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
