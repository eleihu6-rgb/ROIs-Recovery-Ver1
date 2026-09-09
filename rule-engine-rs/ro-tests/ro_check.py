#!/usr/bin/env python3
"""
ro_check.py — replay F8 RO legality checks (same Engine as formal scenario RO).

Reads from this directory:
  ro_input.txt      — RO scenario file (^-delimited section format)
  assignments.txt   — crew/pairing assignment rounds (see assignments.txt.example)

Engine assembly matches formal F8 Rust RO (ro_rust.sh → wrapper → RustRuleChecker):
  shared extras (manday/duty/seg/is_rest) via set_next_engine_extras
  + rust_checker base (Roster-only flying PA; not RosterFlight)

assignments.txt: alternating ``crew: <id>`` / ``pairing: id,id,...`` lines. Each block is
one **round**. Within a round, pairings are tried in order. Successful assigns stay in a
per-crew ``accepted`` list and are passed as check_line candidates on later tries
(accepted+[new]) — Engine is built once; no per-step rebuild / fixed mutation.
After check_line OK, mirrors PBS: ``can_add_complement`` then ``commit_complement``
(dispatches ``commit_pairing_8030`` / ``8072``) so later rounds see prior COF.

Optimizer baseline: Counter multiset diff vs PA-only line (RustRuleChecker.bind baseline).

Usage:
  python3 ro_check.py

Writes SVG report to results_ro.svg in this directory.
"""

from __future__ import annotations

import sys
from pathlib import Path


def _prefer_venv_site_packages() -> None:
    """Prefer ~/.venv wheels when the interpreter is /usr/bin/python3 (user-site stale copy)."""
    venv_lib = Path.home() / ".venv" / "lib"
    if not venv_lib.is_dir():
        return
    for pkg in sorted(venv_lib.glob("python*/site-packages"), reverse=True):
        if not pkg.is_dir():
            continue
        sp = str(pkg.resolve())
        if sp not in sys.path:
            sys.path.insert(0, sp)
        break


_prefer_venv_site_packages()

# ── Import the canonical ro_input parser from ro-engine ──────────────────────
# Single source of truth: ro_input_parser.py owns the parsing logic.
# Thin adapter below converts DataFrames → dict-rows so all consumers are unchanged.
_ROENGINE_PBS = (
    Path(__file__).parents[2]
    / "pbs-engine"
)
_ROENGINE_IO = _ROENGINE_PBS / "ColumnModelSolver_python" / "io"
# ro_input_parser.py depends on pandas, which lives in the ro-engine venv.
_ROENGINE_VENV_SP = _ROENGINE_PBS / ".venv" / "lib" / "python3.12" / "site-packages"
# ro_input_parser.py (the parse target) goes to the front so it's found first.
# The ro-engine venv (pandas source) goes to the END so it only fills gaps —
# it must not shadow the user's rois_rule_engine_rs install.
if _ROENGINE_IO.is_dir() and str(_ROENGINE_IO) not in sys.path:
    sys.path.insert(0, str(_ROENGINE_IO))
# pbs-engine root is required so the ColumnModelSolver_python PACKAGE (and its
# relative imports) resolve — the same path f8_official_engine inserts. Used
# to CALL, not modify, the solver's DO exporter below.
if _ROENGINE_PBS.is_dir() and str(_ROENGINE_PBS) not in sys.path:
    sys.path.append(str(_ROENGINE_PBS))
if _ROENGINE_VENV_SP.is_dir() and str(_ROENGINE_VENV_SP) not in sys.path:
    sys.path.append(str(_ROENGINE_VENV_SP))
from ro_input_parser import parse_ro_input as _parse_ro_input  # noqa: E402
# Read-only call into the PBS solver's DO exporter (no pbs-engine edit): fills a
# crew's complement days with DO rows. See auto-fill-do below.
from ColumnModelSolver_python.io.result_converter import (  # noqa: E402
    REAL_ROSTER_FIELDS,
    append_generated_dayoff_rows,
    build_context,
)

import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any

from airport_tz import (
    crew_offsets_at,
    format_local,
    format_utc_offset_label,
    offset_min_at,
    parse_airport_zones,
    resolve_zone,
    utc_ts_to_local,
)
from baseline_diff import diff_raw as _diff_raw
from live_alert_messages import (
    dedupe_violations_for_display,
    format_live_style_message,
)

HERE = Path(__file__).parent


def _build_manday_baseline(rows) -> dict[str, list[tuple[int, float]]]:
    """crew_id → [(day_ord, blh_minutes)] from CrewMandayFd rows.

    blh is stored as INTEGER MINUTES in the DB (no ×60). Accepts plain dict rows
    (as returned by sections["CrewMandayFd"]["rows"]).
    """
    _EPOCH = date(1970, 1, 1)
    baseline: dict[str, list[tuple[int, float]]] = {}
    for row in rows:
        cid = str(row.get("crewId", ""))
        blh = float(row.get("blh") or 0)
        if not cid or blh == 0.0:
            continue
        dt_s = str(row.get("crewBaseDt", ""))
        try:
            dt = date.fromisoformat(dt_s[:10])
        except ValueError:
            continue
        day_ord_val = (dt - _EPOCH).days
        baseline.setdefault(cid, []).append((day_ord_val, blh))
    return baseline


def _build_manday_metric_baseline(rows, metric_key: str) -> dict[str, list[tuple[int, float]]]:
    """crew_id → [(day_ord, metric_minutes)] from CrewMandayFd rows."""
    _EPOCH = date(1970, 1, 1)
    baseline: dict[str, list[tuple[int, float]]] = {}
    for row in rows:
        cid = str(row.get("crewId", ""))
        try:
            metric = float(row.get(metric_key) or 0)
        except (TypeError, ValueError):
            continue
        if not cid or metric == 0.0:
            continue
        dt_s = str(row.get("crewBaseDt", ""))
        try:
            dt = date.fromisoformat(dt_s[:10])
        except ValueError:
            continue
        day_ord_val = (dt - _EPOCH).days
        baseline.setdefault(cid, []).append((day_ord_val, metric))
    return baseline


def _blk_by_day_for_hover(
    *,
    cid: str,
    crew_idx: int,
    pa_idxs: list[int],
    cand_idxs: list[int],
    manday_blh: dict[str, list[tuple[int, float]]],
    engine: Any,
) -> dict[date, float]:
    """Per-day BLK for SVG day-header hover — same composition as rule 8002.

    Combined daily BH:
      base  = CrewMandayFd.blh  if present
            else SPAN blk of PA (fixed) pairings
      +     SPAN blk of newly accepted candidate pairings

    Matches Engine.check_8002_full: manday replaces fixed recompute; candidates
    always add on top.
    """
    _EPOCH = date(1970, 1, 1)
    out: dict[date, float] = {}

    rows = manday_blh.get(cid)
    if rows:
        for day_ord, blh in rows:
            d = _EPOCH + timedelta(days=int(day_ord))
            out[d] = out.get(d, 0.0) + float(blh)
    elif pa_idxs:
        for day_ord, blk in engine.daily_blk(pa_idxs, crew_idx).items():
            d = _EPOCH + timedelta(days=int(day_ord))
            out[d] = out.get(d, 0.0) + float(blk)

    if cand_idxs:
        for day_ord, blk in engine.daily_blk(cand_idxs, crew_idx).items():
            d = _EPOCH + timedelta(days=int(day_ord))
            out[d] = out.get(d, 0.0) + float(blk)

    return out


def _dp_by_day_for_hover(
    *,
    cid: str,
    crew_idx: int,
    pa_idxs: list[int],
    cand_idxs: list[int],
    manday_dp: dict[str, list[tuple[int, float]]],
    engine: Any,
) -> dict[date, float]:
    """Per-day DP for SVG day-header hover — same composition as rule 8002."""
    _EPOCH = date(1970, 1, 1)
    out: dict[date, float] = {}

    rows = manday_dp.get(cid)
    if rows:
        for day_ord, dp in rows:
            d = _EPOCH + timedelta(days=int(day_ord))
            out[d] = out.get(d, 0.0) + float(dp)
    elif pa_idxs:
        for day_ord, dp in engine.daily_dp(pa_idxs, crew_idx).items():
            d = _EPOCH + timedelta(days=int(day_ord))
            out[d] = out.get(d, 0.0) + float(dp)

    if cand_idxs:
        for day_ord, dp in engine.daily_dp(cand_idxs, crew_idx).items():
            d = _EPOCH + timedelta(days=int(day_ord))
            out[d] = out.get(d, 0.0) + float(dp)

    return out


def _credit_by_day_for_hover(
    *,
    crew_idx: int,
    line_idxs: list[int],
    engine: Any,
) -> dict[date, float]:
    """Per-day CREDIT for SVG day-header hover — same CH as Engine 8002.

    Whole-duty formula on crew-base report day + 240 for non-rest ground.
    Does not use CrewMandayFd.credit or SPAN daily_blk/daily_dp.
    """
    _EPOCH = date(1970, 1, 1)
    out: dict[date, float] = {}
    raw = engine.daily_credit(line_idxs, crew_idx)
    for day_ord, credit in raw.items():
        d = _EPOCH + timedelta(days=int(day_ord))
        out[d] = out.get(d, 0.0) + float(credit)
    return out


def _build_manday_metrics(rows) -> dict[str, list[tuple[int, list[float]]]]:
    """crew_id → [(day_ord, [9 metrics])] from CrewMandayFd rows.

    Metric order = rre MANDAY_METRICS: [blh, ft, dp, credit, sby_present,
    int_blh, aug_blh, duty_aloft, cross_tz_count]. All stored as INTEGER
    MINUTES in the DB (same as blh); `standby` is a boolean → 0/1 presence
    (ro_input has no sbyDp magnitude column); duty_aloft = custData1 (CEBU).
    Rows where every metric is zero are dropped.
    """
    _EPOCH = date(1970, 1, 1)

    def _num(row, key) -> float:
        try:
            return float(row.get(key) or 0)
        except (TypeError, ValueError):
            return 0.0

    metrics: dict[str, list[tuple[int, list[float]]]] = {}
    for row in rows:
        cid = str(row.get("crewId", ""))
        if not cid:
            continue
        dt_s = str(row.get("crewBaseDt", ""))
        try:
            dt = date.fromisoformat(dt_s[:10])
        except ValueError:
            continue
        sby = 1.0 if str(row.get("standby") or "").strip().lower() in ("true", "1") else 0.0
        vals = [
            _num(row, "blh"),
            _num(row, "ft"),
            _num(row, "dp"),
            _num(row, "credit"),
            sby,
            _num(row, "intBlh"),
            _num(row, "augumentBlh"),
            _num(row, "custData1"),
            _num(row, "crossTzDutyCount"),
        ]
        if all(v == 0.0 for v in vals):
            continue
        metrics.setdefault(cid, []).append(((dt - _EPOCH).days, vals))
    return metrics


# ── date/time helpers ─────────────────────────────────────────────────────────
def date_ord(s: str) -> int:
    """Days since 1970-01-01."""
    return (date.fromisoformat(s[:10]) - date(1970, 1, 1)).days


def epoch(s: str) -> int:
    """UTC epoch seconds from ISO datetime string (no offset assumed = UTC)."""
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def hhmm_min(s: str) -> int:
    """'HH:MM' → total minutes."""
    h, m = s.strip().split(":")
    return int(h) * 60 + int(m)


# ── rule 8002 full-port param helpers (kept in sync with rust_checker.py) ────

# Types ported to Rust; the other 9 C++ types (WP, TOTAL WP, PFT, FDP,
# DP-NON-RB-PNC, PH, DP-SBY-PNC, DP-WITHOUT-SBY-PNC, COSMIC) warn + drop.
_CUM_TYPES_SUPPORTED = frozenset({"BH", "DP", "FT", "CH"})


def _pipe_list(s: str) -> list[str]:
    """Pipe-separated OR list; empty / '*' → the ['*'] wildcard."""
    s = (s or "").strip()
    if not s or s == "*":
        return ["*"]
    return [x.strip() for x in s.split("|") if x.strip()] or ["*"]


def _limit_min(s: str, default: int) -> int:
    """'HH:MM' → minutes, plain int passes through; '*'/bad → default
    (C++ parseRuleParam8002: iMax→999999, iMin→0 on failure)."""
    s = (s or "").strip()
    if not s or s == "*":
        return default
    try:
        return hhmm_min(s) if ":" in s else int(s)
    except ValueError:
        return default


def _band_pair(s: str) -> tuple[int, int]:
    """'HH:MM-HH:MM' → (lower, upper) minutes; '*'/absent → (-1, -1)."""
    s = (s or "").strip()
    if not s or s == "*" or "-" not in s:
        return (-1, -1)
    lo, hi = s.split("-", 1)
    try:
        return (hhmm_min(lo), hhmm_min(hi))
    except ValueError:
        return (-1, -1)


def _is_active_row(row: dict[str, str], deleted_key: str = "isDeleted") -> bool:
    return (row.get(deleted_key) or "false").strip().lower() != "true"


def _pairing_time_bounds(row: dict[str, str]) -> tuple[str, str, str]:
    """Return (start, duty_end, rest_end) ISO strings from a Pairing row.

    rest_end here is provisional (pairing actEnd). Real post-duty REST is
    applied later from PairingDuty actualRestMinutes/minimalRestMinutes —
    same source Live/Scenario gantt uses (dutyActRestMin / dutySchRestMin).
    """
    start = (row.get("actStrDtUtc") or row.get("schStrDtUtc") or "").strip()
    duty_end = (row.get("schEndDtUtc") or row.get("actEndDtUtc") or "").strip()
    rest_end = (row.get("actEndDtUtc") or duty_end or "").strip()
    if start and duty_end and rest_end:
        try:
            if epoch(rest_end) < epoch(duty_end):
                rest_end = duty_end
        except ValueError:
            rest_end = duty_end
    return start, duty_end, rest_end


def _duty_rest_minutes(row: dict[str, str]) -> int:
    """Post-duty rest minutes — prefer actual, fall back to minimal (Live order)."""
    for key in ("actualRestMinutes", "minimalRestMinutes"):
        raw = (row.get(key) or "").strip()
        if not raw:
            continue
        try:
            minutes = int(float(raw))
        except ValueError:
            continue
        if minutes > 0:
            return minutes
    return 0


def _iso_utc_from_epoch(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _apply_pairing_rest_from_duties(
    pairing_info: dict[str, dict],
    pairing_duty_rows: dict[str, list[dict[str, str]]],
) -> None:
    """Set rest_end so SVG REST trails the pairing puck (Live/Scenario style).

    Rest minutes come from the last PairingDuty (actualRestMinutes, else
    minimalRestMinutes). Anchor is the puck end (pairing duty_end).
    """
    for pid, duties in pairing_duty_rows.items():
        info = pairing_info.get(pid)
        if not info or not duties:
            continue
        last = duties[-1]
        rest_min = int(last.get("rest_min") or 0)
        if rest_min <= 0:
            continue
        end_s = (info.get("duty_end") or last.get("end") or "").strip()
        if not end_s:
            continue
        try:
            rest_end_ts = epoch(end_s) + rest_min * 60
        except ValueError:
            continue
        info["rest_end"] = _iso_utc_from_epoch(rest_end_ts)
        info["rest_min"] = rest_min


def _fmt_pairing_dep_arr_times(
    info: dict[str, Any],
    airport_zones: dict[str, str],
) -> str:
    """Local pairing start at departure airport, end at arrival airport."""
    if not info.get("start") or not info.get("duty_end"):
        return ""
    dep = (info.get("dep") or info.get("base") or "?").strip()
    arv = (info.get("arv") or info.get("base") or "?").strip()
    try:
        start_ts = epoch(info["start"])
        end_ts = epoch(info["duty_end"])
    except (ValueError, TypeError):
        return ""
    start_s = format_local(start_ts, dep, airport_zones, "%m-%d %H:%M")
    end_s = format_local(end_ts, arv, airport_zones, "%m-%d %H:%M")
    return f"start={start_s}  end={end_s}"


def _add_fixed_pairing(
    crew_fixed: dict[str, list[str]],
    seen: dict[str, set[str]],
    crew_id: str,
    pairing_id: str,
) -> None:
    if not crew_id or not pairing_id:
        return
    if pairing_id in seen[crew_id]:
        return
    seen[crew_id].add(pairing_id)
    crew_fixed[crew_id].append(pairing_id)


def _parse_fixed_pairings(sections: dict[str, dict]) -> dict[str, list[str]]:
    """Roster → crew_id → ordered pairing ids (matches rust_checker / F8 RO base).

    RosterFlight is not used for Engine fixed flying PA.
    """
    crew_fixed: dict[str, list[str]] = defaultdict(list)
    seen: dict[str, set[str]] = defaultdict(set)

    for row in sections.get("Roster", {}).get("rows", []):
        if not _is_active_row(row):
            continue
        _add_fixed_pairing(
            crew_fixed,
            seen,
            row.get("crewId", "").strip(),
            row.get("pairingId", "").strip(),
        )

    return crew_fixed


def _parse_assignment_type_map(sections: dict[str, dict]) -> dict[str, str]:
    """Assignment table → assignment_code → TYPE string (e.g. 'L', 'O', 'W', …)."""
    result: dict[str, str] = {}
    for row in sections.get("Assignment", {}).get("rows", []):
        code = (row.get("assignment") or row.get("code") or "").strip()
        typ = (row.get("type") or "").strip()
        if code:
            result[code] = typ
    return result


def _parse_assignment_rest_map(sections: dict[str, dict]) -> dict[str, bool]:
    """Assignment table → assignment_code → is_rest for rule 7501 (SDFD).

    Authoritative source: the isRest column (from PG assignment.is_rest,
    added 2026-07-07; 1 iff type is L=Leave or O=Off), matching the C++
    RuleParams::isRestAssignment TYPE=="L"/"O" check. For ro_input.txt
    generated before the column existed, fall back to type in {"L","O"}.
    Mirrors engine-server/F8/ro_solver_wrapper.py:_make_ground_is_rest_params
    — kept in sync deliberately.
    """
    result: dict[str, bool] = {}
    for row in sections.get("Assignment", {}).get("rows", []):
        code = (row.get("assignment") or row.get("code") or "").strip()
        if not code:
            continue
        if "isRest" in row:
            result[code] = (row.get("isRest") or "").strip().lower() in ("true", "1")
        else:
            result[code] = (row.get("type") or "").strip().upper() in ("L", "O")
    return result


def _parse_crew_ground(
    sections: dict[str, dict],
    assignment_rest_map: dict[str, bool],
) -> dict[str, list[dict]]:
    """RosterGround → crew_id → ground duty intervals (DO, SIM, DHD, …).

    Each entry includes 'is_rest': True for leave/off-type tasks excluded from
    the rule-7501 work list; False for working ground duties (SBY/SIM/OFC/…).
    """
    crew_ground: dict[str, list[dict]] = defaultdict(list)
    for row in sections.get("RosterGround", {}).get("rows", []):
        cid = row.get("crewId", "").strip()
        start_s = (row.get("strDtUtc") or "").strip()
        end_s = (row.get("endDtUtc") or "").strip()
        if not cid or not start_s or not end_s:
            continue
        try:
            if epoch(end_s) <= epoch(start_s):
                continue
        except ValueError:
            continue
        acode = (row.get("assignment") or "").strip()
        crew_ground[cid].append(
            {
                "start": start_s,
                "end": end_s,
                "assignment": acode,
                "group": (row.get("assignmentGroup") or "").strip(),
                "label": (row.get("label") or "").strip(),
                "is_rest": assignment_rest_map.get(acode, False),
            }
        )
    return crew_ground


def _parse_crew_rank(
    sections: dict[str, dict],
    rp_start: date,
    rp_end: date,
) -> dict[str, str]:
    """crew_id → acting rank (CA/FO/…) effective during the roster period."""
    rp_start_ord = date_ord(rp_start.isoformat())
    rp_end_ord = date_ord(rp_end.isoformat())
    entries: dict[str, list[tuple[int, int, str, str]]] = defaultdict(list)

    for sec_name, sec in sections.items():
        if not sec_name.startswith("CrewRank"):
            continue
        for row in sec.get("rows", []):
            cid = row.get("crewId", "").strip()
            rank = (row.get("rank") or "").strip()
            if not cid or not rank:
                continue
            eff_s = (row.get("effDt") or "")[:10]
            exp_s = (row.get("expDt") or "")[:10]
            if not eff_s or not exp_s:
                continue
            try:
                eff_ord = date_ord(eff_s)
                exp_ord = date_ord(exp_s)
            except ValueError:
                continue
            if exp_ord < rp_start_ord or eff_ord > rp_end_ord:
                continue
            position = (row.get("position") or "").strip()
            entries[cid].append((eff_ord, exp_ord, rank, position))

    crew_rank: dict[str, str] = {}
    for cid, rows in entries.items():
        pic = [r for r in rows if r[3] == "PIC"]
        pick_from = pic if pic else rows
        pick_from.sort(key=lambda r: (-r[0], r[2]))
        crew_rank[cid] = pick_from[0][2]
    return crew_rank


def _parse_pairing_composition(
    sections: dict[str, dict],
) -> dict[str, dict[str, dict[str, int]]]:
    """pairing_id → division → actingRank → planValue."""
    comp: dict[str, dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(int))
    )
    for row in sections.get("PairingComposition", {}).get("rows", []):
        if not _is_active_row(row):
            continue
        pid = row.get("pairingId", "").strip()
        division = (row.get("division") or "P").strip()
        rank = (row.get("actingRank") or "").strip()
        if not pid or not rank:
            continue
        try:
            plan = int(row.get("planValue") or 0)
        except ValueError:
            plan = 0
        if plan > 0:
            comp[pid][division][rank] += plan
    return {pid: {div: dict(ranks) for div, ranks in divs.items()} for pid, divs in comp.items()}


def _seed_pairing_roster(
    sections: dict[str, dict],
    crew_rank: dict[str, str],
) -> dict[str, list[tuple[str, str]]]:
    """pairing_id → [(crew_id, acting_rank), …] from pre-assigned Roster / RosterFlight."""
    roster: dict[str, list[tuple[str, str]]] = defaultdict(list)
    seen: dict[str, set[str]] = defaultdict(set)

    def add(pid: str, cid: str, rank: str) -> None:
        if not pid or not cid or cid in seen[pid]:
            return
        seen[pid].add(cid)
        roster[pid].append((cid, rank or crew_rank.get(cid, "?")))

    for row in sections.get("Roster", {}).get("rows", []):
        if not _is_active_row(row):
            continue
        add(
            row.get("pairingId", "").strip(),
            row.get("crewId", "").strip(),
            (row.get("actingRank") or "").strip(),
        )

    for row in sections.get("RosterFlight", {}).get("rows", []):
        if not _is_active_row(row):
            continue
        add(
            row.get("pairingId", "").strip(),
            row.get("crewId", "").strip(),
            (row.get("actingRank") or "").strip(),
        )

    return roster


def _bare_flt_num(flt_num: str, airline: str = "") -> str:
    """Display flight number without airline prefix (F82626 → 2626 when airline=F8)."""
    s = (flt_num or "").strip()
    if not s:
        return s
    al = (airline or "").strip().upper()
    if al and s.upper().startswith(al):
        return s[len(al) :]
    m = re.match(r"^([A-Za-z][A-Za-z0-9])(\d.*)$", s)
    if m:
        return m.group(2)
    return s


def _seg_airline_code(flt_num: str, airline: str = "") -> str:
    """Airline code for tooltip A/L column (F8, PD, …)."""
    al = (airline or "").strip().upper()
    if al:
        return al
    s = (flt_num or "").strip()
    if not s:
        return ""
    m = re.match(r"^([A-Za-z][A-Za-z0-9])(\d.*)$", s)
    if m:
        return m.group(1).upper()
    return s


def _fmt_blk_min(blk_min: int) -> str:
    """Format block minutes for tooltip BH column (0 → 0:00)."""
    return f"{blk_min // 60}:{blk_min % 60:02d}"


def _seg_type_label(
    assignment: str,
    assignment_type_map: dict[str, str] | None = None,
) -> str:
    """Tooltip Type column label (FLY, DHD, SBY/RES, …)."""
    code = (assignment or "").strip().upper()
    if not code:
        return ""
    if _is_dhd_assignment(code):
        return "DHD"
    if code in {"SBY", "ASBY", "RES", "PRAM", "PRPM"}:
        return "SBY/RES"
    if code in {"SIM", "TRN", "CRE"}:
        return "SIM/TRN"
    if code == "FLY":
        return "FLY"
    atype = (assignment_type_map or {}).get(code, "").strip().upper()
    if atype == "FLY":
        return "FLY"
    if atype == "SBY":
        return "SBY/RES"
    if atype == "TRN":
        return "SIM/TRN"
    return code


def _parse_pairing_segments(
    sections: dict[str, dict],
) -> dict[str, list[dict[str, str]]]:
    """pairing_id → flight segments (for simulated RosterFlight output)."""
    segs: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in sections.get("PairingDutySegment", {}).get("rows", []):
        if not _is_active_row(row):
            continue
        pid = row.get("pairingId", "").strip()
        if not pid:
            continue
        try:
            duty_seq = int(row.get("dutySeq") or 0)
            seg_seq = int(row.get("segSeq") or 0)
        except ValueError:
            duty_seq, seg_seq = 0, 0
        segs[pid].append(
            {
                "duty_seq": str(duty_seq),
                "seg_seq": str(seg_seq),
                "assignment": (row.get("assignment") or "").strip(),
                "flt_id": row.get("fltId", "").strip(),
                "airline": (row.get("airline") or "").strip(),
                "flt_num": (row.get("fltNum") or "").strip(),
                "dep": (row.get("depArp") or row.get("depStation") or "").strip(),
                "arv": (row.get("arvArp") or row.get("arvStation") or "").strip(),
                "start": (row.get("actStrDtUtc") or "")[:16],
                "end": (row.get("actEndDtUtc") or "")[:16],
            }
        )
    for pid in segs:
        segs[pid].sort(
            key=lambda s: (int(s["duty_seq"]), int(s["seg_seq"]))
        )
    return segs


def _parse_pairing_duty_rows(sections: dict[str, dict]) -> dict[str, list[dict[str, str]]]:
    """pairing_id → PairingDuty rows sorted by dutySeq (C++ pairing->getDutyVec)."""
    by_pid: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in sections.get("PairingDuty", {}).get("rows", []):
        if not _is_active_row(row):
            continue
        pid = row.get("pairingId", "").strip()
        if not pid:
            continue
        start_s = (row.get("actStrDtUtc") or row.get("actStartDtUtc") or "").strip()
        end_s = (row.get("actEndDtUtc") or "").strip()
        if not start_s or not end_s:
            continue
        try:
            if epoch(end_s) <= epoch(start_s):
                continue
        except ValueError:
            continue
        dep = (row.get("strArp") or row.get("startAirport") or "").strip()
        arv = (row.get("endArp") or row.get("endAirport") or "").strip()
        try:
            duty_seq = int(row.get("dutySeq") or 0)
        except ValueError:
            duty_seq = 0
        by_pid[pid].append(
            {
                "duty_seq": str(duty_seq),
                "start": start_s,
                "end": end_s,
                "dep": dep,
                "arv": arv,
                "rest_min": str(_duty_rest_minutes(row)),
            }
        )
    for pid in by_pid:
        by_pid[pid].sort(key=lambda r: int(r["duty_seq"]))
    return by_pid


def _adjust_tz(src: int, dest: int, amount: int) -> int:
    """Move src TZ offset toward dest by amount, clamped; mirrors Rust adjust_timezone."""
    if src < dest:
        return min(dest, src + amount)
    if src > dest:
        return max(dest, src - amount)
    return src



def _fmt_tz_offset(offset_min: int) -> str:
    """UTC offset minutes → '±HH:MM' string."""
    sign = "+" if offset_min >= 0 else "-"
    h, m = divmod(abs(offset_min), 60)
    return f"{sign}{h:02d}:{m:02d}"


def _compute_crew_acc_refs(
    final_pids: list[str],
    pairing_duty_rows: dict[str, list[dict]],
    pairing_info: dict[str, dict],
    airport_zones: dict[str, str],
    stay_per_min: int = 1440,
    adjust_min: int = 60,
) -> dict[str, list[int]]:
    """Per-pairing per-duty acc ref TZ computed over the full crew line in chronological order."""
    all_duties: list[dict] = []
    for pid in final_pids:
        info = pairing_info.get(pid) or {}
        duties = pairing_duty_rows.get(pid, [])
        if duties:
            for d in duties:
                st = epoch(d["start"])
                en = epoch(d["end"])
                dep = (d.get("dep") or info.get("dep") or info.get("base") or "UTC").strip()
                arv = (d.get("arv") or info.get("arv") or info.get("base") or dep).strip()
                all_duties.append({
                    "pid": pid,
                    "start_utc": st, "end_utc": en,
                    "dep_tz_min": offset_min_at(st, dep, airport_zones),
                    "arr_tz_min": offset_min_at(en, arv, airport_zones),
                    "dep": dep, "arv": arv,
                })
        elif info.get("start") and info.get("duty_end"):
            st = epoch(info["start"])
            en = epoch(info["duty_end"])
            dep = (info.get("dep") or info.get("base") or "UTC").strip()
            arv = (info.get("arv") or info.get("base") or dep).strip()
            all_duties.append({
                "pid": pid,
                "start_utc": st, "end_utc": en,
                "dep_tz_min": offset_min_at(st, dep, airport_zones),
                "arr_tz_min": offset_min_at(en, arv, airport_zones),
                "dep": dep, "arv": arv,
            })
    all_duties.sort(key=lambda d: d["start_utc"])
    import rois_rule_engine_rs  # noqa: PLC0415
    refs = list(rois_rule_engine_rs.acc_duty_refs_from_arrays(
        [d["start_utc"] for d in all_duties],
        [d["end_utc"] for d in all_duties],
        [d["dep_tz_min"] for d in all_duties],
        [d["arr_tz_min"] for d in all_duties],
        stay_per_min,
        adjust_min,
    ))
    pid_refs: dict[str, list[int]] = defaultdict(list)
    for d, r in zip(all_duties, refs):
        pid_refs[d["pid"]].append(r)
    return dict(pid_refs)


def _build_pairing_duty_tip(
    pid: str,
    pairing_duty_rows: dict[str, list[dict]],
    pairing_info: dict[str, dict],
    airport_zones: dict[str, str],
    acc_refs: list[int],
) -> str:
    """Multi-line SVG <title> tooltip: pairing header + one line per duty with Ref TZ."""
    info = pairing_info.get(pid) or {}
    grp = info.get("group", "FLY").upper()
    dep_overall = info.get("dep", "?")
    arv_overall = info.get("arv", dep_overall)
    lines = [f"PairingID: {pid}  {grp}  {dep_overall}→{arv_overall}"]
    duties = pairing_duty_rows.get(pid, [])
    if not duties:
        st = epoch(info["start"]) if info.get("start") else 0
        en = epoch(info["duty_end"]) if info.get("duty_end") else 0
        dep = info.get("dep") or "?"
        arv = info.get("arv") or dep
        dep_off = offset_min_at(st, dep, airport_zones) if st else 0
        arv_off = offset_min_at(en, arv, airport_zones) if en else 0
        ref_str = f"   Ref: {_fmt_tz_offset(acc_refs[0])}" if acc_refs else ""
        st_str = utc_ts_to_local(st, dep, airport_zones).strftime("%m-%d %H:%M") if st else "?"
        en_str = utc_ts_to_local(en, arv, airport_zones).strftime("%m-%d %H:%M") if en else "?"
        lines.append(
            f"D1: {dep}({_fmt_tz_offset(dep_off)}) → {arv}({_fmt_tz_offset(arv_off)})"
            f"   {st_str} → {en_str}{ref_str}"
        )
    else:
        for i, d in enumerate(duties):
            st = epoch(d["start"])
            en = epoch(d["end"])
            dep = d.get("dep") or "?"
            arv = d.get("arv") or dep
            dep_off = offset_min_at(st, dep, airport_zones)
            arv_off = offset_min_at(en, arv, airport_zones)
            ref_str = f"   Ref: {_fmt_tz_offset(acc_refs[i])}" if i < len(acc_refs) else ""
            st_str = utc_ts_to_local(st, dep, airport_zones).strftime("%m-%d %H:%M")
            en_str = utc_ts_to_local(en, arv, airport_zones).strftime("%m-%d %H:%M")
            lines.append(
                f"D{i + 1}: {dep}({_fmt_tz_offset(dep_off)}) → {arv}({_fmt_tz_offset(arv_off)})"
                f"   {st_str} → {en_str}{ref_str}"
            )
    return "\n".join(lines)


def _svg_text_w(text: str, font_size: int, mono: bool) -> float:
    """Estimate SVG text pixel width (rough but consistent for layout purposes)."""
    cw = font_size * (0.60 if mono else 0.55)
    return len(text) * cw


def _build_rich_tip(
    pid: str,
    group: str,
    dep_overall: str,
    arv_overall: str,
    start_str: str,
    base: str,
    blk_min: int,
    dp_min: int,
    duties: list[dict],
) -> tuple[int, str, int]:
    """Styled SVG tooltip table (duty-level rows + flight sub-rows). Returns (height_px, inner_svg, width_px)."""
    _F = 'font-family="ui-sans-serif,system-ui,sans-serif"'
    _M = 'font-family="ui-monospace,monospace"'
    col_hdrs = ["Duty", "Type", "A/L", "FltNum", "Dep (TZ)", "Arr (TZ)", "STD", "STA", "BH", "Ref"]
    COL_PAD = 10  # 4 px left margin + 6 px right gap per column

    # Pre-scan all cell strings to find max text width per column
    # Each entry: (text, font_size, is_mono)
    col_samples: list[list[tuple[str, int, bool]]] = [[] for _ in col_hdrs]
    for i, hdr in enumerate(col_hdrs):
        col_samples[i].append((hdr, 7, False))
    for d in duties:
        duty_bh = sum(s["blk_min"] for s in d.get("segs", []))
        duty_bh_s = _fmt_blk_min(duty_bh)
        for i, (txt, fs, mo) in enumerate([
            (f"D{d['duty_num']}",                           8, False),
            ("",                                             8, True),
            ("",                                             8, True),
            ("",                                             8, True),
            (f"{d['dep']}({_fmt_tz_offset(d['dep_off'])})", 8, True),
            (f"{d['arv']}({_fmt_tz_offset(d['arr_off'])})", 8, True),
            (d["std_local"],                                 8, True),
            (d["sta_local"],                                 8, True),
            (duty_bh_s,                                      8, True),
            (_fmt_tz_offset(d["ref_tz_min"]),                8, True),
        ]):
            col_samples[i].append((txt, fs, mo))
        for seg in d.get("segs", []):
            blk_s = _fmt_blk_min(seg["blk_min"])
            for i, (txt, fs, mo) in enumerate([
                ("",                                                     7, True),
                (seg.get("type", ""),                                    7, True),
                (seg.get("airline", ""),                                 7, True),
                (seg["flt_num"],                                         7, True),
                (f"{seg['dep']}({_fmt_tz_offset(seg['dep_off'])})",     7, True),
                (f"{seg['arv']}({_fmt_tz_offset(seg['arr_off'])})",     7, True),
                (seg["std_local"],                                       7, True),
                (seg["sta_local"],                                       7, True),
                (blk_s,                                                  7, True),
                ("",                                                     7, True),
            ]):
                col_samples[i].append((txt, fs, mo))

    col_widths = [
        max((_svg_text_w(t, fs, mo) for t, fs, mo in items), default=0) + COL_PAD
        for items in col_samples
    ]
    col_x = []
    _x = 0.0
    for w in col_widths:
        col_x.append(round(_x))
        _x += w
    TIP_W = round(_x)
    HDR_H, INFO_H, COLHDR_H, ROW_H, SEG_H = 22, 18, 15, 15, 12
    total_rows_h = sum(ROW_H + len(d.get("segs", [])) * SEG_H for d in duties)
    TIP_H = HDR_H + INFO_H + COLHDR_H + total_rows_h + 3

    L: list[str] = []
    L.append(
        f'<rect x="0" y="0" width="{TIP_W}" height="{TIP_H}" rx="4" '
        f'fill="white" stroke="#94a3b8" stroke-width="1"/>'
    )
    L.append(f'<rect x="0" y="0" width="{TIP_W}" height="{HDR_H}" rx="4" fill="#1e3a8a"/>')
    L.append(f'<rect x="0" y="{HDR_H - 4}" width="{TIP_W}" height="4" fill="#1e3a8a"/>')
    blk_str = f"{blk_min // 60}:{blk_min % 60:02d}" if blk_min else "—"
    dp_str  = f"{dp_min  // 60}:{dp_min  % 60:02d}" if dp_min  else "—"
    hdr_txt = f"{pid}  {group}   {dep_overall}→{arv_overall}   BH {blk_str}  DP {dp_str}"
    L.append(
        f'<text x="8" y="{HDR_H - 6}" {_F} font-size="9" font-weight="700" fill="white">'
        f'{hdr_txt}</text>'
    )
    iy = HDR_H
    L.append(f'<rect x="0" y="{iy}" width="{TIP_W}" height="{INFO_H}" fill="#eff6ff"/>')
    L.append(
        f'<text x="8" y="{iy + 13}" {_F} font-size="8" fill="#1e40af">'
        f'Start: {start_str}   Base: {base}</text>'
    )
    chy = HDR_H + INFO_H
    L.append(f'<rect x="0" y="{chy}" width="{TIP_W}" height="{COLHDR_H}" fill="#93c5fd"/>')
    for i, (hdr_lbl, cx) in enumerate(zip(col_hdrs, col_x)):
        L.append(
            f'<text x="{cx + 4}" y="{chy + 10}" {_F} font-size="7" font-weight="600" '
            f'fill="#1e3a8a">{hdr_lbl}</text>'
        )
        if i > 0:
            L.append(
                f'<line x1="{cx}" y1="{chy}" x2="{cx}" y2="{TIP_H}" '
                f'stroke="#bfdbfe" stroke-width="0.5"/>'
            )
    L.append(
        f'<line x1="0" y1="{chy + COLHDR_H}" x2="{TIP_W}" y2="{chy + COLHDR_H}" '
        f'stroke="#bfdbfe" stroke-width="0.5"/>'
    )
    cur_y = chy + COLHDR_H
    for j, d in enumerate(duties):
        row_bg = "#bfdbfe"
        L.append(f'<rect x="0" y="{cur_y}" width="{TIP_W}" height="{ROW_H}" fill="{row_bg}"/>')
        duty_bh = sum(s["blk_min"] for s in d.get("segs", []))
        duty_bh_str = _fmt_blk_min(duty_bh)
        cells = [
            (f"D{d['duty_num']}",                           "#1d4ed8", _F),
            ("",                                             "",        _M),
            ("",                                             "",        _M),
            ("",                                             "",        _M),
            (f"{d['dep']}({_fmt_tz_offset(d['dep_off'])})", "#0f172a", _M),
            (f"{d['arv']}({_fmt_tz_offset(d['arr_off'])})", "#0f172a", _M),
            (d['std_local'],                                 "#374151", _M),
            (d['sta_local'],                                 "#374151", _M),
            (duty_bh_str,                                    "#059669", _M),
            (_fmt_tz_offset(d['ref_tz_min']),                "#7c3aed", _M),
        ]
        for (txt, fill, fam), cx in zip(cells, col_x):
            L.append(
                f'<text x="{cx + 4}" y="{cur_y + 10}" {fam} font-size="8" fill="{fill}">'
                f'{txt}</text>'
            )
        cur_y += ROW_H
        for seg in d.get("segs", []):
            blk_s = _fmt_blk_min(seg["blk_min"])
            L.append(f'<rect x="0" y="{cur_y}" width="{TIP_W}" height="{SEG_H}" fill="#f0f9ff"/>')
            seg_cells = [
                ("",                                                 "",        _M),
                (seg.get("type", ""),                                "#475569", _M),
                (seg.get("airline", ""),                             "#64748b", _M),
                (seg["flt_num"],                                     "#0369a1", _M),
                (f"{seg['dep']}({_fmt_tz_offset(seg['dep_off'])})", "#0f172a", _M),
                (f"{seg['arv']}({_fmt_tz_offset(seg['arr_off'])})", "#0f172a", _M),
                (seg["std_local"],                                   "#374151", _M),
                (seg["sta_local"],                                   "#374151", _M),
                (blk_s,                                              "#059669", _M),
                ("",                                                 "",        _M),
            ]
            for (txt, fill, fam), cx in zip(seg_cells, col_x):
                if txt:
                    L.append(
                        f'<text x="{cx + 4}" y="{cur_y + 8}" {fam} font-size="7" fill="{fill}">'
                        f'{txt}</text>'
                    )
            cur_y += SEG_H
    return TIP_H, "\n".join(L), TIP_W


def _build_seg_tip(seg: dict) -> tuple[int, str, int]:
    """Rich SVG tooltip for a single flight segment (Flight view). Same visual style as _build_rich_tip."""
    _F = 'font-family="ui-sans-serif,system-ui,sans-serif"'
    _M = 'font-family="ui-monospace,monospace"'
    col_hdrs = ["Type", "A/L", "FltNum", "Dep (TZ)", "Arr (TZ)", "STD", "STA", "BH"]
    COL_PAD = 10

    blk_s = _fmt_blk_min(int(seg.get("blk_min") or 0))
    row_vals: list[tuple[str, int, bool]] = [
        (seg.get("type", ""),                                    7, True),
        (seg.get("airline", ""),                                 7, True),
        (seg.get("flt_num", ""),                                 7, True),
        (f"{seg['dep']}({_fmt_tz_offset(seg['dep_off'])})",     7, True),
        (f"{seg['arv']}({_fmt_tz_offset(seg['arr_off'])})",     7, True),
        (seg.get("std_local", ""),                               7, True),
        (seg.get("sta_local", ""),                               7, True),
        (blk_s,                                                  7, True),
    ]

    col_samples: list[list[tuple[str, int, bool]]] = [[(hdr, 7, False)] for hdr in col_hdrs]
    for i, item in enumerate(row_vals):
        col_samples[i].append(item)

    col_widths = [
        max((_svg_text_w(t, fs, mo) for t, fs, mo in items), default=0) + COL_PAD
        for items in col_samples
    ]
    col_x: list[int] = []
    _x = 0.0
    for w in col_widths:
        col_x.append(round(_x))
        _x += w
    TIP_W = round(_x)
    HDR_H, COLHDR_H, ROW_H = 22, 15, 15
    TIP_H = HDR_H + COLHDR_H + ROW_H + 3

    L: list[str] = []
    L.append(
        f'<rect x="0" y="0" width="{TIP_W}" height="{TIP_H}" rx="4" '
        f'fill="white" stroke="#94a3b8" stroke-width="1"/>'
    )
    L.append(f'<rect x="0" y="0" width="{TIP_W}" height="{HDR_H}" rx="4" fill="#1e3a8a"/>')
    L.append(f'<rect x="0" y="{HDR_H - 4}" width="{TIP_W}" height="4" fill="#1e3a8a"/>')
    L.append(
        f'<text x="8" y="{HDR_H - 6}" {_F} font-size="9" font-weight="700" fill="white">'
        f'{seg.get("flt_num", "")}  {seg["dep"]}→{seg["arv"]}   BH {blk_s}</text>'
    )

    chy = HDR_H
    L.append(f'<rect x="0" y="{chy}" width="{TIP_W}" height="{COLHDR_H}" fill="#93c5fd"/>')
    for i, (hdr_lbl, cx) in enumerate(zip(col_hdrs, col_x)):
        L.append(
            f'<text x="{cx + 4}" y="{chy + 10}" {_F} font-size="7" font-weight="600" '
            f'fill="#1e3a8a">{hdr_lbl}</text>'
        )
        if i > 0:
            L.append(
                f'<line x1="{cx}" y1="{chy}" x2="{cx}" y2="{TIP_H}" '
                f'stroke="#bfdbfe" stroke-width="0.5"/>'
            )
    L.append(
        f'<line x1="0" y1="{chy + COLHDR_H}" x2="{TIP_W}" y2="{chy + COLHDR_H}" '
        f'stroke="#bfdbfe" stroke-width="0.5"/>'
    )

    cur_y = chy + COLHDR_H
    L.append(f'<rect x="0" y="{cur_y}" width="{TIP_W}" height="{ROW_H}" fill="#f0f9ff"/>')
    seg_cells = [
        (seg.get("type", ""),                                  "#475569", _M),
        (seg.get("airline", ""),                               "#64748b", _M),
        (seg.get("flt_num", ""),                               "#0369a1", _M),
        (f"{seg['dep']}({_fmt_tz_offset(seg['dep_off'])})", "#0f172a", _M),
        (f"{seg['arv']}({_fmt_tz_offset(seg['arr_off'])})", "#0f172a", _M),
        (seg.get("std_local", ""),                             "#374151", _M),
        (seg.get("sta_local", ""),                             "#374151", _M),
        (blk_s,                                                "#059669", _M),
    ]
    for (txt, fill, fam), cx in zip(seg_cells, col_x):
        if txt:
            L.append(
                f'<text x="{cx + 4}" y="{cur_y + 10}" {fam} font-size="8" fill="{fill}">'
                f'{txt}</text>'
            )

    return TIP_H, "\n".join(L), TIP_W


def _crews_on_pairings(
    sections: dict[str, dict],
    pairing_ids: set[str],
) -> set[str]:
    """Crew IDs pre-assigned on any of the given pairings."""
    crews: set[str] = set()
    for section in ("Roster", "RosterFlight"):
        for row in sections.get(section, {}).get("rows", []):
            if not _is_active_row(row):
                continue
            pid = row.get("pairingId", "").strip()
            cid = row.get("crewId", "").strip()
            if pid in pairing_ids and cid:
                crews.add(cid)
    return crews


def _composition_violation(
    pairing_roster: dict[str, list[tuple[str, str]]],
    pairing_composition: dict[str, dict[str, dict[str, int]]],
    pid: str,
    rank: str,
    division: str,
) -> str | None:
    comp_by_div = pairing_composition.get(pid)
    if not comp_by_div:
        return None
    comp = comp_by_div.get(division) or comp_by_div.get("P") or {}
    if not comp:
        return f"composition|pairing={pid}|rank={rank}|reason=no_composition_for_division"
    if rank not in comp:
        return (
            f"composition|pairing={pid}|rank={rank}"
            f"|reason=rank_not_in_planned_composition"
        )
    filled = sum(1 for _, r in pairing_roster.get(pid, []) if r == rank)
    plan = comp[rank]
    if filled >= plan:
        return (
            f"composition|pairing={pid}|rank={rank}|filled={filled}|plan={plan}"
            f"|reason=slot_full"
        )
    return None


_DHD_ASSIGNMENTS = frozenset({"DH", "DHD", "DHDH"})


def _is_dhd_assignment(assignment: str) -> bool:
    return (assignment or "").strip().upper() in _DHD_ASSIGNMENTS


def _parse_assignment_bt_pct(sections: dict) -> dict[str, float]:
    result: dict[str, float] = {}
    for section_name in ("Assignment", "Assignment(Read)"):
        for row in sections.get(section_name, {}).get("rows", []):
            code = (row.get("assignment") or "").strip().upper()
            if not code:
                continue
            try:
                ratio = float(row.get("btPct"))
            except (TypeError, ValueError):
                continue
            if 0 <= ratio <= 1:
                result[code] = ratio
    return result


def _segment_blk_minutes(
    assignment: str,
    std_utc: int,
    sta_utc: int,
    assignment_bt_pct: dict[str, float],
    pairing_assignment: str = "",
) -> int:
    """Block minutes for 8002 / tooltip BH; unknown assignments carry no block."""
    code = (assignment or pairing_assignment or "").strip().upper()
    ratio = assignment_bt_pct.get(code)
    if ratio is None:
        return 0
    return int(max(0, sta_utc - std_utc) * ratio / 60 + 0.5)


def _pairing_dhd_intervals(
    pairing_ids: list[str],
    pairing_segments: dict[str, list[dict[str, str]]],
) -> list[tuple[int, int]]:
    """UTC (start, end) for deadhead segments already on fixed pairings."""
    intervals: list[tuple[int, int]] = []
    for pid in pairing_ids:
        for seg in pairing_segments.get(pid, []):
            if not _is_dhd_assignment(seg.get("assignment", "")):
                continue
            try:
                st = epoch(seg["start"])
                en = epoch(seg["end"])
            except ValueError:
                continue
            if en > st:
                intervals.append((st, en))
    return intervals


def _dedupe_ground_against_pairing_dhd(
    ground: list[dict],
    dhd_intervals: list[tuple[int, int]],
) -> list[dict]:
    """Drop RosterGround DHD rows that duplicate a pairing deadhead segment."""
    if not dhd_intervals:
        return ground
    kept: list[dict] = []
    for g in ground:
        if not _is_dhd_assignment(g.get("assignment", "")):
            kept.append(g)
            continue
        try:
            gs = epoch(g["start"])
            ge = epoch(g["end"])
        except ValueError:
            kept.append(g)
            continue
        if any(gs == ds and ge == de for ds, de in dhd_intervals):
            continue
        kept.append(g)
    return kept


def _pairing_timeline_entry(pid: str, pairing_info: dict[str, dict]) -> dict | None:
    """Bar metadata for a pairing on the pre-assignments / carried row."""
    info = pairing_info.get(pid)
    if not info or not info.get("start") or not info.get("duty_end"):
        return None
    return {
        "pid": pid,
        "label": info.get("label", pid),
        "group": info.get("group", "FLY"),
        "start_utc": epoch(info["start"]),
        "end_utc": epoch(info["duty_end"]),
        "dep": info.get("dep", ""),
        "arv": info.get("arv", ""),
    }


def _new_round_entry(
    cid: str,
    rank: str,
    prime_base: str,
    round_no: int,
    crew_fixed_pids: dict[str, list[str]],
    pairing_info: dict[str, dict],
    ground_tasks: dict[str, list[dict]],
    carried_pids: list[str],
    pairing_segments: dict[str, list[dict[str, str]]] | None = None,
    airport_zones: dict[str, str] | None = None,
    assignment_bt_pct: dict[str, float] | None = None,
) -> dict:
    fixed_pids = crew_fixed_pids.get(cid, [])
    fixed: list[dict] = []
    zones = airport_zones or {}
    for pid in fixed_pids:
        entry = _pairing_timeline_entry(pid, pairing_info)
        if entry is None:
            continue
        info = pairing_info.get(pid) or {}
        raw_segs = (pairing_segments or {}).get(pid, [])
        if raw_segs:
            entry["segs"] = _build_pairing_display_segs(
                raw_segs,
                entry.get("dep") or info.get("dep") or prime_base,
                entry.get("arv") or info.get("arv") or prime_base,
                zones,
                assignment_bt_pct=assignment_bt_pct,
            )
        fixed.append(entry)
    carried: list[dict] = []
    for pid in carried_pids:
        entry = _pairing_timeline_entry(pid, pairing_info)
        if entry is None:
            continue
        info = pairing_info.get(pid) or {}
        raw_segs = (pairing_segments or {}).get(pid, [])
        if raw_segs:
            entry["segs"] = _build_pairing_display_segs(
                raw_segs,
                entry.get("dep") or info.get("dep") or prime_base,
                entry.get("arv") or info.get("arv") or prime_base,
                zones,
                assignment_bt_pct=assignment_bt_pct,
            )
        carried.append(entry)
    dhd_intervals = _pairing_dhd_intervals(fixed_pids, pairing_segments or {})
    ground = _dedupe_ground_against_pairing_dhd(
        ground_tasks.get(cid, []),
        dhd_intervals,
    )
    return {
        "round_no": round_no,
        "crew_id": cid,
        "rank": rank,
        "base": prime_base,
        "fixed": fixed,
        "carried": carried,
        "ground": ground,
        "checks": [],
    }


def _print_simulated_assign(
    cid: str,
    cpid: str,
    rank: str,
    pairing_segments: dict[str, list[dict[str, str]]],
) -> None:
    print(f"       → Roster: crew={cid} pairing={cpid} actingRank={rank}")
    for seg in pairing_segments.get(cpid, []):
        raw_flt = seg["flt_num"] or seg["flt_id"] or "?"
        flt = _bare_flt_num(raw_flt, seg.get("airline", "")) if raw_flt != "?" else "?"
        route = f"{seg['dep']}→{seg['arv']}" if seg["dep"] or seg["arv"] else "?"
        print(
            f"       → RosterFlight: crew={cid} pairing={cpid} "
            f"duty={seg['duty_seq']} seg={seg['seg_seq']} "
            f"flt={flt} {route} {seg['start']}→{seg['end']}"
        )


def parse_assignments(path: Path) -> list[tuple[str, list[str]]]:
    """Parse assignments.txt: alternating ``crew: <id>`` / ``pairing: id,id,...`` lines.

    Optional trailing key ``auto-fill-do: Y|N`` requests the solver's final DO
    (days-off) fill for the crews listed here. Returns
    ``(plan, auto_fill_do)`` where plan is the ordered round list.
    """
    raw_lines = path.read_text(encoding="utf-8").splitlines()
    lines = [
        ln.strip()
        for ln in raw_lines
        if ln.strip() and not ln.strip().startswith("#")
    ]
    # Peel the optional auto-fill-do key anywhere (strip it) so the strict
    # crew/pairing loop below never sees it.
    auto_fill_do = False
    for j, ln in enumerate(list(lines)):
        if ln.lower().startswith("auto-fill-do:"):
            auto_fill_do = ln.split(":", 1)[1].strip().upper() == "Y"
            del lines[j]
            break
    plan: list[tuple[str, list[str]]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        line_no = i + 1
        if not line.lower().startswith("crew:"):
            raise ValueError(
                f"{path.name} line {line_no}: expected 'crew: <crewId>', got {line!r}"
            )
        crew_id = line.split(":", 1)[1].strip()
        if not crew_id:
            raise ValueError(f"{path.name} line {line_no}: crew id is empty")
        if "," in crew_id:
            raise ValueError(
                f"{path.name} line {line_no}: crew line must contain exactly one crew id"
            )
        i += 1
        # If EOF or next line is another crew: block — check pre-assignments only.
        if i >= len(lines) or lines[i].lower().startswith("crew:"):
            plan.append((crew_id, []))
            continue
        pline = lines[i]
        pline_no = i + 1
        if not pline.lower().startswith("pairing:"):
            raise ValueError(
                f"{path.name} line {pline_no}: expected 'pairing: id,id,...' after crew {crew_id!r}"
            )
        pairing_part = pline.split(":", 1)[1].strip()
        pairing_ids = [p.strip() for p in pairing_part.split(",") if p.strip()]
        plan.append((crew_id, pairing_ids))
        i += 1
    if not plan:
        raise ValueError(f"{path.name}: no crew/pairing assignment blocks found")
    return plan, auto_fill_do


# ── RO file section parser ────────────────────────────────────────────────────
def parse_ro(path: Path) -> dict[str, dict]:
    """Parse ^-delimited ro_input using the canonical ro-engine parser.

    Delegates to ro_input_parser.parse_ro_input() (single source of truth) and
    converts DataFrames to the dict-rows format used by all consumers here:
      {section_name: {"header": [col, ...], "rows": [{col: val, ...}]}}
    """
    dfs = _parse_ro_input(path)
    return {
        name: {
            "header": list(df.columns),
            "rows": df.to_dict("records"),
        }
        for name, df in dfs.items()
    }


# ── RuleSet-driven active rules ───────────────────────────────────────────────
RUST_CHECK_LINE_FUNCTIONS: frozenset[str] = frozenset({
    "7500", "8002", "8056", "7501", "7503", "7504", "7505", "7506", "7507",
    "7508", "7509", "8004", "8030", "8071", "7305",
})
RUST_NOT_IMPLEMENTED_FUNCTIONS: frozenset[str] = frozenset({"7502", "7272"})


@dataclass
class ActiveRuleSet:
    workset_id: str
    rule_ids: list[str]
    rule_id_to_function: dict[str, str] = field(default_factory=dict)
    functions: set[str] = field(default_factory=set)
    enforced_functions: set[str] = field(default_factory=set)
    skipped_not_implemented: set[str] = field(default_factory=set)


def parse_active_ruleset(sections: dict) -> ActiveRuleSet:
    """Resolve active rule ids from RuleSet + function codes from scenario Rule(27) only."""
    rs_rows = sections.get("RuleSet", {}).get("rows", [])
    worksets = {r.get("worksetId", "").strip() for r in rs_rows if r.get("worksetId")}
    if len(worksets) == 1:
        workset_id = next(iter(worksets))
        active_rows = rs_rows
    elif len(worksets) > 1:
        env_ws = os.environ.get("RO_RULE_WORKSET", "").strip()
        if env_ws:
            workset_id = env_ws
        else:
            workset_id = Counter(r.get("worksetId", "") for r in rs_rows).most_common(1)[0][0]
        active_rows = [r for r in rs_rows if r.get("worksetId", "").strip() == workset_id]
        print(
            f"WARNING: RuleSet has multiple worksets {sorted(worksets)}; using {workset_id}",
            file=sys.stderr,
        )
    else:
        workset_id = ""
        active_rows = []

    rule_ids = [r["ruleId"].strip() for r in active_rows if r.get("ruleId", "").strip()]
    rule_meta = {
        row["id"].strip(): row.get("function", "").strip()
        for row in sections.get("Rule", {}).get("rows", [])
        if row.get("id", "").strip()
    }

    rule_id_to_function: dict[str, str] = {}
    for rid in rule_ids:
        fn = rule_meta.get(rid, "")
        if not fn and len(rid) >= 4 and rid[:4].isdigit():
            fn = rid[:4]
        if fn:
            rule_id_to_function[rid] = fn

    functions = set(rule_id_to_function.values())
    enforced = functions & RUST_CHECK_LINE_FUNCTIONS
    skipped = functions & RUST_NOT_IMPLEMENTED_FUNCTIONS
    return ActiveRuleSet(
        workset_id=workset_id,
        rule_ids=rule_ids,
        rule_id_to_function=rule_id_to_function,
        functions=functions,
        enforced_functions=enforced,
        skipped_not_implemented=skipped,
    )


def _print_active_ruleset_report(active: ActiveRuleSet) -> None:
    enforced = ", ".join(sorted(active.enforced_functions))
    skipped = ", ".join(sorted(active.skipped_not_implemented))
    print(f"RuleSet workset {active.workset_id or '?'}: {len(active.rule_ids)} rule(s)")
    print(f"  Enforced: {enforced} (+ overlap)")
    if skipped:
        print(f"  In RuleSet but not in Rust check_line: {skipped}")


def _parse_7500_daily_adjustment(sections: dict, active: ActiveRuleSet) -> tuple[int | None, int | None]:
    """Rule 7500 table 2 (DailyAdjustment): Stay Duration per X Hours + ACC TZ Adjust X Hours."""
    if "7500" not in active.functions:
        return None, None
    for rule_id in _rule_ids_for_function(active, "7500"):
        for row in sections.get("RuleParameter", {}).get("rows", []):
            if row.get("ruleId") != rule_id:
                continue
            if not re.match(r"table2Row\d+", row.get("paramNames", "")):
                continue
            vals = row.get("paramValues", "").split(",")
            if len(vals) >= 2:
                try:
                    return hhmm_min(vals[0]), hhmm_min(vals[1])
                except ValueError:
                    continue
    return None, None


def _split_param_codes(value: str) -> list[str]:
    s = (value or "").strip()
    if not s or s == "*":
        return ["*"]
    return [part.strip() for part in s.split("|") if part.strip()]


def _rule_ids_for_function(active: ActiveRuleSet, function: str) -> list[str]:
    return [rid for rid in active.rule_ids if active.rule_id_to_function.get(rid) == function]


# ── Rule parameter extraction ─────────────────────────────────────────────────
def _param_rows(sections: dict, rule_id: str) -> tuple[list[str], list[list[str]]]:
    """
    Return (header_cols, [data_row_vals, ...]) for a rule's tableRow entries.
    Reads only the scenario RuleParameter block (not RuleParameter(ALL)).
    """
    hdr: list[str] = []
    rows: list[list[str]] = []
    for row in sections.get("RuleParameter", {}).get("rows", []):
        if row.get("ruleId") != rule_id:
            continue
        pname = row.get("paramNames", "")
        pvals = row.get("paramValues", "").split(",")
        if pname == "tableHeader":
            hdr = pvals
        elif re.match(r"tableRow\d+|table\d+Row\d+", pname):
            rows.append(pvals)
    return hdr, rows


def _col(hdr: list[str], name: str, default: int) -> int:
    try:
        return hdr.index(name)
    except ValueError:
        return default


def extract_engine_params(
    sections: dict,
    rp_start: date,
    rp_end: date,
    active: ActiveRuleSet,
) -> dict:
    ep: dict = {}
    fn = active.functions

    # 8002 — full C++ param rows (per active 8002 rule id): all 15 columns.
    # Supported Types: BH/DP/FT/CH; the other 9 C++ types warn + drop. Row
    # shape mirrors the Engine's nested-tuple FFI (see cum_rules kwarg).
    # Kept in sync with pbs-engine rust_checker.py:_extract_rule_params.
    ep["cum_rules"] = []
    if "8002" in fn:
        for rule_id in _rule_ids_for_function(active, "8002"):
            hdr, rows = _param_rows(sections, rule_id)
            hu = [h.strip().upper() for h in hdr]

            def _hcol(*names: str, default: int | None = None) -> int | None:
                for nm in names:
                    for i, h in enumerate(hu):
                        if nm in h:
                            return i
                return default

            bi = _hcol("BASES", default=0)
            ri = _hcol("RANKS", default=1)
            fi = _hcol("FLEETS", default=2)
            tmi = _hcol("CREW TEAMS", "TEAMS", default=3)
            pi = _hcol("PERIOD", default=4)
            ui = _hcol("UNIT", default=5)
            mi = _hcol("MAX LIMIT", default=7)
            ni = _hcol("MIN LIMIT", default=8)
            ti = _hcol("TYPE", default=9)
            inti = _hcol("INT OPERATION")
            augi = _hcol("AUG OPERATION")
            ali = _hcol("DUTY ALOT")
            sbi = _hcol("HAS SBY")
            rdi = _hcol("REDUCTION")
            for vals in rows:
                def _get(idx: int | None) -> str:
                    return vals[idx].strip() if idx is not None and idx < len(vals) else ""

                rtype = _get(ti).upper()
                if not rtype:
                    continue
                if rtype not in _CUM_TYPES_SUPPORTED:
                    print(
                        f"  [8002] rule {rule_id}: Type {rtype!r} is not ported "
                        f"(supported: BH/DP/FT/CH) — row skipped"
                    )
                    continue
                teams = _pipe_list(_get(tmi))
                if teams != ["*"]:
                    print(
                        f"  [8002] rule {rule_id}: Crew Teams={teams} gated but "
                        f"ro_input carries no crew-team data — row can never fire"
                    )
                try:
                    period = int(_get(pi))
                except ValueError:
                    continue
                sby_raw = _get(sbi).upper()
                ep["cum_rules"].append((
                    (_pipe_list(_get(bi)), _pipe_list(_get(ri)),
                     _pipe_list(_get(fi)), teams),
                    (period, _get(ui).upper() or "CD",
                     _limit_min(_get(mi), 999999), _limit_min(_get(ni), 0), rtype),
                    _band_pair(_get(inti)) + _band_pair(_get(augi)) + _band_pair(_get(ali)),
                    1 if sby_raw == "Y" else 0 if sby_raw == "N" else -1,
                    _limit_min(_get(rdi), 0) if _get(rdi) not in ("", "*") else 0,
                ))

    # 8056 — roster spacing (grouped param rows preferred)
    ep["spacing_hours"] = None
    ep["spacing_rules"]: list[tuple[list[str], list[str], list[str], list[str], float]] = []
    if "8056" in fn:
        for rule_id in _rule_ids_for_function(active, "8056"):
            hdr, rows = _param_rows(sections, rule_id)
            ga_i = _col(hdr, "Assignment Group A", 6)
            gb_i = _col(hdr, "Assignment Group B", 13)
            aa_i = _col(hdr, "Assignment A", 7)
            ab_i = _col(hdr, "Assignment B", 14)
            sp_i = _col(hdr, "Space", 18)
            dir_i = _col(hdr, "Directional", 21)
            for vals in rows:
                if len(vals) <= sp_i:
                    continue
                try:
                    space = float(vals[sp_i])
                except ValueError:
                    continue
                if ep["spacing_hours"] is None:
                    ep["spacing_hours"] = space
                ga = _split_param_codes(vals[ga_i] if ga_i < len(vals) else "")
                gb = _split_param_codes(vals[gb_i] if gb_i < len(vals) else "")
                aa = _split_param_codes(vals[aa_i] if aa_i < len(vals) else "")
                ab = _split_param_codes(vals[ab_i] if ab_i < len(vals) else "")
                ep["spacing_rules"].append((ga, gb, aa, ab, space))
                if (vals[dir_i] if dir_i < len(vals) else "").strip().upper() != "Y":
                    ep["spacing_rules"].append((gb, ga, ab, aa, space))

    # 7505 — min guaranteed days off
    rp_len = (rp_end - rp_start).days + 1
    ep["min_days_off"] = None
    if "7505" in fn:
        for rule_id in _rule_ids_for_function(active, "7505"):
            hdr, rows = _param_rows(sections, rule_id)
            min_do_i = _col(hdr, "Min DO", 5)
            rp_rng_i = _col(hdr, "RP Days Range", 8)
            lv_rng_i = _col(hdr, "Leave Days Range", 13)
            for vals in rows:
                if len(vals) <= max(min_do_i, rp_rng_i, lv_rng_i):
                    continue
                try:
                    lo_rp, hi_rp = (int(x) for x in vals[rp_rng_i].split("-"))
                    lo_lv, hi_lv = (int(x) for x in vals[lv_rng_i].split("-"))
                except ValueError:
                    continue
                if lo_rp <= rp_len <= hi_rp and lo_lv <= 0 <= hi_lv:
                    try:
                        ep["min_days_off"] = int(vals[min_do_i])
                    except ValueError:
                        pass
                    break

    # 2014 — local night (support for 7501)
    ep["local_night"] = None
    if "7501" in fn and "2014" in fn:
        for rule_id in _rule_ids_for_function(active, "2014"):
            hdr, rows = _param_rows(sections, rule_id)
            for vals in rows:
                if len(vals) >= 3:
                    try:
                        ep["local_night"] = (
                            hhmm_min(vals[0]),
                            hhmm_min(vals[1]),
                            int(hhmm_min(vals[2])) * 60,
                        )
                        break
                    except ValueError:
                        pass

    # 2015 — DO Start Time (minutes); 0 = missing → today's midnight DO paint for 7505/7507/1001
    ep["do_start_min"] = 0
    ep["do_start"] = 0
    if "7505" in fn or "7507" in fn:
        if "2015" in fn:
            for rule_id in _rule_ids_for_function(active, "2015"):
                hdr, rows = _param_rows(sections, rule_id)
                for vals in rows:
                    if vals:
                        try:
                            mins = hhmm_min(vals[0])
                            if mins > 0:
                                ep["do_start_min"] = int(mins)
                                ep["do_start"] = int(mins)
                            break
                        except ValueError:
                            pass
                    break

    # 7501 — SDFD rolling window
    sdfd_rows: list[tuple[int, int]] = []
    sdfd_buf = 0
    if "7501" in fn:
        for rule_id in _rule_ids_for_function(active, "7501"):
            hdr, rows = _param_rows(sections, rule_id)
            pi = _col(hdr, "Period", 4)
            bi = _col(hdr, "Duty End Buffer", 6)
            li = _col(hdr, "Min Limits", 7)
            for vals in rows:
                if len(vals) <= max(pi, bi, li):
                    continue
                try:
                    sdfd_rows.append((int(vals[pi]), int(vals[li])))
                    sdfd_buf = hhmm_min(vals[bi]) * 60
                except (ValueError, IndexError):
                    pass
    ep["sdfd_rows"] = sdfd_rows
    ep["sdfd_buffer_secs"] = sdfd_buf

    # 7503 — consecutive WOCL
    ep["wocl_window"] = None
    ep["max_consecutive_wocl"] = None
    if "7503" in fn:
        for rule_id in _rule_ids_for_function(active, "7503"):
            hdr, rows = _param_rows(sections, rule_id)
            for vals in rows:
                if len(vals) >= 7:
                    try:
                        ep["wocl_window"] = (hhmm_min(vals[4]), hhmm_min(vals[5]))
                        ep["max_consecutive_wocl"] = int(vals[6])
                        break
                    except (ValueError, IndexError):
                        pass

    # 7504 — WOCL spacing
    ep["wocl_spacing_hours"] = None
    if "7504" in fn:
        for rule_id in _rule_ids_for_function(active, "7504"):
            hdr, rows = _param_rows(sections, rule_id)
            mp_i = _col(hdr, "Min Period", 13)
            for vals in rows:
                if len(vals) > mp_i:
                    try:
                        ep["wocl_spacing_hours"] = int(vals[mp_i])
                        break
                    except ValueError:
                        pass

    # 7506 — one check-in per day
    ep["one_checkin_groups"] = None
    if "7506" in fn:
        for rule_id in _rule_ids_for_function(active, "7506"):
            hdr, rows = _param_rows(sections, rule_id)
            for vals in rows:
                if len(vals) >= 5:
                    ep["one_checkin_groups"] = vals[4].split("|")
                    break

    # 8004 — base competency (BASE row only, enable=Y)
    ep["base_grace_days"] = None
    if "8004" in fn:
        for rule_id in _rule_ids_for_function(active, "8004"):
            hdr, rows = _param_rows(sections, rule_id)
            type_i = _col(hdr, "Type", 3)
            enable_i = _col(hdr, "Enable Check", 4)
            grace_i = _col(hdr, "Grace Period", 5)
            for vals in rows:
                if len(vals) <= max(type_i, enable_i, grace_i):
                    continue
                if vals[type_i] == "BASE" and vals[enable_i] == "Y":
                    try:
                        ep["base_grace_days"] = int(vals[grace_i])
                    except ValueError:
                        ep["base_grace_days"] = 0
                    break

    # 8030 — pilot age
    ep["age_division"] = None
    ep["age_limit"] = 65
    ep["age_max_number"] = 1
    if "8030" in fn:
        for rule_id in _rule_ids_for_function(active, "8030"):
            hdr, rows = _param_rows(sections, rule_id)
            for vals in rows:
                if len(vals) >= 4:
                    try:
                        ep["age_division"] = vals[0]
                        ep["age_limit"] = int(vals[2])
                        ep["age_max_number"] = int(vals[3])
                        break
                    except (ValueError, IndexError):
                        pass

    stay, adjust = _parse_7500_daily_adjustment(sections, active)
    ep["acc_stay_per_min"] = stay
    ep["acc_adjust_min"] = adjust

    return ep


# ── HTML report generation ────────────────────────────────────────────────────

_BAR_COLORS: dict[str, str] = {
    "fixed_fly":    "#3b82f6",
    "fixed_other":  "#7c3aed",
    "ground_rest":  "#94a3b8",
    "ground_sby":   "#f97316",
    "ground_sim":   "#f59e0b",
    "ground_dhd":   "#a78bfa",
    "ground_other": "#06b6d4",
    "cand_ok":      "#22c55e",
    "cand_fail":    "#ef4444",
    "rest":         "#cbd5e1",
}


def _ground_color(assignment: str, group: str, is_rest: bool) -> str:
    if is_rest:
        return _BAR_COLORS["ground_rest"]
    a = assignment.upper()
    if a in _DHD_ASSIGNMENTS:
        return _BAR_COLORS["ground_dhd"]
    if a in {"SIM", "TRN", "CRE"} or group.upper() == "TRN":
        return _BAR_COLORS["ground_sim"]
    if a in {"SBY", "ASBY", "RES", "PRAM", "PRPM"}:
        return _BAR_COLORS["ground_sby"]
    return _BAR_COLORS["ground_other"]


def _fixed_bar_color(entry: dict) -> str:
    if entry.get("group", "FLY").upper() == "FLY":
        return _BAR_COLORS["fixed_fly"]
    return _BAR_COLORS["fixed_other"]


def _segment_bar_color(seg: dict, default_color: str) -> str:
    if _is_dhd_assignment(seg.get("assignment", "")):
        return _BAR_COLORS["ground_dhd"]
    return default_color


def _build_pairing_display_segs(
    raw_segs: list[dict[str, str]],
    fallback_dep: str,
    fallback_arv: str,
    airport_zones: dict[str, str],
    assignment_type_map: dict[str, str] | None = None,
    assignment_bt_pct: dict[str, float] | None = None,
) -> list[dict]:
    """Flight-view segment rows (type/airline for tooltip columns)."""
    rows: list[dict] = []
    for seg in raw_segs:
        if not seg.get("start") or not seg.get("end"):
            continue
        try:
            seg_st = epoch(seg["start"])
            seg_en = epoch(seg["end"])
        except ValueError:
            continue
        if seg_en <= seg_st:
            continue
        dep_s = seg.get("dep") or fallback_dep
        arv_s = seg.get("arv") or fallback_arv
        raw_flt = seg.get("flt_num") or seg.get("flt_id") or "?"
        assignment = (seg.get("assignment") or "").strip()
        blk_s = _segment_blk_minutes(
            assignment,
            seg_st,
            seg_en,
            assignment_bt_pct or {},
        )
        airline_code = _seg_airline_code(raw_flt, seg.get("airline", ""))
        rows.append({
            "assignment": assignment,
            "type": _seg_type_label(assignment, assignment_type_map),
            "airline": airline_code,
            "flt_num": _bare_flt_num(raw_flt, seg.get("airline", ""))
            if raw_flt != "?" else "?",
            "dep": dep_s,
            "arv": arv_s,
            "dep_off": offset_min_at(seg_st, dep_s, airport_zones),
            "arr_off": offset_min_at(seg_en, arv_s, airport_zones),
            "std_local": utc_ts_to_local(seg_st, dep_s, airport_zones).strftime("%m-%d %H:%M"),
            "sta_local": utc_ts_to_local(seg_en, arv_s, airport_zones).strftime("%m-%d %H:%M"),
            "blk_min": blk_s,
            "start_utc": seg_st,
            "end_utc": seg_en,
        })
    return rows


def _fmt_viol_detail(
    v: str,
    base: str,
    airport_zones: dict[str, str],
    idx_to_pid: dict[int, str] | None = None,
    pairing_info: dict[str, dict] | None = None,
) -> str:
    """Format violation detail; epoch fields → crew-base local wall clock."""
    parts = v.split("|")
    out = []
    for part in parts[1:]:
        if part.startswith("window_start_ord="):
            try:
                ord_val = int(part.split("=", 1)[1])
                local_date = (date(1970, 1, 1) + timedelta(days=ord_val)).strftime("%Y-%m-%d")
                out.append(f"window_start={local_date} ({base})")
            except (ValueError, OverflowError):
                out.append(part)
        elif part.startswith("window_start="):
            try:
                ts = int(part.split("=", 1)[1])
                out.append(
                    f"window_start={utc_ts_to_local(ts, base, airport_zones).strftime('%m-%d %H:%M')} ({base})"
                )
            except (ValueError, OSError):
                out.append(part)
        elif part.startswith("win_start_s=") or part.startswith("win_end_s="):
            # Engine emits crew-local day bounds (UTC instant = local wall already offset).
            # Format as YYYY-MM-DD HH:MM; rename keys to win_start / win_end.
            key = "win_start" if part.startswith("win_start_s=") else "win_end"
            try:
                ts = int(part.split("=", 1)[1])
                wall = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
                out.append(f"{key}={wall}")
            except (ValueError, OSError, OverflowError):
                out.append(part)
        elif part.startswith("pairing=") or part.startswith("pairing_after="):
            field, raw = part.split("=", 1)
            _append_pairing_viol_field(
                out, field, raw, idx_to_pid, pairing_info, airport_zones,
            )
        else:
            out.append(part)
    return "  ".join(out)


def _warning_viol_detail(
    v: str,
    base: str,
    airport_zones: dict[str, str],
    idx_to_pid: dict[int, str] | None = None,
    pairing_info: dict[str, dict] | None = None,
) -> str:
    """Prefer Live/Scenario Alert English for mapped rules; else pipe field dump."""
    live = format_live_style_message(v)
    if live is not None:
        return live
    return _fmt_viol_detail(v, base, airport_zones, idx_to_pid, pairing_info)


def _append_pairing_viol_field(
    out: list[str],
    field: str,
    raw: str,
    idx_to_pid: dict[int, str] | None,
    pairing_info: dict[str, dict] | None,
    airport_zones: dict[str, str],
) -> None:
    """Emit pairing=<id> + local dep/arr times for violation detail lines."""
    try:
        if int(raw) < 0:
            out.append(f"{field}=ground")
            return
    except ValueError:
        pass
    lookup_pid = raw
    display = raw
    try:
        idx = int(raw)
        if idx_to_pid is not None:
            mapped = idx_to_pid.get(idx)
            if mapped is not None:
                lookup_pid = mapped
                display = mapped
    except ValueError:
        pass
    out.append(f"{field}={display}")
    if pairing_info and lookup_pid in pairing_info:
        times = _fmt_pairing_dep_arr_times(pairing_info[lookup_pid], airport_zones)
        if times:
            out.append(times)

def _collect_assignment_messages(checks: list[dict]) -> list[dict]:
    """Assignment log rows for Warning Message — successes and violations, ordered by step."""
    candidates = [
        c for c in checks
        if not c.get("skipped") and not c.get("line_check")
    ]
    rows: list[dict] = []
    for c in sorted(candidates, key=lambda x: (x.get("step", 0), x.get("pid", ""))):
        step = int(c.get("step", 0))
        if c.get("ok"):
            rows.append({"step": step, "check": c, "kind": "success"})
            continue
        viols = c.get("violations") or []
        for i, v in enumerate(viols):
            rows.append({
                "step": step,
                "check": c,
                "kind": "violation",
                "violation": v,
                # no_row entries (final line check) suppress the step number and pair tag
                "show_pair_tag": (i == 0) and not c.get("no_row"),
            })
    return rows


def _pairing_tag(pid: str) -> str:
    return f"[Pairing {pid}]"


def _warning_pair_tag(check: dict) -> str:
    """Pairing prefix in Warning Message rows; line checks and final checks omit the tag."""
    if check.get("line_check") or check.get("no_row"):
        return ""
    return _pairing_tag(str(check.get("pid", "")))



def _write_svg_report(
    html_data: list[dict],
    rp_start: date,
    rp_end: date,
    output_path: Path,
    airport_zones: dict[str, str],
    report_title: str = "RO Check",
    idx_to_pid: dict[int, str] | None = None,
    pairing_info: dict[str, dict] | None = None,
    manday_daily: dict[str, dict[int, dict[str, float]]] | None = None,
) -> None:
    import calendar as _cal

    PANEL_W = 150    # left label panel
    DAY_W   = 34     # px per calendar day column
    ROW_H   = 28     # px per data row
    BAR_H   = 18     # bar height within a row
    BAR_YO  = 5      # bar top offset inside row
    HDRM_H  = 16     # month-name header height
    HDRD_H  = 20     # day-number header height
    PX      = 10     # horizontal page margin
    # Blank space between last gantt row and violation/warning lines (~3 text lines).
    VIOL_GAP_AFTER_GANTT = 54
    WARN_CLR_NUM = "#7c3aed"      # (1) sequence — purple
    WARN_CLR_PAIR = "#2563eb"     # [Pairing …] — blue
    WARN_CLR_RULE = "#7d6210"     # Rule7501 — dark earthy yellow (土黄)
    WARN_CLR_DETAIL = "#dc2626"   # violation detail — red
    WARN_CLR_SUCCESS = "#15803d"  # assignment OK — green
    FONT = 'font-family="ui-sans-serif,system-ui,sans-serif"'
    MONO = 'font-family="ui-monospace,monospace"'

    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    rp_start_ts = epoch(rp_start.isoformat() + "T00:00:00")
    rp_end_ts   = epoch(rp_end.isoformat()   + "T23:59:59")
    elems: list[str] = []         # root elements (full-width: title, headers, separators, violation text)
    celems: list[str] = []        # chart elements always visible: day cols, grid lines, date cells
    celems_pairing: list[str] = []  # pairing bars (Pairing view)
    celems_flight: list[str] = []   # flight segment bars (Flight view)
    pelems: list[str] = []         # panel overlay (always on top, not scaled: labels, panel backgrounds)
    manday_popups: list[str] = []  # manday info popups (one per crew in final results)
    total_y = 28  # reserve top 28px for view-toggle tabs

    # ── View-toggle tab UI ───────────────────────────────────────────────────
    _TY, _TH, _TR = 4, 22, 3
    elems.append(
        f'<rect id="tab-pairing" x="{PX}" y="{_TY}" width="62" height="{_TH}" rx="{_TR}"'
        f' fill="#1d4ed8" style="cursor:pointer"/>'
    )
    elems.append(
        f'<text id="tab-pairing-text" x="{PX+31}" y="{_TY+15}" {FONT} font-size="10"'
        f' font-weight="600" fill="white" text-anchor="middle" style="cursor:pointer">Pairing</text>'
    )
    elems.append(
        f'<rect id="tab-flight" x="{PX+68}" y="{_TY}" width="52" height="{_TH}" rx="{_TR}"'
        f' fill="#e2e8f0" style="cursor:pointer"/>'
    )
    elems.append(
        f'<text id="tab-flight-text" x="{PX+94}" y="{_TY+15}" {FONT} font-size="10"'
        f' font-weight="600" fill="#64748b" text-anchor="middle" style="cursor:pointer">Flight</text>'
    )

    # Compute global date range across all crews (local calendar days)
    global_first: date | None = None
    global_last:  date | None = None
    def _local_dates(utc_ts: int, iata: str) -> date:
        return utc_ts_to_local(utc_ts, iata, airport_zones).date()

    for ce in html_data:
        if ce.get("section_header"):
            continue
        base = ce["base"]
        date_candidates: list[date] = [
            _local_dates(rp_start_ts, base),
            _local_dates(rp_end_ts, base),
        ]
        for f in ce["fixed"] + (ce.get("carried") or []):
            dep = f.get("dep") or base
            arv = f.get("arv") or base
            date_candidates += [
                _local_dates(f["start_utc"], dep),
                _local_dates(f["end_utc"], arv),
            ]
        for g in ce["ground"]:
            try:
                loc = g.get("location") or base
                date_candidates += [
                    _local_dates(epoch(g["start"]), loc),
                    _local_dates(epoch(g["end"]), loc),
                ]
            except Exception:
                pass
        for c in ce["checks"]:
            dep = c.get("dep") or base
            arv = c.get("arv") or base
            if c.get("start_utc"):
                date_candidates.append(_local_dates(c["start_utc"], dep))
            if c.get("end_utc"):
                date_candidates.append(_local_dates(c["end_utc"], arv))
        lo = min(date_candidates)
        hi = max(date_candidates)
        if global_first is None or lo < global_first:
            global_first = lo
        if global_last is None or hi > global_last:
            global_last = hi

    if global_first is None or global_last is None:
        global_first = rp_start
        global_last = rp_end

    days: list[date] = []
    d = global_first
    while d <= global_last:
        days.append(d)
        d += timedelta(days=1)
    n_days  = len(days)
    CHART_W = n_days * DAY_W
    TOTAL_W = PX + PANEL_W + CHART_W + PX

    def x_of(utc_ts: int, iata: str) -> float:
        ldt = utc_ts_to_local(utc_ts, iata, airport_zones)
        col = (ldt.date() - global_first).days
        frac = (ldt.hour * 3600 + ldt.minute * 60 + ldt.second) / 86400
        return PX + PANEL_W + (col + frac) * DAY_W

    def clip_x(x: float) -> float:
        return max(float(PX + PANEL_W), min(float(PX + PANEL_W + CHART_W), x))

    def draw_bar(x1: float, x2: float, y: float, color: str, label: str, tip: str, optimizer: bool = False) -> str:
        w = max(2.0, x2 - x1)
        # ~5px per char at 7px sans; no textLength stretch (wide fly bars looked bolder than GDO).
        cap = max(0, int(w / 5))
        tx = x1 + w / 2
        ty = y + BAR_H / 2
        lbl_svg = (
            f'<text class="chart-text" x="{tx:.1f}" y="{ty:.1f}" text-anchor="middle" dominant-baseline="central" '
            f'{FONT} font-size="7" font-weight="400" fill="rgba(255,255,255,0.9)">'
            f'{label[:cap]}</text>'
        ) if cap >= 1 else ""
        # Optimizer-placed duty → matcha dashed outline (extra guard <rect> for the
        # non-title wrappers; mirrors draw_bar_rich and the gantt CR outline).
        outline = (
            f'<rect x="{x1-1:.1f}" y="{y-1:.1f}" width="{w+2:.1f}" height="{BAR_H+2:.1f}"'
            f' rx="3" fill="none" stroke="#1b9d4b" stroke-width="1.5" stroke-dasharray="4 2"/>'
        ) if optimizer else ""
        return (
            f'<g><title>{tip}</title>'
            f'<rect x="{x1:.1f}" y="{y:.1f}" width="{w:.1f}" height="{BAR_H}" rx="2" fill="{color}"/>'
            f'{outline}{lbl_svg}</g>'
        )

    def draw_bar_rich(
        x1: float, x2: float, y: float, color: str, label: str,
        tip_h: int, tip_inner: str, tip_w: int = 0, optimizer: bool = False,
    ) -> str:
        """Bar with CSS-hover styled table tooltip (for Final Results)."""
        w = max(2.0, x2 - x1)
        cap = max(0, int(w / 5))
        tx = x1 + w / 2
        ty = y + BAR_H / 2
        lbl_svg = (
            f'<text class="chart-text" x="{tx:.1f}" y="{ty:.1f}" text-anchor="middle" dominant-baseline="central" '
            f'{FONT} font-size="7" font-weight="400" fill="rgba(255,255,255,0.9)">'
            f'{label[:cap]}</text>'
        ) if cap >= 1 else ""
        # Position tooltip above the bar; if too close to top, show below instead
        tip_w = max(float(tip_w), 0.0)
        tip_x = max(float(PX), x1)
        # Keep the popup's right edge inside the SVG viewport; bars near the
        # month end would otherwise push the tooltip off the right edge.
        tip_x = min(tip_x, TOTAL_W - PX - tip_w)
        tip_x = max(tip_x, float(PX))
        tip_y = y - tip_h - 5 if y - tip_h - 5 >= 5 else y + BAR_H + 3
        tip_g = (
            f'<g class="pbar-tip" data-tx="{tip_x:.1f}" data-ty="{tip_y:.1f}" transform="translate({tip_x:.1f},{tip_y:.1f})" '
            f'filter="url(#tip-shadow)">{tip_inner}</g>'
        )
        # Optimizer-placed duty → matcha dashed outline (mirrors the Live/Scenario
        # gantt --gantt-optimizer-border '#1b9d4b' for source === 'CR').
        outline = (
            f'<rect x="{x1-1:.1f}" y="{y-1:.1f}" width="{w+2:.1f}" height="{BAR_H+2:.1f}"'
            f' rx="3" fill="none" stroke="#1b9d4b" stroke-width="1.5" stroke-dasharray="4 2"/>'
        ) if optimizer else ""
        return (
            f'<g class="pbar">'
            f'<rect x="{x1:.1f}" y="{y:.1f}" width="{w:.1f}" height="{BAR_H}" rx="2" fill="{color}"/>'
            f'{outline}{lbl_svg}{tip_g}'
            f'</g>'
        )

    # Title
    total_y += 10
    elems.append(
        f'<text x="{PX}" y="{total_y+14}" {FONT} font-size="13" font-weight="700" fill="#0f172a">'
        f'{report_title} — RP: {rp_start} → {rp_end}</text>'
    )
    elems.append(
        f'<text x="{TOTAL_W-PX}" y="{total_y+14}" {FONT} font-size="9" fill="#64748b" text-anchor="end">'
        f'{datetime.now().strftime("%Y-%m-%d %H:%M")}</text>'
    )
    total_y += 28

    # Legend
    legend_items = [
        ("#3b82f6", "Fixed FLY"), ("#7c3aed", "Fixed other"),
        ("#94a3b8", "Ground rest"), ("#f97316", "SBY/RES"),
        ("#f59e0b", "SIM/TRN"), ("#a78bfa", "DHD"), ("#06b6d4", "OFC"),
        ("#22c55e", "Candidate OK"), ("#ef4444", "Candidate FAIL"),
    ]
    lx = PX
    for color, lbl in legend_items:
        elems.append(f'<rect x="{lx}" y="{total_y+2}" width="9" height="9" rx="1" fill="{color}"/>')
        elems.append(f'<text x="{lx+12}" y="{total_y+10}" {FONT} font-size="9" fill="#475569">{lbl}</text>')
        lx += int(len(lbl) * 5.8) + 18
    total_y += 20
    elems.append(
        f'<line x1="{PX}" y1="{total_y}" x2="{TOTAL_W-PX}" y2="{total_y}"'
        f' stroke="#93c5fd" stroke-width="1"/>')
    total_y += 10

    # Per-crew sections
    _in_final_section = False  # track when inside Final Results for MandayInfo button
    for crew_entry in html_data:
        if crew_entry.get("section_header"):
            _in_final_section = crew_entry.get("title") == "Final Results"
            total_y += 14
            elems.append(
                f'<rect x="{PX}" y="{total_y}" width="{TOTAL_W-2*PX}" height="24" rx="3" '
                f'fill="#1e3a8a"/>')
            elems.append(
                f'<text x="{PX+10}" y="{total_y+17}" {FONT} font-size="12" font-weight="700" '
                f'fill="#ffffff">{crew_entry["title"]}</text>')
            total_y += 30
            continue
        cid        = crew_entry["crew_id"]
        rank       = crew_entry["rank"]
        base       = crew_entry["base"]
        fixed      = crew_entry["fixed"]
        carried    = crew_entry.get("carried") or []
        ground     = crew_entry["ground"]
        checks     = crew_entry["checks"]
        round_no   = crew_entry.get("round_no")
        round_prefix = f"Round {round_no}: " if round_no else ""
        n_ok   = sum(1 for c in checks if not c.get("skipped") and not c.get("line_check") and c.get("ok"))
        n_fail = sum(1 for c in checks if not c.get("skipped") and not c.get("line_check") and not c.get("ok"))
        tz_str = format_utc_offset_label(rp_start_ts, base, airport_zones)

        # Crew / round header bar — medium blue between #eff6ff and #1e40af
        if _in_final_section:
            _section_top_y = total_y
        total_y += 6
        elems.append(
            f'<rect x="{PX}" y="{total_y}" width="{TOTAL_W-2*PX}" height="22" rx="3" '
            f'fill="#93c5fd" stroke="#60a5fa" stroke-width="0.5"/>')
        elems.append(
            f'<text x="{PX+8}" y="{total_y+15}" {FONT} font-size="11" font-weight="700" fill="#1e3a8a">'
            f'{round_prefix}Crew {cid}  {rank}  {base}  {tz_str}</text>')
        bx = float(TOTAL_W - PX - 8)
        for txt, bg, fg in [(f"{n_fail} FAIL", "#fee2e2", "#dc2626"), (f"{n_ok} OK", "#dcfce7", "#15803d")]:
            bw = len(txt) * 6.5 + 10
            bx -= bw + 6
            elems.append(f'<rect x="{bx:.0f}" y="{total_y+4}" width="{bw:.0f}" height="14" rx="7" fill="{bg}"/>')
            elems.append(
                f'<text x="{bx+bw/2:.0f}" y="{total_y+14}" {FONT} font-size="9" font-weight="600"'
                f' fill="{fg}" text-anchor="middle">{txt}</text>')
        total_y += 28

        # Month header
        y_m = total_y
        cur_mo: tuple | None = None
        mo_col_s = 0
        months: list[tuple[int, int, int, int]] = []
        for i, dy in enumerate(days):
            key = (dy.year, dy.month)
            if key != cur_mo:
                if cur_mo:
                    months.append((mo_col_s, i, *cur_mo))
                cur_mo = key
                mo_col_s = i
        if cur_mo:
            months.append((mo_col_s, n_days, *cur_mo))
        for cs, ce2, yr, mo in months:
            mx = PX + PANEL_W + cs * DAY_W
            mw = (ce2 - cs) * DAY_W
            mname = _cal.month_abbr[mo]
            celems.append(
                f'<rect x="{mx}" y="{y_m}" width="{mw}" height="{HDRM_H}"'
                f' fill="#dbeafe" stroke="#93c5fd" stroke-width="0.5"/>')
            celems.append(
                f'<text class="chart-text" x="{mx+mw/2:.0f}" y="{y_m+11}" {FONT} font-size="9" font-weight="600"'
                f' fill="#475569" text-anchor="middle">{mname} {yr}</text>')
        pelems.append(f'<rect x="{PX}" y="{y_m}" width="{PANEL_W}" height="{HDRM_H}" fill="#f1f5f9"/>')
        total_y += HDRM_H

        # Day number header  (with BLK/DP-per-day hover tooltip for Final Results rows)
        y_d = total_y
        blk_by_day: dict[date, float] = crew_entry.get("blk_by_day") or {}
        dp_by_day: dict[date, float] = crew_entry.get("dp_by_day") or {}
        credit_by_day_hdr: dict[date, float] = crew_entry.get("credit_by_day") or {}
        _has_manday_data = _in_final_section and ((manday_daily and cid in manday_daily) or bool(blk_by_day))
        pelems.append(f'<rect x="{PX}" y="{y_d}" width="{PANEL_W}" height="{HDRD_H}" fill="#f1f5f9"/>')
        _TIP_W, _TIP_H = 70, 46
        for i, dy in enumerate(days):
            dx = PX + PANEL_W + i * DAY_W
            is_wend = dy.weekday() >= 5
            is_rp   = rp_start <= dy <= rp_end
            bg = "#e2e8f0" if is_wend else "#f1f5f9"
            dow = ["Mo","Tu","We","Th","Fr","Sa","Su"][dy.weekday()]
            num_fill = "#f59e0b" if is_rp else "#64748b"
            num_w    = "600" if is_rp else "400"
            # Show the BLK/DP/CREDIT tooltip for every date, including zero values.
            blk_val = blk_by_day.get(dy, 0.0)
            dp_val = dp_by_day.get(dy, 0.0)
            credit_val = credit_by_day_hdr.get(dy, 0.0)
            if blk_val >= 0:
                bh = int(blk_val) // 60
                bm = round(blk_val) % 60
                dh = int(dp_val) // 60
                dm = round(dp_val) % 60
                ch = int(credit_val) // 60
                cm = round(credit_val) % 60
                blk_str = f"{bh}:{bm:02d}"
                dp_str = f"{dh}:{dm:02d}"
                credit_str = f"{ch}:{cm:02d}"
                tip_cx = max(
                    PX + PANEL_W + _TIP_W / 2,
                    min(PX + PANEL_W + CHART_W - _TIP_W / 2, dx + DAY_W / 2),
                )
                tip_x = tip_cx - _TIP_W / 2
                tip_y = y_d - _TIP_H - 2        # above the day cell
                tip_svg = (
                    f'<g class="day-tip" data-tx="{tip_x:.1f}" data-ty="{tip_y:.1f}" transform="translate({tip_x:.1f},{tip_y:.1f})" '
                    f'filter="url(#tip-shadow)">'
                    f'<rect width="{_TIP_W}" height="{_TIP_H}" rx="3"'
                    f' fill="white" stroke="#93c5fd" stroke-width="0.5"/>'
                    f'<text x="{_TIP_W/2:.0f}" y="14" {FONT} font-size="9"'
                    f' font-weight="600" fill="#1e40af" text-anchor="middle">BLK {blk_str}</text>'
                    f'<text x="{_TIP_W/2:.0f}" y="27" {FONT} font-size="9"'
                    f' font-weight="600" fill="#7c3aed" text-anchor="middle">DP {dp_str}</text>'
                    f'<text x="{_TIP_W/2:.0f}" y="40" {FONT} font-size="9"'
                    f' font-weight="600" fill="#0ea5e9" text-anchor="middle">CR {credit_str}</text>'
                    f'</g>'
                )
            else:
                tip_svg = ""
            celems.append(
                f'<g class="day-cell">'
                f'<rect x="{dx}" y="{y_d}" width="{DAY_W}" height="{HDRD_H}"'
                f' fill="{bg}" stroke="#93c5fd" stroke-width="0.5"/>'
                f'<rect class="day-hover-hl" x="{dx}" y="{y_d}" width="{DAY_W}" height="{HDRD_H}"'
                f' fill="transparent" stroke="none"/>'
                f'<text class="chart-text" x="{dx+DAY_W/2:.0f}" y="{y_d+11}" {FONT} font-size="9"'
                f' font-weight="{num_w}" fill="{num_fill}" text-anchor="middle">{dy.day}</text>'
                f'<text class="chart-text" x="{dx+DAY_W/2:.0f}" y="{y_d+19}" {FONT} font-size="7"'
                f' fill="#475569" text-anchor="middle">{dow}</text>'
                + tip_svg +
                f'</g>'
            )
        total_y += HDRD_H

        # Build row list
        rows: list[tuple[str, list]] = []
        pre_bars: list = []

        for f in fixed:
            clr = _fixed_bar_color(f)
            dep, arv = f.get("dep") or base, f.get("arv") or base
            tip = (
                f"PairingID: {f['pid']}  {f.get('group', 'FLY').upper()}\n"
                f"{format_local(f['start_utc'], dep, airport_zones, '%m-%d %H:%M')} → "
                f"{format_local(f['end_utc'], arv, airport_zones, '%m-%d %H:%M')}"
            )
            rich = f.get("rich_tip")  # (tip_h, tip_inner, tip_w) or None
            rest_end = None
            info = pairing_info.get(f['pid'])
            if info and info.get('rest_end'):
                try:
                    rest_end = epoch(info['rest_end'])
                except:
                    rest_end = None
            pre_bars.append((f["start_utc"], f["end_utc"], dep, arv, clr, str(f["pid"]), tip, rich, f.get("segs"), rest_end, bool(f.get("optimizer"))))
        for cr in carried:
            dep, arv = cr.get("dep") or base, cr.get("arv") or base
            tip = (
                f"PairingID: {cr['pid']}  {cr.get('group', 'FLY').upper()} (assigned)\n"
                f"{format_local(cr['start_utc'], dep, airport_zones, '%m-%d %H:%M')} → "
                f"{format_local(cr['end_utc'], arv, airport_zones, '%m-%d %H:%M')}"
            )
            rest_end = None
            info = pairing_info.get(cr['pid'])
            if info and info.get('rest_end'):
                try:
                    rest_end = epoch(info['rest_end'])
                except:
                    rest_end = None
            pre_bars.append((
                cr["start_utc"], cr["end_utc"], dep, arv,
                _BAR_COLORS["cand_ok"], str(cr["pid"]), tip, None, cr.get("segs"), rest_end,
            ))
        for g in ground:
            try:
                gs, ge = epoch(g["start"]), epoch(g["end"])
            except Exception:
                continue
            loc = g.get("location") or base
            lbl = g.get("label") or g.get("assignment") or "?"
            clr = _ground_color(g.get("assignment",""), g.get("group",""), g.get("is_rest", True))
            tip = (
                f"{lbl}\n"
                f"{format_local(gs, loc, airport_zones, '%m-%d %H:%M')} → "
                f"{format_local(ge, loc, airport_zones, '%m-%d %H:%M')}"
            )
            pre_bars.append((gs, ge, loc, loc, clr, lbl, tip, None, None, None, bool(g.get("optimizer"))))
        if pre_bars:
            # Empty string hides the left label (Final Results); missing key → Pre-assignments
            pre_label = crew_entry.get("pre_row_label", "Pre-assignments")
            rows.append((pre_label, pre_bars))
        for c in checks:
            if c.get("skipped") or c.get("line_check") or c.get("no_row"):
                continue
            ok  = c.get("ok", False)
            clr = _BAR_COLORS["cand_ok"] if ok else _BAR_COLORS["cand_fail"]
            icon = "OK" if ok else "FAIL"
            lbl  = f"[{c['step']}] {c['pid']} {icon}"
            if c.get("start_utc"):
                dep, arv = c.get("dep") or base, c.get("arv") or base
                tip = (
                    f"PairingID: {c['pid']}  {c.get('group', 'FLY').upper()}\n"
                    f"{format_local(c['start_utc'], dep, airport_zones, '%m-%d %H:%M')} → "
                    f"{format_local(c['end_utc'], arv, airport_zones, '%m-%d %H:%M')}"
                )
                rest_end = None
                info = pairing_info.get(c['pid'])
                if info and info.get('rest_end'):
                    try:
                        rest_end = epoch(info['rest_end'])
                    except:
                        rest_end = None
                bars = [(
                    c["start_utc"], c["end_utc"], dep, arv,
                    clr, str(c["pid"]), tip, None, c.get("segs"), rest_end,
                )]
            else:
                bars = []
            rows.append((lbl, bars))

        # Draw rows
        for row_lbl, row_bars in rows:
            ry = total_y
            # Single white base covers the entire chart row — stretches with zoom
            celems.append(
                f'<rect x="{PX+PANEL_W}" y="{ry}" width="{CHART_W}" height="{ROW_H}" fill="#fafafa"/>')
            # Coloured accents (weekend / RP) on top of the base
            for i, dy in enumerate(days):
                dx = PX + PANEL_W + i * DAY_W
                is_wend = dy.weekday() >= 5
                is_rp   = rp_start <= dy <= rp_end
                if is_wend:
                    celems.append(
                        f'<rect x="{dx}" y="{ry}" width="{DAY_W}" height="{ROW_H}" fill="#f0effe"/>')
                elif is_rp:
                    celems.append(
                        f'<rect x="{dx}" y="{ry}" width="{DAY_W}" height="{ROW_H}" fill="#eff6ff"/>')
            for i in range(n_days + 1):
                sx = PX + PANEL_W + i * DAY_W
                celems.append(
                    f'<line x1="{sx}" y1="{ry}" x2="{sx}" y2="{ry+ROW_H}"'
                    f' stroke="#e2e8f0" stroke-width="0.5"/>')
            rp_c0 = (rp_start - global_first).days
            rp_c1 = (rp_end   - global_first).days + 1
            rx0   = PX + PANEL_W + rp_c0 * DAY_W
            rx1   = PX + PANEL_W + rp_c1 * DAY_W
            celems.append(
                f'<rect x="{rx0}" y="{ry}" width="{rx1-rx0}" height="{ROW_H}"'
                f' fill="none" stroke="#3b82f6" stroke-width="0.8"'
                f' stroke-dasharray="4,2" opacity="0.4"/>')
            elems.append(
                f'<line x1="{PX}" y1="{ry+ROW_H}" x2="{TOTAL_W-PX}" y2="{ry+ROW_H}"'
                f' stroke="#e2e8f0" stroke-width="0.5"/>')
            pelems.append(f'<rect x="{PX}" y="{ry}" width="{PANEL_W}" height="{ROW_H}" fill="#f8fafc"/>')
            pelems.append(
                f'<line x1="{PX+PANEL_W}" y1="{ry}" x2="{PX+PANEL_W}" y2="{ry+ROW_H}"'
                f' stroke="#93c5fd" stroke-width="1"/>')
            pelems.append(
                f'<text x="{PX+6}" y="{ry+ROW_H//2+4}" {FONT} font-size="9" fill="#1e293b">'
                f'{row_lbl[:24]}</text>')
            if _has_manday_data:
                pelems.append(
                    f'<g class="manday-btn" data-crew="{cid}" style="cursor:pointer">'
                    f'<rect x="{PX+4}" y="{ry-36}" width="64" height="18" rx="4" '
                    f'fill="#dbeafe" stroke="#3b82f6" stroke-width="0.8"/>'
                    f'<text x="{PX+36}" y="{ry-23}" {FONT} font-size="9" font-weight="600" '
                    f'fill="#1d4ed8" text-anchor="middle">MandayInfo</text>'
                    f'</g>')
            for bar_tuple in row_bars:
                bstart, bend, bstart_iata, bend_iata, bcolor, blabel, btip = bar_tuple[:7]
                rich  = bar_tuple[7] if len(bar_tuple) > 7 else None
                bsegs = bar_tuple[8] if len(bar_tuple) > 8 else None
                brest_end = bar_tuple[9] if len(bar_tuple) > 9 else None
                boptimizer = bool(bar_tuple[10]) if len(bar_tuple) > 10 else False
                bx1 = clip_x(x_of(bstart, bstart_iata))
                bx2 = clip_x(x_of(bend, bend_iata))
                # Pairing view — one bar per pairing (full duty span)
                if rich:
                    tip_h, tip_inner, tip_w = rich
                    celems_pairing.append(
                        draw_bar_rich(bx1, bx2 - 0.5, ry + BAR_YO, bcolor, blabel, tip_h, tip_inner, tip_w, boptimizer)
                    )
                else:
                    celems_pairing.append(draw_bar(bx1, bx2 - 0.5, ry + BAR_YO, bcolor, blabel, btip, boptimizer))
                # Flight view bars — per segment; DHD segments use purple
                if bsegs:
                    for seg in bsegs:
                        sst, sen = seg.get("start_utc", 0), seg.get("end_utc", 0)
                        if not sst or not sen:
                            continue
                        sx1 = clip_x(x_of(sst, base))
                        sx2 = clip_x(x_of(sen, base))
                        seg_color = _segment_bar_color(seg, bcolor)
                        seg_lbl = seg.get("flt_num") or blabel
                        stip_h, stip_inner, stip_w = _build_seg_tip(seg)
                        celems_flight.append(
                            draw_bar_rich(
                                sx1, sx2 - 0.5, ry + BAR_YO,
                                seg_color, seg_lbl, stip_h, stip_inner, stip_w, boptimizer,
                            )
                        )
                else:
                    # No segment data (ground duty / non-FLY pairing): same bar in both views
                    if rich:
                        tip_h, tip_inner, tip_w = rich
                        celems_flight.append(draw_bar_rich(bx1, bx2 - 0.5, ry + BAR_YO, bcolor, blabel, tip_h, tip_inner, tip_w, boptimizer))
                    else:
                        celems_flight.append(draw_bar(bx1, bx2 - 0.5, ry + BAR_YO, bcolor, blabel, btip, boptimizer))
                # Draw rest period bar if present (post last duty, Live/Scenario style)
                if brest_end and brest_end > bend:
                    # Start at pairing visual end (bx2-0.5), not raw bx2 — otherwise the
                    # inter-bar 0.5px gap used between adjacent pucks appears as white space.
                    rx1 = bx2 - 0.5
                    rx2 = clip_x(x_of(brest_end, bend_iata))
                    rest_color = _BAR_COLORS["rest"]
                    rest_label = "REST"
                    rest_min = max(0, int((brest_end - bend) // 60))
                    rest_tip = f"REST {_fmt_blk_min(rest_min)} after {blabel}"
                    celems_pairing.append(draw_bar(rx1, rx2 - 0.5, ry + BAR_YO, rest_color, rest_label, rest_tip))
                    celems_flight.append(draw_bar(rx1, rx2 - 0.5, ry + BAR_YO, rest_color, rest_label, rest_tip))
            total_y += ROW_H

        # Assignment log (success + violations) below gantt
        assignment_messages = _collect_assignment_messages(checks)
        if assignment_messages:
            total_y += VIOL_GAP_AFTER_GANTT
            elems.append(
                f'<text x="{PX+6}" y="{total_y+13}" {FONT} font-size="11" font-weight="600" '
                f'fill="#991b1b">Warning Message</text>'
            )
            total_y += 22
            for row in assignment_messages:
                step = row["step"]
                c = row["check"]
                num_part = f"({step})"
                if row["kind"] == "success":
                    pid = str(c.get("pid", ""))
                    msg = f"  Pairing {pid} was successfully assigned."
                    elems.append(
                        f'<text x="{PX+6}" y="{total_y+11}" {MONO} font-size="9">'
                        f'<tspan fill="{WARN_CLR_NUM}">{num_part}</tspan>'
                        f'<tspan fill="{WARN_CLR_SUCCESS}">{msg}</tspan>'
                        f'</text>'
                    )
                    total_y += 18
                    continue
                v = row["violation"]
                rule   = f"Rule{v.split('|')[0]}"
                detail = _warning_viol_detail(
                    v, base, airport_zones, idx_to_pid, pairing_info,
                )
                pair_tag = _warning_pair_tag(c) if row.get("show_pair_tag", True) else ""
                rule_part = f"  {rule}"
                detail_part = f"  {detail}"
                x_off = PX + 6 if row.get("show_pair_tag", True) else PX + 30
                if row.get("show_pair_tag", True):
                    # Keep the pairing tag on its own line and push the first
                    # warning onto the NEXT line (don't crowd them on one row).
                    elems.append(
                        f'<text x="{x_off}" y="{total_y+11}" {MONO} font-size="9">'
                        f'<tspan fill="{WARN_CLR_NUM}">{num_part}</tspan>'
                        f'<tspan fill="{WARN_CLR_PAIR}">{pair_tag}</tspan>'
                        f'</text>'
                    )
                    total_y += 18
                elems.append(
                    f'<text x="{PX+30}" y="{total_y+11}" {MONO} font-size="9">'
                    f'<tspan fill="{WARN_CLR_RULE}">{rule_part}</tspan>'
                    f'<tspan fill="{WARN_CLR_DETAIL}">{detail_part}</tspan>'
                    f'</text>'
                )
                total_y += 18
        # ── Manday daily popup for final results ─────────────────────────
        if _has_manday_data:
            _POPUP_W = 244
            _MROW_H = 12
            _MCOL_HDR_H = 14
            _MTITLE_H = 22
            _MPAD = 6
            _MCOLS: list[tuple[str, int]] = [("Date", 72), ("BH", 48), ("DP", 48), ("Credit", 48)]
            n_data_rows = len(days)
            _POPUP_H = _MTITLE_H + _MCOL_HDR_H + n_data_rows * _MROW_H + _MPAD * 3

            def _fmt_manday_min(m: float) -> str:
                v = round(m)
                return f"{v // 60}:{v % 60:02d}"

            _popup_x = PX + PANEL_W + 4
            _popup_y = _section_top_y
            _EPOCH = date(1970, 1, 1)

            pl: list[str] = []
            pl.append(
                f'<g id="manday-crew-{cid}" class="manday-popup" style="display:none">'
            )
            pl.append(
                f'<g class="manday-popup-inner" transform="translate(0,0)" '
                f'filter="url(#tip-shadow)">'
            )
            pl.append(
                f'<rect x="{_popup_x}" y="{_popup_y}" width="{_POPUP_W}" height="{_POPUP_H}" '
                f'rx="6" fill="white" stroke="#3b82f6" stroke-width="1.5"/>'
            )
            pl.append(
                f'<rect class="manday-drag-handle" x="{_popup_x}" y="{_popup_y}" '
                f'width="{_POPUP_W}" height="{_MTITLE_H}" rx="6" fill="#1e3a8a" '
                f'style="cursor:grab"/>'
            )
            pl.append(
                f'<rect x="{_popup_x}" y="{_popup_y + _MTITLE_H - 4}" width="{_POPUP_W}" '
                f'height="4" fill="#1e3a8a"/>'
            )
            pl.append(
                f'<text class="manday-drag-handle" x="{_popup_x + _MPAD}" y="{_popup_y + 16}" '
                f'{FONT} font-size="11" font-weight="700" fill="white" '
                f'style="cursor:grab;pointer-events:none">Crew {cid} — Daily Manday</text>'
            )
            pl.append(
                f'<g class="manday-close" data-crew="{cid}" style="cursor:pointer">'
                f'<circle cx="{_popup_x + _POPUP_W - 14}" cy="{_popup_y + 11}" r="8" fill="#dc2626"/>'
                f'<line x1="{_popup_x + _POPUP_W - 19}" y1="{_popup_y + 6}" '
                f'x2="{_popup_x + _POPUP_W - 9}" y2="{_popup_y + 16}" '
                f'stroke="white" stroke-width="1.5"/>'
                f'<line x1="{_popup_x + _POPUP_W - 9}" y1="{_popup_y + 6}" '
                f'x2="{_popup_x + _POPUP_W - 19}" y2="{_popup_y + 16}" '
                f'stroke="white" stroke-width="1.5"/>'
                f'</g>'
            )
            _col_x = _popup_x + _MPAD
            _hdr_y = _popup_y + _MTITLE_H + _MPAD
            pl.append(
                f'<rect x="{_popup_x}" y="{_hdr_y - 2}" width="{_POPUP_W}" '
                f'height="{_MCOL_HDR_H}" fill="#dbeafe"/>'
            )
            for col_name, col_w in _MCOLS:
                pl.append(
                    f'<text x="{_col_x + 4}" y="{_hdr_y + 11}" {FONT} font-size="9" '
                    f'font-weight="600" fill="#1e40af">{col_name}</text>'
                )
                _col_x += col_w
            _row_y = _hdr_y + _MCOL_HDR_H
            for i, dy in enumerate(days):
                day_ord = (dy - _EPOCH).days
                bh_val = blk_by_day.get(dy, 0.0)
                dp_val = dp_by_day.get(dy, 0.0)
                credit_val = credit_by_day_hdr.get(dy, 0.0)
                bg = "#f0f9ff" if i % 2 == 0 else "white"
                pl.append(
                    f'<rect x="{_popup_x}" y="{_row_y}" width="{_POPUP_W}" '
                    f'height="{_MROW_H}" fill="{bg}"/>'
                )
                _c_x = _popup_x + _MPAD
                for ci, (_, col_w) in enumerate(_MCOLS):
                    if ci == 0:
                        txt = dy.strftime("%m-%d")
                        clr = "#475569"
                    elif ci == 1:
                        txt = _fmt_manday_min(bh_val)
                        clr = "#059669"
                    elif ci == 2:
                        txt = _fmt_manday_min(dp_val)
                        clr = "#7c3aed"
                    else:
                        txt = _fmt_manday_min(credit_val)
                        clr = "#0ea5e9"
                    pl.append(
                        f'<text x="{_c_x + 4}" y="{_row_y + 10}" {FONT} font-size="8" '
                        f'fill="{clr}">{txt}</text>'
                    )
                    _c_x += col_w
                _row_y += _MROW_H
            pl.append(
                f'<line x1="{_popup_x}" y1="{_popup_y + _POPUP_H}" '
                f'x2="{_popup_x + _POPUP_W}" y2="{_popup_y + _POPUP_H}" '
                f'stroke="#e2e8f0" stroke-width="0.5"/>'
            )
            pl.append('</g>')  # close manday-popup-inner
            pl.append('</g>')  # close manday-popup
            manday_popups.append("\n".join(pl))
        total_y += 14

    total_h = total_y + 12
    _chart_left  = PX + PANEL_W
    _chart_right = PX + PANEL_W + CHART_W
    _zoom_js = f"""\
(function(){{
  var svg = document.getElementById('ro-gantt');
  var chartSvg = document.getElementById('chart-svg');
  var sel = document.getElementById('zoom-sel');
  var VBW = {TOTAL_W}, TH = {total_h};
  var CL = {_chart_left}, CR = {_chart_right}, CW = {CHART_W};
  var MIN_SEL = {2 * DAY_W};
  var dragging = false, startX = 0;

  function toSvgX(e) {{
    var rect = svg.getBoundingClientRect();
    return (e.clientX - rect.left) * VBW / rect.width;
  }}
  function clamp(x) {{ return Math.max(CL, Math.min(CR, x)); }}
  function applyZoom(x1, x2) {{
    chartSvg.setAttribute('viewBox', x1 + ' 0 ' + (x2 - x1) + ' ' + TH);
    var invS = (x2 - x1) / CW;
    chartSvg.querySelectorAll('text.chart-text').forEach(function(t) {{
      var tx = parseFloat(t.getAttribute('x') || '0');
      t.setAttribute('transform',
        'translate(' + (tx * (1 - invS)) + ',0) scale(' + invS + ',1)');
    }});
    chartSvg.querySelectorAll('.pbar-tip,.day-tip').forEach(function(g) {{
      var tx = parseFloat(g.getAttribute('data-tx') || '0');
      var ty = parseFloat(g.getAttribute('data-ty') || '0');
      g.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + invS + ',1)');
    }});
  }}
  function resetZoom() {{
    chartSvg.setAttribute('viewBox', CL + ' 0 ' + CW + ' ' + TH);
    chartSvg.querySelectorAll('text.chart-text').forEach(function(t) {{
      t.removeAttribute('transform');
    }});
    chartSvg.querySelectorAll('.pbar-tip,.day-tip').forEach(function(g) {{
      var tx = parseFloat(g.getAttribute('data-tx') || '0');
      var ty = parseFloat(g.getAttribute('data-ty') || '0');
      g.setAttribute('transform', 'translate(' + tx + ',' + ty + ')');
    }});
  }}

  // ── View toggle ──────────────────────────────────────────────────────────
  function setView(v) {{
    var isP = v === 'pairing';
    document.getElementById('pairing-bars').setAttribute('display', isP ? '' : 'none');
    document.getElementById('flight-bars').setAttribute('display', isP ? 'none' : '');
    document.getElementById('tab-pairing').setAttribute('fill', isP ? '#1d4ed8' : '#e2e8f0');
    document.getElementById('tab-pairing-text').setAttribute('fill', isP ? 'white' : '#64748b');
    document.getElementById('tab-flight').setAttribute('fill', isP ? '#e2e8f0' : '#1d4ed8');
    document.getElementById('tab-flight-text').setAttribute('fill', isP ? '#64748b' : 'white');
    resetZoom();
  }}
  ['tab-pairing','tab-pairing-text'].forEach(function(id) {{
    document.getElementById(id).addEventListener('click', function() {{ setView('pairing'); }});
  }});
  ['tab-flight','tab-flight-text'].forEach(function(id) {{
    document.getElementById(id).addEventListener('click', function() {{ setView('flight'); }});
  }});

  // ── Drag-to-zoom ─────────────────────────────────────────────────────────
  svg.addEventListener('mousedown', function(e) {{
    if (e.button !== 0) return;
    if (e.target.closest('.manday-drag-handle')) return;
    var x = toSvgX(e);
    if (x < CL || x > CR) return;
    dragging = true; startX = x;
    sel.setAttribute('x', x); sel.setAttribute('width', 0);
    sel.setAttribute('display', 'block');
    svg.style.cursor = 'crosshair';
    e.preventDefault();
  }});
  window.addEventListener('mousemove', function(e) {{
    if (!dragging) return;
    var x = clamp(toSvgX(e));
    var x1 = Math.min(startX, x), x2 = Math.max(startX, x);
    sel.setAttribute('x', x1); sel.setAttribute('width', x2 - x1);
  }});
  window.addEventListener('mouseup', function(e) {{
    if (!dragging) return;
    dragging = false;
    svg.style.cursor = 'default';
    sel.setAttribute('display', 'none');
    var x = clamp(toSvgX(e));
    var x1 = Math.min(startX, x), x2 = Math.max(startX, x);
    if (x2 - x1 < MIN_SEL) return;
    applyZoom(x1, x2);
  }});
  svg.addEventListener('dblclick', function(e) {{
    if (e.target.id.indexOf('tab-') === 0) return;  // ignore tab clicks
    resetZoom();
  }});
  document.addEventListener('keydown', function(e) {{
    if (e.key === 'Escape') {{
      if (dragging) {{ dragging = false; sel.setAttribute('display','none'); svg.style.cursor='default'; }}
      else {{ resetZoom(); }}
    }}
  }});
  window.addEventListener('scroll', function() {{
    if (dragging) {{ dragging = false; sel.setAttribute('display','none'); svg.style.cursor='default'; }}
  }}, true);
}})();"""
    _manday_js = f"""\
(function(){{
  var svg = document.getElementById('ro-gantt');
  if (!svg) return;
  var VBW = parseFloat(svg.getAttribute('viewBox').split(' ')[2]);
  var VBH = parseFloat(svg.getAttribute('viewBox').split(' ')[3]);
  function svgPos(e) {{
    var r = svg.getBoundingClientRect();
    return {{ x: (e.clientX - r.left) * VBW / r.width, y: (e.clientY - r.top) * VBH / r.height }};
  }}

  // ── MandayInfo button click → show popup ──
  svg.querySelectorAll('.manday-btn').forEach(function(btn) {{
    btn.addEventListener('click', function(e) {{
      e.stopPropagation();
      var cid = this.getAttribute('data-crew');
      svg.querySelectorAll('.manday-popup').forEach(function(p) {{ p.style.display = 'none'; }});
      var popup = document.getElementById('manday-crew-' + cid);
      if (popup) {{
        popup.style.display = 'block';
        // Reset drag offset when showing
        var inner = popup.querySelector('.manday-popup-inner');
        if (inner) {{
          inner.setAttribute('transform', 'translate(0,0)');
          inner.setAttribute('data-tx', '0');
          inner.setAttribute('data-ty', '0');
        }}
      }}
    }});
  }});

  // ── Close button (X) → hide popup ──
  svg.querySelectorAll('.manday-close').forEach(function(cls) {{
    cls.addEventListener('click', function(e) {{
      e.stopPropagation();
      var cid = this.getAttribute('data-crew');
      var popup = document.getElementById('manday-crew-' + cid);
      if (popup) popup.style.display = 'none';
    }});
  }});

  // ── Drag popup by title bar ──
  var dragInfo = null, _mandayDragEnded = false;
  svg.addEventListener('mousedown', function(e) {{
    var handle = e.target.closest('.manday-drag-handle');
    if (!handle) return;
    var popup = e.target.closest('.manday-popup');
    if (!popup || popup.style.display === 'none') return;
    var inner = popup.querySelector('.manday-popup-inner');
    if (!inner) return;
    var p = svgPos(e);
    dragInfo = {{
      inner: inner, handle: handle,
      sx: p.x, sy: p.y,
      tx: parseFloat(inner.getAttribute('data-tx') || '0'),
      ty: parseFloat(inner.getAttribute('data-ty') || '0')
    }};
    handle.style.cursor = 'grabbing';
    e.preventDefault();
  }});
  window.addEventListener('mousemove', function(e) {{
    if (!dragInfo) return;
    var p = svgPos(e);
    var tx = dragInfo.tx + p.x - dragInfo.sx;
    var ty = dragInfo.ty + p.y - dragInfo.sy;
    dragInfo.inner.setAttribute('transform', 'translate(' + tx + ',' + ty + ')');
    dragInfo.inner.setAttribute('data-tx', tx);
    dragInfo.inner.setAttribute('data-ty', ty);
  }});
  window.addEventListener('mouseup', function() {{
    if (!dragInfo) return;
    dragInfo.handle.style.cursor = 'grab';
    dragInfo = null;
    _mandayDragEnded = true;
  }});

  // ── Click elsewhere → hide all manday popups ──
  svg.addEventListener('click', function(e) {{
    if (_mandayDragEnded) {{ _mandayDragEnded = false; return; }}
    if (dragInfo) return;
    if (!e.target.closest('.manday-popup') && !e.target.closest('.manday-btn')) {{
      svg.querySelectorAll('.manday-popup').forEach(function(p) {{ p.style.display = 'none'; }});
    }}
  }});

  // ── Escape key → hide all ──
  document.addEventListener('keydown', function(e) {{
    if (e.key === 'Escape') {{
      svg.querySelectorAll('.manday-popup').forEach(function(p) {{ p.style.display = 'none'; }});
      dragInfo = null;
    }}
  }});
}})();"""
    svg = (
        f'<svg id="ro-gantt" width="100%" viewBox="0 0 {TOTAL_W} {total_h}"'
        f' preserveAspectRatio="xMinYMin meet" overflow="visible"'
        f' xmlns="http://www.w3.org/2000/svg">\n'
        f'<defs>'
        f'<filter id="tip-shadow" x="-5%" y="-10%" width="115%" height="130%">'
        f'<feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#00000033"/>'
        f'</filter>'
        f'<clipPath id="page-clip">'
        f'<rect x="0" y="0" width="{TOTAL_W}" height="{total_h}"/>'
        f'</clipPath>'
        f'</defs>\n'
        f'<style>'
        f'.pbar-tip{{display:none;pointer-events:none;}}'
        f'.pbar:hover .pbar-tip{{display:block;}}'
        f'.day-tip{{display:none;pointer-events:none;}}'
        f'.day-cell:hover .day-tip{{display:block;}}'
        f'.day-cell:hover .day-hover-hl{{fill:rgba(59,130,246,0.18);}}'
        f'</style>\n'
        f'<rect width="{TOTAL_W}" height="{total_h}" fill="#f8fafc"/>\n'
        + f'<g clip-path="url(#page-clip)">\n'
        + '\n'.join(elems)
        + f'\n</g>'
        + f'\n<svg id="chart-svg"'
          f' x="{_chart_left}" y="0" width="{CHART_W}" height="{total_h}"'
          f' viewBox="{_chart_left} 0 {CHART_W} {total_h}"'
          f' preserveAspectRatio="none" overflow="hidden">'
        + '\n'.join(celems)
        + '\n<g id="pairing-bars">' + '\n'.join(celems_pairing) + '\n</g>'
        + '\n<g id="flight-bars" display="none">' + '\n'.join(celems_flight) + '\n</g>'
        + '\n</svg>'
        + f'\n<g id="panel-grp">'
        + '\n'.join(pelems)
        + '\n</g>'
        + f'\n<g id="manday-popups-group">'
        + '\n'.join(manday_popups)
        + '\n</g>'
        + f'\n<rect id="zoom-sel" display="none" x="{_chart_left}" y="0" width="0" height="{total_h}"'
          f' fill="rgba(59,130,246,0.12)" stroke="#3b82f6" stroke-width="1" pointer-events="none"/>'
        + f'\n<script>//<![CDATA[\n{_zoom_js}\n//]]></script>'
        + f'\n<script>//<![CDATA[\n{_manday_js}\n//]]></script>'
        + '\n</svg>'
    )

    if output_path.exists():
        output_path.unlink()
    try:
        output_path.write_text(svg, encoding="utf-8")
    except OSError as exc:
        print(f"ERROR: could not write SVG report to {output_path}: {exc}", file=sys.stderr)
        raise
    if not output_path.is_file():
        print(f"ERROR: SVG report missing after write: {output_path}", file=sys.stderr)
        sys.exit(1)
    print(f"SVG report → {output_path}")


# ── Main ──────────────────────────────────────────────────────────────────────
def run_check(
    *,
    application: str = "optimizer",
    results_path: Path | None = None,
    report_title: str = "RO Check",
    assignments_path: Path | None = None,
    batch_assign_then_check: bool = False,
) -> None:
    """Replay sequential crew×pairing legality checks on the F8 RO Engine.

    application="optimizer" — baseline Counter diff vs PA-only line (formal RO).
    application="editor"    — report absolute check_line violations (no baseline diff).

    Input: assignments.txt — ordered rounds of crew + pairing lists (see parse_assignments).
    Engine is bound once via f8_official_engine (rust_checker base ∪ shared extras).
    Successful pairings accumulate as check_line candidates (no rebuild).
    batch_assign_then_check is ignored (kept for call-site compatibility).
    """
    try:
        import rois_rule_engine_rs
    except ImportError:
        print(
            "ERROR: rois_rule_engine_rs not installed.\n"
            "  Build with: cd rule-engine-rs/py && maturin develop --release",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        rois_rule_engine_rs.Engine(application="optimizer")
    except TypeError:
        print(
            "ERROR: rois_rule_engine_rs is outdated (missing Engine.application).\n"
            f"  Current Python: {sys.executable}\n"
            "  Rebuild with: cd rule-engine-rs/py && maturin develop --release\n"
            "  Or upgrade user install: cd rule-engine-rs/py && python3 -m pip install -e .",
            file=sys.stderr,
        )
        sys.exit(1)

    ro_path = HERE / "ro_input.txt"
    if not ro_path.exists():
        print(f"ERROR: {ro_path} not found", file=sys.stderr)
        sys.exit(1)

    assignments_path = (assignments_path or (HERE / "assignments.txt")).resolve()
    if not assignments_path.exists():
        print(f"ERROR: {assignments_path} not found", file=sys.stderr)
        sys.exit(1)
    try:
        assignment_plan, auto_fill_do = parse_assignments(assignments_path)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    target_crew_ids_ordered = list(dict.fromkeys(c for c, _ in assignment_plan))
    target_pairing_ids_ordered: list[str] = []
    seen_pairings: set[str] = set()
    for _, pids in assignment_plan:
        for pid in pids:
            if pid not in seen_pairings:
                seen_pairings.add(pid)
                target_pairing_ids_ordered.append(pid)

    target_crew_ids = set(target_crew_ids_ordered)
    target_pairing_ids = set(target_pairing_ids_ordered)

    if not target_crew_ids:
        print("ERROR: no crews to check", file=sys.stderr)
        sys.exit(1)
    # target_pairing_ids may be empty when all crews list only pre-assignments.

    use_baseline_diff = application == "optimizer"
    mode_label = (
        "Optimizer (RO — new violations only, PA-ignore on pre-assign)"
        if use_baseline_diff
        else "Editor (Live Gantt — full line legality)"
    )
    out_path = (results_path or (HERE / "results_ro.svg")).resolve()
    print(f"Mode:   {mode_label}")
    print(f"Output: {out_path}")

    print(f"Loading {ro_path.name} ...")
    sections = parse_ro(ro_path)

    manday_blh = _build_manday_baseline(
        sections.get("CrewMandayFd", {}).get("rows", []),
    )
    manday_dp = _build_manday_metric_baseline(
        sections.get("CrewMandayFd", {}).get("rows", []),
        "dp",
    )
    manday_credit = _build_manday_metric_baseline(
        sections.get("CrewMandayFd", {}).get("rows", []),
        "credit",
    )

    def _build_manday_daily_combined() -> dict[str, dict[int, dict[str, float]]]:
        """crew_id → day_ord → {bh, dp, credit} (minutes)."""
        out: dict[str, dict[int, dict[str, float]]] = {}
        all_cids = set(manday_blh) | set(manday_dp) | set(manday_credit)
        for cid in all_cids:
            daily: dict[int, dict[str, float]] = {}
            for day_ord, blh in manday_blh.get(cid, []):
                daily.setdefault(day_ord, {"bh": 0.0, "dp": 0.0, "credit": 0.0})["bh"] += float(blh)
            for day_ord, dp in manday_dp.get(cid, []):
                daily.setdefault(day_ord, {"bh": 0.0, "dp": 0.0, "credit": 0.0})["dp"] += float(dp)
            for day_ord, credit in manday_credit.get(cid, []):
                daily.setdefault(day_ord, {"bh": 0.0, "dp": 0.0, "credit": 0.0})["credit"] += float(credit)
            if daily:
                out[cid] = daily
        return out
    manday_daily = _build_manday_daily_combined()

    # ── Scenario RP dates ─────────────────────────────────────────────────
    scen = sections.get("Scenario", {}).get("rows", [])
    if not scen:
        print("ERROR: Scenario section missing from ro_input.txt", file=sys.stderr)
        sys.exit(1)
    rp_start = date.fromisoformat(scen[0].get("strDtLoc", "")[:10])
    rp_end   = date.fromisoformat(scen[0].get("endDtLoc", "")[:10])
    print(f"RP:     {rp_start} → {rp_end}  ({(rp_end - rp_start).days + 1} days)")

    # ── Rule parameters (RuleSet-driven) ────────────────────────────────────
    active_rules = parse_active_ruleset(sections)
    ep = extract_engine_params(sections, rp_start, rp_end, active_rules)
    _print_active_ruleset_report(active_rules)

    # ── Parse Pairing section ─────────────────────────────────────────────
    pairing_info: dict[str, dict] = {}
    for row in sections.get("Pairing", {}).get("rows", []):
        pid = row.get("id", "").strip()
        if not pid:
            continue
        start, duty_end, rest_end = _pairing_time_bounds(row)
        pairing_info[pid] = {
            "label": row.get("label", pid),
            "base": row.get("base", ""),
            "group": (row.get("assignmentGroup") or "FLY").strip(),
            "start": start,
            "duty_end": duty_end,
            "rest_end": rest_end,
        }

    # ── Parse PairingDuty — per-duty blk/dp/credit keyed by (pid, dutySeq) ─
    pairing_blk: dict[str, int] = defaultdict(int)
    pairing_dp:  dict[str, int] = defaultdict(int)
    pairing_credit: dict[str, int] = defaultdict(int)
    # pid → {duty_seq: (blk_min, dp_min, credit_min)} — 8002 attribution
    _duty_blk_dp: dict[str, dict[int, tuple[int, int, int]]] = defaultdict(dict)
    for row in sections.get("PairingDuty", {}).get("rows", []):
        pid = row.get("pairingId", "").strip()
        if not pid:
            continue
        try:
            seq = int(row.get("dutySeq") or 0)
            blk = int(row.get("actFlightMinutes") or 0)
            dp  = int(row.get("actualDutyMinutes") or 0)
            credit = int(row.get("creditedMinutes") or 0)
            pairing_blk[pid] += blk
            pairing_dp[pid]  += dp
            pairing_credit[pid] += credit
            _duty_blk_dp[pid][seq] = (blk, dp, credit)
        except ValueError:
            pass

    # ── Parse Crew section ────────────────────────────────────────────────
    crew_info: dict[str, dict] = {}
    for row in sections.get("Crew", {}).get("rows", []):
        cid = row.get("crewId", "").strip()
        if not cid:
            continue
        crew_info[cid] = {
            "birthday": (row.get("birthday") or "")[:10],
            "division": row.get("division", "P"),
        }

    # ── Parse CrewBase section ────────────────────────────────────────────
    crew_base_quals: dict[str, list[tuple[str, int, int]]] = defaultdict(list)
    crew_prime_base: dict[str, str] = {}
    for row in sections.get("CrewBase", {}).get("rows", []):
        cid  = row.get("crewId", "").strip()
        base = row.get("base", "").strip()
        eff  = (row.get("effDt") or "")[:10]
        exp  = (row.get("expDt") or "")[:10]
        prime = (row.get("isPrimeBase") or "").lower() == "true"
        if not cid or not base or not eff or not exp:
            continue
        try:
            crew_base_quals[cid].append((base, date_ord(eff), date_ord(exp)))
        except ValueError:
            continue
        if prime:
            crew_prime_base[cid] = base

    # ── Crew rank / fleet effective-dated windows (8002 row matching) ────
    # Merges the scenario section and its (COF) variant; duplicates are
    # harmless for OR-matching. exp < 0 = open-ended (engine convention).
    def _quals_from(prefix: str, fields: tuple[str, ...]) -> dict[str, list[tuple[str, int, int]]]:
        out: dict[str, list[tuple[str, int, int]]] = defaultdict(list)
        for sec_name, sec in sections.items():
            if not (sec_name == prefix or sec_name.startswith(prefix + "(")):
                continue
            for row in sec.get("rows", []):
                cid = (row.get("crewId") or "").strip()
                if not cid:
                    continue
                eff_str = (row.get("effDt") or "")[:10]
                exp_str = (row.get("expDt") or "")[:10]
                try:
                    eff = date_ord(eff_str) if eff_str else -(10 ** 6)
                except ValueError:
                    eff = -(10 ** 6)
                try:
                    exp = date_ord(exp_str) if exp_str else -1
                except ValueError:
                    exp = -1
                for f in fields:
                    val = (row.get(f) or "").strip()
                    if val:
                        out[cid].append((val, eff, exp))
        return out

    crew_rank_quals_map = _quals_from("CrewRank", ("rank",))
    crew_fleet_quals_map = _quals_from("CrewFleet", ("acType", "fleetGrp"))

    # ── Fixed workload: Roster + RosterFlight + RosterGround ─────────────
    crew_fixed_pids = _parse_fixed_pairings(sections)
    assignment_type_map = _parse_assignment_type_map(sections)
    assignment_rest_map = _parse_assignment_rest_map(sections)
    crew_ground_tasks = _parse_crew_ground(sections, assignment_rest_map)
    crew_rank = _parse_crew_rank(sections, rp_start, rp_end)
    pairing_composition = _parse_pairing_composition(sections)
    pairing_segments = _parse_pairing_segments(sections)
    assignment_bt_pct = _parse_assignment_bt_pct(sections)
    for pid, slist in pairing_segments.items():
        if pid in pairing_info and slist:
            pairing_info[pid]["dep"] = slist[0]["dep"]
            pairing_info[pid]["arv"] = slist[-1]["arv"]
            pairing_blk[pid] = sum(
                _segment_blk_minutes(
                    seg.get("assignment", ""),
                    epoch(seg["start"]),
                    epoch(seg["end"]),
                    assignment_bt_pct,
                    pairing_info[pid].get("assignment", ""),
                )
                for seg in slist
                if seg.get("start") and seg.get("end")
            )
            # Sync per-duty BLK from segments so credit formula uses correct BLK
            if pid in _duty_blk_dp:
                seg_blk_by_duty: dict[int, int] = defaultdict(int)
                for seg in slist:
                    if seg.get("start") and seg.get("end"):
                        try:
                            ds = int(seg.get("duty_seq") or 0)
                        except ValueError:
                            continue
                        seg_blk_by_duty[ds] += _segment_blk_minutes(
                            seg.get("assignment", ""),
                            epoch(seg["start"]),
                            epoch(seg["end"]),
                            assignment_bt_pct,
                            pairing_info[pid].get("assignment", ""),
                        )
                for seq, new_blk in seg_blk_by_duty.items():
                    old_blk, dp, credit = _duty_blk_dp[pid].get(seq, (0, 0, 0))
                    _duty_blk_dp[pid][seq] = (new_blk, dp, credit)
    pairing_roster = _seed_pairing_roster(sections, crew_rank)
    airport_zones = parse_airport_zones(sections)
    if airport_zones:
        print(f"Airport timezones: {len(airport_zones)} IATA codes from ro_input (IANA DST)")
    else:
        print("Airport timezones: using built-in IATA→IANA fallback (IANA DST)")

    # ── Validate requested IDs ─────────────────────────────────────────────
    missing_crews = target_crew_ids - set(crew_info)
    if missing_crews:
        print(f"WARNING: crews not found in file: {sorted(missing_crews)}")

    missing_pairings = target_pairing_ids - set(pairing_info)
    if missing_pairings:
        print(f"WARNING: pairings not found in file: {sorted(missing_pairings)}")

    active_crew_ids = [c for c in target_crew_ids_ordered if c in crew_info]
    active_pairing_ids = [p for p in target_pairing_ids_ordered if p in pairing_info]

    crew_assignments: list[tuple[str, list[str]]] = [
        (cid, [p for p in pids if p in pairing_info])
        for cid, pids in assignment_plan
        if cid in crew_info
    ]

    if not crew_assignments:
        print("Nothing to check.", file=sys.stderr)
        sys.exit(1)

    # ── F8 official Engine (rust_checker base ∪ shared extras) ───────────
    # Matches ro_rust.sh → wrapper → RustRuleChecker; Engine built once.
    from f8_official_engine import bind_f8_rust_checker

    print("Binding F8 official RustRuleChecker (base ∪ extras) ...")
    checker = bind_f8_rust_checker(ro_path, application=application)
    engine = checker._engine
    maps = checker._maps
    baseline_by_crew: dict[str, Counter] = {
        cid: Counter(checker._baseline_signatures.get(cid, Counter()))
        for cid in maps.crew_to_idx
    }

    pid_to_idx = dict(maps.pairing_to_idx)
    idx_to_pid = {i: pid for pid, i in pid_to_idx.items()}
    valid_pids = list(maps.idx_to_pairing)
    crew_idx_map = dict(maps.crew_to_idx)

    def prime_base_for(cid: str) -> str:
        return crew_prime_base.get(cid) or (
            crew_base_quals[cid][0][0] if crew_base_quals.get(cid) else "UTC"
        )

    pairing_duty_rows = _parse_pairing_duty_rows(sections)
    _apply_pairing_rest_from_duties(pairing_info, pairing_duty_rows)
    rp_start_ts = epoch(rp_start.isoformat() + "T00:00:00")

    missing_in_engine = [c for c in active_crew_ids if c not in crew_idx_map]
    if missing_in_engine:
        print(
            f"WARNING: crews not in F8 problem.crews (skipped): {missing_in_engine}"
        )
    missing_pids = [p for p in active_pairing_ids if p not in pid_to_idx]
    if missing_pids:
        print(
            f"WARNING: pairings not in F8 Engine dense map: {missing_pids}"
        )

    print(f"Engine: {engine}")
    print(
        f"Dense pairing array: {len(valid_pids)} pairings "
        f"(F8 problem universe; candidates+PA from rust_checker)"
    )
    print(f"Crews:  {len(crew_idx_map)} in Engine "
          f"({len(active_crew_ids)} in assignments.txt)")
    print(f"Assignments ({len(crew_assignments)} round(s)):")
    for rnd, (cid, pids) in enumerate(crew_assignments, start=1):
        print(f"  round {rnd}: crew {cid} ← {', '.join(pids) if pids else '(none)'}")
    print(
        "Flow:   sequential — check_line(accepted+[new]); "
        "OK → can_add_complement + commit_complement (PBS COF); "
        "no Engine rebuild"
    )
    _complement_api = hasattr(checker, "can_add_complement") and hasattr(
        checker, "commit_complement"
    )
    if not _complement_api:
        print(
            "WARNING: RustRuleChecker lacks can_add/commit_complement; "
            "8030/8072 cross-crew COF will not update between rounds "
            "(rebuild rois_rule_engine_rs + pbs-engine checker).",
            file=sys.stderr,
        )
    if pairing_roster:
        filled = sum(len(v) for v in pairing_roster.values())
        print(
            f"Pre-assign complement: {filled} crew×pairing slot(s) "
            f"on {len(pairing_roster)} pairing(s)"
        )
    print()

    # Per-crew successfully simulated assigns (pairing ids), not written into fixed.
    accepted: dict[str, list[str]] = {cid: [] for cid in crew_idx_map}
    for cid in active_crew_ids:
        accepted.setdefault(cid, [])


    html_round_data: list[dict] = []
    assign_step = 0

    def _sim_assigned_pids(cid: str, _crew_idx: int = 0) -> list[str]:
        """Pairings accepted in this simulation (excl. Roster PA)."""
        return list(accepted.get(cid, []))

    def _candidate_idxs(cid: str, extra_pids: list[str] | None = None) -> list[int]:
        pids = list(accepted.get(cid, []))
        if extra_pids:
            pids.extend(extra_pids)
        out: list[int] = []
        for pid in pids:
            idx = pid_to_idx.get(pid)
            if idx is not None:
                out.append(idx)
        return out

    def _print_crew_banner(cid: str, crew_idx: int) -> tuple[str, str, str]:
        fixed_pids = [p for p in crew_fixed_pids.get(cid, []) if p in pid_to_idx]
        ground_rows = crew_ground_tasks.get(cid, [])
        prime_base = crew_prime_base.get(cid, "?")
        rank = crew_rank.get(cid, "?")
        print(f"{'='*65}")
        print(
            f"Crew {cid}  rank={rank}  base={prime_base}  "
            f"fixed={len(fixed_pids)} pairings  ground={len(ground_rows)} tasks"
        )
        if fixed_pids:
            print(f"  fixed pairings: {', '.join(fixed_pids)}")
        for g in ground_rows:
            print(
                f"  ground: {g['group'] or '?'}/{g['assignment'] or '?'}"
                f" {g['label'] or '-'}  {g['start'][:16]} → {g['end'][:16]}"
            )
        print(f"{'='*65}")
        return rank, prime_base, crew_info.get(cid, {}).get("division", "P")

    # Sequential: check_line → (PBS) can_add_complement → commit_complement.
    for round_no, (cid, crew_pairing_ids) in enumerate(crew_assignments, start=1):
        if not crew_pairing_ids:
            continue
        if cid not in crew_idx_map:
            print(f"Round {round_no}: crew {cid} — skipped (not in F8 Engine)")
            continue
        crew_idx = crew_idx_map[cid]
        rank, prime_base, division = _print_crew_banner(cid, crew_idx)
        print(f"Round {round_no}: crew {cid} ← {', '.join(crew_pairing_ids)}")

        carried_pids = _sim_assigned_pids(cid)
        round_entry = _new_round_entry(
            cid, rank, prime_base, round_no,
            crew_fixed_pids=crew_fixed_pids,
            pairing_info=pairing_info,
            ground_tasks=crew_ground_tasks,
            carried_pids=carried_pids,
            pairing_segments=pairing_segments,
            airport_zones=airport_zones,
            assignment_bt_pct=assignment_bt_pct,
        )
        html_round_data.append(round_entry)

        already_on_line = set(crew_fixed_pids.get(cid, [])) | set(accepted.get(cid, []))

        for cpid in crew_pairing_ids:
            assign_step += 1
            step = assign_step
            seq = f"({step})"
            if cpid not in pid_to_idx:
                print(f"  {seq} Pairing {cpid} — skipped (not in F8 Engine dense map)")
                continue
            if cpid in already_on_line:
                print(f"  {seq} Pairing {cpid} — skipped (already on crew line)")
                continue

            assigned_pids = _sim_assigned_pids(cid)
            info = pairing_info.get(cpid) or {}
            label = info.get("label", cpid)
            base = info.get("base", "?")
            grp = info.get("group", "?")
            _c_start_utc = epoch(info["start"]) if info.get("start") else 0
            _c_end_utc = epoch(info["duty_end"]) if info.get("duty_end") else 0

            comp_v = _composition_violation(
                pairing_roster, pairing_composition, cpid, rank, division
            )
            if comp_v:
                print(f"  {seq} Pairing {cpid} — assignment failed (composition):")
                print(
                    f"       [Rule{comp_v.split('|')[0]}] "
                    f"{'  '.join(comp_v.split('|')[1:])}"
                )
                round_entry["checks"].append({
                    "step": step, "pid": cpid, "label": label, "base": base, "group": grp,
                    "start_utc": _c_start_utc, "end_utc": _c_end_utc,
                    "ok": False, "violations": [comp_v], "prior": list(assigned_pids),
                    "skipped": True,
                })
                continue

            cand_idxs = _candidate_idxs(cid, [cpid])
            total = engine.check_line(crew_idx, cand_idxs)
            if use_baseline_diff:
                violations = _diff_raw(total, baseline_by_crew.get(cid, Counter()))
            else:
                violations = list(total)
            violations = dedupe_violations_for_display(
                [str(x) for x in violations]
            )

            _c_dep = info.get("dep", "")
            _c_arv = info.get("arv", "")
            _c_segs = _build_pairing_display_segs(
                pairing_segments.get(cpid, []),
                _c_dep or prime_base,
                _c_arv or prime_base,
                airport_zones,
                assignment_type_map,
                assignment_bt_pct,
            )
            if violations:
                print(f"  {seq} Pairing {cpid} — assignment failed:")
                for v in sorted(violations):
                    rule = f"Rule{v.split('|')[0]}"
                    detail = _warning_viol_detail(
                        v, prime_base, airport_zones, idx_to_pid, pairing_info,
                    )
                    print(f"       [{rule}] {detail}")
                round_entry["checks"].append({
                    "step": step, "pid": cpid, "label": label, "base": base, "group": grp,
                    "start_utc": _c_start_utc, "end_utc": _c_end_utc,
                    "dep": _c_dep, "arv": _c_arv,
                    "ok": False, "violations": sorted(violations),
                    "prior": list(assigned_pids),
                    "skipped": False,
                    "segs": _c_segs,
                })
                continue

            # PBS: check_single OK → can_add_complement → commit_complement.
            complement_violations: list[str] = []
            if _complement_api:
                complement_violations = dedupe_violations_for_display(
                    [str(x) for x in (checker.can_add_complement(cid, cpid) or [])]
                )
            if complement_violations:
                print(f"  {seq} Pairing {cpid} — assignment failed (complement):")
                for v in sorted(complement_violations):
                    rule = f"Rule{v.split('|')[0]}"
                    detail = _warning_viol_detail(
                        v, prime_base, airport_zones, idx_to_pid, pairing_info,
                    )
                    print(f"       [{rule}] {detail}")
                round_entry["checks"].append({
                    "step": step, "pid": cpid, "label": label, "base": base, "group": grp,
                    "start_utc": _c_start_utc, "end_utc": _c_end_utc,
                    "dep": _c_dep, "arv": _c_arv,
                    "ok": False,
                    "violations": sorted(complement_violations),
                    "prior": list(assigned_pids),
                    "skipped": False,
                    "segs": _c_segs,
                })
                continue

            if _complement_api:
                checker.commit_complement(cid, cpid)

            print(f"  {seq} Pairing {cpid} was successfully assigned.")
            accepted[cid].append(cpid)
            already_on_line.add(cpid)
            pairing_roster[cpid].append((cid, rank))
            _print_simulated_assign(cid, cpid, rank, pairing_segments)
            round_entry["checks"].append({
                "step": step, "pid": cpid, "label": label, "base": base, "group": grp,
                "start_utc": _c_start_utc, "end_utc": _c_end_utc,
                "dep": _c_dep, "arv": _c_arv,
                "ok": True, "violations": [],
                "prior": list(assigned_pids),
                "skipped": False,
                "segs": _c_segs,
            })
        print()

    # ── Optional auto-fill DO (CALL the PBS solver exporter — no pbs-engine edit) ──
    # Replays the solver's last step: after FLY/RES settle, fill every complement
    # day of the period for the crews we touch with a DO duty. Render-only: the
    # Rust Engine's ground arrays are immutable post-construction, so the DO is
    # added to the display line only (legality upgrade deferred — plan §7).
    crew_do: dict[str, list[dict]] = defaultdict(list)
    if auto_fill_do:
        print("Auto-fill DO: Y — requesting complement days-off from PBS result_converter ...")
        solver_result = {
            "assignment": {
                cid: list(crew_fixed_pids.get(cid, [])) + list(accepted.get(cid, []))
                for cid in active_crew_ids
            },
            # crew_info must carry each crew's BASE so build_context resolves the
            # crew airport timezone — otherwise DO is filled on UTC calendar days
            # instead of the crew's local calendar day (misalignment). crew_info
            # keys also scope the DO fill to exactly the crews we checked.
            "crew_info": {
                cid: {
                    "base": prime_base_for(cid),
                    "rank": crew_rank.get(cid, ""),
                }
                for cid in active_crew_ids
            },
        }
        do_rows: list[list[str]] = []
        append_generated_dayoff_rows(do_rows, 0, build_context(ro_path, solver_result))
        for row in do_rows:
            d = dict(zip(REAL_ROSTER_FIELDS, row, strict=False))
            if str(d.get("assignment", "")).upper() != "DO":
                continue
            cid = str(d.get("crewId", ""))
            crew_do[cid].append({
                "start": d.get("schStartDtUtc") or d.get("actStartDtUtc", ""),
                "end": d.get("schEndDtUtc") or d.get("actEndDtUtc", ""),
                "assignment": "DO",
                "group": d.get("assignmentGroup", "DO") or "DO",
                "label": d.get("label", "DO") or "DO",
                "is_rest": True,
                # This DO is the solver's complement-day filler → mark as optimizer-placed.
                "optimizer": True,
            })
        do_crews = sum(1 for v in crew_do.values() if v)
        do_rows_total = sum(len(v) for v in crew_do.values())
        print(f"Auto-fill DO: {do_rows_total} DO row(s) for {do_crews} crew(s)")

    # ── Final Results: PA + accepted as candidates (optimizer baseline) ─────
    acc_stay = ep.get("acc_stay_per_min") or 1440
    acc_adj = ep.get("acc_adjust_min") or 60

    print(f"\n{'#'*65}")
    if use_baseline_diff:
        print("Final Results — full crew line check (optimizer: new vs PA baseline)")
    else:
        print("Final Results — full crew line check (editor: absolute PA+line legality)")
    print(f"{'#'*65}\n")

    final_data: list[dict] = []
    for cid in active_crew_ids:
        if cid not in crew_idx_map:
            continue
        crew_idx = crew_idx_map[cid]
        prime_base = prime_base_for(cid)
        rank = crew_rank.get(cid, "?")

        all_final_pids = [
            p for p in (list(crew_fixed_pids.get(cid, [])) + list(accepted.get(cid, [])))
            if p in pairing_info
        ]
        # de-dupe preserving order
        seen_f: set[str] = set()
        uniq_final: list[str] = []
        for p in all_final_pids:
            if p not in seen_f:
                seen_f.add(p)
                uniq_final.append(p)
        all_final_pids = uniq_final
        all_final_pids.sort(
            key=lambda p: epoch(pairing_info[p]["start"]) if pairing_info[p].get("start") else 0
        )

        pid_acc_refs = _compute_crew_acc_refs(
            all_final_pids, pairing_duty_rows, pairing_info,
            airport_zones, acc_stay, acc_adj,
        )

        fixed_bars: list[dict] = []
        for pid in all_final_pids:
            info = pairing_info.get(pid) or {}
            grp = info.get("group", "FLY").upper()
            st = epoch(info["start"]) if info.get("start") else 0
            en = epoch(info["duty_end"]) if info.get("duty_end") else 0
            if not st or not en:
                continue
            dep = info.get("dep") or prime_base
            arv = info.get("arv") or prime_base
            raw_duties = pairing_duty_rows.get(pid, [])
            acc_refs_for_pid = pid_acc_refs.get(pid, [])
            segs_by_duty: dict[str, list[dict]] = defaultdict(list)
            for seg in pairing_segments.get(pid, []):
                segs_by_duty[seg["duty_seq"]].append(seg)

            def _build_seg_rows(raw_segs: list[dict], fallback_dep: str, fallback_arv: str) -> list[dict]:
                return _build_pairing_display_segs(
                    raw_segs,
                    fallback_dep,
                    fallback_arv,
                    airport_zones,
                    assignment_type_map,
                    assignment_bt_pct,
                )

            duties_for_tip: list[dict] = []
            if raw_duties:
                for i, d in enumerate(raw_duties):
                    d_st = epoch(d["start"])
                    d_en = epoch(d["end"])
                    dep_d = (d.get("dep") or info.get("dep") or prime_base).strip()
                    arv_d = (d.get("arv") or info.get("arv") or prime_base).strip()
                    d_seq = d.get("duty_seq", str(i + 1))
                    duties_for_tip.append({
                        "duty_num": i + 1,
                        "dep": dep_d,
                        "arv": arv_d,
                        "dep_off": offset_min_at(d_st, dep_d, airport_zones),
                        "arr_off": offset_min_at(d_en, arv_d, airport_zones),
                        "std_local": utc_ts_to_local(d_st, dep_d, airport_zones).strftime("%m-%d %H:%M"),
                        "sta_local": utc_ts_to_local(d_en, arv_d, airport_zones).strftime("%m-%d %H:%M"),
                        "ref_tz_min": acc_refs_for_pid[i] if i < len(acc_refs_for_pid) else 0,
                        "segs": _build_seg_rows(segs_by_duty.get(d_seq, []), dep_d, arv_d),
                    })
            else:
                duties_for_tip.append({
                    "duty_num": 1,
                    "dep": dep,
                    "arv": arv,
                    "dep_off": offset_min_at(st, dep, airport_zones),
                    "arr_off": offset_min_at(en, arv, airport_zones),
                    "std_local": utc_ts_to_local(st, dep, airport_zones).strftime("%m-%d %H:%M"),
                    "sta_local": utc_ts_to_local(en, arv, airport_zones).strftime("%m-%d %H:%M"),
                    "ref_tz_min": acc_refs_for_pid[0] if acc_refs_for_pid else 0,
                    "segs": _build_seg_rows(pairing_segments.get(pid, []), dep, arv),
                })

            start_str = utc_ts_to_local(st, prime_base, airport_zones).strftime("%Y-%m-%d")
            tip_h, tip_inner, tip_w = _build_rich_tip(
                pid, grp, dep, arv, start_str, prime_base,
                pairing_blk.get(pid, 0), pairing_dp.get(pid, 0),
                duties_for_tip,
            )
            fixed_bars.append({
                "pid": pid,
                "group": grp,
                "start_utc": st,
                "end_utc": en,
                "dep": dep,
                "arv": arv,
                "rich_tip": (tip_h, tip_inner, tip_w),
                "segs": [s for d in duties_for_tip for s in d.get("segs", [])],
                # Pairings the solver actually placed (accepted candidates) get a
                # matcha dashed outline; pre-assigned (PA) duties do not.
                "optimizer": pid in accepted.get(cid, []),
            })

        cand_idxs = _candidate_idxs(cid)
        total = engine.check_line(crew_idx, cand_idxs)
        if use_baseline_diff:
            violations = _diff_raw(total, baseline_by_crew.get(cid, Counter()))
        else:
            violations = list(dict.fromkeys(total))
        violations = dedupe_violations_for_display([str(x) for x in violations])

        print(f"{'='*65}")
        print(f"Crew {cid}  rank={rank}  base={prime_base}  ({len(all_final_pids)} pairings)")
        if not violations:
            if use_baseline_diff:
                print("  OK  Full line OK (vs PA baseline)")
            else:
                print("  OK  Full line OK (editor absolute)")
        else:
            print(f"  FAIL  Full line — {len(violations)} violation(s):")
            for v in sorted(violations):
                rule = f"Rule{v.split('|')[0]}"
                detail = _warning_viol_detail(
                    v, prime_base, airport_zones, idx_to_pid, pairing_info,
                )
                print(f"       [{rule}] {detail}")
        print()

        checks: list[dict] = []
        if violations:
            checks.append({
                "step": 1, "pid": "LINE", "label": "Final line check",
                "start_utc": 0, "end_utc": 0, "dep": "", "arv": "",
                "ok": False, "violations": sorted(violations),
                "prior": [], "skipped": False, "no_row": True,
            })
        # Day-header hover: BLK/DP = manday|PA SPAN + accepted candidate SPAN.
        # CR = Engine daily_credit (whole-duty formula on crew-base report day).
        pa_idxs = [
            pid_to_idx[p]
            for p in crew_fixed_pids.get(cid, [])
            if p in pid_to_idx
        ]
        blk_by_day = _blk_by_day_for_hover(
            cid=cid,
            crew_idx=crew_idx,
            pa_idxs=pa_idxs,
            cand_idxs=cand_idxs,
            manday_blh=manday_blh,
            engine=engine,
        )
        dp_by_day = _dp_by_day_for_hover(
            cid=cid,
            crew_idx=crew_idx,
            pa_idxs=pa_idxs,
            cand_idxs=cand_idxs,
            manday_dp=manday_dp,
            engine=engine,
        )
        line_idxs = pa_idxs + cand_idxs
        credit_by_day = _credit_by_day_for_hover(
            crew_idx=crew_idx,
            line_idxs=line_idxs,
            engine=engine,
        )
        final_data.append({
            "crew_id": cid,
            "rank": rank,
            "base": prime_base,
            "round_no": None,
            "fixed": fixed_bars,
            "carried": [],
            "ground": _dedupe_ground_against_pairing_dhd(
                crew_ground_tasks.get(cid, []) + crew_do.get(cid, []),
                _pairing_dhd_intervals(all_final_pids, pairing_segments),
            ),
            "checks": checks,
            "pre_row_label": "",
            "blk_by_day": blk_by_day,
            "dp_by_day": dp_by_day,
            "credit_by_day": credit_by_day,
        })

    html_crew_data = html_round_data + [{"section_header": True, "title": "Final Results"}] + final_data

    _write_svg_report(
        html_crew_data, rp_start, rp_end, out_path, airport_zones,
        report_title=report_title,
        idx_to_pid=idx_to_pid,
        pairing_info=pairing_info,
        manday_daily=manday_daily,
    )


def main() -> None:
    run_check(
        application="optimizer",
        assignments_path=HERE / "assignments.txt",
        results_path=HERE / "results_ro.svg",
        report_title="RO Check",
    )


if __name__ == "__main__":
    main()
