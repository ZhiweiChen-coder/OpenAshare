#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from pathlib import Path
from typing import Iterable
from zoneinfo import ZoneInfo


SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")
DEFAULT_REPORT_NAME = "A股大盘与板块轮动每日监控"
SENT_SUBJECT_RE = re.compile(
    r"Email sent to `me` with subject `(?P<subject>[^`]+)`\.",
)
SECTION_RE = re.compile(r"^##\s+")
DATE_RE = re.compile(
    r"^(?P<name>.+?) - (?P<date>\d{4}-\d{2}-\d{2})(?P<backfill>（补做）)?$"
)
INVALID_SECTION_MARKERS = (
    "could not be produced",
    "intentionally not produced",
    "early-trigger notice email",
    "待收盘确认",
)


@dataclass(frozen=True)
class GuardDecision:
    action: str
    target_date: str | None
    subject: str | None
    reason: str
    now_cst: str

    def to_dict(self) -> dict[str, str | None]:
        return {
            "action": self.action,
            "target_date": self.target_date,
            "subject": self.subject,
            "reason": self.reason,
            "now_cst": self.now_cst,
        }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Guardrail for the daily A-share post-close monitor automation.",
    )
    parser.add_argument(
        "--memory",
        default=None,
        help="Path to the automation memory.md file.",
    )
    parser.add_argument(
        "--report-name",
        default=DEFAULT_REPORT_NAME,
        help="Expected email subject prefix.",
    )
    parser.add_argument(
        "--now",
        default=None,
        help="Override current time in ISO format for testing, e.g. 2026-07-10T15:20:00+08:00.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON only.",
    )
    return parser.parse_args()


def _resolve_memory_path(raw_path: str | None) -> Path:
    if raw_path:
        return Path(raw_path).expanduser()
    codex_home = Path.home() / ".codex"
    return codex_home / "automations" / "a" / "memory.md"


def _load_sent_subjects(memory_path: Path, report_name: str) -> set[str]:
    if not memory_path.exists():
        return set()

    sent_subjects: set[str] = set()
    section_lines: list[str] = []

    def flush_section(lines: list[str]) -> None:
        if not lines:
            return
        section_text = "\n".join(lines)
        lowered = section_text.lower()
        if any(marker.lower() in lowered for marker in INVALID_SECTION_MARKERS):
            return
        for line in lines:
            match = SENT_SUBJECT_RE.search(line)
            if not match:
                continue
            subject = match.group("subject").strip()
            parsed = DATE_RE.match(subject)
            if not parsed:
                continue
            if parsed.group("name") != report_name:
                continue
            sent_subjects.add(subject)

    for line in memory_path.read_text(encoding="utf-8").splitlines():
        if SECTION_RE.match(line):
            flush_section(section_lines)
            section_lines = [line]
            continue
        section_lines.append(line)

    flush_section(section_lines)
    return sent_subjects


def _parse_now(raw_now: str | None) -> datetime:
    if not raw_now:
        return datetime.now(tz=SHANGHAI_TZ)

    parsed = datetime.fromisoformat(raw_now)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=SHANGHAI_TZ)
    return parsed.astimezone(SHANGHAI_TZ)


def _is_weekday(dt: datetime) -> bool:
    return dt.weekday() < 5


def _previous_weekday(dt: datetime) -> datetime:
    cursor = dt - timedelta(days=1)
    while cursor.weekday() >= 5:
        cursor -= timedelta(days=1)
    return cursor


def _subject_variants(report_name: str, target_date: str) -> Iterable[str]:
    yield f"{report_name} - {target_date}"
    yield f"{report_name} - {target_date}（补做）"


def _has_sent(sent_subjects: set[str], report_name: str, target_date: str) -> bool:
    return any(subject in sent_subjects for subject in _subject_variants(report_name, target_date))


def decide_action(now_dt: datetime, sent_subjects: set[str], report_name: str) -> GuardDecision:
    now_cst = now_dt.strftime("%Y-%m-%d %H:%M:%S CST")
    close_time = time(15, 0)
    today = now_dt.date().isoformat()

    if now_dt.time() >= close_time and _is_weekday(now_dt):
        if _has_sent(sent_subjects, report_name, today):
            return GuardDecision(
                action="skip",
                target_date=today,
                subject=f"{report_name} - {today}",
                reason="today_report_already_sent",
                now_cst=now_cst,
            )
        return GuardDecision(
            action="analyze_today",
            target_date=today,
            subject=f"{report_name} - {today}",
            reason="post_close_window",
            now_cst=now_cst,
        )

    previous = _previous_weekday(now_dt)
    previous_date = previous.date().isoformat()
    if _has_sent(sent_subjects, report_name, previous_date):
        return GuardDecision(
            action="skip",
            target_date=today if _is_weekday(now_dt) else previous_date,
            subject=f"{report_name} - {today}",
            reason="waiting_for_today_close_or_previous_already_sent",
            now_cst=now_cst,
        )

    return GuardDecision(
        action="backfill_previous",
        target_date=previous_date,
        subject=f"{report_name} - {previous_date}（补做）",
        reason="previous_trading_day_missing",
        now_cst=now_cst,
    )


def main() -> None:
    args = _parse_args()
    memory_path = _resolve_memory_path(args.memory)
    now_dt = _parse_now(args.now)
    sent_subjects = _load_sent_subjects(memory_path, args.report_name)
    decision = decide_action(now_dt, sent_subjects, args.report_name)

    if args.json:
        print(json.dumps(decision.to_dict(), ensure_ascii=False))
        return

    print(f"memory={memory_path}")
    print(json.dumps(decision.to_dict(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
