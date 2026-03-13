export default function ChartsLoading() {
  return (
    <>
      <section className="panel section loading-hero">
        <div className="section-kicker">Charts</div>
        <h1>K 线页加载中</h1>
        <p className="muted">页面已切换，正在初始化搜索与图表模块。</p>
      </section>

      <section className="panel section">
        <h2>图表模块</h2>
        <div className="loading-progress-track" aria-hidden="true">
          <span />
        </div>
        <p className="muted">选择股票后会继续加载对应 K 线与指标快照。</p>
      </section>
    </>
  );
}
