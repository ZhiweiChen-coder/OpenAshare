import asyncio
from types import SimpleNamespace

from api.agent_pydantic import (
    AgentDeps,
    AgentOutput,
    _format_stock_news_for_agent,
    build_agent_response,
    run_agent_async,
)
from api.agent_eval import EvalCase, EvalObservation, evaluate_case, summarize_report
from tests.agent_eval_cases import PUBLIC_EVAL_CASES


def _response(*, summary="", tools=(), citations=(), intent="test", payload=None):
    return {
        "intent": intent,
        "summary": summary,
        "citations": list(citations),
        "payload": {
            **(payload or {}),
            "_meta": {"tools_used": list(tools)},
        },
    }


def test_tool_aliases_and_citations_are_evaluated():
    case = next(item for item in PUBLIC_EVAL_CASES if item.case_id == "stock_analysis_uses_analysis_tool")
    response = _response(
        summary="招商银行当前偏中性。",
        tools=("get_stock_analysis",),
        citations=("/api/stocks/sh600036/analysis",),
        payload={"stock_code": "sh600036"},
    )

    result = evaluate_case(case, EvalObservation.from_response(response))

    assert result.passed
    assert result.observation.tools_used == ["stock_analysis"]


def test_greeting_rejects_any_tool_and_long_answer():
    case = next(item for item in PUBLIC_EVAL_CASES if item.case_id == "greeting_is_brief")
    response = _response(summary="你好？" + " 很高兴为你提供市场分析。" * 30, tools=("web_search",))

    result = evaluate_case(case, EvalObservation.from_response(response))

    assert not result.passed
    assert {failure.rule for failure in result.failures} == {"forbidden_tools", "conciseness"}


def test_ambiguous_question_requires_clarification():
    case = next(item for item in PUBLIC_EVAL_CASES if item.case_id == "ambiguous_stock_asks_clarification")
    response = _response(summary="你指的是哪只股票？请提供代码或名称即可。")

    result = evaluate_case(case, EvalObservation.from_response(response))

    assert result.passed


def test_missing_required_tool_is_reported_without_dumping_payload():
    case = next(item for item in PUBLIC_EVAL_CASES if item.case_id == "stock_news_uses_news_tool")
    response = _response(
        summary="招商银行最近暂无可用消息。",
        tools=("get_global_news",),
        citations=("/api/news/global",),
        payload={"news": [{"title": "private detail that must not appear in report"}]},
    )

    result = evaluate_case(case, EvalObservation.from_response(response))
    report = result.to_report()

    assert not result.passed
    assert any(failure.rule == "required_tools" for failure in result.failures)
    assert "private detail" not in str(report)
    assert report["payload_keys"] == ["news"]


def test_tool_result_usage_requires_payload_projection():
    case = next(item for item in PUBLIC_EVAL_CASES if item.case_id == "stock_news_uses_news_tool")
    response = _response(
        summary="招商银行最近有消息。",
        tools=("get_stock_news",),
        citations=("/api/stocks/sh600036/news",),
    )

    result = evaluate_case(case, EvalObservation.from_response(response))

    assert not result.passed
    assert any(failure.rule == "tool_result_usage" for failure in result.failures)


def test_summary_report_has_loop_metrics():
    case = PUBLIC_EVAL_CASES[0]
    result = evaluate_case(case, EvalObservation.from_response(_response(summary="你好")))

    report = summarize_report([result])

    assert report["total"] == 1
    assert report["passed"] == 1
    assert report["pass_rate"] == 1.0


def test_transport_failure_is_not_misreported_as_model_behavior():
    case = PUBLIC_EVAL_CASES[0]
    observation = EvalObservation(status_code=0, intent="transport_error", summary="", error="connection refused")

    result = evaluate_case(case, observation)

    assert [failure.rule for failure in result.failures] == ["http_status", "transport"]


def test_agent_run_delegates_tool_choice_to_agent():
    calls = []

    class FakeAgent:
        async def run(self, query, deps):
            calls.append(query)
            return SimpleNamespace(output=AgentOutput(summary="## 消息\n- 等待工具结果", actions=[]))

    deps = AgentDeps(
        stock_service=SimpleNamespace(),
        news_service=SimpleNamespace(),
        hotspot_service=SimpleNamespace(),
        portfolio_service=SimpleNamespace(),
        web_search_service=SimpleNamespace(),
    )

    asyncio.run(run_agent_async(FakeAgent(), deps, "看看海光信息最近消息"))

    assert calls == ["看看海光信息最近消息"]
    assert deps.tool_results == []


def test_news_formatter_preserves_evidence_for_agent():
    item = SimpleNamespace(
        title="海光信息发布重要公告",
        source="公司公告",
        published_at="2026-08-16 09:30:00",
        summary="  公司披露了新的业务进展， 需要结合公告原文判断影响。 ",
    )

    formatted = _format_stock_news_for_agent(item)

    assert "海光信息发布重要公告" in formatted
    assert "2026-08-16 09:30" in formatted
    assert "公司公告" in formatted
    assert "新的业务进展，需要结合公告原文判断影响。" in formatted


def test_news_response_does_not_invent_technical_payload():
    response = build_agent_response(
        AgentOutput(summary="## 消息面\n- 海光信息发布公告", actions=[]),
        [{
            "tool": "get_stock_news",
            "data": [{
                "stock_code": "sh688041",
                "stock_name": "海光信息",
                "title": "海光信息发布公告",
            }],
        }],
    )

    assert response.payload["stock_name"] == "海光信息"
    assert response.payload["news"][0]["title"] == "海光信息发布公告"
    assert "quote" not in response.payload
    assert "signal_summary" not in response.payload
    assert "/api/stocks/.../news" in response.citations


def test_combined_response_projects_both_requested_tool_results():
    response = build_agent_response(
        AgentOutput(summary="## 消息与走势\n- 已分别核验", actions=[]),
        [
            {
                "tool": "get_stock_analysis",
                "data": {
                    "stock_name": "海光信息",
                    "stock_code": "sh688041",
                    "market": "sh",
                    "quote": {"current_price": 100},
                    "signal_summary": {"overall_signal": "看涨", "overall_score": 4},
                    "technical_indicators": {},
                    "technical_commentary": [],
                    "ai_insight": {"enabled": False},
                    "chart_series": [],
                    "metadata": {},
                },
            },
            {
                "tool": "get_stock_news",
                "data": [{"stock_code": "sh688041", "stock_name": "海光信息", "title": "公告"}],
            },
        ],
    )

    assert response.payload["quote"]["current_price"] == 100
    assert response.payload["news"][0]["title"] == "公告"
    assert "/api/stocks/sh688041/analysis" in response.citations
    assert "/api/stocks/.../news" in response.citations


def test_greeting_short_circuits_before_agent_tool_choice():
    class FailingAgent:
        async def run(self, query, deps):
            raise AssertionError("greeting should not reach the model")

    deps = AgentDeps(
        stock_service=SimpleNamespace(),
        news_service=SimpleNamespace(),
        hotspot_service=SimpleNamespace(),
        portfolio_service=SimpleNamespace(),
        web_search_service=SimpleNamespace(),
    )

    response = asyncio.run(run_agent_async(FailingAgent(), deps, "你好"))

    assert response.intent == "greeting"
    assert deps.tool_results == []


def test_news_contract_rejects_technical_analysis_tool():
    case = EvalCase(
        case_id="news_without_analysis",
        query="看看海光信息最近消息",
        description="消息查询不应自动调用技术分析。",
        expected_tools=("stock_news",),
        forbidden_tools=("stock_analysis",),
    )
    response = _response(
        summary="海光信息最近有一条消息。",
        tools=("get_stock_news", "get_stock_analysis"),
        citations=("/api/stocks/sh688041/news", "/api/stocks/sh688041/analysis"),
    )

    result = evaluate_case(case, EvalObservation.from_response(response))

    assert not result.passed
    assert any(failure.rule == "forbidden_tools" for failure in result.failures)
