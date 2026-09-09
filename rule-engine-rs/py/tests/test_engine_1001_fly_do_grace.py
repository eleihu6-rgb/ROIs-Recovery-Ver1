"""Rule 1001 FLY→DO respects rule 2015 DO Start (PyO3 check_overlap path)."""
import rois_rule_engine_rs as rre

YEG = -360


def _utc(s: str) -> int:
    from datetime import datetime, timezone

    return int(datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp())


def _fly_do_engine(*, fly_end: str, do_start_min: int, rest_before: bool):
    fly_start = _utc("2026-06-01 20:00:00")
    fly_end_s = _utc(fly_end)
    fly_rest = _utc("2026-06-02 15:59:00")
    do_start_s = _utc("2026-06-02 06:00:00")
    do_end = _utc("2026-06-02 23:00:00")
    rre.set_next_engine_extras(
        do_start_min=do_start_min or None,
        do_start_assignments="DO",
        do_start_groups="DO",
    )
    return rre.Engine(
        pairing_start_utc=[fly_start],
        pairing_end_utc=[fly_end_s],
        pairing_end_including_rest_utc=[fly_rest],
        pairing_blk_min=[0],
        pairing_is_fly=[True],
        pairing_assignment_group=["FLY"],
        crew_fixed_pairings=[[]],
        crew_ground_start=[[do_start_s]],
        crew_ground_end=[[do_end]],
        crew_ground_assignment=[["DO"]],
        crew_ground_group=[["DO"]],
        crew_ground_is_rest=[[True]],
        crew_offset_min=[YEG],
        overlap_rules=[(
            ["FLY"], ["*"], rest_before, ["*"],
            ["DO"], ["*"], ["*"],
        )],
        enabled_functions=["1001"],
        application="editor",
    )


def test_fly_do_2015_grace_0059_no_1001():
    e = _fly_do_engine(
        fly_end="2026-06-02 06:59:00",
        do_start_min=60,
        rest_before=True,
    )
    assert e.check_line(0, [0]) == []


def test_fly_do_2015_grace_0100_still_1001():
    e = _fly_do_engine(
        fly_end="2026-06-02 07:00:00",
        do_start_min=60,
        rest_before=True,
    )
    v = e.check_line(0, [0])
    assert len(v) == 1
    assert v[0].startswith("1001|")


def test_fly_do_missing_2015_unchanged():
    e = _fly_do_engine(
        fly_end="2026-06-02 06:59:00",
        do_start_min=0,
        rest_before=True,
    )
    v = e.check_line(0, [0])
    assert len(v) == 1
    assert v[0].startswith("1001|")


def test_fly_do_2015_grace_via_engine_ctor_without_extras():
    fly_start = _utc("2026-06-01 20:00:00")
    fly_end_s = _utc("2026-06-02 06:59:00")
    fly_rest = _utc("2026-06-02 15:59:00")
    do_start_s = _utc("2026-06-02 06:00:00")
    do_end = _utc("2026-06-02 23:00:00")
    e = rre.Engine(
        pairing_start_utc=[fly_start],
        pairing_end_utc=[fly_end_s],
        pairing_end_including_rest_utc=[fly_rest],
        pairing_blk_min=[0],
        pairing_is_fly=[True],
        pairing_assignment_group=["FLY"],
        crew_fixed_pairings=[[]],
        crew_ground_start=[[do_start_s]],
        crew_ground_end=[[do_end]],
        crew_ground_assignment=[["DO"]],
        crew_ground_group=[["GRD"]],
        crew_ground_is_rest=[[True]],
        crew_offset_min=[YEG],
        overlap_rules=[(
            ["FLY"], ["*"], True, ["*"],
            ["DO"], ["*"], ["*"],
        )],
        enabled_functions=["1001"],
        application="editor",
        do_start_min=60,
        do_start_assignments="DO",
        do_start_groups="DO",
    )
    assert e.check_line(0, [0]) == []


def test_empty_extras_do_not_clobber_engine_ctor_2015_filters():
    fly_start = _utc("2026-06-01 20:00:00")
    fly_end_s = _utc("2026-06-02 06:59:00")
    fly_rest = _utc("2026-06-02 15:59:00")
    do_start_s = _utc("2026-06-02 06:00:00")
    do_end = _utc("2026-06-02 23:00:00")
    rre.set_next_engine_extras()
    e = rre.Engine(
        pairing_start_utc=[fly_start],
        pairing_end_utc=[fly_end_s],
        pairing_end_including_rest_utc=[fly_rest],
        pairing_blk_min=[0],
        pairing_is_fly=[True],
        pairing_assignment_group=["FLY"],
        crew_fixed_pairings=[[]],
        crew_ground_start=[[do_start_s]],
        crew_ground_end=[[do_end]],
        crew_ground_assignment=[["DO"]],
        crew_ground_group=[["GRD"]],
        crew_ground_is_rest=[[True]],
        crew_offset_min=[YEG],
        overlap_rules=[(
            ["FLY"], ["*"], True, ["*"],
            ["DO"], ["*"], ["*"],
        )],
        enabled_functions=["1001"],
        application="editor",
        do_start_min=60,
        do_start_assignments="DO",
        do_start_groups="DO",
    )
    assert e.check_line(0, [0]) == []
