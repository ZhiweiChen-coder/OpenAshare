"""Observable Agent behavior evaluation helpers.

This module deliberately evaluates the contract visible to a user or client:
tool selection, clarification, concise output, and citations.  It does not
inspect or persist hidden model chain-of-thought.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional, Sequence


TOOL_ALIASES: dict[str, set[str]] = {
    "stock_search": {"search_stocks", "stock_search", "search_stock"},
    "stock_analysis": {"get_stock_analysis", "stock_analysis", "analyze_stock"},
    "stock_news": {"get_stock_news", "stock_news", "news_lookup"},
    "global_news": {"get_global_news", "global_news", "context_news"},
    "hotspots": {"list_hotspots", "hotspots", "hotspot_lookup"},
    "hotspot_detail": {"get_hotspot_detail", "hotspot_detail"},
    "web_search": {"web_search", "search_web"},
    "portfolio_analysis": {"get_portfolio_analysis", "portfolio_analysis"},
}

_TOOL_CANONICAL: dict[str, str] = {
    alias: canonical
    for canonical, aliases in TOOL_ALIASES.items()
    for alias in aliases
}
ALL_TOOLS = frozenset(TOOL_ALIASES)


@dataclass(frozen=True)
class EvalCase:
    """One user-visible behavior contract for the Agent."""

    case_id: str
    query: str
    description: str
    expected_tools: tuple[str, ...] = ()
    required_tool_groups: tuple[tuple[str, ...], ...] = ()
    forbidden_tools: tuple[str, ...] = ()
    required_payload_keys: tuple[str, ...] = ()
    required_payload_groups: tuple[tuple[str, ...], ...] = ()
    required_payload_terms: tuple[str, ...] = ()
    clarification: Optional[bool] = None
    max_chars: Optional[int] = None
    required_terms: tuple[str, ...] = ()
    require_citation: bool = False
    history: tuple[dict[str, Any], ...] = ()
    private: bool = False


@dataclass
class EvalObservation:
    """Safe, compact representation of an Agent HTTP response."""

    status_code: int
    intent: str
    summary: str
    citations: list[str] = field(default_factory=list)
    tools_used: list[str] = field(default_factory=list)
    payload_keys: list[str] = field(default_factory=list)
    payload_search_text: str = field(default="", repr=False)
    error: Optional[str] = None

    @classmethod
    def from_response(cls, response: Mapping[str, Any], status_code: int = 200) -> "EvalObservation":
        payload = response.get("payload") if isinstance(response, Mapping) else {}
        payload = payload if isinstance(payload, Mapping) else {}
        meta = payload.get("_meta") if isinstance(payload, Mapping) else {}
        meta = meta if isinstance(meta, Mapping) else {}
        raw_tools = meta.get("tools_used", [])
        raw_tools = raw_tools if isinstance(raw_tools, Sequence) and not isinstance(raw_tools, (str, bytes)) else []
        tools = sorted({canonical_tool(str(item)) for item in raw_tools if str(item).strip()})
        raw_citations = response.get("citations", [])
        citations = [str(item) for item in raw_citations] if isinstance(raw_citations, list) else []
        raw_keys = payload.keys() if isinstance(payload, Mapping) else []
        intent = str(response.get("intent", ""))
        summary = str(response.get("summary", ""))
        error = summary if intent == "error" else None
        return cls(
            status_code=status_code,
            intent=intent,
            summary=summary,
            citations=citations,
            tools_used=tools,
            payload_keys=sorted(str(key) for key in raw_keys if key != "_meta"),
            payload_search_text=json.dumps(payload, ensure_ascii=False, default=str),
            error=error,
        )


@dataclass(frozen=True)
class EvalFailure:
    rule: str
    message: str


@dataclass
class EvalResult:
    case: EvalCase
    observation: EvalObservation
    failures: list[EvalFailure] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return not self.failures

    def to_report(self) -> dict[str, Any]:
        return {
            "case_id": self.case.case_id,
            "passed": self.passed,
            "status_code": self.observation.status_code,
            "intent": self.observation.intent,
            "tools_used": self.observation.tools_used,
            "summary_chars": len(self.observation.summary),
            "citation_count": len(self.observation.citations),
            "payload_keys": self.observation.payload_keys,
            "error": self.observation.error,
            "failures": [{"rule": item.rule, "message": item.message} for item in self.failures],
        }


def canonical_tool(tool: str) -> str:
    """Normalize deterministic and PydanticAI tool names to one vocabulary."""

    normalized = tool.strip().lower()
    return _TOOL_CANONICAL.get(normalized, normalized)


def _looks_like_clarification(summary: str) -> bool:
    text = summary.strip()
    markers = (
        "哪只",
        "哪一只",
        "哪个",
        "哪条",
        "哪则",
        "哪一个",
        "请提供",
        "请告诉我",
        "你指的是",
        "具体是",
        "代码或名称",
        "名称或代码",
        "范围",
    )
    return any(marker in text for marker in markers)


def evaluate_case(case: EvalCase, observation: EvalObservation) -> EvalResult:
    """Apply observable behavior rules and return compact failures."""

    failures: list[EvalFailure] = []
    tools = set(observation.tools_used)

    if observation.status_code != 200:
        failures.append(EvalFailure("http_status", f"expected 200, got {observation.status_code}"))
        if observation.error:
            failures.append(EvalFailure("transport", observation.error[:240]))
        return EvalResult(case=case, observation=observation, failures=failures)
    if observation.intent == "error":
        failures.append(EvalFailure("agent_error", observation.error or "Agent returned error intent"))
        return EvalResult(case=case, observation=observation, failures=failures)

    missing = [tool for tool in case.expected_tools if canonical_tool(tool) not in tools]
    if missing:
        failures.append(EvalFailure("required_tools", f"missing required tools: {', '.join(missing)}"))

    for group in case.required_tool_groups:
        normalized_group = {canonical_tool(tool) for tool in group}
        if not tools.intersection(normalized_group):
            failures.append(EvalFailure("required_tool_group", f"expected one of: {', '.join(sorted(normalized_group))}"))

    missing_payload = [key for key in case.required_payload_keys if key not in observation.payload_keys]
    if missing_payload:
        failures.append(EvalFailure("tool_result_usage", f"response payload is missing: {', '.join(missing_payload)}"))
    for group in case.required_payload_groups:
        if not set(group).intersection(observation.payload_keys):
            failures.append(EvalFailure("tool_result_usage", f"expected one payload key from: {', '.join(group)}"))
    for term in case.required_payload_terms:
        if term not in observation.payload_search_text:
            failures.append(EvalFailure("tool_result_usage", f"payload result is missing: {term}"))

    forbidden = ALL_TOOLS if "all" in case.forbidden_tools else {
        canonical_tool(tool) for tool in case.forbidden_tools
    }
    unexpected = sorted(tools.intersection(forbidden))
    if unexpected:
        failures.append(EvalFailure("forbidden_tools", f"unexpected tools: {', '.join(unexpected)}"))

    if case.clarification is True and not _looks_like_clarification(observation.summary):
        failures.append(EvalFailure("clarification", "response does not ask for the missing object or scope"))
    if case.clarification is False and _looks_like_clarification(observation.summary):
        failures.append(EvalFailure("unnecessary_clarification", "response asks a follow-up question for a complete query"))

    if case.max_chars is not None and len(observation.summary) > case.max_chars:
        failures.append(EvalFailure("conciseness", f"summary has {len(observation.summary)} chars, limit is {case.max_chars}"))

    for term in case.required_terms:
        if term not in observation.summary:
            failures.append(EvalFailure("required_terms", f"summary is missing: {term}"))

    if case.require_citation and not observation.citations:
        failures.append(EvalFailure("citation", "data-backed answer has no citation"))

    return EvalResult(case=case, observation=observation, failures=failures)


def summarize_report(results: Sequence[EvalResult]) -> dict[str, Any]:
    passed = sum(item.passed for item in results)
    return {
        "total": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "pass_rate": round(passed / len(results), 3) if results else 0.0,
        "cases": [item.to_report() for item in results],
    }


def report_json(results: Sequence[EvalResult]) -> str:
    return json.dumps(summarize_report(results), ensure_ascii=False, indent=2)
