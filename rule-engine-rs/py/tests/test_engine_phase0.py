"""Phase 0 acceptance: the PyO3 FFI boundary works end-to-end.

Import the Rust extension, construct an (empty) Engine, read its introspection.
Scenario loading + check_line behaviour is covered in test_engine_phase1.py.
"""

import pytest

import rois_rule_engine_rs as rre


def test_module_imports_and_has_version():
    assert isinstance(rre.__version__, str)
    assert rre.__version__ == "0.1.0"


def test_empty_engine_constructs():
    eng = rre.Engine()
    assert eng.n_pairings == 0
    assert eng.n_crews == 0
    assert repr(eng) == "Engine(phase=2, app=optimizer, pairings=0, crews=0, rules=1)"


def test_engine_accepts_rule_7500_stay_period_table_rows():
    eng = rre.Engine(acc_stay_period_rows=[(0, 240, 4320, 5760)])
    assert eng.n_pairings == 0
    assert eng.n_rules == 1


def test_engine_accepts_rule_7500_flight_boundary_duty_arrays():
    eng = rre.Engine(
        pairing_start_utc=[0],
        pairing_end_utc=[12],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[]],
        pairing_duty_offsets=[0, 1],
        pairing_duty_start_utc=[0],
        pairing_duty_end_utc=[12],
        pairing_duty_dep_tz_min=[0],
        pairing_duty_arr_tz_min=[0],
        pairing_duty_first_flight_departure_utc=[2],
        pairing_duty_last_flight_arrival_utc=[10],
    )
    assert eng.n_pairings == 1


def test_engine_rejects_mismatched_rule_7500_flight_boundary_arrays():
    with pytest.raises(ValueError, match="pairing_duty_first_flight_departure_utc"):
        rre.Engine(
            pairing_start_utc=[0],
            pairing_end_utc=[12],
            pairing_blk_min=[60],
            crew_fixed_pairings=[[]],
            pairing_duty_offsets=[0, 1],
            pairing_duty_start_utc=[0],
            pairing_duty_end_utc=[12],
            pairing_duty_dep_tz_min=[0],
            pairing_duty_arr_tz_min=[0],
            pairing_duty_first_flight_departure_utc=[2, 3],
            pairing_duty_last_flight_arrival_utc=[10],
        )


def test_empty_engine_check_line_rejects_unknown_crew():
    eng = rre.Engine()
    with pytest.raises(ValueError):
        eng.check_line(0, [])
