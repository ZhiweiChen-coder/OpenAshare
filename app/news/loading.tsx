export default function NewsLoading() {
  return (
    <>
      <section className="panel section loading-hero">
        <div className="section-kicker">News Desk</div>
        <h1>消息页加载中</h1>
        <p className="muted">正在并行准备全球新闻与 Agent 摘要。</p>
      </section>

      <section className="content-grid">
        <div className="panel section">
          <h2>Agent 摘要</h2>
          <div className="loading-progress-track" aria-hidden="true">
            <span />
          </div>
          <p className="muted">摘要超时不会阻塞新闻区。</p>
        </div>
        <div className="panel section">
          <h2>全球新闻</h2>
          <p className="muted">正在抓取头条、主题分组和影响摘要。</p>
        </div>
      </section>
    </>
  );
}
