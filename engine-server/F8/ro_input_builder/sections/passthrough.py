"""Static passthrough source for sections that have no DB table yet.

Reads the committed reference snapshot and returns a section's rows verbatim.
TECH DEBT: replace each with a real DB source as schema support lands.
"""
from __future__ import annotations

import os
from functools import lru_cache

from .. import golden

_SNAPSHOT = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "reference_snapshot", "ro_input.reference.txt",
)

# Sections served from the snapshot, with their golden variant (None unless tagged).
PASSTHROUGH_SECTIONS = {
    "City": None,
    "RankCombinationCriteria": None,
    "RankCombination": None,
    "AssignmentOverlappable": None,
    "GuaranteeFlyHours": None,
    "CalculationManday": None,
}


@lru_cache(maxsize=1)
def _parsed():
    return golden.parse_file(_SNAPSHOT)


def snapshot_rows(section_name: str, variant: str | None = None):
    key = f"{section_name}({variant})" if variant else section_name
    sec = _parsed().get(key)
    if sec is None:
        raise KeyError(f"section {key} not in reference snapshot")
    return [list(r) for r in sec.rows]


def make_custom(section_name: str, variant: str | None = None):
    """Return a custom(conn, ctx) callable for a SectionSpec."""
    def _custom(conn, ctx):
        return snapshot_rows(section_name, variant)
    return _custom
