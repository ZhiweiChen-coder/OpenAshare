import { cookies } from "next/headers";

import { StocksPageClient } from "@/components/stocks-page-client";
import { DEMO_ACCESS_COOKIE_NAME } from "@/lib/demo-access";
import { getDemoAccessStatusFromToken } from "@/lib/demo-access-server";

type PageProps = {
  searchParams: Promise<{ query?: string; panel?: string; request_id?: string }>;
};

export default async function StocksPage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const demoAccess = getDemoAccessStatusFromToken(cookieStore.get(DEMO_ACCESS_COOKIE_NAME)?.value);
  const { query = "", panel = "", request_id: requestId = "" } = await searchParams;

  return (
    <StocksPageClient
      initialQuery={query}
      initialPanel={panel}
      initialRequestId={requestId}
      demoAccessUnlocked={demoAccess.unlocked}
    />
  );
}
