"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getHotspots } from "@/lib/api";
import type { HotspotItem } from "@/lib/types";

type HotspotPreviewLocale = "zh" | "en";

const HOTSPOT_COPY = {
  zh: {
    title: "今日热点",
    description: "来自板块关键词、告警和消息催化的聚合结果。",
    action: "查看全部热点",
    loading: "热度扫描中",
    heat: "热度",
    empty: "暂无热点数据，启动后端后会在这里展示。",
    errorFallback: "热点数据暂时不可用",
  },
  en: {
    title: "Today's Hotspots",
    description: "A combined view of sector keywords, alerts, and market catalysts.",
    action: "View all hotspots",
    loading: "Scanning heat",
    heat: "Heat",
    empty: "No hotspot data yet. Start the backend to populate this panel.",
    errorFallback: "Hotspot data is temporarily unavailable",
  },
} as const;

export function HotspotPreviewPanel({ locale = "zh" }: { locale?: HotspotPreviewLocale }) {
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const copy = HOTSPOT_COPY[locale];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getHotspots()
      .then((result) => {
        if (!cancelled) {
          setHotspots(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setHotspots([]);
          setError(err instanceof Error ? err.message : copy.errorFallback);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [copy.errorFallback]);

  return (
    <section className="panel section">
      <div className="section-head-row">
        <div>
          <h2>{copy.title}</h2>
          <p className="muted">{copy.description}</p>
        </div>
        <Link href="/hotspots" className="button secondary">
          {copy.action}
        </Link>
      </div>
      <div className="news-grid">
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div className="card hotspot-card hotspot-card-loading" key={index}>
              <div className="hotspot-card-head">
                <div className="pill">{copy.loading}</div>
                <span className="hotspot-rank">#{index + 1}</span>
              </div>
              <span className="skeleton-line skeleton-line-title" />
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-line-short" />
            </div>
          ))
        ) : hotspots.length ? (
          hotspots.slice(0, 6).map((hotspot, index) => (
            <div className="card hotspot-card" key={hotspot.topic_name}>
              <div className="hotspot-card-head">
                <div className="pill">
                  {copy.heat} {hotspot.heat_score.toFixed(0)}
                </div>
                <span className="hotspot-rank">#{index + 1}</span>
              </div>
              <h3 style={{ marginTop: 12 }}>{hotspot.topic_name}</h3>
              <p className="muted">{hotspot.reason}</p>
              <div className="tag-list">
                {hotspot.related_stocks.slice(0, 3).map((stock) => (
                  <span className="tag" key={`${hotspot.topic_name}-${stock.stock_code}`}>
                    {stock.stock_name}
                  </span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="card">
            <p className="muted">{error || copy.empty}</p>
          </div>
        )}
      </div>
    </section>
  );
}
