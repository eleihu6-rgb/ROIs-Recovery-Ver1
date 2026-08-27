"""Failure-first ordering for test runs (Goal 6 / §4.4).

Pure, stable: highest-signal (most-failing / flakiest / recently failed /
never-run) tests sort earliest so they execute first.
"""
from typing import Any


def _sort_key(test: dict[str, Any]) -> tuple:
    fail_count = test.get('fail_count') or 0
    flakiness = test.get('flakiness_score') or 0.0
    last_status_fail = 0 if test.get('last_status') == 'fail' else 1
    last_run_at = test.get('last_run_at') or ''
    return (-fail_count, -flakiness, last_status_fail, last_run_at)


def prioritize(tests: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return tests sorted failing-first. Stable for equal keys."""
    return sorted(tests, key=_sort_key)
