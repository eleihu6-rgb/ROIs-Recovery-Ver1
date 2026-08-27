"""Unit tests for rust_legality_extras (compat path for old wrapper test name)."""
from __future__ import annotations

import sys
import types
from pathlib import Path

import pandas as pd

F8 = Path(__file__).resolve().parents[1] / "F8"
sys.path.insert(0, str(F8))

from rust_legality_extras import make_ground_is_rest_params  # noqa: E402


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
    assert make_ground_is_rest_params([_crew(["VAC", "DO", "SBY", "SIM"])], sections) == {
        "crew_ground_is_rest": [[True, True, False, False]]
    }


def test_is_rest_column_overrides_type():
    sections = {
        "Assignment": _assignment_df([("RESNQ", "L", "false"), ("XXX", "W", "true")])
    }
    assert make_ground_is_rest_params([_crew(["RESNQ", "XXX"])], sections) == {
        "crew_ground_is_rest": [[False, True]]
    }


def test_legacy_input_without_is_rest_falls_back_to_type_l_o():
    sections = {
        "Assignment": _assignment_df(
            [("VAC", "L"), ("DO", "O"), ("SBY", "S"), ("GRD", "W")],
            with_is_rest=False,
        )
    }
    assert make_ground_is_rest_params([_crew(["VAC", "DO", "SBY", "GRD"])], sections) == {
        "crew_ground_is_rest": [[True, True, False, False]]
    }


def test_unknown_code_and_missing_assignment_table_default_to_work():
    crews = [_crew(["VAC", "SBY"])]
    for sections in ({}, {"Assignment": pd.DataFrame()}, {"Assignment": _assignment_df([])}):
        assert make_ground_is_rest_params(crews, sections) == {
            "crew_ground_is_rest": [[False, False]]
        }, sections
    sections = {"Assignment": _assignment_df([("VAC", "L", "true")])}
    assert make_ground_is_rest_params([_crew(["VAC", "UNKNOWN"])], sections) == {
        "crew_ground_is_rest": [[True, False]]
    }
