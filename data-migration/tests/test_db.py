# tests/test_db.py
"""Tests for db/mysql.py module - MySQL connection layer with sequence ID generation."""
from unittest.mock import MagicMock
from db.mysql import nextval, batch_nextval


def _make_cursor(current_val: int):
    """Helper to create a mock cursor that returns a specific current_val."""
    cursor = MagicMock()
    cursor.fetchone.return_value = {"current_val": current_val}
    return cursor


class TestNextval:
    """Tests for the nextval function."""

    def test_nextval_executes_update_then_select(self):
        """Verify nextval performs UPDATE then SELECT in correct order."""
        cursor = _make_cursor(42)
        result = nextval("PAIRING_SEQ", cursor)
        assert result == 42
        assert cursor.execute.call_count == 2
        first_call_sql = cursor.execute.call_args_list[0][0][0]
        assert "UPDATE" in first_call_sql and "current_val" in first_call_sql

    def test_nextval_increments_by_one(self):
        """Verify nextval increments sequence by exactly 1."""
        cursor = _make_cursor(100)
        result = nextval("TEST_SEQ", cursor)
        assert result == 100
        # Verify UPDATE uses +1 increment
        update_call = cursor.execute.call_args_list[0]
        assert update_call[0][1] == ("TEST_SEQ",)  # params tuple

    def test_nextval_select_returns_current_val(self):
        """Verify nextval SELECT query retrieves current_val field."""
        cursor = _make_cursor(55)
        result = nextval("MY_SEQ", cursor)
        assert result == 55
        second_call = cursor.execute.call_args_list[1]
        assert "SELECT current_val" in second_call[0][0]
        assert cursor.fetchone.called


class TestBatchNextval:
    """Tests for the batch_nextval function."""

    def test_batch_nextval_returns_correct_range(self):
        """Verify batch_nextval returns correct range of IDs."""
        cursor = _make_cursor(105)  # end val after +5
        ids = batch_nextval("FLT_SEQ", 5, cursor)
        assert ids == [101, 102, 103, 104, 105]

    def test_batch_nextval_single(self):
        """Verify batch_nextval with n=1 returns single-element list."""
        cursor = _make_cursor(10)
        ids = batch_nextval("CREW_SEQ", 1, cursor)
        assert ids == [10]

    def test_batch_nextval_increments_by_n(self):
        """Verify batch_nextval increments sequence by n."""
        cursor = _make_cursor(200)
        ids = batch_nextval("BIG_SEQ", 50, cursor)
        assert ids == list(range(151, 201))  # 151 to 200 inclusive
        assert len(ids) == 50

    def test_batch_nextval_update_params_order(self):
        """Verify batch_nextval UPDATE params are (n, seq_name) in correct order."""
        cursor = _make_cursor(30)
        ids = batch_nextval("SEQ", 10, cursor)
        update_call = cursor.execute.call_args_list[0]
        assert update_call[0][1] == (10, "SEQ")  # (n, seq_name)

    def test_batch_nextval_large_batch(self):
        """Verify batch_nextval works with large batch size."""
        cursor = _make_cursor(1000)
        ids = batch_nextval("LARGE_SEQ", 500, cursor)
        assert ids == list(range(501, 1001))
        assert len(ids) == 500