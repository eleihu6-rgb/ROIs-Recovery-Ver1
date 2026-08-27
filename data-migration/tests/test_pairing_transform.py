# tests/test_pairing_transform.py
from datetime import datetime, timezone
from f8.pairing import (
    transform_pairing_row,
    build_duty_nodes,
    normalize_pairing_assignment,
    build_segment_flight,
    _composition_division,
    _duty_comments,
    _segment_interface_flt_id_decimal,
    _duty_credit_minutes,
)


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


DUTY = {
    "dutyId": 10,
    "dutySeq": 1,
    "strArp": "YYZ",
    "arrArp": "YVR",
    "actStrDtUtc": "2026-03-01T10:00:00Z",
    "actEndDtUtc": "2026-03-01T20:00:00Z",
    "creditMin": 360,
    "assignment": "FLIGHT",
    "nodes": [],
    "segments": [],
}

RAW_PAIRING = {
    "pairingId": "101198",
    "pairingDt": "2026-02-23 00:00:00",
    "label": "YYZ/YVR",
    "base": "YYZ",
    "fleet": "737",
    "durationDays": 2,
    "pairingCompositions": [{"actingRank": "CAP", "planValue": 1}],
    "pairingDutyList": [DUTY],
}


def test_transform_pairing_row_stores_pairing_id_as_interface_id():
    result = transform_pairing_row(RAW_PAIRING)
    assert result["interface_id"] == "101198"


def test_transform_pairing_row_normalizes_division_from_compositions():
    result = transform_pairing_row(RAW_PAIRING)
    assert result["division"] in ("P", "C")


def test_transform_pairing_row_derives_sch_str_from_duty_list():
    result = transform_pairing_row(RAW_PAIRING)
    assert result["sch_str_dt_utc"] == _dt("2026-03-01T10:00:00Z")


def test_transform_pairing_row_derives_sch_end_from_last_duty():
    result = transform_pairing_row(RAW_PAIRING)
    assert result["sch_end_dt_utc"] == _dt("2026-03-01T20:00:00Z")


def test_transform_pairing_row_accepts_snake_pairing_id_and_duties_key():
    raw = {
        "pairing_id": "55",
        "pairingDt": "2026-02-23 00:00:00",
        "label": "x",
        "base": "YYZ",
        "fleet": "737",
        "duration_days": 1,
        "pairingCompositions": [{"actingRank": "CA", "planValue": 1, "division": "P"}],
        "pairingDuties": [
            {
                "dutySeq": 1,
                "strArp": "YYZ",
                "arrArp": "YVR",
                "actStrDtUtc": "2026-03-01T08:00:00Z",
                "actEndDtUtc": "2026-03-01T18:00:00Z",
                "credit_min": 120,
                "assignment": "FLIGHT",
                "duty_id": 9,
            }
        ],
    }
    r = transform_pairing_row(raw)
    assert r["interface_id"] == "55"
    assert r["sch_str_dt_utc"] == _dt("2026-03-01T08:00:00Z")


def test_composition_division_respects_payload_or_rank():
    assert _composition_division({"actingRank": "FA", "division": "C"}) == "C"
    assert _composition_division({"actingRank": "CA"}) == "P"
    assert _composition_division({"actingRank": "FA"}) == "C"


def test_normalize_pairing_assignment_maps_all():
    assert normalize_pairing_assignment("FLIGHT") == "FLY"
    assert normalize_pairing_assignment("Reserve") == "SBY"
    assert normalize_pairing_assignment("Training") == "GRD"
    assert normalize_pairing_assignment("Transport") == "DHD"


def test_build_duty_nodes_generates_4_nodes_no_checkin():
    nodes = build_duty_nodes(DUTY)
    node_names = [n["node"] for n in nodes]
    assert node_names == ["PICKUP", "BRIEF", "DEBRIEF", "DROPOFF"]


def test_build_duty_nodes_with_checkin_uses_node_times():
    duty = dict(DUTY)
    duty["nodes"] = [
        {"node": "CheckIn", "startUtc": "2026-03-01T09:00:00Z", "endUtc": "2026-03-01T09:30:00Z", "airport": "YYZ"},
        {"node": "CheckOut", "startUtc": "2026-03-01T19:30:00Z", "endUtc": "2026-03-01T20:00:00Z", "airport": "YVR"},
    ]
    nodes = build_duty_nodes(duty)
    pickup = next(n for n in nodes if n["node"] == "PICKUP")
    assert pickup["start_utc"] == _dt("2026-03-01T09:00:00Z")


def test_duty_comments_maps_json_field():
    assert _duty_comments({"comments": "note"}) == "note"
    assert _duty_comments({}) == ""
    long_c = "x" * 300
    assert len(_duty_comments({"comments": long_c})) == 255


def test_segment_interface_flt_id_decimal_numeric_only():
    assert _segment_interface_flt_id_decimal({"fltId": 277074}) == 277074
    assert _segment_interface_flt_id_decimal({"fltId": "277074"}) == 277074
    assert _segment_interface_flt_id_decimal({"fltId": "F82612"}) is None
    assert _segment_interface_flt_id_decimal({"fltId": 0}) is None


def test_duty_credit_minutes_accepts_credited_minutes():
    assert _duty_credit_minutes({"creditedMinutes": 90}) == 90
    # legacy `creditMin` fallback removed — only creditedMinutes is honored now
    assert _duty_credit_minutes({"creditMin": 60}) == 0


def test_build_segment_flight_sby():
    seg = {
        "fltId": 0, "fltNum": "SBY001", "fltDt": "2026-03-01T00:00:00Z",
        "depArp": "YYZ", "arvArp": "YVR", "assignment": "SBY",
        "airline": "F8", "fleet": "737",
        "actStrDtUtc": "2026-03-01T10:00:00Z",
        "actEndDtUtc": "2026-03-01T14:00:00Z",
    }
    flight = build_segment_flight(seg)
    assert flight["flight_flag"] == "B"
    assert flight["flight_assignment"] == "SBY"
    assert flight["dep_arp"] == "YYZ"


def test_build_segment_flight_dh_and_fly():
    dh = {
        "fltId": 0, "fltNum": "F8999", "fltDt": "2026-03-01T00:00:00Z",
        "depArp": "YYZ", "arvArp": "YVR", "assignment": "DH",
        "airline": "F8", "fleet": "737",
        "actStrDtUtc": "2026-03-01T10:00:00Z", "actEndDtUtc": "2026-03-01T14:00:00Z",
    }
    f = build_segment_flight(dh)
    assert f["flight_flag"] == "D"
    assert f["flight_assignment"] == "DH"

    fly = dict(dh, assignment="FLY", fltId=277074)
    g = build_segment_flight(fly)
    assert g["flight_flag"] == "A"
    assert g["flight_assignment"] == "FLY"
    assert g["interface_flt_id"] == 277074