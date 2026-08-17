import type { Metadata } from "next";
import { Suspense } from "react";

import { AppShell, AppShellProvider } from "@/components/app-shell";
import "./tokens.css";
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
  return (
    <html lang="zh-CN">
      <body suppressHydrationWarning>
        <div className="shell">
          <div className="frame">
            <Suspense fallback={null}>
              <AppShellProvider>
                <AppShell>{children}</AppShell>
              </AppShellProvider>
            </Suspense>
          </div>
        </div>
      </body>
    </html>
  );
}
