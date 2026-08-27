"""F8 flight sync — direct FLY flights with UTC→YVR date conversion."""
import logging
from datetime import date, datetime, timedelta
from datetime import date as date_type
from typing import Any

from db.mysql import db_cursor, batch_nextval
from f8.client import f8_client
from f8.utils import chunk_date_range, normalize_interface_flt_id, SyncResult, SyncTimer
from storage.json_store import JsonBatch
from config import settings

logger = logging.getLogger(__name__)

# Per F8 policy: all date conversions use fixed UTC-7 offset for YVR local date.
YVR_OFFSET = timedelta(hours=7)

_COMMIT_BATCH = 500


def to_yvr_date(utc_dt: datetime) -> date:
    """Convert UTC datetime to YVR local date (UTC-7)."""
    return (utc_dt - YVR_OFFSET).date()


def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    return datetime.fromisoformat(val.replace("Z", "+00:00"))


def transform_flight_row(raw: dict[str, Any]) -> dict[str, Any]:
    std = _parse_dt(raw["std"])
    sta = _parse_dt(raw["sta"])
    atd = _parse_dt(raw.get("atd")) or std
    ata = _parse_dt(raw.get("ata")) or sta
    dat_op = _parse_dt(raw["datOp"])
    blk_min = int((sta - std).total_seconds() // 60) if std and sta else 0
    flt_dt = to_yvr_date(dat_op)
    interface_flt_id = normalize_interface_flt_id(raw.get("fltId"))
    if not interface_flt_id:
        raise ValueError("flight payload missing fltId")
    return {
        "flt_num": str(raw.get("fltNum", raw["legNo"])),
        "interface_flt_id": interface_flt_id,
        "flt_dt": flt_dt,
        "dep_arp": raw["depStn"],
        "arv_arp": raw["arrStn"],
        "sch_dep_dt_utc": std,
        "sch_arv_dt_utc": sta,
        "act_dep_dt_utc": atd,
        "act_arv_dt_utc": ata,
        "est_dep_dt_utc": _parse_dt(raw.get("etd")),
        "est_arv_dt_utc": _parse_dt(raw.get("eta")),
        "act_take_off_utc": _parse_dt(raw.get("toff")),
        "act_touch_down_utc": _parse_dt(raw.get("tdwn")),
        "act_dep_arp": raw["depStn"],
        "act_arv_arp": raw["arrStn"],
        "fleet": raw.get("acGrp", "") or "-",
        "register": raw.get("acReg", ""),
        "flight_flag": "A",
        "flight_assignment": "FLY",
        "airline": "F8",
        "ac_owner": "F8",
        "pilot_owner": "F8",
        "cabin_owner": "F8",
        "seg_type": raw.get("stc") or "J",
        "device_code": raw.get("divCode") or "",
        "flt_type": "S",
        "service_type": "S",
        "blk_min": blk_min,
    }


def _load_existing_flight_lookup(cursor) -> dict[str, int]:
    """interface_flt_id → flight.id — loaded once to avoid per-flight SELECT."""
    cursor.execute(
        "SELECT id, interface_flt_id FROM flight "
        "WHERE interface_flt_id IS NOT NULL AND interface_flt_id != ''"
    )
    return {str(r["interface_flt_id"]): int(r["id"]) for r in cursor.fetchall()}


def _upsert_flight(cursor, row: dict, new_id: int, existing_lookup: dict[str, int]) -> int:
    """Insert or update flight row; uses pre-loaded lookup to avoid SELECT."""
    existing_id = existing_lookup.get(row["interface_flt_id"])
    if existing_id:
        cursor.execute(
            """UPDATE flight SET flt_num=%s, dep_arp=%s, arv_arp=%s,
               sch_dep_dt_utc=%s, sch_arv_dt_utc=%s, act_dep_dt_utc=%s, act_arv_dt_utc=%s,
               est_dep_dt_utc=%s, est_arv_dt_utc=%s, act_take_off_utc=%s, act_touch_down_utc=%s,
               fleet=%s, register=%s, seg_type=%s, device_code=%s, blk_min=%s,
               modified_by=%s, last_modified=NOW() WHERE id=%s""",
            (row["flt_num"], row["dep_arp"], row["arv_arp"],
             row["sch_dep_dt_utc"], row["sch_arv_dt_utc"],
             row["act_dep_dt_utc"], row["act_arv_dt_utc"],
             row["est_dep_dt_utc"], row["est_arv_dt_utc"],
             row["act_take_off_utc"], row["act_touch_down_utc"],
             row["fleet"], row["register"], row["seg_type"], row["device_code"], row["blk_min"],
             settings.migration_modified_by, existing_id),
        )
        return existing_id
    cursor.execute(
        """INSERT INTO flight
           (id, flt_num, interface_flt_id, flt_dt, dep_arp, arv_arp,
            sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
            est_dep_dt_utc, est_arv_dt_utc, act_take_off_utc, act_touch_down_utc,
            act_dep_arp, act_arv_arp, fleet, register, device_code,
            flight_flag, flight_assignment, airline,
            ac_owner, pilot_owner, cabin_owner, seg_type, flt_type, service_type,
            blk_min, is_locked, sch_id,
            created_by, created_dt, modified_by, last_modified)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                   %s,0,0,%s,NOW(),%s,NOW())""",
        (new_id, row["flt_num"], row["interface_flt_id"], row["flt_dt"],
         row["dep_arp"], row["arv_arp"],
         row["sch_dep_dt_utc"], row["sch_arv_dt_utc"],
         row["act_dep_dt_utc"], row["act_arv_dt_utc"],
         row["est_dep_dt_utc"], row["est_arv_dt_utc"],
         row["act_take_off_utc"], row["act_touch_down_utc"],
         row["act_dep_arp"], row["act_arv_arp"],
         row["fleet"], row["register"], row["device_code"],
         row["flight_flag"], row["flight_assignment"], row["airline"],
         row["ac_owner"], row["pilot_owner"], row["cabin_owner"],
         row["seg_type"], row["flt_type"], row["service_type"],
         row["blk_min"],
         settings.migration_modified_by,
         settings.migration_modified_by),
    )
    existing_lookup[row["interface_flt_id"]] = new_id
    return new_id


def sync_flight(start_dt: str, end_dt: str) -> SyncResult:
    """Sync F8 flights within date range to flight table."""
    timer = SyncTimer()
    timer.start()
    result = SyncResult("flight")
    start = date_type.fromisoformat(start_dt)
    end = date_type.fromisoformat(end_dt)
    chunks = chunk_date_range(start, end, chunk_days=settings.sync_chunk_days)
    batch = JsonBatch("flight")

    all_raw: list[dict] = []
    for chunk_start, chunk_end in chunks:
        raw = f8_client.get_flight(chunk_start.isoformat(), chunk_end.isoformat())
        batch.save(raw, start_dt=chunk_start.isoformat(), end_dt=chunk_end.isoformat())
        all_raw.extend(raw)
    timer.fetch_end()

    # Pre-load existing flights once — eliminates per-flight SELECT in upsert
    with db_cursor() as (pre_cur, _):
        existing_lookup = _load_existing_flight_lookup(pre_cur)
    logger.info("flight: %d existing flights loaded, %d fetched from API", len(existing_lookup), len(all_raw))
    timer.import_start()

    for batch_offset in range(0, max(len(all_raw), 1), _COMMIT_BATCH):
        raw_batch = all_raw[batch_offset: batch_offset + _COMMIT_BATCH]

        with db_cursor() as (cursor, conn):
            if not raw_batch:
                break
            ids = batch_nextval("FLT_SEQ", len(raw_batch), cursor)
            for i, raw in enumerate(raw_batch):
                try:
                    row = transform_flight_row(raw)
                    _upsert_flight(cursor, row, ids[i], existing_lookup)
                    result.imported += 1
                except Exception as e:
                    msg = f"Flight {raw.get('fltId')}: {e}"
                    logger.warning(msg)
                    result.add_warning(msg)

        logger.info(
            "flight batch %d-%d / %d",
            batch_offset + 1,
            batch_offset + len(raw_batch),
            len(all_raw),
        )

    timer.import_end()
    timer.finish()
    timer.populate_result(result)
    timer.log(logger, "flight", imported=result.imported)
    return result
