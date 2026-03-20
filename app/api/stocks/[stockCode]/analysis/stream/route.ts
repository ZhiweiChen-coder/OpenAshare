import { NextResponse } from "next/server";

const BACKEND =
  process.env.BACKEND_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:8000";

const STOCK_TIMEOUT_MS = 120_000;

export async function GET(request: Request, context: { params: Promise<{ stockCode: string }> }) {
  const { stockCode } = await context.params;
  const url = new URL(request.url);
  const includeAi = url.searchParams.get("include_ai") ?? "true";
  const backendUrl = `${BACKEND.replace(/\/$/, "")}/api/stocks/${encodeURIComponent(stockCode)}/analysis/stream?include_ai=${encodeURIComponent(includeAi)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STOCK_TIMEOUT_MS);

  try {
    const res = await fetch(backendUrl, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      return NextResponse.json({ detail: text || "Stock stream unavailable" }, { status: res.status || 502 });
    }
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ detail: `Stock stream failed: ${message}` }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}
