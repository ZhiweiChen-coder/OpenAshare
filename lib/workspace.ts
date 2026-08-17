import type { AgentResponse, HotspotItem, StockAnalysisResponse } from "@/lib/types";

export type ResearchContextType = "stock" | "topic" | "market" | "portfolio";

export type ResearchContext = {
  type: ResearchContextType;
  entityId?: string;
  title: string;
  payload: Record<string, unknown>;
  updatedAt: string;
};

export type WorkspaceSessionSummary = {
  id: string;
  title: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type WorkspaceState = {
  activeSessionId: string | null;
  selectedSymbol: string | null;
  activeContext: ResearchContext | null;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
};

export type SupabaseWorkspaceBootstrap = {
  storage: "supabase" | "local";
  user_id: string | null;
  settings: Record<string, unknown> | null;
  watchlists: Array<{
    id: string;
    name: string;
    is_default?: boolean;
    items?: Array<{
      id: string;
      symbol: string;
      display_name?: string | null;
      sort_order?: number;
    }>;
  }>;
  sessions: Array<{
    id: string;
    title: string;
    is_pinned?: boolean;
    created_at: string;
    updated_at: string;
  }>;
  pinned_contexts: Array<Record<string, unknown>>;
};

export type WorkspaceEvent =
  | { type: "message_delta"; message?: string }
  | { type: "tool_started"; tool?: string; message?: string }
  | { type: "tool_progress"; tool?: string; message?: string; progressPct?: number }
  | { type: "tool_result"; tool?: string; payload?: Record<string, unknown> }
  | { type: "context_update"; context: ResearchContext }
  | { type: "citation"; citation: string }
  | { type: "message_completed"; response: AgentResponse }
  | { type: "error"; message: string };

export type AgentLabTrace = {
  id: string;
  phase: "run_started" | "tool" | "result" | "error";
  query?: string;
  tool?: string;
  message?: string;
  progressPct?: number;
  response?: AgentResponse;
  createdAt: number;
};

export const AGENT_LAB_RUN_EVENT = "ashare:run-prompt";

export function compactHeadline(value: string, maxLength = 54) {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^\s*(快讯|速報|原标题|滚动)\s*[：:]\s*/i, "")
    .replace(/^\s*[【\[][^】\]]+[】\]]\s*/g, "")
    .replace(/\s*[|｜]\s*(来源|记者|编辑|财联社|证券时报).*$/i, "")
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}…` : cleaned;
}

export function contextFromAgentResponse(response: AgentResponse): ResearchContext | null {
  const payload = response.payload ?? {};
  const meta = payload._meta;
  const stock = payload.stock;
  const stockCode = typeof payload.stock_code === "string" ? payload.stock_code : stock?.code;
  const stockName = typeof payload.stock_name === "string" ? payload.stock_name : stock?.name;

  if (stockCode || stockName || payload.quote) {
    return {
      type: "stock",
      entityId: stockCode,
      title: stockName ? `${stockName}${stockCode ? ` · ${stockCode}` : ""}` : stockCode ?? "股票研究",
      payload,
      updatedAt: new Date().toISOString(),
    };
  }

  const topics = Array.isArray(payload.hotspots) ? (payload.hotspots as HotspotItem[]) : [];
  const topic = meta?.slots?.current_topic;
  if (topic || topics.length) {
    return {
      type: "topic",
      entityId: topic ?? topics[0]?.topic_name,
      title: topic ?? topics[0]?.topic_name ?? "市场热点",
      payload,
      updatedAt: new Date().toISOString(),
    };
  }

  if (response.intent.includes("portfolio") || Array.isArray(payload.positions)) {
    return {
      type: "portfolio",
      title: "我的持仓",
      payload,
      updatedAt: new Date().toISOString(),
    };
  }

  if (Array.isArray(payload.global_news) || response.intent.includes("market") || response.intent.includes("global")) {
    return {
      type: "market",
      title: "市场脉搏",
      payload,
      updatedAt: new Date().toISOString(),
    };
  }

  return null;
}

export function contextFromStock(code: string, name?: string): ResearchContext {
  return {
    type: "stock",
    entityId: code,
    title: name ? `${name} · ${code}` : code,
    payload: { stock_code: code, stock_name: name ?? code },
    updatedAt: new Date().toISOString(),
  };
}

export function getStockFromContext(context: ResearchContext | null): StockAnalysisResponse | null {
  if (!context || context.type !== "stock") {
    return null;
  }
  if (typeof context.payload.stock_code !== "string" || !context.payload.quote) {
    return null;
  }
  return context.payload as unknown as StockAnalysisResponse;
}
