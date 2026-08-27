"""
Set partitioning solvers:
  solve_set_partitioning           — direct MIP (CBC), best for < 5,000 candidates
  solve_set_partitioning_with_cg   — LP-guided column generation + MIP, for 5k–50k candidates
"""
from __future__ import annotations
import time
from dataclasses import dataclass
from ortools.linear_solver import pywraplp
from src.algorithm.pairing_generator import PairingCandidate


@dataclass
class SolverResult:
    status: str                              # DONE / TIMEOUT / INFEASIBLE
    selected_pairings: list[PairingCandidate]
    covered_flight_ids: set[int]
    solve_time_sec: float
    objective_value: float
    solver_status: str = ""                  # Raw solver status: OPTIMAL / FEASIBLE / INFEASIBLE / ABNORMAL


def _pairing_cost(p: PairingCandidate, weights: dict[str, float]) -> float:
    w1 = float(weights.get("w_pairings", 1000))
    w2 = float(weights.get("w_deadhead", 500))
    w3 = float(weights.get("w_duty_time", 1))
    w4 = float(weights.get("w_penalty", 100))
    return (
        w1
        + w2 * p.deadhead_count
        + w3 * p.total_duty_minutes
        + w4 * p.soft_violations
    )


def solve_set_partitioning(
    candidates: list[PairingCandidate],
    all_flight_ids: list[int],
    weights: dict[str, float],
    time_limit_sec: int,
) -> SolverResult:
    """
    Set partitioning MIP using OR-Tools CBC.
    Each flight must be covered by exactly one pairing (hard constraint).
    Minimises total weighted cost.
    Returns INFEASIBLE if any flight cannot be covered.
    """
    t_start = time.perf_counter()

    solver = pywraplp.Solver.CreateSolver("CBC")
    if solver is None:
        return SolverResult("INFEASIBLE", [], set(), 0.0, 0.0)

    solver.set_time_limit(time_limit_sec * 1000)

    # Decision variables x[i] ∈ {0,1}
    x = [solver.BoolVar(f"x_{i}") for i in range(len(candidates))]

    # Coverage constraint: each flight covered exactly once
    for fid in all_flight_ids:
        covering = [x[i] for i, p in enumerate(candidates) if fid in p.flight_ids]
        if not covering:
            # Flight not in any candidate — infeasible before even solving
            return SolverResult("INFEASIBLE", [], set(), time.perf_counter() - t_start, 0.0)
        solver.Add(solver.Sum(covering) == 1)

    # Objective: minimize total cost
    solver.Minimize(solver.Sum(
        _pairing_cost(p, weights) * x[i]
        for i, p in enumerate(candidates)
    ))

    status = solver.Solve()
    t_end = time.perf_counter()

    if status == pywraplp.Solver.INFEASIBLE:
        return SolverResult("INFEASIBLE", [], set(), t_end - t_start, 0.0, solver_status="INFEASIBLE")

    if status not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        return SolverResult("INFEASIBLE", [], set(), t_end - t_start, 0.0, solver_status="ABNORMAL")

    selected = [candidates[i] for i in range(len(candidates)) if x[i].solution_value() > 0.5]
    covered = {fid for p in selected for fid in p.flight_ids}
    result_status = "DONE" if status == pywraplp.Solver.OPTIMAL else "TIMEOUT"
    raw_status = "OPTIMAL" if status == pywraplp.Solver.OPTIMAL else "FEASIBLE"

    return SolverResult(
        status=result_status,
        selected_pairings=selected,
        covered_flight_ids=covered,
        solve_time_sec=t_end - t_start,
        objective_value=solver.Objective().Value(),
        solver_status=raw_status,
    )


# ── Column generation (5k–50k candidate range) ───────────────────────────────

def _solve_lp_relaxation(
    candidates: list[PairingCandidate],
    all_flight_ids: list[int],
    weights: dict[str, float],
) -> dict[int, float] | None:
    """
    Solve LP relaxation of set partitioning using GLOP.
    Returns dual variable π_f for each flight (shadow price of coverage constraint),
    or None if GLOP is unavailable or LP is infeasible/unbounded.
    """
    solver = pywraplp.Solver.CreateSolver("GLOP")
    if solver is None:
        return None

    # Continuous variables 0 ≤ x_p ≤ 1
    x = [solver.NumVar(0.0, 1.0, f"x_{i}") for i in range(len(candidates))]

    # Coverage constraints (equality) — one per flight
    flight_cts: dict[int, object] = {}
    for fid in all_flight_ids:
        covering = [x[i] for i, p in enumerate(candidates) if fid in p.flight_ids]
        if not covering:
            return None  # flight not coverable
        ct = solver.Add(solver.Sum(covering) == 1)
        flight_cts[fid] = ct

    solver.Minimize(solver.Sum(
        _pairing_cost(p, weights) * x[i]
        for i, p in enumerate(candidates)
    ))

    status = solver.Solve()
    if status != pywraplp.Solver.OPTIMAL:
        return None

    return {fid: ct.DualValue() for fid, ct in flight_cts.items()}


def solve_set_partitioning_with_cg(
    candidates: list[PairingCandidate],
    all_flight_ids: list[int],
    weights: dict[str, float],
    time_limit_sec: int,
) -> SolverResult:
    """
    Column generation + MIP for medium-scale candidate pools (5k–50k).

    Algorithm:
      1. Seed a restricted master problem (RMP) with a small initial column set.
      2. Solve LP relaxation of RMP (GLOP) to obtain dual variables π_f.
      3. Compute reduced cost = cost(p) - Σ_f π_f for each pooled candidate.
      4. Add the COLUMNS_PER_ITER most improving (negative rc) candidates.
      5. Repeat until no improving column or time budget exhausted.
      6. Solve final MIP (CBC) on assembled RMP.
    """
    t_start = time.perf_counter()
    MAX_ITERATIONS = 30
    COLUMNS_PER_ITER = 200
    CG_TIME_FRACTION = 0.60  # spend at most 60% of budget on CG iterations

    n = len(candidates)
    # Seed RMP: 2 candidates per flight, minimum 100
    seed_size = min(n, max(len(all_flight_ids) * 2, 100))
    in_rmp: set[int] = set(range(seed_size))
    pool: set[int] = set(range(seed_size, n))

    for iteration in range(MAX_ITERATIONS):
        if not pool:
            break
        elapsed = time.perf_counter() - t_start
        if elapsed >= time_limit_sec * CG_TIME_FRACTION:
            break

        rmp = [candidates[i] for i in sorted(in_rmp)]
        duals = _solve_lp_relaxation(rmp, all_flight_ids, weights)
        if duals is None:
            break  # LP infeasible or GLOP unavailable

        # Find candidates with negative reduced cost
        improving: list[tuple[float, int]] = []
        for idx in pool:
            p = candidates[idx]
            rc = _pairing_cost(p, weights) - sum(duals.get(fid, 0.0) for fid in p.flight_ids)
            if rc < -1e-6:
                improving.append((rc, idx))

        if not improving:
            break  # LP optimal — no more improving columns

        improving.sort()  # most negative first
        to_add = {idx for _, idx in improving[:COLUMNS_PER_ITER]}
        in_rmp |= to_add
        pool -= to_add

    # Final MIP on assembled RMP (at least 30s budget)
    elapsed = time.perf_counter() - t_start
    mip_budget = max(int(time_limit_sec - elapsed), 30)
    rmp_final = [candidates[i] for i in sorted(in_rmp)]
    return solve_set_partitioning(rmp_final, all_flight_ids, weights, mip_budget)
