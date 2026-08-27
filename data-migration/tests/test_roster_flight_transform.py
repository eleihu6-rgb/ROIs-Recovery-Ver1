# tests/test_roster_flight_transform.py
from f8.roster_flight import (
    should_skip_record,
    build_roster_flight_warning,
)


def test_should_skip_when_pairing_id_zero():
    rec = {"pairingId": 0, "crew": {"crewId": "123"}}
    assert should_skip_record(rec) is True


def test_should_not_skip_when_pairing_id_nonzero():
    rec = {"pairingId": 12345, "crew": {"crewId": "123"}}
    assert should_skip_record(rec) is False


def test_warning_message_for_missing_pairing():
    msg = build_roster_flight_warning(
        roster_flight_id=2656138,
        reason="pairing",
        missing_id="99999",
    )
    assert "2656138" in msg
    assert "pairing" in msg
    assert "99999" in msg


def test_warning_message_for_missing_crew():
    msg = build_roster_flight_warning(
        roster_flight_id=2656139,
        reason="crew",
        missing_id="535",
    )
    assert "crew" in msg
    assert "535" in msg