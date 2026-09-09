"""Phase 2: rule 8002 MAX_CUM_BLOCK enforced in check_line.

Bands carried in minutes. Block minutes attributed to each pairing's UTC start
day. Optimizer PA-ignore: a window made up entirely of fixed (pre-assigned) days
is tolerated; a breach fires only when a candidate day participates.
"""

import pytest

import rois_rule_engine_rs as rre

DAY = 86_400
# A single 28-day band capped at 10 hours (600 min) keeps the arithmetic obvious.
BANDS_10H_28D = [(28, 600.0)]


def _eng(pairing_start_days, pairing_blk_min, crew_fixed, bands=BANDS_10H_28D):
    starts = [d * DAY for d in pairing_start_days]
    ends = [s + 3600 for s in starts]
    return rre.Engine(
        pairing_start_utc=starts,
        pairing_end_utc=ends,
        pairing_blk_min=pairing_blk_min,
        crew_fixed_pairings=crew_fixed,
        block_bands=bands,
    )


def test_candidate_under_limit_passes():
    # crew0 fixed: day0=300min; candidate day1=240min → 540 < 600 in 28d.
    eng = _eng([0, 1], [300, 240], crew_fixed=[[0]])
    assert eng.check_line(0, [1]) == []


def test_candidate_over_limit_violates():
    # crew0 fixed: day0=300; candidate day1=400 → 700 > 600 within 28d window.
    eng = _eng([0, 1], [300, 400], crew_fixed=[[0]])
    out = eng.check_line(0, [1])
    assert len(out) == 1
    assert out[0].startswith("8002|window_days=28|")
    assert "actual_h=11:40" in out[0]  # 700 min (C++ truncates minutes before formatMinutes)
    assert "limit_h=10:00" in out[0]


def test_fixed_only_overlimit_is_tolerated():
    # Both pairings are fixed (pre-assigned); candidate is empty. A window with no
    # candidate day is tolerated → no violation, even though 300+400 > 600.
    eng = _eng([0, 1], [300, 400], crew_fixed=[[0, 1]])
    assert eng.check_line(0, []) == []


def test_window_separation_no_violation():
    # Candidate sits 40 days after the fixed block → never share a 28-day window.
    eng = _eng([0, 40], [400, 400], crew_fixed=[[0]])
    assert eng.check_line(0, [1]) == []


def test_exactly_at_limit_is_legal():
    # 600 == limit; violation is strict ">" (matches C++).
    eng = _eng([0, 1], [300, 300], crew_fixed=[[0]])
    assert eng.check_line(0, [1]) == []


def test_engine_reports_one_rule():
    eng = _eng([0], [10], crew_fixed=[[]])
    assert eng.n_rules == 2
    assert repr(eng) == "Engine(phase=2, app=optimizer, pairings=1, crews=1, rules=2)"
