"""Rule 7506 ONE CHECKIN PER DAY: <=1 checked assignment per crew-local day."""

import pytest
import rois_rule_engine_rs as rre

DAY = 86_400
H = 3600


def _eng(spans, is_fly, crew_fixed, offset=0):
    return rre.Engine(
        pairing_start_utc=[s for s, _ in spans],
        pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60] * len(spans),
        crew_fixed_pairings=crew_fixed,
        pairing_is_fly=is_fly,
        crew_offset_min=[offset],
        one_checkin_groups=["FLY"],
    )


def test_two_fly_same_local_day_fires():
    # fixed FLY checks in day0 08:00; candidate FLY checks in day0 18:00 → same day.
    eng = _eng([(8 * H, 12 * H), (18 * H, 22 * H)], [True, True], crew_fixed=[[0]])
    out = [o for o in eng.check_line(0, [1]) if o.startswith("7506")]
    assert len(out) == 1


def test_fly_different_days_passes():
    eng = _eng([(8 * H, 12 * H), (1 * DAY + 8 * H, 1 * DAY + 12 * H)], [True, True], crew_fixed=[[0]])
    assert [o for o in eng.check_line(0, [1]) if o.startswith("7506")] == []


def test_non_fly_second_roster_ignored():
    # candidate is ground (not FLY) → not a checked roster → no breach.
    eng = _eng([(8 * H, 12 * H), (18 * H, 22 * H)], [True, False], crew_fixed=[[0]])
    assert [o for o in eng.check_line(0, [1]) if o.startswith("7506")] == []


def _structured_7506(
    *,
    bases=("*",),
    ranks=("*",),
    fleets=("*",),
    teams=("*",),
    assignments=("FLY",),
):
    return [(
        (list(bases), list(ranks), list(fleets), list(teams)),
        list(assignments),
    )]


def test_7506_structured_rows_take_precedence_over_scalar_values():
    eng = rre.Engine(
        pairing_start_utc=[8 * H, 18 * H],
        pairing_end_utc=[12 * H, 22 * H],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, False],
        pairing_assignment_group=["FLY", "GND"],
        pairing_assignment=["FLY", "SIM"],
        crew_offset_min=[0],
        one_checkin_groups=["FLY"],
        one_checkin_rules=_structured_7506(assignments=("SIM",)),
    )

    out = [o for o in eng.check_line(0, [1]) if o.startswith("7506")]
    assert len(out) == 1
    assert "groups=SIM" in out[0]


def test_7506_structured_scope_matches_qualifications_and_team():
    common = dict(
        pairing_start_utc=[8 * H, 18 * H],
        pairing_end_utc=[12 * H, 22 * H],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, False],
        pairing_assignment_group=["FLY", "GND"],
        pairing_assignment=["FLY", "SIM"],
        crew_offset_min=[0],
        one_checkin_rules=_structured_7506(
            bases=("YVR",),
            ranks=("CA",),
            fleets=("737",),
            teams=("TEAM-A",),
            assignments=("FLY", "SIM"),
        ),
        crew_base_quals=[[("YVR", 0, 10)]],
        crew_rank_quals=[[("CA", 0, 10)]],
        crew_fleet_quals=[[("737", 0, 10)]],
        crew_teams=[["team-a"]],
    )

    matching = rre.Engine(**common)
    assert [o for o in matching.check_line(0, [1]) if o.startswith("7506")]

    nonmatching_kwargs = {**common, "crew_teams": [["TEAM-B"]]}
    nonmatching = rre.Engine(**nonmatching_kwargs)
    assert [o for o in nonmatching.check_line(0, [1]) if o.startswith("7506")] == []


def test_7506_structured_team_scope_requires_crew_context():
    eng = rre.Engine(
        pairing_start_utc=[8 * H, 18 * H],
        pairing_end_utc=[12 * H, 22 * H],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, False],
        pairing_assignment_group=["FLY", "GND"],
        pairing_assignment=["FLY", "SIM"],
        crew_offset_min=[0],
        one_checkin_rules=_structured_7506(
            teams=("TEAM-A",),
            assignments=("FLY", "SIM"),
        ),
    )

    with pytest.raises(ValueError, match="7506 row specifies Crew Teams"):
        eng.check_line(0, [1])


def test_7506_sim_ground_and_fly_candidate_same_local_day_fires():
    """Anchor: PA SIM + new FLY same local day under Assignments=FLY|SIM.

    Mirrors Live check-7506 feeder (ground duty = assignment code) and
    ro_check crew 1010 / pairing 18871 shape (SIM morning, FLY evening).
    """
    # SIM 08:00–14:00; FLY candidate 18:00–22:00; offset 0 → same UTC calendar day.
    eng = rre.Engine(
        pairing_start_utc=[18 * H],
        pairing_end_utc=[22 * H],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[]],
        pairing_is_fly=[True],
        pairing_assignment_group=["FLY"],
        pairing_assignment=["FLY"],
        crew_offset_min=[0],
        one_checkin_groups=["FLY", "SIM"],
        one_checkin_rules=_structured_7506(assignments=("FLY", "SIM")),
        crew_ground_start=[[8 * H]],
        crew_ground_end=[[14 * H]],
        crew_ground_assignment=[["SIM"]],
        crew_ground_group=[["GRD"]],
    )
    out = [o for o in eng.check_line(0, [0]) if o.startswith("7506")]
    assert len(out) == 1, f"expected 7506 from SIM+FLY, got {out}"
    assert "groups=FLY|SIM" in out[0] or "FLY|SIM" in out[0]


def test_7506_fly_only_without_ground_does_not_fire():
    """Control: same FLY candidate, no ground → no 7506."""
    eng = rre.Engine(
        pairing_start_utc=[18 * H],
        pairing_end_utc=[22 * H],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[]],
        pairing_is_fly=[True],
        pairing_assignment_group=["FLY"],
        pairing_assignment=["FLY"],
        crew_offset_min=[0],
        one_checkin_groups=["FLY", "SIM"],
        one_checkin_rules=_structured_7506(assignments=("FLY", "SIM")),
        crew_ground_start=[[]],
        crew_ground_end=[[]],
        crew_ground_assignment=[[]],
        crew_ground_group=[[]],
    )
    assert [o for o in eng.check_line(0, [0]) if o.startswith("7506")] == []
