import Link from "next/link";

import styles from "./landing.module.css";

type Language = "zh" | "en";

type LandingPageProps = {
  searchParams?: Promise<{
    lang?: string | string[];
  }>;
};

const landingCopy: Record<
  Language,
  {
    langAttr: string;
    switchLabel: string;
    switchToZh: string;
    switchToEn: string;
    kicker: string;
    title: string;
    subtitle: string;
    primaryCta: string;
    githubCta: string;
    stats: Array<{ value: string; label: string }>;
    previewAlt: string;
    chips: string[];
    workflowKicker: string;
    workflowTitle: string;
    workflows: Array<{ metric: string; title: string; copy: string }>;
    newsKicker: string;
    newsTitle: string;
    newsCopy: string;
    newsAlt: string;
    capabilities: string[];
    modelsKicker: string;
    modelsTitle: string;
    modelsCopy: string;
    models: string[];
    securityKicker: string;
    securityTitle: string;
    securityCopy: string;
    securityAlt: string;
    securityItems: Array<{ title: string; copy: string }>;
  }
> = {
  zh: {
    langAttr: "zh-CN",
    switchLabel: "语言切换",
    switchToZh: "中文",
    switchToEn: "English",
    kicker: "OpenAshare · A 股原生智能引擎",
    title: "你的 A 股 AI 研究工作台",
    subtitle:
      "OpenAshare 用一个清爽的界面串联单股技术分析、实时消息、板块热点、持仓管理和 Agent 研究记忆，让市场观察更快落到可执行判断。",
    primaryCta: "进入工作台",
    githubCta: "查看 GitHub",
    stats: [
      { value: "5", label: "核心市场路径" },
      { value: "自选", label: "模型接入方式" },
      { value: "本地", label: "优先部署取向" },
    ],
    previewAlt: "OpenAshare 市场研究工作台预览",
    chips: ["市场脉搏", "政策观察", "组合风险"],
    workflowKicker: "研究链路",
    workflowTitle: "从信号到决策，不必离开同一个桌面。",
    workflows: [
      {
        metric: "01",
        title: "单股智能分析",
        copy: "把 AkShare 行情、技术指标、消息背景和 AI 推理放到一个研究视图里，快速形成判断。",
      },
      {
        metric: "02",
        title: "跟随市场的消息流",
        copy: "跟踪政策、公告、行业异动和公司催化，减少来回切换页面带来的研究噪音。",
      },
      {
        metric: "03",
        title: "理解持仓的 Agent",
        copy: "围绕持仓、自选股和热点主题持续追问，让 Agent 更贴近你的交易节奏。",
      },
    ],
    newsKicker: "信息优势",
    newsTitle: "让市场语境贴在图表旁边，而不是散落在另一个应用里。",
    newsCopy: "单股研究、消息解读、热点追踪和后续追问彼此联动，每一次阅读都能自然进入下一步行动。",
    newsAlt: "OpenAshare 市场消息流界面",
    capabilities: ["A 股单股分析", "实时市场消息", "热点发现", "持仓监控", "Agent 研究记忆", "私有化部署"],
    modelsKicker: "模型自由",
    modelsTitle: "接入适合你研究习惯的 AI 能力。",
    modelsCopy: "无论使用云端 API、私有接口还是本地开源模型，都可以让 OpenAshare 作为稳定的市场工作台。",
    models: ["DeepSeek", "GPT-4o", "Claude", "Qwen", "Kimi", "Ollama", "GLM", "Yi"],
    securityKicker: "默认支持自托管",
    securityTitle: "在自己的环境里运行 OpenAshare。",
    securityCopy:
      "OpenAshare 面向希望拥有严肃市场工具，同时保留 API Key、模型选择、自选股、持仓语境和基础设施控制权的人。",
    securityAlt: "OpenAshare 市场研究工作台截图",
    securityItems: [
      {
        title: "私有配置",
        copy: "模型供应商、密钥和部署环境都留在你自己的边界内。",
      },
      {
        title: "本地研究记忆",
        copy: "让 Agent 逐步适应你的工作流，同时保留你需要的数据边界。",
      },
    ],
  },
  en: {
    langAttr: "en",
    switchLabel: "Language switcher",
    switchToZh: "中文",
    switchToEn: "English",
    kicker: "OpenAshare for A-share research",
    title: "An AI market workstation for sharper China equity decisions.",
    subtitle:
      "OpenAshare brings stock analysis, market news, sector hotspots, portfolio context, and an agent research layer into one focused workspace for A-share investors and builders.",
    primaryCta: "Open workspace",
    githubCta: "View on GitHub",
    stats: [
      { value: "5", label: "Core market paths" },
      { value: "BYO", label: "Model provider" },
      { value: "Local", label: "First by design" },
    ],
    previewAlt: "OpenAshare dashboard with market research panels",
    chips: ["Market pulse", "Policy watch", "Portfolio risk"],
    workflowKicker: "Research flow",
    workflowTitle: "From signal to decision, without leaving the desk.",
    workflows: [
      {
        metric: "01",
        title: "Single-stock intelligence",
        copy: "Combine AkShare data, technical indicators, news context, and AI reasoning in one opinionated research view.",
      },
      {
        metric: "02",
        title: "News that moves with the market",
        copy: "Track policy, announcements, sector shifts, and company catalysts without turning research into tab management.",
      },
      {
        metric: "03",
        title: "Portfolio-aware agent chat",
        copy: "Ask about holdings, hotspots, and watchlist names while keeping the analysis close to your own market process.",
      },
    ],
    newsKicker: "Information edge",
    newsTitle: "Market context beside the chart, not buried in another app.",
    newsCopy:
      "Keep stock research, news interpretation, hotspot tracking, and follow-up questions connected, so every read has a place to turn into an action.",
    newsAlt: "OpenAshare market news feed",
    capabilities: [
      "A-share stock analysis",
      "Live market news",
      "Hotspot discovery",
      "Portfolio monitoring",
      "Agent research memory",
      "Self-hosted deployment",
    ],
    modelsKicker: "Model freedom",
    modelsTitle: "Bring the AI stack that fits your research style.",
    modelsCopy:
      "Use cloud APIs, private endpoints, or local open models while keeping OpenAshare as the market-facing workspace.",
    models: ["DeepSeek", "GPT-4o", "Claude", "Qwen", "Kimi", "Ollama", "GLM", "Yi"],
    securityKicker: "Self-hostable by default",
    securityTitle: "Run OpenAshare in your own environment.",
    securityCopy:
      "OpenAshare is built for people who want serious market tooling without giving up control of keys, model choices, watchlists, portfolio context, or infrastructure.",
    securityAlt: "OpenAshare market research workspace screenshot",
    securityItems: [
      {
        title: "Private configuration",
        copy: "Keep provider keys and deployment decisions in your own environment.",
      },
      {
        title: "Local research memory",
        copy: "Let the agent adapt to your workflow while preserving your preferred boundaries.",
      },
    ],
  },
};

function resolveLanguage(lang: string | string[] | undefined): Language {
  const value = Array.isArray(lang) ? lang[0] : lang;
  return value === "en" ? "en" : "zh";
}

export default async function LandingPage({ searchParams }: LandingPageProps) {
  const params = await searchParams;
  const language = resolveLanguage(params?.lang);
  const copy = landingCopy[language];
  const dashboardImageSrc = language === "en" ? "/home-en.png" : "/home.png";

  return (
    <main className={styles.container} lang={copy.langAttr}>
      <div className={styles.marketGrid} aria-hidden="true" />

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.topline}>
            <p className={styles.kicker}>{copy.kicker}</p>
            <nav className={styles.languageSwitch} aria-label={copy.switchLabel}>
              <Link
                href="/"
                className={`${styles.languageOption} ${language === "zh" ? styles.activeLanguage : ""}`}
                aria-current={language === "zh" ? "page" : undefined}
              >
                {copy.switchToZh}
              </Link>
              <Link
                href="/?lang=en"
                className={`${styles.languageOption} ${language === "en" ? styles.activeLanguage : ""}`}
                aria-current={language === "en" ? "page" : undefined}
              >
                {copy.switchToEn}
              </Link>
            </nav>
          </div>

          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.subtitle}>{copy.subtitle}</p>

          <div className={styles.actionGroup}>
            <Link href={language === "en" ? "/work?lang=en" : "/work"} className={styles.btnPrimary}>
              {copy.primaryCta}
            </Link>
            <a
              href="https://github.com/ZhiweiChen-coder/OpenAshare"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.btnGithub}
            >
              <svg height="20" viewBox="0 0 16 16" width="20" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              {copy.githubCta}
            </a>
          </div>

          <dl className={styles.heroStats} aria-label="OpenAshare product coverage">
            {copy.stats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.value}</dt>
                <dd>{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className={styles.heroVisual} aria-label={copy.previewAlt}>
          <img
            src={dashboardImageSrc}
            alt={copy.previewAlt}
            width={1200}
            height={700}
            className={styles.heroImage}
          />
          <div className={styles.tickerStrip} aria-hidden="true">
            {copy.chips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.workflows} aria-labelledby="workflow-heading">
        <div className={styles.sectionIntro}>
          <p className={styles.kicker}>{copy.workflowKicker}</p>
          <h2 id="workflow-heading">{copy.workflowTitle}</h2>
        </div>
        <div className={styles.workflowGrid}>
          {copy.workflows.map((item) => (
            <article className={styles.workflowCard} key={item.title}>
              <span>{item.metric}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.newsSection} aria-labelledby="news-heading">
        <div className={styles.newsCopy}>
          <p className={styles.kicker}>{copy.newsKicker}</p>
          <h2 id="news-heading">{copy.newsTitle}</h2>
          <p>{copy.newsCopy}</p>
          <div className={styles.capabilityGrid}>
            {copy.capabilities.map((capability) => (
              <span key={capability}>{capability}</span>
            ))}
          </div>
        </div>
        <div className={styles.newsVisual}>
          <img src="/news.png" alt={copy.newsAlt} width={1024} height={567} />
        </div>
      </section>

      <section className={styles.modelsSection} aria-labelledby="models-heading">
        <div className={styles.modelsHeader}>
          <p className={styles.kicker}>{copy.modelsKicker}</p>
          <h2 id="models-heading">{copy.modelsTitle}</h2>
          <p>{copy.modelsCopy}</p>
        </div>
        <div className={styles.logoGrid} aria-label="Supported model examples">
          {copy.models.map((model) => (
            <span className={styles.logoItem} key={model}>
              {model}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.securitySection} aria-labelledby="security-heading">
        <div className={styles.securityVisual}>
          <img src={dashboardImageSrc} alt={copy.securityAlt} width={1200} height={700} />
        </div>
        <div className={styles.securityCopy}>
          <p className={styles.kicker}>{copy.securityKicker}</p>
          <h2 id="security-heading">{copy.securityTitle}</h2>
          <p>{copy.securityCopy}</p>
          <div className={styles.securityGrid}>
            {copy.securityItems.map((item) => (
              <div key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
