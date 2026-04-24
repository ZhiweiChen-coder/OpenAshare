import dynamic from "next/dynamic";
import { cookies } from "next/headers";

import { DemoAccessGate } from "@/components/demo-access-gate";
import { HotspotPreviewPanel } from "@/components/hotspot-preview-panel";
import { ResearchPulse } from "@/components/research-pulse";
import { SearchForm } from "@/components/search-form";

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

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const demoAccess = getDemoAccessStatusFromToken(cookieStore.get(DEMO_ACCESS_COOKIE_NAME)?.value);

  return (
    <>
      <section className="hero">
        <div className="panel hero-copy">
          <span className="eyebrow">AI Agent + AkShare + 技术指标</span>
          <h1>工作台 · 一站式 A 股智能盘面</h1>
          <p>用一个界面串起技术分析、消息、热点和持仓，少切页面，多做决策。</p>
          <SearchForm />
          <div className="hero-grid">
            <div className="card">
              <h3>单股分析</h3>
              <p className="muted">把量价指标和 AI 观点放在一起，看清一只股票的技术位置。</p>
            </div>
            <div className="card">
              <h3>消息流</h3>
              <p className="muted">围绕持仓与自选聚合新闻和公告，顺手看 AI 摘要结论。</p>
            </div>
            <div className="card">
              <h3>热点视图</h3>
              <p className="muted">从板块和主题角度看资金在追什么，再反推代表个股。</p>
            </div>
          </div>
        </div>

        <div className="work-side-stack">
          <ResearchPulse />
          {!demoAccess.unlocked ? (
            <div className="panel section">
              <h2>组合快照</h2>
              <DemoAccessGate
                title="组合快照已锁定"
                description="解锁后可以看到组合分析、持仓风险和调仓建议。"
              />
            </div>
          ) : (
            <PortfolioSnapshotPanel />
          )}
        </div>
      </section>

      <HotspotPreviewPanel />
    </>
  );
}
