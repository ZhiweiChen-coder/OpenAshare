export default function AppLoading() {
  return (
    <>
      <section className="panel section loading-hero">
        <div className="section-kicker">Switching View</div>
        <h1>正在加载页面</h1>
        <p className="muted">请稍后，正在准备数据和组件。</p>
      </section>

      <section className="panel section loading-progress-panel">
        <div className="loading-skeleton-grid" aria-hidden="true">
          <div className="loading-skeleton-card">
            <div className="loading-skeleton-bar loading-skeleton-bar-sm" />
            <div className="loading-skeleton-bar" />
            <div className="loading-skeleton-bar loading-skeleton-bar-faded" />
          </div>
          <div className="loading-skeleton-card">
            <div className="loading-skeleton-bar loading-skeleton-bar-sm" />
            <div className="loading-skeleton-bar" />
            <div className="loading-skeleton-bar loading-skeleton-bar-faded" />
          </div>
          <div className="loading-skeleton-card">
            <div className="loading-skeleton-bar loading-skeleton-bar-sm" />
            <div className="loading-skeleton-bar" />
            <div className="loading-skeleton-bar loading-skeleton-bar-faded" />
          </div>
        </div>
      </section>
    </>
  );
}
