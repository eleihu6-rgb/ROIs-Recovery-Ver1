"""Unit tests for live_alert_messages (ro_check Live-style Warning Message bodies)."""

from __future__ import annotations

import json
from pathlib import Path

from live_alert_messages import (
    dedupe_violations_for_display,
    format_live_style_message,
    parse_pipe,
)


def test_shared_messages_json_has_8072_7506_7509() -> None:
    root = Path(__file__).resolve().parents[2]  # rois-ai
    data = json.loads((root / "packages/legality-messages/messages.json").read_text())
    assert set(data["rules"]) >= {"8072", "7506", "7509"}


def test_parse_pipe_basic() -> None:
    code, fields = parse_pipe("8072|segment=12|qualified=2|min=0|max=1")
    assert code == "8072"
    assert fields["qualified"] == "2"
    assert fields["min"] == "0"
    assert fields["max"] == "1"
    assert fields["segment"] == "12"


def test_8072_live_style_body_uses_en_dash() -> None:
    v = "8072|segment=99|qualified=2|planned=0|filled=2|min=0|max=1|over=1"
    assert format_live_style_message(v) == (
        "Crew count out of range (Current: 2, Allowed: 0\u20131)."
    )


def test_8072_missing_fields_returns_none() -> None:
    assert format_live_style_message("8072|segment=1|qualified=2") is None


def test_7506_utc_date_from_local_day_start() -> None:
    # 2024-06-15 00:00:00 UTC
    ts = 1_718_409_600
    v = f"7506|local_day_start={ts}|groups=FLY"
    assert format_live_style_message(v) == "Multiple check-ins per day (2024-06-15)."


def test_7506_bad_epoch_returns_none() -> None:
    assert format_live_style_message("7506|local_day_start=not-a-number|groups=FLY") is None


def test_7509_live_style_body() -> None:
    v = "7509|row=0|crew=1256|paired_crew=1435|pairing=186|flight=16010"
    assert format_live_style_message(v) == (
        "Crew 1256 and 1435 cannot both be assigned to flight 16010."
    )


def test_unknown_code_returns_none() -> None:
    assert format_live_style_message("8002|window_start=1|credit=2") is None


def test_dedupe_8072_same_body_different_segment() -> None:
    a = "8072|segment=1|qualified=2|planned=0|filled=2|min=0|max=1|over=1"
    b = "8072|segment=2|qualified=2|planned=0|filled=2|min=0|max=1|over=1"
    assert dedupe_violations_for_display([a, b]) == [a]


def test_dedupe_keeps_distinct_bodies_and_unmapped() -> None:
    a = "8072|segment=1|qualified=2|min=0|max=1"
    b = "8072|segment=2|qualified=3|min=0|max=1"
    c = "8002|window_start=1"
    d = "8002|window_start=1"
    assert dedupe_violations_for_display([a, b, c, d]) == [a, b, c]
