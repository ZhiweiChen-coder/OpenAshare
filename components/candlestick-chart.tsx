"use client";

import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi } from "lightweight-charts";

export type ChartPoint = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume?: number | null;
};

type CandlestickChartProps = {
  data: ChartPoint[];
  height?: number;
  symbol?: string;
};

function toChartTime(dateStr: string): string {
  const d = dateStr.slice(0, 10);
  return d; // YYYY-MM-DD
}

export function CandlestickChart({ data, height = 400, symbol = "" }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data.length) return;

    // 跟随全局行情方向色（受 <html data-market-color> 切换），
    // 回退到当前国际惯例色值，保证读取失败时表现不变。
    const rootStyle = getComputedStyle(document.documentElement);
    const upColor = rootStyle.getPropertyValue("--color-up").trim() || "#0d9488";
    const downColor = rootStyle.getPropertyValue("--color-down").trim() || "#c25b3a";

    const chart = createChart(containerRef.current, {
      layout: { background: { color: "#ffffff" }, textColor: "#0d0d0d" },
      grid: { vertLines: { color: "rgba(0,0,0,0.06)" }, horzLines: { color: "rgba(0,0,0,0.06)" } },
      width: containerRef.current.clientWidth,
      height,
      timeScale: {
        borderColor: "rgba(0,0,0,0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 8,
      },
      rightPriceScale: { borderColor: "rgba(0,0,0,0.08)" },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
        mouseWheel: false,
        pinch: true,
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor,
      downColor,
      borderVisible: false,
      wickUpColor: upColor,
      wickDownColor: downColor,
    });

    const seriesData = data
      .filter((p) => p.open != null && p.high != null && p.low != null && p.close != null)
      .map((p) => ({
        time: toChartTime(p.date),
        open: p.open!,
        high: p.high!,
        low: p.low!,
        close: p.close!,
      }));

    candlestickSeries.setData(seriesData);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const onResize = () => {
      if (containerRef.current && chartRef.current) chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [data, height]);

  return (
    <div className="candlestick-wrap" style={{ width: "100%", minHeight: height }}>
      {symbol ? <div className="chart-symbol">{symbol}</div> : null}
      <div ref={containerRef} />
    </div>
  );
}
