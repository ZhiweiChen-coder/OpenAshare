import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AppShell, Nav } from "@/components/app-shell";
import { DemoAccessDialog } from "@/components/demo-access-dialog";
import { DemoAccessProvider } from "@/components/demo-access-provider";
import { DEMO_ACCESS_COOKIE_NAME } from "@/lib/demo-access";
import { getDemoAccessStatusFromToken } from "@/lib/demo-access-server";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenAshare",
  description: "AI-powered stock analysis, news and portfolio workstation.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const demoToken = cookieStore.get(DEMO_ACCESS_COOKIE_NAME)?.value;
  const initialDemoAccess = getDemoAccessStatusFromToken(demoToken);

  return (
    <html lang="zh-CN">
      <body suppressHydrationWarning>
        <div className="shell">
          <div className="frame">
            <DemoAccessProvider initialStatus={initialDemoAccess}>
              <Nav />
              <DemoAccessDialog />
              <AppShell>{children}</AppShell>
            </DemoAccessProvider>
          </div>
        </div>
      </body>
    </html>
  );
}
