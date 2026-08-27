"""F8 pairing sync — 5-table write with duty nodes, SBY/DHD flight derivation."""
import logging
import re
from datetime import date as date_type, datetime, timedelta
from typing import Any

from db.mysql import db_cursor, batch_nextval, nextval
from f8.client import f8_client
from f8.utils import (
    chunk_date_range,
    normalize_assignment,
    normalize_interface_flt_id,
    normalize_rank,
    SyncResult,
    SyncTimer,
)
from storage.json_store import JsonBatch
from config import settings

logger = logging.getLogger(__name__)

# Normalized segment assignment → flight_flag, for flights synthesized from pairing
# segments when the real flight is not found. flight_assignment stores the normalized
# assignment itself (e.g. "FLY", "DH"). DH = deadhead (the API uses "DH", not "DHD").
ASSIGNMENT_FLAG = {"FLY": "A", "DH": "D", "DHD": "D", "SBY": "B", "SIM": "S"}
# Segment assignment types that represent a real flight/activity and therefore get a
# flight row synthesized when no existing flight matches.
FLIGHT_BEARING_ASSIGNMENTS = frozenset(ASSIGNMENT_FLAG)


def _pairing_duty_list(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Latest / legacy API keys for duties under a pairing."""
    return (
        raw.get("pairingDutyList")
        or raw.get("pairingDuties")
        or raw.get("duties")
        or []
    )


def _pairing_compositions(raw: dict[str, Any]) -> list[dict[str, Any]]:
    return raw.get("pairingCompositions") or raw.get("pairing_compositions") or []


def _duty_end_arp(duty: dict[str, Any]) -> str:
    return str(duty.get("endArp") or duty.get("end_arp") or "")


def _duty_str_arp(duty: dict[str, Any]) -> str:
    return str(duty.get("strArp") or duty.get("str_arp") or "")


def _duty_credit_minutes(duty: dict[str, Any]) -> int:
    v = duty.get("creditedMinutes", duty.get("credited_minutes", 0))
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _duty_int(duty: dict[str, Any], key: str) -> int:
    """Safely parse an integer duty stat; defaults to 0."""
    try:
        return int(duty.get(key, 0) or 0)
    except (TypeError, ValueError):
        return 0


def _duty_comments(duty: dict[str, Any]) -> str:
    """Map JSON `comments` → `pairing_duty.comments` (no dutyId in latest API)."""
    c = duty.get("comments")
    if c is None:
        return ""
    return str(c)[:255]


def _segment_interface_flt_id_decimal(seg: dict[str, Any]) -> int | None:
    """MySQL `interface_flt_id` on segment is decimal: store numeric fltId only; alphanumeric → NULL (until DDL)."""
    s = normalize_interface_flt_id(_seg_flt_id(seg))
    if not s or not s.isdigit():
        return None
    try:
        n = int(s)
    except ValueError:
        return None
    return n if n > 0 else None


def _duty_nodes_source(duty: dict[str, Any]) -> list[dict[str, Any]]:
    return duty.get("pairingDutyNodes") or duty.get("nodes") or []


def _duty_segments_source(duty: dict[str, Any]) -> list[dict[str, Any]]:
    return duty.get("pairingDutySegments") or duty.get("segments") or []


def _node_kind(n: dict[str, Any]) -> str:
    return str(n.get("node", "")).replace("_", "").strip().lower()


def _duty_nodes_need_checkin_expand(raw_nodes: list[dict[str, Any]]) -> bool:
    kinds = {_node_kind(n) for n in raw_nodes}
    return "checkin" in kinds and "checkout" in kinds and "pickup" not in kinds


def _expand_checkin_checkout_nodes(
    raw_nodes: list[dict[str, Any]], str_arp: str, end_arp: str
) -> list[dict[str, Any]]:
    """Navblue-style CheckIn/CheckOut → four canonical duty nodes (PICKUP/BRIEF/DEBRIEF/DROPOFF)."""
    ci = next(n for n in raw_nodes if _node_kind(n) == "checkin")
    co = next(n for n in raw_nodes if _node_kind(n) == "checkout")
    ci_s = _parse_dt(ci.get("startUtc") or ci.get("start_utc"))
    ci_e = _parse_dt(ci.get("endUtc") or ci.get("end_utc"))
    co_s = _parse_dt(co.get("startUtc") or co.get("start_utc"))
    co_e = _parse_dt(co.get("endUtc") or co.get("end_utc"))
    ci_ap = str(ci.get("airport", str_arp))
    co_ap = str(co.get("airport", end_arp))
    if not all([ci_s, ci_e, co_s, co_e]):
        return []
    return [
        {"sequence": 1, "node": "PICKUP", "airport": ci_ap, "start_utc": ci_s, "end_utc": ci_s},
        {"sequence": 2, "node": "BRIEF", "airport": ci_ap, "start_utc": ci_s, "end_utc": ci_e},
        {"sequence": 3, "node": "DEBRIEF", "airport": co_ap, "start_utc": co_s, "end_utc": co_e},
        {"sequence": 4, "node": "DROPOFF", "airport": co_ap, "start_utc": co_e, "end_utc": co_e},
    ]


def _composition_division(comp: dict[str, Any]) -> str:
    """P/C from payload or from acting rank (deck vs cabin)."""
    d = str(comp.get("division", "")).strip().upper()
    if d.startswith("P"):
        return "P"
    if d.startswith("C"):
        return "C"
    rk = normalize_rank(str(comp.get("actingRank", "")))
    return "P" if rk in ("CA", "FO") else "C"


def _seg_dep_arp(seg: dict[str, Any]) -> str:
    return str(seg.get("depArp") or seg.get("dep_arp") or "")


def _seg_arv_arp(seg: dict[str, Any]) -> str:
    return str(seg.get("arvArp") or seg.get("arv_arp") or "")


def _seg_flt_id(seg: dict[str, Any]) -> Any:
    return seg.get("fltId", seg.get("flt_id"))


def _seg_int(seg: dict[str, Any], key: str) -> int:
    """Safely parse an integer segment field; defaults to 0."""
    try:
        return int(seg.get(key, 0) or 0)
    except (TypeError, ValueError):
        return 0


def normalize_pairing_assignment(assignment: str) -> str:
    return normalize_assignment(assignment)


def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    return datetime.fromisoformat(str(val).replace("Z", "+00:00").replace(" ", "T"))


def _pairing_int(raw: dict[str, Any], key: str) -> int:
    """Safely parse an integer pairing stat; defaults to 0."""
    try:
        return int(raw.get(key, 0) or 0)
    except (TypeError, ValueError):
        return 0


def transform_pairing_row(raw: dict[str, Any]) -> dict[str, Any]:
    duties = _pairing_duty_list(raw)
    # Prefer API sch/act timestamps; fall back to first/last duty when absent.
    sch_str = _parse_dt(raw.get("schStrDtUtc")) or (_parse_dt(
        duties[0].get("actStrDtUtc") or duties[0].get("act_str_dt_utc"),
    ) if duties else None)
    sch_end = _parse_dt(raw.get("schEndDtUtc")) or (_parse_dt(
        duties[-1].get("actEndDtUtc") or duties[-1].get("act_end_dt_utc"),
    ) if duties else None)
    act_str = _parse_dt(raw.get("actStrDtUtc")) or sch_str
    act_end = _parse_dt(raw.get("actEndDtUtc")) or sch_end
    comps = _pairing_compositions(raw)
    division = str(raw.get("division", "")).strip().upper()[:1]
    if division not in ("P", "C"):
        division = "C" if any(normalize_rank(c.get("actingRank", "")) not in ("CA", "FO") for c in comps) else "P"
    dur = raw.get("durationDays", raw.get("duration_days", 0))
    try:
        duration_days = int(dur)
    except (TypeError, ValueError):
        duration_days = 0
    return {
        "interface_id": str(raw.get("pairingId", raw.get("pairing_id", ""))),
        "pairing_dt": _parse_dt(raw.get("pairingDt") or raw.get("pairing_dt")),
        "label": raw.get("label", ""),
        "base": raw.get("base", ""),
        "fleet": raw.get("fleet", ""),
        "duration_days": duration_days,
        "sch_str_dt_utc": sch_str,
        "sch_end_dt_utc": sch_end,
        "act_str_dt_utc": act_str,
        "act_end_dt_utc": act_end,
        "division": division,
        "filiale": "F8",
        "assignment_group": raw.get("assignmentGroup") or "FLY",
        "assignment": raw.get("assignment") or "FLY",
        "tafb": _pairing_int(raw, "tafb"),
        "comments": str(raw.get("comments", "") or "")[:120],
        "per_diem_mins": _pairing_int(raw, "perDiemMins"),
        "per_diem_mins_adjustment": _pairing_int(raw, "perDiemMinsAdjustment"),
        "fm_lh_per_diem_mins": _pairing_int(raw, "fmLhPerDiemMins"),
        "wp_mins": _pairing_int(raw, "wpMins"),
        "wp_mins_adjustment": _pairing_int(raw, "wpMinsAdjustment"),
        "ver": 0,
        "scenario_id": 0,
        "is_deleted": 0,
    }


def build_duty_nodes(duty: dict[str, Any]) -> list[dict[str, Any]]:
    """Map pairingDutyNodes / nodes from API to internal node rows; synthesize 4 nodes if absent."""
    raw_nodes = _duty_nodes_source(duty)
    if raw_nodes:
        if _duty_nodes_need_checkin_expand(raw_nodes):
            return _expand_checkin_checkout_nodes(raw_nodes, _duty_str_arp(duty), _duty_end_arp(duty))
        return [
            {
                "sequence": int(n.get("sequence", idx + 1)),
                "node": str(n.get("node", "")),
                "airport": str(n.get("airport", "")),
                "start_utc": _parse_dt(n.get("startUtc") or n.get("start_utc")),
                "end_utc": _parse_dt(n.get("endUtc") or n.get("end_utc")),
            }
            for idx, n in enumerate(raw_nodes)
        ]
    ast = _parse_dt(duty.get("actStrDtUtc") or duty.get("act_str_dt_utc"))
    aen = _parse_dt(duty.get("actEndDtUtc") or duty.get("act_end_dt_utc"))
    if not ast or not aen:
        return []
    sa = _duty_str_arp(duty)
    ea = _duty_end_arp(duty)
    return [
        {"sequence": 1, "node": "PICKUP", "airport": sa, "start_utc": ast, "end_utc": ast},
        {"sequence": 2, "node": "BRIEF", "airport": sa, "start_utc": ast, "end_utc": ast},
        {"sequence": 3, "node": "DEBRIEF", "airport": ea, "start_utc": aen, "end_utc": aen},
        {"sequence": 4, "node": "DROPOFF", "airport": ea, "start_utc": aen, "end_utc": aen},
    ]


def build_segment_flight(seg: dict[str, Any]) -> dict[str, Any]:
    """Build a flight row from a pairing segment (FLY/DH/SBY/SIM) when no flight matched."""
    assignment = normalize_assignment(seg.get("assignment", ""))
    flag = ASSIGNMENT_FLAG.get(assignment, "")
    str_dt = _parse_dt(seg.get("actStrDtUtc"))
    end_dt = _parse_dt(seg.get("actEndDtUtc"))
    flt_dt_raw = _parse_dt(seg.get("fltDt"))
    flt_dt = (flt_dt_raw - settings._yvr_offset).date() if flt_dt_raw else (str_dt.date() if str_dt else None)
    return {
        "flt_num": seg.get("fltNum", ""),
        "flt_dt": flt_dt,
        "dep_arp": _seg_dep_arp(seg),
        "arv_arp": _seg_arv_arp(seg),
        "sch_dep_dt_utc": str_dt,
        "sch_arv_dt_utc": end_dt,
        "act_dep_dt_utc": str_dt,
        "act_arv_dt_utc": end_dt,
        "fleet": seg.get("fleet", "") or "-",
        "airline": seg.get("airline", "F8"),
        "flight_flag": flag,
        "flight_assignment": assignment,
        "interface_flt_id": _segment_interface_flt_id_decimal(seg),
        "filiale": "F8",
        "ac_owner": "F8", "pilot_owner": "F8", "cabin_owner": "F8",
        "seg_type": "J", "flt_type": "S", "service_type": "S",
    }


def _resolve_airline(seg: dict) -> str:
    airline = seg.get("airline", "")
    flt_num = seg.get("fltNum", "")
    if airline in ("FLE", ""):
        if re.match(r"^(?=.*[a-zA-Z])(?=.*[0-9])", flt_num):
            return flt_num[:2].upper()
        return "F8"
    return airline


def _resolve_flt_num(seg: dict) -> str:
    airline = seg.get("airline", "")
    flt_num = seg.get("fltNum", "")
    return flt_num[2:] if airline == "FLE" else flt_num


def _write_pairing(cursor, pairing_id: int, row: dict) -> None:
    cursor.execute(
        """INSERT INTO pairing
           (id, ver, pairing_dt, label, filiale, division, base, fleet, duration_days,
            sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
            assignment_group, assignment, attributes, scenario_id, is_deleted, interface_id,
            tafb, comments, per_diem_mins, per_diem_mins_adjustment, fm_lh_per_diem_mins,
            wp_mins, wp_mins_adjustment, created_by, created_dt, modified_by, last_modified)
           VALUES (%s,0,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'',0,0,%s,
                   %s,%s,%s,%s,%s,%s,%s,%s,NOW(),%s,NOW())""",
        (pairing_id, row["pairing_dt"], row["label"], row["filiale"], row["division"],
         row["base"], row["fleet"], row["duration_days"],
         row["sch_str_dt_utc"], row["sch_end_dt_utc"],
         row["act_str_dt_utc"], row["act_end_dt_utc"],
         row["assignment_group"], row["assignment"], row["interface_id"],
         row["tafb"], row["comments"], row["per_diem_mins"], row["per_diem_mins_adjustment"],
         row["fm_lh_per_diem_mins"], row["wp_mins"], row["wp_mins_adjustment"],
         settings.migration_modified_by,
         settings.migration_modified_by),
    )


def _update_pairing(cursor, pairing_id: int, row: dict) -> None:
    cursor.execute(
        """UPDATE pairing
           SET pairing_dt=%s, label=%s, division=%s, base=%s, fleet=%s, duration_days=%s,
               sch_str_dt_utc=%s, sch_end_dt_utc=%s, act_str_dt_utc=%s, act_end_dt_utc=%s,
               assignment_group=%s, assignment=%s,
               tafb=%s, comments=%s, per_diem_mins=%s, per_diem_mins_adjustment=%s,
               fm_lh_per_diem_mins=%s, wp_mins=%s, wp_mins_adjustment=%s,
               modified_by=%s, last_modified=NOW()
           WHERE id=%s""",
        (row["pairing_dt"], row["label"], row["division"], row["base"], row["fleet"],
         row["duration_days"],
         row["sch_str_dt_utc"], row["sch_end_dt_utc"],
         row["act_str_dt_utc"], row["act_end_dt_utc"],
         row["assignment_group"], row["assignment"],
         row["tafb"], row["comments"], row["per_diem_mins"], row["per_diem_mins_adjustment"],
         row["fm_lh_per_diem_mins"], row["wp_mins"], row["wp_mins_adjustment"],
         settings.migration_modified_by,
         pairing_id),
    )


_COMMIT_BATCH = 200  # commit every N pairings to keep transactions small


def _load_pairing_lookup(cursor) -> dict[str, int]:
    """interface_id → pairing.id for upsert checks."""
    cursor.execute("SELECT id, interface_id FROM pairing WHERE interface_id IS NOT NULL AND interface_id != ''")
    return {str(r["interface_id"]): int(r["id"]) for r in cursor.fetchall()}


def _load_flight_lookup_for_pairing(cursor) -> dict[str, int]:
    """str(interface_flt_id) → flight.id — covers both flight-sync rows and SBY/DHD rows."""
    cursor.execute("SELECT id, interface_flt_id FROM flight WHERE interface_flt_id IS NOT NULL AND interface_flt_id != ''")
    return {str(r["interface_flt_id"]): int(r["id"]) for r in cursor.fetchall()}


def _load_flight_composite_lookup(cursor) -> dict[str, int]:
    """{flt_num}_{dep_arp}_{arv_arp}_{dep_YYYYMMDDHHmm}_{arv_YYYYMMDDHHmm} → flight.id
    Fallback when interface_flt_id match fails."""
    cursor.execute(
        "SELECT id, flt_num, dep_arp, arv_arp, "
        "DATE_FORMAT(act_dep_dt_utc, '%Y%m%d%H%i') AS dep_key, "
        "DATE_FORMAT(act_arv_dt_utc, '%Y%m%d%H%i') AS arv_key "
        "FROM flight WHERE flt_num IS NOT NULL AND flt_num != '' "
        "AND act_dep_dt_utc IS NOT NULL AND act_arv_dt_utc IS NOT NULL"
    )
    return {
        f"{r['flt_num']}_{r['dep_arp']}_{r['arv_arp']}_{r['dep_key']}_{r['arv_key']}": int(r["id"])
        for r in cursor.fetchall()
    }


def sync_pairing(start_dt: str, end_dt: str) -> SyncResult:
    timer = SyncTimer()
    timer.start()
    result = SyncResult("pairing")
    start = date_type.fromisoformat(start_dt)
    end = date_type.fromisoformat(end_dt)
    chunks = chunk_date_range(start, end, chunk_days=settings.sync_chunk_days)
    batch = JsonBatch("pairing")

    all_raw: list[dict] = []
    for chunk_start, chunk_end in chunks:
        raw = f8_client.get_pairing(chunk_start.isoformat(), chunk_end.isoformat())
        batch.save(raw, start_dt=chunk_start.isoformat(), end_dt=chunk_end.isoformat())
        all_raw.extend(raw)
    timer.fetch_end()

    # Pre-load lookups once — eliminates per-pairing SELECT and per-pairing UPDATE...JOIN flight
    with db_cursor() as (pre_cur, _):
        pairing_lookup = _load_pairing_lookup(pre_cur)
        flight_lookup = _load_flight_lookup_for_pairing(pre_cur)
        flight_composite_lookup = _load_flight_composite_lookup(pre_cur)
    logger.info(
        "pairing lookups loaded — existing_pairings=%d  flights=%d  flights_composite=%d",
        len(pairing_lookup), len(flight_lookup), len(flight_composite_lookup),
    )
    timer.import_start()

    for batch_offset in range(0, len(all_raw), _COMMIT_BATCH):
        raw_batch = all_raw[batch_offset: batch_offset + _COMMIT_BATCH]
        logger.info(
            "pairing batch %d-%d / %d",
            batch_offset + 1,
            batch_offset + len(raw_batch),
            len(all_raw),
        )
        with db_cursor() as (cursor, conn):
            pairing_ids = batch_nextval("PAIRING_SEQ", len(raw_batch), cursor)

            for idx, raw in enumerate(raw_batch):
                cursor.execute("SAVEPOINT pairing_savepoint")

                try:
                    row = transform_pairing_row(raw)
                    interface_id = row["interface_id"]

                    existing_id = pairing_lookup.get(interface_id)
                    if existing_id:
                        pairing_db_id = existing_id
                        _update_pairing(cursor, pairing_db_id, row)
                        cursor.execute("DELETE FROM pairing_duty_segment WHERE pairing_id = %s", (pairing_db_id,))
                        cursor.execute("DELETE FROM pairing_duty_node WHERE pairing_id = %s", (pairing_db_id,))
                        cursor.execute("DELETE FROM pairing_duty WHERE pairing_id = %s", (pairing_db_id,))
                        cursor.execute("DELETE FROM pairing_composition WHERE pairing_id = %s", (pairing_db_id,))
                    else:
                        pairing_db_id = pairing_ids[idx]
                        _write_pairing(cursor, pairing_db_id, row)
                        pairing_lookup[interface_id] = pairing_db_id

                    # pairing_composition
                    comps = _pairing_compositions(raw)
                    comp_ids = batch_nextval("PAIRING_COMP_SEQ", len(comps), cursor)
                    for ci, comp in enumerate(comps):
                        comp_div = _composition_division(comp)
                        cursor.execute(
                            """INSERT INTO pairing_composition
                               (id, pairing_id, acting_rank, plan_value, division, is_deleted, scenario_id, modified_by, last_modified)
                               VALUES (%s,%s,%s,%s,%s,0,0,%s,NOW())""",
                            (comp_ids[ci], pairing_db_id,
                             normalize_rank(comp.get("actingRank", "")),
                             comp.get("planValue", comp.get("plan_value", 0)),
                             comp_div,
                             settings.migration_modified_by),
                        )

                    # pairing_duty + nodes + segments
                    duties = _pairing_duty_list(raw)
                    duty_ids = batch_nextval("PAIRING_DUTY_SEQ", len(duties), cursor)

                    for di, duty in enumerate(duties):
                        duty_db_id = duty_ids[di]
                        assignment = normalize_pairing_assignment(duty.get("assignment", ""))
                        cursor.execute(
                            """INSERT INTO pairing_duty
                               (id, pairing_id, duty_seq, str_arp, end_arp,
                                act_str_dt_utc, act_end_dt_utc, credited_minutes,
                                assignment, comments, is_deleted, scenario_id,
                                is_manual_modify, fdp_discretion_min, max_fdp_min,
                                min_rest_min, act_rest_min, layover_nits,
                                plan_flight_min, plan_fdp_min, act_flight_min, act_fdp_min,
                                actual_duty_minutes,
                                created_by, created_dt, modified_by, last_modified)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,0,0,0,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                                       %s,NOW(),%s,NOW())""",
                            (duty_db_id, pairing_db_id,
                             duty.get("dutySeq", di + 1),
                             _duty_str_arp(duty), _duty_end_arp(duty),
                             _parse_dt(duty.get("actStrDtUtc") or duty.get("act_str_dt_utc")) or row["sch_str_dt_utc"],
                             _parse_dt(duty.get("actEndDtUtc") or duty.get("act_end_dt_utc")) or row["sch_end_dt_utc"],
                             _duty_credit_minutes(duty),
                             assignment,
                             _duty_comments(duty),
                             _duty_int(duty, "fdpDiscretionMin"),
                             _duty_int(duty, "maxFdpMin"),
                             _duty_int(duty, "minRestMin"),
                             _duty_int(duty, "actRestMin"),
                             _duty_int(duty, "layoverNits"),
                             _duty_int(duty, "planFlightMin"),
                             _duty_int(duty, "planFdpMin"),
                             _duty_int(duty, "actFlightMin"),
                             _duty_int(duty, "actFdpMin"),
                             _duty_int(duty, "actualDutyMinutes"),
                             settings.migration_modified_by,
                             settings.migration_modified_by),
                        )

                        # duty nodes
                        nodes = build_duty_nodes(duty)
                        node_ids = batch_nextval("PAIRING_DUTY_NODE_SEQ", len(nodes), cursor)
                        for ni, node in enumerate(nodes):
                            cursor.execute(
                                """INSERT INTO pairing_duty_node
                                   (id, pairing_id, duty_id, sequence, type, node,
                                    from_segment_id, to_segment_id, group_id,
                                    airport, start_utc, end_utc, scenario_id,
                                    modified_by, last_modified, is_manual_modify)
                                   VALUES (%s,%s,%s,%s,'DUTY',%s,0,0,1,%s,%s,%s,0,%s,NOW(),0)""",
                                (node_ids[ni], pairing_db_id, duty_db_id,
                                 node["sequence"], node["node"],
                                 node["airport"], node["start_utc"], node["end_utc"],
                                 settings.migration_modified_by),
                            )

                        # segments — pairingDutySegments or legacy `segments`
                        segments = [
                            s for s in _duty_segments_source(duty)
                            if str(s.get("assignment", "")).strip().lower() != "hotel"
                        ]
                        seg_ids = batch_nextval("PAIRING_SEG_SEQ", len(segments), cursor)
                        for si, seg in enumerate(segments):
                            seg_assignment = normalize_assignment(seg.get("assignment", ""))
                            airline = _resolve_airline(seg)
                            flt_num = _resolve_flt_num(seg)
                            seg_db_id = seg_ids[si]

                            # fltDt in pairing is already local date (midnight datetime, no UTC offset)
                            flt_dt_raw = _parse_dt(seg.get("fltDt"))
                            seg_if_id = _segment_interface_flt_id_decimal(seg)
                            # Primary: resolve via interface_flt_id
                            flt_db_id = flight_lookup.get(str(seg_if_id), 0) if seg_if_id else 0
                            # Fallback: composite key {flt_num}_{dep_arp}_{arv_arp}_{dep_dt}_{arv_dt}
                            if not flt_db_id:
                                raw_flt_num = str(seg.get("fltNum", "")).strip()
                                dep_dt_seg = _parse_dt(seg.get("actStrDtUtc"))
                                arv_dt_seg = _parse_dt(seg.get("actEndDtUtc"))
                                if raw_flt_num and dep_dt_seg and arv_dt_seg:
                                    comp_key = (
                                        f"{raw_flt_num}_{_seg_dep_arp(seg)}_{_seg_arv_arp(seg)}_"
                                        f"{dep_dt_seg.strftime('%Y%m%d%H%M')}_{arv_dt_seg.strftime('%Y%m%d%H%M')}"
                                    )
                                    flt_db_id = flight_composite_lookup.get(comp_key, 0)
                            cursor.execute(
                                """INSERT INTO pairing_duty_segment
                                   (id, pairing_id, pairing_duty_id, duty_seq, seg_seq,
                                    flt_id, flt_dt, assignment, scenario_id,
                                    rank_comb_c9a_p, rank_comb_c9a_c, rank_comb_c9a_a,
                                    created_by, created_dt, modified_by, last_modified,
                                    airline, flt_num, dep_arp, arv_arp, fleet,
                                    act_str_dt_utc, act_end_dt_utc, is_deleted, is_long_transit,
                                    interface_flt_id)
                                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,0,0,0,0,
                                           %s,NOW(),%s,NOW(),
                                           %s,%s,%s,%s,%s,%s,%s,0,%s,%s)""",
                                (seg_db_id, pairing_db_id, duty_db_id,
                                 seg.get("dutySeq", di + 1), seg.get("segSeq", si + 1),
                                 flt_db_id,
                                 flt_dt_raw,
                                 seg_assignment,
                                 settings.migration_modified_by,
                                 settings.migration_modified_by,
                                 airline, flt_num,
                                 _seg_dep_arp(seg), _seg_arv_arp(seg),
                                 seg.get("fleet", "") or "-",
                                 _parse_dt(seg.get("actStrDtUtc")),
                                 _parse_dt(seg.get("actEndDtUtc")),
                                 _seg_int(seg, "isLongTransit"),
                                 seg_if_id),
                            )

                            # When no existing flight matched, synthesize one from the
                            # segment (FLY/DH/SBY/SIM) and link it back. SBY/DH placeholders
                            # have fltId=0 so they never match and always get created here.
                            if not flt_db_id and seg_assignment in FLIGHT_BEARING_ASSIGNMENTS:
                                flt_row = build_segment_flight(seg)
                                flt_new_id = nextval("FLT_SEQ", cursor)
                                blk_min = int(
                                    (flt_row["sch_arv_dt_utc"] - flt_row["sch_dep_dt_utc"]).total_seconds() // 60
                                ) if flt_row["sch_dep_dt_utc"] and flt_row["sch_arv_dt_utc"] else 0
                                cursor.execute(
                                    """INSERT INTO flight
                                       (id, airline, flt_dt, flt_num, dep_arp, arv_arp,
                                        sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
                                        act_dep_arp, act_arv_arp, flight_flag, flight_assignment,
                                        blk_min, fleet, ac_owner, pilot_owner, cabin_owner,
                                        commute_id, seg_type, flt_type, is_locked, sch_id, interface_flt_id,
                                        created_by, created_dt, modified_by, last_modified, service_type)
                                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                                               %s,%s,%s,%s,%s,
                                               0,'J','S',0,0,%s,%s,NOW(),%s,NOW(),'S')""",
                                    (flt_new_id, flt_row["airline"], flt_row["flt_dt"],
                                     flt_row["flt_num"], flt_row["dep_arp"], flt_row["arv_arp"],
                                     flt_row["sch_dep_dt_utc"], flt_row["sch_arv_dt_utc"],
                                     flt_row["act_dep_dt_utc"], flt_row["act_arv_dt_utc"],
                                     flt_row["dep_arp"], flt_row["arv_arp"],
                                     flt_row["flight_flag"], flt_row["flight_assignment"],
                                     blk_min, flt_row["fleet"], flt_row["ac_owner"],
                                     flt_row["pilot_owner"], flt_row["cabin_owner"],
                                     flt_row["interface_flt_id"],
                                     settings.migration_modified_by,
                                     settings.migration_modified_by),
                                )
                                cursor.execute(
                                    "UPDATE pairing_duty_segment SET flt_id=%s WHERE id=%s",
                                    (flt_new_id, seg_db_id),
                                )
                                # Register in lookups so later segments for the same flight reuse it.
                                if seg_if_id:
                                    flight_lookup[str(seg_if_id)] = flt_new_id
                                if flt_row["act_dep_dt_utc"] and flt_row["act_arv_dt_utc"]:
                                    comp_key = (
                                        f"{flt_row['flt_num']}_{flt_row['dep_arp']}_{flt_row['arv_arp']}_"
                                        f"{flt_row['act_dep_dt_utc'].strftime('%Y%m%d%H%M')}_"
                                        f"{flt_row['act_arv_dt_utc'].strftime('%Y%m%d%H%M')}"
                                    )
                                    flight_composite_lookup[comp_key] = flt_new_id

                    result.imported += 1

                    cursor.execute("RELEASE SAVEPOINT pairing_savepoint")

                except Exception as e:
                    cursor.execute("ROLLBACK TO SAVEPOINT pairing_savepoint")
                    msg = f"Pairing {raw.get('pairingId')}: error — {e}"
                    logger.exception(msg)
                    result.add_warning(msg)

    timer.import_end()
    timer.finish()
    timer.populate_result(result)
    timer.log(logger, "pairing", imported=result.imported)
    return result