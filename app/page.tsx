import Link from "next/link";
import styles from "./landing.module.css";

export default function LandingPage() {
  return (
    <div className={styles.container}>
      <div className={styles.gradientBg} aria-hidden="true" />
      
      <div className={styles.content}>
        <div className={styles.badge}>
          ✨ A 股原生智能引擎 OpenClaw
        </div>
        
        <h1 className={styles.title}>
          你的专属 <span className={styles.titleHighlight}>AI 交易助手</span>
        </h1>
        
        <p className={styles.subtitle}>
          OpenAshare 用一个极致简洁的界面，串联起单股技术分析、实时消息流、板块热点追踪与持仓管理。搭载本地优先 Agent 记忆，越用越懂你的交易策略。
        </p>
        
        <div className={styles.actionGroup}>
          <Link href="/dashboard" className={styles.btnPrimary}>
            进入工作台 →
          </Link>
          <a
            href="https://github.com/ZhiweiChen-coder/OpenAshare"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btnSecondary}
          >
            ⭐️ 开启 GitHub Star
          </a>
        </div>

        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.iconWrapper}>📈</div>
            <h3>智能技术解盘</h3>
            <p>
              结合 AkShare 实时量价数据，AI Agent 自动识别当前趋势形态、支撑阻力位，为您提供客观的买卖信号参考，告别盲目盯盘。
            </p>
          </div>
          
          <div className={styles.card}>
            <div className={styles.iconWrapper}>🗞️</div>
            <h3>全景消息捕获</h3>
            <p>
              从宏观政策、行业异动到您的专属持仓公告，自动过滤市场噪音，用最精炼的 AI 摘要为您解读背后的资金逻辑和交易机会。
            </p>
          </div>
          
          <div className={styles.card}>
            <div className={styles.iconWrapper}>🤖</div>
            <h3>本地伴随记忆</h3>
            <p>
              告别“鱼的记忆”。系统基于 SQLite 和心跳机制，将你的持仓偏好、关注清单和阶段性交易计划安全地存储在本地服务器中。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
