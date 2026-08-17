"use client";

import { FormEvent, useMemo, useState } from "react";

import {
  AGENT_LAB_RUN_EVENT,
  type AgentLabTrace,
} from "@/lib/workspace";

const LAB_PRESETS = [
  { label: "股票分析", query: "分析 sh600036" },
  { label: "个股新闻", query: "招商银行最近有什么消息？" },
  { label: "泛热点", query: "今天有什么热点？" },
  { label: "联网搜索", query: "请联网搜索并确认寒武纪的股票代码和交易市场。" },
  { label: "模糊问题", query: "这票怎么样？" },
  { label: "多轮追问", query: "它现在怎么样？" },
];

type AgentLabBarProps = {
  traces: AgentLabTrace[];
  onClear: () => void;
};

export function AgentLabBar({ traces, onClear }: AgentLabBarProps) {
  const [query, setQuery] = useState("");
  const latestResult = useMemo(
    () => [...traces].reverse().find((trace) => trace.phase === "result" && trace.response)?.response,
    [traces],
  );
  const running = traces.length > 0 && traces.at(-1)?.phase !== "result" && traces.at(-1)?.phase !== "error";
  const tools = latestResult?.payload?._meta?.tools_used;
  const payloadKeys = latestResult?.payload
    ? Object.keys(latestResult.payload).filter((key) => key !== "_meta")
    : [];

  function runPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    window.dispatchEvent(new CustomEvent<string>(AGENT_LAB_RUN_EVENT, { detail: trimmed }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runPrompt(query);
  }

  return (
    <section className="agent-lab-bar" aria-label="Agent 实验模式">
      <div className="agent-lab-heading">
        <div>
          <div className="agent-lab-kicker"><span className="agent-lab-pulse" />Agent Lab</div>
          <p>真实 SSE · 观察工具选择、回答和上下文</p>
        </div>
        <div className="agent-lab-actions">
          <span className={`agent-lab-status ${running ? "running" : ""}`}>{running ? "运行中" : "可测试"}</span>
          <button type="button" className="agent-lab-clear" onClick={onClear}>清空轨迹</button>
        </div>
      </div>

      <form className="agent-lab-form" onSubmit={onSubmit}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入一个你想验证的 Agent 行为…"
          aria-label="Agent 实验 query"
        />
        <button type="submit" disabled={!query.trim() || running}>运行</button>
      </form>

      <div className="agent-lab-presets" aria-label="实验预设">
        {LAB_PRESETS.map((preset) => (
          <button key={preset.label} type="button" onClick={() => runPrompt(preset.query)} disabled={running}>
            <span>{preset.label}</span>
            <small>{preset.query}</small>
          </button>
        ))}
      </div>

      <div className="agent-lab-observability">
        <div className="agent-lab-trace-list">
          <span className="agent-lab-label">LIVE TRACE</span>
          {!traces.length ? <span className="agent-lab-muted">运行一个 query 后显示工具轨迹</span> : null}
          {traces.slice(-5).map((trace) => (
            <span className={`agent-lab-trace-chip ${trace.phase}`} key={trace.id}>
              {trace.phase === "tool" ? trace.tool ?? "tool" : trace.phase === "result" ? "回答" : trace.phase === "error" ? "错误" : "开始"}
              {trace.phase === "tool" && trace.progressPct ? ` ${trace.progressPct}%` : ""}
            </span>
          ))}
        </div>
        {latestResult ? (
          <div className="agent-lab-result-meta">
            <span>intent: <strong>{latestResult.intent}</strong></span>
            <span>tools: <strong>{Array.isArray(tools) && tools.length ? tools.join(", ") : "none"}</strong></span>
            <span>citations: <strong>{latestResult.citations?.length ?? 0}</strong></span>
            <span>payload: <strong>{payloadKeys.length ? payloadKeys.join(", ") : "empty"}</strong></span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
