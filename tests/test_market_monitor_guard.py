from __future__ import annotations

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from scripts.market_monitor_guard import decide_action, _load_sent_subjects


SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")
REPORT_NAME = "A股大盘与板块轮动每日监控"


def _dt(raw: str) -> datetime:
    return datetime.fromisoformat(raw).replace(tzinfo=SHANGHAI_TZ)


def test_after_close_runs_today_when_unsent() -> None:
    decision = decide_action(_dt("2026-07-10T15:20:00"), set(), REPORT_NAME)

    assert decision.action == "analyze_today"
    assert decision.target_date == "2026-07-10"
    assert decision.subject == "A股大盘与板块轮动每日监控 - 2026-07-10"


def test_before_close_backfills_previous_when_missing() -> None:
    decision = decide_action(_dt("2026-07-10T09:20:00"), set(), REPORT_NAME)

    assert decision.action == "backfill_previous"
    assert decision.target_date == "2026-07-09"
    assert decision.subject == "A股大盘与板块轮动每日监控 - 2026-07-09（补做）"


def test_before_close_skips_when_previous_already_sent() -> None:
    sent = {"A股大盘与板块轮动每日监控 - 2026-07-09"}
    decision = decide_action(_dt("2026-07-10T09:20:00"), sent, REPORT_NAME)

    assert decision.action == "skip"
    assert decision.reason == "waiting_for_today_close_or_previous_already_sent"


def test_monday_before_close_uses_previous_friday() -> None:
    decision = decide_action(_dt("2026-07-13T09:20:00"), set(), REPORT_NAME)

    assert decision.action == "backfill_previous"
    assert decision.target_date == "2026-07-10"


def test_load_sent_subjects_accepts_normal_and_backfill_subjects(tmp_path: Path) -> None:
    memory = tmp_path / "memory.md"
    memory.write_text(
        "\n".join(
            [
                "Email sent to `me` with subject `A股大盘与板块轮动每日监控 - 2026-07-09`.",
                "Email sent to `me` with subject `A股大盘与板块轮动每日监控 - 2026-07-08（补做）`.",
                "Email sent to `me` with subject `别的报告 - 2026-07-09`.",
            ]
        ),
        encoding="utf-8",
    )

    sent = _load_sent_subjects(memory, REPORT_NAME)

    assert "A股大盘与板块轮动每日监控 - 2026-07-09" in sent
    assert "A股大盘与板块轮动每日监控 - 2026-07-08（补做）" in sent
    assert "别的报告 - 2026-07-09" not in sent


def test_load_sent_subjects_ignores_early_trigger_notice_sections(tmp_path: Path) -> None:
    memory = tmp_path / "memory.md"
    memory.write_text(
        "\n".join(
            [
                "## 2026-07-10",
                "- This run was triggered before the China market close, so a valid post-close A-share regime report could not be produced.",
                "- Correct handling: sent an early-trigger notice email instead of forcing a false post-close conclusion.",
                "- Email sent to `me` with subject `A股大盘与板块轮动每日监控 - 2026-07-10`.",
                "## 2026-07-11",
                "- Email sent to `me` with subject `A股大盘与板块轮动每日监控 - 2026-07-11`.",
            ]
        ),
        encoding="utf-8",
    )

    sent = _load_sent_subjects(memory, REPORT_NAME)

    assert "A股大盘与板块轮动每日监控 - 2026-07-10" not in sent
    assert "A股大盘与板块轮动每日监控 - 2026-07-11" in sent
