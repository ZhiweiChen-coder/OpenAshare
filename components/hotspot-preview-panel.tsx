"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getHotspots } from "@/lib/api";
import type { HotspotItem } from "@/lib/types";

export function HotspotPreviewPanel() {
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
          setError(err instanceof Error ? err.message : "热点数据暂时不可用");
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
  }, []);

  return (
    <section className="panel section">
      <div className="section-head-row">
        <div>
          <h2>今日热点</h2>
          <p className="muted">来自板块关键词、告警和消息催化的聚合结果。</p>
        </div>
        <Link href="/hotspots" className="button secondary">
          查看全部热点
        </Link>
      </div>
      <div className="news-grid">
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div className="card hotspot-card hotspot-card-loading" key={index}>
              <div className="hotspot-card-head">
                <div className="pill">热度扫描中</div>
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
                <div className="pill">热度 {hotspot.heat_score.toFixed(0)}</div>
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
            <p className="muted">{error || "暂无热点数据，启动后端后会在这里展示。"}</p>
          </div>
        )}
      </div>
    </section>
  );
}
