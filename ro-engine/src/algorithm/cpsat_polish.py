# src/algorithm/cpsat_polish.py
"""Polish — three-phase quality improvement on the primal assignment.

Phase A: Violation repair — sequential FTL replay, drops any assignment that
         violates can_add() when replayed in start_min order. No CP-SAT.
Phase B: LNS fairness improvement — greedy same-rank load transfer between the
         most-loaded and least-loaded crew. Simplified v1; full CP-SAT sliding-
         window LNS is deferred to v1.1 (see spec-gaps.md [P2]).
Phase C: Global fairness cross-rank adjustment. Not yet implemented (deferred).

Each phase runs within its time budget and gracefully degrades if time runs out.
"""
from __future__ import annotations
import time
from typing import Callable

from src.algorithm.crew_scheduler import can_add, next_dp_state
from src.algorithm.primal_recovery import Assignment
from src.models.crew import Crew
from src.models.pairing import Pairing
from src.constraints.compiler import CompiledFTL
from src.utils.ftl_state import initial_state
from src.utils.progress import progress


def polish(
    assignments: list[Assignment],
    crews: list[Crew],
    pairings: list[Pairing],
    ftl: CompiledFTL,
    time_budget_sec: float,
    is_stop: Callable[[], bool] = lambda: False,
) -> list[Assignment]:
    """Run all polish phases within the given time budget."""
    start = time.monotonic()

    def remaining() -> float:
        return time_budget_sec - (time.monotonic() - start)

    if is_stop() or remaining() <= 0:
        return assignments

    # Phase A: violation repair (15% of total budget, max 30s)
    phase_a_budget = min(time_budget_sec * 0.15, 30.0)
    progress("cpsat_polish", 85, "Phase A: FTL violation repair")
    assignments = _phase_a_repair(assignments, crews, pairings, ftl, phase_a_budget)

    if is_stop() or remaining() <= 2:
        return assignments

    # Phase B: LNS fairness improvement
    phase_b_budget = remaining() * 0.85
    progress("cpsat_polish", 87, "Phase B: LNS fairness improvement")
    assignments = _phase_b_lns(assignments, crews, pairings, ftl, phase_b_budget, is_stop)

    return assignments


def _phase_a_repair(
    assignments: list[Assignment],
    crews: list[Crew],
    pairings: list[Pairing],
    ftl: CompiledFTL,
    time_budget: float,
) -> list[Assignment]:
    """Remove assignments that cause FTL violations for any crew.

    When the time budget is exhausted, remaining crews are passed through
    without FTL verification (acceptable degradation vs. no output).
    """
    crew_by_id = {c.crew_id: c for c in crews}
    pairing_by_id = {p.pairing_id: p for p in pairings}

    # Group assignments by crew
    by_crew: dict[str, list[Assignment]] = {}
    for a in assignments:
        by_crew.setdefault(a.crew_id, []).append(a)

    repaired: list[Assignment] = []
    start = time.monotonic()
    for crew_id, crew_assignments in by_crew.items():
        # Time guard: pass remaining through unverified if budget exhausted
        if time.monotonic() - start >= time_budget:
            repaired.extend(crew_assignments)
            continue

        crew = crew_by_id.get(crew_id)
        if crew is None:
            repaired.extend(crew_assignments)
            continue

        # Sort by pairing start time
        sorted_assigns = sorted(
            crew_assignments,
            key=lambda a: pairing_by_id[a.pairing_id].start_min,
        )

        # Replay assignments; drop any that cause FTL violation
        state = initial_state(crew)
        valid_assigns: list[Assignment] = []
        for assign in sorted_assigns:
            p = pairing_by_id.get(assign.pairing_id)
            if p is None:
                continue
            if can_add(state, p, ftl):
                state = next_dp_state(state, p)
                valid_assigns.append(assign)
            # else: drop this assignment (FTL violation)

        repaired.extend(valid_assigns)

    return repaired


def _phase_b_lns(
    assignments: list[Assignment],
    crews: list[Crew],
    pairings: list[Pairing],
    ftl: CompiledFTL,
    time_budget: float,
    is_stop: Callable[[], bool],
) -> list[Assignment]:
    """LNS: find the most overloaded crew, re-solve their window with CP-SAT.

    In v1 this is a simple best-swap: swap one pairing between the most-loaded
    and least-loaded crew of the same rank if the swap improves fairness.
    """
    start = time.monotonic()
    if not assignments:
        return assignments

    crew_by_id = {c.crew_id: c for c in crews}
    pairing_by_id = {p.pairing_id: p for p in pairings}

    # Compute each crew's total flight minutes
    crew_flt: dict[str, int] = {}
    by_crew: dict[str, list[Assignment]] = {}
    for a in assignments:
        by_crew.setdefault(a.crew_id, []).append(a)

    for crew_id, assigns in by_crew.items():
        crew_flt[crew_id] = sum(
            pairing_by_id[a.pairing_id].total_flt_min
            for a in assigns
            if a.pairing_id in pairing_by_id
        )

    # Group by rank
    by_rank: dict[str, list[str]] = {}
    for crew in crews:
        by_rank.setdefault(crew.rank, []).append(crew.crew_id)

    improved_assignments = list(assignments)

    # Try a limited number of swaps within time budget
    for _ in range(20):
        if is_stop() or (time.monotonic() - start) >= time_budget:
            break

        for rank, crew_ids in by_rank.items():
            if len(crew_ids) < 2:
                continue
            rank_crews = [(cid, crew_flt.get(cid, 0)) for cid in crew_ids]
            rank_crews.sort(key=lambda x: x[1])
            least_loaded_id = rank_crews[0][0]
            most_loaded_id = rank_crews[-1][0]

            if crew_flt.get(most_loaded_id, 0) - crew_flt.get(least_loaded_id, 0) < 60:
                continue  # less than 1 hour difference — not worth swapping

            # Find a pairing from most-loaded that least-loaded can take
            most_assigns = [
                a for a in improved_assignments
                if a.crew_id == most_loaded_id and a.acting_rank == rank
            ]
            if not most_assigns:
                continue

            least_crew = crew_by_id.get(least_loaded_id)
            if least_crew is None:
                continue

            for a in most_assigns:
                p = pairing_by_id.get(a.pairing_id)
                if p is None:
                    continue
                least_schedule = sorted(
                    [pairing_by_id[x.pairing_id]
                     for x in improved_assignments
                     if x.crew_id == least_loaded_id and x.pairing_id in pairing_by_id],
                    key=lambda x: x.start_min,
                )
                if _is_insertable(least_crew, least_schedule, p, ftl):
                    # Perform swap: remove from most-loaded, add to least-loaded
                    improved_assignments = [
                        x for x in improved_assignments
                        if not (x.crew_id == most_loaded_id and x.pairing_id == a.pairing_id)
                    ]
                    improved_assignments.append(Assignment(
                        crew_id=least_loaded_id,
                        pairing_id=a.pairing_id,
                        acting_rank=rank,
                        base_match=(least_crew.base == p.base),
                    ))
                    # Update flight time tracking
                    pft = p.total_flt_min
                    crew_flt[most_loaded_id] = crew_flt.get(most_loaded_id, 0) - pft
                    crew_flt[least_loaded_id] = crew_flt.get(least_loaded_id, 0) + pft
                    break

    return improved_assignments


def _is_insertable(
    crew: Crew,
    schedule: list[Pairing],
    p: Pairing,
    ftl: CompiledFTL,
) -> bool:
    """Return True if pairing p can be inserted into crew's schedule with full FTL compliance.

    Replays the merged schedule (existing + p, sorted by start_min) from the
    crew's initial state, verifying every can_add() transition. This correctly
    handles insertions at any position, not just the end.
    """
    merged = sorted(schedule + [p], key=lambda x: x.start_min)
    state = initial_state(crew)
    for pairing in merged:
        if not can_add(state, pairing, ftl):
            return False
        state = next_dp_state(state, pairing)
    return True
