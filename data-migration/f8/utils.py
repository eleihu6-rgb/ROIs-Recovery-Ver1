import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta

import httpx

logger = logging.getLogger(__name__)

RANK_MAP: dict[str, str] = {"CAP": "CA", "CP": "FO", "CA": "CA", "FO": "FO"}
ASSIGNMENT_MAP: dict[str, str] = {
    "FLIGHT": "FLY",
    "RESERVE": "SBY",
    "TRAINING": "GRD",
    "TRANSPORT": "DHD",
}

# rosterGround assignment values from F8 API → MySQL roster_ground.assignment
ROSTER_GROUND_ASSIGNMENT_MAP: dict[str, str] = {
    "UNKNOWN": "UNK",
    "FLIGHT": "FLY",
    "ILLNESS": "ILL",
    "VACATION": "VAC",
    "COMPENSATION": "COMP",
    "TRANSPORT": "DHD",
    "STANDBY": "SBY",
    "STATIONSTANDBY": "SSB",
    "TRAINING": "GRD",
    "SIMULATOR": "SIM",
    "DAYOFF": "DO",
    "SHIFT": "SFT",
    "RESERVE": "SBY",
}

# "Unknown" is intentionally excluded — those records are not imported.
# "Flight" is fetched but routed to roster/roster_flight (single-leg, pairingId=0)
# instead of roster_ground; pairingId>0 Flight records are ignored.
ALL_ROSTER_GROUND_ASSIGNMENTS: list[str] = [
    "Flight", "Illness", "Vacation", "Compensation",
    "Transport", "StandBy", "StationStandBy", "Training",
    "Simulator", "DayOff", "Shift", "Reserve",
]


def fetch_with_chunk_retry(
    fetch_fn: Callable[..., list],
    start: date,
    end: date,
    *,
    min_chunk_days: int = 1,
    split_days: int = 3,
    **kwargs,
) -> list[dict]:
    """Fetch an API date range, splitting into smaller chunks on 504.

    Tries the full range once (504 is NOT retried by _request_with_retry).
    On 504 Gateway Timeout the range is split into ``split_days``-sized
    sub-chunks and each retried recursively.

    Args:
        fetch_fn: Callable(start_dt, end_dt, **kwargs) → list of records.
        start: Request start (inclusive).
        end: Request end (inclusive).
        min_chunk_days: Smallest chunk before giving up.
        split_days: Target chunk size in days when splitting.
        **kwargs: Forwarded to fetch_fn.

    Returns:
        Aggregated records from all sub-chunks.
    """
    days = (end - start).days + 1
    try:
        return fetch_fn(start.isoformat(), end.isoformat(), **kwargs)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code != 504 or days <= min_chunk_days:
            raise
        logger.warning("504 on %s~%s (%dd), splitting into %dd chunks", start, end, days, split_days)
        sub_chunk_days = min(split_days, days // 2)  # ensure sub-chunks are strictly smaller
        if sub_chunk_days < 1:
            raise
        sub_chunks = chunk_date_range(start, end, chunk_days=sub_chunk_days)
        all_data: list[dict] = []
        for cs, ce in sub_chunks:
            all_data.extend(
                fetch_with_chunk_retry(fetch_fn, cs, ce, min_chunk_days=min_chunk_days, split_days=split_days, **kwargs)
            )
        return all_data


def chunk_date_range(
    start: date, end: date, chunk_days: int = 10
) -> list[tuple[date, date]]:
    if chunk_days < 1:
        raise ValueError("chunk_days must be at least 1")
    chunks: list[tuple[date, date]] = []
    current = start
    while current <= end:
        chunk_end = min(current + timedelta(days=chunk_days - 1), end)
        chunks.append((current, chunk_end))
        current = chunk_end + timedelta(days=1)
    return chunks


def normalize_rank(rank: str) -> str:
    return RANK_MAP.get(rank.upper(), rank)


def normalize_assignment(assignment: str) -> str:
    return ASSIGNMENT_MAP.get(assignment.upper(), assignment)


def normalize_roster_ground_assignment(assignment: str) -> str:
    return ROSTER_GROUND_ASSIGNMENT_MAP.get(assignment.upper(), assignment)


def normalize_interface_flt_id(val: object, *, max_len: int = 64) -> str:
    """F8 external leg id (`fltId`): unique per customer; used as `flight.interface_flt_id` and pairing join key."""
    if val is None:
        return ""
    s = str(val).strip()
    if not s:
        return ""
    return s[:max_len] if len(s) > max_len else s


@dataclass
class SyncResult:
    entity: str
    status: str = "completed"
    imported: int = 0
    skipped: int = 0
    warnings: list[str] = field(default_factory=list)
    fetch_s: float = 0.0
    import_s: float = 0.0
    total_s: float = 0.0

    def add_warning(self, msg: str) -> None:
        self.warnings.append(msg)
        self.status = "completed_with_warnings"
        self.skipped += 1

    def add_notice(self, msg: str) -> None:
        """Non-fatal diagnostic (pairing row still committed); does not increment `skipped`."""
        self.warnings.append(msg)
        if self.status == "completed":
            self.status = "completed_with_warnings"

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "entity": self.entity,
            "imported": self.imported,
            "skipped": self.skipped,
            "warnings": self.warnings,
            "fetch_s": self.fetch_s,
            "import_s": self.import_s,
            "total_s": self.total_s,
        }


@dataclass
class SyncTimer:
    """Track fetch, import, and total elapsed time for a sync operation.

    Usage:
        timer = SyncTimer()
        timer.start()
        data = fetch_from_api()
        timer.fetch_end()
        timer.import_start()
        import_to_db(data)
        timer.import_end()
        timer.finish()
        timer.log(logger, "crew", count=100)
    """
    fetch_s: float = 0.0
    import_s: float = 0.0
    total_s: float = 0.0
    _t0: float = 0.0

    def start(self) -> None:
        self._t0 = time.perf_counter()

    def fetch_end(self) -> None:
        self.fetch_s += time.perf_counter() - self._t0

    def import_start(self) -> None:
        self._import_t0 = time.perf_counter()

    def import_end(self) -> None:
        self.import_s += time.perf_counter() - self._import_t0

    def finish(self) -> None:
        self.total_s = time.perf_counter() - self._t0

    def populate_result(self, result: SyncResult) -> None:
        result.fetch_s = round(self.fetch_s, 1)
        result.import_s = round(self.import_s, 1)
        result.total_s = round(self.total_s, 1)

    def log(self, logger: logging.Logger, entity: str, imported: int = 0) -> None:
        logger.info(
            "TIMING %s fetch=%.1fs import=%.1fs total=%.1fs count=%d",
            entity, self.fetch_s, self.import_s, self.total_s, imported,
        )