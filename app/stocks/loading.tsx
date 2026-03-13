export default function StocksLoading() {
  return (
    <>
      <section className="panel section loading-hero">
        <div className="section-kicker">Stocks</div>
        <h1>单股分析</h1>
        <p className="muted">页面已切换，正在后台准备搜索结果与技术分析。</p>
      </section>

      <section className="panel section loading-progress-panel">
        <div className="loading-progress-head">
          <h2>分析进度</h2>
          <span className="pill">处理中</span>
        </div>
        <div className="loading-progress-track" aria-hidden="true">
          <span />
        </div>
        <p className="muted">先准备行情与技术指标，再补充相关新闻；完整 AI 长文可能更慢。</p>
      </section>

      <section className="content-grid">
        <div className="panel section">
          <h2>搜索结果</h2>
          <p className="muted">正在匹配股票代码与名称...</p>
        </div>
        <div className="panel section">
          <h2>选中股票</h2>
          <p className="muted">正在识别股票代码、市场和分析参数...</p>
        </div>
      </section>
    </>
  );
}
