"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// K 线图已并入「单股分析」页（panel=chart）。保留此路由仅用于兼容旧链接/书签，
// 自动重定向到单股分析的 K 线视图。
export default function ChartsRedirect() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("query");
    router.replace(
      query
        ? `/stocks?query=${encodeURIComponent(query)}&panel=chart#chart`
        : "/stocks",
    );
  }, [router]);

  return <p className="muted" style={{ padding: 24 }}>正在跳转到单股分析…</p>;
}
