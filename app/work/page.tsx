import Link from "next/link";

import { HotspotPreviewPanel } from "@/components/hotspot-preview-panel";
import { SearchForm } from "@/components/search-form";
import { TodayDeskPanel } from "@/components/today-desk-panel";

import styles from "./work.module.css";

type WorkLocale = "zh" | "en";

type WorkPageProps = {
  searchParams?: Promise<{
    lang?: string | string[];
  }>;
};

const WORK_COPY = {
  zh: {
    langAttr: "zh-CN",
    switchLabel: "工作台语言切换",
    switchZh: "中文",
    switchEn: "English",
    eyebrow: "AI Agent + AkShare + 技术指标",
    title: "OpenAshare · 一站式 A 股智能盘面",
    intro: "用一个界面串起技术分析、消息、热点和持仓，少切页面，多做决策。",
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

  return (
    <main className={styles.page} lang={copy.langAttr}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.topline}>
            <span className={styles.eyebrow}>{copy.eyebrow}</span>
            <nav className={styles.langSwitch} aria-label={copy.switchLabel}>
              <Link
                href="/work"
                className={locale === "zh" ? styles.active : undefined}
                aria-current={locale === "zh" ? "page" : undefined}
              >
                {copy.switchZh}
              </Link>
              <Link
                href="/work?lang=en"
                className={locale === "en" ? styles.active : undefined}
                aria-current={locale === "en" ? "page" : undefined}
              >
                {copy.switchEn}
              </Link>
            </nav>
          </div>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.intro}>{copy.intro}</p>
          <SearchForm locale={locale} />
        </div>

        <div className={styles.sideStack}>
          <TodayDeskPanel locale={locale} />
        </div>
      </section>

      <HotspotPreviewPanel locale={locale} />
    </main>
  );
}
