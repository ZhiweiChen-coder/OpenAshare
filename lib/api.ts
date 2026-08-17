import {
  AnalysisProgressResponse,
  AgentHistoryTurn,
  AgentResponse,
  CreditBalanceResponse,
  GlobalNewsItem,
  HotspotDetailResponse,
  HotspotItem,
  MarketRegimeResponse,
  NewsItem,
  PortfolioAnalysisResponse,
  PortfolioPosition,
  StrategyHolding,
  StrategyHoldingAnalysisResponse,
  StrategyScreenResponse,
  StockAnalysisResponse,
  StockSearchResult,
  UserSettingsResponse,
  WebSearchResult,
} from "./types";
import type { SupabaseWorkspaceBootstrap, WorkspaceEvent } from "./workspace";
import { createClient } from "@/utils/supabase/client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/**
 * Server Components / RSC run in Node: relative fetch("/api/...") does not hit FastAPI.
 * Use absolute backend URL on server so searchStocks / getStockAnalysis work after "开始分析".
 */
function apiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  const serverBase =
    process.env.BACKEND_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:8000";
  return String(serverBase).replace(/\/$/, "");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = apiBaseUrl();
  const url = base ? `${base}${path}` : path;
  const method = (init?.method ?? "GET").toUpperCase();
  const authHeaders = await getBrowserAuthHeaders();
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: init?.cache ?? (method === "GET" || method === "HEAD" ? "default" : "no-store"),
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error(`无法连接后端服务 ${base || API_BASE_URL || "Next API 代理"}`);
  }
  if (!response.ok) {
    const raw = await response.text();
    let detail = raw;
    try {
      const parsed = JSON.parse(raw) as { detail?: unknown; message?: unknown };
      detail = formatApiErrorDetail(parsed.detail ?? parsed.message ?? raw);
    } catch {
      // keep raw body
    }
    throw new ApiError(String(detail || `API request failed: ${response.status}`), response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function requestWithTimeout<T>(path: string, timeoutMs: number, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let raceTimeoutId: ReturnType<typeof setTimeout> | undefined;
  const originalSignal = init?.signal;

  if (originalSignal) {
    if (originalSignal.aborted) {
      controller.abort();
    } else {
      originalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    return await Promise.race([
      request<T>(path, {
        ...init,
        signal: controller.signal,
      }),
      new Promise<T>((_, reject) => {
        raceTimeoutId = setTimeout(() => {
          reject(new Error(`请求超时（>${Math.round(timeoutMs / 1000)}s）`));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if ((error instanceof DOMException && error.name === "AbortError") || timedOut) {
      throw new Error(`请求超时（>${Math.round(timeoutMs / 1000)}s）`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (raceTimeoutId) {
      clearTimeout(raceTimeoutId);
    }
  }
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getWorkspaceBootstrap(accessToken: string): Promise<SupabaseWorkspaceBootstrap> {
  return request<SupabaseWorkspaceBootstrap>("/api/workspace/bootstrap", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
}

async function getBrowserAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  try {
    const { data } = await createClient().auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    // Local mode has no Supabase environment and intentionally uses unlimited
    // development credits.
    return {};
  }
}

export async function getCreditBalance(): Promise<CreditBalanceResponse> {
  return request<CreditBalanceResponse>("/api/billing/balance", {
    headers: await getBrowserAuthHeaders(),
    cache: "no-store",
  });
}

/** Readable text for caught errors in client UI (never "[object Object]"). */
export function getClientErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return "未知错误";
    }
  }
  return String(error);
}

function safeJsonSnippet(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return describeUnknownRecord(value);
  }
}

function describeUnknownRecord(value: unknown): string {
  if (!value || typeof value !== "object") {
    return String(value);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (!keys.length) {
    return "（空对象）";
  }
  return keys
    .slice(0, 12)
    .map((key) => {
      const v = record[key];
      if (v === null || v === undefined) {
        return `${key}: null`;
      }
      const t = typeof v;
      if (t === "string" || t === "number" || t === "boolean") {
        return `${key}: ${String(v)}`;
      }
      return `${key}: …`;
    })
    .join("; ");
}

function formatApiErrorDetail(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    const items = detail
      .map((item) => {
        if (!item || typeof item !== "object") {
          return String(item);
        }
        const entry = item as { loc?: unknown; msg?: unknown; type?: unknown };
        const location = Array.isArray(entry.loc)
          ? entry.loc
              .filter((part) => typeof part === "string" || typeof part === "number")
              .join(".")
          : "";
        const message = typeof entry.msg === "string" ? entry.msg : "";
        if (location && message) {
          return `${location}: ${message}`;
        }
        if (message) {
          return message;
        }
        return safeJsonSnippet(item);
      })
      .filter(Boolean);
    return items.join("；") || "请求参数校验失败";
  }
  if (detail && typeof detail === "object") {
    return safeJsonSnippet(detail);
  }
  return String(detail);
}

export function searchStocks(query: string): Promise<StockSearchResult[]> {
  return request(`/api/stocks/search?q=${encodeURIComponent(query)}`);
}

export function searchStocksWithOptions(
  query: string,
  options?: { requestId?: string },
): Promise<StockSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (options?.requestId) {
    params.set("request_id", options.requestId);
  }
  return request(`/api/stocks/search?${params.toString()}`, options?.requestId ? { cache: "no-store" } : undefined);
}

export function getStockAnalysis(
  code: string,
  options?: { includeAi?: boolean; requestId?: string; requestInit?: RequestInit },
): Promise<StockAnalysisResponse> {
  const includeAi = options?.includeAi ?? true;
  const params = new URLSearchParams();
  if (!includeAi) {
    params.set("include_ai", "false");
  }
  if (options?.requestId) {
    params.set("request_id", options.requestId);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request(`/api/stocks/${encodeURIComponent(code)}/analysis${suffix}`, {
    ...(options?.requestInit ?? {}),
    cache: includeAi ? "no-store" : options?.requestInit?.cache ?? "default",
  });
}

export type StockAnalysisStreamStage = {
  stage: string;
  progress_pct: number;
  message?: string | null;
};

export type StockAnalysisStreamHandlers = {
  onStage?: (stage: StockAnalysisStreamStage) => void;
  onToken?: (delta: string) => void;
  onResult?: (payload: StockAnalysisResponse) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
};

/**
 * 流式单股分析：通过 SSE 实时接收处理步骤与逐字生成的 AI 文本。
 * 事件类型：start / progress / token / result / error / done。
 */
export async function streamStockAnalysis(
  code: string,
  handlers: StockAnalysisStreamHandlers,
): Promise<void> {
  const response = await fetch(
    `/api/stocks/${encodeURIComponent(code)}/analysis/stream?include_ai=true`,
    {
      headers: { Accept: "text/event-stream", ...(await getBrowserAuthHeaders()) },
      cache: "no-store",
      signal: handlers.signal,
    },
  );
  if (!response.ok || !response.body) {
    throw new Error(`流式分析请求失败（${response.status}）`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      let eventName = "";
      let dataStr = "";
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
      }
      if (!dataStr) continue;

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(dataStr);
      } catch {
        continue;
      }

      switch (eventName) {
        case "start":
        case "progress":
          handlers.onStage?.({
            stage: String(payload.stage ?? ""),
            progress_pct: Number(payload.progress_pct ?? 0),
            message: (payload.message as string | null) ?? null,
          });
          break;
        case "token": {
          const meta = (payload.meta ?? {}) as { delta?: string };
          if (meta.delta) handlers.onToken?.(meta.delta);
          break;
        }
        case "result":
          handlers.onResult?.(payload.payload as StockAnalysisResponse);
          break;
        case "error":
          handlers.onError?.(String(payload.message ?? "分析失败"));
          break;
        case "done":
          return;
      }
    }
  }
}

export function getStockNews(code: string): Promise<NewsItem[]> {
  return request(`/api/stocks/${encodeURIComponent(code)}/news`);
}

export function getStockAnalysisProgress(requestId: string): Promise<AnalysisProgressResponse> {
  return request(`/api/stocks/progress/${encodeURIComponent(requestId)}`, { cache: "no-store" });
}

export function getHotspots(): Promise<HotspotItem[]> {
  return requestWithTimeout("/api/hotspots", 9000);
}

export function getGlobalNews(): Promise<GlobalNewsItem[]> {
  return requestWithTimeout("/api/news/global", 8000, { cache: "no-store" });
}

export function webSearch(query: string, limit = 8): Promise<WebSearchResult[]> {
  return request(`/api/web/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

export function getHotspotDetail(topic: string): Promise<HotspotDetailResponse> {
  return requestWithTimeout(`/api/hotspots/${encodeURIComponent(topic)}`, 9000);
}

export function getMarketRegime(options?: { requestInit?: RequestInit }): Promise<MarketRegimeResponse> {
  return requestWithTimeout("/api/market-regime", 4000, options?.requestInit);
}

export function getPortfolioAnalysis(options?: { requestInit?: RequestInit }): Promise<PortfolioAnalysisResponse> {
  return request("/api/portfolio/analysis", {
    ...(options?.requestInit ?? {}),
    cache: "no-store",
  });
}

export function getUserSettings(): Promise<UserSettingsResponse> {
  return request("/api/settings", { cache: "no-store" });
}

export function updateUserSettings(payload: {
  llm_base_url?: string | null;
  llm_api_key?: string | null;
}): Promise<UserSettingsResponse> {
  return request("/api/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function listPortfolioPositions(options?: { requestInit?: RequestInit }): Promise<PortfolioPosition[]> {
  return request("/api/portfolio", {
    ...(options?.requestInit ?? {}),
    cache: "no-store",
  });
}

export function createPortfolioPosition(position: PortfolioPosition): Promise<PortfolioPosition> {
  return request("/api/portfolio/positions", {
    method: "POST",
    body: JSON.stringify(position),
  });
}

export function updatePortfolioPosition(
  id: number,
  position: PortfolioPosition,
): Promise<PortfolioPosition> {
  return request(`/api/portfolio/positions/${id}`, {
    method: "PUT",
    body: JSON.stringify(position),
  });
}

export async function deletePortfolioPosition(id: number): Promise<void> {
  await request(`/api/portfolio/positions/${id}`, {
    method: "DELETE",
  });
}

export function getCanSlimScreen(options?: {
  scope?: "hotspot" | "market";
  topic?: string;
  limit?: number;
  requestInit?: RequestInit;
}): Promise<StrategyScreenResponse> {
  const params = new URLSearchParams();
  params.set("scope", options?.scope ?? "hotspot");
  if (options?.topic) {
    params.set("topic", options.topic);
  }
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }
  return requestWithTimeout(`/api/strategies/can-slim/screen?${params.toString()}`, 7000, options?.requestInit);
}

export function listStrategyHoldings(options?: { requestInit?: RequestInit }): Promise<StrategyHolding[]> {
  return request("/api/strategy-holdings", {
    ...(options?.requestInit ?? {}),
    cache: "no-store",
  });
}

export function createStrategyHolding(payload: StrategyHolding): Promise<StrategyHolding> {
  return request("/api/strategy-holdings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateStrategyHolding(id: number, payload: StrategyHolding): Promise<StrategyHolding> {
  return request(`/api/strategy-holdings/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteStrategyHolding(id: number): Promise<void> {
  await request(`/api/strategy-holdings/${id}`, {
    method: "DELETE",
  });
}

export function getStrategyHoldingsAnalysis(options?: {
  requestInit?: RequestInit;
}): Promise<StrategyHoldingAnalysisResponse> {
  return requestWithTimeout("/api/strategy-holdings/analysis", 30000, {
    ...(options?.requestInit ?? {}),
    cache: "no-store",
  });
}

export function refreshStrategyHoldings(options?: {
  requestInit?: RequestInit;
}): Promise<StrategyHoldingAnalysisResponse> {
  return request("/api/strategy-holdings/refresh", {
    method: "POST",
    ...(options?.requestInit ?? {}),
  });
}

/**
 * Agent goes through Next.js Route Handler POST /api/agent/query (app/api/agent/query/route.ts).
 * That handler proxies to FastAPI with a long timeout — avoids browser CORS to :8000 and
 * avoids rewrite ECONNRESET. Client always uses same-origin URL.
 */
const AGENT_REQUEST_TIMEOUT_MS = 130_000; // slightly longer than server proxy timeout

function createAgentRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function queryAgent(
  query: string,
  history: AgentHistoryTurn[] = [],
  sessionId?: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<AgentResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeoutMs ?? AGENT_REQUEST_TIMEOUT_MS);
  const requestId = createAgentRequestId();
  const originalSignal = options?.signal;
  if (originalSignal) {
    if (originalSignal.aborted) {
      controller.abort(originalSignal.reason);
    } else {
      originalSignal.addEventListener("abort", () => controller.abort(originalSignal.reason), { once: true });
    }
  }
  try {
    const response = await fetch("/api/agent/query", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(await getBrowserAuthHeaders()) },
      body: JSON.stringify({ query, history, session_id: sessionId, request_id: requestId }),
      signal: controller.signal,
    });
    const raw = await response.text();
    const data = raw ? (JSON.parse(raw) as AgentResponse) : ({} as AgentResponse);
    if (!response.ok) {
      const message =
        (data as { summary?: string; detail?: string }).summary ||
        (data as { summary?: string; detail?: string }).detail ||
        `API request failed: ${response.status}`;
      throw new ApiError(message, response.status);
    }
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Agent request timed out. Is the API running? Try ./scripts/run_api.sh");
    }
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    clearTimeout(timeoutId);
  }
}

export type AgentStreamHandlers = {
  onEvent?: (event: WorkspaceEvent) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/**
 * Stream the backend Agent protocol and normalize the existing FastAPI SSE
 * events into workspace-friendly events. The backend remains backwards
 * compatible while the UI can render tool progress and context updates.
 */
export async function streamAgent(
  query: string,
  history: AgentHistoryTurn[] = [],
  sessionId?: string,
  handlers: AgentStreamHandlers = {},
): Promise<AgentResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), handlers.timeoutMs ?? AGENT_REQUEST_TIMEOUT_MS);
  const requestId = createAgentRequestId();
  if (handlers.signal) {
    if (handlers.signal.aborted) controller.abort(handlers.signal.reason);
    else handlers.signal.addEventListener("abort", () => controller.abort(handlers.signal?.reason), { once: true });
  }

  try {
    const response = await fetch("/api/agent/query/stream", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(await getBrowserAuthHeaders()) },
      body: JSON.stringify({ query, history, session_id: sessionId, request_id: requestId }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      const text = await response.text();
      let message = text || `Agent stream failed: ${response.status}`;
      try {
        const parsed = JSON.parse(text) as { detail?: string; message?: string };
        message = parsed.detail || parsed.message || message;
      } catch {
        // Keep the raw proxy response when it is not JSON.
      }
      throw new ApiError(message, response.status);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "message";
    let result: AgentResponse | null = null;

    const consumeBlock = (block: string) => {
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) return;
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(data) as Record<string, unknown>;
      } catch {
        return;
      }
      const message = typeof payload.message === "string" ? payload.message : "";
      const progressPct = typeof payload.progress_pct === "number" ? payload.progress_pct : 0;
      const meta = payload.meta && typeof payload.meta === "object" ? (payload.meta as Record<string, unknown>) : {};
      const tool = typeof meta.tool === "string" ? meta.tool : undefined;

      if (eventName === "progress" || eventName === "start") {
        handlers.onEvent?.({ type: tool ? "tool_progress" : "tool_started", tool, message, progressPct });
      } else if (eventName === "result" && payload.payload && typeof payload.payload === "object") {
        result = payload.payload as AgentResponse;
        handlers.onEvent?.({ type: "message_completed", response: result });
      } else if (eventName === "error") {
        handlers.onEvent?.({ type: "error", message: message || "Agent 请求失败" });
      }
      eventName = "message";
    };

    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      blocks.forEach(consumeBlock);
      if (done) break;
    }
    if (buffer.trim()) consumeBlock(buffer);
    if (!result) throw new Error("Agent 没有返回最终回答");
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Agent 请求超时，请检查后端服务后重试");
    }
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timeoutId);
  }
}
