"use client";

import { useMemo, useRef, useState } from "react";

import { CandlestickChart, type ChartPoint } from "@/components/candlestick-chart";

type IndicatorKey = "MA20" | "MA60" | "MACD" | "RSI" | "KDJ";
type DrawMode = "pointer" | "trend" | "horizontal";
type Point = { x: number; y: number };

type ResearchChartProps = {
  data: ChartPoint[];
  symbol?: string;
  height?: number;
  compact?: boolean;
};

type IndicatorSeries = {
  values: Array<number | null>;
  signal?: Array<number | null>;
  histogram?: Array<number | null>;
};

const INDICATOR_LABELS: Record<IndicatorKey, string> = {
  MA20: "MA20",
  MA60: "MA60",
  MACD: "MACD",
  RSI: "RSI",
  KDJ: "KDJ",
};

const INDICATOR_COLORS: Record<IndicatorKey, string> = {
  MA20: "#0f8a7b",
  MA60: "#c25b3a",
  MACD: "#7257a5",
  RSI: "#2677a8",
  KDJ: "#b47a20",
};

function finiteValues(values: Array<number | null>) {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function movingAverage(values: number[], period: number) {
  return values.map((_, index) => {
    if (index < period - 1) return null;
    const window = values.slice(index - period + 1, index + 1);
    return window.reduce((sum, value) => sum + value, 0) / period;
  });
}

function exponentialAverage(values: number[], period: number) {
  const result: Array<number | null> = [];
  const multiplier = 2 / (period + 1);
  let previous: number | null = null;
  values.forEach((value, index) => {
    previous = previous === null || index === 0 ? value : (value - previous) * multiplier + previous;
    result.push(previous);
  });
  return result;
}

function calculateIndicators(data: ChartPoint[]) {
  const closes = data.map((point) => point.close ?? 0);
  const highs = data.map((point) => point.high ?? point.close ?? 0);
  const lows = data.map((point) => point.low ?? point.close ?? 0);
  const ma20 = movingAverage(closes, 20);
  const ma60 = movingAverage(closes, 60);
  const fast = exponentialAverage(closes, 12);
  const slow = exponentialAverage(closes, 26);
  const macd = fast.map((value, index) => (value ?? 0) - (slow[index] ?? 0));
  const signal = exponentialAverage(macd, 9);
  const rsi = closes.map((_, index) => {
    if (index < 14) return null;
    let gains = 0;
    let losses = 0;
    for (let cursor = index - 13; cursor <= index; cursor += 1) {
      const change = closes[cursor] - closes[cursor - 1];
      if (change >= 0) gains += change;
      else losses -= change;
    }
    if (losses === 0) return 100;
    return 100 - 100 / (1 + gains / 14 / (losses / 14));
  });
  const k: Array<number | null> = [];
  const d: Array<number | null> = [];
  const j: Array<number | null> = [];
  let previousK = 50;
  let previousD = 50;
  closes.forEach((_, index) => {
    if (index < 8) {
      k.push(null);
      d.push(null);
      j.push(null);
      return;
    }
    const high = Math.max(...highs.slice(index - 8, index + 1));
    const low = Math.min(...lows.slice(index - 8, index + 1));
    const rsv = high === low ? 50 : ((closes[index] - low) / (high - low)) * 100;
    previousK = (2 * previousK + rsv) / 3;
    previousD = (2 * previousD + previousK) / 3;
    k.push(previousK);
    d.push(previousD);
    j.push(3 * previousK - 2 * previousD);
  });
  return {
    MA20: { values: ma20 },
    MA60: { values: ma60 },
    MACD: { values: macd, signal, histogram: macd.map((value, index) => value - (signal[index] ?? 0)) },
    RSI: { values: rsi },
    KDJ: { values: k, signal: d, histogram: j },
  } satisfies Record<IndicatorKey, IndicatorSeries>;
}

function pathFor(values: Array<number | null>) {
  const points = values
    .map((value, index) => ({ value, index }))
    .filter((point): point is { value: number; index: number } => typeof point.value === "number" && Number.isFinite(point.value));
  if (points.length < 2) return "";
  const numbers = points.map((point) => point.value);
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const range = max - min || 1;
  const denominator = Math.max(values.length - 1, 1);
  return points
    .map((point) => `${(point.index / denominator) * 100},${96 - ((point.value - min) / range) * 82}`)
    .join(" ");
}

function latestValue(values: Array<number | null>) {
  const valuesOnly = finiteValues(values);
  return valuesOnly.at(-1);
}

function formatValue(value: number | undefined) {
  return value === undefined ? "—" : value.toFixed(2);
}

function IndicatorPane({ indicator, series }: { indicator: IndicatorKey; series: IndicatorSeries }) {
  const latest = latestValue(series.values);
  const secondary = latestValue(series.signal ?? []);
  const tertiary = latestValue(series.histogram ?? []);
  return (
    <div className="research-indicator-pane">
      <div className="research-indicator-head">
        <span style={{ color: INDICATOR_COLORS[indicator] }}>{INDICATOR_LABELS[indicator]}</span>
        <div>
          <strong>{formatValue(latest)}</strong>
          {secondary !== undefined ? <small>信号 {formatValue(secondary)}</small> : null}
          {indicator === "KDJ" && tertiary !== undefined ? <small>J {formatValue(tertiary)}</small> : null}
        </div>
      </div>
      <svg className="research-indicator-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {series.histogram?.map((value, index) => {
          if (value === null) return null;
          const normalized = Math.max(4, Math.min(96, 50 - value * 28));
          return <line key={`${indicator}-bar-${index}`} x1={(index / Math.max(series.values.length - 1, 1)) * 100} x2={(index / Math.max(series.values.length - 1, 1)) * 100} y1="50" y2={normalized} />;
        })}
        <polyline points={pathFor(series.values)} style={{ stroke: INDICATOR_COLORS[indicator] }} />
        {series.signal ? <polyline className="secondary" points={pathFor(series.signal)} /> : null}
      </svg>
    </div>
  );
}

export function ResearchChart({ data, symbol = "", height = 420, compact = false }: ResearchChartProps) {
  const [selectedIndicators, setSelectedIndicators] = useState<IndicatorKey[]>(["MA20", "MACD"]);
  const [drawMode, setDrawMode] = useState<DrawMode>("pointer");
  const [drawings, setDrawings] = useState<Array<{ mode: Exclude<DrawMode, "pointer">; start: Point; end: Point }>>([]);
  const [pendingPoint, setPendingPoint] = useState<Point | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const indicators = useMemo(() => calculateIndicators(data), [data]);

  function toggleIndicator(indicator: IndicatorKey) {
    setSelectedIndicators((current) => current.includes(indicator) ? current.filter((item) => item !== indicator) : [...current, indicator]);
  }

  function handleDraw(event: React.PointerEvent<SVGSVGElement>) {
    if (drawMode === "pointer" || !stageRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
    if (drawMode === "horizontal") {
      setDrawings((current) => [...current, { mode: "horizontal", start: { x: 0, y: point.y }, end: { x: 1, y: point.y } }]);
      return;
    }
    if (pendingPoint) {
      setDrawings((current) => [...current, { mode: "trend", start: pendingPoint, end: point }]);
      setPendingPoint(null);
    } else {
      setPendingPoint(point);
    }
  }

  return (
    <div className={`research-chart ${compact ? "research-chart--compact" : ""}`}>
      {!compact ? (
        <div className="research-chart-toolbar">
          <div className="research-chart-tool-group">
            <span className="research-chart-toolbar-label">指标</span>
            {(Object.keys(INDICATOR_LABELS) as IndicatorKey[]).map((indicator) => (
              <button type="button" key={indicator} className={`research-chart-tool ${selectedIndicators.includes(indicator) ? "active" : ""}`} onClick={() => toggleIndicator(indicator)}>
                {INDICATOR_LABELS[indicator]}
              </button>
            ))}
          </div>
          <div className="research-chart-tool-group">
            <span className="research-chart-toolbar-label">画线</span>
            {(["pointer", "trend", "horizontal"] as DrawMode[]).map((mode) => (
              <button type="button" key={mode} className={`research-chart-tool ${drawMode === mode ? "active" : ""}`} onClick={() => { setDrawMode(mode); setPendingPoint(null); }}>
                {mode === "pointer" ? "指针" : mode === "trend" ? "趋势线" : "水平线"}
              </button>
            ))}
            <button type="button" className="research-chart-tool muted" onClick={() => { setDrawings([]); setPendingPoint(null); }}>清除</button>
          </div>
        </div>
      ) : null}
      <div className={`research-chart-stage ${drawMode !== "pointer" && !compact ? "drawing" : ""}`} ref={stageRef} style={{ height }}>
        <CandlestickChart data={data} height={height} symbol={symbol} compact={compact} />
        {!compact ? (
          <svg className={`research-chart-draw-layer ${drawMode !== "pointer" ? "is-active" : ""}`} viewBox="0 0 100 100" preserveAspectRatio="none" onPointerDown={handleDraw} aria-label="图表画线区域">
            {drawings.map((drawing, index) => <line key={`drawing-${index}`} x1={drawing.start.x * 100} y1={drawing.start.y * 100} x2={drawing.end.x * 100} y2={drawing.end.y * 100} className={drawing.mode === "horizontal" ? "horizontal" : "trend"} />)}
            {pendingPoint ? <line x1={pendingPoint.x * 100} y1={pendingPoint.y * 100} x2={pendingPoint.x * 100 + 12} y2={pendingPoint.y * 100 - 4} className="pending" /> : null}
          </svg>
        ) : null}
      </div>
      {!compact && selectedIndicators.length ? (
        <div className="research-indicator-grid">
          {selectedIndicators.map((indicator) => <IndicatorPane indicator={indicator} series={indicators[indicator]} key={indicator} />)}
        </div>
      ) : null}
      {!compact && drawMode === "trend" && pendingPoint ? <p className="research-chart-hint">已选择起点，再点击一次完成趋势线。</p> : null}
    </div>
  );
}
