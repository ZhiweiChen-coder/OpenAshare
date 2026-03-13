export default function AgentLoading() {
  return (
    <>
      <section className="panel section loading-hero">
        <div className="section-kicker">Agent</div>
        <h1>对话页加载中</h1>
        <p className="muted">正在恢复会话、输入框和结果卡片布局。</p>
      </section>

      <section className="panel section">
        <h2>会话准备</h2>
        <div className="loading-progress-track" aria-hidden="true">
          <span />
        </div>
        <p className="muted">页面会先可交互，消息内容随后逐步出现。</p>
      </section>
    </>
  );
}
