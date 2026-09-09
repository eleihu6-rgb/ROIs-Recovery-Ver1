"""Phase 2: rule 8056 ROSTER SPACING enforced in check_line.

Gap between consecutive FLY duties must be >= spacing_hours. Optimizer PA-ignore:
a tight gap between two fixed (pre-assigned) duties is tolerated; a tight gap
involving the candidate fires. Non-FLY pairings are ignored.
"""

import rois_rule_engine_rs as rre

HOUR = 3600


def _eng(spans, is_fly, crew_fixed, spacing_hours=10.0):
    # spans: list of (start_sec, end_sec)
    starts = [s for s, _ in spans]
    ends = [e for _, e in spans]
    return rre.Engine(
        pairing_start_utc=starts,
        pairing_end_utc=ends,
        pairing_blk_min=[60] * len(spans),
        crew_fixed_pairings=crew_fixed,
        pairing_is_fly=is_fly,
        pairing_label=[f"P{i}" for i in range(len(spans))],
        spacing_hours=spacing_hours,
        block_bands=[],  # isolate 8056
    )


def test_tight_gap_with_candidate_violates():
    # fixed P0 ends at 10h; candidate P1 starts at 15h → gap 5h < 10h limit.
    eng = _eng([(0, 10 * HOUR), (15 * HOUR, 20 * HOUR)], [True, True], crew_fixed=[[0]])
    out = eng.check_line(0, [1])
    assert len(out) == 1
    assert out[0].startswith("8056|")
    assert "gap_min=300" in out[0]   # 5h = 300 min
    assert "limit_min=600" in out[0]  # 10h = 600 min


def test_adequate_gap_passes():
    # gap 12h >= 10h.
    eng = _eng([(0, 10 * HOUR), (22 * HOUR, 30 * HOUR)], [True, True], crew_fixed=[[0]])
    assert eng.check_line(0, [1]) == []


def test_fixed_pair_tight_gap_tolerated():
    # both duties fixed; empty candidate → tight gap is pre-existing, tolerated.
    eng = _eng([(0, 10 * HOUR), (15 * HOUR, 20 * HOUR)], [True, True], crew_fixed=[[0, 1]])
    assert eng.check_line(0, []) == []


def test_non_fly_candidate_ignored():
    # candidate P1 is NOT FLY → excluded from spacing scan, no violation.
    eng = _eng([(0, 10 * HOUR), (15 * HOUR, 20 * HOUR)], [True, False], crew_fixed=[[0]])
    assert eng.check_line(0, [1]) == []


def test_exact_limit_is_legal():
    # gap exactly 10h; violation is strict "<".
    eng = _eng([(0, 10 * HOUR), (20 * HOUR, 30 * HOUR)], [True, True], crew_fixed=[[0]])
    assert eng.check_line(0, [1]) == []


def test_both_rules_count():
    eng = rre.Engine(
        pairing_start_utc=[0],
        pairing_end_utc=[HOUR],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[]],
        block_bands=[(28, 600.0)],
        pairing_is_fly=[True],
        pairing_label=["P0"],
        spacing_hours=10.0,
    )
    assert eng.n_rules == 3
    assert repr(eng) == "Engine(phase=2, app=optimizer, pairings=1, crews=1, rules=3)"


def test_structured_8056_row_uses_all_context_fields():
    eng = rre.Engine(
        pairing_start_utc=[0, 10 * HOUR],
        pairing_end_utc=[4 * HOUR, 12 * HOUR],
        pairing_end_including_rest_utc=[5 * HOUR, 13 * HOUR],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[]],
        pairing_is_fly=[True, True],
        pairing_label=["A", "B"],
        pairing_assignment_group=["FLY", "FLY"],
        pairing_assignment=["FLT", "FLT"],
        pairing_attributes=["WOCL", "REST"],
        pairing_qualifier=["FLT", "FLT"],
        pairing_airport=["YYZ", "YYZ"],
        pairing_role=["CA", "CA"],
        pairing_is_requested=[True, False],
        pairing_location=["YYZ", "YVR"],
        crew_base_quals=[[("YYZ", 0, 999999)]],
        crew_rank_quals=[[("CA", 0, 999999)]],
        crew_fleet_quals=[[("320", 0, 999999)]],
        crew_teams=[["TEAM1"]],
        block_bands=[],
        spacing_hours=None,
        spacing_rule_rows=[
            {
                "Bases": "YYZ",
                "Ranks": "CA",
                "Fleets": "320",
                "Crew Teams": "TEAM1",
                "Attribute A": "WOCL",
                "Label A": "A",
                "Assignment Group A": "FLY",
                "Qualifier A": "FLT",
                "Airport A": "YYZ",
                "Roles A": "CA",
                "Is Requested A": "Y",
                "Attribute B": "REST",
                "Label B": "B",
                "Assignment Group B": "FLY",
                "Qualifier B": "FLT",
                "Airport B": "YYZ",
                "Roles B": "CA",
                "Is Requested B": "N",
                "Space": "13",
                "Unit": "RH",
                "Directional": "Y",
                "Is Location Equal Base A": "Y",
                "Is Location Equal Base B": "N",
                "Utilize Post Duty Rest": "N",
            }
        ],
        enabled_functions=["8056"],
    )

    out = eng.check_line(0, [0, 1])
    assert out == ["8056|pairing=0|pairing_after=1|gap_min=300|limit_min=780"]


def test_structured_8056_calendar_day_unit_uses_cd_not_hours():
    eng = rre.Engine(
        pairing_start_utc=[0, 34 * HOUR],
        pairing_end_utc=[4 * HOUR, 38 * HOUR],
        pairing_end_including_rest_utc=[4 * HOUR, 38 * HOUR],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[]],
        pairing_is_fly=[True, True],
        pairing_label=["A", "B"],
        pairing_assignment_group=["FLY", "FLY"],
        pairing_assignment=["FLT", "FLT"],
        crew_base_quals=[[("YYZ", 0, 999999)]],
        crew_rank_quals=[[("CA", 0, 999999)]],
        crew_fleet_quals=[[("320", 0, 999999)]],
        block_bands=[],
        spacing_hours=None,
        spacing_rule_rows=[
            {
                "Bases": "YYZ",
                "Ranks": "CA",
                "Fleets": "320",
                "Assignment Group A": "FLY",
                "Assignment Group B": "FLY",
                "Space": "3",
                "Unit": "CD",
                "Directional": "Y",
                "Utilize Post Duty Rest": "Y",
            }
        ],
        enabled_functions=["8056"],
    )

    out = eng.check_line(0, [0, 1])
    assert out == ["8056|pairing=0|pairing_after=1|gap_min=2|limit_min=3"]
