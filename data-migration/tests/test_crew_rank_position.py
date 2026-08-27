"""Tests for rank_position -> crew_rank.position mapping."""
from unittest.mock import MagicMock

from f8.crew import _load_rank_position_lookup


def test_load_rank_position_lookup_first_display_order_wins():
    cur = MagicMock()
    cur.fetchall.return_value = [
        {"rank": "CA", "position": "PIC", "display_order": 1},
        {"rank": "CA", "position": "OBS", "display_order": 99},
        {"rank": "FO", "position": "SIC", "display_order": 2},
    ]
    out = _load_rank_position_lookup(cur)
    assert out["CA"] == "PIC"
    assert out["FO"] == "SIC"


def test_load_rank_position_lookup_uppercases_rank_key():
    cur = MagicMock()
    cur.fetchall.return_value = [{"rank": "fa", "position": "FA", "display_order": 1}]
    out = _load_rank_position_lookup(cur)
    assert out["FA"] == "FA"
