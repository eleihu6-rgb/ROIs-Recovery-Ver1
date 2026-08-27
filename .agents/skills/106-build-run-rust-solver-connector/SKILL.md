---
name: 106-build-run-rust-solver-connector
description: Build and run the PyO3 connector that exposes the Rust rule engine (rule-engine-rs) to the PBS solver in-process, locally on macOS. Use when scaffolding/iterating the rois_rule_engine_rs extension module, running its pytest, or wiring real rule kernels into Engine.check_line as part of the python-solver↔rust-rule-engine plan.
---

# Build & run the Rust↔PBS-solver connector (PyO3), locally on macOS

The connector makes the PBS column-gen solver call the Rust `rois_rule_engine`
for legality in-process (replacing the loose Python prefilter / fragile C++
path). Plan: `docs/superpowers/plans/2026-06-20-python-solver-rust-rule-engine-plan.md`.
Background: `docs/modules/ro-engine/solver-playbook.md` §5–§9. Memory
[[ro-solver-legality-seam]].

## Why local macOS works (unlike C++)
The Rust engine (`rule-engine-rs`, lib `rois_rule_engine`) is pure-std, so its
PyO3 extension builds and runs natively on this Mac — the C++ `.so` can't load
on darwin (`mode=internal` only). Develop the Rust path here; run C++/full-solve
parity on the remote CoreServer (playbook §9a).

## Layout
- `rule-engine-rs/` — workspace root. `[workspace] members=["py"]`,
  `default-members=["."]` so plain `cargo build/test` only touch the pure engine
  (98 tests). Engine public API in `src/lib.rs`: `check_max_cum_block` (8002),
  `check_roster_spacing` (8056), `check_pilot_age` (8030), `check_base_competency`
  (8004), `check_sdfd_rolling` (7501), `check_consecutive_wocl` (7503),
  `check_min_space_wocl` (7504), `check_credit_band`, + `Violation`, `Application`
  enum, `*_app` PA-tolerant variants, date utils.
- `rule-engine-rs/py/` — the connector crate. `[lib] name="rois_rule_engine_rs"`,
  `crate-type=["cdylib"]`, deps `rois-rule-engine = {path=".."}` + `pyo3` 0.22
  (feature `extension-module`). `Engine` `#[pyclass]` is what Python imports.

## Naming
Extension module = **`rois_rule_engine_rs`** (suffix `_rs`) to NOT collide with
the existing Python pip pkg `rois_rule_engine` (the Python rule engine). Import
as `import rois_rule_engine_rs as rre`.

## Build (maturin → snapshot venv)
maturin must build against the snapshot venv's CPython 3.12 (NOT system python,
which is 3.13 and trips pyo3 0.22's version check). `uv`-managed venv has no pip.

```sh
VENV="pbs-engine/.venv"
# one-time: install maturin into the venv
VIRTUAL_ENV="$(cd "$VENV" && pwd)" uv pip install maturin
# build + editable-install the extension into that venv
cd rule-engine-rs/py
VIRTUAL_ENV="$(cd ../../$VENV && pwd)" "$ABS_VENV/bin/maturin" develop --manifest-path Cargo.toml
```
maturin auto-finds the venv's CPython 3.12 and emits a cp312 wheel. Re-run
`maturin develop` after any Rust change.

## Test
```sh
"$VENV/bin/python" -m pytest rule-engine-rs/py/tests/test_engine_phase0.py -v
cd rule-engine-rs && cargo test            # engine crate, 98 pass (py excluded)
```

## Run a scenario with mode=rust (generates a roster)
`run_local.sh` forces `mode=internal` before `"$@"`; Hydra is last-wins, so append
`rule_engine.mode=rust` to flip it:
```sh
cd pbs-engine
./run_local.sh ./data/114_20260528_171418_614_ro_input.txt ./outputs/local_rust_114 \
  rule_engine.mode=rust
# verify: result.json status/coverage; grep "RustRuleChecker bound" in the log;
# ro_output.txt is the roster. (mode=cpp/hybrid can't run on darwin.)
```

## Status / next
- **Phase 0 DONE** (2026-06-20): FFI boundary — import + `Engine()` + `check_line`.
- **Phase 1 DONE** (2026-06-20): `Engine` owns immutable store (pairings by dense
  idx + crew fixed rosters); `RustRuleChecker(Checker)` in
  `ColumnModelSolver_python/rules/rust_checker.py` wired as `mode:"rust"` in
  `hybrid_checker.py` + exported in `rules/__init__.py`. Receipts: py/tests 8,
  `tests/unit/test_rust_checker_phase1.py` 4, cargo 98, **and a real `mode=rust`
  solve of scenario 114 → optimal, coverage 1.0, 71-crew roster `ro_output.txt`**.
  Caveat: `check_line` still returns `[]`, so legality isn't *enforced* yet
  (`final_global_rule_pass=True` is trivial). 5 pre-existing
  `TestInternalCheckerEndToEnd` fails are unrelated.
- **Phase 2 DONE** (2026-06-20): two enforced per-crew rules in `Engine.check_line`
  over fixed+candidate, `Application::Optimizer` (fixed-only configs tolerated):
  **8002 MAX_CUM_BLOCK** (cumulative block-min, rolling N-day windows; block→UTC
  start day) + **8056 ROSTER SPACING** (consecutive FLY duties gap ≥ SPACE).
  Params config-driven: `rule_engine.rust_block_bands=[[days,limit_min]…]`,
  `rule_engine.rust_spacing_hours`. Receipts: connector py/tests **20**, snapshot
  rust tests **7**, cargo **98**. **Rule bites in a real solve:** scenario 114
  coverage **1.00 → 0.75** when 8002 cap tightened to 10h/28d. Store now carries
  per-pairing start/end/blk/is_fly/label; crew fixed-roster idxs.
- **Rule 3 = 7505 MIN # GDOs** (2026-06-20): days-off floor; RP = dominant
  calendar month from pairings (`_dominant_month_ords`; NOT `period_*_utc` which
  is the 50-day padded window), F8 band 30d→12/31d→13, optimizer PA-ignore.
  Connector py/tests **26**.

## 537 roster-count parity (the convergence test)
Run `mode=rust` on the baseline ro_input (SAME experiment `deploy/prod_0604`,
only the engine differs) and compare flying-pairings-assigned to the C++ baseline
`ro-engine/baseline/scenario-537/output/result.json`:
```sh
./run_local.sh ../../baseline/scenario-537/ro_input.txt outputs/rust_537 rule_engine.mode=rust
# result.json: covered_slots == assigned_pairing_count (flying pairings); coverage_ratio
```
Measured convergence (flying pairings assigned): 2-rule **338** → +7505 **304** →
+8002009 **304** → +7501/3/4 **294** → +7506 **294** → +8004 **293** → +8030 **293**
→ C++ 14-rule **268**. coverage 0.4168→0.3613 vs C++ 0.3305. Per-check Rust 18µs vs
Python 120µs (6.7×); local solve 2.3–11s vs C++ 50.9s (remote).

**ALL 10 violation rules wired+enforced**: 8002006(block), 8002009(DP; loader
`_attach_duty_minutes`→Pairing.dp_minutes), 8056(spacing), 7505(GDOs; RP=dominant
month), 7501(SDFD), 7503(consec WOCL), 7504(WOCL spacing), 7506(one-checkin),
8004(base-comp; loader `_attach_base_quals`→Crew.base_quals), 8030(pilot age;
loader `_attach_crew_demographics`→Crew.division/birth_ord; complement = pairing
baseline crew inverted from fixed rosters + candidate). Infra: per-crew base-TZ
offset (`_base_offset_minutes`, YEG→-360), local-night 2014, WOCL window.
7502/7272=CALC (no violations); 2014/7500=definitions (consumed).

**RULE PARAMS PULLED FROM DB, not hardcoded**: `io/pg_rule_params.py::load_rule_params(103)`
reads PG workset 103 param_json → all connector params; RustRuleChecker uses them
when PG reachable (`params source=PG-103`), else F8_* fallbacks. 8030 AGE DEFINE=65
from DB. Run with DB params: `PG_PASSWORD=.. ./run_local.sh .. rule_engine.mode=rust`.
py/tests **45**, engine cargo **98**, snapshot **11**. Residual gap 25 = simplified
ports (7505 0-leave, 7501 flight-only work, 7503/4 FDP≈duty-span).
**Efficiency:** `bench_check_single.py` → Rust **18µs/check** vs Python Internal
**120µs** (6.7×); local 537 solve Rust **2.7s** vs Internal **5.2s** (C++ 50.9s remote, diff hw).

- **Remaining rules hit a DATA WALL** (store lacks the inputs): 8002009 DP-hours
  (no duty-period minutes), 7501 SDFD / 7503-7504 WOCL (need local-night def 2014
  + base TZ 7500), 7506 one-checkin (crew-local day/TZ), 8004 base-comp
  (crew_base validity ranges; low impact single-base), 8030 age (COF = Phase 3).
  Adding them needs loader changes / Python-derived fields passed to the store.
- **Verdict-level C++ parity** still needs `mode:cpp` (Linux CoreServer only).
  Rule params source of record = PG producer (skill `105`, [[ro-input-rule-serializer]]).

## Gotchas
- Bare `cargo build -p rois-rule-engine-py` fails (grabs system py 3.13) — build
  the cdylib via **maturin** only.
- pyo3 `extension-module` doesn't link libpython; never `cargo test` the py crate.
- Keep the hot `check_line` payload native (i64 + Vec<i64>), no JSON (plan §6).
