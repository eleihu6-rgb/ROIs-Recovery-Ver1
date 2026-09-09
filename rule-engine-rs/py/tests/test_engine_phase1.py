"""Phase 1 acceptance: the Engine owns a once-loaded immutable scenario store.

Build a tiny scenario via the parallel-array constructor, assert the store
counts, and that check_line accepts native integer payloads (returning no
violations yet — kernels arrive in Phase 2) and validates indices.
"""

import pytest

import rois_rule_engine_rs as rre


def make_engine():
    # 3 pairings (start, end, block-minutes); 2 crews with fixed rosters.
    return rre.Engine(
        pairing_start_utc=[1_000, 90_000, 180_000],
        pairing_end_utc=[40_000, 130_000, 220_000],
        pairing_blk_min=[300, 240, 600],
        crew_fixed_pairings=[[0], [1, 2]],
    )


def test_store_counts():
    eng = make_engine()
    assert eng.n_pairings == 3
    assert eng.n_crews == 2
    assert repr(eng) == "Engine(phase=2, app=optimizer, pairings=3, crews=2, rules=1)"


def test_check_line_native_payload_returns_empty():
    eng = make_engine()
    assert eng.check_line(0, [1]) == []
    assert eng.check_line(1, [0]) == []
    assert eng.check_line(0, []) == []


def test_check_line_validates_indices():
    eng = make_engine()
    with pytest.raises(ValueError):
        eng.check_line(5, [0])  # crew out of range
    with pytest.raises(ValueError):
        eng.check_line(0, [99])  # pairing out of range


def test_constructor_rejects_ragged_arrays():
    with pytest.raises(ValueError):
        rre.Engine(
            pairing_start_utc=[1, 2],
            pairing_end_utc=[1],  # mismatched length
            pairing_blk_min=[1, 2],
        )


def test_constructor_rejects_bad_fixed_index():
    with pytest.raises(ValueError):
        rre.Engine(
            pairing_start_utc=[1],
            pairing_end_utc=[2],
            pairing_blk_min=[3],
            crew_fixed_pairings=[[7]],  # index out of range
        )
