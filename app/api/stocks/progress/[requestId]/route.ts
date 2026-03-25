import { NextResponse } from "next/server";

const BACKEND =
  process.env.BACKEND_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:8000";

export async function GET(_: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params;
  const backendUrl = `${BACKEND.replace(/\/$/, "")}/api/stocks/progress/${encodeURIComponent(requestId)}`;

  try {
    const res = await fetch(backendUrl, { cache: "no-store" });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        request_id: requestId,
        status: "unknown",
        stage: "proxy_error",
        progress_pct: 0,
        message: `进度代理不可用：${message}`,
        include_ai: false,
        updated_at: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
