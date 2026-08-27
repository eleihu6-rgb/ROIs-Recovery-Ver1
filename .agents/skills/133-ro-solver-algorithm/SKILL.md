---
name: 133-ro-solver-algorithm
description: Use when understanding legacy RO solver material or current PBS column-generation solver behavior. F8 scope note: ro-engine is retained legacy material; current F8 PBS optimization uses pbs-engine and current legality uses rule-engine-rs.
---

# RO Solver Algorithm — Understanding & Enhancement Guide

## Overview

> **F8 scope note:** `ro-engine/` is retained legacy material. Current F8 PBS optimization work uses `pbs-engine/`; current legality work uses `rule-engine-rs/`.

The legacy RO solver (`ro-engine/src/`) was a **black-box CLI subprocess** — no HTTP, Redis, or DB. Keep this material for historical algorithm reference; implement current F8 optimization changes in `pbs-engine/`.

```
python -m src --input input.gz --output output.gz
Exit: 0=DONE  1=INFEASIBLE  2=TIMEOUT  3=INTERNAL_ERROR
```

---

## 4-Phase Pipeline

### Phase 1 — FTL Compilation (2% time)
`src/constraints/compiler.py`

Parses rule config JSON → `CompiledFTL`:
- `fdp_limit_func(num_sectors)` — FDP table lookup (default 780 min)
- `min_rest_minutes` — 600 (10h)
- `max_month_flt_min / quarter / year` — 6000 / 16200 / 60000
- `max_consecutive_duty_days` — 7
- `preferred_base_weight` — 50 (soft penalty per base mismatch)
- `fairness_target_hours` — 80h/month (deviation penalty × 0.1)

**Enhancement point:** To add a new hard constraint, add a field to `CompiledFTL` and wire it into `can_add()` in Phase 2.

---

### Phase 2 — Lagrangian Relaxation (60% time)
`src/algorithm/lagrangian.py` + `src/algorithm/crew_scheduler.py`

Dualises composition constraints (required crew count per pairing per rank) via Lagrange multipliers **λ**.

**Eligibility pre-filter** (`src/algorithm/eligibility.py`) runs first, eliminating ~60–80% of crew×pairing pairs by:
- Division / rank / fleet mismatch
- TAFB limit exceeded
- Time overlap with locked assignments
- Cumulative flight budget exhausted

**Iteration loop** (up to `max_iterations`, default 500):

1. **Per-crew DP subproblem** — each crew independently maximises:
   `profit = λ[pairing][rank] − base_penalty − fairness_penalty`
   subject to FTL via DP state `(last_end_min, month/quarter/year_flt_min, consecutive_duties)`.
   Parallelised if >50 crews.

2. **Coverage gap** = `required_count − assigned_count` per pairing/rank.

3. **Polyak subgradient λ update:**
   `α = ρ × (best_primal − dual) / ‖gap‖²`
   `ρ` decays ×0.9 every 50 non-improving iterations.
   Converges when L∞ gap ≤ 0.5.

4. Progress reported as `PROGRESS:N` JSON Lines to stdout (every 25 iter).

**Enhancement points:**
- New crew-level constraint → add field to `DPState`, check in `can_add()`
- Change objective (e.g. seniority preference) → add term to profit formula
- Tune convergence → adjust `max_iterations`, gap threshold, ρ decay
- New eligibility dimension → add check in `eligibility.py` (pre-filter is cheap; DP is expensive)

---

### Phase 3 — Primal Recovery (10% time)
`src/algorithm/primal_recovery.py`

Converts dual solution to feasible integer assignment:

1. **Priority rounding** — for each pairing, assign highest-λ crews (required_count best, FTL-checked)
2. **Greedy fill** — scan remaining crews to fill under-covered pairings by division/fleet match

**Enhancement point:** Replace greedy fill with a smarter heuristic (e.g. seniority-weighted, fairness-aware).

---

### Phase 4 — CP-SAT Polish (15% time)
`src/algorithm/cpsat_polish.py`

**Phase A — FTL violation repair:** replay schedule chronologically, drop FTL-violating assignments.

**Phase B — Load balancing (simplified LNS):** swap pairings between most/least-loaded crews per rank if fairness improves >1h and swap is feasible.

**Enhancement point:** Replace Phase B with a proper LNS or CP-SAT model for stronger fairness.

---

## I/O Format — Gzip CSV with `## SECTION` markers

### Key Input Sections
| Section | Content |
|---|---|
| `JOB_PARAMS` | `time_limit_sec`, `max_iterations`, `weights_unassigned`, `fairness_target_hours` |
| `RULES` | FTL rule rows with `params_json` (category, limits) |
| `CREWS` | crew_id, division, rank, base, fleet |
| `CREW_FTL_STATE` | last_duty_end, month/quarter/year_flt_min, consecutive_duties |
| `LOCKED_ASSIGNMENTS` | Pre-blocked windows (leave, training) |
| `PAIRINGS` | pairing_id, division, base, fleet, start_min, end_min, total_flt_min |
| `PAIRING_DUTIES` | duty_seq, fdp_min, flt_min per duty |
| `PAIRING_COMPOSITIONS` | pairing_id, rank, required_count |

### Key Output Sections
| Section | Content |
|---|---|
| `RESULT_META` | status, solve_time_sec, dual_bound, primal_obj, total_iterations |
| `KPI` | coverage_pct, total_assignments |
| `ASSIGNMENTS` | crew_id, pairing_id, acting_rank, base_match |

**Reference artifacts:** `ro-engine/baseline/scenario-537/` — genuine solver I/O from a real run.

---

## Engine-Server Integration
`engine-server/` (FastAPI port 3003) orchestrates the subprocess:

- `POST /api/optimize/start` → spawns `python -m src` subprocess
- Monitors `PROGRESS:N` lines on stdout
- Archives output to `complete/{airline}/{scenario_id}/`
- Sets `PG_PASSWORD` env var so Rust connector can load workset-103 params from Postgres

**Rust rule-engine connector** (`rule_engine.mode=rust`): validates cumulative block-hours (rule 8002 etc.) in-process via PyO3 after solve. Plugs in as a `Checker` interface (`check_single` / `check_all`). See `docs/modules/ro-engine/solver-playbook.md`.

---

## Key Config Knobs (`JOB_PARAMS`)
| Param | Default | Effect |
|---|---|---|
| `time_limit_sec` | 300 | Wall clock budget |
| `max_iterations` | 500 | Lagrangian iterations cap |
| `weights_unassigned` | — | Penalty for uncovered pairings |
| `fairness_target_hours` | 80 | Monthly target (h) for load balance |
| `preferred_base_weight` | 50 | Soft penalty per base mismatch |

---

## Enhancement Checklist

When adding a new constraint or objective:

1. **Hard constraint on individual crew:** add to `CompiledFTL` + `can_add()` in `crew_scheduler.py`
2. **New eligibility dimension:** add pre-filter in `eligibility.py` (fast — cuts DP space)
3. **New soft objective:** add penalty term to profit formula in `lagrangian.py`
4. **New FTL rule type:** add `category` handler in `compiler.py`
5. **Cross-crew constraint (e.g. complement size):** can't be in per-crew DP — handle in Phase 3 (primal recovery) or Phase 4 (CP-SAT polish)
6. **New input section:** add parser in `src/io/job_io.py`, add field to input structs
7. **New output section:** add writer in `job_io.py`, add to KPI/RESULT_META as appropriate

---

## Running Locally
See skill `104-run-pbs-solver-local` for the full local run recipe.

Quick test against baseline:
```bash
git submodule update --init --recursive pbs-engine
# Run current local PBS solver flows from pbs-engine.
# Keep ro-engine/baseline only as historical oracle data.
```

Compare with oracle:
```bash
python -c "
import gzip, io
with gzip.open('/tmp/out.gz') as f: print(f.read().decode()[:2000])
"
```

---

## Common Gotchas

| Gotcha | Detail |
|---|---|
| Minutes not hours | All time values in the I/O are **epoch minutes**, not hours |
| Cross-crew constraints | Lagrangian DP is per-crew — cross-crew constraints must go in Phase 3/4 |
| Locked assignments block DP | FTL state includes locked windows; check overlap in `can_add()` |
| Rust connector needs PG_PASSWORD | Set by engine-server; missing → connector falls back to hardcoded params |
| scenario_id split (RO/PO/flight) | Three different scenario_id columns in DB — don't confuse them |
| Baseline scenario 537 not 536 | The genuine baseline is scenario-537 despite old naming |
