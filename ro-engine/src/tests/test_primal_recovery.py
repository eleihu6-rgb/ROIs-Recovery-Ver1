# src/tests/test_primal_recovery.py
from src.algorithm.primal_recovery import recover_primal, Assignment
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


def _pairing(pid: int, rank: str = "CA", required: int = 1) -> Pairing:
    return Pairing(
        pairing_id=pid, pairing_label=f"P{pid:03d}", division="P",
        base="PEK", fleet="B738", start_min=pid * 2000, end_min=pid * 2000 + 300,
        tafb_min=300, total_flt_min=200, duty_count=1, seg_count=1,
        compositions=[PairingComposition(rank=rank, required_count=required)],
    )


def test_recover_single_pairing():
    crews = [_crew("C1"), _crew("C2")]
    pairings = [_pairing(1)]
    # Lagrangian says crew 0 selected pairing 0
    selected_by_crew = [[0], []]
    lambdas = {1: {"CA": 500.0}}
    assignments = recover_primal(crews, pairings, selected_by_crew, lambdas, _ftl())
    assigned_crews = [a.crew_id for a in assignments if a.pairing_id == 1]
    assert "C1" in assigned_crews


def test_recover_respects_required_count():
    # Pairing requires 2 CA — should assign exactly 2
    crews = [_crew("C1"), _crew("C2"), _crew("C3")]
    pairings = [_pairing(1, required=2)]
    selected_by_crew = [[0], [0], [0]]  # all selected; should pick best 2
    lambdas = {1: {"CA": 500.0}}
    assignments = recover_primal(crews, pairings, selected_by_crew, lambdas, _ftl())
    assigned = [a for a in assignments if a.pairing_id == 1]
    assert len(assigned) == 2


def test_recover_returns_assignment_objects():
    crews = [_crew("C1")]
    pairings = [_pairing(1)]
    selected_by_crew = [[0]]
    lambdas = {1: {"CA": 500.0}}
    assignments = recover_primal(crews, pairings, selected_by_crew, lambdas, _ftl())
    assert all(isinstance(a, Assignment) for a in assignments)


def test_recover_empty_selection():
    crews = [_crew("C1")]
    pairings = [_pairing(1)]
    selected_by_crew = [[]]  # no selection
    lambdas = {1: {"CA": 0.0}}
    assignments = recover_primal(crews, pairings, selected_by_crew, lambdas, _ftl())
    # May or may not assign (greedy fallback) — just verify no crash and valid type
    assert isinstance(assignments, list)
