import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "机器人产业链投研报告 | OpenAshare",
  description: "机器人产业链五标的核心组合、三维分析和风险执行计划。",
};

export default function RoboticsReportPage() {
  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <p style={styles.kicker}>专题报告</p>
          <h1 style={styles.title}>机器人产业链投研报告</h1>
          <p style={styles.subtitle}>
            五标的核心组合版：瑞芯微、汇川技术、北方稀土、兆易创新、埃斯顿。报告保留完整的基本面、技术面、消息面分析和分批执行计划。
          </p>
        </div>
        <div style={styles.actions}>
          <Link href="/work" style={styles.secondaryButton}>
            返回工作台
          </Link>
          <a href="/reports/robotics/raw" target="_blank" rel="noreferrer" style={styles.primaryButton}>
            打开原始报告
          </a>
        </div>
      </section>

      <section style={styles.frameShell} aria-label="机器人产业链投研报告正文">
        <iframe
          title="机器人产业链投研报告"
          src="/reports/robotics/raw"
          style={styles.iframe}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
        />
      </section>
    </main>
  );
}

const styles = {
  page: {
    display: "flex",
    minHeight: "calc(100vh - var(--nav-height) - 56px)",
    flexDirection: "column",
    gap: 16,
  },
  header: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 20,
    border: "1px solid var(--line)",
    borderRadius: 8,
    background:
      "linear-gradient(135deg, rgba(251,250,246,0.98), rgba(236,231,223,0.92)), linear-gradient(90deg, rgba(15,138,123,0.14), transparent)",
    padding: "20px 22px",
    boxShadow: "var(--shadow)",
  },
  kicker: {
    margin: "0 0 6px",
    color: "var(--accent)",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.08em",
  },
  title: {
    margin: 0,
    fontSize: "clamp(26px, 3vw, 40px)",
    letterSpacing: 0,
    lineHeight: 1.08,
  },
  subtitle: {
    maxWidth: 820,
    margin: "10px 0 0",
    color: "var(--muted)",
    fontSize: 15,
    lineHeight: 1.7,
  },
  actions: {
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-end",
  },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 38,
    borderRadius: 8,
    background: "var(--surface-contrast)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 800,
    padding: "8px 14px",
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 38,
    border: "1px solid var(--line-strong)",
    borderRadius: 8,
    background: "rgba(255,255,255,0.62)",
    color: "var(--ink)",
    fontSize: 14,
    fontWeight: 800,
    padding: "8px 14px",
  },
  frameShell: {
    flex: 1,
    minHeight: 720,
    overflow: "hidden",
    border: "1px solid var(--line-strong)",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 18px 46px rgba(25, 22, 18, 0.08)",
  },
  iframe: {
    display: "block",
    width: "100%",
    height: "calc(100vh - var(--nav-height) - 190px)",
    minHeight: 720,
    border: 0,
    background: "#fff",
  },
} satisfies Record<string, CSSProperties>;
