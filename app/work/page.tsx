import dynamic from "next/dynamic";
import Link from "next/link";
import { cookies } from "next/headers";

import { DemoAccessGate } from "@/components/demo-access-gate";
import { HotspotPreviewPanel } from "@/components/hotspot-preview-panel";
import { ResearchPulse } from "@/components/research-pulse";
import { SearchForm } from "@/components/search-form";

type WorkLocale = "zh" | "en";

type WorkPageProps = {
  searchParams?: Promise<{
    lang?: string | string[];
  }>;
};

const PortfolioSnapshotPanel = dynamic(
  () => import("@/components/portfolio-snapshot-panel").then((m) => m.PortfolioSnapshotPanel),
  {
    loading: () => (
      <div className="panel section">
        <h2>组合快照</h2>
        <p className="muted">正在加载组合快照...</p>
      </div>
    ),
  },
);
import { DEMO_ACCESS_COOKIE_NAME } from "@/lib/demo-access";
import { getDemoAccessStatusFromToken } from "@/lib/demo-access-server";

const WORK_COPY = {
  zh: {
    langAttr: "zh-CN",
    switchLabel: "工作台语言切换",
    switchZh: "中文",
    switchEn: "English",
    eyebrow: "AI Agent + AkShare + 技术指标",
    title: "OpenAshare · 一站式 A 股智能盘面",
    intro: "用一个界面串起技术分析、消息、热点和持仓，少切页面，多做决策。",
    cards: [
      {
        title: "单股分析",
        description: "把量价指标和 AI 观点放在一起，看清一只股票的技术位置。",
      },
      {
        title: "消息流",
        description: "围绕持仓与自选聚合新闻和公告，顺手看 AI 摘要结论。",
      },
      {
        title: "热点视图",
        description: "从板块和主题角度看资金在追什么，再反推代表个股。",
      },
    ],
    portfolioTitle: "组合快照",
    portfolioLoading: "正在加载组合快照...",
    gateTitle: "组合快照已锁定",
    gateDescription: "解锁后可以看到组合分析、持仓风险和调仓建议。",
    unlockLabel: "解锁演示",
    clearLabel: "清除密钥",
  },
  en: {
    langAttr: "en",
    switchLabel: "Workbench language switcher",
    switchZh: "中文",
    switchEn: "English",
    eyebrow: "AI Agent + AkShare + Technical Indicators",
    title: "OpenAshare · A focused A-share market desk",
    intro:
      "Bring technical analysis, news, hotspots, and portfolio context into one workspace so research turns into decisions faster.",
    cards: [
      {
        title: "Single-stock analysis",
        description: "Read price-volume indicators and AI commentary together to understand a stock's technical position.",
      },
      {
        title: "Market news flow",
        description: "Collect news and announcements around holdings and watchlists, with concise AI summaries nearby.",
      },
      {
        title: "Hotspot view",
        description: "See which sectors and themes are attracting capital, then trace the representative stocks.",
      },
    ],
    portfolioTitle: "Portfolio Snapshot",
    portfolioLoading: "Loading portfolio snapshot...",
    gateTitle: "Portfolio snapshot locked",
    gateDescription: "Unlock demo access to view portfolio analysis, holding risk, and adjustment suggestions.",
    unlockLabel: "Unlock demo",
    clearLabel: "Clear key",
  },
} as const;

function resolveLocale(lang: string | string[] | undefined): WorkLocale {
  const value = Array.isArray(lang) ? lang[0] : lang;
  return value === "en" ? "en" : "zh";
}

export default async function WorkPage({ searchParams }: WorkPageProps) {
  const params = await searchParams;
  const locale = resolveLocale(params?.lang);
  const copy = WORK_COPY[locale];
  const cookieStore = await cookies();
  const demoAccess = getDemoAccessStatusFromToken(cookieStore.get(DEMO_ACCESS_COOKIE_NAME)?.value);

  return (
    <main lang={copy.langAttr}>
      <section className="hero">
        <div className="panel hero-copy">
          <div className="work-page-topline">
            <span className="eyebrow">{copy.eyebrow}</span>
            <nav className="work-language-switch" aria-label={copy.switchLabel}>
              <Link
                href="/work"
                className={locale === "zh" ? "active" : undefined}
                aria-current={locale === "zh" ? "page" : undefined}
              >
                {copy.switchZh}
              </Link>
              <Link
                href="/work?lang=en"
                className={locale === "en" ? "active" : undefined}
                aria-current={locale === "en" ? "page" : undefined}
              >
                {copy.switchEn}
              </Link>
            </nav>
          </div>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
          <SearchForm locale={locale} />
          <div className="hero-grid">
            {copy.cards.map((card) => (
              <div className="card" key={card.title}>
                <h3>{card.title}</h3>
                <p className="muted">{card.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="work-side-stack">
          <ResearchPulse locale={locale} />
          {!demoAccess.unlocked ? (
            <div className="panel section">
              <h2>{copy.portfolioTitle}</h2>
              <DemoAccessGate
                title={copy.gateTitle}
                description={copy.gateDescription}
                unlockLabel={copy.unlockLabel}
                clearLabel={copy.clearLabel}
              />
            </div>
          ) : (
            <PortfolioSnapshotPanel locale={locale} />
          )}
        </div>
      </section>

      <HotspotPreviewPanel locale={locale} />
    </main>
  );
}
