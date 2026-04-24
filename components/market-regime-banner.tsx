import { MarketRegimeResponse } from "@/lib/types";

type Props = {
  marketRegime: MarketRegimeResponse | null;
  compact?: boolean;
  isLoading?: boolean;
  error?: string | null;
};

const REGIME_LABELS: Record<MarketRegimeResponse["regime"], string> = {
  risk_on: "进攻",
  neutral: "震荡",
  risk_off: "防守",
};

export function MarketRegimeBanner({ marketRegime, compact = false, isLoading = false, error = null }: Props) {
  if (!marketRegime && isLoading) {
    return (
      <section
        className={`panel section market-regime-banner market-regime-banner-loading ${
          compact ? "market-regime-banner-compact" : ""
        }`}
        aria-busy="true"
      >
        <div className="market-regime-loading-scan" aria-hidden="true" />
        <div className="market-regime-banner-head">
          <div>
            <div className="section-kicker">Market Regime</div>
            <h2>市场状态加载中</h2>
            <p className="muted">正在汇总指数趋势、均线位置与风险偏好信号...</p>
          </div>
          <div className="market-regime-loading-badge" aria-hidden="true">
            <span />
            扫描中
          </div>
        </div>
        <div className="market-regime-loading-track" aria-hidden="true">
          <span />
        </div>
        <div className="market-regime-loading-grid" aria-hidden="true">
          {["上证指数", "沪深300", "深证成指", "创业板指"].map((label) => (
            <div className="market-regime-loading-card" key={label}>
              <strong>{label}</strong>
              <i />
              <em />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!marketRegime) {
    return (
      <section className={`panel section market-regime-banner ${compact ? "market-regime-banner-compact" : ""}`}>
        <div className="section-kicker">Market Regime</div>
        <h2>市场状态暂不可用</h2>
        <p className="muted">{error || "指数趋势与风险偏好信号暂时没有返回，先按中性风控处理。"}</p>
      </section>
    );
  }

  return (
    <section
      className={`panel section market-regime-banner market-regime-banner-${marketRegime.regime} ${compact ? "market-regime-banner-compact" : ""}`}
    >
      <div className="market-regime-banner-head">
        <div>
          <div className="section-kicker">Market Regime</div>
          <h2>今日市场状态: {REGIME_LABELS[marketRegime.regime]}</h2>
        </div>
        <div className="tag-list">
          <span className="tag">评分 {marketRegime.score.toFixed(1)}</span>
          <span className="tag">建议 {marketRegime.position_guidance}</span>
        </div>
      </div>
      <p>{marketRegime.summary}</p>
      <p className="muted">{marketRegime.action_bias}</p>
      {marketRegime.notes.length ? (
        <div className="tag-list" style={{ marginTop: 12 }}>
          {marketRegime.notes.map((item) => (
            <span className="tag" key={item}>{item}</span>
          ))}
        </div>
      ) : null}
      {marketRegime.indices.length ? (
        <div className="market-regime-index-grid">
          {marketRegime.indices.map((item) => (
            <div className="card" key={item.stock_code}>
              <strong>{item.stock_name}</strong>
              <div className="muted">{item.stock_code}</div>
              <div className={item.change_pct >= 0 ? "signal-up" : "signal-down"}>
                {item.change_pct >= 0 ? "+" : ""}{item.change_pct.toFixed(2)}%
              </div>
              <div className="tag-list" style={{ marginTop: 8 }}>
                <span className="tag">{item.above_ma20 ? "站上 MA20" : "失守 MA20"}</span>
                <span className="tag">{item.above_ma60 ? "站上 MA60" : "失守 MA60"}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
