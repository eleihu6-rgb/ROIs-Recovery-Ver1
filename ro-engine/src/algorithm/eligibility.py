"""Pre-filter: builds crew → eligible pairing index list.
Eliminates ~60-80% of crew-pairing pairs before the Lagrangian DP runs.
"""
from __future__ import annotations
from src.models.crew import Crew
from src.models.pairing import Pairing
from src.constraints.compiler import CompiledFTL


def build_eligibility(
    crews: list[Crew],
    pairings: list[Pairing],
    ftl: CompiledFTL,
) -> dict[int, list[int]]:
    """Return mapping crew_idx → sorted list of eligible pairing indices.

    Elimination rules (any match → exclude):
    1. Division mismatch
    2. Crew rank not in pairing composition
    3. Pairing fleet not in crew fleet_codes
    4. Pairing tafb_min > max_tafb_minutes
    5. Pairing total_flt_min would exhaust crew's month/quarter/year budget
    6. Pairing time overlaps any locked assignment
    """
    result: dict[int, list[int]] = {c_idx: [] for c_idx in range(len(crews))}

    for c_idx, crew in enumerate(crews):
        remaining_month = ftl.max_month_flt_min - crew.month_flt_min_used
        remaining_quarter = ftl.max_quarter_flt_min - crew.quarter_flt_min_used
        remaining_year = ftl.max_year_flt_min - crew.year_flt_min_used

        for p_idx, pairing in enumerate(pairings):
            # Rule 1: Division
            if crew.division != pairing.division:
                continue
            # Rule 2: Rank in composition
            if crew.rank not in pairing.eligible_ranks:
                continue
            # Rule 3: Fleet qualification
            if pairing.fleet and pairing.fleet not in crew.fleet_codes:
                continue
            # Rule 4: TAFB limit
            if pairing.tafb_min > ftl.max_tafb_minutes:
                continue
            # Rule 5: Cumulative flight budget
            if pairing.total_flt_min > remaining_month:
                continue
            if pairing.total_flt_min > remaining_quarter:
                continue
            if pairing.total_flt_min > remaining_year:
                continue
            # Rule 6: Locked assignment time overlap
            if _overlaps_locked(crew, pairing):
                continue

            result[c_idx].append(p_idx)

    return result


def _overlaps_locked(crew: Crew, pairing: Pairing) -> bool:
    """Return True if pairing time window overlaps any locked assignment."""
    for lock in crew.locked:
        # Overlap: not (pairing ends before lock starts OR pairing starts after lock ends)
        if not (pairing.end_min <= lock.start_min or pairing.start_min >= lock.end_min):
            return True
    return False
