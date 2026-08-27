"""F8 manday sync — daily crew manday stats, routed to crew_manday_fd (P) or crew_manday_cc_am (C/unknown)."""
import logging
from datetime import date as date_type, datetime

from db.mysql import db_cursor, batch_nextval
from f8.client import f8_client
from f8.utils import chunk_date_range, SyncResult, SyncTimer
from storage.json_store import JsonBatch
from config import settings

logger = logging.getLogger(__name__)

_COMMIT_BATCH = 500


def _parse_date_as_dt(val: str | None) -> datetime | None:
    """Parse 'YYYY-MM-DD' string into a midnight datetime for MySQL DATETIME columns."""
    if not val:
        return None
    try:
        return datetime.strptime(str(val)[:10], "%Y-%m-%d")
    except ValueError:
        return None


def _int0(val: object) -> int:
    try:
        return int(val) if val is not None else 0
    except (TypeError, ValueError):
        return 0


def _dec0(val: object) -> float:
    try:
        return float(val) if val is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _insert_fd(cursor, row_id: int, raw: dict) -> None:
    """Insert one record into crew_manday_fd (division P)."""
    cursor.execute(
        """INSERT INTO crew_manday_fd
           (id, scenario_id, crew_id, crew_base_dt,
            blh, fdp, dp, credit,
            updowns, cat2_updowns, exp_blh, quarantine,
            modified_by, last_modified)
           VALUES (%s,0,%s,%s,%s,%s,%s,%s,0,0,0,0,%s,NOW())""",
        (
            row_id,
            str(raw["crewId"])[:30],
            _parse_date_as_dt(raw.get("crewBaseDt")),
            _int0(raw.get("blh")),
            _int0(raw.get("fdp")),
            _int0(raw.get("dp")),
            _dec0(raw.get("credit")),
            settings.migration_modified_by,
        ),
    )


def _insert_cc_am(cursor, row_id: int, raw: dict) -> None:
    """Insert one record into crew_manday_cc_am (division C or unknown)."""
    cursor.execute(
        """INSERT INTO crew_manday_cc_am
           (id, scenario_id, crew_id, crew_base_dt,
            blh, fdp, dp, credit,
            quarantine, modified_by, last_modified)
           VALUES (%s,0,%s,%s,%s,%s,%s,%s,0,%s,NOW())""",
        (
            row_id,
            str(raw["crewId"])[:30],
            _parse_date_as_dt(raw.get("crewBaseDt")),
            _int0(raw.get("blh")),
            _int0(raw.get("fdp")),
            _int0(raw.get("dp")),
            _dec0(raw.get("credit")),
            settings.migration_modified_by,
        ),
    )


def _sync_table(
    table: str,
    seq_name: str,
    records: list[dict],
    start_dt: str,
    end_dt: str,
    result: SyncResult,
    insert_fn,
) -> None:
    """Delete date range then bulk-insert records into the given manday table."""
    for batch_offset in range(0, max(len(records), 1), _COMMIT_BATCH):
        raw_batch = records[batch_offset: batch_offset + _COMMIT_BATCH]

        with db_cursor() as (cursor, conn):
            if batch_offset == 0:
                cursor.execute(
                    f"DELETE FROM {table} "
                    "WHERE crew_base_dt >= %s AND crew_base_dt < DATE_ADD(%s, INTERVAL 1 DAY)",
                    (start_dt, end_dt),
                )
                logger.info(
                    "%s: deleted %d existing records for %s~%s",
                    table, cursor.rowcount, start_dt, end_dt,
                )

            if not raw_batch:
                break

            ids = batch_nextval(seq_name, len(raw_batch), cursor)

            for i, raw in enumerate(raw_batch):
                cursor.execute("SAVEPOINT md_savepoint")
                try:
                    insert_fn(cursor, ids[i], raw)
                    result.imported += 1
                    cursor.execute("RELEASE SAVEPOINT md_savepoint")
                except Exception as e:
                    cursor.execute("ROLLBACK TO SAVEPOINT md_savepoint")
                    msg = (
                        f"{table} crew={raw.get('crewId')} "
                        f"date={raw.get('crewBaseDt')}: {e}"
                    )
                    logger.warning(msg)
                    result.add_warning(msg)


def sync_manday(start_dt: str, end_dt: str) -> SyncResult:
    """Sync F8 manday data for the date range into crew_manday_fd (P) and crew_manday_cc_am (C).

    Crew division is resolved from the crew table.
    Crews not found in the crew table default to crew_manday_cc_am (per client spec).
    """
    timer = SyncTimer()
    timer.start()
    result = SyncResult("manday")
    start = date_type.fromisoformat(start_dt)
    end = date_type.fromisoformat(end_dt)
    chunks = chunk_date_range(start, end, chunk_days=settings.sync_chunk_days)
    batch = JsonBatch("manday")

    # --- Phase 1: fetch all data ---
    all_raw: list[dict] = []
    for chunk_start, chunk_end in chunks:
        start_utc = f"{chunk_start.isoformat()} 00:00:00"
        end_utc = f"{chunk_end.isoformat()} 23:59:59"
        raw = f8_client.get_manday(start_utc, end_utc)
        batch.save(raw, start_dt=chunk_start.isoformat(), end_dt=chunk_end.isoformat())
        all_raw.extend(raw)
        logger.info("manday: fetched %d records for %s~%s", len(raw), chunk_start, chunk_end)

    logger.info("manday: %d total records fetched", len(all_raw))
    timer.fetch_end()

    # --- Phase 2: resolve division and split by target table ---
    with db_cursor() as (c, _):
        c.execute("SELECT crew_id, division FROM crew")
        crew_division: dict[str, str] = {r["crew_id"]: r["division"] for r in c.fetchall()}

    fd_records: list[dict] = []
    cc_am_records: list[dict] = []
    unknown_crew_ids: set[str] = set()

    for raw in all_raw:
        crew_id = str(raw.get("crewId", ""))
        division = crew_division.get(crew_id)
        if division == "P":
            fd_records.append(raw)
        else:
            if division is None:
                unknown_crew_ids.add(crew_id)
            cc_am_records.append(raw)

    if unknown_crew_ids:
        result.add_warning(
            f"manday: {len(unknown_crew_ids)} crew(s) not found in crew table "
            f"(defaulted to crew_manday_cc_am): {sorted(unknown_crew_ids)[:20]}"
            + (" ..." if len(unknown_crew_ids) > 20 else "")
        )

    logger.info(
        "manday: routing P(fd)=%d  C/unknown(cc_am)=%d",
        len(fd_records), len(cc_am_records),
    )

    # --- Phase 3: delete + insert per table ---
    timer.import_start()
    _sync_table("crew_manday_fd", "CREW_MD_FD_SEQ", fd_records, start_dt, end_dt, result, _insert_fd)
    _sync_table("crew_manday_cc_am", "CREW_MD_CC_AM_SEQ", cc_am_records, start_dt, end_dt, result, _insert_cc_am)
    timer.import_end()
    timer.finish()
    timer.populate_result(result)
    timer.log(logger, "manday", imported=result.imported)

    return result
