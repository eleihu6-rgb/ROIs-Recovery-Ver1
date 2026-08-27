#!/usr/bin/env python3
"""Convert old ^ -delimited ro_input.txt / ro_output.txt to new ## CSV gz format.

Usage:
  python3 legacy_ro_converter.py \
    --input-txt  <ro_input.txt>   \
    --output-txt <ro_output.txt>  \
    --input-gz   <input.gz>       \
    --output-gz  <output.gz>
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional


SEP = "^"

# PostgreSQL connection for direct roster_flight writes and pairing ID mapping.
# Set via --db-url or LEGACY_RO_DB_URL env var.


def _get_db_conn(db_url: str):
    """Return a psycopg2 connection (lazy import)."""
    import psycopg2
    return psycopg2.connect(db_url)


def fetch_rule_set_data(workset_id: int, db_url: str) -> tuple[
    list[dict[str, str]],
    list[dict[str, str]],
    list[dict[str, str]],
]:
    """Fetch rule_set, rule, rule_parameter rows from PostgreSQL for a given workset_id.

    Returns (rule_set_rows, rule_rows, param_rows).  Each row is a plain str→str dict
    ready for write_new_gz().  On any DB error returns ([], [], []).
    """
    try:
        conn = _get_db_conn(db_url)
        cur = conn.cursor()

        # rule_set entries for workset_id
        cur.execute(
            "SELECT id, workset_id, rule_id FROM rule_set WHERE workset_id = %s ORDER BY id",
            (workset_id,),
        )
        rule_set_rows: list[dict[str, str]] = [
            {"id": str(r[0]), "workset_id": str(r[1]), "rule_id": str(r[2])}
            for r in cur.fetchall()
        ]

        rule_ids = [int(r["rule_id"]) for r in rule_set_rows]
        if not rule_ids:
            conn.close()
            print(f"[INFO] No rule_set entries for workset_id={workset_id}", file=sys.stderr)
            return [], [], []

        # rule rows
        cur.execute(
            """SELECT id, function, instance, class, description, reference, category,
                      store_structure, source, detail, overridability, severity,
                      filiale, division, owner, locked, exception_code
               FROM rule WHERE id = ANY(%s) ORDER BY id""",
            (rule_ids,),
        )
        rule_rows: list[dict[str, str]] = [
            {
                "id":             str(r[0]),
                "function":       str(r[1]),
                "instance":       r[2] or "",
                "class":          r[3] or "",
                "description":    r[4] or "",
                "reference":      r[5] or "",
                "category":       r[6] or "",
                "store_structure": r[7] or "",
                "source":         r[8] or "",
                "detail":         r[9] or "",
                "overridability": r[10] or "",
                "severity":       str(r[11]),
                "filiale":        r[12] or "",
                "division":       r[13] or "",
                "owner":          r[14] or "",
                "locked":         r[15] or "",
                "exception_code": r[16] or "",
            }
            for r in cur.fetchall()
        ]

        # rule_parameter rows
        cur.execute(
            """SELECT id, rule_id, phase_id, param_names, param_values, param_extra
               FROM rule_parameter WHERE rule_id = ANY(%s) ORDER BY rule_id, phase_id, id""",
            (rule_ids,),
        )
        param_rows: list[dict[str, str]] = [
            {
                "id":           str(r[0]),
                "rule_id":      str(r[1]),
                "phase_id":     str(r[2]),
                "param_names":  r[3] or "",
                "param_values": r[4] or "",
                "param_extra":  r[5] or "",
            }
            for r in cur.fetchall()
        ]

        conn.close()
        print(
            f"[INFO] rule_set={len(rule_set_rows)} rule={len(rule_rows)} "
            f"rule_parameter={len(param_rows)} (workset_id={workset_id})",
            file=sys.stderr,
        )
        return rule_set_rows, rule_rows, param_rows

    except Exception as e:
        print(f"[WARNING] rule data fetch failed: {e}", file=sys.stderr)
        return [], [], []


def build_pairing_id_map(old_pairing_rows: list[dict], db_url: str) -> dict[str, str]:
    """Map old Pairing.id → new system pairing.id via Pairing.interfaceId.

    Returns dict: old_pairing_id_str → new_pairing_id_str
    """
    # Build: interfaceId → old_pairing_id
    interface_ids: dict[str, str] = {}  # interfaceId → old id
    for r in old_pairing_rows:
        iid = r.get("interfaceId", "").strip()
        old_id = r.get("id", "").strip()
        if iid and old_id:
            interface_ids[iid] = old_id

    if not interface_ids:
        return {}

    # Batch query new DB: interface_id → new pairing.id
    try:
        conn = _get_db_conn(db_url)
        cur = conn.cursor()
        iid_list = list(interface_ids.keys())
        cur.execute(
            "SELECT id, interface_id FROM pairing WHERE interface_id = ANY(%s)",
            (iid_list,)
        )
        rows = cur.fetchall()
        conn.close()
    except Exception as e:
        print(f"[WARNING] pairing ID mapping DB query failed: {e}", file=sys.stderr)
        return {}

    # new_pairing.interface_id → new_pairing.id
    new_id_by_iid: dict[str, str] = {str(iid): str(new_id) for new_id, iid in rows}

    # Final map: old_pairing_id → new_pairing_id
    result: dict[str, str] = {}
    for iid, old_id in interface_ids.items():
        new_id = new_id_by_iid.get(iid)
        if new_id:
            result[old_id] = new_id

    print(f"[INFO] pairing ID mapping: {len(result)}/{len(interface_ids)} resolved", file=sys.stderr)
    return result


def write_ground_tasks_to_db(roster_rows: list[dict], db_url: str,
                              crew_base_map: Optional[dict[str, str]] = None) -> int:
    """Insert ground tasks (pairingId=0) from old Roster into roster_flight.

    Marks them source='CR' so they can be identified / cleaned up later.
    First deletes any existing source='CR' rows for the same crew+time window.
    Returns number of rows inserted.
    """
    ground = [r for r in roster_rows if r.get("pairingId", "0").strip() in ("", "0")]
    if not ground:
        return 0

    try:
        conn = _get_db_conn(db_url)
        cur = conn.cursor()

        inserted = 0
        cb_map = crew_base_map or {}
        for r in ground:
            crew_id     = r.get("crewId", "").strip()
            assignment  = r.get("assignment", "").strip() or r.get("label", "").strip()
            assign_grp  = r.get("assignmentGroup", "").strip() or "GRD"
            acting_rank = r.get("actingRank", "").strip() or ""
            division    = r.get("division", "P").strip() or "P"
            # base: prefer location field, then crew_base_map lookup, default 'UNK'
            base        = (r.get("location") or "").strip() or cb_map.get(crew_id, "UNK")
            sch_str     = (r.get("schStartDtUtc") or r.get("actStartDtUtc") or
                           r.get("schRestStrDtUtc") or "").strip()
            sch_end     = (r.get("schEndDtUtc") or r.get("actEndDtUtc") or
                           r.get("actRestStrDtUtc") or "").strip()

            if not crew_id or not sch_str or not sch_end:
                continue

            # Remove previous CR entries for same crew + overlapping window
            cur.execute(
                """DELETE FROM roster_flight
                   WHERE crew_id = %s
                     AND source = 'CR'
                     AND sch_str_dt_utc = %s
                     AND sch_end_dt_utc = %s""",
                (crew_id, sch_str, sch_end)
            )

            cur.execute(
                """INSERT INTO roster_flight
                   (crew_id, pairing_id, assignment_group, assignment,
                    source, acting_rank, division, base,
                    sch_str_dt_utc, sch_end_dt_utc,
                    created_by, created_at, updated_by, updated_at)
                   VALUES (%s, NULL, %s, %s, 'CR', %s, %s, %s, %s, %s,
                           'legacy-ro', NOW(), 'legacy-ro', NOW())""",
                (crew_id, assign_grp, assignment, acting_rank, division, base, sch_str, sch_end)
            )
            inserted += 1

        conn.commit()
        conn.close()
        print(f"[INFO] Inserted {inserted} ground tasks into roster_flight", file=sys.stderr)
        return inserted

    except Exception as e:
        print(f"[WARNING] roster_flight insert failed: {e}", file=sys.stderr)
        return 0


# ---------------------------------------------------------------------------
# Old-format parser
# ---------------------------------------------------------------------------

def _section_key(header_line: str) -> str:
    """Extract canonical section key from '------SectionName(N)[qualifier]:...'
    Returns e.g. 'Crew', 'Crew(COF)', 'PairingDutySegment'.
    """
    rest = header_line[6:]          # strip leading '------'
    m = re.match(r"([A-Za-z]+)\((\d+)\)(\([^)]+\))?:", rest)
    if not m:
        colon = rest.find(":")
        return rest[:colon] if colon >= 0 else rest
    name = m.group(1)
    qualifier = m.group(3) or ""    # e.g. '(COF)' or ''
    return name + qualifier


def parse_old_txt(path: Path) -> dict[str, list[dict[str, str]]]:
    """Parse old ^ -delimited text file into {section_key: [row_dict, ...]}."""
    sections: dict[str, list[dict[str, str]]] = {}
    current_key: str | None = None
    current_fields: list[str] = []
    current_rows: list[dict[str, str]] = []

    with path.open(encoding="utf-8", errors="replace") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            if line.startswith("------"):
                if current_key is not None:
                    sections[current_key] = current_rows
                current_key = _section_key(line)
                colon = line.find(":")
                current_fields = line[colon + 1:].split(",") if colon >= 0 else []
                current_rows = []
            elif current_key is not None and line.strip():
                parts = line.split(SEP)
                if len(parts) < len(current_fields):
                    parts += [""] * (len(current_fields) - len(parts))
                current_rows.append(dict(zip(current_fields, parts)))

    if current_key is not None:
        sections[current_key] = current_rows

    return sections


# ---------------------------------------------------------------------------
# New-format writer
# ---------------------------------------------------------------------------

def _csv_escape(value: str) -> str:
    """Minimal CSV escaping: quote values that contain comma, quote, or newline."""
    if ',' in value or '"' in value or '\n' in value:
        return '"' + value.replace('"', '""') + '"'
    return value


def write_new_gz(dest: io.BytesIO, sections: dict[str, list[dict[str, str]]]) -> None:
    buf = io.StringIO()
    for section_name, rows in sections.items():
        buf.write(f"## {section_name}\n")
        if rows:
            fieldnames = list(rows[0].keys())
            buf.write(",".join(fieldnames) + "\n")
            for row in rows:
                buf.write(",".join(_csv_escape(row.get(f, "")) for f in fieldnames) + "\n")
        buf.write("\n")
    with gzip.GzipFile(fileobj=dest, mode="wb") as gz:
        gz.write(buf.getvalue().encode("utf-8"))


# ---------------------------------------------------------------------------
# Field-mapping helpers
# ---------------------------------------------------------------------------

def _get(row: dict, *keys: str, default: str = "") -> str:
    for k in keys:
        v = row.get(k, "")
        if v:
            return v
    return default


def _build_duty_lookup(duty_rows: list[dict]) -> dict[str, dict]:
    """Build id → duty_row map for joining PairingDutySegment → PairingDuty."""
    return {r.get("id", ""): r for r in duty_rows if r.get("id")}


# ---------------------------------------------------------------------------
# input.gz converter (old ro_input.txt → new ## CSV gz)
# ---------------------------------------------------------------------------

def convert_input(old_sections: dict[str, list[dict]],
                  pairing_id_map: Optional[dict[str, str]] = None,
                  fill_map: Optional[dict[tuple[str, str], int]] = None,
                  db_url: Optional[str] = None,
                  default_workset_id: int = 103) -> dict[str, list[dict[str, str]]]:
    new: dict[str, list[dict[str, str]]] = {}

    # --- crew (from main Crew section, not COF) ---
    crew_rows = old_sections.get("Crew", [])
    new["crew"] = [
        {
            "crew_id":       _get(r, "crewId"),
            "first_name":    _get(r, "firstName"),
            "middle_name":   _get(r, "middleName"),
            "last_name":     _get(r, "lastName"),
            "division":      _get(r, "division"),
            "seniority_num": _get(r, "seniorityNum"),
            "filiale":       _get(r, "filiale"),
            "gender":        _get(r, "gender"),
            "empl_dt":       _get(r, "emplDt"),
        }
        for r in crew_rows
    ]

    # --- crew_base (keep only latest eff_dt per crew) ---
    base_best: dict[str, dict[str, str]] = {}
    for r in old_sections.get("CrewBase", []):
        cid = _get(r, "crewId")
        eff = _get(r, "effDt")
        cur = base_best.get(cid)
        if not cur or eff > cur["eff_dt"]:
            base_best[cid] = {
                "crew_id":       cid,
                "base":          _get(r, "base"),
                "eff_dt":        eff,
                "exp_dt":        _get(r, "expDt"),
                "is_prime_base": _get(r, "isPrimeBase"),
            }
    new["crew_base"] = list(base_best.values())

    # --- crew_rank ---
    new["crew_rank"] = [
        {
            "crew_id":   _get(r, "crewId"),
            "rank":      _get(r, "rank"),
            "ac_type":   _get(r, "acType"),
            "fleet_grp": _get(r, "fleetGrp"),
            "eff_dt":    _get(r, "effDt"),
            "exp_dt":    _get(r, "expDt"),
            "division":  _get(r, "division"),
        }
        for r in old_sections.get("CrewRank", [])
    ]

    # --- crew_fleet (optional, for display) ---
    new["crew_fleet"] = [
        {
            "crew_id":        _get(r, "crewId"),
            "fleet_specific": _get(r, "fleetSpecific"),
            "ac_type":        _get(r, "acType"),
            "fleet_grp":      _get(r, "fleetGrp"),
            "eff_dt":         _get(r, "effDt"),
            "exp_dt":         _get(r, "expDt"),
        }
        for r in old_sections.get("CrewFleet", [])
    ]

    # Assignment groups that represent ground tasks (not flight pairings).
    _GROUND_GROUPS = {"SBY", "DO", "VAC", "SIM", "TRN", "ADM", "OFF", "SLV", "GND", "GRD", "LVE"}

    # --- pairing (map old ID → new ID so ASSIGNMENTS can match) ---
    pid_map = pairing_id_map or {}
    new["pairing"] = [
        {
            "id":               pid_map.get(_get(r, "id"), _get(r, "id")),
            "pairing_label":    _get(r, "label"),
            "base":             _get(r, "base"),
            "filiale":          _get(r, "filiale"),
            "division":         _get(r, "division"),
            "fleet":            _get(r, "fleet"),
            "sch_str_dt_utc":   _get(r, "schStrDtUtc", "actStrDtUtc"),
            "sch_end_dt_utc":   _get(r, "schEndDtUtc", "actEndDtUtc"),
            "assignment_group": _get(r, "assignmentGroup"),
            # Normalize assignment for ground-type pairings so individual
            # assignment color lookup works (e.g. SBY → #66CDAA teal).
            "assignment":       (_get(r, "assignmentGroup") if _get(r, "assignmentGroup") in _GROUND_GROUPS
                                 else _get(r, "assignment")),
            "tafb":             _get(r, "tafb"),
            "duration_days":    _get(r, "durationDays"),
            "comments":         _get(r, "comments"),
        }
        for r in old_sections.get("Pairing", [])
    ]

    # --- PairingDutyNode lookup: dutyId → {PICKUP/BRIEF/DEBRIEF/DROPOFF: {start_utc, end_utc}} ---
    node_by_duty: dict[str, dict[str, dict[str, str]]] = {}
    for r in old_sections.get("PairingDutyNode", []):
        did = _get(r, "dutyId")
        ntype = _get(r, "node")
        if did and ntype:
            node_by_duty.setdefault(did, {})[ntype] = {
                "start_utc": _get(r, "startUtc"),
                "end_utc": _get(r, "endUtc"),
            }

    # --- pairing_segment (join with PairingDuty for duty-level fields) ---
    duty_by_id = _build_duty_lookup(old_sections.get("PairingDuty", []))

    seg_rows: list[dict[str, str]] = []
    for r in old_sections.get("PairingDutySegment", []):
        duty_id = r.get("pairingDutyId", "")
        duty = duty_by_id.get(duty_id, {})
        nodes = node_by_duty.get(duty_id, {})

        # Prefer schStartDtUtc/schEndDtUtc for scheduled time; fall back to actStr/actEnd
        sch_str = _get(r, "schStartDtUtc", "actStrDtUtc")
        sch_end = _get(r, "schEndDtUtc", "actEndDtUtc")

        pickup  = nodes.get("PICKUP", {})
        brief   = nodes.get("BRIEF", {})
        debrief = nodes.get("DEBRIEF", {})
        dropoff = nodes.get("DROPOFF", {})

        old_pid = _get(r, "pairingId")
        seg_rows.append({
            "pairing_id":         pid_map.get(old_pid, old_pid),
            "duty_seq":           _get(r, "dutySeq"),
            "seg_seq":            _get(r, "segSeq"),
            "flt_id":             _get(r, "fltId"),
            "flt_dt":             _get(r, "fltDt"),
            "flt_num":            _get(r, "fltNum"),
            "airline":            _get(r, "airline"),
            "dep_arp":            _get(r, "depArp"),
            "arv_arp":            _get(r, "arvArp"),
            "fleet":              _get(r, "fleet"),
            "seg_assignment":     _get(r, "assignment"),
            "sch_str_dt_utc":     sch_str,
            "sch_end_dt_utc":     sch_end,
            # duty-level fields from PairingDuty
            "duty_str_arp":       _get(duty, "strArp", "startAirport"),
            "duty_end_arp":       _get(duty, "endArp", "endAirport"),
            "duty_sch_str_dt_utc": _get(duty, "actStrDtUtc"),
            "duty_sch_end_dt_utc": _get(duty, "actEndDtUtc"),
            "duty_sch_rest_min":         _get(duty, "actualRestMinutes", "minimalRestMinutes"),
            "duty_act_rest_min":         _get(duty, "actualRestMinutes"),
            "duty_act_credited_minutes": _get(duty, "creditedMinutes"),
            # duty node fields from PairingDutyNode
            "pickup_start_utc":   pickup.get("start_utc", ""),
            "pickup_end_utc":     pickup.get("end_utc", ""),
            "brief_start_utc":    brief.get("start_utc", ""),
            "brief_end_utc":      brief.get("end_utc", ""),
            "debrief_start_utc":  debrief.get("start_utc", ""),
            "debrief_end_utc":    debrief.get("end_utc", ""),
            "dropoff_start_utc":  dropoff.get("start_utc", ""),
            "dropoff_end_utc":    dropoff.get("end_utc", ""),
        })

    # Compute duty-level rest/layover from gaps between consecutive duties within each pairing.
    # Old PairingDuty.actualRestMinutes is always 0; derive dynamically.
    # Default 600 min (10 hours) for the last duty or when computation fails.
    _duty_end: dict[tuple[str, str], str] = {}
    _duty_str: dict[tuple[str, str], str] = {}
    for seg in seg_rows:
        key = (seg["pairing_id"], seg["duty_seq"])
        if key not in _duty_end:
            _duty_end[key] = seg["duty_sch_end_dt_utc"]
            _duty_str[key] = seg["duty_sch_str_dt_utc"]

    _rest_cache: dict[tuple[str, str], int] = {}
    _pairing_duties: dict[str, list[str]] = {}
    for pid, dseq in _duty_end:
        _pairing_duties.setdefault(pid, []).append(dseq)

    for pid, dseqs in _pairing_duties.items():
        dseqs.sort(key=lambda x: int(x) if x.isdigit() else 0)
        for i, dseq in enumerate(dseqs):
            key = (pid, dseq)
            if i + 1 < len(dseqs):
                nxt_key = (pid, dseqs[i + 1])
                try:
                    cur_end = datetime.fromisoformat(_duty_end[key])
                    nxt_str = datetime.fromisoformat(_duty_str[nxt_key])
                    gap = int((nxt_str - cur_end).total_seconds() / 60)
                    _rest_cache[key] = max(0, gap)
                except (ValueError, KeyError):
                    _rest_cache[key] = 600
            else:
                _rest_cache[key] = 600  # last duty in pairing

    # Apply computed rest to segments (only override when old value is 0 or empty)
    for seg in seg_rows:
        key = (seg["pairing_id"], seg["duty_seq"])
        rest = _rest_cache.get(key)
        if rest is not None:
            old_val = seg.get("duty_sch_rest_min", "")
            if not old_val or old_val == "0":
                seg["duty_sch_rest_min"] = str(rest)
                seg["duty_act_rest_min"] = str(rest)

    new["pairing_segment"] = seg_rows

    # --- flight ---
    new["flight"] = [
        {
            "id":            _get(r, "id"),
            "flt_num":       _get(r, "fltNum"),
            "dep_arp":       _get(r, "depArp"),
            "arv_arp":       _get(r, "arvArp"),
            "sch_dep_dt_utc": _get(r, "schDepDtUtc"),
            "sch_arv_dt_utc": _get(r, "schArvDtUtc"),
            "fleet":         _get(r, "fleet"),
            "register":      _get(r, "register"),
            "airline":       _get(r, "airline"),
        }
        for r in old_sections.get("Flight", [])
    ]

    # --- scenario metadata (for reference) ---
    sc_rows = old_sections.get("Scenario", [])
    rule_set_id_str = str(default_workset_id)
    if sc_rows:
        sc = sc_rows[0]
        # ruleSetId may be absent in older Java exports — fall back to default
        rule_set_id_str = _get(sc, "ruleSetId") or str(default_workset_id)
        new["scenario"] = [{
            "id":          _get(sc, "worksetId"),
            "str_dt_loc":  _get(sc, "strDtLoc"),
            "end_dt_loc":  _get(sc, "endDtLoc"),
            "division":    _get(sc, "division"),
            "name":        _get(sc, "name"),
            "rule_set_id": rule_set_id_str,
        }]
    else:
        new["scenario"] = []

    # --- rule_set / rule / rule_parameter from PostgreSQL ---
    workset_id_for_rules = int(rule_set_id_str) if rule_set_id_str.isdigit() else default_workset_id
    if db_url:
        rs_rows, r_rows, rp_rows = fetch_rule_set_data(workset_id_for_rules, db_url)
    else:
        rs_rows, r_rows, rp_rows = [], [], []
    new["rule_set"] = rs_rows
    new["rule"] = r_rows
    new["rule_parameter"] = rp_rows

    # --- pairing_composition (plan per rank, fill from assignments) ---
    fm = fill_map or {}
    pid_map = pairing_id_map or {}
    new["pairing_composition"] = [
        {
            "pairing_id":  pid_map.get(_get(r, "pairingId"), _get(r, "pairingId")),
            "acting_rank": _get(r, "actingRank"),
            "plan":        _get(r, "planValue"),
            "fill":        str(fm.get((pid_map.get(_get(r, "pairingId"), _get(r, "pairingId")), _get(r, "actingRank")), 0)),
            "is_deleted":  "1" if _get(r, "isDeleted").lower() == "true" else "0",
        }
        for r in old_sections.get("PairingComposition", [])
    ]
    n_comp = len(new["pairing_composition"])
    print(f"[INFO] pairing_composition: {n_comp} slots", file=sys.stderr)

    return new


# ---------------------------------------------------------------------------
# output.gz converter (old ro_output.txt → new ## CSV gz)
# ---------------------------------------------------------------------------

def convert_output(old_output: dict[str, list[dict]],
                   old_input: dict[str, list[dict]],
                   pairing_id_map: Optional[dict[str, str]] = None) -> dict[str, list[dict[str, str]]]:
    """Convert old-format output to new ## CSV gz sections.

    pairing_id_map: old_pairing_id_str → new_pairing_id_str (from build_pairing_id_map)
    """
    new: dict[str, list[dict[str, str]]] = {}
    pid_map = pairing_id_map or {}

    # Only process Roster rows where source='CR' (optimizer-produced assignments).
    # source='PA' etc. are pre-assignment input constraints, not optimizer output.
    roster_rows = old_output.get("Roster", [])
    cr_rows = [r for r in roster_rows if _get(r, "source").strip() == "CR"]
    print(f"[INFO] Roster rows: {len(roster_rows)} total, {len(cr_rows)} with source=CR", file=sys.stderr)

    # Assignment groups that represent ground tasks (not flight pairings).
    # The PBS optimizer may assign non-zero pairingIds to these, but they should
    # be rendered as standalone ground items with their own colors in the Gantt.
    GROUND_GROUPS = {"SBY", "DO", "VAC", "SIM", "TRN", "ADM", "OFF", "SLV", "GND", "GRD", "LVE"}

    def assignment_key(row: dict) -> Optional[tuple[str, str]]:
        old_pid = _get(row, "pairingId").strip()
        crew_id = _get(row, "crewId").strip()
        if not crew_id or not old_pid or old_pid == "0":
            return None
        base_old_pid = re.sub(r'_(CA|FO)$', '', old_pid)
        return crew_id, pid_map.get(base_old_pid, base_old_pid)

    preassigned_pairing_keys: set[tuple[str, str]] = set()
    for section_name in ("Roster", "RosterFlight"):
        for r in old_input.get(section_name, []):
            if _get(r, "source").strip() == "CR":
                continue
            key = assignment_key(r)
            if key:
                preassigned_pairing_keys.add(key)
    for r in old_output.get("RosterFlight", []):
        if _get(r, "source").strip() == "CR":
            continue
        key = assignment_key(r)
        if key:
            preassigned_pairing_keys.add(key)

    # ASSIGNMENTS from CR rows (pairingId != 0 → flight pairing assignments)
    assignments: list[dict[str, str]] = []
    skipped_no_map = 0
    for r in cr_rows:
        old_pid = _get(r, "pairingId").strip()
        if not old_pid or old_pid == "0":
            continue  # ground task handled in ROSTER section
        ag = _get(r, "assignmentGroup").strip()
        if ag in GROUND_GROUPS:
            continue  # ground-type task, routed to ROSTER section below
        crew_id = _get(r, "crewId").strip()
        acting_rank = _get(r, "actingRank").strip()
        if not crew_id:
            continue

        # Strip rank suffix (_CA, _FO) from old pairing ID. The old system
        # appends the acting rank to pairing IDs in the Roster section, but
        # the Pairing section stores the base ID without suffix.
        base_old_pid = re.sub(r'_(CA|FO)$', '', old_pid)

        # Map old pairing ID → new system pairing ID via interfaceId
        new_pid = pid_map.get(base_old_pid, base_old_pid)
        if base_old_pid not in pid_map:
            skipped_no_map += 1

        source = "PA" if (crew_id, new_pid) in preassigned_pairing_keys else "CR"
        assignments.append({
            "crew_id":     crew_id,
            "pairing_id":  new_pid,
            "acting_rank": acting_rank,
            "base_match":  "0",
            "source":      source,
        })

    if skipped_no_map:
        print(f"[WARNING] {skipped_no_map} Roster rows had no pairing ID mapping (used old ID as fallback)",
              file=sys.stderr)

    # Pre-occupied pairing assignments from input Roster section (source != CR).
    # New ro_output.txt only carries CR optimizer rows; pre-occupied assignments
    # that were locked before the optimizer ran must come from the input file.
    pre_assign_count = 0
    seen_assign: set[tuple[str, str]] = {(a["crew_id"], a["pairing_id"]) for a in assignments}
    for r in old_input.get("Roster", []):
        old_pid = _get(r, "pairingId").strip()
        if not old_pid or old_pid == "0":
            continue
        ag = _get(r, "assignmentGroup").strip()
        if ag in GROUND_GROUPS:
            continue  # ground-type handled in ROSTER section
        crew_id = _get(r, "crewId").strip()
        if not crew_id:
            continue
        base_old_pid = re.sub(r'_(CA|FO)$', '', old_pid)
        new_pid = pid_map.get(base_old_pid, base_old_pid)
        key = (crew_id, new_pid)
        if key in seen_assign:
            continue  # CR already covers this crew+pairing
        seen_assign.add(key)
        assignments.append({
            "crew_id":     crew_id,
            "pairing_id":  new_pid,
            "acting_rank": _get(r, "actingRank").strip(),
            "base_match":  "0",
            "source":      "PA",
        })
        pre_assign_count += 1
    print(f"[INFO] Pre-occupied pairing assignments from input: {pre_assign_count}", file=sys.stderr)

    new["ASSIGNMENTS"] = assignments

    # ROSTER — ground tasks from CR rows: pairingId=0 always, plus ground-group tasks
    # that have non-zero pairingIds (e.g. SBY standby "pairings").
    ground_rows: list[dict[str, str]] = []
    for r in cr_rows:
        old_pid = _get(r, "pairingId").strip()
        ag = _get(r, "assignmentGroup").strip()
        is_ground_group = ag in GROUND_GROUPS
        if old_pid and old_pid != "0" and not is_ground_group:
            continue  # flight pairing assignment already in ASSIGNMENTS
        crew_id = _get(r, "crewId").strip()
        if not crew_id:
            continue
        sch_str = _get(r, "schStartDtUtc", "actStartDtUtc", "schRestStrDtUtc").strip()
        sch_end = _get(r, "schEndDtUtc", "actEndDtUtc", "actRestStrDtUtc").strip()
        if not sch_str or not sch_end:
            continue
        ag_final = ag or "GRD"
        ground_rows.append({
            "crew_id":          crew_id,
            "assignment_group": ag_final,
            # Use assignmentGroup as assignment so individual-assignment color
            # lookup works (e.g. SBY → #66CDAA teal from assignment table).
            # Old codes like PRPM/PRAM don't exist in the new system.
            "assignment":       ag_final,
            "sch_str_dt_utc":   sch_str,
            "sch_end_dt_utc":   sch_end,
            "acting_rank":      _get(r, "actingRank"),
            "source":           "CR",
        })

    # Pre-occupied ground tasks from input RosterGround section.
    # New ro_output.txt only carries CR rows; pre-existing VAC/SBY/DO etc.
    # must be sourced from the input file.
    seen_ground: set[tuple[str, str, str]] = {
        (g["crew_id"], g["sch_str_dt_utc"], g["sch_end_dt_utc"]) for g in ground_rows
    }
    pre_ground_count = 0
    for r in old_input.get("RosterGround", []):
        crew_id = _get(r, "crewId").strip()
        if not crew_id:
            continue
        sch_str = _get(r, "strDtUtc").strip()
        sch_end = _get(r, "endDtUtc").strip()
        if not sch_str or not sch_end:
            continue
        key = (crew_id, sch_str, sch_end)
        if key in seen_ground:
            continue  # already covered by a CR row
        seen_ground.add(key)
        # Use the specific assignment code (VAC, SBY…) for color lookup;
        # assignmentGroup is always 'GRD' in this section, not useful for coloring.
        actual_code = _get(r, "assignment", "label").strip() or "GRD"
        ground_rows.append({
            "crew_id":          crew_id,
            "assignment_group": actual_code,
            "assignment":       actual_code,
            "sch_str_dt_utc":   sch_str,
            "sch_end_dt_utc":   sch_end,
            "acting_rank":      "",
            "source":           "PA",
        })
        pre_ground_count += 1
    print(f"[INFO] Pre-occupied ground tasks from input: {pre_ground_count}", file=sys.stderr)

    new["ROSTER"] = ground_rows
    print(f"[INFO] ROSTER section total: {len(ground_rows)} ground task rows", file=sys.stderr)

    # KPI
    new["KPI"] = [{
        "total_pairings":    str(len(old_input.get("Pairing", []))),
        "fully_covered":     str(len({a["pairing_id"] for a in assignments})),
        "total_crews":       str(len(old_input.get("Crew", []))),
        "total_assignments": str(len(assignments)),
    }]

    # RESULT_META
    sc_rows = old_output.get("Scenario", old_input.get("Scenario", []))
    sc = sc_rows[0] if sc_rows else {}
    new["RESULT_META"] = [{
        "status":            "DONE",
        "solve_time_sec":    "0",
        "total_assignments": str(len(assignments)),
        "total_pairings":    str(len(old_input.get("Pairing", []))),
        "total_crews":       str(len(old_input.get("Crew", []))),
        "total_iterations":  "0",
        "dual_bound":        "0.0000",
        "primal_obj":        "0.0000",
        "error":             "",
        "generated_at":      "",
    }]

    return new


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    import os
    parser = argparse.ArgumentParser(description="Convert old ro format to new ## CSV gz")
    parser.add_argument("--input-txt",  required=True, type=Path)
    parser.add_argument("--output-txt", required=True, type=Path)
    parser.add_argument("--input-gz",   required=True, type=Path)
    parser.add_argument("--output-gz",  required=True, type=Path)
    parser.add_argument("--db-url",     default=os.environ.get("LEGACY_RO_DB_URL"),
                        help="PostgreSQL URL for pairing ID mapping and roster_flight writes")
    args = parser.parse_args()

    if not args.db_url:
        print("ERROR: --db-url or LEGACY_RO_DB_URL is required", file=sys.stderr)
        return 2

    if not args.input_txt.exists():
        print(f"ERROR: input txt not found: {args.input_txt}", file=sys.stderr)
        return 1
    if not args.output_txt.exists():
        print(f"ERROR: output txt not found: {args.output_txt}", file=sys.stderr)
        return 1

    print("Parsing ro_input.txt ...", file=sys.stderr)
    old_input = parse_old_txt(args.input_txt)
    print(f"  sections: {list(old_input.keys())}", file=sys.stderr)

    print("Parsing ro_output.txt ...", file=sys.stderr)
    old_output = parse_old_txt(args.output_txt)
    print(f"  sections: {list(old_output.keys())}", file=sys.stderr)

    # Build pairing ID mapping via DB: old Pairing.interfaceId → new pairing.id
    print("Building pairing ID mapping ...", file=sys.stderr)
    pairing_id_map = build_pairing_id_map(old_input.get("Pairing", []), args.db_url)

    # Convert output FIRST so we can derive fill counts from the full assignment set.
    print("Converting output → output.gz ...", file=sys.stderr)
    new_output = convert_output(old_output, old_input, pairing_id_map)
    buf = io.BytesIO()
    write_new_gz(buf, new_output)
    args.output_gz.write_bytes(buf.getvalue())
    print(f"  wrote {args.output_gz} ({args.output_gz.stat().st_size} bytes)", file=sys.stderr)

    # Build fill map: (pairing_id, acting_rank) → count of assigned crew
    fill_map: dict[tuple[str, str], int] = {}
    for a in new_output.get("ASSIGNMENTS", []):
        key = (a["pairing_id"], a["acting_rank"])
        fill_map[key] = fill_map.get(key, 0) + 1
    print(f"[INFO] fill_map: {len(fill_map)} (pairing, rank) pairs resolved", file=sys.stderr)

    print("Converting input → input.gz ...", file=sys.stderr)
    new_input = convert_input(old_input, pairing_id_map, fill_map, db_url=args.db_url)
    buf = io.BytesIO()
    write_new_gz(buf, new_input)
    args.input_gz.write_bytes(buf.getvalue())
    print(f"  wrote {args.input_gz} ({args.input_gz.stat().st_size} bytes)", file=sys.stderr)

    n_assign = len(new_output.get("ASSIGNMENTS", []))
    print(f"Done. assignments={n_assign}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
