# Rust PBS Solver Port — Design Spec

> Port the Python column-generation PBS rostering solver (`pbs-engine/ColumnModelSolver_python`, ~14.3k LOC) to a standalone Rust crate, validated module-by-module against a frozen scenario-538 baseline, linking the existing Rust rule engine (`rule-engine-rs`) directly.

- **Date:** 2026-06-22
- **Branch:** `rust-pbs-solver` (created in an isolated git worktree)
- **Folder:** `ro-engine/rust-solver/`
- **Status:** Design approved; implementation plan to follow.

---

## 1. Goal & Context

The PBS rostering optimizer is currently **pure Python** (the former C++ solver core and the C++ rule engine are both gone — the C++ rule engine was replaced by the Rust `rule-engine-rs`). The optimizer uses a **column-generation** model: build pairing/roster columns, price a master LP, integerize with a MIP, refine with local search, check legality via a pluggable `Checker`.

This project ports that solver to Rust so that:

1. The solver and the rule engine are the **same language** → the per-call PyO3/serialization boundary (currently the hottest cost in the inner loop) disappears.
2. We can exploit Rust concurrency (`rayon`) and incremental legality state that Python's GIL forbids.
3. We keep a **drop-in** binary that the existing pipeline (engine-server → gantt → ruletool) consumes unchanged.

### Established facts (verified on disk, 2026-06-22)

- Authored solver: **~14,316 LOC** Python across modules: `core` (2427), `generators` (2619), `io` (4137), `rules` (1561), `network` (710), `strategies` (323), `utils` (724), `models` (254), `cost` (210), `mip` (431).
- MIP backend: **Google OR-Tools** (`from ortools … import MIP`).
- Determinism: seeded — `random.seed(self.config.seed)` (Python Mersenne Twister) drives generators/local-search.
- Rule seam: a `Checker` ABC with `check_single(CheckRequest) -> CheckResult` and `check_all(...)`. Existing impls: `internal`, `cpp`, `hybrid`, **`rust`** (the PyO3 connector to `rule-engine-rs`).
- I/O: reads `ro_input.txt` (+ `ro_input_rule.txt`), writes the `ro_output` the downstream pipeline parses.
- **No C++ anywhere anymore.**

---

## 2. Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Parity bar | **Equal-quality** | Same objective value within tolerance + same coverage/legality/credit metrics; NOT bit-identical roster. A heuristic+MIP language port cannot be bit-identical once the MIP backend changes; equal-quality is the meaningful guarantee. |
| MIP backend | **HiGHS** via `good_lp` + `highs` crate | Open-source (MIT, passes repo dependency-license policy); fast on block-structured LP/MIP; mature Rust bindings. OR-Tools has no official Rust binding. |
| Port strategy | **Bottom-up + golden fixtures** | Standalone crate; dump each Python module's I/O on the 538 run as frozen oracles; port modules in dependency order; each Rust module validated in isolation. Continuous green, no throwaway glue, no PyO3 in the final product. |
| Rule engine | **`rule-engine-rs` as a path dependency** | Same language → in-process trait call replaces the PyO3 `rust_checker`. |
| Determinism | **Seeded `ChaCha8Rng`** | Reproducible runs for stable baselines. Parity judged on objective+metrics, not assignment identity, so MT-sequence replication is NOT required. |
| Isolation | **git worktree + `rust-pbs-solver` branch** | Repo is shared by concurrent sessions; editing on shared `main` risks uncommitted edits being wiped (see memory `icloud-reverts-tracked-edits`). |

---

## 3. End-State Architecture

A standalone Rust crate at `ro-engine/rust-solver/`, compiling to CLI `rust-solver`, that is a **drop-in replacement** for `python run_solver.py`:

- **Same I/O contract:** reads existing `ro_input.txt` / `ro_input_rule.txt`; emits **byte-compatible `ro_output`**. Nothing downstream changes.
- **Rule engine linked directly:** `rule-engine-rs` is a `[dependencies]` path crate. The `Checker` trait calls `rule_engine_rs::Engine` in-process — no PyO3, no FFI, no C++.
- **Deterministic, seeded** (`ChaCha8Rng`), reproducible.
- **engine-server routing:** end state, the run path (`ro.sh` / `config.yaml`, per memory `ui-kickoff-local-rust-solver`) points at the Rust binary instead of the Python entrypoint. Python and Rust stay swappable behind identical I/O throughout the migration.

### Module dependency DAG (port order)

```
io (parse ro_input / rules)
   → models
      → cost
      → network (pricing subproblem)
         → mip (HiGHS master)
            → generators + strategies/explorers (heuristics)
               → controller (column-gen loop)
                  → io (export ro_output)
rules → rule-engine-rs   (cross-cuts; bound once, called from network/controller)
```

### Crate layout

```
ro-engine/rust-solver/
├── Cargo.toml                # workspace
├── crates/
│   └── solver/               # lib + bin (rust-solver)
│       ├── src/
│       │   ├── io/           # ro_input parse, ro_output export, rule param load
│       │   ├── models/       # Crew, Pairing, Column, Problem (struct-of-arrays)
│       │   ├── cost/         # fly-time, connect-time, fairness, preference
│       │   ├── network/      # pairing network, path generator (pricing)
│       │   ├── mip/          # good_lp/HiGHS master model build + solve
│       │   ├── generators/   # seniority-greedy, random, roster
│       │   ├── strategies/   # column-gen strategies, local search, explorers
│       │   ├── rules/        # Checker trait → rule-engine-rs adapter
│       │   ├── controller.rs # column-gen loop
│       │   └── bin/rust-solver.rs
│       └── tests/            # per-module golden-fixture tests
├── fixtures/scenario-538/    # frozen Python oracle (committed)
│   ├── manifest.json         # seed, config, final objective + metrics
│   ├── io/ models/ cost/ network/ mip/ generators/ strategies/ controller/
│   └── ro_output.golden
└── benches/                  # criterion benches per hot module + e2e
depends on path = "../../rule-engine-rs"
```

---

## 4. Golden-Fixture Validation Harness

The safety net that makes "small steps, never blind-flight" real.

### 4.1 One-time instrumentation (Python, read-only)

Add a `--dump-golden` flag to the Python solver that, during a seeded scenario-538 run, serializes each module's **input and output** at its boundary to `fixtures/scenario-538/<module>/<case>.json`, plus a `manifest.json` (seed, config, final objective, coverage %, total credit, legal-line count). The Python solver is otherwise **unmodified** — the hook only reads and writes fixtures. Fixtures are committed; they are the frozen oracle.

### 4.2 Per-module Rust tests

Each ported module gets a test: load golden input → run Rust → assert against golden output.

| Module class | Modules | Assertion |
|---|---|---|
| **Deterministic** | io-parse, models, cost, network expansion, mip-build | Exact / float-tolerant equality vs fixture |
| **Stochastic** | generators, local-search, controller loop, mip-solve | Aggregate-property equality (objective ± tol, coverage %, credit totals, legal-line count) — NOT identical assignment |

### 4.3 Two-tier acceptance gate

- **Tier (a) — per module:** each Rust module passes its fixture test in isolation. This is continuous green without the whole pipeline running; it is what prevents long blind periods.
- **Tier (b) — assembled binary:** `rust-solver` on scenario 538 lands within the **equal-quality band** of the frozen Python 538 run (objective ± tolerance; coverage/credit/legal-line metrics in-band; `ro_output` parses identically downstream). This is the req-#3 acceptance.

---

## 5. Step Granularity (avoid context / rate-limit deadloops)

Each module is **its own phase**, self-contained and independently verifiable, so one session can finish it without holding the whole codebase in context.

- **Phase = one module.** Inputs: that module's golden fixtures + the Python source. Output: the Rust module + its passing fixture test. A phase depends only on the **typed data on the fixture boundary** of earlier modules, never their internals.
- **Receipt gate per phase:** `cargo test -p solver <module>` PASS pasted before moving on (repo §No-Illusion).
- **DAG-ordered:** a later phase depends only on already-green earlier modules.
- **Big modules are split** into context-safe sub-phases:
  - `io` (4.1k) → rule-param-parser / pairing-parser / crew-parser / ro_output-exporter
  - `generators` (2.6k) → seniority-greedy / random / roster
  - `core` (2.4k) → matrix / on-off-pattern / line-rules / proration (folded into the modules that consume them)
  - `mip` → mip-build (deterministic) / mip-solve (objective parity)

Result: ~12–16 small, ordered, individually-tested phases. Any phase resumable cold from its fixtures.

---

## 6. MIP Backend: OR-Tools → HiGHS

- Master LP solved each pricing iteration; final MIP integerizes over the column pool.
- Rust: `good_lp` modeling + `highs` backend.
- **Equal-quality, not same-vertex:** different solver → different tie-breaking → possibly different optimal basis. Allowed. Assert **objective value** within tolerance + downstream metrics in-band, not identical columns.
- **Split validation:** `mip-build` is deterministic → assert identical constraint/coefficient matrix vs the Python-dumped model on a fixed column-pool fixture. `mip-solve` → assert objective parity on that fixed pool. Isolates "model built right" from "solver picked same optimum."

---

## 7. Performance Enhancements (after parity)

Sequenced **after** correctness parity; re-validate the equal-quality band after each.

1. **Remove the PyO3/serialization boundary** — in-crate, the solver passes `&[Pairing]` to the checker; zero copy, zero per-call interning. Largest win (rule-checking is the hottest inner loop).
2. **Parallel column pricing** — pricing subproblem is per-crew independent → `rayon` across crews (Python GIL forbids this).
3. **Incremental legality state** — keep a mutable `rule-engine-rs` engine; on a single-line local-search edit, incrementally re-check instead of full re-evaluation (engine already models cross-crew COF state — memory `ro-solver-legality-seam`).
4. **Columnar / arena data** — struct-of-arrays `Vec`s with integer indices instead of dict-of-objects → cache-friendly hot loops.
5. **Reproducible perf baseline** — `criterion` bench per hot module + e2e wall-clock on 538, median-of-3 (repo honest-perf convention), captured before/after each optimization so every speedup has a receipt.

---

## 8. Baseline (scenario 538)

- Capture a genuine **seeded** scenario-538 Python run.
- Freeze: `ro_output.golden` + per-module golden dumps + `manifest.json` (objective, coverage %, total credit, legal-line count) under `fixtures/scenario-538/`.
- That frozen run is the parity oracle for both tiers.

---

## 9. Out of Scope (YAGNI)

- Bit-identical roster parity (explicitly rejected — equal-quality only).
- Replicating Python's Mersenne-Twister draw sequence in Rust.
- Multi-scenario baselines (538 only for v1; more added once parity holds).
- Re-architecting the upstream `ro_input` build or downstream gantt/ruletool consumers — the I/O contract is fixed.
- New optimization features/strategies not present in the Python solver.
- Keeping the Python solver alive long-term — it remains only as the fixture oracle during the port.

---

## 10. Acceptance Criteria

1. `ro-engine/rust-solver/` builds (`cargo build --release`) and produces CLI `rust-solver`.
2. Every module phase has a passing golden-fixture test (`cargo test`), receipts pasted.
3. `rust-solver` on scenario 538 produces `ro_output` that parses identically downstream AND lands within the equal-quality band of the frozen Python 538 run (objective ± tol; coverage/credit/legal-line metrics in-band).
4. The solver checks legality via `rule-engine-rs` in-process (no PyO3 in the binary).
5. Perf phase: e2e wall-clock on 538 measured before/after, median-of-3, with receipts; documented speedup over the Python baseline.
6. engine-server run path can invoke `rust-solver` as a drop-in for the Python entrypoint behind the same I/O.
