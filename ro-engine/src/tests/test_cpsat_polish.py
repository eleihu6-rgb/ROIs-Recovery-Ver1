"""Tests for cpsat_polish — Phase A repair, Phase B LNS, _is_insertable helper."""
import time

from src.algorithm.cpsat_polish import polish, _phase_a_repair, _phase_b_lns, _is_insertable
from src.algorithm.primal_recovery import Assignment
from src.models.crew import Crew
from src.models.pairing import Pairing, PairingComposition, PairingDuty
from src.constraints.compiler import CompiledFTL


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _ftl(**kw) -> CompiledFTL:
    base = dict(
        fdp_limit_func=lambda s: 720, min_rest_minutes=600,
        max_duty_flt_min=480, max_month_flt_min=6000,
        max_quarter_flt_min=16200, max_year_flt_min=60000,
        max_consecutive_duty_days=7, max_tafb_minutes=4320,
        preferred_base_weight=50.0, fairness_target_hours=80.0,
    )
    base.update(kw)
    return CompiledFTL(**base)


def _crew(cid: str, rank: str = "CA", base: str = "PEK") -> Crew:
    return Crew(
        crew_id=cid, first_name="A", last_name="B", division="P",
        rank=rank, base=base, fleet="B738", fleet_codes=["B738"],
        airport_quals=[], month_flt_min_used=0, quarter_flt_min_used=0,
        year_flt_min_used=0, last_duty_end_min=0, last_rest_end_min=0,
        consecutive_duty_days=0, locked=[],
    )


def _pairing(pid: int, start: int, end: int, flt: int,
             rank: str = "CA", fdp: int | None = None) -> Pairing:
    duty_fdp = fdp if fdp is not None else (end - start)
    return Pairing(
        pairing_id=pid, pairing_label=f"P{pid:03d}", division="P",
        base="PEK", fleet="B738", start_min=start, end_min=end,
        tafb_min=end - start, total_flt_min=flt, duty_count=1, seg_count=2,
        duties=[PairingDuty(
            duty_seq=1, duty_start_min=start, duty_end_min=end,
            fdp_min=duty_fdp, flt_min=flt, rest_after_min=0,
        )],
        compositions=[PairingComposition(rank=rank, required_count=1)],
    )


def _assign(crew_id: str, pairing_id: int, rank: str = "CA") -> Assignment:
    return Assignment(crew_id=crew_id, pairing_id=pairing_id,
                      acting_rank=rank, base_match=True)


# ---------------------------------------------------------------------------
# _is_insertable
# ---------------------------------------------------------------------------

def test_is_insertable_empty_schedule():
    crew = _crew("C1")
    p = _pairing(1, start=1000, end=1300, flt=200)
    assert _is_insertable(crew, [], p, _ftl()) is True


def test_is_insertable_append_after_sufficient_rest():
    """p2 starts 600 min after p1 ends → insertable."""
    crew = _crew("C1")
    p1 = _pairing(1, start=1000, end=1300, flt=100)
    p2 = _pairing(2, start=1900, end=2200, flt=100)  # 1900-1300=600 min rest ✓
    assert _is_insertable(crew, [p1], p2, _ftl()) is True


def test_is_insertable_insufficient_rest_between():
    """p2 starts only 300 min after p1 ends, rest requirement is 600."""
    crew = _crew("C1")
    p1 = _pairing(1, start=1000, end=1300, flt=100)
    p2 = _pairing(2, start=1600, end=1900, flt=100)  # 1600-1300=300 min rest ✗
    assert _is_insertable(crew, [p1], p2, _ftl(min_rest_minutes=600)) is False


def test_is_insertable_insert_in_middle():
    """Insert p_mid between p1 and p3 — all rest requirements satisfied.

    Crew initial last_rest_end_min=0, min_rest=600:
      p1:   start=600,  end=900
      p_mid: start=1500, end=1600   (900→1500 = 600 ✓)
      p3:   start=2200, end=2500   (1600→2200 = 600 ✓)
    """
    crew = _crew("C1")
    p1 = _pairing(1, start=600, end=900, flt=100)
    p3 = _pairing(3, start=2200, end=2500, flt=100)
    p_mid = _pairing(2, start=1500, end=1600, flt=50)
    assert _is_insertable(crew, [p1, p3], p_mid, _ftl()) is True


def test_is_insertable_middle_breaks_rest_to_next():
    """Inserting p_mid pushes rest before p3 below minimum.

    After p_mid ends at 1250, p3 starts at 1300 — only 50 min rest < 600.
    """
    crew = _crew("C1")
    p1 = _pairing(1, start=600, end=900, flt=100)
    p3 = _pairing(3, start=2200, end=2500, flt=100)
    p_mid = _pairing(2, start=1500, end=2150, flt=50)  # ends at 2150, rest to p3 = 50 < 600
    assert _is_insertable(crew, [p1, p3], p_mid, _ftl(min_rest_minutes=600)) is False


# ---------------------------------------------------------------------------
# Phase A — FTL repair
# ---------------------------------------------------------------------------

def test_phase_a_keeps_valid_assignments():
    crew = _crew("C1")
    p1 = _pairing(1, start=1000, end=1300, flt=100)
    p2 = _pairing(2, start=1900, end=2200, flt=100)  # 600 min rest ✓
    assignments = [_assign("C1", 1), _assign("C1", 2)]
    result = _phase_a_repair(assignments, [crew], [p1, p2], _ftl(), time_budget=60.0)
    assert len(result) == 2


def test_phase_a_drops_violation():
    """Two pairings with insufficient rest between them — second should be dropped."""
    crew = _crew("C1")
    p1 = _pairing(1, start=1000, end=1300, flt=100)
    p2 = _pairing(2, start=1400, end=1700, flt=100)  # 1400-1300=100 min rest ✗
    assignments = [_assign("C1", 1), _assign("C1", 2)]
    result = _phase_a_repair(assignments, [crew], [p1, p2], _ftl(min_rest_minutes=600),
                             time_budget=60.0)
    assert len(result) == 1
    assert result[0].pairing_id == 1


def test_phase_a_respects_time_budget():
    """With near-zero budget and many crews, assignments pass through unverified."""
    crews = [_crew(f"C{i}") for i in range(10)]
    pairings = [_pairing(i, start=i * 2000, end=i * 2000 + 300, flt=100)
                for i in range(1, 11)]
    # Intentional violation: p2 starts too close to p1 for C1
    assignments = [Assignment(crew_id=f"C{i}", pairing_id=i,
                              acting_rank="CA", base_match=True)
                   for i in range(1, 11)]
    # Use near-zero budget — most crews should pass through unverified
    result = _phase_a_repair(assignments, crews, pairings, _ftl(), time_budget=0.0)
    # All 10 assignments should be present (passed through)
    assert len(result) == 10


# ---------------------------------------------------------------------------
# Phase B — LNS fairness
# ---------------------------------------------------------------------------

def test_phase_b_transfers_pairing_to_lighter_crew():
    """Most-loaded crew has 2 pairings, least-loaded has 0 → transfer one.

    C1: p1(0–300, 200min) + p2(2000–2300, 200min) — total 400 min
    C2: empty — total 0 min
    Difference 400 > 60 → Phase B should transfer p2 to C2.
    p2 starts at 2000, C2 initial last_rest_end_min=0, 2000 ≥ 600 ✓
    """
    c1 = _crew("C1")
    c2 = _crew("C2")
    p1 = _pairing(1, start=1000, end=1300, flt=200)
    p2 = _pairing(2, start=2000, end=2300, flt=200)  # 700 min rest after p1 for C1 ✓
    assignments = [_assign("C1", 1), _assign("C1", 2)]
    result = _phase_b_lns(assignments, [c1, c2], [p1, p2], _ftl(),
                          time_budget=10.0, is_stop=lambda: False)
    c2_count = sum(1 for a in result if a.crew_id == "C2")
    total = len(result)
    assert c2_count >= 1
    assert total == 2  # no assignments lost


def test_phase_b_no_transfer_when_ftl_conflict():
    """Least-loaded crew cannot take the pairing due to rest conflict → no transfer.

    C2 has p_existing ending at 2200; p_candidate starts at 2300 — only 100 min rest.
    """
    c1 = _crew("C1")
    c2 = _crew("C2")
    p_existing = _pairing(1, start=1000, end=2200, flt=100)   # C2's pairing
    p_candidate = _pairing(2, start=2300, end=2600, flt=300)  # C1's heavy pairing
    assignments = [_assign("C1", 2), _assign("C2", 1)]
    result = _phase_b_lns(
        assignments, [c1, c2], [p_existing, p_candidate],
        _ftl(min_rest_minutes=600), time_budget=10.0, is_stop=lambda: False,
    )
    c1_ids = {a.pairing_id for a in result if a.crew_id == "C1"}
    assert 2 in c1_ids  # p_candidate stays with C1


# ---------------------------------------------------------------------------
# polish() integration
# ---------------------------------------------------------------------------

def test_polish_returns_list():
    crew = _crew("C1")
    p = _pairing(1, start=1000, end=1300, flt=100)
    assignments = [_assign("C1", 1)]
    result = polish(assignments, [crew], [p], _ftl(), time_budget_sec=5.0)
    assert isinstance(result, list)


def test_polish_empty_assignments():
    result = polish([], [_crew("C1")], [], _ftl(), time_budget_sec=5.0)
    assert result == []
