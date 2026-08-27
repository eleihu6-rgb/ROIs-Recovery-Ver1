# tests/test_flight_transform.py
import pytest
from datetime import datetime, timezone
from f8.flight import transform_flight_row, to_yvr_date


def test_to_yvr_date_utc_minus_7():
    # 2026-03-04 16:50 UTC = 2026-03-04 09:50 YVR (UTC-7) => date 2026-03-04
    dt = datetime(2026, 3, 4, 16, 50, tzinfo=timezone.utc)
    assert to_yvr_date(dt).isoformat() == "2026-03-04"


def test_to_yvr_date_crosses_midnight():
    # 2026-03-04 03:00 UTC = 2026-03-03 20:00 YVR => date 2026-03-03
    dt = datetime(2026, 3, 4, 3, 0, tzinfo=timezone.utc)
    assert to_yvr_date(dt).isoformat() == "2026-03-03"


def test_transform_flight_row_basic_mapping():
    raw = {
        "owner": "F8 - Flair Airlines",
        "legNo": 804,
        "datOp": "2026-03-04T07:00:00Z",  # 07:00 UTC = 00:00 YVR => same date
        "fltId": "F8804",
        "depStn": "YVR",
        "arrStn": "YYC",
        "status": "Completed",
        "std": "2026-03-04T16:50:00Z",
        "sta": "2026-03-04T18:20:00Z",
        "atd": "2026-03-04T16:50:00Z",
        "ata": "2026-03-04T18:18:00Z",
        "acGrp": "7M8",
        "acReg": "C-FLGD",
    }
    result = transform_flight_row(raw)
    assert result["flt_num"] == 804
    assert result["interface_flt_id"] == "F8804"
    assert result["dep_arp"] == "YVR"
    assert result["arv_arp"] == "YYC"
    assert result["fleet"] == "7M8"
    assert result["flight_flag"] == "A"
    assert result["flight_assignment"] == "FLY"
    assert result["flt_dt"].isoformat() == "2026-03-04"


def test_transform_flight_row_numeric_flt_id_becomes_string():
    raw = {
        "owner": "F8",
        "legNo": 612,
        "datOp": "2026-03-04T07:00:00Z",
        "fltId": 277074,
        "depStn": "YYZ",
        "arrStn": "CUN",
        "status": "S",
        "std": "2026-03-04T10:00:00Z",
        "sta": "2026-03-04T14:00:00Z",
        "atd": "2026-03-04T10:00:00Z",
        "ata": "2026-03-04T14:00:00Z",
        "acGrp": "738",
        "acReg": "C-REG",
    }
    result = transform_flight_row(raw)
    assert result["interface_flt_id"] == "277074"


def test_transform_flight_row_missing_flt_id_raises():
    raw = {
        "owner": "F8",
        "legNo": 1,
        "datOp": "2026-03-01T00:00:00Z",
        "depStn": "YVR",
        "arrStn": "YYC",
        "status": "S",
        "std": "2026-03-01T10:00:00Z",
        "sta": "2026-03-01T14:00:00Z",
    }
    with pytest.raises(ValueError, match="fltId"):
        transform_flight_row(raw)


def test_transform_flight_row_missing_ata_defaults_to_sta():
    raw = {
        "owner": "F8", "legNo": 100, "datOp": "2026-03-01T00:00:00Z",
        "fltId": "F8100", "depStn": "YYZ", "arrStn": "YVR", "status": "S",
        "std": "2026-03-01T10:00:00Z", "sta": "2026-03-01T14:00:00Z",
        "atd": None, "ata": None, "acGrp": "738", "acReg": "C-ABC",
    }
    result = transform_flight_row(raw)
    assert result["act_dep_dt_utc"] == result["sch_dep_dt_utc"]
    assert result["act_arv_dt_utc"] == result["sch_arv_dt_utc"]