"""IATA airport code → IANA timezone with dynamic DST (zoneinfo).

Lookup order:
  1. Airport section from ro_input.txt (airport → zoneId)
  2. Built-in F8 / common IATA → IANA fallback map
  3. UTC
"""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# F8 network + common Canadian bases when Airport section is absent.
_DEFAULT_IATA_TZ: dict[str, str] = {
    "YVR": "America/Vancouver",
    "YXX": "America/Vancouver",
    "YYJ": "America/Vancouver",
    "YLW": "America/Vancouver",
    "YEG": "America/Edmonton",
    "YYC": "America/Edmonton",
    "YQL": "America/Edmonton",
    "YMM": "America/Edmonton",
    "YQR": "America/Regina",
    "YXE": "America/Regina",
    "YWG": "America/Winnipeg",
    "YYZ": "America/Toronto",
    "YOW": "America/Toronto",
    "YHM": "America/Toronto",
    "YQT": "America/Thunder_Bay",
    "YUL": "America/Montreal",
    "YQB": "America/Toronto",
    "YHZ": "America/Halifax",
}


def parse_airport_zones(sections: dict[str, dict]) -> dict[str, str]:
    """Extract IATA → IANA zoneId from the RO Airport section."""
    mapping: dict[str, str] = {}
    for row in sections.get("Airport", {}).get("rows", []):
        iata = (row.get("airport") or "").strip().upper()
        zone = (row.get("zoneId") or row.get("zone_id") or "").strip()
        if iata and zone:
            mapping[iata] = zone
    return mapping


def resolve_zone(iata: str, airport_zones: dict[str, str]) -> ZoneInfo:
    """Return ZoneInfo for an IATA code (DST rules from IANA tz database)."""
    code = (iata or "").strip().upper()
    zone_name = airport_zones.get(code) or _DEFAULT_IATA_TZ.get(code) or "UTC"
    try:
        return ZoneInfo(zone_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def utc_ts_to_local(utc_ts: int, iata: str, airport_zones: dict[str, str]) -> datetime:
    """UTC epoch seconds → aware local datetime at *iata* (DST-aware)."""
    return datetime.fromtimestamp(utc_ts, tz=timezone.utc).astimezone(
        resolve_zone(iata, airport_zones)
    )


def offset_min_at(utc_ts: int, iata: str, airport_zones: dict[str, str]) -> int:
    """UTC offset in minutes east of UTC at *utc_ts* for airport *iata* (includes DST)."""
    local = utc_ts_to_local(utc_ts, iata, airport_zones)
    return int(local.utcoffset().total_seconds() // 60)


def format_local(
    utc_ts: int,
    iata: str,
    airport_zones: dict[str, str],
    fmt: str = "%Y-%m-%d %H:%M",
) -> str:
    local = utc_ts_to_local(utc_ts, iata, airport_zones)
    return f"{local.strftime(fmt)} ({iata or '?'})"


def format_utc_offset_label(utc_ts: int, iata: str, airport_zones: dict[str, str]) -> str:
    """e.g. 'UTC-07:00' at the given instant (offset for airport *iata*, DST-aware)."""
    off = offset_min_at(utc_ts, iata, airport_zones)
    sign = "+" if off >= 0 else "-"
    h, m = divmod(abs(off), 60)
    return f"UTC{sign}{h:02d}:{m:02d}"


def crew_offsets_at(
    utc_ts: int,
    crew_bases: list[str],
    airport_zones: dict[str, str],
) -> list[int]:
    """Per-crew rule-engine offset_min at *utc_ts* (prime base, DST-aware)."""
    return [offset_min_at(utc_ts, base, airport_zones) for base in crew_bases]
