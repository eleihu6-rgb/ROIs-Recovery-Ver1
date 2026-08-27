"""Time utility functions — all durations in minutes (integers) for OR-Tools."""

from datetime import datetime, timezone


def dt_to_minutes(dt: datetime) -> int:
    """Convert a datetime to minutes since Unix epoch (UTC)."""
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int((dt - epoch).total_seconds() // 60)


def minutes_between(start: datetime, end: datetime) -> int:
    """Return the number of minutes between two datetimes."""
    return dt_to_minutes(end) - dt_to_minutes(start)


def intervals_overlap(
    start_a: int, end_a: int, start_b: int, end_b: int
) -> bool:
    """Check if two intervals (in minutes) overlap."""
    return start_a < end_b and start_b < end_a


def parse_iso(value: str) -> datetime:
    """Parse an ISO-8601 string into a timezone-aware UTC datetime."""
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt
