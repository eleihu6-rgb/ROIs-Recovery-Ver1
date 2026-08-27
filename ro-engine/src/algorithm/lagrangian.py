"""Lagrangian Relaxation main loop.

Relaxes the composition constraints (required crew per rank per pairing)
via Lagrange multipliers λ. Each iteration:
  1. Solve per-crew DP in parallel (each crew is independent given λ)
  2. Compute coverage gap
  3. Update λ via subgradient (Polyak step)
  4. Track best primal snapshot
"""
from __future__ import annotations
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Callable

from src.algorithm.crew_scheduler import solve_crew_dp
from src.models.crew import Crew
from src.models.pairing import Pairing
from src.constraints.compiler import CompiledFTL
from src.utils.progress import progress


@dataclass
class LagrangianResult:
    selected_by_crew: list[list[int]]        # crew_idx → selected pairing indices
    lambdas: dict[int, dict[str, float]]     # final lambda values
    dual_bound: float
    best_primal_profit: float
    total_iterations: int


def run_lagrangian(
    crews: list[Crew],
    pairings: list[Pairing],
    eligibility: dict[int, list[int]],       # crew_idx → eligible pairing indices
    ftl: CompiledFTL,
    job_params: dict,
    is_stop: Callable[[], bool],
) -> LagrangianResult:
    time_limit = float(job_params.get("time_limit_sec", 300))
    max_iter = int(job_params.get("max_iterations", 500))
    w_unassigned = float(job_params.get("weights_unassigned", 1000.0))

    # Sort pairings by start_min for DP
    sorted_pairings = sorted(pairings, key=lambda p: p.start_min)

    # Build per-pairing composition requirement dict: {pairing_id: {rank: required_count}}
    comps_by_pairing: dict[int, dict[str, int]] = {
        p.pairing_id: {c.rank: c.required_count for c in p.compositions}
        for p in sorted_pairings
    }

    # Initialize λ = 0 for each pairing × rank
    lambdas: dict[int, dict[str, float]] = {
        p.pairing_id: {c.rank: 0.0 for c in p.compositions}
        for p in sorted_pairings
    }

    best_selected: list[list[int]] = [[] for _ in range(len(crews))]
    best_primal = float("inf")
    L_best = float("-inf")
    rho = 1.5
    no_improve = 0
    start_time = time.monotonic()

    k = 0
    for k in range(max_iter):
        if is_stop():
            break
        elapsed = time.monotonic() - start_time
        if elapsed >= time_limit * 0.75:
            break

        # Parallel per-crew DP
        selected_by_crew = _solve_all_crews(
            crews, sorted_pairings, eligibility, lambdas, ftl
        )

        # Coverage gap: gap[pairing_id][rank] = required - assigned
        gap = _compute_gap(sorted_pairings, crews, selected_by_crew, comps_by_pairing)

        # L2 norm squared — used for Polyak step denominator
        gap_norm_sq = sum(g * g for rg in gap.values() for g in rg.values())
        # L∞ norm — used for convergence check (spec: max|gap| ≤ 0.5)
        max_gap = max((abs(g) for rg in gap.values() for g in rg.values()), default=0.0)

        # Primal snapshot: count unassigned pairings as proxy for objective
        unassigned = sum(
            1 for pid, rg in gap.items() if any(g > 0 for g in rg.values())
        )
        primal_approx = unassigned * w_unassigned
        if primal_approx < best_primal:
            best_primal = primal_approx
            best_selected = selected_by_crew

        # Dual bound approximation (sum of lambda * required)
        dual = sum(
            lam * comps_by_pairing[pid].get(rank, 0)
            for pid, ranks in lambdas.items()
            for rank, lam in ranks.items()
        )

        if dual > L_best:
            L_best = dual
            no_improve = 0
        else:
            no_improve += 1
            if no_improve > 0 and no_improve % 50 == 0:
                rho *= 0.9

        # Polyak step size and lambda update
        if gap_norm_sq > 1e-9 and best_primal > dual:
            alpha = rho * (best_primal - dual) / gap_norm_sq
            for p_id, rank_gaps in gap.items():
                for rank, g in rank_gaps.items():
                    lambdas[p_id][rank] += alpha * g

        # Progress every 25 iterations
        if k % 25 == 0:
            covered = sum(
                1 for pid, rg in gap.items() if all(abs(g) <= 0.5 for g in rg.values())
            )
            progress(
                "lagrangian", 15 + int(60 * k / max_iter),
                f"Iter {k}/{max_iter}: L={dual:.0f}, covered={covered}/{len(sorted_pairings)}",
            )

        # Convergence: L∞ norm of gap ≤ 0.5 (spec §4.4)
        if max_gap <= 0.5:
            best_selected = selected_by_crew
            break

    return LagrangianResult(
        selected_by_crew=best_selected,
        lambdas=lambdas,
        dual_bound=L_best,
        best_primal_profit=best_primal,
        total_iterations=k + 1,
    )


def _solve_all_crews(
    crews: list[Crew],
    pairings: list[Pairing],
    eligibility: dict[int, list[int]],
    lambdas: dict[int, dict[str, float]],
    ftl: CompiledFTL,
) -> list[list[int]]:
    """Solve per-crew DPs. Sequential for small instances, parallel for large."""
    results: list[list[int]] = [[] for _ in range(len(crews))]

    if len(crews) <= 50:
        # Sequential: avoids process-spawn overhead for small instances
        for c_idx, crew in enumerate(crews):
            ep = [pairings[i] for i in eligibility.get(c_idx, [])]
            results[c_idx] = solve_crew_dp(crew, ep, lambdas, ftl)
    else:
        # Parallel: spawn worker processes for large crew counts
        with ProcessPoolExecutor() as executor:
            futures = {
                executor.submit(
                    solve_crew_dp,
                    crew,
                    [pairings[i] for i in eligibility.get(c_idx, [])],
                    lambdas,
                    ftl,
                ): c_idx
                for c_idx, crew in enumerate(crews)
            }
            for future in as_completed(futures):
                c_idx = futures[future]
                results[c_idx] = future.result()

    return results


def _compute_gap(
    pairings: list[Pairing],
    crews: list[Crew],
    selected_by_crew: list[list[int]],
    compositions_by_pairing: dict[int, dict[str, int]],
) -> dict[int, dict[str, float]]:
    """Compute gap[pairing_id][rank] = required - assigned_count."""
    # Build assigned dict: {pairing_id: {rank: count}}
    assigned: dict[int, dict[str, int]] = {}
    for p in pairings:
        assigned[p.pairing_id] = {c.rank: 0 for c in p.compositions}

    for c_idx, crew in enumerate(crews):
        for p_idx in selected_by_crew[c_idx]:
            if p_idx >= len(pairings):
                continue
            p = pairings[p_idx]
            if crew.rank in assigned.get(p.pairing_id, {}):
                assigned[p.pairing_id][crew.rank] += 1

    gap: dict[int, dict[str, float]] = {}
    for p in pairings:
        required = compositions_by_pairing[p.pairing_id]
        gap[p.pairing_id] = {
            rank: float(req - assigned[p.pairing_id].get(rank, 0))
            for rank, req in required.items()
        }
    return gap
