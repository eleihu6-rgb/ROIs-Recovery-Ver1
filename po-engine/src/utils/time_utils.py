"""Time calculation utilities.

All times are represented as integer minutes from a common epoch
(the earliest scheduled departure in the dataset) to work with
OR-Tools CP-SAT which requires integer domains.
"""

from datetime import datetime, timezone


# We use 2000-01-01T00:00Z as a fixed epoch so that minute values
# are stable across different datasets.
_EPOCH = datetime(2000, 1, 1, tzinfo=timezone.utc)


def datetime_to_minutes(dt: datetime) -> int:
    """Convert a UTC datetime to integer minutes since epoch."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = dt - _EPOCH
    return int(delta.total_seconds() // 60)


def minutes_to_datetime(minutes: int) -> datetime:
    """Convert integer minutes since epoch back to a UTC datetime."""
    from datetime import timedelta

    return _EPOCH + timedelta(minutes=minutes)


def flight_block_minutes(dep_utc: datetime, arv_utc: datetime) -> int:
    """Compute block time in minutes between departure and arrival."""
    dep_min = datetime_to_minutes(dep_utc)
    arv_min = datetime_to_minutes(arv_utc)
    return arv_min - dep_min


def compute_ground_time_minutes(
    prev_arv_utc: datetime, next_dep_utc: datetime
) -> int:
    """Compute ground time between two consecutive flights in a duty."""
    return datetime_to_minutes(next_dep_utc) - datetime_to_minutes(prev_arv_utc)
