import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ stock_code?: string }>;
};

export default async function PortfolioPage({ searchParams }: PageProps) {
  const { stock_code: stockCode } = await searchParams;
  const symbol = stockCode ? `&symbol=${encodeURIComponent(stockCode)}` : "";
  redirect(`/work?context=portfolio${symbol}`);
}
