export default function HotspotsLoading() {
  return (
    <>
      <section className="panel section loading-hero">
        <div className="section-kicker">Sector Radar</div>
        <h1>热点页加载中</h1>
        <p className="muted">正在读取热点榜单，并准备板块详情与关联股票。</p>
      </section>

      <section className="content-grid">
        <div className="panel section">
          <h2>热点榜单</h2>
          <div className="loading-progress-track" aria-hidden="true">
            <span />
          </div>
          <p className="muted">先展示榜单，再按需加载选中板块详情。</p>
        </div>
        <div className="panel section">
          <h2>板块详情</h2>
          <p className="muted">正在准备催化消息、关联个股和热度趋势。</p>
        </div>
      </section>
    </>
  );
}
