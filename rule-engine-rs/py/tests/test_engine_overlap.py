"""Function 1001 Assignment Overlap runs first in check_line."""

import rois_rule_engine_rs as rre

YEG_MDT_OFFSET_MIN = -360

# Rest Before=Y → Before end = duty_end; filter match without duty∩After → Allow (prohibition model).
DEFAULT_1001_RULES = [
    (["FLY"], ["*"], True, ["*"], ["*"], ["*"], ["L", "O"]),
    (["SBY"], ["*"], True, ["*"], ["*"], ["*"], ["L", "O"]),
    (["FLY"], ["*"], True, ["*"], ["DO"], ["*"], ["*"]),
    (["SBY"], ["*"], True, ["*"], ["DO"], ["*"], ["*"]),
]


def _yeg_local(iso_local: str) -> int:
    # Timestamps parsed as UTC then shifted by base offset (minutes east of UTC).
    y, m, d = int(iso_local[0:4]), int(iso_local[5:7]), int(iso_local[8:10])
    hh, mm, ss = int(iso_local[11:13]), int(iso_local[14:16]), int(iso_local[17:19])
    from datetime import datetime, timezone

    dt = datetime(y, m, d, hh, mm, ss, tzinfo=timezone.utc)
    return int(dt.timestamp()) - YEG_MDT_OFFSET_MIN * 60


def test_fixed_fly_overlaps_candidate_rest_via_engine():
    # Candidate Jun 9 duty rest crosses into fixed FLY Jun 10 00:30–06:00.
    fly_start = _yeg_local("2026-06-10T00:30:00")
    fly_duty_end = _yeg_local("2026-06-10T06:00:00")
    fly_rest_end = _yeg_local("2026-06-10T19:00:00")
    cand_start = _yeg_local("2026-06-09T08:30:00")
    cand_duty_end = _yeg_local("2026-06-09T12:00:00")
    cand_rest_end = _yeg_local("2026-06-10T01:00:00")

    eng = rre.Engine(
        pairing_start_utc=[fly_start, cand_start],
        pairing_end_utc=[fly_duty_end, cand_duty_end],
        pairing_end_including_rest_utc=[fly_rest_end, cand_rest_end],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_label=["FLY-FIXED", "CAND"],
        pairing_assignment_group=["FLY", "FLY"],
        block_bands=[],
    )
    out = eng.check_line(0, [1])
    assert len(out) >= 1
    assert out[0].startswith("1001|")
    assert "before=1" in out[0]
    assert "after=0" in out[0]


def test_do_on_june10_tolerates_candidate_rest_crossing():
    do_start = _yeg_local("2026-06-10T00:00:00")
    do_end = _yeg_local("2026-06-11T00:00:00")
    cand_start = _yeg_local("2026-06-09T08:30:00")
    cand_duty_end = _yeg_local("2026-06-09T12:00:00")
    cand_rest_end = _yeg_local("2026-06-10T01:00:00")

    eng = rre.Engine(
        pairing_start_utc=[cand_start],
        pairing_end_utc=[cand_duty_end],
        pairing_end_including_rest_utc=[cand_rest_end],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[]],
        pairing_is_fly=[True],
        pairing_label=["CAND"],
        pairing_assignment_group=["FLY"],
        crew_ground_start=[[do_start]],
        crew_ground_end=[[do_end]],
        crew_ground_assignment=[["DO"]],
        crew_ground_group=[["DO"]],
        crew_ground_type=[["O"]],
        overlap_rules=DEFAULT_1001_RULES,
        block_bands=[],
    )
    overlap_only = [o for o in eng.check_line(0, [0]) if o.startswith("1001|")]
    assert overlap_only == []


def test_fixed_res_overlaps_candidate_rest_via_engine():
    res_start = _yeg_local("2026-06-10T00:30:00")
    res_duty_end = _yeg_local("2026-06-10T06:00:00")
    res_rest_end = _yeg_local("2026-06-10T19:00:00")
    cand_start = _yeg_local("2026-06-09T08:30:00")
    cand_duty_end = _yeg_local("2026-06-09T12:00:00")
    cand_rest_end = _yeg_local("2026-06-10T01:00:00")

    eng = rre.Engine(
        pairing_start_utc=[res_start, cand_start],
        pairing_end_utc=[res_duty_end, cand_duty_end],
        pairing_end_including_rest_utc=[res_rest_end, cand_rest_end],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[False, True],
        pairing_label=["RES-FIXED", "CAND"],
        pairing_assignment_group=["RES", "FLY"],
        block_bands=[],
    )
    out = eng.check_line(0, [1])
    overlap = [o for o in out if o.startswith("1001|")]
    assert len(overlap) == 1
    assert "before=1" in overlap[0]
    assert "after=0" in overlap[0]


def test_empty_overlap_rules_fail_closed():
    eng = rre.Engine(
        pairing_start_utc=[0, 5],
        pairing_end_utc=[10, 20],
        pairing_end_including_rest_utc=[10, 20],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_assignment_group=["FLY", "FLY"],
        block_bands=[],
        overlap_rules=[],
    )
    out = eng.check_line(0, [1])
    assert any(o.startswith("1001|") for o in out), out


def test_enabled_functions_can_disable_1001_overlap_gate():
    eng = rre.Engine(
        pairing_start_utc=[0, 5],
        pairing_end_utc=[10, 20],
        pairing_end_including_rest_utc=[10, 20],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_assignment_group=["FLY", "FLY"],
        block_bands=[],
        overlap_rules=[],
        enabled_functions=["8056"],
    )

    assert [o for o in eng.check_line(0, [1]) if o.startswith("1001|")] == []


def test_pairing_assignment_type_uses_assignment_type_not_group():
    # Rule permits a FLY work/rest overlap only when the later assignment.type is L.
    # The second pairing's group is still FLY, so this verifies the connector uses
    # assignment.type from the solver store instead of deriving "FLY" from group.
    # Rest Before=Y so duty window does not cover rest-into-L → Allow under prohibition model.
    rules = [(["FLY"], ["*"], True, ["*"], ["FLY"], ["*"], ["L"])]
    first_start = _yeg_local("2026-06-09T08:00:00")
    first_duty_end = _yeg_local("2026-06-09T12:00:00")
    first_rest_end = _yeg_local("2026-06-10T01:00:00")
    second_start = _yeg_local("2026-06-10T00:00:00")
    second_end = _yeg_local("2026-06-10T08:00:00")

    common = dict(
        pairing_start_utc=[first_start, second_start],
        pairing_end_utc=[first_duty_end, second_end],
        pairing_end_including_rest_utc=[first_rest_end, second_end],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_assignment_group=["FLY", "FLY"],
        overlap_rules=rules,
        block_bands=[],
    )

    with_type = rre.Engine(**common, pairing_assignment_type=["W", "L"])
    assert [o for o in with_type.check_line(0, [1]) if o.startswith("1001|")] == []

    without_type = rre.Engine(**common)
    assert any(o.startswith("1001|") for o in without_type.check_line(0, [1]))


def test_n_rules_counts_overlap_gate():
    eng = rre.Engine(
        pairing_start_utc=[0],
        pairing_end_utc=[3600],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[]],
        spacing_hours=10.0,
        block_bands=[(28, 600.0)],
    )
    assert eng.n_rules == 3
