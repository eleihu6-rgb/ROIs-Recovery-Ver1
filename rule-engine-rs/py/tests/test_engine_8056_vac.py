"""Rule 8056 must stop the optimizer flying a crew during a pre-assigned VACATION.

The workset-103 8056 param has a row `Assignment A=FLY → Assignment B=VAC, 13 RH`
(and `FLY → FLY|SBY|SIM|GRD`). The solver never sees ground tasks unless we feed
them, and VAC is a ground task (pairing_id NULL). These tests drive the connector
Engine with a crew's pre-assigned VAC ground duties + the param spacing rows, and
assert a CANDIDATE flying pairing landing inside / too close to the VAC fires 8056.

Mirrors scenario 596 (C595-New-YVR-PIlot), where VAC is stored as per-day rows so a
FLY inside the block is always <13h from a VAC-day boundary.
"""

import rois_rule_engine_rs as rre

HOUR = 3600
DAY = 86400
# FLY → VAC, 13 rest-hours (the workset-103 8056 row). group wildcard, assignment-coded.
RULE_FLY_VAC = (["*"], ["*"], ["FLY"], ["VAC"], 13.0)


def _eng(pairings, is_fly, crew_fixed, ground, rules):
    """ground: list-per-crew of (start, end, assignment, group)."""
    return rre.Engine(
        pairing_start_utc=[s for s, _ in pairings],
        pairing_end_utc=[e for _, e in pairings],
        pairing_blk_min=[120] * len(pairings),
        crew_fixed_pairings=crew_fixed,
        pairing_is_fly=is_fly,
        pairing_label=[f"P{i}" for i in range(len(pairings))],
        block_bands=[],  # isolate 8056
        spacing_hours=None,  # use the grouped param rows, not plain consecutive-FLY
        crew_ground_start=[[g[0] for g in c] for c in ground],
        crew_ground_end=[[g[1] for g in c] for c in ground],
        crew_ground_assignment=[[g[2] for g in c] for c in ground],
        crew_ground_group=[[g[3] for g in c] for c in ground],
        spacing_rules=rules,
    )


def _vac_days(first_day, n):
    """n per-day VAC ground rows (07:00 UTC → next 07:00), as scenario 596 stores them."""
    return [
        ((first_day + d) * DAY + 7 * HOUR, (first_day + d + 1) * DAY + 7 * HOUR, "VAC", "GRD")
        for d in range(n)
    ]


def test_candidate_fly_inside_vacation_block_violates_8056():
    # Crew on VAC days 24..26 (per-day rows). Candidate FLY sits inside day 24.
    ground = [_vac_days(24, 3)]
    fly = (24 * DAY + 17 * HOUR, 25 * DAY + 5 * HOUR)  # inside the block; <13h to day-25 VAC
    eng = _eng([fly], [True], crew_fixed=[[]], ground=ground, rules=[RULE_FLY_VAC])
    out = eng.check_line(0, [0])
    assert any(o.startswith("8056|") for o in out), f"expected 8056 violation, got {out}"


def test_candidate_fly_clear_of_vacation_passes():
    # FLY ends day 22; nearest VAC starts day 24 07:00 → > 13h away → legal.
    ground = [_vac_days(24, 3)]
    fly = (22 * DAY, 22 * DAY + 5 * HOUR)
    eng = _eng([fly], [True], crew_fixed=[[]], ground=ground, rules=[RULE_FLY_VAC])
    assert eng.check_line(0, [0]) == []


def test_fixed_fly_overlapping_vac_tolerated():
    # A pre-existing (fixed) FLY overlapping VAC is a prior fact (optimizer PA-ignore):
    # with an empty candidate it must NOT fire (we only block NEW flying over leave).
    ground = [_vac_days(24, 3)]
    eng = _eng(
        [(24 * DAY + 17 * HOUR, 25 * DAY + 5 * HOUR)],
        [True],
        crew_fixed=[[0]],
        ground=ground,
        rules=[RULE_FLY_VAC],
    )
    assert eng.check_line(0, []) == []


def test_no_ground_or_rules_is_noop():
    eng = _eng([(0, 5 * HOUR)], [True], crew_fixed=[[]], ground=[[]], rules=[])
    assert eng.check_line(0, [0]) == []


# workset-103 row 0 after the edit: Group A=FLY|RES → Group B=FLY|SBY|SIM|GRD (VAC's group is GRD).
RULE_FLYRES_GRD = (["FLY", "RES"], ["FLY", "SBY", "SIM", "GRD"], ["*"], ["*"], 13.0)


def test_candidate_reserve_inside_vacation_block_violates_8056():
    # Candidate RES pairing (group=RES, is_fly=False) inside a VAC block must fire via the
    # FLY|RES → …|GRD row. Requires non-FLY pairings to enter the timeline + per-pairing group.
    ground = [_vac_days(24, 3)]
    res = (24 * DAY + 17 * HOUR, 25 * DAY + 5 * HOUR)
    eng = rre.Engine(
        pairing_start_utc=[res[0]],
        pairing_end_utc=[res[1]],
        pairing_blk_min=[0],
        crew_fixed_pairings=[[]],
        pairing_is_fly=[False],
        pairing_assignment_group=["RES"],
        pairing_label=["PRAM0"],
        block_bands=[],
        spacing_hours=None,
        crew_ground_start=[[g[0] for g in ground[0]]],
        crew_ground_end=[[g[1] for g in ground[0]]],
        crew_ground_assignment=[[g[2] for g in ground[0]]],
        crew_ground_group=[[g[3] for g in ground[0]]],
        spacing_rules=[RULE_FLYRES_GRD],
    )
    out = eng.check_line(0, [0])
    assert any(o.startswith("8056|") for o in out), f"expected 8056 RES→VAC violation, got {out}"
