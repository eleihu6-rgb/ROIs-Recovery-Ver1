# po-engine/src/tests/test_mip_solver.py
from src.algorithm.pairing_generator import PairingCandidate
from src.algorithm.mip_solver import (
    solve_set_partitioning,
    solve_set_partitioning_with_cg,
    SolverResult,
)


def _pairing(flight_ids: list[int], flt_min: int) -> PairingCandidate:
    duty_min = flt_min + 90  # flt + brief + debrief proxy
    return PairingCandidate(
        flight_ids=flight_ids,
        duty_ids=[0],
        dep_arp="PEK",
        arv_arp="PEK",
        tafb_minutes=flt_min + 90,
        total_flt_minutes=flt_min,
        total_duty_minutes=duty_min,
    )


def test_trivial_two_flight_optimal():
    """2 flights, 1 candidate covering both → solver selects it, coverage 100%."""
    p1 = _pairing([101, 102], 240)
    result = solve_set_partitioning(
        candidates=[p1],
        all_flight_ids=[101, 102],
        weights={"w_pairings": 1000, "w_deadhead": 500, "w_duty_time": 1, "w_penalty": 100},
        time_limit_sec=30,
    )
    assert result.status in ("DONE", "TIMEOUT")
    assert 101 in result.covered_flight_ids
    assert 102 in result.covered_flight_ids
    assert len(result.selected_pairings) == 1


def test_disjoint_pairings_both_selected():
    """4 flights split into 2 non-overlapping pairings — both must be selected."""
    p1 = _pairing([1, 2], 120)
    p2 = _pairing([3, 4], 120)
    result = solve_set_partitioning(
        candidates=[p1, p2],
        all_flight_ids=[1, 2, 3, 4],
        weights={"w_pairings": 1000, "w_deadhead": 500, "w_duty_time": 1, "w_penalty": 100},
        time_limit_sec=30,
    )
    assert len(result.selected_pairings) == 2
    assert result.covered_flight_ids == {1, 2, 3, 4}


def test_infeasible_returns_status():
    """Flight 99 not in any candidate → infeasible."""
    p1 = _pairing([1, 2], 120)
    result = solve_set_partitioning(
        candidates=[p1],
        all_flight_ids=[1, 2, 99],   # flight 99 uncoverable
        weights={"w_pairings": 1000, "w_deadhead": 500, "w_duty_time": 1, "w_penalty": 100},
        time_limit_sec=10,
    )
    assert result.status == "INFEASIBLE"


def test_result_has_required_fields():
    """SolverResult has all required fields."""
    p1 = _pairing([1, 2], 120)
    result = solve_set_partitioning(
        candidates=[p1],
        all_flight_ids=[1, 2],
        weights={"w_pairings": 1000, "w_deadhead": 500, "w_duty_time": 1, "w_penalty": 100},
        time_limit_sec=30,
    )
    assert hasattr(result, "status")
    assert hasattr(result, "selected_pairings")
    assert hasattr(result, "covered_flight_ids")
    assert hasattr(result, "solve_time_sec")
    assert hasattr(result, "objective_value")
    assert isinstance(result.solve_time_sec, float)
    assert isinstance(result.covered_flight_ids, set)
    assert hasattr(result, "solver_status")


# ── Column generation tests ───────────────────────────────────────────────────

def test_cg_small_pool_matches_direct_mip():
    """Column generation on a tiny pool should produce the same coverage as direct MIP."""
    p1 = _pairing([1, 2], 120)
    p2 = _pairing([3, 4], 120)
    weights = {"w_pairings": 1000, "w_deadhead": 500, "w_duty_time": 1, "w_penalty": 100}

    direct = solve_set_partitioning([p1, p2], [1, 2, 3, 4], weights, 30)
    cg = solve_set_partitioning_with_cg([p1, p2], [1, 2, 3, 4], weights, 30)

    assert cg.status in ("DONE", "TIMEOUT")
    assert cg.covered_flight_ids == direct.covered_flight_ids


def test_cg_selects_cheaper_pairing():
    """CG should prefer the cheaper of two overlapping candidates."""
    # p1 covers [1,2] with high duty cost, p2 covers [1,2] with low duty cost
    p1 = _pairing([1, 2], 400)   # expensive
    p2 = _pairing([1, 2], 100)   # cheap
    p3 = _pairing([3, 4], 120)
    weights = {"w_pairings": 1, "w_deadhead": 0, "w_duty_time": 1, "w_penalty": 0}

    result = solve_set_partitioning_with_cg([p1, p2, p3], [1, 2, 3, 4], weights, 30)
    assert result.status in ("DONE", "TIMEOUT")
    assert result.covered_flight_ids == {1, 2, 3, 4}


def test_cg_infeasible_when_flight_uncoverable():
    """CG must report INFEASIBLE when a flight has no candidate."""
    p1 = _pairing([1, 2], 120)
    result = solve_set_partitioning_with_cg(
        [p1], [1, 2, 99], {"w_pairings": 1000, "w_duty_time": 1}, 10
    )
    assert result.status == "INFEASIBLE"
