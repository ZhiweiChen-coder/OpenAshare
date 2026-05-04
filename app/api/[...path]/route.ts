import { NextResponse } from "next/server";

const BACKEND =
  process.env.BACKEND_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:8000";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPublicCacheableGet(path: string[], searchParams: URLSearchParams) {
  if (path.length === 2 && path[0] === "stocks" && path[1] === "search") {
    return !searchParams.has("request_id");
  }
  if (path.length === 3 && path[0] === "stocks" && path[2] === "analysis") {
    return searchParams.get("include_ai") === "false";
  }
  if (path.length === 3 && path[0] === "stocks" && path[2] === "news") {
    return true;
  }
  if (path.length === 1 && (path[0] === "hotspots" || path[0] === "market-regime")) {
    return true;
  }
  if (path.length === 2 && path[0] === "news" && path[1] === "global") {
    return true;
  }
  if (path.length === 2 && path[0] === "web" && path[1] === "search") {
    return true;
  }
  if (path.length === 2 && path[0] === "hotspots") {
    return true;
  }
  if (path.length === 3 && path[0] === "strategies" && path[1] === "can-slim" && path[2] === "screen") {
    return true;
  }
  return false;
}

async function proxyRequest(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const backendPath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const url = new URL(request.url);
  const backendUrl = new URL(`${BACKEND.replace(/\/$/, "")}/api/${backendPath}`);
  backendUrl.search = url.search;
  const isCacheableGet = request.method === "GET" && isPublicCacheableGet(path, url.searchParams);

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: isCacheableGet ? "default" : "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const res = await fetch(backendUrl, init);
  const responseHeaders = new Headers(res.headers);
  if (!isCacheableGet) {
    responseHeaders.set("Cache-Control", "no-store");
  }
  return new Response(res.body, {
    status: res.status,
    headers: responseHeaders,
  });
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 204 });
}
