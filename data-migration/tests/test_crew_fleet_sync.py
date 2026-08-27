"""Tests for crew_fleet import against `fleet` master lookup."""
from unittest.mock import MagicMock

from f8.crew import _load_fleet_lookup


def test_load_fleet_lookup_normalizes_keys_and_truncates():
    cur = MagicMock()
    cur.fetchall.return_value = [
        {"fleet_code": "b738", "ac_type": "737-800", "fleet_grp": "B73x"},
    ]
    out = _load_fleet_lookup(cur)
    assert "B738" in out
    assert out["B738"][0] == "737-800"
    assert out["B738"][1] == "B73x"
    cur.execute.assert_called_once()


def test_load_fleet_lookup_tries_fallback_sql_on_first_failure():
    cur = MagicMock()
    cur.execute.side_effect = [Exception("no fleet col"), None]
    cur.fetchall.return_value = [{"fleet_code": "X", "ac_type": "A", "fleet_grp": "G"}]
    out = _load_fleet_lookup(cur)
    assert out["X"] == ("A", "G")
    assert cur.execute.call_count == 2
