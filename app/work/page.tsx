import Link from "next/link";
import { cookies } from "next/headers";

import { DemoAccessGate } from "@/components/demo-access-gate";
import { SearchForm } from "@/components/search-form";
import { getHotspots, getPortfolioAnalysis } from "@/lib/api";
import { DEMO_ACCESS_COOKIE_NAME } from "@/lib/demo-access";
import { getDemoAccessStatusFromToken } from "@/lib/demo-access-server";

export default async function WorkPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");
  const demoAccess = getDemoAccessStatusFromToken(cookieStore.get(DEMO_ACCESS_COOKIE_NAME)?.value);
  const [hotspots, portfolio] = await Promise.all([
    getHotspots().catch(() => []),
    demoAccess.unlocked
      ? getPortfolioAnalysis({ requestInit: { headers: { cookie: cookieHeader } } }).catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <>
      <section className="hero">
        <div className="panel hero-copy">
          <span className="eyebrow">AI Agent + AkShare + 技术指标</span>
          <h1>OpenAshare · 一站式 A 股智能盘面</h1>
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

        <div className="panel section">
          <h2>组合快照</h2>
          {!demoAccess.unlocked ? (
            <DemoAccessGate
              title="组合快照已锁定"
              description="解锁后可以看到组合分析、持仓风险和调仓建议。"
            />
          ) : portfolio ? (
            <div className="metric-grid">
              <div className="card">
                <div className="muted">总市值</div>
                <strong>{portfolio.total_market_value.toFixed(2)}</strong>
              </div>
              <div className="card">
                <div className="muted">总盈亏</div>
                <strong className={portfolio.total_pnl >= 0 ? "signal-up" : "signal-down"}>
                  {portfolio.total_pnl.toFixed(2)}
                </strong>
              </div>
              <div className="card">
                <div className="muted">收益率</div>
                <strong>{portfolio.total_pnl_pct.toFixed(2)}%</strong>
              </div>
              <div className="card">
                <div className="muted">技术风险</div>
                <strong>{portfolio.technical_risk}</strong>
              </div>
            </div>
          ) : (
            <p className="muted">后端不可达时，这里会显示组合快照。</p>
          )}
        </div>
      </section>

      <section className="panel section">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
          <div>
            <h2>今日热点</h2>
            <p className="muted">来自板块关键词、告警和消息催化的聚合结果。</p>
          </div>
          <Link href="/hotspots" className="button secondary">
            查看全部热点
          </Link>
        </div>
        <div className="news-grid">
          {hotspots.length ? (
            hotspots.slice(0, 6).map((hotspot) => (
              <div className="card" key={hotspot.topic_name}>
                <div className="pill">热度 {hotspot.heat_score.toFixed(0)}</div>
                <h3 style={{ marginTop: 12 }}>{hotspot.topic_name}</h3>
                <p className="muted">{hotspot.reason}</p>
                <div className="tag-list">
                  {hotspot.related_stocks.slice(0, 3).map((stock) => (
                    <span className="tag" key={`${hotspot.topic_name}-${stock.stock_code}`}>
                      {stock.stock_name}
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="card">
              <p className="muted">暂无热点数据，启动后端后会在这里展示。</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
