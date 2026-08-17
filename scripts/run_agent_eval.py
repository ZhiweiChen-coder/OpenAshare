#!/usr/bin/env python3
"""Run observable Agent evaluations against a local HTTP server.

Examples:
  python scripts/run_agent_eval.py --base-url http://127.0.0.1:8000
  python scripts/run_agent_eval.py --case greeting_is_brief
  python scripts/run_agent_eval.py --include-private  # only in an authorized local environment
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any

import requests

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api.agent_eval import EvalCase, EvalObservation, EvalResult, evaluate_case, summarize_report  # noqa: E402
from tests.agent_eval_cases import ONLINE_EVAL_CASES, PRIVATE_EVAL_CASES, PUBLIC_EVAL_CASES  # noqa: E402


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run observable Agent behavior evals")
    parser.add_argument("--base-url", default=os.getenv("AGENT_EVAL_BASE_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--case", action="append", dest="case_ids", help="run only this case id; repeatable")
    parser.add_argument("--timeout", type=float, default=45.0)
    parser.add_argument("--json-out", type=Path)
    parser.add_argument(
        "--include-private",
        action="store_true",
        help="include local/private cases; never use this with real user holdings or an external model",
    )
    parser.add_argument(
        "--include-online",
        action="store_true",
        help="include cases that verify online stock/search fallbacks",
    )
    parser.add_argument(
        "--show-summary",
        action="store_true",
        help="print a truncated model summary for manual regression review",
    )
    return parser.parse_args()


def _request_case(base_url: str, case: EvalCase, timeout: float) -> EvalObservation:
    session_id = f"agent-eval-{case.case_id}-{uuid.uuid4().hex[:10]}"
    body: dict[str, Any] = {"query": case.query, "session_id": session_id}
    if case.history:
        body["history"] = list(case.history)
    try:
        response = requests.post(
            f"{base_url.rstrip('/')}/api/agent/query",
            json=body,
            timeout=timeout,
        )
    except requests.RequestException as exc:
        return EvalObservation(status_code=0, intent="transport_error", summary="", error=str(exc))
    try:
        payload = response.json()
    except ValueError:
        payload = {"intent": "error", "summary": "non-JSON response", "payload": {}}
    return EvalObservation.from_response(payload, status_code=response.status_code)


def _print_result(result: EvalResult, show_summary: bool = False) -> None:
    status = "PASS" if result.passed else "FAIL"
    observation = result.observation
    print(
        f"[{status}] {result.case.case_id} | intent={observation.intent or '-'} "
        f"| tools={','.join(observation.tools_used) or '-'} "
        f"| chars={len(observation.summary)} | citations={len(observation.citations)}"
    )
    for failure in result.failures:
        print(f"       {failure.rule}: {failure.message}")
    if show_summary and observation.summary:
        compact = " ".join(observation.summary.split())
        print(f"       summary: {compact[:500]}")


def main() -> int:
    args = _parse_args()
    cases = list(PUBLIC_EVAL_CASES)
    if args.include_private:
        cases.extend(PRIVATE_EVAL_CASES)
    if args.include_online:
        cases.extend(ONLINE_EVAL_CASES)
    if args.case_ids:
        requested = set(args.case_ids)
        cases = [case for case in cases if case.case_id in requested]
        missing = requested - {case.case_id for case in cases}
        if missing:
            print(f"Unknown case id(s): {', '.join(sorted(missing))}", file=sys.stderr)
            return 2

    results = []
    for case in cases:
        result = evaluate_case(case, _request_case(args.base_url, case, args.timeout))
        results.append(result)
        _print_result(result, show_summary=args.show_summary)

    report = summarize_report(results)
    print(f"\nAgent eval: {report['passed']}/{report['total']} passed ({report['pass_rate']:.1%})")
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Report written to {args.json_out}")
    return 0 if report["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
