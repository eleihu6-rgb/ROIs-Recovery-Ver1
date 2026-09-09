"""Rule 8030 incremental complement gate (flight COF + can_add/commit/rollback)."""

import rois_rule_engine_rs as rre

DAY = 86_400
BORN_1950 = (1950 - 1970) * 365  # ~76y at 2026
BORN_1990 = (1990 - 1970) * 365  # ~36y at 2026
AT_2026 = (2026 - 1970) * 365 + 150


def _eng(crew_div, crew_birth, crew_fixed, max_number=1, age_limit=65, n_pairings=1, segments=None):
    kwargs = dict(
        pairing_start_utc=[AT_2026 * DAY] * n_pairings,
        pairing_end_utc=[AT_2026 * DAY + 6 * 3600] * n_pairings,
        pairing_blk_min=[60] * n_pairings,
        crew_fixed_pairings=crew_fixed,
        crew_division=crew_div,
        crew_birth_ord=crew_birth,
        age_division="P",
        age_limit=age_limit,
        age_max_number=max_number,
        enabled_functions=["8030"],
    )
    if segments is not None:
        kwargs["pairing_8072_segments"] = segments
    return rre.Engine(**kwargs)


def _seg(pairing_idx, flight_id, segment_id):
    return {
        "pairing_idx": str(pairing_idx),
        "segment_id": str(segment_id),
        "duty_seq": "1",
        "seg_seq": "1",
        "flight_id": str(flight_id),
        "flight_number": "F1",
        "flight_date": "2026-06-01",
        "start_utc": str(AT_2026 * DAY),
        "end_utc": str(AT_2026 * DAY + 3600),
        "fleet": "737",
        "dep": "YVR",
        "arr": "YYZ",
        "assignment": "FLY",
        "assignment_group": "FLY",
        "composition": "*",
        "attributes": "*",
        "destination_country": "CA",
        "planned_by_rank": "",
        "filled_by_rank": "",
    }


def test_can_add_rejects_second_over_age_after_commit():
    eng = _eng(["P", "P"], [BORN_1950, BORN_1950], crew_fixed=[[], []])
    assert eng.can_add_pairing_8030(0, 0) == []
    eng.commit_pairing_8030(0, 0)

    out = eng.can_add_pairing_8030(1, 0)
    assert len(out) == 1
    assert out[0].startswith("8030|")
    assert "limit=65" in out[0]
    assert "over_age_count=2" in out[0]


def test_can_add_allows_under_age_second():
    eng = _eng(["P", "P"], [BORN_1950, BORN_1990], crew_fixed=[[], []])
    eng.commit_pairing_8030(0, 0)
    assert eng.can_add_pairing_8030(1, 0) == []


def test_rollback_clears_committed_over_age():
    eng = _eng(["P", "P"], [BORN_1950, BORN_1950], crew_fixed=[[], []])
    eng.commit_pairing_8030(0, 0)
    assert eng.can_add_pairing_8030(1, 0)
    eng.rollback_pairing_8030(0, 0)
    assert eng.can_add_pairing_8030(1, 0) == []


def test_fixed_peer_counts_without_prior_commit():
    # crew0 fixed on pairing 0; candidate crew1 over-age → fire without commit.
    eng = _eng(["P", "P"], [BORN_1950, BORN_1950], crew_fixed=[[0], []])
    out = eng.can_add_pairing_8030(1, 0)
    assert len(out) == 1
    assert "over_age_count=2" in out[0]


def test_check_line_sees_committed_dynamic_cof():
    eng = _eng(["P", "P"], [BORN_1950, BORN_1950], crew_fixed=[[], []])
    eng.commit_pairing_8030(0, 0)
    out = [o for o in eng.check_line(1, [0]) if o.startswith("8030")]
    assert len(out) == 1


def test_same_flight_different_pairings_merges_cof():
    # Pairing 0 and pairing 1 share flight_id 500; commit crew0 on P0, then
    # crew1 on P1 must see over_age_count=2.
    segs = [_seg(0, 500, 1), _seg(1, 500, 2)]
    eng = _eng(
        ["P", "P"],
        [BORN_1950, BORN_1950],
        crew_fixed=[[], []],
        n_pairings=2,
        segments=segs,
    )
    assert eng.can_add_pairing_8030(0, 0) == []
    eng.commit_pairing_8030(0, 0)
    out = eng.can_add_pairing_8030(1, 1)
    assert len(out) == 1
    assert "over_age_count=2" in out[0]
    assert "flight=500" in out[0]


def test_cof_flight_crew_seeds_initial_over_age_without_fixed_or_commit():
    """CrewOnFlight-style seed: ghost crew0 already on flight 500; crew1 cannot add."""
    segs = [_seg(0, 500, 1)]
    eng = rre.Engine(
        pairing_start_utc=[AT_2026 * DAY],
        pairing_end_utc=[AT_2026 * DAY + 6 * 3600],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[], []],
        crew_division=["P", "P"],
        crew_birth_ord=[BORN_1950, BORN_1950],
        age_division="P",
        age_limit=65,
        age_max_number=1,
        enabled_functions=["8030"],
        pairing_8072_segments=segs,
        cof_flight_crew=[(500, 0)],
    )
    out = eng.can_add_pairing_8030(1, 0)
    assert len(out) == 1
    assert "over_age_count=2" in out[0]
    assert "flight=500" in out[0]
