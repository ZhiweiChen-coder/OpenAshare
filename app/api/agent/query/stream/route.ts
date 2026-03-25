import { NextResponse } from "next/server";

const BACKEND =
  process.env.BACKEND_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:8000";

const AGENT_TIMEOUT_MS = 120_000;

export async function POST(request: Request) {
  const backendUrl = `${BACKEND.replace(/\/$/, "")}/api/agent/query/stream`;
  const body = await request.text();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "text/event-stream");
  headers.delete("host");
  headers.delete("content-length");

  try {
    const res = await fetch(backendUrl, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      return NextResponse.json({ detail: text || "Agent stream unavailable" }, { status: res.status || 502 });
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
    return NextResponse.json({ detail: `Agent stream failed: ${message}` }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}
