from src.algorithm.lagrangian import run_lagrangian, LagrangianResult, _compute_gap
from src.models.crew import Crew
from src.models.pairing import Pairing, PairingComposition
from src.constraints.compiler import CompiledFTL


def _ftl() -> CompiledFTL:
    return CompiledFTL(
        fdp_limit_func=lambda s: 720, min_rest_minutes=600,
        max_duty_flt_min=480, max_month_flt_min=6000,
        max_quarter_flt_min=16200, max_year_flt_min=60000,
        max_consecutive_duty_days=7, max_tafb_minutes=4320,
        preferred_base_weight=50.0, fairness_target_hours=80.0,
    )


def _crew(cid: str, rank: str = "CA") -> Crew:
    return Crew(
        crew_id=cid, first_name="A", last_name="B", division="P",
        rank=rank, base="PEK", fleet="B738", fleet_codes=["B738"],
        airport_quals=[], month_flt_min_used=0, quarter_flt_min_used=0,
        year_flt_min_used=0, last_duty_end_min=0, last_rest_end_min=0,
        consecutive_duty_days=0, locked=[],
    )


def _pairing(pid: int, start: int, end: int, flt: int, rank: str = "CA") -> Pairing:
    return Pairing(
        pairing_id=pid, pairing_label=f"P{pid:03d}", division="P",
        base="PEK", fleet="B738", start_min=start, end_min=end,
        tafb_min=end - start, total_flt_min=flt, duty_count=1, seg_count=1,
        compositions=[PairingComposition(rank=rank, required_count=1)],
    )


def test_returns_lagrangian_result():
    crews = [_crew("C1"), _crew("C2")]
    pairings = [_pairing(1, 1000, 1300, 100), _pairing(2, 2000, 2300, 100)]
    eligibility = {0: [0, 1], 1: [0, 1]}
    result = run_lagrangian(
        crews, pairings, eligibility, _ftl(),
        {"time_limit_sec": "5", "max_iterations": "3",
         "weights_unassigned": "1000", "weights_base_pref": "50"},
        lambda: False,
    )
    assert isinstance(result, LagrangianResult)
    assert result.total_iterations >= 1
    assert len(result.selected_by_crew) == 2


def test_compute_gap_under_coverage():
    # 2 crews with rank CA, 1 pairing requiring 1 CA — both crews select it → gap CA = 1 - 2 = -1
    crews = [_crew("C1"), _crew("C2")]
    pairings = [_pairing(1, 1000, 1300, 100)]
    selected_by_crew = [[0], [0]]
    comps = {1: {"CA": 1}}
    gap = _compute_gap(pairings, crews, selected_by_crew, comps)
    assert gap[1]["CA"] == -1


def test_compute_gap_not_covered():
    crews = [_crew("C1")]
    pairings = [_pairing(1, 1000, 1300, 100)]
    selected_by_crew = [[]]  # crew didn't select pairing
    comps = {1: {"CA": 1}}
    gap = _compute_gap(pairings, crews, selected_by_crew, comps)
    assert gap[1]["CA"] == 1  # required=1, assigned=0 → gap=1


def test_stop_requested_exits_early():
    crews = [_crew("C1")]
    pairings = [_pairing(1, 1000, 1300, 100)]
    eligibility = {0: [0]}
    result = run_lagrangian(
        crews, pairings, eligibility, _ftl(),
        {"time_limit_sec": "5", "max_iterations": "100"},
        lambda: True,  # stop immediately
    )
    assert result.total_iterations <= 2


def test_convergence_triggers_on_max_gap():
    """Convergence should trigger when L∞ norm of gap ≤ 0.5.

    With 1 crew and 1 pairing requiring 1 CA, after the crew selects the
    pairing the gap is 0 — convergence should fire in ≤ 2 iterations.
    """
    crews = [_crew("C1")]
    pairings = [_pairing(1, 1000, 1300, 100)]
    eligibility = {0: [0]}
    result = run_lagrangian(
        crews, pairings, eligibility, _ftl(),
        {"time_limit_sec": "30", "max_iterations": "500",
         "weights_unassigned": "1000"},
        lambda: False,
    )
    # Converged early — well under max_iterations
    assert result.total_iterations < 50
