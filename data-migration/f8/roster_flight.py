"""F8 roster_flight sync — derived from pairing_duty_segment × crew assignments.

For each unique (pairing, crew) found in the rosterFlight API, one roster record is
created/found and one roster_flight row is inserted per pairing_duty_segment of that
pairing.  This ensures roster_flight row count exactly matches the segment structure
of the pairing, regardless of API completeness.

Performance approach:
  - Group API records by (pairingId, crew_code) before any DB work.
  - Pre-load pairing / segment / roster lookup dicts once before batch loop.
  - Delete-range + bulk-insert instead of per-record idempotency SELECTs.
"""
import logging
from datetime import date as date_type, datetime
from typing import Any

from db.mysql import db_cursor, batch_nextval
from f8.client import f8_client
from f8.utils import chunk_date_range, normalize_rank, SyncResult, SyncTimer
from storage.json_store import JsonBatch
from config import settings

logger = logging.getLogger(__name__)

_COMMIT_BATCH = 200


def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    return datetime.fromisoformat(str(val).replace("Z", "+00:00").replace(" ", "T"))


def _map_flt_type(flt_type: str) -> str:
    if flt_type == "Transport":
        return "DHD"
    if flt_type == "Simulator":
        return "SIM"
    if flt_type == "":
        return "FLY"
    return "GND"


# ---------------------------------------------------------------------------
# Lookup pre-loading
# ---------------------------------------------------------------------------

def _load_pairing_lookup(cursor) -> dict[str, int]:
    """interface_id (str) → pairing.id (int)"""
    cursor.execute("SELECT id, interface_id FROM pairing WHERE interface_id IS NOT NULL AND interface_id != ''")
    return {str(r["interface_id"]): int(r["id"]) for r in cursor.fetchall()}


def _load_segment_lookup(cursor) -> dict[int, list[dict]]:
    """pairing_id → ordered list of pairing_duty_segment rows (duty_seq, seg_seq)."""
    cursor.execute(
        "SELECT id, pairing_id, pairing_duty_id, flt_id, flt_dt, flt_num, fleet "
        "FROM pairing_duty_segment "
        "ORDER BY pairing_id, duty_seq, seg_seq"
    )
    result: dict[int, list[dict]] = {}
    for r in cursor.fetchall():
        pid = int(r["pairing_id"])
        if pid not in result:
            result[pid] = []
        result[pid].append({
            "seg_id": int(r["id"]),
            "duty_id": int(r["pairing_duty_id"]),
            "flt_id": int(r["flt_id"]) if r["flt_id"] else 0,
            "flt_dt": r["flt_dt"].strftime("%Y-%m-%d") if hasattr(r["flt_dt"], "strftime") else str(r["flt_dt"] or "")[:10],
            "flt_num": str(r["flt_num"] or ""),
            "fleet": str(r["fleet"] or ""),
        })
    return result


def _load_roster_lookup(cursor) -> dict[tuple[int, str], int]:
    """(pairing.id, crew_id) → roster.id  — pre-loaded from existing DB rows."""
    cursor.execute("SELECT id, pairing_id, crew_id FROM roster")
    return {(int(r["pairing_id"]), str(r["crew_id"])): int(r["id"]) for r in cursor.fetchall()}


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------

def sync_roster_flight(start_dt: str, end_dt: str) -> SyncResult:
    timer = SyncTimer()
    timer.start()
    result = SyncResult("roster_flight")
    start = date_type.fromisoformat(start_dt)
    end = date_type.fromisoformat(end_dt)
    chunks = chunk_date_range(start, end, chunk_days=settings.sync_chunk_days)
    batch = JsonBatch("roster_flight")

    # --- Phase 1: fetch all data ---
    all_raw: list[dict] = []
    for chunk_start, chunk_end in chunks:
        raw = f8_client.get_roster_flight(chunk_start.isoformat(), chunk_end.isoformat())
        batch.save(raw, start_dt=chunk_start.isoformat(), end_dt=chunk_end.isoformat())
        all_raw.extend(raw)
    timer.fetch_end()

    # Skip records with pairingId == 0 (SIM/ground records with no pairing)
    valid_raw = [r for r in all_raw if int(r.get("pairingId", 0)) != 0]
    logger.info(
        "roster_flight: %d total fetched, %d with pairingId != 0",
        len(all_raw), len(valid_raw),
    )

    # Collect unique (pairing, crew) assignments — API may emit multiple records per crew/flight
    crew_assignments: dict[tuple[str, str], dict[str, Any]] = {}
    for rec in valid_raw:
        pairing_iid = str(rec.get("pairingId", ""))
        crew_data: dict[str, Any] = rec.get("crew") or {}
        crew_id = str(crew_data.get("crewId", rec.get("rosterId", "")))[:30]
        key = (pairing_iid, crew_id)
        if key not in crew_assignments:
            crew_assignments[key] = {
                "crew_id": crew_id,
                "live_id": int(rec.get("rosterId") or 0) or None,
                "acting_rank": normalize_rank(crew_data.get("actingRank", "")),
                "active_rank": normalize_rank(crew_data.get("activeRank", "")),
                "division": str(crew_data.get("division", "P"))[:2],
                "seq_order": min(int(crew_data.get("seqOrder") or 0), 999),
                "flt_type": str(rec.get("fltType", "")),
                "assignment_group": str(crew_data.get("assignmentGroup", "FLY"))[:20],
                "pairing_start_utc": _parse_dt(rec.get("pairingStrUtc")),
            }

    logger.info(
        "roster_flight: %d unique (pairing, crew) assignments",
        len(crew_assignments),
    )

    # --- Phase 2: pre-load all lookups in one DB round-trip ---
    with db_cursor() as (pre_cursor, _):
        pairing_lookup = _load_pairing_lookup(pre_cursor)
        segment_lookup = _load_segment_lookup(pre_cursor)
        roster_cache = _load_roster_lookup(pre_cursor)

    logger.info(
        "roster_flight lookups loaded — pairings=%d  pairings_with_segments=%d  rosters=%d",
        len(pairing_lookup), len(segment_lookup), len(roster_cache),
    )

    # --- Phase 3: delete date range + bulk insert ---
    timer.import_start()
    assignments_list = list(crew_assignments.items())

    for batch_offset in range(0, max(len(assignments_list), 1), _COMMIT_BATCH):
        assignment_batch = assignments_list[batch_offset: batch_offset + _COMMIT_BATCH]

        with db_cursor() as (cursor, conn):
            # Delete on first batch only
            if batch_offset == 0:
                cursor.execute(
                    "DELETE FROM roster_flight "
                    "WHERE flt_dt >= %s AND flt_dt < DATE_ADD(%s, INTERVAL 1 DAY)",
                    (start_dt, end_dt),
                )
                deleted_rf = cursor.rowcount
                cursor.execute(
                    "DELETE FROM roster WHERE id NOT IN "
                    "(SELECT DISTINCT roster_id FROM roster_flight)"
                )
                deleted_r = cursor.rowcount
                logger.info(
                    "roster_flight: deleted %d rf rows and %d orphan roster rows for %s~%s",
                    deleted_rf, deleted_r, start_dt, end_dt,
                )
                roster_cache.clear()
                _reload = _load_roster_lookup(cursor)
                roster_cache.update(_reload)

            if not assignment_batch:
                break

            # Pre-count total roster_flight rows needed so IDs can be batch-allocated
            total_rf_rows = sum(
                len(segment_lookup.get(pairing_lookup.get(pairing_iid, 0), []))
                for (pairing_iid, _), _ in assignment_batch
            )
            roster_ids = batch_nextval("ROSTER_SEQ", len(assignment_batch), cursor)
            rf_ids = batch_nextval("ROSTER_FLIGHT_SEQ", max(total_rf_rows, 1), cursor)

            rf_idx = 0
            for i, ((pairing_iid, crew_id), crew_info) in enumerate(assignment_batch):
                cursor.execute("SAVEPOINT rf_savepoint")
                try:
                    pairing_db_id = pairing_lookup.get(pairing_iid, 0)
                    if not pairing_db_id:
                        result.add_warning(
                            f"roster_flight: pairing {pairing_iid} not found, skipping crew {crew_id}"
                        )
                        cursor.execute("RELEASE SAVEPOINT rf_savepoint")
                        continue

                    segments = segment_lookup.get(pairing_db_id, [])
                    if not segments:
                        result.add_warning(
                            f"roster_flight: pairing {pairing_iid} (id={pairing_db_id}) "
                            f"has no segments, skipping crew {crew_id}"
                        )
                        cursor.execute("RELEASE SAVEPOINT rf_savepoint")
                        continue

                    # --- find or create roster (one per pairing × crew) ---
                    roster_key = (pairing_db_id, crew_id)
                    roster_db_id = roster_cache.get(roster_key)
                    if not roster_db_id:
                        roster_db_id = roster_ids[i]
                        cursor.execute(
                            """INSERT INTO roster
                               (id, ver, crew_id, pairing_id, label,
                                assignment_group, assignment, acting_rank,
                                source, is_requested, is_deleted, is_swapped,
                                live_id, scenario_id, created_by, created_dt, modified_by, last_modified)
                               VALUES (%s,0,%s,%s,'',%s,'FLY',%s,'F8',0,0,0,%s,0,%s,NOW(),%s,NOW())""",
                            (
                                roster_db_id, crew_info["crew_id"], pairing_db_id,
                                crew_info["assignment_group"],
                                crew_info["acting_rank"],
                                crew_info["live_id"],
                                settings.migration_modified_by,
                                settings.migration_modified_by,
                            ),
                        )
                        roster_cache[roster_key] = roster_db_id

                    # --- one roster_flight per pairing_duty_segment ---
                    rf_assignment = _map_flt_type(crew_info["flt_type"])
                    for seg in segments:
                        # When flt_id = 0 use seg_id as unique placeholder to avoid
                        # violating unq_roster_flight(flt_id, crew_id, scenario_id)
                        flt_db_id = seg["flt_id"] if seg["flt_id"] else seg["seg_id"]
                        cursor.execute(
                            """INSERT INTO roster_flight
                               (id, pairing_id, duty_id, roster_id, flt_id, flt_dt,
                                division, crew_id, acting_rank, active_rank,
                                assignment, seq_order, source,
                                flt_num, fleet, register, flt_sts,
                                pairing_start_utc,
                                scenario_id, created_by, created_dt, modified_by, last_modified)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'F8',%s,%s,'','',%s,0,%s,NOW(),%s,NOW())""",
                            (
                                rf_ids[rf_idx], pairing_db_id, seg["duty_id"],
                                roster_db_id, flt_db_id, seg["flt_dt"],
                                crew_info["division"], crew_info["crew_id"],
                                crew_info["acting_rank"], crew_info["active_rank"],
                                rf_assignment, crew_info["seq_order"],
                                seg["flt_num"], seg["fleet"],
                                crew_info["pairing_start_utc"],
                                settings.migration_modified_by,
                                settings.migration_modified_by,
                            ),
                        )
                        rf_idx += 1
                        result.imported += 1

                    cursor.execute("RELEASE SAVEPOINT rf_savepoint")

                except Exception as e:
                    cursor.execute("ROLLBACK TO SAVEPOINT rf_savepoint")
                    msg = f"roster_flight pairing={pairing_iid} crew={crew_id}: error — {e}"
                    logger.exception(msg)
                    result.add_warning(msg)

        logger.info(
            "roster_flight batch %d-%d / %d",
            batch_offset + 1,
            batch_offset + len(assignment_batch),
            len(assignments_list),
        )

    timer.import_end()
    timer.finish()
    timer.populate_result(result)
    timer.log(logger, "roster_flight", imported=result.imported)
    return result
