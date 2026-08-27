# Plan — Make the PBS solver call the Rust rule engine for legality

> Date: 2026-06-20 · Owner: RO engine · Status: proposed
> Background & evidence: `docs/modules/ro-engine/solver-playbook.md`
> (read it first — this plan assumes its §5–§9 vocabulary).
> Goal: replace the loose Python prefilter / fragile C++ path with an
> **in-process Rust legality engine** that is authoritative *and* fast enough for
> the ~1M-calls/run hot loop (≈90% of solve wall-clock today).

---

## 1. Objective & success criteria

**Objective.** A new `RustRuleChecker` implementing the existing `Checker`
interface (`check_single` / `check_all`), backed by `rule-engine-rs`, selectable
via `conf/config.yaml: rule_engine.mode: "rust"`. No solver-loop surgery.

**Done when:**
1. `mode: rust` runs a full solve on scenario 6 and scenario 91 end-to-end and
   produces a valid `ro_output.txt`.
2. **Parity**: on a fixed set of candidate lines, Rust's pass/fail verdicts match
   the C++ engine (`mode: cpp`) within an agreed tolerance (§7), after
   baseline-violation diffing.
3. **Speed**: per-`check_single` latency is ≤ the C++ path and within ~2× of the
   loose Python prefilter, with **zero per-call JSON/allocation churn**; whole-run
   legality wall-clock materially lower than `mode: cpp`. Numbers captured in a
   benchmark (§6, Phase 5).
4. Per-crew **and** complement rules (via COF) are evaluated in the hot path
   (playbook §8a).

**Non-goals (this plan):** moving the neighbourhood/column-gen search into Rust;
re-deriving rule math (already ported & C++-validated in `rule-engine-rs`);
changing the MIP master or generators.

---

## 2. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Integration seam | New `Checker` impl `RustRuleChecker` | Drop-in; 3 impls already exist (playbook §5). |
| FFI mechanism | **PyO3 + maturin**, extension module `rois_rule_engine` | Native types (pass `list[int]`, no JSON, no ctypes), structured returns, holds state in a `#[pyclass]`. The C-ABI+ctypes alt only buys reuse of the C++-shaped, JSON-heavy wrapper — not worth it. |
| Where state lives | Rust holds **immutable scenario** + **mutable COF index**, loaded once | Hot path 100% native; tiny payloads; explicit resettable COF (playbook §6.4, §8a). |
| Scenario load | Python `ro_input` pipeline (`io/ro_input_parser.py` + `ro_input_builder.py`) parses once and hands structured data to the Rust constructor | Reuses the new Python parser; avoids duplicating the caret-parser in Rust; load is off the hot path so the boundary cost is irrelevant. |
| Complement timing | **Per-line**, via the COF index | Resolved; product requirement "(b)", made cheap by COF (playbook §8a). |
| Baseline diffing | Reproduce per-crew baseline-violation subtraction | Both existing checkers do it (playbook §6.3); skipping it rejects crews for pre-existing facts. |

---

## 3. Architecture

```
Python (solver)                          Rust (rois_rule_engine, PyO3 #[pyclass] Engine)
───────────────                          ──────────────────────────────────────────────
load_from_ro_input → Problem             Engine.__init__(scenario_dto):
io/ro_input_parser+builder                 - immutable store: pairings[id], crew attrs,
        │  (once)                            rule params, defs (base TZ, local-night)
        ▼                                    - COF index: fltId → [{crewId,actingRank,
RustRuleChecker(Checker).bind_problem ──►      division,age,gender}]  (seeded from
        │                                      CrewOnFlight + Crew(COF) sidecars)
        │                                    - per-crew baseline violation signatures
        ▼  HOT, per candidate line
check_single(crew_id, [pairing_id…]) ───► engine.check_line(crew_id, pairing_ids):
        ◄─── violations (small)               per-crew kernels (lib.rs) on immutable data
                                              + complement kernels reading COF (hypothetical add)
                                              − baseline diff  → Vec<Violation>
solver accepts a line ──────────────────► engine.commit_line(crew_id, pairing_ids)  # update COF
solver clears a crew  ──────────────────► engine.revert_crew(crew_id)               # remove from COF
        │  COLD, audit rounds
check_all(items) ───────────────────────► engine.check_all(overlay) → full recompute from COF
```

- New Rust crate **`rule-engine-rs/py/`** (workspace member, `crate-type =
  ["cdylib"]`, depends on the existing `rois_rule_engine` rlib). Keeps the pure
  rlib + CLIs dependency-free.
- Python class lives at `…/ColumnModelSolver_python/rules/rust_checker.py`,
  registered in `rules/__init__.py` and `hybrid_checker.py` modes.

---

## 4. Phased delivery (each phase ships behind `mode` and has a test receipt)

### Phase 0 — Scaffolding ✅ DONE (2026-06-20, local macOS arm64)
- Added `rule-engine-rs/py/` PyO3 crate (workspace member, `crate-type =
  ["cdylib"]`, depends on the `rois_rule_engine` rlib). Root `Cargo.toml` is now
  the workspace root with `default-members = ["."]` so plain `cargo` only touches
  the pure engine; the connector is built by maturin.
- `Engine` `#[pyclass]` stub: `new()`, `check_line(crew_id: i64, pairing_ids:
  Vec<i64>) -> Vec<String>` returning `[]`, `__version__`.
- **Module name = `rois_rule_engine_rs`** (suffix `_rs` to avoid colliding with
  the existing Python pip pkg `rois_rule_engine`) — a deliberate deviation from
  the plan's original name.
- Built natively with `maturin develop` (pyo3 0.22.6, CPython 3.12) into the
  pbs-engine venv. The Rust engine being pure-std means it runs locally on
  macOS where the C++ `.so` cannot.
- **Test receipt:** `py/tests/test_engine_phase0.py` — 4 passed (import +
  `__version__` + `Engine()` + `check_line(274,[1,2,3]) == []`). Engine crate
  still 98 passed via `cargo test`. Build recipe captured in skill
  `106-build-run-rust-solver-connector`.

### Phase 1 — Immutable scenario load ✅ DONE (2026-06-20, local macOS)
- `Engine.__init__` now owns an immutable store: pairings by dense index
  (start/end UTC + block-minutes) and each crew's fixed-roster pairing indices.
  Parallel-array DTO boundary; empty-default args keep `Engine()` working.
  Crew/pairing string ids are interned to dense ints by the Python side. (blh
  carried; base/credited/assignment_group + defs deferred to the rules that need
  them — §Minimal-First.)
- `RustRuleChecker(Checker)` (`rules/rust_checker.py`): `bind_problem` loads the
  store + builds per-crew baseline signatures; `check_single`/`check_all` pass
  native int payloads and subtract baseline. Wired as `mode: "rust"` in
  `hybrid_checker.py`; exported in `rules/__init__.py`. `run_solver.py` already
  routes `cfg.rule_engine.mode` through — no change needed.
- **Test receipts:**
  - `py/tests/` 8 passed (store counts, native payload, index validation).
  - `tests/unit/test_rust_checker_phase1.py` 4 passed (bind loads store, hybrid
    `mode=rust` routes, check_all bookkeeping, unknown-crew→missing).
  - Engine crate `cargo test` 98 passed.
  - **★ Milestone — real solve:** `run_local.sh … rule_engine.mode=rust` on
    scenario 114 → `RustRuleChecker bound: Engine(phase=1, pairings=400,
    crews=71, rules=0)`, `status=optimal`, `coverage_ratio=1.0`, 71 assignments,
    full artifact set incl. `ro_output.txt` (2589-line roster). The connector
    drives the whole solve loop end-to-end and produces a roster on this Mac.
  - *Honest caveat:* `final_global_rule_pass=True` is trivial here — Phase 1
    `check_line` returns `[]` (no kernels), so legality is not yet *enforced*.
    Phase 2 (8002) makes it real. (5 pre-existing `TestInternalCheckerEndToEnd`
    failures are unrelated — confirmed present before this change.)

### Phase 2 — Per-crew hot path (vertical slice) ★ proves the harness ✅ DONE (2026-06-20, local macOS)
- **8002 MAX_CUM_BLOCK** wired into `Engine.check_line` over fixed+candidate,
  `Application::Optimizer` (windows entirely in pre-assigned/fixed days tolerated;
  a breach fires only when a candidate day participates → baseline trivially
  empty). Block minutes attributed to each pairing's UTC start day (the live-port
  pragmatism shared with the gantt). Bands carried as F8 8002/006 BH values,
  config-overridable via `rule_engine.rust_block_bands`.
- **8056 ROSTER SPACING** added alongside (a second rule *shape*: pairwise gap,
  not cumulative window): consecutive FLY duties, gap ≥ SPACE (F8 13 RH),
  optimizer PA-ignore, override via `rule_engine.rust_spacing_hours`.
- `RustRuleChecker(Checker)` + `mode:"rust"` in `hybrid_checker.py`; `run_solver`
  passes `rust_params`.
- **Test receipts:**
  - Connector `py/tests/` **20 passed** — 8002 & 8056 each: candidate-breach
    rejected, under-limit accepted, fixed-only over-limit tolerated, window/gap
    separation, exact-limit legal, non-FLY ignored.
  - Snapshot `tests/unit/test_rust_checker_phase2_8002.py` **3**, `…phase1` **4**.
    Engine crate `cargo test` **98**.
  - **★ Enforcement proven LIVE in a real solve:** scenario 114 `mode=rust`,
    `Engine(phase=2, pairings=400, crews=71, rules=2)`, optimal, 71-crew roster.
    The 8002 cap genuinely binds the optimizer — coverage **1.00 at 112h/28d**
    drops to **0.75 under a 10h/28d override** (`rust_block_bands=[[28,600]]`):
    Rust rejects the breaching lines and the solver covers less. Not an inert pass.
- **Deferred to CoreServer phase (§7):** verdict-level **C++ parity** on sampled
  lines (needs `mode:cpp`, which can't run on darwin). Local proof is
  crafted-case correctness + the rule-bites experiment.

### Phase 3 — COF complement path
- Build the mutable COF index from `CrewOnFlight` + `Crew(COF)` sidecars (age
  from `birthday`, division, gender). Implement **8030 pilot-age** (and 7220
  count if in scope) reading COF with hypothetical-add semantics.
- Add `commit_line` / `revert_crew`; `RustRuleChecker` calls `commit_line` when
  the solver accepts (wire at the generator/strategy accept points — minimal).
- **Test:** construct a flight at the age-mix boundary; adding one more
  over-threshold crew flips legal→illegal in `check_line`; `revert_crew`
  restores. Parity vs C++ rule 7220/age on a crafted scenario.

### Phase 4 — Remaining rules + audit path ✅ rules DONE (2026-06-20, local)
- **All 10 violation rules wired into `check_line`**: 8002006/8002009 (cumulative
  block/duty, generic `check_cum_windows`), 8056 spacing, 7505 GDOs, 7501 SDFD,
  7503/7504 WOCL, 7506 one-checkin, 8004 base-comp, 8030 pilot-age (read-only COF:
  per-pairing baseline complement inverted from fixed rosters + candidate). CALC
  rules 7502/7272 emit no violations; 2014/7500 are definitions consumed by the
  rest/WOCL rules. Loader extended: `_attach_duty_minutes`, `_attach_base_quals`,
  `_attach_crew_demographics`; `Pairing.dp_minutes`, `Crew.base_quals/division/birth_ord`.
- **Rule params sourced from DB** (`io/pg_rule_params.py`, PG workset 103) — not
  hardcoded; F8 constants are fallbacks. 8030 AGE DEFINE=65 from DB.
- **Convergence vs C++ 537** (flying pairings): 338→304→294→293 as rules add, vs
  C++ 268. Residual 25 = documented simplified-port looseness (7505 0-leave band,
  7501 flight-only work periods, 7503/4 FDP≈duty-span).
- **Receipts:** connector py 45, engine cargo 98, snapshot 11.
- **Still deferred to CoreServer:** verdict-level C++ parity (`mode:cpp` Linux-only),
  full `check_all` audit-round recompute, and `commit_line`/`revert_crew` (8030 is
  read-only-vs-baseline locally; cross-candidate COF needs the mutable index).
- **NOT a Phase-4 sub-bullet but worth noting:** the 8030 commit/revert wiring
  (Phase 3 in this plan) was bypassed with a read-only baseline-COF approximation.

### Phase 5 — Performance
- Benchmark `check_single` latency and whole-run legality wall-clock for
  `internal` vs `cpp` vs `rust` on scenario 91. Confirm criteria §1.3.
- Optional: `mode: "hybrid_rust"` = Python prefilter → Rust (cascade, playbook §5).
- **Test:** committed benchmark script + numbers in
  `docs/modules/ro-engine/` ; assert rust ≤ cpp latency.

### Phase 6 — Parity harness + rollout
- A standalone parity harness: feed the same candidate-line corpus to C++ and
  Rust, diff verdicts + violation signatures, report mismatches.
- Flip default `mode` to `rust` once parity + perf gates pass; keep `cpp`
  available for A/B.
- **Test:** parity harness green on scenario 6 + 91; document residual known
  diffs.

---

## 5. Key files to create / touch

| Action | Path |
|---|---|
| New PyO3 crate | `rule-engine-rs/py/Cargo.toml`, `rule-engine-rs/py/src/lib.rs` (Engine `#[pyclass]`) |
| Reuse kernels | `rule-engine-rs/src/lib.rs` (no math changes) |
| New Python checker | `…/ColumnModelSolver_python/rules/rust_checker.py` |
| Register mode | `…/rules/hybrid_checker.py`, `…/rules/__init__.py`, `run_solver.py:97-120` |
| Config | `…/conf/config.yaml` (`rule_engine.mode`, optional `rust_*` keys) |
| Scenario DTO | `…/io/ro_input_builder.py` (emit the Rust `scenario_dto`) |
| Parity harness | `…/tests/` + a small CLI |

---

## 6. Performance design rules (non-negotiable, from playbook §6.4)
- Hot calls pass **integer pairing-id arrays**, return small structs — **no JSON**.
- Per-line check recomputes per-crew rules from immutable data → **stateless**, no
  leak-prone accumulators, no session rebuild.
- COF mutated only by explicit `commit_line` / `revert_crew` → trivially
  resettable.
- Keep the immutable store zero-copy where possible; pre-index pairings by id and
  flights by pairing.

---

## 7. Parity & testing strategy
- **Where runs execute**: the C++ engine and full solves run on the **remote
  CoreServer** (`10.15.12.3` via gateway `47.89.181.217`), kicked off with
  `run_pipeline.sh` (conda env `flair-pbs-env`, experiment `deploy/prod`);
  override `rule_engine.mode=cpp|rust` to compare. The Rust wheel must be built
  for that host (manylinux). Login + kickoff details: playbook §9a. `mode: internal`
  can run locally for call-pattern observation only.
- **Reference**: C++ engine (`mode: cpp`) on scenario 6 + 91 (real artifacts:
  memory `ro-solver-genuine-run-artifacts`).
- **Corpus**: sample candidate lines actually generated by the solver (dump from a
  `mode: internal` run), so parity is tested on realistic inputs.
- **Metric**: pass/fail agreement rate per rule + violation-signature match after
  baseline-diff. Agree on a tolerance for known C++ quirks; document residuals.
- Per CLAUDE.md §No-Illusion / §Playwright-Required: every phase pastes its test
  run receipt; backend-only logic uses pytest. (No UI surface here.)

---

## 8. Risks & mitigations
| Risk | Mitigation |
|---|---|
| COF semantics subtler than assumed (who counts, acting vs active rank, segment vs duty) | Phase 3 crafted tests + parity vs rule 7220; read the C++ `LimitNumberOfCrewOnFlightRule` source before coding. |
| Baseline-diff mismatch vs C++ | Mirror `cpp_checker._build_violation_signature` fields exactly; test on crews with pre-existing violations. |
| PyO3 build/deploy friction (manylinux wheel for the solver host) | maturin manylinux build in CI; pin Python 3.12; ship wheel alongside solver. |
| Rule coverage drift (rust 14 rules vs C++ ruleset actually used by solver) | Phase 4 parity sweep enumerates which rules fire; gap list tracked. |
| `commit_line` wiring touches generators (more than "just a checker") | Keep commit at the solver's accept points only; default to per-crew-only if a rule set has no complement rules (degrade gracefully). |

---

## 9. Open items to confirm during Phase 1–3 (not blocking the plan)
1. Exact COF counting semantics from `rule7220` C++ source (acting vs active
   rank; per-segment vs per-flight; inclusion of pre-assigned crew).
2. Which of the 14 rules the production ruleset actually enables for RO (vs
   gantt) — sets the Phase 4 scope.
3. Whether the scenario DTO should also carry the `(COF)` qualification/cert
   sidecars (only if an enabled complement rule needs them).
