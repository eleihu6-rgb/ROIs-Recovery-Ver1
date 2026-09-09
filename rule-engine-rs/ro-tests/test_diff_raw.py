"""Unit tests for baseline multiset diff (align with rust_checker)."""

from __future__ import annotations

from collections import Counter

import pytest

from baseline_diff import diff_raw


@pytest.mark.parametrize(
    ("candidate", "baseline", "expected"),
    [
        (["A", "A"], Counter(["A"]), ["A"]),
        (["A", "A"], Counter(["A", "A"]), []),
        (["A", "B"], Counter(["A"]), ["B"]),
        ([], Counter(["A"]), []),
        (["A", "B", "A"], Counter(["A"]), ["B", "A"]),
    ],
)
def test_diff_raw_multiset(
    candidate: list[str], baseline: Counter[str], expected: list[str]
) -> None:
    assert diff_raw(candidate, baseline) == expected
