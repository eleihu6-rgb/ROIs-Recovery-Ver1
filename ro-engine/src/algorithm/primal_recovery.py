# src/algorithm/primal_recovery.py
"""Primal recovery: convert Lagrangian dual solution to a feasible integer assignment.

Two-round approach:
  Round 1 — Priority rounding: for each pairing, rank candidate crews by
             lambda value (highest = most profitable) and take required_count.
  Round 2 — Greedy fill: for any pairing still under-covered, scan remaining
             eligible crews and assign the best available.
"""
from __future__ import annotations
from dataclasses import dataclass
from src.algorithm.crew_scheduler import can_add
from src.models.crew import Crew
from src.models.pairing import Pairing
from src.constraints.compiler import CompiledFTL
from src.utils.ftl_state import DPState, initial_state


@dataclass
class Assignment:
    crew_id: str
    pairing_id: int
    acting_rank: str
    base_match: bool


def recover_primal(
    crews: list[Crew],
    pairings: list[Pairing],
    selected_by_crew: list[list[int]],  # Lagrangian solution: crew_idx → pairing indices
    lambdas: dict[int, dict[str, float]],
    ftl: CompiledFTL,
) -> list[Assignment]:
    """Recover a feasible primal assignment from the Lagrangian dual solution."""
    # Track which pairings each crew is tentatively assigned to (for FTL check)
    crew_schedules: list[list[Pairing]] = [[] for _ in range(len(crews))]

    # Sort pairings by start_min so FTL state evolves correctly
    sorted_pairings = sorted(pairings, key=lambda p: p.start_min)

    # Build pairing-index lookup
    p_id_to_idx = {p.pairing_id: i for i, p in enumerate(sorted_pairings)}

    assignments: list[Assignment] = []
    covered: dict[int, dict[str, int]] = {
        p.pairing_id: {c.rank: 0 for c in p.compositions} for p in sorted_pairings
    }

    # Round 1: Priority rounding based on Lagrangian selection
    # For each pairing, collect crews that selected it; take top required_count by lambda
    for pairing in sorted_pairings:
        pid = pairing.pairing_id
        p_idx = p_id_to_idx[pid]

        for comp in pairing.compositions:
            rank = comp.rank
            required = comp.required_count
            # Candidates: crews with correct rank that selected this pairing
            candidates = [
                (c_idx, lambdas.get(pid, {}).get(rank, 0.0))
                for c_idx, crew in enumerate(crews)
                if crew.rank == rank and p_idx in selected_by_crew[c_idx]
            ]
            # Sort by lambda descending (highest priority first)
            candidates.sort(key=lambda x: -x[1])

            for c_idx, _ in candidates:
                if covered[pid][rank] >= required:
                    break
                crew = crews[c_idx]
                state = _state_before(crew, crew_schedules[c_idx], ftl)
                if can_add(state, pairing, ftl):
                    crew_schedules[c_idx].append(pairing)
                    crew_schedules[c_idx].sort(key=lambda p: p.start_min)
                    covered[pid][rank] += 1
                    assignments.append(Assignment(
                        crew_id=crew.crew_id,
                        pairing_id=pid,
                        acting_rank=rank,
                        base_match=(crew.base == pairing.base),
                    ))

    # Round 2: Greedy fill for under-covered pairings
    for pairing in sorted_pairings:
        pid = pairing.pairing_id
        for comp in pairing.compositions:
            rank = comp.rank
            still_needed = comp.required_count - covered[pid][rank]
            if still_needed <= 0:
                continue
            # Find any available crew of correct rank
            for c_idx, crew in enumerate(crews):
                if still_needed <= 0:
                    break
                if crew.rank != rank:
                    continue
                if crew.division != pairing.division:
                    continue
                if pairing.fleet and pairing.fleet not in crew.fleet_codes:
                    continue
                # Check not already assigned this pairing
                if any(p.pairing_id == pid for p in crew_schedules[c_idx]):
                    continue
                state = _state_before(crew, crew_schedules[c_idx], ftl)
                if can_add(state, pairing, ftl):
                    crew_schedules[c_idx].append(pairing)
                    crew_schedules[c_idx].sort(key=lambda p: p.start_min)
                    covered[pid][rank] += 1
                    still_needed -= 1
                    assignments.append(Assignment(
                        crew_id=crew.crew_id,
                        pairing_id=pid,
                        acting_rank=rank,
                        base_match=(crew.base == pairing.base),
                    ))

    return assignments


def _state_before(crew: Crew, schedule: list[Pairing], ftl: CompiledFTL) -> DPState:
    """Compute the DPState for a crew given their current schedule (sorted by start_min)."""
    from src.algorithm.crew_scheduler import next_dp_state
    state = initial_state(crew)
    for p in schedule:
        state = next_dp_state(state, p)
    return state
