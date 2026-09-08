"""Unit tests for engine-server/F8/rust_legality_extras.py (shared with wrapper)."""
from __future__ import annotations

import sys
import types
from pathlib import Path

import pandas as pd
import pytest

F8 = Path(__file__).resolve().parents[1] / "F8"
sys.path.insert(0, str(F8))

from rust_legality_extras import (  # noqa: E402
    apply_fdp_3007,
    make_duty_params,
    make_fdp_3007_tsv,
    make_ground_is_rest_params,
)


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


_3007_HEADER = [
    "COMPOSITION",
    "RPT START",
    "RPT END",
    "LANDING LOWER",
    "LANDINGS UPPER",
    "REST FACILITY",
    "MAX FDP",
    "MAX EXTENSION",
    "ISAUGMENT",
    "DEPARTURE START",
    "DEPARTURE END",
    "DUTY TYPE",
    "DUTY FLEET",
    "LT REST THREADHOLD",
    "LT REST RATIO",
    "EXTENSION TS FLAGS",
    "AT BASE FDP EXTENSION",
    "OUT OF BASE FDP EXTENSION",
    "LEG SCH BLH START",
    "LEG SCH BLH END",
]
_3007_ROW = [
    "*",
    "00:00",
    "23:59",
    "0",
    "99",
    "*",
    "01:00",
    "",
    "N",
    "00:00",
    "23:59",
    "*",
    "*",
    "",
    "",
    "*",
    "00:00",
    "00:00",
    "*",
    "*",
]


def _rule_sections(*, in_ruleset: bool = True) -> dict:
    sections = {
        "Rule": pd.DataFrame(
            [
                {"id": "3007001", "function": 3007, "instance": "001"},
                {"id": "2107001", "function": 2107, "instance": "001"},
                {"id": "3010001", "function": 3010, "instance": "001"},
            ]
        ),
        "RuleParameter": pd.DataFrame(
            [
                {
                    "ruleId": "3007001",
                    "paramNames": "tableHeader",
                    "paramValues": ",".join(_3007_HEADER),
                },
                {
                    "ruleId": "3007001",
                    "paramNames": "tableRow1",
                    "paramValues": ",".join(_3007_ROW),
                },
                {
                    "ruleId": "2107001",
                    "paramNames": "tableHeader",
                    "paramValues": "DEFINITION,DIVISION,VALUE",
                },
                {
                    "ruleId": "2107001",
                    "paramNames": "tableRow1",
                    "paramValues": "INCLUDE CHECK IN,*,Y",
                },
                {
                    "ruleId": "2107001",
                    "paramNames": "tableRow2",
                    "paramValues": "INCLUDE CHECK OUT,*,N",
                },
                {
                    "ruleId": "3010001",
                    "paramNames": "tableHeader",
                    "paramValues": "BRIEF,DEBRIEF,AIRPORT,FLEET,FLT NUM",
                },
                {
                    "ruleId": "3010001",
                    "paramNames": "tableRow1",
                    "paramValues": "60,15,*,*,*",
                },
            ]
        ),
        "PairingDuty": pd.DataFrame(
            [
                {
                    "pairingId": "150399",
                    "dutySeq": 1,
                    "assignment": "FLY",
                    "actStrDtUtc": "2025-01-01T08:00:00Z",
                    "actEndDtUtc": "2025-01-01T10:00:00Z",
                    "planFdpMinutes": None,
                    "isManualModify": 0,
                    "fdpDiscretionMin": 0,
                }
            ]
        ),
        "PairingDutySegment": pd.DataFrame(
            [
                {
                    "pairingId": "150399",
                    "dutySeq": 1,
                    "segSeq": 1,
                    "fltId": 1,
                    "assignment": "FLY",
                    "actStrDtUtc": "2025-01-01T08:00:00Z",
                    "actEndDtUtc": "2025-01-01T10:00:00Z",
                    "schStartDtUtc": "2025-01-01T08:00:00Z",
                    "schEndDtUtc": "2025-01-01T10:00:00Z",
                    "depArp": "ADD",
                    "arvArp": "DXB",
                    "fleet": "737",
                }
            ]
        ),
    }
    if in_ruleset:
        sections["RuleSet"] = pd.DataFrame(
            [{"worksetId": 103, "ruleId": "3007001"}, {"worksetId": 103, "ruleId": "2107001"}, {"worksetId": 103, "ruleId": "3010001"}]
        )
    return sections


def test_make_fdp_3007_tsv_uses_engine_pairing_index():
    tsv = make_fdp_3007_tsv([_P("150398"), _P("150399")], _rule_sections())
    assert tsv
    assert "H\tCOMPOSITION\tRPT START" in tsv
    assert "R\t0\t*" in tsv
    assert "MAX FDP" in tsv
    assert "C\t60\t15" in tsv
    assert "B\tINCLUDE CHECK IN\tY" in tsv
    duty_lines = [line for line in tsv.splitlines() if line.startswith("D\t")]
    assert len(duty_lines) == 1
    cols = duty_lines[0].split("\t")
    assert cols[3] == "1", duty_lines[0]
    assert cols[4] == "1"
    assert cols[5] == "FLY"
    assert cols[6] == ""
    seg_lines = [line for line in tsv.splitlines() if line.startswith("S\t")]
    assert len(seg_lines) == 1
    assert "ADD" in seg_lines[0]
    assert "DXB" in seg_lines[0]


def test_make_fdp_3007_tsv_empty_when_3007_not_in_ruleset():
    sections = _rule_sections(in_ruleset=True)
    sections["RuleSet"] = pd.DataFrame([{"worksetId": 103, "ruleId": "8002001"}])
    assert make_fdp_3007_tsv([_P("150399")], sections) == ""


def test_make_fdp_3007_tsv_empty_without_3007_params():
    assert make_fdp_3007_tsv([_P("150399")], {}) == ""


def test_apply_fdp_3007_noops_on_empty_tsv():
    class _Eng:
        def set_fdp_3007(self, tsv):
            raise AssertionError(tsv)

    apply_fdp_3007(_Eng(), "")
    apply_fdp_3007(None, "")


def test_apply_fdp_3007_calls_engine():
    captured: list[str] = []

    class _Eng:
        def set_fdp_3007(self, tsv):
            captured.append(tsv)

    apply_fdp_3007(_Eng(), "H\tMAX FDP\nR\t0\t01:00\n")
    assert captured and captured[0].startswith("H\tMAX FDP")
