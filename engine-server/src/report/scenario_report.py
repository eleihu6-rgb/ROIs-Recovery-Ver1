"""Scenario report module for the ROIS engine-server.

Faithful, mechanical port of the report-building subset of
``Flair_PBS_Optimization_Report/src/server/app/scenario_report.py``, adapted to
the live-server ``##`` ro_input format (snake_case CSV sections).  Builds the
report-shaped sections the gantt frontend reads from the solver's
``result.json`` + the parsed ``ro_input.gz`` sections.

stdlib only — ``datetime``, ``zoneinfo``, ``math``, ``re``,
``collections.defaultdict``, ``typing``.  Deliberately does NOT import anything
from ``task_manager``.
"""
from __future__ import annotations

import math
import re  # noqa: F401  (kept in the reference import set; unused in the port)
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

# Base code -> IANA timezone, used for roster-period month keys and local
# date spans. Copied verbatim from the reference report.
BASE_TIMEZONES = {
    "YVR": "America/Vancouver",
    "YYC": "America/Edmonton",
    "YEG": "America/Edmonton",
    "YKF": "America/Toronto",
    "YYZ": "America/Toronto",
    "YOW": "America/Toronto",
    "YUL": "America/Montreal",
}

# Ground-task credit default minutes per assignment code, hardcoded from
# ``Flair_PBS_Optimization_Report/data/credit_hour_default.csv`` (the engine
# cannot read that CSV).  Keyed by uppercase assignment code.
DEFAULT_GROUND_CREDIT_MINUTES: Dict[str, float] = {
    "ACPG": 0.0,
    "ADM": 0.0,
    "AL": 0.0,
    "ALS": 0.0,
    "ASBY": 240.0,
    "BMT": 0.0,
    "BO": 0.0,
    "BRF": 240.0,
    "CBT": 0.0,
    "CL": 0.0,
    "COD": 0.0,
    "CRE": 240.0,
    "CRM": 0.0,
    "CUG": 0.0,
    "DHD": 240.0,
    "DO": 0.0,
    "DWP": 0.0,
    "EPTP": 0.0,
    "FC": 0.0,
    "FLT": 240.0,
    "FLY": 240.0,
    "FLY5T": 240.0,
    "FLYAC": 240.0,
    "FLYF8": 240.0,
    "FLYPD": 240.0,
    "FLYTS": 240.0,
    "FLYWS": 240.0,
    "FLYXX": 240.0,
    "FTG": 240.0,
    "GDO": 0.0,
    "GRD": 240.0,
    "GT": 0.0,
    "ILADJ": 0.0,
    "ILL": 0.0,
    "INV": 0.0,
    "IOE": 240.0,
    "JURY": 0.0,
    "LEAVE": 0.0,
    "LFT": 0.0,
    "MED": 0.0,
    "ML": 0.0,
    "MLOA": 0.0,
    "MLP": 0.0,
    "MTG": 240.0,
    "NQ": 0.0,
    "OBDO": 0.0,
    "OFC": 240.0,
    "PATL": 0.0,
    "PAX": 240.0,
    "PH": 0.0,
    "POFC": 0.0,
    "PPD": 0.0,
    "PRAM": 240.0,
    "PRMM": 0.0,
    "PRMOD": 0.0,
    "PRPM": 240.0,
    "RCO": 0.0,
    "RES": 240.0,
    "RESNQ": 0.0,
    "RSGN": 0.0,
    "RVAC": 0.0,
    "SBY": 240.0,
    "SCM": 0.0,
    "SFT": 0.0,
    "SIM": 240.0,
    "SL": 0.0,
    "ST": 0.0,
    "ST180": 0.0,
    "ST300": 0.0,
    "ST90": 0.0,
    "ST95": 0.0,
    "TAXI": 0.0,
    "TDG": 0.0,
    "TGDO": 0.0,
    "TGS": 0.0,
    "TRN": 240.0,
    "TRNG": 0.0,
    "TSPD": 0.0,
    "TTT": 0.0,
    "UAV": 0.0,
    "UBMT": 0.0,
    "UFF": 0.0,
    "UFTG": 0.0,
    "UILL": 0.0,
    "UNION": 0.0,
    "UNMCS": 0.0,
    "UNS": 0.0,
    "UPD": 0.0,
    "VAC": 240.0,
    "VGDO": 0.0,
    "VR": 0.0,
    "WATRS": 0.0,
    "WCB": 0.0,
    "WCNW": 0.0,
    "WILD": 0.0,
}


# =====================================================================
# Helpers (ported verbatim from the reference report)
# =====================================================================


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        v = float(value)
        if math.isnan(v) or math.isinf(v):
            return default
        return v
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _epoch_to_dt(value: Any) -> Optional[datetime]:
    if value is None or value == "":
        return None
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def _parse_iso(value: Any) -> Optional[datetime]:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        try:
            dt = datetime.strptime(text[:10], "%Y-%m-%d")
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _iso(dt: Optional[datetime]) -> str:
    if not dt:
        return ""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M")


def _iso_z(dt: Optional[datetime]) -> str:
    """ISO-8601 UTC with a trailing Z — reliably parseable by JS `new Date()`."""
    if not dt:
        return ""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _date(dt: Optional[datetime]) -> str:
    return dt.astimezone(timezone.utc).date().isoformat() if dt else ""


def _month_key(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m")


def _month_key_for_base(dt: datetime, base: str) -> str:
    return dt.astimezone(_base_timezone(base)).strftime("%Y-%m")


def _roster_period_key_from_date(day: Any) -> str:
    if not hasattr(day, "year"):
        day = datetime.strptime(str(day)[:10], "%Y-%m-%d").date()
    year = day.year
    if day.month == 1 and day.day <= 30:
        return f"{year}-01"
    if (day.month == 1 and day.day == 31) or day.month == 2 or (day.month == 3 and day.day == 1):
        return f"{year}-02"
    if day.month == 3:
        return f"{year}-03"
    return f"{year}-{day.month:02d}"


def _roster_period_key(dt: datetime) -> str:
    return _roster_period_key_from_date(dt.astimezone(timezone.utc).date())


def _roster_period_key_for_base(dt: datetime, base: str) -> str:
    return _roster_period_key_from_date(dt.astimezone(_base_timezone(base)).date())


def _roster_period_months_between(start: datetime, end: datetime) -> List[str]:
    cursor = start.astimezone(timezone.utc).date()
    last = end.astimezone(timezone.utc).date()
    months = set()
    while cursor <= last:
        months.add(_roster_period_key_from_date(cursor))
        cursor += timedelta(days=1)
    return sorted(months)


def _credit_roster_period_note(month: str) -> str:
    try:
        _, mon = map(int, month.split("-"))
    except (AttributeError, ValueError):
        return ""
    if mon == 1:
        return "Roster Period: January Jan 01 ~ Jan 30"
    if mon == 2:
        return "Roster Period: February Jan 31 ~ Mar 01"
    if mon == 3:
        return "Roster Period: March Mar 02 ~ Mar 31"
    return ""


def _month_bounds(month: str) -> Tuple[datetime, datetime]:
    year, mon = map(int, month.split("-"))
    start = datetime(year, mon, 1, tzinfo=timezone.utc)
    if mon == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, mon + 1, 1, tzinfo=timezone.utc)
    return start, end


def _month_bounds_for_base(month: str, base: str) -> Tuple[datetime, datetime]:
    tz = _base_timezone(base)
    year, mon = map(int, month.split("-"))
    start_local = datetime(year, mon, 1, tzinfo=tz)
    if mon == 12:
        end_local = datetime(year + 1, 1, 1, tzinfo=tz)
    else:
        end_local = datetime(year, mon + 1, 1, tzinfo=tz)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def _months_between(start: datetime, end: datetime) -> List[str]:
    cursor = datetime(start.year, start.month, 1, tzinfo=timezone.utc)
    last = datetime(end.year, end.month, 1, tzinfo=timezone.utc)
    months = []
    while cursor <= last:
        months.append(cursor.strftime("%Y-%m"))
        if cursor.month == 12:
            cursor = datetime(cursor.year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            cursor = datetime(cursor.year, cursor.month + 1, 1, tzinfo=timezone.utc)
    return months


def _overlap_hours(
    start: Optional[datetime],
    end: Optional[datetime],
    month: str,
    base: str = "",
) -> float:
    if not start or not end or end <= start:
        return 0.0
    month_start, month_end = _month_bounds_for_base(month, base) if base else _month_bounds(month)
    overlap_start = max(start, month_start)
    overlap_end = min(end, month_end)
    if overlap_end <= overlap_start:
        return 0.0
    return (overlap_end - overlap_start).total_seconds() / 3600


def _proportional_credit(
    start: Optional[datetime],
    end: Optional[datetime],
    credit_hours: float,
    month: str,
    base: str = "",
) -> float:
    if not start or not end or end <= start:
        return 0.0
    total = (end - start).total_seconds() / 3600
    if total <= 0:
        return 0.0
    return credit_hours * (_overlap_hours(start, end, month, base) / total)


def _credit_by_start_month(
    start: Optional[datetime],
    credit_hours: float,
    month: str,
    base: str = "",
) -> float:
    if start is None:
        return 0.0
    start_month = _roster_period_key_for_base(start, base) if base else _roster_period_key(start)
    return credit_hours if start_month == month else 0.0


def _task_credit_for_month(
    task: Dict[str, Any],
    month: str,
    base: str = "",
    *,
    use_start_month: bool = False,
) -> float:
    if use_start_month:
        events = task.get("credit_events") or []
        if events:
            return sum(
                _credit_by_start_month(
                    item.get("start"),
                    _safe_float(item.get("credit_hours")),
                    month,
                    base,
                )
                for item in events
            )
        return _credit_by_start_month(
            task.get("start"),
            _safe_float(task.get("credit_hours")),
            month,
            base,
        )
    return _proportional_credit(
        task.get("start"),
        task.get("end"),
        _safe_float(task.get("credit_hours")),
        month,
        base,
    )


def _date_span(start: Optional[datetime], end: Optional[datetime]) -> Iterable[str]:
    if not start or not end:
        return []
    start_date = start.astimezone(timezone.utc).date()
    end_date = end.astimezone(timezone.utc).date()
    if end.time() == datetime.min.time() and end_date > start_date:
        end_date = end_date - timedelta(days=1)
    result = []
    cursor = start_date
    while cursor <= end_date:
        result.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return result


def _round(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def _base_timezone(base: str) -> ZoneInfo:
    try:
        return ZoneInfo(BASE_TIMEZONES.get(str(base).upper(), "UTC"))
    except Exception:
        return ZoneInfo("UTC")


def _date_span_local(start: Optional[datetime], end: Optional[datetime], base: str) -> Iterable[str]:
    if not start or not end:
        return []
    tz = _base_timezone(base)
    start_date = start.astimezone(tz).date()
    end_local = end.astimezone(tz)
    end_date = end_local.date()
    if end_local.time() == datetime.min.time() and end_date > start_date:
        end_date = end_date - timedelta(days=1)
    result = []
    cursor = start_date
    while cursor <= end_date:
        result.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return result


def _minutes_to_hours(value: Any) -> float:
    return _safe_float(value) / 60.0


def _is_blank(value: Any) -> bool:
    return value is None or str(value).strip() == ""


def _is_truthy(value: Any) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "t", "yes", "y"}


def _task_type(info: Dict[str, Any]) -> str:
    group = str(info.get("assignment_group") or "").upper()
    assignment = str(info.get("assignment") or "").upper()
    return "Pairing" if group == "FLY" or assignment == "FLY" else "Reserve"


def _preassign_in_period(
    task: Dict[str, Any], period_start: datetime, period_end: datetime
) -> bool:
    """True when a pre-assignment record overlaps the half-open main period
    [period_start, period_end). A record with no usable start is dropped — it
    cannot be placed in the period."""
    start = _epoch_to_dt(task.get("start_time_utc"))
    if start is None:
        return False
    end = _epoch_to_dt(task.get("end_time_utc"))
    if end is None or end <= start:  # point-in-time / missing end
        return period_start <= start < period_end
    return start < period_end and end > period_start


def _preassign_types_summary(
    preassign_tasks: List[Dict[str, Any]],
    period_start: Optional[datetime] = None,
    period_end: Optional[datetime] = None,
) -> str:
    """Compact per-crew summary of pre-assignment records for the Credit Hours
    table: each distinct type with how many records carry it, most-frequent
    first (ties broken A–Z), e.g. 'GDO ×15, F8638 ×1, SIM ×1'. The type is the
    task's raw `label`, so day-off sub-types (GDO/VGDO/MLOA) and individual
    deadhead flight numbers stay distinct; a blank label falls back to the
    coarser `assignment` code.

    Only records overlapping the scenario's main period [period_start,
    period_end) are counted, so a leading/trailing month (e.g. June assignments
    carried on a July roster) is left out. When the period is unknown (either
    bound None) every record counts. Returns '' when nothing counts (rendered
    '-' by the table)."""
    scoped = period_start is not None and period_end is not None
    counts: Dict[str, int] = defaultdict(int)
    for task in preassign_tasks or []:
        if scoped and not _preassign_in_period(task, period_start, period_end):
            continue
        label = str(task.get("label") or "").strip() or str(task.get("assignment") or "").strip()
        if not label:
            continue
        counts[label] += 1
    order = sorted(counts, key=lambda lbl: (-counts[lbl], lbl.upper()))
    return ", ".join(f"{label} ×{counts[label]}" for label in order)


# =====================================================================
# Loaders (adapted to the live-server `##` snake_case ro_input format)
# =====================================================================


def _crew_lookup(sections: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Dict[str, Any]]:
    rows = sections.get("crew", []) or []
    return {str(r.get("crew_id", "")): r for r in rows if r.get("crew_id")}


def _pairing_lookup(sections: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Dict[str, Any]]:
    rows = sections.get("pairing", []) or []
    return {str(r.get("id", "")): r for r in rows if r.get("id")}


def _crew_name(row: Dict[str, Any]) -> str:
    parts = [
        str(row.get("first_name", "")).strip(),
        str(row.get("middle_name", "")).strip(),
        str(row.get("last_name", "")).strip(),
    ]
    name = " ".join(p for p in parts if p)
    return " ".join(name.split())


def _crew_record(crew_id: str, info: Dict[str, Any], crew_lookup: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    row = crew_lookup.get(str(crew_id), {})
    return {
        "crew_id": str(crew_id),
        "unique_id": str(crew_id),
        "employee_no": row.get("employee_no", ""),
        "name": _crew_name(row) or str(crew_id),
        "base": str(info.get("base") or ""),
        "rank": str(info.get("rank") or ""),
        "seniority": _safe_int(info.get("seniority") or row.get("seniority_num")),
    }


def _pairing_duty_credit_by_pairing_id(
    sections: Dict[str, List[Dict[str, Any]]],
    *,
    blank_credit_as_zero: bool = True,
) -> Dict[str, List[Dict[str, Any]]]:
    """Duty credit per pairing id from ``## pairing_segment``.

    pairing_segment is a duty/segment wide table: each duty is spread across
    several segment rows, so duties are deduped by ``(pairing_id, duty_seq)``.
    Each duty contributes ``{"start", "credit_hours"}``.  Credit falls back
    act→sch; a duty with no credited minutes at all gets the 4h reserve
    guarantee when ``blank_credit_as_zero`` (the report's PairingDuty source
    never carries the 4h standby window as credit), else 0.
    """
    credit_by_pairing: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    seen: set = set()
    for row in sections.get("pairing_segment", []) or []:
        if _is_truthy(row.get("is_deleted")):
            continue
        pairing_id = str(row.get("pairing_id") or "").strip()
        duty_seq = str(row.get("duty_seq") or "").strip()
        if not pairing_id:
            continue
        key = (pairing_id, duty_seq)
        if key in seen:
            continue
        seen.add(key)
        credited = row.get("duty_act_credited_minutes")
        if _is_blank(credited):
            credited = row.get("duty_sch_credited_minutes")
        if _is_blank(credited):
            hours = 4.0 if blank_credit_as_zero else 0.0
        else:
            hours = _minutes_to_hours(credited)
        start = _parse_iso(row.get("duty_act_str_dt_utc")) or _parse_iso(row.get("duty_sch_str_dt_utc"))
        credit_by_pairing[pairing_id].append({
            "start": start,
            "credit_hours": hours,
        })
    return dict(credit_by_pairing)


def _pairing_credit_by_pairing_id(
    sections: Dict[str, List[Dict[str, Any]]],
    *,
    blank_credit_as_zero: bool = False,
) -> Dict[str, float]:
    duty_credit = _pairing_duty_credit_by_pairing_id(
        sections,
        blank_credit_as_zero=blank_credit_as_zero,
    )
    return {
        pairing_id: sum(_safe_float(item.get("credit_hours")) for item in items)
        for pairing_id, items in duty_credit.items()
    }


def _ground_credit_by_roster_id(
    sections: Dict[str, List[Dict[str, Any]]],
) -> Dict[str, Dict[str, Any]]:
    """Ground-task credit per roster_flight id from ``## roster_flight``.

    Ground tasks are roster_flight rows whose ``pairing_id`` is blank/empty.
    Credit: act→sch credited minutes / 60 when present, else the assignment's
    DEFAULT_GROUND_CREDIT_MINUTES (in minutes) / 60.
    """
    credit_by_id: Dict[str, Dict[str, Any]] = {}
    for row in sections.get("roster_flight", []) or []:
        if not _is_blank(row.get("pairing_id")):
            continue
        roster_id = str(row.get("id") or "").strip()
        if not roster_id:
            continue
        assignment = str(row.get("assignment") or "").strip().upper()
        credited = row.get("act_credited_minutes")
        if _is_blank(credited):
            credited = row.get("sch_credited_minutes")
        if _is_blank(credited):
            minutes = DEFAULT_GROUND_CREDIT_MINUTES.get(assignment, 0.0)
        else:
            minutes = _safe_float(credited)
        credit_by_id[roster_id] = {
            "credit_hours": minutes / 60.0,
            "start": _parse_iso(row.get("sch_str_dt_utc")),
        }
    return credit_by_id


def _pairing_task_credit_hours(
    info: Dict[str, Any],
    original_pairing_id: str,
    pairing_credit: Dict[str, float],
    *,
    prefer_raw_credited_minutes: bool = False,
) -> float:
    if original_pairing_id in pairing_credit:
        return pairing_credit[original_pairing_id]
    if prefer_raw_credited_minutes and not _is_blank(info.get("raw_credited_minutes")):
        return _minutes_to_hours(info.get("raw_credited_minutes"))
    if info.get("credited_hours") is not None:
        return _safe_float(info.get("credited_hours"))
    if not prefer_raw_credited_minutes:
        return _safe_float(info.get("credit", info.get("blh", 0)))
    if info.get("credit") is not None:
        return _safe_float(info.get("credit"))
    return _safe_float(info.get("blh", 0))


def _task_credit_hours(
    info: Dict[str, Any],
    original_pairing_id: str,
    coverage_type: str,
    pairing_credit: Optional[Dict[str, float]],
    pairings_use_pairing_credit: bool,
) -> float:
    """Credit hours for one task record.

    A reserve's credit is its guarantee (e.g. 4h), sourced from PairingDuty /
    credited_hours / raw_credited_minutes — never the standby-window blh.

    Pairings use PairingDuty credit only when the report sources credit from
    ro_input; otherwise the solver's block hours (blh).
    """
    if coverage_type == "Reserve":
        return _pairing_task_credit_hours(
            info, original_pairing_id, pairing_credit or {}, prefer_raw_credited_minutes=True
        )
    if pairing_credit is not None and pairings_use_pairing_credit:
        return _pairing_task_credit_hours(
            info, original_pairing_id, pairing_credit, prefer_raw_credited_minutes=True
        )
    return _safe_float(info.get("credit", info.get("blh", 0)))


def _scenario_dates(
    sections: Dict[str, List[Dict[str, Any]]],
) -> Tuple[Optional[datetime], Optional[datetime]]:
    rows = sections.get("scenario", []) or []
    if not rows:
        return None, None
    row0 = rows[0]
    return _parse_iso(row0.get("str_dt_loc")), _parse_iso(row0.get("end_dt_loc"))


# =====================================================================
# Core builders (ported verbatim; they operate on result.json + loader outputs)
# =====================================================================


def _task_records(
    result: Dict[str, Any],
    pairing_lookup: Dict[str, Dict[str, Any]],
    pairing_credit: Optional[Dict[str, float]] = None,
    pairing_duty_credit: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    *,
    pairings_use_pairing_credit: bool = False,
) -> List[Dict[str, Any]]:
    records = []
    for task_id, info in result.get("pairing_info", {}).items():
        original_id = str(info.get("original_pairing_id") or task_id.split("_", 1)[0])
        ro = pairing_lookup.get(original_id, {})
        start = _epoch_to_dt(info.get("start_time_utc")) or _parse_iso(ro.get("sch_str_dt_utc"))
        end = _epoch_to_dt(info.get("end_time_utc")) or _parse_iso(ro.get("sch_end_dt_utc"))
        ranks = sorted((info.get("rank_composition") or {}).keys())
        assignment = str(info.get("assignment") or ro.get("assignment") or "")
        group = str(info.get("assignment_group") or ro.get("assignment_group") or "")
        coverage_type = _task_type({"assignment_group": group, "assignment": assignment})
        credit_hours = _task_credit_hours(
            info, original_id, coverage_type, pairing_credit, pairings_use_pairing_credit
        )
        credit_events: List[Dict[str, Any]] = []
        if pairing_duty_credit is not None:
            duty_events = pairing_duty_credit.get(original_id)
            if duty_events is not None:
                credit_events = [
                    {
                        "start": item.get("start") or start,
                        "credit_hours": _safe_float(item.get("credit_hours")),
                    }
                    for item in duty_events
                ]
            else:
                credit_events = [{"start": start, "credit_hours": credit_hours}]
        records.append({
            "task_id": str(task_id),
            "original_pairing_id": original_id,
            "interface_id": str(ro.get("interface_id") or ""),
            "name": str(ro.get("pairing_label") or ro.get("label") or info.get("id") or task_id),
            "base": str(info.get("base") or ro.get("base") or ""),
            "rank": ",".join(ranks),
            "assignment_group": group,
            "assignment": assignment,
            "coverage_type": coverage_type,
            "credit_hours": credit_hours,
            "credit_events": credit_events,
            "start": start,
            "end": end,
            "start_base": _iso_z(start),
            "end_base": _iso_z(end),
            "start_date": _date(start),
        })
    return records


def _assignment_index(result: Dict[str, Any]) -> Tuple[set, Dict[str, List[str]]]:
    assigned = set()
    task_to_crews: Dict[str, List[str]] = defaultdict(list)
    for crew_id, task_ids in result.get("assignment", {}).items():
        for task_id in task_ids or []:
            task = str(task_id)
            assigned.add(task)
            task_to_crews[task].append(str(crew_id))
    return assigned, task_to_crews


def _fixed_task_ids(result: Dict[str, Any]) -> set:
    fixed = set()
    for crew in result.get("crew_info", {}).values():
        for roster in crew.get("rosters", []) or []:
            if roster.get("is_fixed") and roster.get("pairing_id"):
                fixed.add(str(roster.get("pairing_id")))
    return fixed


def _report_months(
    tasks: List[Dict[str, Any]],
    result: Dict[str, Any],
    scenario_start: Optional[datetime],
    scenario_end: Optional[datetime],
    use_base_month: bool = False,
    ground_credit: Optional[Dict[str, Any]] = None,
) -> List[str]:
    months = set()
    if scenario_start and scenario_end:
        if use_base_month:
            months.update(_roster_period_months_between(scenario_start, scenario_end - timedelta(seconds=1)))
        else:
            months.update(_months_between(scenario_start, scenario_end - timedelta(seconds=1)))
    for task in tasks:
        base = str(task.get("base") or "")
        if use_base_month:
            events = task.get("credit_events") or [{"start": task.get("start")}]
            for item in events:
                start = item.get("start")
                if start:
                    months.add(_roster_period_key_for_base(start, base))
        elif task.get("start"):
            months.add(_month_key(task["start"]))
    for crew in result.get("crew_info", {}).values():
        base = str(crew.get("base") or "")
        for item in crew.get("preassign_tasks", []) or []:
            start = _ground_task_start(item, ground_credit) if ground_credit is not None else _epoch_to_dt(item.get("start_time_utc"))
            if start:
                months.add(_roster_period_key_for_base(start, base) if use_base_month else _month_key(start))
    return sorted(months)


def _crew_credit_table(
    crews: List[Dict[str, Any]],
    tasks_by_id: Dict[str, Dict[str, Any]],
    result: Dict[str, Any],
    months: List[str],
    primary_month: str,
    ground_credit: Optional[Dict[str, Any]] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    assigned_by_crew = result.get("assignment", {})
    _chr = result.get("initial_generator_summary", {}).get("credit_hour_report", []) or result.get("credit_hour_report", [])
    credit_map = {str(item["crew_id"]): _safe_float(item.get("credited_hours", 0.0)) for item in _chr}
    rows = []
    pre_detail = []
    crew_base_by_id = {str(crew["crew_id"]): str(crew.get("base") or "") for crew in crews}

    preassign_by_crew_month: Dict[Tuple[str, str], Dict[str, Any]] = defaultdict(lambda: {"hours": 0.0, "dayoff_dates": set()})
    month_set = set(months)
    for crew_id, info in result.get("crew_info", {}).items():
        crew_base = crew_base_by_id.get(str(crew_id), str(info.get("base") or ""))
        for item in info.get("preassign_tasks", []) or []:
            start = _epoch_to_dt(item.get("start_time_utc"))
            end = _epoch_to_dt(item.get("end_time_utc"))
            assignment = str(item.get("assignment") or "")
            if ground_credit is not None:
                credit_start = _ground_task_start(item, ground_credit)
                if credit_start is None:
                    continue
                month = _roster_period_key_for_base(credit_start, crew_base)
                if month not in month_set:
                    continue
                credit_hours = _ground_task_credit_hours(item, ground_credit)
                hours = credit_hours if credit_hours is not None else 0.0
                bucket = preassign_by_crew_month[(str(crew_id), month)]
                if assignment.upper() == "DO":
                    for day in _date_span_local(credit_start, end, crew_base):
                        if _roster_period_key_from_date(day) == month:
                            bucket["dayoff_dates"].add(day)
                if hours > 0:
                    bucket["hours"] += hours
                continue
            for month in months:
                hours = _overlap_hours(start, end, month)
                if hours <= 0:
                    continue
                bucket = preassign_by_crew_month[(str(crew_id), month)]
                if assignment.upper() == "DO":
                    for day in _date_span(start, end):
                        if day.startswith(month):
                            bucket["dayoff_dates"].add(day)
                if assignment.upper() != "DO":
                    bucket["hours"] += hours

    for crew in crews:
        crew_id = crew["crew_id"]
        credit_month_base = str(crew.get("base") or "") if ground_credit is not None else ""
        for month in months:
            task_credits = []
            assigned_hours = 0.0
            for task_id in assigned_by_crew.get(crew_id, []) or []:
                task = tasks_by_id.get(str(task_id))
                if not task:
                    continue
                credit = _task_credit_for_month(
                    task,
                    month,
                    credit_month_base,
                    use_start_month=ground_credit is not None,
                )
                if credit > 0:
                    assigned_hours += credit
                    task_credits.append(credit)
            pre = preassign_by_crew_month[(crew_id, month)]
            pre_hours = pre["hours"]
            dayoff_days = len(pre["dayoff_dates"])
            total_blh = assigned_hours + pre_hours
            total = (
                total_blh
                if ground_credit is not None
                else credit_map.get(str(crew_id), total_blh) if month == primary_month else total_blh
            )
            rows.append({
                "crew_id": crew_id,
                "unique_id": crew_id,
                "name": crew["name"],
                "base": crew["base"],
                "rank": crew["rank"],
                "month": month,
                "pre_assigned_hours": _round(pre_hours),
                "assigned_hours": _round(assigned_hours),
                "total_blh": _round(total_blh),
                "total_hours": _round(total),
                "task_count": len(task_credits),
                "avg_task_credit": _round(sum(task_credits) / len(task_credits)) if task_credits else 0,
                "highest_task_credit": _round(max(task_credits)) if task_credits else 0,
                "lowest_task_credit": _round(min(task_credits)) if task_credits else 0,
                "pre_assigned_activity_hours": _round(pre_hours),
                "dayoff_days": dayoff_days,
            })
            if pre_hours > 0 or dayoff_days > 0 or month == primary_month:
                pre_detail.append({
                    "crew_id": crew_id,
                    "unique_id": crew_id,
                    "name": crew["name"],
                    "base": crew["base"],
                    "rank": crew["rank"],
                    "month": month,
                    "pre_assigned_hours": _round(pre_hours),
                    "dayoff_days": dayoff_days,
                })
    return rows, pre_detail


def _credit_hour_report_table(
    crews: List[Dict[str, Any]],
    result: Dict[str, Any],
    period_start: Optional[datetime] = None,
    period_end: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    """Per-crew credit-hour result straight from the solver's credit_hour_report:
    credited hours vs the crew's target band, the per-day fair-share target
    (available_days x per_day_rate), plus day-off compliance. Surfaced as-is in
    the Results tab; empty for scenarios whose result.json lacks the report.
    The per-day fields are None (rendered '-') for runs from solvers without
    them."""
    raw = result.get("initial_generator_summary", {}).get("credit_hour_report", []) or result.get("credit_hour_report", [])
    if not raw:
        return []
    base_by_crew = {str(c["crew_id"]): c.get("base", "") for c in crews}
    crew_info = result.get("crew_info", {})

    def _opt_float(value: Any, digits: int = 2) -> Optional[float]:
        return None if value is None or value == "" else _round(_safe_float(value), digits)

    def _opt_int(value: Any) -> Optional[int]:
        return None if value is None or value == "" else _safe_int(value)

    rows = []
    for item in raw:
        crew_id = str(item.get("crew_id", ""))
        preassign = crew_info.get(crew_id, {}).get("preassign_tasks", []) or []
        rows.append({
            "crew_id": crew_id,
            "base": base_by_crew.get(crew_id, ""),
            "rank": item.get("rank", ""),
            "credited_hours": _round(_safe_float(item.get("credited_hours", 0.0))),
            "credit_min": _round(_safe_float(item.get("target_min", 0.0))),
            "credit_max": _round(_safe_float(item.get("target_max", 0.0))),
            "pre_assigned_types": _preassign_types_summary(preassign, period_start, period_end),
            "in_range": bool(item.get("in_range", False)),
            "available_days": _opt_int(item.get("available_days")),
            "per_day_rate": _opt_float(item.get("per_day_rate"), 3),
            "period_credit_target": _opt_float(item.get("period_credit_target")),
            "target_gap": _opt_float(item.get("target_gap")),
            "preassign_rest_days": _safe_int(item.get("preassign_rest_days", 0)),
            "required_dayoff": _safe_int(item.get("required_dayoff", 0)),
            "actual_dayoff": _safe_int(item.get("actual_dayoff", 0)),
            "dayoff_ok": bool(item.get("dayoff_ok", False)),
        })
    return rows


def _unassigned_summary(
    tasks: List[Dict[str, Any]],
    assigned_task_ids: set,
    months: List[str],
    use_base_month: bool = False,
    use_start_month: bool = False,
) -> List[Dict[str, Any]]:
    rows = []
    for month in months:
        month_tasks = []
        month_credit: Dict[str, float] = {}
        for task in tasks:
            credit = _task_credit_for_month(
                task,
                month,
                str(task.get("base") or "") if use_base_month else "",
                use_start_month=use_start_month,
            )
            if credit > 0:
                month_tasks.append(task)
                month_credit[task["task_id"]] = credit
        assigned_pairings = [t for t in month_tasks if t["coverage_type"] == "Pairing" and t["task_id"] in assigned_task_ids]
        unassigned_pairings = [t for t in month_tasks if t["coverage_type"] == "Pairing" and t["task_id"] not in assigned_task_ids]
        assigned_reserves = [t for t in month_tasks if t["coverage_type"] == "Reserve" and t["task_id"] in assigned_task_ids]
        unassigned_reserves = [t for t in month_tasks if t["coverage_type"] == "Reserve" and t["task_id"] not in assigned_task_ids]
        rows.append({
            "month": month,
            "assigned_pairing_slots": len(assigned_pairings),
            "unassigned_pairing_slots": len(unassigned_pairings),
            "unassigned_pairing_credit_hours": _round(sum(month_credit[t["task_id"]] for t in unassigned_pairings)),
            "assigned_reserve_slots": len(assigned_reserves),
            "unassigned_reserve_slots": len(unassigned_reserves),
            "unassigned_reserve_credit_hours": _round(sum(month_credit[t["task_id"]] for t in unassigned_reserves)),
        })
    return rows


def _pairing_complement(
    tasks: List[Dict[str, Any]],
    assigned_task_ids: set,
    task_to_crews: Dict[str, List[str]],
    crews_by_id: Dict[str, Dict[str, Any]],
    fixed_task_ids: set,
) -> List[Dict[str, Any]]:
    rows = []
    for task in sorted(tasks, key=lambda t: (t["coverage_type"], t["base"], t["start_base"], t["task_id"])):
        assigned_crews = task_to_crews.get(task["task_id"], [])
        crew_names = [crews_by_id.get(cid, {}).get("name", cid) for cid in assigned_crews]
        rows.append({
            "coverage_type": task["coverage_type"],
            "task_id": task["task_id"],
            "original_pairing_id": task["original_pairing_id"],
            "interface_id": task["interface_id"],
            "name": task["name"],
            "base": task["base"],
            "rank": task["rank"],
            "assignment": task["assignment"],
            "start_base": task["start_base"],
            "end_base": task["end_base"],
            "credit": _round(task["credit_hours"]),
            "coverage_status": "assigned" if task["task_id"] in assigned_task_ids else "unassigned",
            "assigned_crew": ", ".join(crew_names),
            "is_fixed": task["task_id"] in fixed_task_ids,
        })
    return rows


def _ground_task_credit_hours(
    task: Dict[str, Any],
    ground_credit: Dict[str, Any],
) -> Optional[float]:
    roster_id = str(task.get("id") or "").strip()
    if roster_id and roster_id in ground_credit:
        record = ground_credit[roster_id]
        if isinstance(record, dict):
            return _safe_float(record.get("credit_hours"))
        return _safe_float(record)
    source_minutes = task.get("source_credited_minutes")
    if not _is_blank(source_minutes):
        return _minutes_to_hours(source_minutes)
    if task.get("credited_hours") is not None:
        return _safe_float(task.get("credited_hours"))
    return None


def _ground_task_start(
    task: Dict[str, Any],
    ground_credit: Dict[str, Any],
) -> Optional[datetime]:
    roster_id = str(task.get("id") or "").strip()
    if roster_id and roster_id in ground_credit:
        record = ground_credit[roster_id]
        if isinstance(record, dict) and record.get("start") is not None:
            return record.get("start")
    return _epoch_to_dt(task.get("start_time_utc"))


# =====================================================================
# Entry point
# =====================================================================


def build_report_sections(
    result_json: Dict[str, Any],
    input_sections: Dict[str, List[dict]],
) -> Dict[str, Any]:
    """Build the report-shaped sections the gantt frontend reads.

    Mirrors ``generate_report``'s needed subset (report scenario_report.py
    525-670) with ``report_credit_from_ro_input=True`` semantics: roster-period
    month keys, base-aware months, PairingDuty credit for pairings, ground
    credit for pre-assignments.
    """
    crew_lookup = _crew_lookup(input_sections)
    pairing_lookup = _pairing_lookup(input_sections)
    pairing_credit = _pairing_credit_by_pairing_id(input_sections, blank_credit_as_zero=True)
    pairing_duty_credit = _pairing_duty_credit_by_pairing_id(input_sections, blank_credit_as_zero=True)
    ground_credit = _ground_credit_by_roster_id(input_sections)

    crew_ids = list(result_json.get("crew_info", {}).keys())
    crews = [_crew_record(cid, result_json.get("crew_info", {}).get(cid, {}), crew_lookup) for cid in crew_ids]
    crews_by_id = {c["crew_id"]: c for c in crews}

    tasks = _task_records(
        result_json,
        pairing_lookup,
        pairing_credit,
        pairing_duty_credit,
        pairings_use_pairing_credit=True,
    )
    tasks_by_id = {t["task_id"]: t for t in tasks}
    assigned_task_ids, task_to_crews = _assignment_index(result_json)
    fixed_task_ids = _fixed_task_ids(result_json)

    scenario_start, scenario_end = _scenario_dates(input_sections)
    if scenario_end:
        scenario_end = scenario_end + timedelta(days=1)

    months = _report_months(
        tasks,
        result_json,
        scenario_start,
        scenario_end,
        use_base_month=True,
        ground_credit=ground_credit,
    )
    primary_month = (
        _roster_period_key(scenario_start)
        if scenario_start
        else (months[0] if months else "")
    )

    if scenario_start and scenario_end:
        credit_period = (scenario_start, scenario_end)
    elif primary_month:
        credit_period = _month_bounds(primary_month)
    else:
        credit_period = (None, None)

    crew_credit_table, pre_assignment_detail = _crew_credit_table(
        crews,
        tasks_by_id,
        result_json,
        months,
        primary_month,
        ground_credit,
    )
    unassigned_summary = _unassigned_summary(
        tasks,
        assigned_task_ids,
        months,
        use_base_month=True,
        use_start_month=True,
    )
    pairing_complement = _pairing_complement(tasks, assigned_task_ids, task_to_crews, crews_by_id, fixed_task_ids)
    lost_pairings = [r for r in pairing_complement if r["coverage_status"] == "unassigned" and r["coverage_type"] == "Pairing"]
    lost_reserves = [r for r in pairing_complement if r["coverage_status"] == "unassigned" and r["coverage_type"] == "Reserve"]

    return {
        "general_kpi": {
            "credit_hour_report": _credit_hour_report_table(crews, result_json, *credit_period),
        },
        "scheduling_details": {
            "pairing_complement": pairing_complement,
            "unassigned_summary": unassigned_summary,
            "lost_pairings": lost_pairings,
            "lost_reserves": lost_reserves,
            "pre_assignment_detail": pre_assignment_detail,
        },
        "primary_month": primary_month,
    }
