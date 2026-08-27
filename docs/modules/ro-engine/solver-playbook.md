# RO Solver Playbook — how the PBS column-generation solver works and where legality is checked

> Audience: anyone wiring a new legality engine (Rust) into the rostering solver, or
> reasoning about its performance. This documents the **observed** behaviour of
> `pbs-engine` as of 2026-06-20, with `file:line`
> anchors so claims are checkable. Where something is inferred rather than read
> directly from code, it is marked **(inferred)**.
>
> Companion docs: `docs/architecture/rule-migration-playbook.md` (C++→Rust rule port),
> memory `ruletool + scenario manday`, `RO solver genuine run artifacts`.

---

> **Current F8 scope:** `ro-engine/` is retained legacy/baseline material. Current F8 PBS optimization work uses `pbs-engine/`; current legality work uses `rule-engine-rs/`.

## 0. TL;DR for the Rust integration

- The solver checks legality through ONE abstraction: the **`Checker`** interface
  (`check_single` / `check_all`) in
  `…/ColumnModelSolver_python/rules/base_checker.py`.
- There are already **three** implementations behind it: `InternalRuleChecker`
  (pure-Python loose prefilter), `CppRegulationChecker` (the real C++ engine via
  ctypes), and `HybridRuleChecker` (mode selector: `internal | cpp | hybrid`).
- **A Rust engine plugs in as a 4th `Checker` implementation.** No solver-loop
  surgery is required — only a new class + a config mode.
- The hot path is **`check_single(crew, pairings)`**, called **per candidate
  column** by the generators and **per candidate pairing AND per column** by the
  network strategy. This is where the "millions of calls / 90% of time" lives.
  It evaluates **per-crew** rules only.
- The **cross-crew / complement** rules (e.g. per-flight pilot-age counts) are
  enforced in **`check_all`** — a *round-based global audit* in `solver.py`, run a
  handful of times (initial + final), **not** per candidate. **(verify — see §8.)**
- Production today runs `rule_engine.mode: "internal"` (the loose Python
  prefilter). The C++ engine exists but is **not** wired into the hot loop,
  almost certainly because of its per-call cost and `_recreate_session()`
  fragility (§6.4). Making an authoritative engine fast enough for the hot loop
  is the whole point of the Rust move.

---

## 1. Repository layout (two solver trees — pick the right one)

```
pbs-engine/
├── ColumnModelSolver_python/            # OLDER tree (data_loader.py, internal_rule_check.py)
└── PBS_column_based_algorithm/          # ★ CANONICAL production tree
    ├── run_solver.py                    # Hydra entry point
    ├── conf/config.yaml                 # rule_engine.mode lives here
    ├── ColumnModelSolver_python/        # the real package
    │   ├── solver.py                    # ColumnModelSolver.run() — orchestration + check_all rounds
    │   ├── controller.py                # ColumnController — the column pool
    │   ├── mip/model.py                 # MIPModel — LP/MIP master, LP duals (pricing)
    │   ├── strategies/                  # network_strategy.py, local_search.py — column generation drivers
    │   ├── generators/                  # seniority_greedy*, random_assignment, roster — build candidate lines
    │   ├── network/                     # pairing_network.py, path_generator.py — pairing DAG + path enumeration
    │   ├── rules/                       # ★ legality seam (base_checker, checker, cpp_checker, hybrid_checker, params)
    │   ├── core/                        # line_rules.py, on_off_pattern.py, proration.py, matrix.py
    │   ├── io/                          # ro_input_parser/builder, loader, exporter, metrics, result_converter
    │   ├── models/                      # crew.py, pairing(in crew.py), column.py, problem.py, result.py
    │   └── cost/                        # cost terms (connect time, fly time, fairness, preference)
    └── api_rule_engine_py/tools/        # C++ bridge: check_rules_ctypes.py + ro_input_only/bridge.py
```

**Always work in `PBS_column_based_algorithm/ColumnModelSolver_python/`.** The
top-level `ColumnModelSolver_python/` is an older snapshot.

The C++ binding the production tree calls lives under
`api_rule_engine_py/tools/` and is identical in spirit to the standalone
`py-rule-engine-cpp-main/` at repo root (the reference packaging of the C++
rule library for Python). See §6.

---

## 2. End-to-end pipeline (`run_solver.py` → `solver.run()`)

`run_solver.py` (Hydra `@hydra.main`, config `conf/config.yaml`):

1. **Load scenario** — `load_from_ro_input(cfg.data, …)` parses a caret-delimited
   `ro_input.txt` into a `Problem` (crews, pairings, pre-assignments) + scenario
   metadata. `run_solver.py:88`.
2. **Build the rule checker** — `HybridRuleChecker(mode, cpp_params)` then
   `bind_problem(problem)`. `run_solver.py:97-120`. Mode comes from
   `cfg.rule_engine.mode`. `bind_problem` computes a **per-crew baseline of
   pre-existing violations** so fixed rosters don't get blamed (§6.3).
3. **Build crew-pairing matrix** — preference weights per (crew, pairing).
   `run_solver.py:128-138`.
4. **Solve** — `ColumnModelSolver(...).run()` (§3).
5. **Export** — `result.json`, `ro_output.txt` (`build_ro_output_from_result`),
   gantt PNG/PDF, credit-hour CSV. `run_solver.py:149-217`.

---

## 3. The solve loop (`ColumnModelSolver.run`, `solver.py:137`)

It is **column generation with a MIP master**, plus rule-enforcement rounds:

```
run():
  _enforce_initial_rule_feasibility()           # solver.py:150  → check_all rounds (global)
  ── column generation, one of three drivers ──
     _run_full_solve()         solver.py:204     # all crews
     _run_batch_solve()        solver.py:224     # per-batch inner MIP
     _run_batch_outer_solve()  solver.py:269     # explore all batches, one MIP per outer iter
       each iteration:
         compute_lp_duals()                       # MIP LP relaxation → dual prices
         _explore_column_pool()  solver.py:651    # → strategy.generate() → HOT check_single calls
         mip_solve()                              # master re-selects columns
  _enforce_assignment_rule_feasibility(assignment) # solver.py:178 → check_all rounds (global)
  build SolveResult
```

Key sub-mechanics:

- **Pricing**: `compute_lp_duals()` feeds LP duals into the generators as
  `cost_info.lp_duals`, so newly generated columns are priced against the current
  master solution (classic column generation). `network_strategy.py:100`.
- **Column pool**: `ColumnController` holds candidate columns per crew; the MIP
  picks one column per crew (a roster line). `controller.py`, `mip/model.py`.
- **Rule-enforcement rounds** (`_run_global_rule_enforcement`, `solver.py:449`):
  run `check_all`, diff new violations vs a baseline (`_collect_new_violations`,
  `solver.py:525`), extract the violating crew ids
  (`_extract_crew_ids_from_violations`, `solver.py:551`), **clear those crews'
  selected columns** (replace with empty, `solver.py:582`), and iterate to the
  next round. This is how cross-crew infeasibility is resolved at the selection
  level, *after* per-line generation.

---

## 4. Data model (`models/crew.py`, `models/column.py`, `models/problem.py`)

```python
Pairing:                       # rank-EXPANDED unit of assignment (models/crew.py:7)
  id: str                      # post-expansion id (single-rank)
  original_pairing_id: str     # pre-expansion id → what the C++ overlay keys on
  blh: float                   # block hours
  start_time_utc, end_time_utc: int   # epoch seconds (end includes rest)
  rank_composition: dict[str,int]     # e.g. {"CA": 1}
  base, assignment_group, assignment: str
  credited_hours: float        # creditedMinutes/60; 0 for reserves
  overlaps(other) -> bool

Roster:  pairing_id: str; is_fixed: bool       # an existing assignment
PreAssignmentTask: id, start/end utc, assignment_group, assignment, label, …
Crew:    id, rank, base, history_fly_hours, seniority, rosters[], preassign_tasks[]
Column:  crew, pairings[]  (+ cost)            # a candidate roster LINE for one crew
Problem: crews[], pairings[], get_pairing(id), period_start_utc, period_end_utc, rule_checker
```

Everything a per-crew legality check needs is already in memory: the `Crew`, the
candidate `Pairing` list, and the crew's fixed rosters (resolved via
`problem.get_pairing`). **A Rust `check_single` only needs `crew_id` + a list of
pairing ids** — the immutable pairing/crew/param data can be loaded into Rust once.

---

## 5. The legality seam — `Checker` (this is what Rust implements)

`rules/base_checker.py`:

```python
@dataclass class CheckRequest:  crew?, pairings[], items[(crew,pairings)]
@dataclass class CheckResult:   valid: bool, violations[], checked_ids[], missing_ids[], meta{}
class Checker:                  check_single(req)->CheckResult ; check_all(req)->CheckResult
```

Three implementations today:

| Class | File | What it is |
|---|---|---|
| `InternalRuleChecker` | `rules/checker.py:331` | Pure-Python **loose prefilter**: overlap, arc rest gap, base consistency, rest-period 7.1, loose max-work-hours 6.2, prorated GDO 6.3, monthly credit ceiling. Per-crew. Fast, approximate. |
| `CppRegulationChecker` | `rules/cpp_checker.py:18` | The **authoritative** C++ engine via `RoInputOnlySession` → `check_rules_ctypes.py` → `libCrewRulePython.so`. |
| `HybridRuleChecker` | `rules/hybrid_checker.py:16` | Mode selector — `internal` / `cpp` / `hybrid`. |

`HybridRuleChecker` modes (`hybrid_checker.py:46`):
- `internal` — Python rules only; C++ never called.
- `cpp` — C++ only.
- `hybrid` — **cascade**: Python prefilter first; call C++ **only when Python
  passes** (kills obviously-bad candidates cheaply before paying for C++).

Selection is config-driven (`conf/config.yaml:113`):
```yaml
rule_engine:
  mode: "internal"          # internal | cpp | hybrid   ← production today = internal
  cpp_lib_path: ".../libCrewRulePython.so"
  cpp_bridge_dir: ".../api_rule_engine_py/tools"
  scenario_id: 0
```
Wired in `run_solver.py:97-120`; the chosen checker is stored as
`problem.rule_checker` and consumed everywhere via that handle.

---

## 6. The C++ engine path (the model the Rust port should learn from and improve on)

### 6.1 Stack
`CppRegulationChecker` → `RoInputOnlySession` (`bridge.py`) →
`RosterSearchChecker` / `CrewRulePythonLib` (`check_rules_ctypes.py`) →
`libCrewRulePython.so` (C ABI `crewrule_py_*`).

The C ABI surface (`check_rules_ctypes.py`): `create(app_id,debug)`,
`set_db_connection`, `initialize_db(scenario_id)` (**loads the whole scenario
into an in-memory `CrewDataContext` once**), `check_crew_ids`,
`apply_pairing_assignments_json`, `check_pairing_assignments_json`,
`export_scenario_snapshot_json`, `release_preassign_rosters_json`,
`clean_roster`, `last_error`, `free_string`, `destroy`.

### 6.2 How a single check is issued (`cpp_checker.py:125`)
- Build a C++ **overlay**: `{ original_pairing_id(int): [{"crewId", "actingRank"}] }`.
- Call `session.check_single_crew(crew_id, overlay)` — the engine merges the
  overlay onto that crew's fixed baseline rosters and evaluates all rules.
- The bridge serializes the overlay with `json.dumps` and parses the violation
  JSON with `json.loads` **on every call** (`check_rules_ctypes.py:150-162`).

### 6.3 Baseline-violation diffing
Both `cpp_checker.py:88` and `InternalRuleChecker.bind_problem` precompute, per
crew, the set of violations that exist on the **fixed** rosters alone, then
**subtract** them from each candidate's violations (`_diff_*`,
`cpp_checker.py:214`, `checker.py:423`). A candidate is rejected only for **new**
violations it introduces. Any Rust checker must reproduce this baseline-diff
semantics or it will reject crews for pre-existing facts.

### 6.4 Why C++ is NOT in the hot loop today — the lessons for Rust
- **Per-call JSON marshalling** (overlay→JSON, violations→JSON) on millions of
  calls. → Rust must pass **integer pairing-id arrays**, not JSON blobs.
- **`_recreate_session()` before every `check_all`** (`cpp_checker.py:72,250`):
  the engine accumulates sliding-window counters (rest / days-off) that
  `clean_roster()` cannot fully reset, so the only reliable way to a clean
  baseline is to **tear down and reload the whole session**. → Rust must make
  per-line checks **stateless** (recompute from the crew's pairing set) so there
  is no counter to leak, and keep any genuine cross-crew state explicit and
  cheaply resettable.
- Process/HTTP per check is a non-starter at this call volume — the integration
  must be **in-process FFI** (PyO3 extension module, or C ABI + ctypes).

---

## 7. Where the calls come from (the hot path, with anchors)

`check_single` (per-crew, HOT):
- `generators/seniority_greedy_ca_fo_layered.py:566` and `:600` — the seniority
  greedy generator, per candidate line it builds.
- `strategies/network_strategy.py:142` — per generated **column** (path) from the
  pairing network.
- `strategies/network_strategy.py:166` — inside `_node_rule_check`, per candidate
  **single pairing** while configuring node/arc validity. (This multiplies call
  count by the number of pairings considered, not just columns.)
- `io/metrics.py:326,329` — post-hoc metrics only (not hot).

`check_all` (cross-crew global audit, COLD-ish):
- `solver.py:409,412` inside `_run_global_rule_check_round`, driven by the
  initial and final enforcement passes (`solver.py:600`, `:634`). Runs in
  **rounds**, a handful of times per solve, not per candidate.

So: the millions of calls are `check_single`; the complement/cross-crew
evaluation is `check_all` and is comparatively rare.

---

## 8. Per-crew vs cross-crew — the one thing to confirm before designing

- **Read from code:** `check_single` evaluates only **per-crew** rules; complement
  rules (per-flight crew-complement counts, anything depending on *other* crews'
  assignments) surface in **`check_all`** during enforcement rounds.
- **Stated by the product owner:** complement rules must be evaluated **during
  each per-line check** against the *current* cross-crew assignment state
  (answer "(b)").

These two views are in tension. **RESOLVED (2026-06-20) in favour of per-line
complement, made cheap by the COF data model — see §8a.**

---

## 8a. COF — the live cross-crew state that makes per-line complement cheap

`ro_input` carries a dedicated **`CrewOnFlight`** (COF) section plus `(COF)`
sidecar copies of the crew master tables. This is the per-flight crew manifest,
and it is the right substrate for complement rules — without the C++ session-leak
problem, because it is an explicit, additive, cheaply-resettable index (not an
opaque sliding-window counter).

- **`CrewOnFlight`** (data sample header, `data/114_…_ro_input.txt:8275`):
  `id, fltId, crewId, actingRank, pairingId, primeActivity, assignment, role,
  subRole, seqOrder, source, scenarioId, dutyId, rosterId, fltDt, division,
  activeRank, position, checkType, …, gender, …, isFirstSeg`.
  Keyed `(crewId, pairingId, fltId)`. → who is on each flight leg, with acting
  rank / division / position / gender.
- **`Crew(N)(COF)` sidecar** (`…:12307`) carries demographics complement rules
  need: **`birthday`** (→ age for the max-age rule), `gender`, `division`,
  `seniorityNum`, plus `CrewRank(COF)`, `CrewBase(COF)`, `CrewFleet(COF)`,
  `CrewQualification(COF)`, `CrewStatus(COF)`, `CrewCertificate(COF)`.
- Crucially, COF includes **crews outside the optimizer's own crew set** (crew
  from other bases / sub-fleets already manifested on shared flights). Complement
  rules must count *all* crew on a flight, so this baseline manifest cannot be
  re-derived from the optimizer's own assignments alone — that is why a separate
  COF model exists.
- The C++ engine's complement rule is **`rule7220 LimitNumberOfCrewOnFlightRule`**
  (`py-rule-engine-cpp-main/.../rule/rule7220/…`); the Rust **8030 pilot-age**
  rule is the same per-flight-complement shape and is already ported (memory
  `rust-rule-engine-8030`).
- Today COF is consumed only at **output** time (`io/result_converter.py:556`,
  `build_ro_output_from_result.py:239`) to carry original flight crew data into
  `ro_output`. It is **not** consulted in the solve loop because the loop runs
  `mode: internal`, which has no complement rules.

**Design consequence:** the Rust checker holds a **mutable COF index**
`fltId → [{crewId, actingRank, division, birthday/age, gender}]`, seeded from the
loaded `CrewOnFlight` + `Crew(COF)` sidecars. `check_single` reads it (hypothetically
adding the candidate crew to the legs its line touches) to fire complement rules;
the solver `commit`s a line by adding that crew to those legs' manifests, and a
rejected candidate simply isn't committed. Explicit add/remove = trivially
resettable, no session rebuild.

## 9. Target shape for the Rust checker (bridge to the implementation plan)

A new `RustRuleChecker(Checker)` alongside the existing three:

- **Load once**: hand the immutable scenario to Rust a single time — all pairings
  (by id: times, blh, base, credited hours, assignment group), crew attributes,
  rule params, and definitions (base timezones, local-night band). This can be
  fed from the **new Python `ro_input` pipeline** (`io/ro_input_parser.py`,
  `io/ro_input_builder.py`) or read directly by Rust; it is **not** in the hot
  path, so the choice is about effort, not speed.
- **Hot call**: `check_single(crew_id, [pairing_id…]) -> violations` — tiny
  integer payload in, small violation list out, **no JSON per call**. Rust
  assembles the crew timeline from the loaded data and runs the **per-crew rule
  kernels that already exist** in `rule-engine-rs/src/lib.rs`
  (`check_max_cum_block`, `check_roster_spacing`, credit band, SDFD, WOCL, GDO,
  one-checkin-per-day, …). Reproduce the **baseline-diff** semantics (§6.3).
- **Audit call**: `check_all(items)` — evaluate complement/cross-crew rules over
  the submitted overlay (and only here, if §8 resolves to option 1).
- **FFI**: either PyO3 (build `rois_rule_engine` as a Python extension module via
  maturin) or a C ABI mirroring `crewrule_py_*` so the existing ctypes wrapper
  style is reusable. (Decision pending.)
- **Anti-patterns to avoid** (from §6.4): per-call JSON; any per-line mutable
  counter that needs a session rebuild; subprocess/HTTP per check.

The 14 rules are already ported and C++-validated in `rule-engine-rs` (see the
rule-migration memories / `docs/architecture/rule-migration-playbook.md`). The
**new** work is the in-process FFI boundary, the once-loaded immutable scenario
store, the per-crew orchestrator that runs all applicable rules and merges
violations, and the baseline-diff layer — *not* re-deriving the rule math.

### 9b. Rule input producer — PG `param_json` → `ro_input_rule.txt` (DONE, validated)

So both engines (C++ today, Rust next) consume the **same** maintained ruleset,
the rule-input file is generated from PG (`f8.rule.param_json`, PBS-solver
workset **103**) rather than relying on a stale `ro_input` from the remote:

- `ColumnModelSolver_python/io/ro_input_rule_writer.py` — pure serializer
  (`RuleMeta`/`RuleLine`, `rules_from_param_json`, `serialize_lines`) + reverse
  `parse_ro_input_rule` (diff oracle). The on-disk line format is byte-exact
  (real tabs after the composite id and `func:%08d`; `   \t\t` before `params:`;
  UPPERCASE alpha-sorted `KEY=VALUE, ` tail with a trailing `, `).
- `ColumnModelSolver_python/io/pg_ruleset_to_ro_input.py` — PG loader + diff CLI.
  Join `(function||lpad(instance,3))::bigint = rule_set.rule_id`, filter
  `rule_set.workset_id`. `rule` has **no `phase`** column (baseline is uniformly
  `phase:1`); `talbe` base index is 0 except **7500002 → 1**.
- Tests: `tests/unit/test_ro_input_rule_writer.py` (round-trips the
  `ro-engine/baseline/scenario-537/ro_input_rule.txt` C++ oracle byte-for-byte).
- **Validation:** PG-103 vs scenario-537 → 51/51 lines, 45 byte-identical; the
  only 6 diffs are the known deliberate value tweaks (7502002, 7503003, 8030004,
  8056006) + cosmetic `CREW TEAMS`↔`TEAMS` on 7505002/7506002. The team-key
  inconsistency is a PG `param_json` migration bug — reconcile in **data**, the
  serializer stays a faithful transform. See skill `105-compare-ruleset-params`.

---

## 9a. Running the solver — remote CoreServer (current deployment)

Production runs are **kicked off on the remote CoreServer**, not locally. The C++
rule library (`libCrewRulePython.so`, needed for `mode: cpp`/`hybrid` and for
parity testing) only exists there, so any C++↔Rust parity work must run here too.

### Topology
- **Gateway** `webserver-01` = **47.89.181.217** (public; internal `10.15.12.2`) —
  nginx only (22/80/443). Not the solver host.
- **CoreServer** `coreserver-01` = **10.15.12.3** (internal-only, reachable from
  the gateway) — the real backend (engine-server :3003, Java :8011, solver).

### Login (jump host; password supplied per-session, NOT stored in repo/docs)
`webserver-01` has no `sshpass`, so nest via SSH **ProxyJump + askpass**:
```sh
cat > /tmp/.ap.sh <<'X'
#!/bin/sh
echo "<PASSWORD>"          # supplied per-session; never commit
X
chmod +x /tmp/.ap.sh
export SSH_ASKPASS=/tmp/.ap.sh SSH_ASKPASS_REQUIRE=force DISPLAY=:0
ssh -o StrictHostKeyChecking=accept-new -J root@47.89.181.217 root@10.15.12.3 'bash -s' <<'EOF'
  ...commands...
EOF
rm -f /tmp/.ap.sh
```
(For the gateway hop alone, local `sshpass -e ssh root@47.89.181.217` also works.)
See memory `remote-solver-server-topology` for the authoritative, current details.

### Kick off a run
Solver dir: `coreserver-01:/home/piercrew/software/rostering_algorithm/PBS_column_based_algorithm/`.
Entry is `run_pipeline.sh` (Ansible-managed; do not hand-edit on the host):
```sh
# Usage: run_pipeline.sh <ro_input_path> <output_dir>
./run_pipeline.sh ./data/<scenarioId>_<ts>/ro_input.txt ./output
```
which runs (conda env **`flair-pbs-env`**, experiment **`deploy/prod`**):
```sh
conda run -n flair-pbs-env python run_solver.py \
  +experiments=deploy/prod \
  data=<RO_INPUT> pref_dir=<RO_DIR> \
  rule_engine.working_directory=<RO_DIR> \
  hydra.run.dir=<OUTPUT_DIR>
```
- `rule_engine.working_directory` is derived from the ro_input's parent dir (must
  contain the `ro_input_*` siblings + the C++ scenario files).
- The experiment overlay (`conf/experiments/deploy/prod.yaml`) sets the real
  `rule_engine.mode` and `cpp_lib_path` for the host. To compare engines, override
  on the CLI, e.g. `rule_engine.mode=cpp` or `rule_engine.mode=rust`.

### Where outputs land
Per-run dir `.../data/<scenarioId>_<YYYYMMDD_HHMMSS>/output/`:
`ro_output.txt`, `result.json` (native structured result — best oracle for a
port), `all_columns.json`, `crew_pairing_matrix.csv`, gantt PNG/PDF.
Committed scenario-6 baseline for porting: `ro-engine/baseline/scenario-6/`
(memory `ro-solver-genuine-run-artifacts`).

### Local runs (for observing call patterns only)
`mode: internal` needs no C++ `.so` and no DB, so it can run on a dev box against
the in-repo data (`PBS_column_based_algorithm/data/114_*_ro_input.txt`). Caveat:
requires the `requirements.txt` deps (hydra-core, omegaconf, loguru, ortools,
tqdm, pandas) in a venv; not installed by default. `mode: cpp` cannot run locally
(no Linux `.so`).

## 10. Key files index (clickable)

| Concern | File |
|---|---|
| Entry point | `…/PBS_column_based_algorithm/run_solver.py` |
| Config (rule mode) | `…/conf/config.yaml:113` |
| Solve orchestration + check_all rounds | `…/ColumnModelSolver_python/solver.py` |
| Checker interface | `…/rules/base_checker.py` |
| Python loose rules | `…/rules/checker.py` |
| C++ checker | `…/rules/cpp_checker.py` |
| Mode selector | `…/rules/hybrid_checker.py` |
| Rule params | `…/rules/params.py` |
| Hot generator | `…/generators/seniority_greedy_ca_fo_layered.py:566,600` |
| Hot network strategy | `…/strategies/network_strategy.py:142,166` |
| Data models | `…/models/crew.py`, `…/models/column.py`, `…/models/problem.py` |
| ro_input pipeline (new) | `…/io/ro_input_parser.py`, `…/io/ro_input_builder.py` |
| C++ bridge | `…/api_rule_engine_py/tools/check_rules_ctypes.py`, `…/tools/ro_input_only/bridge.py` |
| Rust rule kernels | `rule-engine-rs/src/lib.rs`, `rule-engine-rs/src/bin/check_*.rs` |

---

## 11. Open questions to close before/while planning

1. **§8** — per-line complement evaluation (mutable overlay) vs per-crew hot
   check + periodic `check_all` audit. Pivotal.
2. **FFI mechanism** — PyO3 extension vs C ABI + ctypes.
3. **Scenario load into Rust** — from the Python `ro_input` pipeline (hand over
   parsed structures) vs Rust reads `ro_input.txt` directly.
4. **Parity bar** — must Rust match C++ violation-for-violation, or match the
   *loose Python prefilter* the hot loop uses today, or be the new authoritative
   reference? This sets the acceptance test.
5. **Rule coverage in the hot path** — confirm which of the 14 rules are per-crew
   (hot-eligible) vs complement-only (`check_all`).
