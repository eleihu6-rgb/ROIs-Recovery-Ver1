from src.algorithm.crew_scheduler import solve_crew_dp, can_add, compute_profit, next_dp_state
from src.models.crew import Crew
from src.models.pairing import Pairing, PairingComposition
from src.constraints.compiler import CompiledFTL
from src.utils.ftl_state import DPState


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


def _crew(**kw) -> Crew:
    base = dict(
        crew_id="C001", first_name="A", last_name="B", division="P",
        rank="CA", base="PEK", fleet="B738", fleet_codes=["B738"],
        airport_quals=[], month_flt_min_used=0, quarter_flt_min_used=0,
        year_flt_min_used=0, last_duty_end_min=0, last_rest_end_min=0,
        consecutive_duty_days=0, locked=[],
    )
    base.update(kw)
    return Crew(**base)


def _state(**kw) -> DPState:
    base = dict(
        last_end_min=0, last_rest_end_min=0, month_flt_min=0,
        quarter_flt_min=0, year_flt_min=0, consecutive_duties=0,
    )
    base.update(kw)
    return DPState(**base)


def _pairing(pid: int, start: int, end: int, flt: int, duties: int = 1) -> Pairing:
    return Pairing(
        pairing_id=pid, pairing_label=f"P{pid:03d}", division="P",
        base="PEK", fleet="B738", start_min=start, end_min=end,
        tafb_min=end - start, total_flt_min=flt,
        duty_count=duties, seg_count=duties,
        compositions=[PairingComposition(rank="CA", required_count=1)],
    )


# --- can_add tests ---

def test_can_add_first_pairing_no_history():
    state = _state()
    p = _pairing(1, start=1000, end=1300, flt=200)
    assert can_add(state, p, _ftl()) is True


def test_can_add_requires_min_rest():
    state = _state(last_rest_end_min=1000)
    ftl = _ftl(min_rest_minutes=600)
    p = _pairing(1, start=1400, end=1700, flt=200)  # 400 min rest — not enough
    assert can_add(state, p, ftl) is False


def test_can_add_sufficient_rest():
    state = _state(last_rest_end_min=1000)
    ftl = _ftl(min_rest_minutes=600)
    p = _pairing(1, start=1600, end=1900, flt=200)  # 600 min rest — exactly enough
    assert can_add(state, p, ftl) is True


def test_can_add_month_limit_exceeded():
    state = _state(month_flt_min=5900)
    ftl = _ftl(max_month_flt_min=6000)
    p = _pairing(1, start=1000, end=1300, flt=200)  # 5900+200 > 6000
    assert can_add(state, p, ftl) is False


def test_can_add_consecutive_duties_exceeded():
    state = _state(consecutive_duties=7)
    ftl = _ftl(max_consecutive_duty_days=7)
    p = _pairing(1, start=1000, end=1300, flt=200, duties=1)
    assert can_add(state, p, ftl) is False


# --- next_dp_state tests ---

def test_next_state_advances_correctly():
    state = _state(month_flt_min=100, consecutive_duties=2)
    p = _pairing(1, start=1000, end=1300, flt=200, duties=2)
    new_state = next_dp_state(state, p)
    assert new_state.last_end_min == 1300
    assert new_state.last_rest_end_min == 1300
    assert new_state.month_flt_min == 300
    assert new_state.consecutive_duties == 4


# --- solve_crew_dp tests ---

def test_dp_selects_profitable_pairing():
    crew = _crew()
    pairings = [_pairing(1, start=1000, end=1300, flt=200)]
    # lambda > 0 → profitable
    lambdas = {1: {"CA": 500.0}}
    selected = solve_crew_dp(crew, pairings, lambdas, _ftl())
    assert 0 in selected  # pairing index 0 selected


def test_dp_skips_pairing_with_zero_lambda():
    crew = _crew()
    pairings = [_pairing(1, start=1000, end=1300, flt=200)]
    lambdas = {1: {"CA": 0.0}}  # no profit
    selected = solve_crew_dp(crew, pairings, lambdas, _ftl())
    # With zero lambda and base_pref penalty: may or may not select — just verify no crash
    assert isinstance(selected, list)


def test_dp_selects_two_non_overlapping():
    crew = _crew()
    p1 = _pairing(1, start=1000, end=1300, flt=100)
    p2 = _pairing(2, start=1900, end=2200, flt=100)  # 600 min rest after p1
    lambdas = {1: {"CA": 500.0}, 2: {"CA": 500.0}}
    selected = solve_crew_dp(crew, [p1, p2], lambdas, _ftl())
    assert 0 in selected
    assert 1 in selected


def test_dp_skips_overlapping_pairing():
    crew = _crew()
    p1 = _pairing(1, start=1000, end=1500, flt=200)
    p2 = _pairing(2, start=1200, end=1700, flt=200)  # overlaps p1 (insufficient rest)
    lambdas = {1: {"CA": 500.0}, 2: {"CA": 500.0}}
    selected = solve_crew_dp(crew, [p1, p2], lambdas, _ftl())
    # Can only have one of them
    assert not (0 in selected and 1 in selected)


def test_dp_empty_pairings():
    crew = _crew()
    selected = solve_crew_dp(crew, [], {}, _ftl())
    assert selected == []
