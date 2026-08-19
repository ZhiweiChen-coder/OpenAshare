import type { Metadata } from "next";

import { AdminWaitlistClient } from "./admin-waitlist-client";

export const metadata: Metadata = {
  title: "等待名单管理 | OpenAshare",
  robots: { index: false, follow: false },
};

export default function AdminWaitlistPage() {
  return <AdminWaitlistClient />;
}
