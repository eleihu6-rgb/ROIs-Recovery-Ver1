"""Optimizer baseline multiset diff — shared by ro_check (and unit tests).

Mirror of ``RustRuleChecker._diff_raw`` in
``pbs-engine/ColumnModelSolver_python/rules/rust_checker.py``.
"""

from __future__ import annotations

from collections import Counter


def diff_raw(candidate: list[str], baseline: Counter[str]) -> list[str]:
    """Subtract pre-existing violations by multiset count.

    Each baseline signature cancels one matching candidate string; leftovers are
    *new* violations. Do not collapse with ``set`` / ``dict.fromkeys`` after this —
    duplicate identical signatures must keep multiplicity.
    """
    remaining = baseline.copy()
    out: list[str] = []
    for raw in candidate:
        if remaining[raw] > 0:
            remaining[raw] -= 1
            continue
        out.append(raw)
    return out
