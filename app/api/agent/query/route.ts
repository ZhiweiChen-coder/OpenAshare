import { NextResponse } from "next/server";

/**
 * Server-side proxy for POST /api/agent/query.
 * - Browser calls same-origin Next → no CORS / no "Failed to fetch" to 127.0.0.1:8000.
 * - Next does one long fetch to FastAPI with explicit timeout (avoids dev rewrite ECONNRESET).
 */
const BACKEND =
  process.env.BACKEND_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:8000";

const AGENT_TIMEOUT_MS = 120_000;

export async function POST(request: Request) {
  const backendUrl = `${BACKEND.replace(/\/$/, "")}/api/agent/query`;
  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json(
      { intent: "error", summary: "Invalid request body.", actions: [], citations: [], payload: {} },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);

  try {
    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isAbort = e instanceof Error && e.name === "AbortError";
    return NextResponse.json(
      {
        intent: "error",
        summary: isAbort
          ? "Agent request timed out after 2 minutes. The backend may be down, or stock analysis may be taking too long."
          : `Proxy error: ${msg}. Check BACKEND_BASE_URL and that uvicorn is running.`,
        actions: ["Run ./scripts/run_api.sh and retry.", "If the API is already running, ask a lighter question or open the stock page for full analysis."],
        citations: [],
        payload: {},
      },
      { status: 200 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
