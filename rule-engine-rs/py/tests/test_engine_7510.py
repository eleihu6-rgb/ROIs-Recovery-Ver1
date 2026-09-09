"""Rule 7510 Green-on-Green incremental complement gate."""

import rois_rule_engine_rs as rre

HOUR = 3600
PAIRING_START = 1_785_600_000  # 2026-08-01 00:00:00 UTC


def _segment(
    pairing_idx: int,
    flight_id: int,
    segment_id: int,
    start_utc: int = PAIRING_START,
) -> dict[str, str]:
    return {
        "pairing_idx": str(pairing_idx),
        "segment_id": str(segment_id),
        "duty_seq": "1",
        "seg_seq": "1",
        "flight_id": str(flight_id),
        "flight_number": "F7510",
        "flight_date": "2026-08-01",
        "start_utc": str(start_utc),
        "end_utc": str(start_utc + HOUR),
        "fleet": "737",
        "dep": "YYZ",
        "arr": "YVR",
        "assignment": "FLT",
        "assignment_group": "FLY",
        "composition": "*",
        "attributes": "GREEN",
        "destination_country": "CA",
        "planned_by_rank": "",
        "filled_by_rank": "",
    }


def _engine(
    *,
    enabled: list[str] | None = None,
    assignments: str = "FLT",
    assignment_groups: str = "FLY",
    second_start: int = PAIRING_START,
    second_flight_id: int = 7510,
    crew_team_quals: list[list[tuple[str, int, int]]] | None = None,
    cof_flight_crew: list[tuple[int, int]] | None = None,
    cof_flight_7510_rows: list[dict[str, str]] | None = None,
    pairing_8072_segments: list[dict[str, str]] | None = None,
):
    return rre.Engine(
        pairing_start_utc=[PAIRING_START, PAIRING_START],
        pairing_end_utc=[PAIRING_START + HOUR, second_start + HOUR],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[], []],
        crew_ids=["C1", "C2"],
        crew_base_quals=[[("YYZ", 0, 999999)], [("YYZ", 0, 999999)]],
        crew_rank_quals=[[("CA", 0, 999999)], [("CA", 0, 999999)]],
        crew_fleet_quals=[[("737", 0, 999999)], [("737", 0, 999999)]],
        crew_teams=[["TEAM1"], ["TEAM1"]],
        crew_team_quals=(
            crew_team_quals
            if crew_team_quals is not None
            else [
                [("TEAM1", PAIRING_START, PAIRING_START + HOUR)],
                [("TEAM1", PAIRING_START, -1)],
            ]
        ),
        cof_flight_crew=cof_flight_crew or [],
        cof_flight_7510_rows=cof_flight_7510_rows or [],
        pairing_assignment=["FLT", "FLT"],
        pairing_assignment_group=["FLY", "FLY"],
        pairing_attributes=["GREEN", "GREEN"],
        pairing_8072_segments=(
            pairing_8072_segments
            if pairing_8072_segments is not None
            else [
                _segment(0, 7510, 1),
                _segment(1, second_flight_id, 2, second_start),
            ]
        ),
        rule7510_rows=[{
            "Bases": "YYZ",
            "Ranks": "CA",
            "Fleets": "737",
            "Crew Teams": "TEAM1",
            "Attributes": "GREEN",
            "Assignments": assignments,
            "Assignment Groups": assignment_groups,
            "Initial Sectors": "8",
            "Min Limits": "0",
            "Max Limits": "1",
        }],
        scenario_window=(PAIRING_START, PAIRING_START + 31 * 86_400),
        enabled_functions=enabled or ["7510"],
    )


def test_7510_complement_does_not_count_unmarked_res_on_candidate_marked_flight():
    res_rows = [
        {
            "crew_idx": "1",
            "crew_id": "C2",
            "flight_id": "7510",
            "pairing_id": "9002",
            "duty_seq": "1",
            "seg_seq": "1",
            "start_utc": str(PAIRING_START),
            "end_utc": str(PAIRING_START + HOUR),
            "attributes": "GREEN",
            "assignment": "RES",
            "assignment_group": "RES",
        },
    ]
    eng = _engine(
        assignments="*",
        assignment_groups="FLY|RES",
        cof_flight_7510_rows=res_rows,
    )

    assert eng.can_add_pairing_7510(0, 0) == []

    fly_only = _engine(assignments="*", cof_flight_7510_rows=res_rows)
    assert fly_only.can_add_pairing_7510(0, 0) == []


def test_7510_rejects_second_green_crew_on_same_physical_flight():
    eng = _engine()
    assert eng.can_add_pairing_7510(0, 0) == []
    eng.commit_pairing_7510(0, 0)

    out = eng.can_add_pairing_7510(1, 1)

    assert out == ["7510|row=0|flight=7510|crew=C2|count=2|min=0|max=1|over=true"]


def test_7510_rollback_removes_committed_member():
    eng = _engine()
    eng.commit_pairing_7510(0, 0)
    assert eng.can_add_pairing_7510(1, 1)
    eng.rollback_pairing_7510(0, 0)
    assert eng.can_add_pairing_7510(1, 1) == []


def test_7510_can_be_disabled_by_rule_gate():
    eng = _engine(enabled=["8072"])
    assert eng.can_add_pairing_7510(0, 0) == []


def test_7510_batch_checks_all_candidate_lines_together():
    eng = _engine()

    out = eng.check_all_7510([(0, [0]), (1, [1])])

    assert out == [
        "7510|row=0|flight=7510|crew=C1|count=2|min=0|max=1|over=true",
        "7510|row=0|flight=7510|crew=C2|count=2|min=0|max=1|over=true",
    ]


def test_7510_uses_team_effective_window_for_each_physical_flight():
    second_start = PAIRING_START + 2 * HOUR
    eng = _engine(second_start=second_start, second_flight_id=7511)

    out = eng.check_all_7510([(0, [0, 1]), (1, [1])])

    assert out == []


def test_7510_cof_seed_uses_inline_crew_team_fallback():
    eng = _engine(
        second_flight_id=7510,
        crew_team_quals=[],
        cof_flight_crew=[(7510, 0), (7510, 1)],
    )

    out = eng.check_all_7510([(0, []), (1, [])])

    assert out == [
        "7510|row=0|flight=7510|crew=C1|count=2|min=0|max=1|over=true",
        "7510|row=0|flight=7510|crew=C2|count=2|min=0|max=1|over=true",
    ]


def test_7510_keeps_cof_seed_when_pairing_has_no_dense_segment():
    rows = [
        {
            "crew_idx": "0",
            "crew_id": "C1",
            "flight_id": "7510",
            "pairing_id": "9001",
            "duty_seq": "1",
            "seg_seq": "1",
            "start_utc": str(PAIRING_START),
            "end_utc": str(PAIRING_START + HOUR),
            "attributes": "GREEN",
            "assignment": "FLT",
            "assignment_group": "FLY",
        },
        {
            "crew_idx": "1",
            "crew_id": "C2",
            "flight_id": "7510",
            "pairing_id": "9002",
            "duty_seq": "1",
            "seg_seq": "1",
            "start_utc": str(PAIRING_START),
            "end_utc": str(PAIRING_START + HOUR),
            "attributes": "GREEN",
            "assignment": "FLT",
            "assignment_group": "FLY",
        },
    ]
    eng = _engine(
        second_flight_id=7511,
        pairing_8072_segments=[],
        cof_flight_7510_rows=rows,
    )

    out = eng.check_all_7510([(0, []), (1, [])])

    assert out == [
        "7510|row=0|flight=7510|crew=C1|count=2|min=0|max=1|over=true",
        "7510|row=0|flight=7510|crew=C2|count=2|min=0|max=1|over=true",
    ]
