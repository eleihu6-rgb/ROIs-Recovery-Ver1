# po-engine/src/tests/test_flight_network.py
from datetime import datetime, timezone, timedelta
import pytest
from src.models.flight import Flight
from src.algorithm.flight_network import build_connection_graph
from src.constraints.compiler import CompiledConstraints
from src.constraints.fdp_table import DEFAULT_FDP_TABLE, FdpLimitCalculator


def _cc(mct: int = 60) -> CompiledConstraints:
    return CompiledConstraints(
        fdp_limit_func=FdpLimitCalculator(list(DEFAULT_FDP_TABLE)),
        min_rest_minutes=600,
        max_duty_minutes=840,
        max_consecutive_duty_days=7,
        max_flt_per_duty_minutes=600,
        cumulative_flt_limits={7: 2400},
        mct_by_airport={},
        default_mct_minutes=mct,
        brief_minutes=60,
        debrief_minutes=30,
        base_airports=frozenset(["PEK"]),
        max_pairing_days=5,
        max_tafb_minutes=72 * 60,
    )


def _flight(fid: int, dep: str, arv: str, dep_utc: datetime, arv_utc: datetime) -> Flight:
    return Flight(
        id=fid, airline="F8", flt_dt="2026-05-01",
        flt_num=f"F8{fid:03d}",
        dep_arp=dep, arv_arp=arv,
        sch_dep_dt_utc=dep_utc, sch_arv_dt_utc=arv_utc,
        blk_min=int((arv_utc - dep_utc).total_seconds() // 60),
        fleet="320", flt_type="J",
    )


T0 = datetime(2026, 5, 1, 6, 0, tzinfo=timezone.utc)


def test_valid_connection():
    """SHA→PEK can follow PEK→SHA when ground time >= MCT."""
    f1 = _flight(1, "PEK", "SHA", T0, T0 + timedelta(hours=2))
    f2 = _flight(2, "SHA", "PEK", T0 + timedelta(hours=3), T0 + timedelta(hours=5))
    graph = build_connection_graph([f1, f2], _cc(mct=60))
    assert 2 in graph[1]


def test_mct_violation_blocks_connection():
    """Flight departing 30 min after arrival fails MCT=60."""
    f1 = _flight(1, "PEK", "SHA", T0, T0 + timedelta(hours=2))
    f2 = _flight(2, "SHA", "PEK", T0 + timedelta(hours=2, minutes=30), T0 + timedelta(hours=4, minutes=30))
    graph = build_connection_graph([f1, f2], _cc(mct=60))
    assert 2 not in graph.get(1, [])


def test_airport_mismatch_blocks_connection():
    """PEK→SHA cannot connect directly to CTU→PEK."""
    f1 = _flight(1, "PEK", "SHA", T0, T0 + timedelta(hours=2))
    f2 = _flight(2, "CTU", "PEK", T0 + timedelta(hours=3), T0 + timedelta(hours=5))
    graph = build_connection_graph([f1, f2], _cc())
    assert 2 not in graph.get(1, [])


def test_overnight_gap_excluded():
    """Ground wait > 24h means different duty, not connected in same duty."""
    f1 = _flight(1, "PEK", "SHA", T0, T0 + timedelta(hours=2))
    f2 = _flight(2, "SHA", "PEK", T0 + timedelta(hours=25), T0 + timedelta(hours=27))
    graph = build_connection_graph([f1, f2], _cc())
    assert 2 not in graph.get(1, [])


def test_per_airport_mct_override():
    """SHA-specific MCT=90 blocks a 60-min connection that would pass default MCT=60."""
    f1 = _flight(1, "PEK", "SHA", T0, T0 + timedelta(hours=2))
    f2 = _flight(2, "SHA", "PEK", T0 + timedelta(hours=3), T0 + timedelta(hours=5))
    # With SHA MCT=90, ground=60 is not enough
    cc = _cc(mct=60)
    cc_sha90 = CompiledConstraints(
        fdp_limit_func=cc.fdp_limit_func,
        min_rest_minutes=cc.min_rest_minutes,
        max_duty_minutes=cc.max_duty_minutes,
        max_consecutive_duty_days=cc.max_consecutive_duty_days,
        max_flt_per_duty_minutes=cc.max_flt_per_duty_minutes,
        cumulative_flt_limits=cc.cumulative_flt_limits,
        mct_by_airport={"SHA": 90},
        default_mct_minutes=60,
        brief_minutes=cc.brief_minutes,
        debrief_minutes=cc.debrief_minutes,
        base_airports=cc.base_airports,
        max_pairing_days=cc.max_pairing_days,
        max_tafb_minutes=cc.max_tafb_minutes,
    )
    graph = build_connection_graph([f1, f2], cc_sha90)
    assert 2 not in graph.get(1, [])
