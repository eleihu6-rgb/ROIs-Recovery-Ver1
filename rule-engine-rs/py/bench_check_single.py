"""Per-check latency microbenchmark: Rust engine vs Python InternalRuleChecker.

Builds a synthetic Problem (N crews, P pairings), binds both checkers, and times
many check_single calls on identical (crew, candidate) inputs. Isolates the
rule-engine cost from the solver. Run with the pbs-engine venv:

    .venv/bin/python rule-engine-rs/py/bench_check_single.py
"""

import sys
import time
from pathlib import Path

# Make the solver package importable.
SNAP = Path(__file__).resolve().parents[2] / "pbs-engine"
sys.path.insert(0, str(SNAP))

from ColumnModelSolver_python.models.crew import Crew, Pairing, Roster  # noqa: E402
from ColumnModelSolver_python.models.problem import Problem  # noqa: E402
from ColumnModelSolver_python.rules import CheckRequest, InternalRuleChecker, RustRuleChecker  # noqa: E402

DAY = 86_400
N_CREW = 60
N_PAIRING = 300
ITERS = 50_000


def build_problem() -> Problem:
    pairings = []
    for i in range(N_PAIRING):
        day = i % 28
        start = day * DAY + 8 * 3600
        pairings.append(Pairing(
            id=str(1000 + i), blh=4.0, start_time_utc=start, end_time_utc=start + 6 * 3600,
            rank_composition={"CA": 1}, base="YEG", assignment_group="FLY",
            original_pairing_id=str(1000 + i),
        ))
    crews = []
    for c in range(N_CREW):
        # each crew already holds two fixed pairings
        fixed = [Roster(pairing_id=str(1000 + (c * 2) % N_PAIRING)),
                 Roster(pairing_id=str(1000 + (c * 2 + 1) % N_PAIRING))]
        crews.append(Crew(id=f"C{c}", rank="CA", base="YEG", rosters=fixed))
    p = Problem(crews=crews, pairings=pairings, period_start_utc=0, period_end_utc=30 * DAY)
    p.prepare()
    return p


def bench(checker, problem, label):
    crews = problem.crews
    pairings = problem.pairings
    # Pre-build request inputs: each iter checks crew c with a 3-pairing candidate.
    reqs = []
    for i in range(ITERS):
        c = crews[i % len(crews)]
        base = (i * 3) % (N_PAIRING - 3)
        cand = pairings[base:base + 3]
        reqs.append(CheckRequest.for_single(c, cand))

    t0 = time.perf_counter()
    for r in reqs:
        checker.check_single(r)
    dt = time.perf_counter() - t0
    per_us = dt / ITERS * 1e6
    print(f"{label:28} {ITERS} calls in {dt:7.3f} s  →  {per_us:8.3f} µs/call")
    return per_us


def main():
    problem = build_problem()

    rust = RustRuleChecker().bind_problem(problem)
    internal = InternalRuleChecker().bind_problem(problem)

    print(f"synthetic: {N_CREW} crew, {N_PAIRING} pairings, {ITERS} check_single calls each\n")
    # warmup
    bench(rust, problem, "Rust (warmup)")
    bench(internal, problem, "Internal (warmup)")
    print()
    r = bench(rust, problem, "Rust engine (8002+8056+7505)")
    i = bench(internal, problem, "Python InternalRuleChecker")
    print()
    if r > 0:
        print(f"Rust is {i / r:.1f}× faster per check_single")


if __name__ == "__main__":
    main()
