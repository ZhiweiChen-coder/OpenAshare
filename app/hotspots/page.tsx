import { Suspense } from "react";
import { HotspotsPageClient } from "./hotspots-page-client";

export default function HotspotsPage() {
  return (
    <Suspense fallback={<section className="panel section"><p className="muted">加载中…</p></section>}>
      <HotspotsPageClient />
    </Suspense>
  );
}
