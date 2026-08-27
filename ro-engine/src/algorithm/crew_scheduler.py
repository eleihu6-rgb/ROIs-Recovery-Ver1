"""Per-crew scheduling DP.

Solves the per-crew Lagrangian subproblem:
  maximize Σ_{p in S} profit(crew, p, λ)
  subject to:  time ordering + FTL constraints

Complexity: O(P²) where P = eligible pairings per crew.
"""
from __future__ import annotations
from src.models.crew import Crew
from src.models.pairing import Pairing
from src.constraints.compiler import CompiledFTL
from src.utils.ftl_state import DPState, initial_state


def can_add(state: DPState, pairing: Pairing, ftl: CompiledFTL) -> bool:
    """Return True if pairing can follow the current DP state without FTL violation."""
    # 1. Minimum rest between last activity and this pairing start
    if pairing.start_min < state.last_rest_end_min + ftl.min_rest_minutes:
        return False
    # 2. Monthly flight limit
    if state.month_flt_min + pairing.total_flt_min > ftl.max_month_flt_min:
        return False
    # 3. Quarterly flight limit
    if state.quarter_flt_min + pairing.total_flt_min > ftl.max_quarter_flt_min:
        return False
    # 4. Yearly flight limit
    if state.year_flt_min + pairing.total_flt_min > ftl.max_year_flt_min:
        return False
    # 5. Consecutive duty days
    if state.consecutive_duties + pairing.duty_count > ftl.max_consecutive_duty_days:
        return False
    # 6. FDP limit per duty period: fdp_limit_func(num_sectors) → max_fdp_minutes
    # PairingDuty lacks per-duty seg_count; approximate as total / duty_count.
    if pairing.duties:
        duty_segs = max(1, pairing.seg_count // max(1, pairing.duty_count))
        fdp_limit = ftl.fdp_limit_func(duty_segs)
        for duty in pairing.duties:
            if duty.fdp_min > fdp_limit:
                return False
    return True


def next_dp_state(state: DPState, pairing: Pairing) -> DPState:
    """Return the DPState after completing this pairing."""
    return DPState(
        last_end_min=pairing.end_min,
        last_rest_end_min=pairing.end_min,
        month_flt_min=state.month_flt_min + pairing.total_flt_min,
        quarter_flt_min=state.quarter_flt_min + pairing.total_flt_min,
        year_flt_min=state.year_flt_min + pairing.total_flt_min,
        consecutive_duties=state.consecutive_duties + pairing.duty_count,
    )


def compute_profit(
    crew: Crew,
    pairing: Pairing,
    lambdas: dict[int, dict[str, float]],
    ftl: CompiledFTL,
    state: DPState,
) -> float:
    """Lagrangian profit for assigning crew to pairing.

    profit = lambda[pairing_id][crew.rank]
           - base_mismatch_penalty
           - fairness_deviation_penalty
    """
    lam = lambdas.get(pairing.pairing_id, {}).get(crew.rank, 0.0)

    # Base mismatch penalty (soft constraint)
    base_penalty = ftl.preferred_base_weight if crew.base != pairing.base else 0.0

    # Fairness: deviation from target hours after adding this pairing
    projected_hours = (state.month_flt_min + pairing.total_flt_min) / 60.0
    fairness_penalty = abs(projected_hours - ftl.fairness_target_hours) * 0.1

    return lam - base_penalty - fairness_penalty


def solve_crew_dp(
    crew: Crew,
    eligible_pairings: list[Pairing],  # pre-sorted by start_min
    lambdas: dict[int, dict[str, float]],
    ftl: CompiledFTL,
) -> list[int]:
    """Find the maximum-profit feasible pairing subset for one crew.

    Returns a list of indices into eligible_pairings (sorted by start_min).
    Returns [] if no profitable assignment exists.
    """
    if not eligible_pairings:
        return []

    # Sort by start_min (should already be sorted, but enforce)
    pairings = sorted(eligible_pairings, key=lambda p: p.start_min)
    n = len(pairings)
    init = initial_state(crew)

    # dp[i] = (best_total_profit, state_after_pairing_i, prev_idx)
    # prev_idx: index of previous selected pairing, or -1 if first
    dp: list[tuple[float, DPState, int]] = []

    for i, pairing in enumerate(pairings):
        best_profit = float("-inf")
        best_prev = -2  # sentinel: not reachable
        best_state_after = init

        # Try: this pairing is the first in the schedule
        if can_add(init, pairing, ftl):
            p = compute_profit(crew, pairing, lambdas, ftl, init)
            if p > best_profit:
                best_profit = p
                best_prev = -1
                best_state_after = next_dp_state(init, pairing)

        # Try: append this pairing after a previously selected pairing j
        for j in range(i):
            j_profit, j_state, _ = dp[j]
            if j_profit == float("-inf"):
                continue  # j itself was unreachable
            if not can_add(j_state, pairing, ftl):
                continue
            p = j_profit + compute_profit(crew, pairing, lambdas, ftl, j_state)
            if p > best_profit:
                best_profit = p
                best_prev = j
                best_state_after = next_dp_state(j_state, pairing)

        dp.append((best_profit, best_state_after, best_prev))

    # Find the ending pairing with the highest total profit (only if > 0)
    best_end = -1
    best_total = 0.0  # threshold: only select if total profit > 0
    for i, (profit, _, _) in enumerate(dp):
        if profit > best_total:
            best_total = profit
            best_end = i

    if best_end == -1:
        return []

    # Backtrack to recover selected pairing indices
    selected: list[int] = []
    idx = best_end
    while idx >= 0:
        selected.append(idx)
        idx = dp[idx][2]

    return list(reversed(selected))
