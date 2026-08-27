"""F8 roster_ground sync — fetches all assignment types and replaces by date range.

"Flight" assignment is special-cased: records with pairingId>0 belong to real
pairings (handled by the pairing/rosterFlight syncs) and are ignored here; records
with pairingId==0 are single-leg assignments that get materialized into a synthetic
pairing + roster + roster_flight instead of a roster_ground row.
"""
import logging
from datetime import date as date_type, datetime, timedelta
from typing import Any

from db.mysql import db_cursor, batch_nextval, nextval
from f8.client import f8_client
from f8.utils import (
    ALL_ROSTER_GROUND_ASSIGNMENTS,
    chunk_date_range,
    fetch_with_chunk_retry,
    normalize_roster_ground_assignment,
    SyncResult,
    SyncTimer,
)
from config import settings

logger = logging.getLogger(__name__)

_COMMIT_BATCH = 500


def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    return datetime.fromisoformat(str(val).replace("Z", "+00:00").replace(" ", "T"))


def _parse_credit(raw: dict[str, Any]) -> float | None:
    """Extract credited minutes from rosterGround record (creditedMinutes or credit)."""
    val = raw.get("creditedMinutes") if raw.get("creditedMinutes") is not None else raw.get("credit")
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def sync_roster_ground(start_dt: str, end_dt: str) -> SyncResult:
    """Replace roster_ground records for the date range across all assignment types.

    Fetch order: all 12 assignment types are fetched first, then the DB is updated
    in one pass — delete by date range, then bulk insert.

    Dedup: records starting before start_dt (cross-midnight boundary) are checked
    via an in-memory set instead of per-record SELECT queries.
    """
    timer = SyncTimer()
    timer.start()
    result = SyncResult("roster_ground")
    start = date_type.fromisoformat(start_dt)
    end = date_type.fromisoformat(end_dt)

    # --- Phase 1: fetch all assignment types (Unknown excluded) ---
    all_raw: list[dict] = []              # non-Flight ground records → roster_ground table
    single_leg_flights: list[dict] = []   # Flight pairingId==0 → roster/roster_flight
    ignored_paired_flights = 0            # Flight pairingId>0 → ignored
    for assignment_type in ALL_ROSTER_GROUND_ASSIGNMENTS:
        chunks = chunk_date_range(start, end, chunk_days=settings.sync_chunk_days)
        type_raw: list[dict] = []
        for chunk_start, chunk_end in chunks:
            raw = fetch_with_chunk_retry(
                f8_client.get_roster_ground,
                chunk_start, chunk_end,
                assignment=assignment_type,
            )
            type_raw.extend(raw)
        if assignment_type == "Flight":
            for r in type_raw:
                if int(r.get("pairingId", 0) or 0) == 0:
                    single_leg_flights.append(r)
                else:
                    ignored_paired_flights += 1
            logger.info(
                "roster_ground Flight: %d single-leg (pairingId=0), %d ignored (pairingId>0)",
                len(single_leg_flights), ignored_paired_flights,
            )
        else:
            all_raw.extend(type_raw)
            logger.info("roster_ground %s: fetched %d records", assignment_type, len(type_raw))

    logger.info("roster_ground: %d ground records (non-Flight) fetched", len(all_raw))
    timer.fetch_end()

    # existing_set: (crew_id, str_dt_naive, end_dt_naive, assignment) for O(1) dedup.
    # Populated after the first-batch DELETE from boundary records that weren't cleared.
    existing_set: set[tuple] = set()

    # --- Phase 2: delete date range + bulk insert ---
    timer.import_start()
    for batch_offset in range(0, max(len(all_raw), 1), _COMMIT_BATCH):
        raw_batch = all_raw[batch_offset: batch_offset + _COMMIT_BATCH]

        with db_cursor() as (cursor, conn):
            # Delete on first batch only
            if batch_offset == 0:
                cursor.execute(
                    "DELETE FROM roster_ground WHERE str_dt_utc >= %s AND str_dt_utc < DATE_ADD(%s, INTERVAL 1 DAY)",
                    (start_dt, end_dt),
                )
                deleted = cursor.rowcount
                logger.info("roster_ground: deleted %d existing records for %s~%s", deleted, start_dt, end_dt)

                # Load boundary records (str_dt_utc < start_dt) not deleted above.
                # These are cross-midnight activities that might also appear in the API response.
                cursor.execute(
                    "SELECT crew_id, str_dt_utc, end_dt_utc, assignment FROM roster_ground "
                    "WHERE str_dt_utc < %s",
                    (start_dt,),
                )
                existing_set = {
                    (str(r["crew_id"]), r["str_dt_utc"], r["end_dt_utc"], str(r["assignment"]))
                    for r in cursor.fetchall()
                }
                logger.info("roster_ground: %d boundary records loaded for dedup", len(existing_set))

            if not raw_batch:
                break

            ids = batch_nextval("ROSTER_GROUND_SEQ", len(raw_batch), cursor)

            for i, raw in enumerate(raw_batch):
                cursor.execute("SAVEPOINT rg_savepoint")
                try:
                    crew_id = str(raw.get("crewId", ""))[:30]
                    if not crew_id:
                        result.add_warning(
                            f"roster_ground: missing crewId, skipping "
                            f"({raw.get('assignment')} {raw.get('startTimeUtc')})"
                        )
                        cursor.execute("ROLLBACK TO SAVEPOINT rg_savepoint")
                        continue

                    str_dt_utc = _parse_dt(raw.get("startTimeUtc"))
                    end_dt_utc = _parse_dt(raw.get("endTimeUtc"))
                    assignment = normalize_roster_ground_assignment(raw.get("assignment", ""))

                    # O(1) dedup against boundary records and within-run duplicates.
                    # Normalize to naive datetime to match DB-returned values (MySQL DATETIME has no tz).
                    str_dt_naive = str_dt_utc.replace(tzinfo=None) if str_dt_utc else None
                    end_dt_naive = end_dt_utc.replace(tzinfo=None) if end_dt_utc else None
                    check_key = (crew_id, str_dt_naive, end_dt_naive, assignment)
                    if check_key in existing_set:
                        cursor.execute("RELEASE SAVEPOINT rg_savepoint")
                        result.imported += 1
                        continue
                    existing_set.add(check_key)

                    assignment_group = str(raw.get("assignmentGroup", "GRD"))[:12]
                    location = str(raw.get("location", "") or "")[:3]
                    division = str(raw.get("division", "") or "")[:1]
                    label = str(raw.get("label", "") or "")[:180]
                    role = str(raw.get("trainingRole", "") or "")[:100]
                    credited_minutes = _parse_credit(raw)

                    cursor.execute(
                        """INSERT INTO roster_ground
                           (id, crew_id, assignment_group, assignment, location,
                            str_dt_utc, end_dt_utc, is_locked, scenario_id,
                            is_requested, is_swapped, source, filiale, division,
                            label, role, credited_minutes, dp_min,
                            created_by, created_dt, modified_by, last_modified)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,0,0,0,0,'F8',%s,%s,%s,%s,%s,%s,%s,NOW(),%s,NOW())""",
                        (
                            ids[i],
                            crew_id,
                            assignment_group,
                            assignment,
                            location,
                            str_dt_utc,
                            end_dt_utc,
                            settings.legacy_crew_filiale,
                            division,
                            label,
                            role,
                            credited_minutes,
                            credited_minutes if credited_minutes is not None else 0,  # dp_min (read by Java optimizer)
                            settings.migration_modified_by,
                            settings.migration_modified_by,
                        ),
                    )
                    result.imported += 1
                    cursor.execute("RELEASE SAVEPOINT rg_savepoint")

                except Exception as e:
                    cursor.execute("ROLLBACK TO SAVEPOINT rg_savepoint")
                    msg = (
                        f"roster_ground crew={raw.get('crewId')} "
                        f"assignment={raw.get('assignment')} "
                        f"start={raw.get('startTimeUtc')}: {e}"
                    )
                    logger.warning(msg)
                    result.add_warning(msg)

    # --- Phase 3: single-leg Flight (pairingId=0) → pairing/roster/roster_flight ---
    _import_single_leg_flights(single_leg_flights, result)
    if ignored_paired_flights:
        result.add_notice(
            f"roster_ground Flight: ignored {ignored_paired_flights} records with pairingId>0 "
            "(handled by pairing/rosterFlight syncs)"
        )

    timer.import_end()
    timer.finish()
    timer.populate_result(result)
    timer.log(logger, "roster_ground", imported=result.imported)
    return result


# ---------------------------------------------------------------------------
# Single-leg Flight (pairingId=0) → synthetic pairing + roster + roster_flight
# ---------------------------------------------------------------------------

_SINGLE_LEG_CHECKIN_MIN = 60  # default 1-hour check-in (brief) before departure


def _division_default_rank(division: str) -> str:
    """Default acting_rank from division (no rank in rosterGround payload): P→CA, else FA."""
    return "CA" if str(division or "").strip().upper().startswith("P") else "FA"


def _crew_division(rec: dict) -> str:
    d = str(rec.get("division", "P")).strip().upper()[:1]
    return d if d in ("P", "C") else "P"


_FLIGHT_COLS = (
    "id, interface_flt_id, airline, flt_num, dep_arp, arv_arp, flt_dt, fleet, "
    "sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc"
)


def _load_single_leg_flight_lookups(
    cursor, flt_ids: list[str], flt_nums: list[str]
) -> tuple[dict[str, dict], dict[tuple[str, datetime], dict]]:
    """Two lookups for resolving single-leg flights:
       - by interface_flt_id  (rosterGround fltId — usually a different id space)
       - by (flt_num, dep_dt) (matches act/sch dep time — the working fallback)
    """
    by_iface: dict[str, dict] = {}
    by_numtime: dict[tuple[str, datetime], dict] = {}
    if flt_ids:
        fmt = ",".join(["%s"] * len(flt_ids))
        cursor.execute(f"SELECT {_FLIGHT_COLS} FROM flight WHERE interface_flt_id IN ({fmt})", flt_ids)
        for r in cursor.fetchall():
            by_iface[str(r["interface_flt_id"])] = r
    if flt_nums:
        fmt = ",".join(["%s"] * len(flt_nums))
        cursor.execute(f"SELECT {_FLIGHT_COLS} FROM flight WHERE flt_num IN ({fmt})", flt_nums)
        for r in cursor.fetchall():
            for dep in (r["act_dep_dt_utc"], r["sch_dep_dt_utc"]):
                if dep is not None:
                    by_numtime.setdefault((str(r["flt_num"]), dep), r)
    return by_iface, by_numtime


def _resolve_single_leg_flight(
    rec: dict, by_iface: dict[str, dict], by_numtime: dict[tuple[str, datetime], dict]
) -> dict | None:
    """Resolve a rosterGround single-leg record to a flight row.

    Primary: interface_flt_id == fltId. Fallback (per pairing.py): flt_num (label) + dep time.
    """
    flt_id = str(rec.get("fltId") or "").strip()
    flight = by_iface.get(flt_id)
    if flight is not None:
        return flight
    label = str(rec.get("label") or "").strip()
    dep = _parse_dt(rec.get("startTimeUtc"))
    if label and dep is not None:
        return by_numtime.get((label, dep))
    return None


def _import_single_leg_flights(records: list[dict], result: SyncResult) -> None:
    """Materialize single-leg Flight assignments into pairing/roster/roster_flight.

    rosterGround fltId is per-crew-assignment, so multiple records (and multiple fltIds)
    can map to the same real flight. Records are resolved to a flight, then grouped by that
    flight: one pairing (interface_id 'GND-{flight.interface_flt_id}') with one duty (1h
    check-in), four duty nodes, one segment, one composition per crew division, and one
    roster + roster_flight per crew. Records that resolve to no flight are reported.
    """
    if not records:
        return

    flt_ids = {str(r.get("fltId") or "").strip() for r in records if r.get("fltId")}
    flt_nums = {str(r.get("label") or "").strip() for r in records if r.get("label")}
    with db_cursor() as (pre_cur, _):
        by_iface, by_numtime = _load_single_leg_flight_lookups(
            pre_cur, sorted(flt_ids), sorted(flt_nums)
        )

    # Group resolved records by the real flight (its interface_flt_id).
    crews_by_flight: dict[str, list[dict]] = {}
    flight_by_key: dict[str, dict] = {}
    unresolved = 0
    for rec in records:
        flight = _resolve_single_leg_flight(rec, by_iface, by_numtime)
        if flight is None:
            unresolved += 1
            continue
        key = str(flight["interface_flt_id"])
        flight_by_key[key] = flight
        crews_by_flight.setdefault(key, []).append(rec)

    if unresolved:
        msg = f"single-leg Flight: ignored {unresolved} crew records with no matching flight"
        logger.warning(msg)
        result.add_notice(msg)

    logger.info(
        "single-leg Flight: %d flights resolved (%d crew records), %d unresolved",
        len(crews_by_flight), len(records) - unresolved, unresolved,
    )

    if not crews_by_flight:
        return

    with db_cursor() as (cursor, conn):
        for key, crews in crews_by_flight.items():
            cursor.execute("SAVEPOINT slf_savepoint")
            try:
                _build_single_leg_pairing(cursor, key, flight_by_key[key], crews, result)
                cursor.execute("RELEASE SAVEPOINT slf_savepoint")
            except Exception as e:
                cursor.execute("ROLLBACK TO SAVEPOINT slf_savepoint")
                msg = f"single-leg Flight interface_flt_id={key}: {e}"
                logger.exception(msg)
                result.add_warning(msg)


def _build_single_leg_pairing(
    cursor, flt_key: str, flight: dict, crews: list[dict], result: SyncResult
) -> None:
    # Dedup crew (same crew may map to one flight via several fltIds); keep first per crewId.
    seen: set[str] = set()
    unique_crews: list[dict] = []
    for c in crews:
        cid = str(c.get("crewId", "")).strip()
        if not cid or cid in seen:
            continue
        seen.add(cid)
        unique_crews.append(c)
    if not unique_crews:
        return
    crews = unique_crews

    flt_db_id = int(flight["id"])
    dep_arp = str(flight["dep_arp"] or "")
    arv_arp = str(flight["arv_arp"] or "")
    flt_num = str(flight["flt_num"] or "")
    airline = str(flight["airline"] or "") or "F8"
    fleet = str(flight["fleet"] or "") or "-"
    flt_dt = flight["flt_dt"]
    dep_dt = flight["act_dep_dt_utc"] or flight["sch_dep_dt_utc"]
    arv_dt = flight["act_arv_dt_utc"] or flight["sch_arv_dt_utc"]
    if not dep_dt or not arv_dt:
        raise ValueError("matched flight missing dep/arv datetime")
    brief_start = dep_dt - timedelta(minutes=_SINGLE_LEG_CHECKIN_MIN)
    blk_min = int((arv_dt - dep_dt).total_seconds() // 60)
    # roster_flight.flt_dt is varchar(10); pairing_duty_segment.flt_dt is datetime
    flt_dt_str = flt_dt.strftime("%Y-%m-%d") if hasattr(flt_dt, "strftime") else str(flt_dt or "")[:10]
    pairing_division = _crew_division(crews[0])
    interface_id = f"GND-{flt_key}"
    seg_if_id = flt_key  # flight's interface_flt_id

    # Idempotent: reuse existing synthetic pairing, clearing its children + rosters.
    cursor.execute("SELECT id FROM pairing WHERE interface_id = %s", (interface_id,))
    existing = cursor.fetchone()
    if existing:
        pairing_db_id = int(existing["id"])
        cursor.execute("DELETE FROM roster_flight WHERE pairing_id = %s", (pairing_db_id,))
        cursor.execute("DELETE FROM roster WHERE pairing_id = %s", (pairing_db_id,))
        cursor.execute("DELETE FROM pairing_duty_segment WHERE pairing_id = %s", (pairing_db_id,))
        cursor.execute("DELETE FROM pairing_duty_node WHERE pairing_id = %s", (pairing_db_id,))
        cursor.execute("DELETE FROM pairing_duty WHERE pairing_id = %s", (pairing_db_id,))
        cursor.execute("DELETE FROM pairing_composition WHERE pairing_id = %s", (pairing_db_id,))
        cursor.execute(
            """UPDATE pairing SET pairing_dt=%s, label=%s, base=%s, fleet=%s, division=%s,
               duration_days=1, sch_str_dt_utc=%s, sch_end_dt_utc=%s,
               act_str_dt_utc=%s, act_end_dt_utc=%s, assignment_group='FLY', assignment='FLY',
               modified_by=%s, last_modified=NOW() WHERE id=%s""",
            (flt_dt, flt_num, dep_arp, fleet, pairing_division,
             brief_start, arv_dt, brief_start, arv_dt,
             settings.migration_modified_by, pairing_db_id),
        )
    else:
        pairing_db_id = nextval("PAIRING_SEQ", cursor)
        cursor.execute(
            """INSERT INTO pairing
               (id, ver, pairing_dt, label, filiale, division, base, fleet, duration_days,
                sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
                assignment_group, assignment, attributes, scenario_id, is_deleted, interface_id,
                tafb, created_by, created_dt, modified_by, last_modified)
               VALUES (%s,0,%s,%s,'F8',%s,%s,%s,1,%s,%s,%s,%s,'FLY','FLY','',0,0,%s,0,%s,NOW(),%s,NOW())""",
            (pairing_db_id, flt_dt, flt_num, pairing_division, dep_arp, fleet,
             brief_start, arv_dt, brief_start, arv_dt, interface_id,
             settings.migration_modified_by, settings.migration_modified_by),
        )

    # pairing_composition: one per unique crew division (plan_value = crew count)
    div_counts: dict[str, int] = {}
    for c in crews:
        d = _crew_division(c)
        div_counts[d] = div_counts.get(d, 0) + 1
    comp_ids = batch_nextval("PAIRING_COMP_SEQ", len(div_counts), cursor)
    for ci, (d, cnt) in enumerate(div_counts.items()):
        cursor.execute(
            """INSERT INTO pairing_composition
               (id, pairing_id, acting_rank, plan_value, division, is_deleted, scenario_id, modified_by, last_modified)
               VALUES (%s,%s,%s,%s,%s,0,0,%s,NOW())""",
            (comp_ids[ci], pairing_db_id, _division_default_rank(d), cnt, d, settings.migration_modified_by),
        )

    # pairing_duty (one)
    duty_db_id = nextval("PAIRING_DUTY_SEQ", cursor)
    cursor.execute(
        """INSERT INTO pairing_duty
           (id, pairing_id, duty_seq, str_arp, end_arp, act_str_dt_utc, act_end_dt_utc,
            credited_minutes, assignment, comments, is_deleted, scenario_id, is_manual_modify,
            plan_flight_min, act_flight_min, actual_duty_minutes, brief_min,
            created_by, created_dt, modified_by, last_modified)
           VALUES (%s,%s,1,%s,%s,%s,%s,%s,'FLY','',0,0,0,%s,%s,%s,%s,%s,NOW(),%s,NOW())""",
        (duty_db_id, pairing_db_id, dep_arp, arv_arp, brief_start, arv_dt, blk_min,
         blk_min, blk_min, blk_min, _SINGLE_LEG_CHECKIN_MIN,
         settings.migration_modified_by, settings.migration_modified_by),
    )

    # pairing_duty_node (PICKUP/BRIEF at dep with 1h check-in, DEBRIEF/DROPOFF at arr)
    nodes = [
        ("PICKUP", dep_arp, brief_start, brief_start),
        ("BRIEF", dep_arp, brief_start, dep_dt),
        ("DEBRIEF", arv_arp, arv_dt, arv_dt),
        ("DROPOFF", arv_arp, arv_dt, arv_dt),
    ]
    node_ids = batch_nextval("PAIRING_DUTY_NODE_SEQ", len(nodes), cursor)
    for ni, (node_name, airport, start_utc, end_utc) in enumerate(nodes):
        cursor.execute(
            """INSERT INTO pairing_duty_node
               (id, pairing_id, duty_id, sequence, type, node,
                from_segment_id, to_segment_id, group_id,
                airport, start_utc, end_utc, scenario_id, modified_by, last_modified, is_manual_modify)
               VALUES (%s,%s,%s,%s,'DUTY',%s,0,0,1,%s,%s,%s,0,%s,NOW(),0)""",
            (node_ids[ni], pairing_db_id, duty_db_id, ni + 1, node_name,
             airport, start_utc, end_utc, settings.migration_modified_by),
        )

    # pairing_duty_segment (one — the matched flight)
    seg_db_id = nextval("PAIRING_SEG_SEQ", cursor)
    cursor.execute(
        """INSERT INTO pairing_duty_segment
           (id, pairing_id, pairing_duty_id, duty_seq, seg_seq, flt_id, flt_dt, assignment,
            scenario_id, rank_comb_c9a_p, rank_comb_c9a_c, rank_comb_c9a_a,
            created_by, created_dt, modified_by, last_modified,
            airline, flt_num, dep_arp, arv_arp, fleet, act_str_dt_utc, act_end_dt_utc,
            is_deleted, is_long_transit, interface_flt_id)
           VALUES (%s,%s,%s,1,1,%s,%s,'FLY',0,0,0,0,%s,NOW(),%s,NOW(),
                   %s,%s,%s,%s,%s,%s,%s,0,0,%s)""",
        (seg_db_id, pairing_db_id, duty_db_id, flt_db_id, flt_dt,
         settings.migration_modified_by, settings.migration_modified_by,
         airline, flt_num, dep_arp, arv_arp, fleet, dep_dt, arv_dt, seg_if_id),
    )

    # roster + roster_flight (one per crew)
    roster_ids = batch_nextval("ROSTER_SEQ", len(crews), cursor)
    rf_ids = batch_nextval("ROSTER_FLIGHT_SEQ", len(crews), cursor)
    for i, crew in enumerate(crews):
        crew_id = str(crew.get("crewId", ""))[:30]
        if not crew_id:
            result.add_warning(f"single-leg Flight fltId={flt_key}: crew record missing crewId, skipped")
            continue
        division = _crew_division(crew)
        acting_rank = _division_default_rank(division)
        cursor.execute(
            """INSERT INTO roster
               (id, ver, crew_id, pairing_id, label, assignment_group, assignment, acting_rank,
                source, is_requested, is_deleted, is_swapped, live_id, scenario_id,
                created_by, created_dt, modified_by, last_modified)
               VALUES (%s,0,%s,%s,'','FLY','FLY',%s,'F8',0,0,0,%s,0,%s,NOW(),%s,NOW())""",
            (roster_ids[i], crew_id, pairing_db_id, acting_rank, None,
             settings.migration_modified_by, settings.migration_modified_by),
        )
        cursor.execute(
            """INSERT INTO roster_flight
               (id, pairing_id, duty_id, roster_id, flt_id, flt_dt, division, crew_id,
                acting_rank, active_rank, assignment, seq_order, source, flt_num, fleet,
                register, flt_sts, pairing_start_utc, scenario_id,
                created_by, created_dt, modified_by, last_modified)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'FLY',%s,'F8',%s,%s,'','',%s,0,%s,NOW(),%s,NOW())""",
            (rf_ids[i], pairing_db_id, duty_db_id, roster_ids[i], flt_db_id, flt_dt_str,
             division, crew_id, acting_rank, acting_rank, 0, flt_num, fleet,
             brief_start, settings.migration_modified_by, settings.migration_modified_by),
        )
        result.imported += 1
