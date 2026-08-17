import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ query?: string }>;
};

export default async function StocksPage({ searchParams }: PageProps) {
  const { query = "" } = await searchParams;
  redirect(query ? `/work?symbol=${encodeURIComponent(query)}` : "/work");
}
