"""Copy live PostgreSQL pairing data from one month to another."""
from __future__ import annotations

import calendar
import re
import os
import argparse
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Iterable, Sequence
from urllib.parse import unquote, urlparse


_SAFE_IDENTIFIER = re.compile(r"^[a-z][a-z0-9_]*$")

PAIRING_SHIFT_COLUMNS = frozenset(
    {
        "sch_str_dt_utc",
        "sch_end_dt_utc",
        "act_str_dt_utc",
        "act_end_dt_utc",
        "pairing_dt",
    }
)
SEGMENT_SHIFT_COLUMNS = frozenset(
    {
        "duty_sch_str_dt_utc",
        "duty_sch_end_dt_utc",
        "duty_act_str_dt_utc",
        "duty_act_end_dt_utc",
        "flt_dt",
        "act_str_dt_utc",
        "act_end_dt_utc",
        "sch_str_dt_utc",
        "sch_end_dt_utc",
        "pickup_start_utc",
        "pickup_end_utc",
        "brief_start_utc",
        "brief_end_utc",
        "debrief_start_utc",
        "debrief_end_utc",
        "dropoff_start_utc",
        "dropoff_end_utc",
        "double_pickup_start_utc",
        "double_pickup_end_utc",
        "double_brief_start_utc",
        "double_brief_end_utc",
        "double_debrief_start_utc",
        "double_debrief_end_utc",
        "double_dropoff_start_utc",
        "double_dropoff_end_utc",
    }
)


@dataclass(frozen=True)
class TableColumns:
    insertable: tuple[str, ...]


@dataclass
class PairingMonthCopyResult:
    schema: str
    source_month: str
    target_month: str
    dry_run: bool
    source_pairings: int = 0
    copied_pairings: int = 0
    copied_segments: int = 0
    copied_compositions: int = 0
    matched_flights: int = 0
    created_flights: int = 0
    duplicate_pairings: list[str] = field(default_factory=list)
    ambiguous_flights: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.duplicate_pairings and not self.ambiguous_flights and not self.errors

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "source_month": self.source_month,
            "target_month": self.target_month,
            "dry_run": self.dry_run,
            "source_pairings": self.source_pairings,
            "copied_pairings": self.copied_pairings,
            "copied_segments": self.copied_segments,
            "copied_compositions": self.copied_compositions,
            "matched_flights": self.matched_flights,
            "created_flights": self.created_flights,
            "duplicate_pairings": self.duplicate_pairings,
            "ambiguous_flights": self.ambiguous_flights,
            "errors": self.errors,
            "ok": self.ok,
        }


def quote_identifier(identifier: str) -> str:
    if not _SAFE_IDENTIFIER.fullmatch(identifier):
        raise ValueError(f"Unsafe SQL identifier: {identifier!r}")
    return f'"{identifier}"'


def qualified(schema: str, table: str) -> str:
    return f"{quote_identifier(schema)}.{quote_identifier(table)}"


def parse_month(month: str) -> datetime:
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        raise ValueError("Month must use YYYY-MM format")
    year, month_num = (int(part) for part in month.split("-"))
    if month_num < 1 or month_num > 12:
        raise ValueError("Month must be between 01 and 12")
    return datetime(year, month_num, 1, tzinfo=timezone.utc)


def month_delta(source_month: str, target_month: str) -> int:
    source = parse_month(source_month)
    target = parse_month(target_month)
    return (target.year - source.year) * 12 + (target.month - source.month)


def add_months(value: date | datetime | None, months: int) -> date | datetime | None:
    if value is None:
        return None
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def shift_row_dates(row: dict[str, Any], shift_columns: Iterable[str], months: int) -> dict[str, Any]:
    shifted = dict(row)
    for column in shift_columns:
        if column in shifted:
            shifted[column] = add_months(shifted[column], months)
    return shifted


def _dict_rows(cursor: Any) -> list[dict[str, Any]]:
    names = [desc[0] for desc in cursor.description or []]
    return [dict(zip(names, row, strict=False)) for row in cursor.fetchall()]


def _execute_dicts(cursor: Any, query: str, params: Sequence[Any] = ()) -> list[dict[str, Any]]:
    cursor.execute(query, params)
    return _dict_rows(cursor)


def _execute_one_dict(cursor: Any, query: str, params: Sequence[Any] = ()) -> dict[str, Any] | None:
    rows = _execute_dicts(cursor, query, params)
    return rows[0] if rows else None


def build_insert_sql(schema: str, table: str, columns: Sequence[str]) -> str:
    if not columns:
        raise ValueError("Cannot build INSERT without columns")
    column_sql = ", ".join(quote_identifier(column) for column in columns)
    placeholders = ", ".join(["%s"] * len(columns))
    return f"INSERT INTO {qualified(schema, table)} ({column_sql}) VALUES ({placeholders}) RETURNING id"


def _connect_pg8000(database_url: str) -> Any:
    try:
        import pg8000.dbapi  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - exercised only without optional dependency
        raise RuntimeError("Install data-migration requirements to use PostgreSQL copy tooling") from exc

    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgresql", "postgres"}:
        raise ValueError("database_url must be a PostgreSQL DSN")
    kwargs: dict[str, Any] = {
        "host": parsed.hostname,
        "port": parsed.port or 5432,
        "database": parsed.path.lstrip("/"),
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
    }
    return pg8000.dbapi.connect(**kwargs)


class LivePairingMonthCopyTool:
    """Copy live pairing rows across months in one PostgreSQL schema."""

    def __init__(self, actor: str = "data-migration") -> None:
        self.actor = actor

    def copy_month(
        self,
        schema: str,
        source_month: str,
        target_month: str,
        dry_run: bool = True,
        database_url: str | None = None,
        connection: Any | None = None,
    ) -> PairingMonthCopyResult:
        quote_identifier(schema)
        months = month_delta(source_month, target_month)
        if months == 0:
            raise ValueError("source_month and target_month must be different")

        owns_connection = connection is None
        conn = connection or _connect_pg8000(database_url or "")
        result = PairingMonthCopyResult(schema, source_month, target_month, dry_run)
        cursor = None
        try:
            cursor = conn.cursor()
            self._copy_with_cursor(cursor, result, months)
            if dry_run or not result.ok:
                conn.rollback()
            else:
                conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            if cursor is not None:
                cursor.close()
            if owns_connection:
                conn.close()
        return result

    def _copy_with_cursor(self, cursor: Any, result: PairingMonthCopyResult, months: int) -> None:
        schema = result.schema
        source_start = parse_month(result.source_month)
        source_end = add_months(source_start, 1)
        target_start = parse_month(result.target_month)
        target_end = add_months(target_start, 1)

        pairing_columns = self._table_columns(cursor, schema, "pairing")
        segment_columns = self._table_columns(cursor, schema, "pairing_segment")
        composition_columns = self._table_columns(cursor, schema, "pairing_composition")

        pairings = _execute_dicts(
            cursor,
            f"""
            SELECT *
            FROM {qualified(schema, "pairing")}
            WHERE scenario_id = 0
              AND is_deleted = 0
              AND sch_str_dt_utc >= %s
              AND sch_str_dt_utc < %s
            ORDER BY sch_str_dt_utc, id
            """,
            (source_start, source_end),
        )
        result.source_pairings = len(pairings)
        existing_target_pairings = self._load_existing_target_pairings(cursor, schema, target_start, target_end)

        for pairing in pairings:
            shifted_pairing = self._prepare_pairing_row(pairing, pairing_columns.insertable, months)
            duplicate_id = existing_target_pairings.get(self._duplicate_key(shifted_pairing))
            if duplicate_id:
                result.duplicate_pairings.append(
                    f"source pairing {pairing['id']} duplicates target pairing {duplicate_id}"
                )
                continue

            new_pairing_id = int(pairing["id"])
            if not result.dry_run:
                new_pairing_id = self._insert_row(cursor, schema, "pairing", shifted_pairing, pairing_columns.insertable)
            result.copied_pairings += 1

            self._copy_compositions(
                cursor,
                schema,
                int(pairing["id"]),
                new_pairing_id,
                composition_columns.insertable,
                result,
            )
            self._copy_segments(
                cursor,
                schema,
                int(pairing["id"]),
                new_pairing_id,
                segment_columns.insertable,
                months,
                result,
            )

    def _table_columns(self, cursor: Any, schema: str, table: str) -> TableColumns:
        rows = _execute_dicts(
            cursor,
            """
            SELECT column_name, identity_generation, generation_expression
            FROM information_schema.columns
            WHERE table_schema = %s
              AND table_name = %s
            ORDER BY ordinal_position
            """,
            (schema, table),
        )
        if not rows:
            raise ValueError(f"Table {schema}.{table} was not found")
        excluded = {"id", "open"}
        columns = []
        for row in rows:
            column = str(row["column_name"])
            if column in excluded:
                continue
            if row.get("identity_generation"):
                continue
            if row.get("generation_expression"):
                continue
            columns.append(column)
        return TableColumns(tuple(columns))

    def _prepare_pairing_row(
        self, pairing: dict[str, Any], insertable_columns: Sequence[str], months: int
    ) -> dict[str, Any]:
        row = shift_row_dates(pairing, PAIRING_SHIFT_COLUMNS, months)
        row["interface_id"] = None
        row["source"] = row.get("source") or "IMPORT"
        return self._prepare_insert_values(row, insertable_columns)

    def _prepare_insert_values(self, row: dict[str, Any], insertable_columns: Sequence[str]) -> dict[str, Any]:
        prepared = {column: row.get(column) for column in insertable_columns}
        if "created_by" in prepared:
            prepared["created_by"] = self.actor
        if "updated_by" in prepared:
            prepared["updated_by"] = self.actor
        if "created_at" in prepared:
            prepared.pop("created_at")
        if "updated_at" in prepared:
            prepared.pop("updated_at")
        return prepared

    def _duplicate_key(self, row: dict[str, Any]) -> tuple[Any, ...]:
        return (
            row.get("pairing_label"),
            row.get("base"),
            row.get("division"),
            row.get("sch_str_dt_utc"),
        )

    def _load_existing_target_pairings(
        self, cursor: Any, schema: str, target_start: datetime, target_end: date | datetime | None
    ) -> dict[tuple[Any, ...], int]:
        rows = _execute_dicts(
            cursor,
            f"""
            SELECT id, pairing_label, base, division, sch_str_dt_utc
            FROM {qualified(schema, "pairing")}
            WHERE scenario_id = 0
              AND is_deleted = 0
              AND sch_str_dt_utc >= %s
              AND sch_str_dt_utc < %s
            """,
            (target_start, target_end),
        )
        return {self._duplicate_key(row): int(row["id"]) for row in rows}

    def _insert_row(
        self, cursor: Any, schema: str, table: str, row: dict[str, Any], columns: Sequence[str]
    ) -> int:
        active_columns = [column for column in columns if column in row]
        cursor.execute(build_insert_sql(schema, table, active_columns), [row[column] for column in active_columns])
        inserted = cursor.fetchone()
        return int(inserted[0])

    def _copy_compositions(
        self,
        cursor: Any,
        schema: str,
        source_pairing_id: int,
        new_pairing_id: int,
        columns: Sequence[str],
        result: PairingMonthCopyResult,
    ) -> None:
        rows = _execute_dicts(
            cursor,
            f"SELECT * FROM {qualified(schema, 'pairing_composition')} WHERE pairing_id = %s ORDER BY id",
            (source_pairing_id,),
        )
        for row in rows:
            prepared = self._prepare_insert_values(row, columns)
            prepared["pairing_id"] = new_pairing_id
            prepared["fill"] = 0
            if not result.dry_run:
                self._insert_row(cursor, schema, "pairing_composition", prepared, columns)
            result.copied_compositions += 1

    def _copy_segments(
        self,
        cursor: Any,
        schema: str,
        source_pairing_id: int,
        new_pairing_id: int,
        columns: Sequence[str],
        months: int,
        result: PairingMonthCopyResult,
    ) -> None:
        rows = _execute_dicts(
            cursor,
            f"SELECT * FROM {qualified(schema, 'pairing_segment')} WHERE pairing_id = %s ORDER BY duty_seq, seg_seq, id",
            (source_pairing_id,),
        )
        for row in rows:
            shifted = shift_row_dates(row, SEGMENT_SHIFT_COLUMNS, months)
            prepared = self._prepare_insert_values(shifted, columns)
            prepared["pairing_id"] = new_pairing_id
            flight_id = self._resolve_target_flight(cursor, schema, prepared, result)
            prepared["flt_id"] = flight_id
            if not result.dry_run:
                self._insert_row(cursor, schema, "pairing_segment", prepared, columns)
            result.copied_segments += 1

    def _resolve_target_flight(
        self, cursor: Any, schema: str, segment: dict[str, Any], result: PairingMonthCopyResult
    ) -> int:
        rows = _execute_dicts(
            cursor,
            f"""
            SELECT id
            FROM {qualified(schema, "flight")}
            WHERE scenario_id = 0
              AND is_deleted = 0
              AND airline = %s
              AND flt_num = %s
              AND dep_arp = %s
              AND arv_arp = %s
              AND sch_dep_dt_utc = %s
            ORDER BY id
            """,
            (
                segment.get("airline"),
                segment.get("flt_num"),
                segment.get("dep_arp"),
                segment.get("arv_arp"),
                segment.get("sch_str_dt_utc"),
            ),
        )
        if len(rows) == 1:
            result.matched_flights += 1
            return int(rows[0]["id"])
        if len(rows) > 1:
            result.ambiguous_flights.append(
                f"{segment.get('airline')} {segment.get('flt_num')} "
                f"{segment.get('dep_arp')}-{segment.get('arv_arp')} {segment.get('sch_str_dt_utc')}"
            )
            return 0
        result.created_flights += 1
        if result.dry_run:
            return 0
        return self._create_flight_from_segment(cursor, schema, segment)

    def _create_flight_from_segment(self, cursor: Any, schema: str, segment: dict[str, Any]) -> int:
        sch_str = segment.get("sch_str_dt_utc")
        sch_end = segment.get("sch_end_dt_utc")
        act_str = segment.get("act_str_dt_utc") or sch_str
        act_end = segment.get("act_end_dt_utc") or sch_end
        blk_min = 0
        if isinstance(sch_str, datetime) and isinstance(sch_end, datetime):
            blk_min = max(0, round((sch_end - sch_str).total_seconds() / 60))
        flt_dt = segment.get("flt_dt")
        if flt_dt is None and isinstance(sch_str, datetime):
            flt_dt = sch_str.date()
        row = {
            "created_by": self.actor,
            "updated_by": self.actor,
            "scenario_id": 0,
            "airline": segment.get("airline"),
            "flt_dt": flt_dt,
            "flt_num": segment.get("flt_num"),
            "dep_arp": segment.get("dep_arp"),
            "arv_arp": segment.get("arv_arp"),
            "sch_dep_dt_utc": sch_str,
            "sch_arv_dt_utc": sch_end,
            "act_dep_dt_utc": act_str,
            "act_arv_dt_utc": act_end,
            "act_dep_arp": segment.get("dep_arp"),
            "act_arv_arp": segment.get("arv_arp"),
            "flight_flag": "A",
            "flight_assignment": segment.get("seg_assignment"),
            "blk_min": blk_min,
            "fleet": segment.get("fleet_seg") or "-",
            "flt_type": "PAX",
            "interface_flt_id": None,
            "is_deleted": 0,
        }
        columns = tuple(row.keys())
        return self._insert_row(cursor, schema, "flight", row, columns)


def _main() -> None:
    parser = argparse.ArgumentParser(description="Copy live PostgreSQL pairing data between months.")
    parser.add_argument("--database-url", default=os.environ.get("LIVE_DATABASE_URL") or os.environ.get("DATABASE_URL"))
    parser.add_argument("--schema", required=True)
    parser.add_argument("--source-month", required=True, help="YYYY-MM")
    parser.add_argument("--target-month", required=True, help="YYYY-MM")
    parser.add_argument("--execute", action="store_true", help="Write changes. Defaults to dry-run rollback.")
    args = parser.parse_args()
    if not args.database_url:
        raise SystemExit("Set --database-url or LIVE_DATABASE_URL/DATABASE_URL")
    result = LivePairingMonthCopyTool().copy_month(
        database_url=args.database_url,
        schema=args.schema,
        source_month=args.source_month,
        target_month=args.target_month,
        dry_run=not args.execute,
    )
    print(result.to_dict())
    if not result.ok:
        raise SystemExit(1)


if __name__ == "__main__":
    _main()
