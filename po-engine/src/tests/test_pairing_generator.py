# po-engine/src/tests/test_pairing_generator.py
from datetime import datetime, timezone, timedelta
from src.algorithm.duty_generator import DutyCandidate
from src.algorithm.pairing_generator import generate_pairings, PairingCandidate
from src.constraints.compiler import CompiledConstraints
from src.constraints.fdp_table import DEFAULT_FDP_TABLE, FdpLimitCalculator


def _cc() -> CompiledConstraints:
    return CompiledConstraints(
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


T0 = datetime(2026, 5, 1, 6, 0, tzinfo=timezone.utc)


def _duty(fids: list[int], dep: str, arv: str, start_offset_h: float, dur_h: float) -> DutyCandidate:
    start = T0 + timedelta(hours=start_offset_h)
    end = start + timedelta(hours=dur_h)
    return DutyCandidate(
        flight_ids=fids,
        dep_arp=dep,
        arv_arp=arv,
        fdp_minutes=int(dur_h * 60),
        flt_minutes=int((dur_h - 1.5) * 60),
        duty_start_utc=start,
        duty_end_utc=end,
    )


def test_single_duty_roundtrip_is_pairing():
    """A duty starting and ending at base is a valid 1-duty pairing."""
    d1 = _duty([1, 2], "PEK", "PEK", 0, 6)
    pairings = generate_pairings([d1], _cc())
    assert len(pairings) == 1
    assert len(pairings[0].duty_ids) == 1


def test_two_duty_pairing():
    """Two duties with adequate rest form a valid 2-duty pairing."""
    d1 = _duty([1, 2], "PEK", "SHA", 0, 6)        # ends SHA at T0+6h
    d2 = _duty([3, 4], "SHA", "PEK", 22, 6)       # starts SHA at T0+22h — rest=16h > 600min
    pairings = generate_pairings([d1, d2], _cc())
    two_duty = [p for p in pairings if len(p.duty_ids) == 2]
    assert len(two_duty) >= 1


def test_insufficient_rest_rejected():
    """Duties with < min_rest between them should not form a pairing."""
    d1 = _duty([1], "PEK", "SHA", 0, 6)       # ends SHA at T0+6h
    d2 = _duty([2], "SHA", "PEK", 7, 6)       # starts SHA at T0+7h — rest=1h < 600min
    pairings = generate_pairings([d1, d2], _cc())
    # No pairing should contain both d1 and d2's flights
    all_flight_sets = [set(p.flight_ids) for p in pairings]
    d1_d2_combined = set(d1.flight_ids + d2.flight_ids)
    assert d1_d2_combined not in all_flight_sets


def test_non_base_start_excluded():
    """Duty not starting from base airport cannot begin a pairing."""
    d_sha = _duty([1, 2], "SHA", "PEK", 0, 6)  # starts SHA, not in base {PEK}
    pairings = generate_pairings([d_sha], _cc())
    # No pairing should start with this SHA-departing duty's flights
    fids = set(d_sha.flight_ids)
    assert not any(fids.issubset(set(p.flight_ids)) for p in pairings)


def test_pairing_candidate_fields():
    d1 = _duty([1, 2], "PEK", "PEK", 0, 6)
    pairings = generate_pairings([d1], _cc())
    assert len(pairings) >= 1
    p = pairings[0]
    assert hasattr(p, "flight_ids")
    assert hasattr(p, "dep_arp")
    assert hasattr(p, "arv_arp")
    assert hasattr(p, "tafb_minutes")
    assert hasattr(p, "duty_ids")
    assert hasattr(p, "total_flt_minutes")
    assert p.dep_arp == "PEK"
    assert p.arv_arp == "PEK"
    assert p.flight_ids == [1, 2]
    assert len(p.duty_ids) == 1
    assert p.total_flt_minutes > 0
