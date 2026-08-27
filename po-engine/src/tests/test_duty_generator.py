# po-engine/src/tests/test_duty_generator.py
import pickle
from datetime import datetime, timezone, timedelta
from src.models.flight import Flight
from src.algorithm.flight_network import build_connection_graph
from src.algorithm.duty_generator import generate_duties, generate_duties_parallel, DutyCandidate
from src.constraints.compiler import CompiledConstraints
from src.constraints.fdp_table import DEFAULT_FDP_TABLE, FdpLimitCalculator


def _cc(**overrides) -> CompiledConstraints:
    defaults = dict(
        fdp_limit_func=FdpLimitCalculator(list(DEFAULT_FDP_TABLE)),
        min_rest_minutes=600,
        max_duty_minutes=840,
        max_consecutive_duty_days=7,
        max_flt_per_duty_minutes=600,
        cumulative_flt_limits={7: 2400},
        mct_by_airport={},
        default_mct_minutes=60,
        brief_minutes=60,
        debrief_minutes=30,
        base_airports=frozenset(["PEK"]),
        max_pairing_days=5,
        max_tafb_minutes=72 * 60,
    )
    defaults.update(overrides)
    return CompiledConstraints(**defaults)


T0 = datetime(2026, 5, 1, 6, 0, tzinfo=timezone.utc)


def _f(fid: int, dep: str, arv: str, dep_offset_h: float, blk_h: float) -> Flight:
    dep_dt = T0 + timedelta(hours=dep_offset_h)
    arv_dt = dep_dt + timedelta(hours=blk_h)
    return Flight(
        id=fid, airline="F8", flt_dt="2026-05-01", flt_num=f"F8{fid:03d}",
        dep_arp=dep, arv_arp=arv,
        sch_dep_dt_utc=dep_dt, sch_arv_dt_utc=arv_dt,
        blk_min=int(blk_h * 60), fleet="320", flt_type="J",
    )


def test_single_flight_is_valid_duty():
    """Any single flight constitutes a valid 1-segment duty."""
    f1 = _f(1, "PEK", "SHA", 0, 2)
    cc = _cc()
    graph = build_connection_graph([f1], cc)
    duties = generate_duties([f1], graph, cc)
    assert any(len(d.flight_ids) == 1 for d in duties)


def test_two_flights_same_duty():
    """PEK→SHA + SHA→PEK with 1h ground → one 2-segment duty."""
    f1 = _f(1, "PEK", "SHA", 0, 2)
    f2 = _f(2, "SHA", "PEK", 3, 2)  # 1h ground after f1 arv
    cc = _cc()
    graph = build_connection_graph([f1, f2], cc)
    duties = generate_duties([f1, f2], graph, cc)
    two_seg = [d for d in duties if len(d.flight_ids) == 2]
    assert len(two_seg) >= 1
    assert set(two_seg[0].flight_ids) == {1, 2}


def test_fdp_violation_prunes():
    """A flight that would push FDP over the limit should not be included."""
    # FDP limit for 1 seg at 06:00 = 780 min = 13h
    # f1: 06:00–20:00 (14h block) — brief(60) + 14h*60 + debrief(30) = 930 > 780
    f1 = _f(1, "PEK", "SHA", 0, 14)   # 14h block — FDP = 930 > limit
    f2 = _f(2, "SHA", "PEK", 15, 2)
    cc = _cc()
    graph = build_connection_graph([f1, f2], cc)
    duties = generate_duties([f1, f2], graph, cc)
    # The 2-segment duty starting with f1 should not appear (f1 itself exceeds FDP)
    two_seg = [d for d in duties if set(d.flight_ids) == {1, 2}]
    assert len(two_seg) == 0


def test_duty_candidate_has_required_fields():
    """DutyCandidate should expose flight_ids, dep_arp, arv_arp, fdp_minutes."""
    f1 = _f(1, "PEK", "SHA", 0, 2)
    cc = _cc()
    graph = build_connection_graph([f1], cc)
    duties = generate_duties([f1], graph, cc)
    d = duties[0]
    assert hasattr(d, "flight_ids")
    assert hasattr(d, "dep_arp")
    assert hasattr(d, "arv_arp")
    assert hasattr(d, "fdp_minutes")
    assert d.dep_arp == "PEK"
    assert d.arv_arp == "SHA"


# ── Parallel generation & pickling ───────────────────────────────────────────

def test_compiled_constraints_is_picklable():
    """CompiledConstraints (with FdpLimitCalculator) must survive pickle round-trip."""
    cc = _cc()
    cc2 = pickle.loads(pickle.dumps(cc))
    assert cc2.fdp_limit_func(1, "09:00") == cc.fdp_limit_func(1, "09:00")
    assert cc2.min_rest_minutes == cc.min_rest_minutes


def test_parallel_same_result_as_sequential():
    """generate_duties_parallel must return the same set of duties as sequential."""
    # Build a small multi-airport scenario (2 bases) to exercise grouping
    f1 = _f(1, "PEK", "SHA", 0, 2)
    f2 = _f(2, "SHA", "PEK", 3, 2)
    f3 = _f(3, "CTU", "PEK", 0, 3)
    f4 = _f(4, "PEK", "CTU", 4, 3)
    flights = [f1, f2, f3, f4]
    cc = _cc()
    graph = build_connection_graph(flights, cc)

    seq = generate_duties(flights, graph, cc)
    par = generate_duties_parallel(flights, graph, cc, min_flights=1, max_workers=2)

    seq_keys = {tuple(sorted(d.flight_ids)) for d in seq}
    par_keys = {tuple(sorted(d.flight_ids)) for d in par}
    assert seq_keys == par_keys
