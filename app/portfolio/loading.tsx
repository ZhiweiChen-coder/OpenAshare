export default function PortfolioLoading() {
  return (
    <>
      <section className="panel section loading-hero">
        <div className="section-kicker">Portfolio</div>
        <h1>持仓页加载中</h1>
        <p className="muted">正在读取持仓列表、组合分析与盈亏快照。</p>
      </section>

      <section className="content-grid">
        <div className="panel section">
          <h2>持仓记录</h2>
          <div className="loading-progress-track" aria-hidden="true">
            <span />
          </div>
          <p className="muted">先加载基础数据，再补充风险分析。</p>
        </div>
        <div className="panel section">
          <h2>组合分析</h2>
          <p className="muted">正在计算总盈亏、集中度和再平衡建议。</p>
        </div>
      </section>
    </>
  );
}
