from datetime import date, datetime, timezone

import pytest

from f8.live_pairing_month_copy import (
    LivePairingMonthCopyTool,
    PairingMonthCopyResult,
    add_months,
    build_insert_sql,
    month_delta,
    quote_identifier,
    shift_row_dates,
)


def test_quote_identifier_allows_safe_schema_names():
    assert quote_identifier("f8_sit_live") == '"f8_sit_live"'


def test_quote_identifier_rejects_unsafe_schema_names():
    with pytest.raises(ValueError):
        quote_identifier("f8;drop schema public")


def test_month_delta_supports_forward_and_backward_targets():
    assert month_delta("2026-05", "2026-06") == 1
    assert month_delta("2026-12", "2027-02") == 2
    assert month_delta("2026-06", "2026-05") == -1


def test_add_months_clamps_end_of_month_and_preserves_time():
    value = datetime(2026, 1, 31, 8, 35, tzinfo=timezone.utc)
    shifted = add_months(value, 1)
    assert shifted == datetime(2026, 2, 28, 8, 35, tzinfo=timezone.utc)


def test_add_months_handles_date_values():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)


def test_shift_row_dates_only_shifts_named_columns():
    row = {
        "sch_str_dt_utc": datetime(2026, 5, 12, 8, 35, tzinfo=timezone.utc),
        "pairing_label": "M1234",
    }
    shifted = shift_row_dates(row, {"sch_str_dt_utc"}, 1)
    assert shifted["sch_str_dt_utc"] == datetime(2026, 6, 12, 8, 35, tzinfo=timezone.utc)
    assert shifted["pairing_label"] == "M1234"


def test_build_insert_sql_quotes_columns_and_returns_id():
    assert build_insert_sql("f8_sit_live", "pairing", ("pairing_label", "sch_str_dt_utc")) == (
        'INSERT INTO "f8_sit_live"."pairing" ("pairing_label", "sch_str_dt_utc") VALUES (%s, %s) RETURNING id'
    )


class FakeCursor:
    def __init__(self, results):
        self.results = list(results)
        self.queries = []
        self.description = None
        self._rows = []

    def execute(self, query, params=()):
        self.queries.append((query, params))
        rows = self.results.pop(0)
        if rows:
            self.description = [(key,) for key in rows[0].keys()]
            self._rows = [tuple(row.values()) for row in rows]
        else:
            self.description = []
            self._rows = []

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0]

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self):
        self.cursor_obj = FakeCursor([])
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


class NoopCopyTool(LivePairingMonthCopyTool):
    def _copy_with_cursor(self, cursor, result, months):
        result.source_pairings = 0


def test_resolve_target_flight_matches_by_requested_key():
    cursor = FakeCursor([[{"id": 42}]])
    result = PairingMonthCopyResult("f8_sit_live", "2026-05", "2026-06", dry_run=True)
    segment = {
        "airline": "F8",
        "flt_num": "123",
        "dep_arp": "YVR",
        "arv_arp": "YYZ",
        "sch_str_dt_utc": datetime(2026, 6, 12, 8, 35, tzinfo=timezone.utc),
    }

    flight_id = LivePairingMonthCopyTool()._resolve_target_flight(cursor, "f8_sit_live", segment, result)

    assert flight_id == 42
    assert result.matched_flights == 1
    assert cursor.queries[0][1] == (
        "F8",
        "123",
        "YVR",
        "YYZ",
        datetime(2026, 6, 12, 8, 35, tzinfo=timezone.utc),
    )


def test_copy_month_uses_plain_dbapi_cursor_and_rolls_back_dry_run():
    connection = FakeConnection()

    result = NoopCopyTool().copy_month(
        schema="f8_sit_live",
        source_month="2026-08",
        target_month="2026-09",
        dry_run=True,
        connection=connection,
    )

    assert result.ok
    assert connection.rolled_back
    assert not connection.committed
    assert connection.cursor_obj.closed
    assert not connection.closed


def test_resolve_target_flight_dry_run_counts_created_flight_when_missing():
    cursor = FakeCursor([[]])
    result = PairingMonthCopyResult("f8_sit_live", "2026-05", "2026-06", dry_run=True)
    segment = {
        "airline": "F8",
        "flt_num": "123",
        "dep_arp": "YVR",
        "arv_arp": "YYZ",
        "sch_str_dt_utc": datetime(2026, 6, 12, 8, 35, tzinfo=timezone.utc),
    }

    flight_id = LivePairingMonthCopyTool()._resolve_target_flight(cursor, "f8_sit_live", segment, result)

    assert flight_id == 0
    assert result.created_flights == 1


def test_resolve_target_flight_rejects_ambiguous_matches():
    cursor = FakeCursor([[{"id": 42}, {"id": 43}]])
    result = PairingMonthCopyResult("f8_sit_live", "2026-05", "2026-06", dry_run=True)
    segment = {
        "airline": "F8",
        "flt_num": "123",
        "dep_arp": "YVR",
        "arv_arp": "YYZ",
        "sch_str_dt_utc": datetime(2026, 6, 12, 8, 35, tzinfo=timezone.utc),
    }

    flight_id = LivePairingMonthCopyTool()._resolve_target_flight(cursor, "f8_sit_live", segment, result)

    assert flight_id == 0
    assert result.ambiguous_flights


def test_copy_compositions_resets_fill_to_zero():
    cursor = FakeCursor(
        [
            [
                {
                    "id": 1,
                    "pairing_id": 100,
                    "division": "P",
                    "is_deleted": 0,
                    "acting_rank": "CA",
                    "plan": 1,
                    "fill": 1,
                }
            ],
            [{"id": 2}],
        ]
    )
    result = PairingMonthCopyResult("f8_sit_live", "2026-05", "2026-06", dry_run=False)
    columns = ("pairing_id", "division", "is_deleted", "acting_rank", "plan", "fill")

    LivePairingMonthCopyTool()._copy_compositions(cursor, "f8_sit_live", 100, 200, columns, result)

    insert_params = cursor.queries[1][1]
    assert insert_params == [200, "P", 0, "CA", 1, 0]
    assert result.copied_compositions == 1


def test_duplicate_detection_uses_preexisting_target_pairings_only():
    tool = LivePairingMonthCopyTool()
    first = {
        "pairing_label": "M100",
        "base": "YVR",
        "division": "P",
        "sch_str_dt_utc": datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc),
    }
    second = dict(first)
    preexisting = {}

    assert preexisting.get(tool._duplicate_key(first)) is None
    assert preexisting.get(tool._duplicate_key(second)) is None
