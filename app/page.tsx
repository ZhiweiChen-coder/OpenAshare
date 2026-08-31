import Image from "next/image";
import Link from "next/link";

import LandingMedia from "@/components/landing-media";
import { OFFICIAL_SITE_URL } from "@/lib/site";

import styles from "./landing.module.css";

type Language = "zh" | "en";

type LandingPageProps = {
  searchParams?: Promise<{
    lang?: string | string[];
  }>;
};

const githubUrl = "https://github.com/ZhiweiChen-coder/OpenAshare";

const landingCopy: Record<
  Language,
  {
    langAttr: string;
    languageLabel: string;
    chinese: string;
    english: string;
    betaTag: string;
    heroLead: string;
    heroTitle: string;
    heroAccent: string;
    heroCopy: string;
    riskNotice: string;
    waitlistCta: string;
    githubCta: string;
    availability: string;
    mediaLabel: string;
    mediaCaption: string;
    dataNotice: string;
    tape: string[];
    proof: Array<{ value: string; label: string }>;
    storyKicker: string;
    storyTitle: string;
    storyCopy: string;
    featureKicker: string;
    featureTitle: string;
    features: Array<{ index: string; title: string; copy: string }>;
    chartKicker: string;
    chartTitle: string;
    chartCopy: string;
    chartAlt: string;
    waitlistKicker: string;
    waitlistTitle: string;
    waitlistCopy: string;
    waitlistDetails: string[];
    waitlistAction: string;
    waitlistNote: string;
    footer: string;
  }
> = {
  zh: {
    langAttr: "zh-CN",
    languageLabel: "语言切换",
    chinese: "中文",
    english: "English",
    betaTag: "云端 BETA · 研究者优先",
    heroLead: "OpenAshare 是你的",
    heroTitle: "AI 股票研究工具",
    heroAccent: "聚焦内地与香港市场",
    heroCopy:
      "用一个会记住上下文的 Agent，把个股、图表、新闻、热点和持仓信息串成可追问的研究链路，帮助你整理信息、核验观点并发现待研究的线索。",
    riskNotice: "研究辅助工具，不提供个股买卖建议或收益承诺；市场有风险，投资需审慎。",
    waitlistCta: "加入 Beta Waitlist",
    githubCta: "查看 GitHub",
    availability: "限量邀请 · 登录后申请访问 · 首批研究者优先",
    mediaLabel: "MARKET CONTEXT",
    mediaCaption: "从一次提问，进入与市场信息关联的研究桌面。",
    dataNotice: "市场数据与公开信息可能存在延迟或不完整，以交易所及官方披露为准。",
    tape: ["A-SHARES", "HONG KONG", "MARKET CONTEXT", "CONTEXT CONTINUITY", "RESEARCH WORKFLOW"],
    proof: [
      { value: "★ 63", label: "GitHub stars" },
      { value: "CN / HK", label: "研究市场" },
      { value: "Agent", label: "统一研究入口" },
    ],
    storyKicker: "WHY NOW",
    storyTitle: "内地与香港股票，不该只能靠碎片化消息理解。",
    storyCopy:
      "OpenAshare 把行情、技术结构、公司新闻和你的研究记忆放在一个对话里。每次追问都会保留线索，而不是重新开一个空白窗口。",
    featureKicker: "ONE DESK, THREE LENSES",
    featureTitle: "从市场语境，走到下一步判断。",
    features: [
      { index: "01", title: "研究助手", copy: "围绕个股、热点与持仓信息连续追问，让观点带着来路，而不是一段孤立回答。" },
      { index: "02", title: "市场语境", copy: "把技术指标、行情与市场公开信息放在同一份研究上下文里，减少在不同工具间切换。" },
      { index: "03", title: "Full Chart", copy: "从宏观指数到单股结构，保留你需要亲自验证的图表细节。" },
    ],
    chartKicker: "FULL CHART · REAL WORKFLOW",
    chartTitle: "先看结构，再决定要问什么。",
    chartCopy: "图表不是装饰。它是 Agent 推理、新闻语境和你自己的交易假设能相互校验的共同语言。",
    chartAlt: "OpenAshare 上证指数完整图表",
    waitlistKicker: "THE FIRST COHORT",
    waitlistTitle: "加入等待名单，一起把这张研究桌面做得更聪明。",
    waitlistCopy: "云端 Beta 正向关注内地与香港股票的投资者、研究者与开发者分批开放。",
    waitlistDetails: ["登录后用一分钟完成申请", "告诉我们你的投资经历与研究重点", "你的反馈会直接进入下一轮产品迭代"],
    waitlistAction: "填写 Beta 申请",
    waitlistNote: "已有邀请？登录后即可进入你的研究工作台。",
    footer: "OpenAshare 提供研究辅助，不构成投资建议。",
  },
  en: {
    langAttr: "en",
    languageLabel: "Language switcher",
    chinese: "中文",
    english: "English",
    betaTag: "CLOUD BETA · RESEARCHERS FIRST",
    heroLead: "OpenAshare is your",
    heroTitle: "AI equity research tool",
    heroAccent: "for Mainland China & Hong Kong markets.",
    heroCopy:
      "A context-aware agent that brings stock information, charts, news, themes, and portfolio context into one research desk — helping you organize information, test ideas, and identify questions worth investigating.",
    riskNotice: "A research tool only. It does not provide buy or sell recommendations, or promise investment returns. Investing involves risk.",
    waitlistCta: "Join the beta waitlist",
    githubCta: "View GitHub",
    availability: "Limited cohorts · sign in to request access · researchers first",
    mediaLabel: "MARKET CONTEXT",
    mediaCaption: "One question, with market information still attached.",
    dataNotice: "Market data and public information may be delayed or incomplete. Refer to exchange and official disclosures.",
    tape: ["A-SHARES", "HONG KONG", "MARKET CONTEXT", "CONTEXT CONTINUITY", "RESEARCH WORKFLOW"],
    proof: [
      { value: "★ 63", label: "GitHub stars" },
      { value: "CN / HK", label: "markets in focus" },
      { value: "Agent", label: "one research desk" },
    ],
    storyKicker: "WHY NOW",
    storyTitle: "Mainland China and Hong Kong equities deserve more than scattered context.",
    storyCopy:
      "OpenAshare holds price action, technical structure, company news, and your research memory in one conversation. Every follow-up keeps its thread instead of starting from a blank page.",
    featureKicker: "ONE DESK, THREE LENSES",
    featureTitle: "Move from market context to the next decision.",
    features: [
      { index: "01", title: "Research workspace", copy: "Explore names, themes, and portfolio context continuously — with a trail of evidence rather than an isolated answer." },
      { index: "02", title: "Market context", copy: "Keep technical indicators, prices, and public market information in the same working context instead of across a dozen tabs." },
      { index: "03", title: "Full chart", copy: "Retain the chart detail you need to verify the structure for yourself, from index level down to a single name." },
    ],
    chartKicker: "FULL CHART · REAL WORKFLOW",
    chartTitle: "See the structure before you decide what to ask.",
    chartCopy: "A chart is not decoration. It is the shared language where an agent’s reasoning, news context, and your own trading hypothesis can challenge each other.",
    chartAlt: "OpenAshare full Shanghai Composite chart",
    waitlistKicker: "THE FIRST COHORT",
    waitlistTitle: "Join the waitlist. Help shape a sharper research desk.",
    waitlistCopy: "The cloud Beta is opening in small cohorts for investors, researchers, and builders following Mainland China and Hong Kong equities.",
    waitlistDetails: ["Complete a one-minute application after signing in", "Tell us about your investing experience and research focus", "Put your feedback directly into the next product cycle"],
    waitlistAction: "Apply for Beta access",
    waitlistNote: "Already invited? Sign in to open your research workspace.",
    footer: "OpenAshare supports research and does not constitute investment advice.",
  },
};

function resolveLanguage(lang: string | string[] | undefined): Language {
  const value = Array.isArray(lang) ? lang[0] : lang;
  return value === "en" ? "en" : "zh";
}

async function getGithubStars(): Promise<number | null> {
  try {
    const response = await fetch("https://api.github.com/repos/ZhiweiChen-coder/OpenAshare", {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { stargazers_count?: unknown };
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

function GitHubIcon() {
  return (
    <svg height="18" viewBox="0 0 16 16" width="18" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default async function LandingPage({ searchParams }: LandingPageProps) {
  const params = await searchParams;
  const language = resolveLanguage(params?.lang);
  const copy = landingCopy[language];
  const languageHref = language === "zh" ? "/?lang=en" : "/";
  const githubStars = await getGithubStars();
  const githubStarLabel = `★ ${githubStars ?? 63}`;

  return (
    <main className={styles.container} lang={copy.langAttr}>
      <div className={styles.marketGrid} aria-hidden="true" />
      <div className={styles.orbitalLine} aria-hidden="true" />

      <nav className={styles.nav} aria-label="OpenAshare navigation">
        <a className={styles.brand} href={OFFICIAL_SITE_URL}>
          <span className={styles.brandMark} aria-hidden="true">
            <Image src="/favicon.svg" alt="" width={38} height={38} priority />
          </span>
          <span>
            <strong>OpenAshare</strong>
            <small>AI research desk</small>
          </span>
        </a>

        <div className={styles.navActions}>
          <a className={styles.navGithub} href={githubUrl} target="_blank" rel="noopener noreferrer">
            <GitHubIcon />
            <span>{copy.githubCta}</span>
            <b>{githubStarLabel}</b>
          </a>
          <Link className={styles.languageLink} href={languageHref} aria-label={copy.languageLabel}>
            {language === "zh" ? copy.english : copy.chinese}
          </Link>
        </div>
      </nav>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.betaTag}><span aria-hidden="true" />{copy.betaTag}</p>
          <p className={styles.heroLead}>{copy.heroLead}</p>
          <h1 id="hero-title">
            {copy.heroTitle}
            <em>{copy.heroAccent}</em>
          </h1>
          <p className={styles.heroDescription}>{copy.heroCopy}</p>

          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/waitlist">
              {copy.waitlistCta}<span aria-hidden="true">↘</span>
            </Link>
            <a className={styles.githubButton} href={githubUrl} target="_blank" rel="noopener noreferrer">
              <GitHubIcon />
              <span>{copy.githubCta}</span>
              <b>{githubStarLabel}</b>
            </a>
          </div>
          <p className={styles.availability}>{copy.availability}</p>
          <p className={styles.riskNotice}>{copy.riskNotice}</p>
        </div>

        <div className={styles.mediaStage}>
          <div className={styles.mediaMeta}>
            <span>{copy.mediaLabel}</span>
            <i>●</i>
          </div>
          <LandingMedia
            className={styles.heroMedia}
            label={copy.mediaLabel}
            description={copy.mediaCaption}
            videoSrc="/marketing/demo.mp4"
            posterSrc="/marketing/openashare-beta-chart.png"
            fallbackScreenshots={["/marketing/openashare-beta-chart.png"]}
          />
          <p className={styles.mediaCaption}>{copy.mediaCaption}</p>
          <p className={styles.dataNotice}>{copy.dataNotice}</p>
        </div>
      </section>

      <section className={styles.tape} aria-label="OpenAshare focus areas">
        <div className={styles.tapeTrack}>
          {[...copy.tape, ...copy.tape].map((item, index) => <span key={`${item}-${index}`}>{item}<i>✦</i></span>)}
        </div>
      </section>

      <section className={styles.proof} aria-label="OpenAshare at a glance">
        {copy.proof.map((item) => (
          <div key={item.label}>
            <strong>{item.label === "GitHub stars" ? githubStarLabel : item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </section>

      <section className={styles.story} aria-labelledby="story-title">
        <div>
          <p className={styles.eyebrow}>{copy.storyKicker}</p>
          <h2 id="story-title">{copy.storyTitle}</h2>
        </div>
        <p>{copy.storyCopy}</p>
      </section>

      <section className={styles.featureSection} aria-labelledby="feature-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>{copy.featureKicker}</p>
          <h2 id="feature-title">{copy.featureTitle}</h2>
        </div>
        <div className={styles.featureGrid}>
          {copy.features.map((feature) => (
            <article className={styles.featureCard} key={feature.index}>
              <span>{feature.index}</span>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.chartSection} aria-labelledby="chart-title">
        <div className={styles.chartCopy}>
          <p className={styles.eyebrow}>{copy.chartKicker}</p>
          <h2 id="chart-title">{copy.chartTitle}</h2>
          <p>{copy.chartCopy}</p>
        </div>
        <figure className={styles.chartFrame}>
          <Image src="/marketing/openashare-beta-chart.png" alt={copy.chartAlt} width={1920} height={1072} sizes="(max-width: 720px) 100vw, 68vw" />
          <figcaption>OpenAshare / full chart workspace</figcaption>
        </figure>
      </section>

      <section className={styles.waitlist} id="waitlist" aria-labelledby="waitlist-title">
        <div className={styles.waitlistCopy}>
          <p className={styles.waitlistKicker}>{copy.waitlistKicker}</p>
          <h2 id="waitlist-title">{copy.waitlistTitle}</h2>
          <p>{copy.waitlistCopy}</p>
        </div>
        <div className={styles.waitlistCard}>
          <ul>
            {copy.waitlistDetails.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
          <Link className={styles.waitlistButton} href="/waitlist">
            {copy.waitlistAction}<span aria-hidden="true">→</span>
          </Link>
          <p>{copy.waitlistNote}</p>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} OpenAshare</span>
        <span>{copy.footer}</span>
      </footer>
    </main>
  );
}
