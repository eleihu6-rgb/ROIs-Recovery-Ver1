"""Tests for ``src.report.scenario_report.build_report_sections``.

Builds a minimal ``result_json`` mirroring the real solver output shape
(see ``Flair_PBS_Optimization_Report/unit_test/596_YVR_Pilot_20260731_070053/
result.json``: ``pairing_info`` / ``assignment`` / ``crew_info`` /
``initial_generator_summary.credit_hour_report``) plus a synthetic
``input_sections`` dict in the live-server ``##`` snake_case format.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timezone

import pytest

from src.report.scenario_report import build_report_sections

CREDIT_HOUR_KEYS = [
    "crew_id",
    "base",
    "rank",
    "credited_hours",
    "credit_min",
    "credit_max",
    "pre_assigned_types",
    "in_range",
    "available_days",
    "per_day_rate",
    "period_credit_target",
    "target_gap",
    "preassign_rest_days",
    "required_dayoff",
    "actual_dayoff",
    "dayoff_ok",
]

PAIRING_COMPLEMENT_KEYS = [
    "coverage_type",
    "task_id",
    "original_pairing_id",
    "interface_id",
    "name",
    "base",
    "rank",
    "assignment",
    "start_base",
    "end_base",
    "credit",
    "coverage_status",
    "assigned_crew",
    "is_fixed",
]


def _epoch(iso: str) -> int:
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return int(dt.astimezone(timezone.utc).timestamp())


def _result_json() -> dict:
    """Minimal solver result mirroring the real result.json shapes."""
    return {
        "crew_info": {
            "C001": {
                "rank": "CA",
                "base": "YVR",
                "seniority": 3,
                "rosters": [{"pairing_id": "t1_CA", "is_fixed": True}],
                "preassign_tasks": [
                    {
                        "id": "9001",
                        "start_time_utc": _epoch("2026-07-20T00:00:00Z"),
                        "end_time_utc": _epoch("2026-07-21T00:00:00Z"),
                        "assignment_group": "GRD",
                        "assignment": "VAC",
                        "label": "VAC",
                        "source": "PA",
                        "source_credited_minutes": 240.0,
                        "raw_credited_minutes": 240.0,
                        "credited_hours": 4.0,
                        "credit_source": "roster_ground_credited_minutes",
                    }
                ],
            },
            "C002": {
                "rank": "CA",
                "base": "YVR",
                "seniority": 7,
                "rosters": [],
                "preassign_tasks": [],
            },
        },
        "pairing_info": {
            "t1_CA": {
                "id": "t1_CA",
                "original_pairing_id": "P1",
                "base": "YVR",
                "blh": 18.0,
                "raw_credited_minutes": 1200.0,
                "start_time_utc": _epoch("2026-07-05T00:00:00Z"),
                "end_time_utc": _epoch("2026-07-07T00:00:00Z"),
                "rank_composition": {"CA": 1},
                "assignment_group": "FLY",
                "assignment": "FLY",
            },
            "t2_CA": {
                "id": "t2_CA",
                "original_pairing_id": "P2",
                "base": "YVR",
                "blh": 7.0,
                "raw_credited_minutes": 480.0,
                "start_time_utc": _epoch("2026-07-10T00:00:00Z"),
                "end_time_utc": _epoch("2026-07-12T00:00:00Z"),
                "rank_composition": {"CA": 1},
                "assignment_group": "FLY",
                "assignment": "FLY",
            },
            "r1_CA": {
                "id": "r1_CA",
                "original_pairing_id": "P3",
                "base": "YVR",
                "blh": 12.0,
                "raw_credited_minutes": None,
                "start_time_utc": _epoch("2026-07-15T00:00:00Z"),
                "end_time_utc": _epoch("2026-07-16T00:00:00Z"),
                "rank_composition": {"CA": 1},
                "assignment_group": "SBY",
                "assignment": "PRAM",
            },
        },
        "assignment": {
            "C001": ["t1_CA"],
            "C002": [],
        },
        "initial_generator_summary": {
            "credit_hour_report": [
                {
                    "crew_id": "C001",
                    "rank": "CA",
                    "credited_hours": 83.75,
                    "target_min": 75.0,
                    "target_max": 92.0,
                    "in_range": True,
                    "available_days": 18,
                    "per_day_rate": 3.939,
                    "period_credit_target": 90.9,
                    "target_gap": -7.15,
                    "preassign_rest_days": 6,
                    "required_dayoff": 7,
                    "actual_dayoff": 11,
                    "dayoff_ok": True,
                },
                {
                    "crew_id": "C002",
                    "rank": "CA",
                    "credited_hours": 60.0,
                    "target_min": 75.0,
                    "target_max": 92.0,
                    "in_range": False,
                    "available_days": 18,
                    "per_day_rate": 3.5,
                    "period_credit_target": 88.0,
                    "target_gap": -28.0,
                    "preassign_rest_days": 0,
                    "required_dayoff": 7,
                    "actual_dayoff": 10,
                    "dayoff_ok": False,
                },
            ]
        },
    }


def _input_sections() -> dict:
    """Synthetic ro_input sections in the live-server `##` snake_case format."""
    return {
        "scenario": [
            {
                "id": "101",
                "str_dt_loc": "2026-07-01T00:00:00Z",
                "end_dt_loc": "2026-07-31T00:00:00Z",
            }
        ],
        "crew": [
            {"crew_id": "C001", "first_name": "Jane", "middle_name": "", "last_name": "Doe", "seniority_num": "3", "division": "P"},
            {"crew_id": "C002", "first_name": "John", "middle_name": "A", "last_name": "Smith", "seniority_num": "7", "division": "P"},
        ],
        "pairing": [
            {
                "id": "P1",
                "pairing_label": "P100",
                "base": "YVR",
                "sch_str_dt_utc": "2026-07-05T00:00:00Z",
                "sch_end_dt_utc": "2026-07-07T00:00:00Z",
                "assignment_group": "FLY",
                "assignment": "FLY",
                "interface_id": "IF-P1",
            },
            {
                "id": "P2",
                "pairing_label": "P200",
                "base": "YVR",
                "sch_str_dt_utc": "2026-07-10T00:00:00Z",
                "sch_end_dt_utc": "2026-07-12T00:00:00Z",
                "assignment_group": "FLY",
                "assignment": "FLY",
                "interface_id": "IF-P2",
            },
            {
                "id": "P3",
                "pairing_label": "R300",
                "base": "YVR",
                "sch_str_dt_utc": "2026-07-15T00:00:00Z",
                "sch_end_dt_utc": "2026-07-16T00:00:00Z",
                "assignment_group": "SBY",
                "assignment": "PRAM",
                "interface_id": "IF-P3",
            },
        ],
        "pairing_segment": [
            {
                "pairing_id": "P1",
                "duty_seq": 1,
                "duty_act_str_dt_utc": "2026-07-05T00:00:00Z",
                "duty_sch_str_dt_utc": "2026-07-05T00:00:00Z",
                "duty_act_credited_minutes": 1200.0,
                "duty_sch_credited_minutes": 1200.0,
            },
            {
                "pairing_id": "P2",
                "duty_seq": 1,
                "duty_act_str_dt_utc": "2026-07-10T00:00:00Z",
                "duty_sch_str_dt_utc": "2026-07-10T00:00:00Z",
                "duty_act_credited_minutes": 480.0,
                "duty_sch_credited_minutes": 480.0,
            },
            {
                "pairing_id": "P3",
                "duty_seq": 1,
                "duty_act_str_dt_utc": "2026-07-15T00:00:00Z",
                "duty_sch_str_dt_utc": "2026-07-15T00:00:00Z",
                "duty_act_credited_minutes": "",
                "duty_sch_credited_minutes": "",
            },
        ],
        "roster_flight": [
            {
                "id": "9001",
                "crew_id": "C001",
                "pairing_id": "",
                "assignment": "VAC",
                "sch_str_dt_utc": "2026-07-20T00:00:00Z",
                "sch_end_dt_utc": "2026-07-21T00:00:00Z",
                "act_credited_minutes": 240.0,
                "sch_credited_minutes": 240.0,
            }
        ],
    }


class TestBuildReportSections:
    def test_credit_hour_report_keys(self):
        report = build_report_sections(_result_json(), _input_sections())
        rows = report["general_kpi"]["credit_hour_report"]
        assert len(rows) == 2
        assert list(rows[0].keys()) == CREDIT_HOUR_KEYS
        assert rows[0]["crew_id"] == "C001"
        assert rows[0]["base"] == "YVR"
        assert rows[0]["rank"] == "CA"
        assert rows[0]["credited_hours"] == 83.75
        assert rows[0]["pre_assigned_types"] == "VAC ×1"
        assert rows[0]["in_range"] is True
        assert rows[0]["dayoff_ok"] is True

    def test_pairing_complement_rows(self):
        report = build_report_sections(_result_json(), _input_sections())
        rows = report["scheduling_details"]["pairing_complement"]
        assert len(rows) == 3
        for row in rows:
            assert set(row.keys()) == set(PAIRING_COMPLEMENT_KEYS)
        by_task = {r["task_id"]: r for r in rows}
        # assigned task -> assigned status with crew name
        assert by_task["t1_CA"]["coverage_status"] == "assigned"
        assert by_task["t1_CA"]["assigned_crew"] == "Jane Doe"
        assert by_task["t1_CA"]["is_fixed"] is True
        assert by_task["t1_CA"]["credit"] == 20.0
        assert by_task["t1_CA"]["original_pairing_id"] == "P1"
        assert by_task["t1_CA"]["interface_id"] == "IF-P1"
        assert by_task["t1_CA"]["name"] == "P100"
        assert by_task["t1_CA"]["assignment"] == "FLY"
        assert by_task["t1_CA"]["base"] == "YVR"
        assert by_task["t1_CA"]["coverage_type"] == "Pairing"
        # unassigned tasks
        assert by_task["t2_CA"]["coverage_status"] == "unassigned"
        assert by_task["t2_CA"]["coverage_type"] == "Pairing"
        assert by_task["t2_CA"]["credit"] == 8.0
        assert by_task["r1_CA"]["coverage_status"] == "unassigned"
        assert by_task["r1_CA"]["coverage_type"] == "Reserve"
        assert by_task["r1_CA"]["credit"] == 4.0  # blank duty credit -> 4h reserve guarantee

    def test_lost_pairings_and_reserves(self):
        report = build_report_sections(_result_json(), _input_sections())
        lost_pairings = report["scheduling_details"]["lost_pairings"]
        lost_reserves = report["scheduling_details"]["lost_reserves"]
        assert [r["task_id"] for r in lost_pairings] == ["t2_CA"]
        assert [r["task_id"] for r in lost_reserves] == ["r1_CA"]

    def test_unassigned_summary_counts(self):
        report = build_report_sections(_result_json(), _input_sections())
        summary = report["scheduling_details"]["unassigned_summary"]
        assert summary == [
            {
                "month": "2026-07",
                "assigned_pairing_slots": 1,
                "unassigned_pairing_slots": 1,
                "unassigned_pairing_credit_hours": 8.0,
                "assigned_reserve_slots": 0,
                "unassigned_reserve_slots": 1,
                "unassigned_reserve_credit_hours": 4.0,
            }
        ]

    def test_pre_assignment_detail_includes_crew_with_hours(self):
        report = build_report_sections(_result_json(), _input_sections())
        detail = report["scheduling_details"]["pre_assignment_detail"]
        by_crew = {r["crew_id"]: r for r in detail}
        assert "C001" in by_crew
        assert by_crew["C001"]["pre_assigned_hours"] == 4.0
        assert by_crew["C001"]["month"] == "2026-07"

    def test_primary_month(self):
        report = build_report_sections(_result_json(), _input_sections())
        assert report["primary_month"] == "2026-07"

    def test_defensive_empty_input(self):
        report = build_report_sections({}, {})
        assert report["general_kpi"]["credit_hour_report"] == []
        assert report["scheduling_details"]["pairing_complement"] == []
        assert report["scheduling_details"]["unassigned_summary"] == []
        assert report["scheduling_details"]["lost_pairings"] == []
        assert report["scheduling_details"]["lost_reserves"] == []
        assert report["scheduling_details"]["pre_assignment_detail"] == []
        assert report["primary_month"] == ""

    def test_defensive_missing_sections(self):
        # crew_info present but no ro_input sections at all
        result = _result_json()
        report = build_report_sections(result, {})
        # crews still resolve (name falls back to crew_id), no pairings known;
        # assignment still comes from result_json so t1_CA stays assigned
        complement = report["scheduling_details"]["pairing_complement"]
        assert len(complement) == 3
        by_task = {r["task_id"]: r for r in complement}
        assert by_task["t1_CA"]["coverage_status"] == "assigned"
        assert by_task["t2_CA"]["coverage_status"] == "unassigned"
        assert by_task["r1_CA"]["coverage_status"] == "unassigned"
        # credit_hour_report still surfaces the solver rows
        assert len(report["general_kpi"]["credit_hour_report"]) == 2
        assert report["primary_month"] == "2026-07"


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
