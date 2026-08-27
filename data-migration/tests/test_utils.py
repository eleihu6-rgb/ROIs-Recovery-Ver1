from datetime import date
import pytest
from f8.utils import (
    chunk_date_range,
    normalize_interface_flt_id,
    normalize_rank,
    normalize_assignment,
    SyncResult,
)


# --- chunk_date_range ---

def test_chunk_within_10_days_returns_single_chunk():
    chunks = chunk_date_range(date(2026, 3, 1), date(2026, 3, 10), chunk_days=10)
    assert chunks == [(date(2026, 3, 1), date(2026, 3, 10))]


def test_chunk_exactly_10_days():
    chunks = chunk_date_range(date(2026, 3, 1), date(2026, 3, 10), chunk_days=10)
    assert len(chunks) == 1


def test_chunk_11_days_splits_into_two():
    chunks = chunk_date_range(date(2026, 3, 1), date(2026, 3, 11), chunk_days=10)
    assert len(chunks) == 2
    assert chunks[0] == (date(2026, 3, 1), date(2026, 3, 10))
    assert chunks[1] == (date(2026, 3, 11), date(2026, 3, 11))


def test_chunk_25_days_splits_into_three():
    chunks = chunk_date_range(date(2026, 3, 1), date(2026, 3, 25), chunk_days=10)
    assert len(chunks) == 3
    assert chunks[2] == (date(2026, 3, 21), date(2026, 3, 25))


def test_chunk_same_day():
    chunks = chunk_date_range(date(2026, 3, 1), date(2026, 3, 1), chunk_days=10)
    assert chunks == [(date(2026, 3, 1), date(2026, 3, 1))]


def test_chunk_days_less_than_1_raises():
    with pytest.raises(ValueError, match="chunk_days must be at least 1"):
        chunk_date_range(date(2026, 3, 1), date(2026, 3, 10), chunk_days=0)
    with pytest.raises(ValueError, match="chunk_days must be at least 1"):
        chunk_date_range(date(2026, 3, 1), date(2026, 3, 10), chunk_days=-1)


# --- normalize_rank ---


def test_normalize_rank_cap_to_ca():
    assert normalize_rank("CAP") == "CA"


def test_normalize_rank_cp_to_fo():
    assert normalize_rank("CP") == "FO"


def test_normalize_rank_ca_unchanged():
    assert normalize_rank("CA") == "CA"


def test_normalize_rank_fo_unchanged():
    assert normalize_rank("FO") == "FO"


def test_normalize_rank_unknown_passthrough():
    assert normalize_rank("FE") == "FE"


def test_normalize_rank_case_insensitive():
    assert normalize_rank("cap") == "CA"
    assert normalize_rank("Cap") == "CA"
    assert normalize_rank("fo") == "FO"


# --- normalize_assignment ---


def test_normalize_assignment_flight_to_fly():
    assert normalize_assignment("FLIGHT") == "FLY"


def test_normalize_assignment_reserve_to_sby():
    assert normalize_assignment("RESERVE") == "SBY"


def test_normalize_assignment_training_to_grd():
    assert normalize_assignment("TRAINING") == "GRD"


def test_normalize_assignment_transport_to_dhd():
    assert normalize_assignment("TRANSPORT") == "DHD"


def test_normalize_assignment_unknown_passthrough():
    assert normalize_assignment("Hotel") == "Hotel"


def test_normalize_assignment_case_insensitive():
    assert normalize_assignment("flight") == "FLY"
    assert normalize_assignment("Flight") == "FLY"
    assert normalize_assignment("reserve") == "SBY"
    assert normalize_assignment("RESERVE") == "SBY"
    assert normalize_assignment("training") == "GRD"
    assert normalize_assignment("transport") == "DHD"


# --- normalize_interface_flt_id ---


def test_normalize_interface_flt_id_string():
    assert normalize_interface_flt_id("  F8804  ") == "F8804"


def test_normalize_interface_flt_id_int():
    assert normalize_interface_flt_id(277074) == "277074"


def test_normalize_interface_flt_id_empty():
    assert normalize_interface_flt_id(None) == ""
    assert normalize_interface_flt_id("") == ""
    assert normalize_interface_flt_id("   ") == ""


def test_normalize_interface_flt_id_truncates():
    long_id = "x" * 100
    out = normalize_interface_flt_id(long_id, max_len=10)
    assert len(out) == 10
    assert out == "x" * 10


# --- SyncResult ---


def test_sync_result_defaults_to_completed():
    r = SyncResult("crew")
    assert r.status == "completed"
    assert r.imported == 0
    assert r.skipped == 0


def test_sync_result_add_warning_changes_status():
    r = SyncResult("pairing")
    r.add_warning("Pairing 101: flight not found")
    assert r.status == "completed_with_warnings"
    assert r.skipped == 1
    assert len(r.warnings) == 1


def test_sync_result_add_notice_does_not_increment_skipped():
    r = SyncResult("pairing")
    r.add_notice("Pairing 101: orphan segment (pairing still imported)")
    assert r.status == "completed_with_warnings"
    assert r.skipped == 0
    assert len(r.warnings) == 1


def test_sync_result_to_dict():
    r = SyncResult("flight")
    r.imported = 100
    d = r.to_dict()
    assert d["entity"] == "flight"
    assert d["imported"] == 100
    assert "warnings" in d