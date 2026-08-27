"""DP state and epoch-time helpers for per-crew scheduling."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta

# Reference epoch: all times stored as int minutes since this point
_EPOCH = datetime(2000, 1, 1, tzinfo=timezone.utc)


def to_epoch_min(dt: datetime) -> int:
    """Convert a UTC datetime to integer minutes since 2000-01-01 00:00 UTC."""
    return int((dt - _EPOCH).total_seconds() // 60)


def from_epoch_min(minutes: int) -> datetime:
    """Convert epoch minutes back to a UTC datetime."""
    return _EPOCH + timedelta(minutes=minutes)


def parse_dt(s: str) -> datetime:
    """Parse ISO-8601 UTC string (with or without Z) to UTC datetime."""
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


@dataclass(frozen=True)
class DPState:
    """Immutable per-crew state used in the scheduling DP.

    All time values are epoch minutes (int). Using int instead of datetime
    eliminates object allocation overhead in tight DP loops.
    """
    last_end_min: int          # when the last duty/activity ended
    last_rest_end_min: int     # when the last rest period ended (= last_end_min for simplicity)
    month_flt_min: int         # cumulative flight minutes in current calendar month
    quarter_flt_min: int       # cumulative flight minutes in current quarter
    year_flt_min: int          # cumulative flight minutes in current year
    consecutive_duties: int    # consecutive duty-days count


def initial_state(crew: "Crew") -> DPState:  # type: ignore[name-defined]
    """Build the starting DPState for a crew from their FTL state section data."""
    return DPState(
        last_end_min=crew.last_duty_end_min,
        last_rest_end_min=crew.last_rest_end_min,
        month_flt_min=crew.month_flt_min_used,
        quarter_flt_min=crew.quarter_flt_min_used,
        year_flt_min=crew.year_flt_min_used,
        consecutive_duties=crew.consecutive_duty_days,
    )
