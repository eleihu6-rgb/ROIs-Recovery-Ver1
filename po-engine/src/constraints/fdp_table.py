"""FDP table lookup — mirrors rule-engine TypeScript lookupFdpLimit exactly."""
from __future__ import annotations


def _hhmm_to_minutes(hhmm: str) -> int:
    """'HH:MM' → minutes since midnight (0–1439)."""
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


def _in_time_window(report_min: int, start_min: int, end_min: int) -> bool:
    """True if report_min is inside [start_min, end_min], supports cross-midnight."""
    if start_min <= end_min:
        return start_min <= report_min <= end_min
    # Cross-midnight e.g. 22:00–05:59
    return report_min >= start_min or report_min <= end_min


def lookup_fdp_limit(fdp_table: list[dict], segments: int, report_local: str) -> int:
    """
    Look up maximum FDP minutes given sector count and local report time.
    Mirrors rule-engine TypeScript lookupFdpLimit exactly.
    report_local: 'HH:MM' local time at duty start.
    Falls back to 660 (conservative) when no row/window matches.
    """
    row = next(
        (r for r in fdp_table if r["minSegments"] <= segments <= r["maxSegments"]),
        None,
    )
    if row is None:
        return 660

    report_min = _hhmm_to_minutes(report_local)
    for window in row["windows"]:
        start_min = _hhmm_to_minutes(window["startLocal"])
        end_min = _hhmm_to_minutes(window["endLocal"])
        if _in_time_window(report_min, start_min, end_min):
            return int(window["limitMinutes"])

    return 660


class FdpLimitCalculator:
    """
    Picklable callable that replaces the fdp_limit_func closure.
    Storing the table as plain data (not a closure) makes CompiledConstraints
    serializable for cross-process transfer in parallel duty generation.
    """
    __slots__ = ("_table",)

    def __init__(self, fdp_table: list[dict]) -> None:
        self._table = fdp_table

    def __call__(self, segments: int, report_local: str) -> int:
        return lookup_fdp_limit(self._table, segments, report_local)

    # Explicit pickle support (slots classes need __getstate__/__setstate__)
    def __getstate__(self) -> dict:
        return {"_table": self._table}

    def __setstate__(self, state: dict) -> None:
        self._table = state["_table"]


# CCAR-121 default FDP table — mirrors rule-engine DEFAULT_FDP_TABLE
DEFAULT_FDP_TABLE: list[dict] = [
    {"minSegments": 1, "maxSegments": 1, "windows": [
        {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 780},
        {"startLocal": "14:00", "endLocal": "17:59", "limitMinutes": 750},
        {"startLocal": "18:00", "endLocal": "21:59", "limitMinutes": 720},
        {"startLocal": "22:00", "endLocal": "05:59", "limitMinutes": 660},
    ]},
    {"minSegments": 2, "maxSegments": 2, "windows": [
        {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 750},
        {"startLocal": "14:00", "endLocal": "17:59", "limitMinutes": 720},
        {"startLocal": "18:00", "endLocal": "21:59", "limitMinutes": 690},
        {"startLocal": "22:00", "endLocal": "05:59", "limitMinutes": 630},
    ]},
    {"minSegments": 3, "maxSegments": 3, "windows": [
        {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 720},
        {"startLocal": "14:00", "endLocal": "17:59", "limitMinutes": 690},
        {"startLocal": "18:00", "endLocal": "21:59", "limitMinutes": 660},
        {"startLocal": "22:00", "endLocal": "05:59", "limitMinutes": 600},
    ]},
    {"minSegments": 4, "maxSegments": 4, "windows": [
        {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 690},
        {"startLocal": "14:00", "endLocal": "17:59", "limitMinutes": 660},
        {"startLocal": "18:00", "endLocal": "21:59", "limitMinutes": 630},
        {"startLocal": "22:00", "endLocal": "05:59", "limitMinutes": 570},
    ]},
    {"minSegments": 5, "maxSegments": 99, "windows": [
        {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 660},
        {"startLocal": "14:00", "endLocal": "17:59", "limitMinutes": 630},
        {"startLocal": "18:00", "endLocal": "21:59", "limitMinutes": 600},
        {"startLocal": "22:00", "endLocal": "05:59", "limitMinutes": 540},
    ]},
]
