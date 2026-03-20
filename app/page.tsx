import Link from "next/link";
// Standard image tag used to bypass next/image error.
import styles from "./landing.module.css";

export default function LandingPage() {
  return (
    <div className={styles.container}>
      <div className={styles.gradientBg} aria-hidden="true" />

      <section className={styles.heroContent}>
        <div className={styles.badge}>A股原生智能引擎 OpenAshare</div>

        <h1 className={styles.title}>
          你的专属 <span className={styles.titleHighlight}>AI 交易助手</span>
        </h1>

        <p className={styles.subtitle}>
          OpenAshare 用一个极简、直接的界面串联单股技术分析、实时消息流、板块热点追踪与持仓管理，
          搭配本地优先的 Agent 记忆，让系统越用越懂你的交易节奏。
        </p>

        <div className={styles.actionGroup}>
          <Link href="/dashboard" className={styles.btnPrimary}>
            进入工作台
          </Link>
          <a
            href="https://github.com/ZhiweiChen-coder/OpenAshare"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btnGithub}
          >
            <svg height="22" viewBox="0 0 16 16" width="22" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
            </svg>
            GitHub Star
          </a>
        </div>

        <div className={styles.heroMockupWrapper}>
          <img
            src="/home.png"
            alt="OpenAshare Home Dashboard"
            width={1200}
            height={700}
            className={styles.heroImage}
          />
        </div>
      </section>

      <section className={styles.featureSection}>
        <div className={styles.featureWrapper}>
          <div className={styles.featureContent}>
            <h2>
              强大的市场面板
              <br />
              尽在掌握之中
            </h2>
            <ul className={styles.featureList}>
              <li>
                <strong>智能技术解盘</strong>
                <p>
                  结合 AkShare 的行情与指标数据，AI Agent 自动识别趋势结构、支撑阻力与关键形态，
                  让单股分析更快进入可执行结论。
                </p>
              </li>
              <li>
                <strong>全景消息捕捉</strong>
                <p>
                  从宏观政策、行业异动到个股公告，系统自动提炼重点，把噪音压缩成更适合交易决策的摘要。
                </p>
              </li>
              <li>
                <strong>联动代理分析</strong>
                <p>
                  随时调起专属 Agent 联合分析单股、热点和持仓，快速生成下一步观察方向与行动建议。
                </p>
              </li>
            </ul>
          </div>
          <div className={styles.featureMockup}>
            <img src="/news.png" alt="News Feed" className={styles.featureImage} />
          </div>
        </div>
      </section>

      <section className={styles.modelsSection}>
        <div className={styles.modelsHeader}>
          <h2>任意主流模型，自由接入</h2>
          <p>
            无论使用云端 API 还是本地部署模型，都可以按你的偏好切换配置，
            让研究链路保持灵活，同时不被单一供应商锁定。
          </p>
        </div>
        <div className={styles.logoGrid}>
          <div className={styles.logoItem}>DeepSeek</div>
          <div className={styles.logoItem}>GPT-4o</div>
          <div className={styles.logoItem}>Claude 3.5</div>
          <div className={styles.logoItem}>Qwen Max</div>
          <div className={styles.logoItem}>Kimi</div>
          <div className={styles.logoItem}>Ollama</div>
          <div className={styles.logoItem}>GLM-4</div>
          <div className={styles.logoItem}>Yi</div>
        </div>
      </section>

      <section className={styles.securitySection}>
        <div className={styles.securityHeader}>
          <h2>本地优先，私有与安全并重</h2>
        </div>

        <div className={styles.securityMockup}>
          <div className={styles.laptopFrame}>
            <div className={styles.screen}>
              <div className={styles.screenInner}></div>
            </div>
            <div className={styles.keyboard}></div>
            <div className={styles.badgeLocal}>Local</div>
            <div className={styles.badgePrivate}>Private</div>
            <div className={styles.badgeSecure}>Secure</div>
          </div>
        </div>

        <div className={styles.securityGrid}>
          <div className={styles.securityCard}>
            <h3>自托管模型</h3>
            <p>
              你可以自行选择运行环境，接入私有 API Key，或直接驱动本地开源模型，
              把分析能力和成本控制权留在自己手里。
            </p>
          </div>
          <div className={styles.securityCard}>
            <h3>数据主权</h3>
            <p>
              自选股、持仓、技术观察点与会话记忆优先保留在本地与私有环境中，
              更适合对研究过程和数据边界有要求的使用场景。
            </p>
          </div>
          <div className={styles.securityCard}>
            <h3>私有化部署</h3>
            <p>
              支持离线运行、局域网共享与私有云部署，既能开放协作，也能按你的基础设施约束落地。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
