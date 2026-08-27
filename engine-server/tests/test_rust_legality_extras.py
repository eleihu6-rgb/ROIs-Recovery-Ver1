"""Unit tests for engine-server/F8/rust_legality_extras.py (shared with wrapper)."""
from __future__ import annotations

import sys
import types
from pathlib import Path

import pandas as pd
import pytest

F8 = Path(__file__).resolve().parents[1] / "F8"
sys.path.insert(0, str(F8))

from rust_legality_extras import make_duty_params, make_ground_is_rest_params  # noqa: E402


def _crew(codes):
    tasks = [types.SimpleNamespace(assignment=c) for c in codes]
    return types.SimpleNamespace(preassign_tasks=tasks)


def _assignment_df(rows, with_is_rest=True):
    cols = ["assignment", "type"] + (["isRest"] if with_is_rest else [])
    return pd.DataFrame(rows, columns=cols)


def test_is_rest_column_is_authoritative():
    sections = {
        "Assignment": _assignment_df(
            [
                ("VAC", "L", "true"),
                ("DO", "O", "true"),
                ("SBY", "S", "false"),
                ("SIM", "T", "false"),
            ]
        )
    }
    crews = [_crew(["VAC", "DO", "SBY", "SIM"])]
    out = make_ground_is_rest_params(crews, sections)
    assert out == {"crew_ground_is_rest": [[True, True, False, False]]}


def test_is_rest_column_overrides_type():
    sections = {
        "Assignment": _assignment_df([("RESNQ", "L", "false"), ("XXX", "W", "true")])
    }
    crews = [_crew(["RESNQ", "XXX"])]
    out = make_ground_is_rest_params(crews, sections)
    assert out == {"crew_ground_is_rest": [[False, True]]}


def test_legacy_input_without_is_rest_falls_back_to_type_l_o():
    sections = {
        "Assignment": _assignment_df(
            [("VAC", "L"), ("DO", "O"), ("SBY", "S"), ("GRD", "W")],
            with_is_rest=False,
        )
    }
    crews = [_crew(["VAC", "DO", "SBY", "GRD"])]
    out = make_ground_is_rest_params(crews, sections)
    assert out == {"crew_ground_is_rest": [[True, True, False, False]]}


def test_unknown_code_and_missing_assignment_table_default_to_work():
    crews = [_crew(["VAC", "SBY"])]
    for sections in ({}, {"Assignment": pd.DataFrame()}, {"Assignment": _assignment_df([])}):
        out = make_ground_is_rest_params(crews, sections)
        assert out == {"crew_ground_is_rest": [[False, False]]}, sections
    sections = {"Assignment": _assignment_df([("VAC", "L", "true")])}
    out = make_ground_is_rest_params([_crew(["VAC", "UNKNOWN"])], sections)
    assert out == {"crew_ground_is_rest": [[True, False]]}


class _P:
    def __init__(self, pid):
        self.id = pid
        self.original_pairing_id = pid


def test_make_duty_params_blk_from_act_flight_minutes(monkeypatch):
    monkeypatch.setattr(
        "rust_legality_extras._tz_offset_min", lambda iata, at_utc: 0
    )
    monkeypatch.setattr(
        "rust_legality_extras._per_crew_offsets",
        lambda bases, ts: [[0] * len(ts) for _ in bases],
    )
    start = pd.Timestamp("2026-06-01T12:00:00Z")
    end = pd.Timestamp("2026-06-01T20:00:00Z")
    sections = {
        "PairingDuty": pd.DataFrame(
            [
                {
                    "pairingId": "10",
                    "dutySeq": 1,
                    "actStrDtUtc": start,
                    "actEndDtUtc": end,
                    "strArp": "YVR",
                    "endArp": "YYC",
                    "actualDutyMinutes": 480,
                    "actFlightMinutes": 400,
                    "creditedMinutes": 111,
                }
            ]
        )
    }
    out = make_duty_params([_P("10")], sections, ["YVR"])
    assert out["pairing_duty_blk_min"] == [400]
    assert out["pairing_duty_dp_min"] == [480]
    assert out["pairing_duty_credit_min"] == [111]
