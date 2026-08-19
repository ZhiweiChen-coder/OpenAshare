import type { Metadata } from "next";

import { WaitlistPageClient } from "./waitlist-page-client";

export const metadata: Metadata = {
  title: "申请 Beta | OpenAshare",
  description: "申请加入 OpenAshare 云端 Beta 等待名单。",
};

export default function WaitlistPage() {
  return <WaitlistPageClient />;
}
