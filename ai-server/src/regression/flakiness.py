"""Transition-based instability scoring + quarantine rules (spec §4).

Replaces the naive fail/run ratio: outcomes are asymmetric (a pass proves
absence of regression; a fail is only a hint), so we score status *flips*
over a recent-results window, weighted up by 'flaky' outcomes (tests that
passed only on retry).
"""

QUARANTINE_THRESHOLD = 0.3
MIN_RUNS_FOR_SUGGESTION = 5
RELEASE_STREAK = 5
FLAKY_WEIGHT = 0.15


def instability(recent: list[str]) -> float:
    """Score 0..1: status transitions / (n-1), plus a weight per flaky outcome."""
    n = len(recent)
    if n < 2:
        return 0.0
    transitions = sum(1 for a, b in zip(recent, recent[1:]) if a != b)
    score = transitions / (n - 1) + FLAKY_WEIGHT * recent.count('flaky') / n
    return round(min(1.0, score), 3)


def should_suggest_quarantine(recent: list[str], *, quarantined: bool) -> bool:
    """Suggest quarantine for unstable, not-yet-quarantined tests with enough history."""
    if quarantined or len(recent) < MIN_RUNS_FOR_SUGGESTION:
        return False
    return instability(recent) >= QUARANTINE_THRESHOLD


def should_release(recent: list[str], *, quarantined: bool) -> bool:
    """Auto-release after RELEASE_STREAK consecutive passes while quarantined."""
    if not quarantined or len(recent) < RELEASE_STREAK:
        return False
    return all(s == 'pass' for s in recent[-RELEASE_STREAK:])
