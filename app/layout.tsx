import type { Metadata } from "next";
import { AppShell, Nav } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenAshare",
  description: "AI-powered stock analysis, news and portfolio workstation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body suppressHydrationWarning>
        <div className="shell">
          <div className="frame">
            <Nav />
            <AppShell>{children}</AppShell>
          </div>
        </div>
      </body>
    </html>
  );
}
