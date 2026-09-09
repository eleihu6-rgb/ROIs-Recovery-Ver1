"""Rule 8004 BASIC COMPETENCY (BASE): a roster's base must be covered by one of the
crew's base-validity windows over the roster span."""

import rois_rule_engine_rs as rre

DAY = 86_400
H = 3600


def _eng(pairing_bases, crew_quals, crew_fixed, grace=0):
    n = len(pairing_bases)
    return rre.Engine(
        pairing_start_utc=[i * DAY for i in range(n)],
        pairing_end_utc=[i * DAY + 6 * H for i in range(n)],
        pairing_blk_min=[60] * n,
        crew_fixed_pairings=crew_fixed,
        pairing_base=pairing_bases,
        crew_base_quals=crew_quals,
        base_grace_days=grace,
    )


def test_uncovered_base_fires():
    # crew qualified only for YEG; candidate pairing based YYZ → violation.
    eng = _eng(["YEG", "YYZ"], crew_quals=[[("YEG", -10**9, 10**9)]], crew_fixed=[[0]])
    out = [o for o in eng.check_line(0, [1]) if o.startswith("8004")]
    assert len(out) == 1
    assert "base=YYZ" in out[0]


def test_covered_base_passes():
    eng = _eng(["YEG", "YEG"], crew_quals=[[("YEG", -10**9, 10**9)]], crew_fixed=[[0]])
    assert [o for o in eng.check_line(0, [1]) if o.startswith("8004")] == []


def test_empty_base_skipped():
    # blank base rosters are skipped (the C++ skips empty/'*').
    eng = _eng(["YEG", ""], crew_quals=[[("YEG", -10**9, 10**9)]], crew_fixed=[[0]])
    assert [o for o in eng.check_line(0, [1]) if o.startswith("8004")] == []


def test_expired_window_fires():
    # crew's YEG qual expired before the roster (exp_ord small) → not covered.
    eng = _eng(["YEG", "YEG"], crew_quals=[[("YEG", -10**9, -100)]], crew_fixed=[[0]])
    out = [o for o in eng.check_line(0, [1]) if o.startswith("8004")]
    assert len(out) == 1


# ── location-continuity exemption: real false-positive, crew 295 (SIT, 2026-09) ────────
# YVR-based crew flies YVR→YYZ (fixed/PA), does two SIM ground duties at YYZ, then flies
# YYZ→YVR (candidate). Every leg's arrival matches the next activity's station — a genuine
# closed loop out of and back to the qualified base — so the YYZ-based return pairing must
# NOT violate even though its own `base` (YYZ) isn't a qualification the crew holds.
def _closed_loop_eng(*, ground_station="YYZ"):
    return rre.Engine(
        pairing_start_utc=[0, 3 * DAY],
        pairing_end_utc=[6 * H, 3 * DAY + 6 * H],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_base=["YVR", "YYZ"],
        pairing_start_station=["YVR", "YYZ"],
        pairing_end_station=["YYZ", "YVR"],
        crew_base_quals=[[("YVR", -(10**9), 10**9)]],
        base_grace_days=0,
        crew_ground_start=[[1 * DAY, 2 * DAY]],
        crew_ground_end=[[1 * DAY + 6 * H, 2 * DAY + 6 * H]],
        crew_ground_station=[[ground_station, ground_station]],
        application="editor",
    )


def test_crew_295_ground_duty_loop_back_to_qualified_base_is_legal():
    eng = _closed_loop_eng()
    out = [o for o in eng.check_line(0, [1]) if o.startswith("8004")]
    assert out == [], f"continuous closed loop back to YVR must not violate, got {out}"


def test_broken_chain_with_genuine_discontinuity_still_violates():
    # SIM ground duties are at YOW, not YYZ — the chain from the outbound leg is broken.
    eng = _closed_loop_eng(ground_station="YOW")
    out = [o for o in eng.check_line(0, [1]) if o.startswith("8004")]
    assert len(out) == 1
    assert "base=YYZ" in out[0]
