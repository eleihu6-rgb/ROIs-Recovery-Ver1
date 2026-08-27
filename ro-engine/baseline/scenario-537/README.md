# RO solver baseline — Scenario 537 (genuine run, **C++ rule-engine reference**)

Authoritative input/output baseline for the **Python solver → Rust rule-engine connector**
(plan `docs/superpowers/plans/2026-06-20-python-solver-rust-rule-engine-plan.md`,
seam `docs/modules/ro-engine/solver-playbook.md`). Unlike `scenario-6/` (a port-target
for the solver itself), this baseline's primary value is the **C++ legality output** that
the Rust port must reproduce — captured live while the C++ engine ran.

These are the **actual files produced by the production column-gen solver**, not a
reconstruction. The run went through the **engine-server LegacyRO path** (not a direct
`run_pipeline.sh`), pulled from CoreServer (`10.15.12.3`):

```
/home/yuan.z/rois/rois-ai/engine-server/complete/F8/537/
  (workspace was .../workspace/F8/LegacyRO_537_20260620_105515_91becc22/)
```

Scenario 537 = "Copy of RO-2026-06 YEG Test" (workset 517, ruleSetId 103, division P,
YEG / 737), ruleGroupCode **`pbs_solver_ruleset`**, status **DONE**.
Run timestamp 2026-06-20 10:55, completed 10:56. **24 crew** in the solver assignment
(26 in the C++ `calculateManday` context), June 2026 roster period.

## Effective run config (verified from `output/.hydra/`)

| Key | Value |
|---|---|
| experiment | `+experiments=deploy/prod_0604` |
| **`rule_engine.mode`** | **`hybrid`** — Python prefilter (`InternalRuleChecker`) → C++ (`CppRegulationChecker`) only when Python passes. (Base `conf/config.yaml` defaults `internal`; the prod experiment overrides to `hybrid`.) |
| `cpp_lib_path` | `…/api_rule_engine_py/tools/ro_input_only/rule_cpp_build/build/libCrewRulePython.so` (44 MB, built 2026-06-11) |
| `cpp_bridge_dir` | `…/api_rule_engine_py/tools` |
| `rule_engine.scenario_id` | `114` (C++ engine's internal scenario id, not 537) |
| `working_directory` | the `LegacyRO_537_…` workspace |

The seam: `run_solver.py` builds `problem.rule_checker = HybridRuleChecker(mode, cpp_params)`
then `.bind_problem(problem)`. `HybridRuleChecker` (`ColumnModelSolver_python/rules/hybrid_checker.py`)
composes `InternalRuleChecker` + `CppRegulationChecker` and implements the `Checker` ABC
(`bind_problem` / `check_single` / `check_all`). **Rust slots in as the `.cpp` member (or a 4th
`mode=rust`) implementing the same ABC.**

## C++ rule-engine evidence (the point of this baseline)

| File | Role |
|---|---|
| `logs/rule.log` | The **C++ engine's own log** (`libCrewRulePython.so`). Shows `CrewDataContext` build, `loadDataCsv` (~58 s), and `initRule ruleSetId:-1, ruleId size:14` → the **14 F8 rules** the engine loaded: `2014, 7272, 7500, 7501, 7502, 7503, 7504, 7505, 7506, 8002, 8004, 8030, 8056` (13 calculators registered; `7500` is a definition). These are exactly the 14 rules being ported to Rust. |
| `output_rules.txt` | The **C++ legality output** — violation codes fired this run (the Rust-port oracle). |
| `ro_input_rule.txt` / `LINE_RULES.csv` / `LINE_RULES_README.md` / `ro_rule_8014.txt` | Rule config / definitions fed to the engine. |

### Violation baseline (`output_rules.txt`, 51 violations)

| Code | Count | Code | Count |
|---|---|---|---|
| 7505002 | 27 | 7501004 | 2 |
| 8004004 | 3 | 8056006 | 1 |
| 8002009 | 3 | 8030004 | 1 |
| 8002006 | 3 | 7506002 | 1 |
| 7502002 | 3 | 7504003 | 1 |
| 7500002 | 3 | 7503003 | 1 |
| | | 7272001 | 1 |
| | | 2014014 | 1 |

> Note `err.log` records benign `invalid rank——position data, rank=` warnings (empty rank
> on PIC/SIC/RP/SO/OBS/PU/FA/AM) — a known data-quality issue, not a run failure.

## Solver result baseline (`output/result.json`)

`status=optimal`, `coverage_ratio=0.3305` (268/811 slots covered, 543 uncovered, 77 fixed),
`objective_value=5.5768e8`, `solve_time=50.86 s` (explore 33.95, mip 0.03), `columns_in_pool=24`,
`award_satisfied=64/1112`, `avoid_satisfied=925/928`, `fairness_std=0.0`.
**`initial_global_rule_pass=True` and `final_global_rule_pass=True`, `violation_delta=0`** —
the assigned roster is globally legal under the C++ engine (the per-column violations in
`output_rules.txt` are filtered out during column generation). 24 crew, 183 pairings.

## Files

| File | Format | Role |
|---|---|---|
| `ro_input.txt` | legacy `------Section(N):…^…` | Solver **input** (native, 4.8 MB). |
| `output/ro_output.txt` | legacy `------Section(N):…^…` | Solver **output** (native). Sections `Scenario(1)`, `Roster(620)`, `RosterFlight(…)`. |
| `output/result.json` | JSON | Solver's **raw native result** (see above). Best ground-truth for the solver port. |
| `input.gz` | `## SECTION` CSV | Input in new gz format. |
| `output.gz` | `## ASSIGNMENTS/ROSTER/KPI/RESULT_META` CSV | Output in gz format. |
| `output/all_columns.json` | JSON | Column pool the column-gen produced. |
| `output/crew_pairing_matrix.csv` | CSV | Crew×pairing eligibility/cost matrix. |
| `output/result_crew_award_satisfaction.csv` | CSV | Per-crew award/avoid satisfaction. |
| `output/credit_hour_report.csv` | CSV | Per-crew credit-hour report. |
| `output/run_solver.log` | log | Hydra `run_solver.py` log. |
| `output/.hydra/{config,hydra,overrides}.yaml` | YAML | **Resolved run config** — the source of the effective-config table above. |
| `logs/rule.log` | log | **C++ rule engine log** (see C++ evidence section). |
| `output_rules.txt` | text | **C++ violation codes** (the Rust-port oracle). |

## Relationship to `scenario-6/`

`scenario-6/` is the baseline for porting the **solver** (coverage/objective/assignment).
`scenario-537/` adds what scenario-6 lacked: the **C++ rule-engine artifacts** (`logs/rule.log`
+ `output_rules.txt`) produced while `rule_engine.mode=hybrid` actually invoked the C++ `.so`.
Use this pair when building and validating the **Rust legality connector** (Phase 2 of the plan:
rule 8002 + C++ parity).
