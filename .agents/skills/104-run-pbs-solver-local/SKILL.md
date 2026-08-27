---
name: 104-run-pbs-solver-local
description: Run the PBS column-gen RO solver locally on macOS (the env that hosts the Python→Rust rule-engine connector). Use when the user wants to kick off a solver run locally, set up / fix the local solver venv, or run a scenario through the pbs-engine submodule without the remote CoreServer.
---

# Run the PBS solver locally (macOS)

pbs-engine submodule: `pbs-engine/`.
This is the local env for building/validating the Rust legality connector. Pairs with
`103-capture-ro-solver-baseline` (remote baselines) and the scenario-537 parity oracle.

## Key constraints
- **No C++ on darwin.** `libCrewRulePython.so` is a Linux build → cannot load on macOS.
  Always run **`rule_engine.mode=internal`** (pure-Python legality). All `deploy/*`
  experiments set `mode: hybrid`, so it MUST be overridden on the CLI. The future Rust
  engine plugs in as a new `mode=rust` in `ColumnModelSolver_python/rules/hybrid_checker.py`
  (same `Checker` ABC: `bind_problem`/`check_single`/`check_all`).
- **System Python is too new** (3.14) for the `ortools==9.15` wheel. Use a **3.12** venv.
- **iCloud path breaks Hydra.** Repo path has spaces + `~` (`com~apple~CloudDocs`). Hydra's
  override grammar rejects them → `LexerNoViableAltException`. Wrap every path override in
  Hydra single-quotes: `"data='$RO_INPUT'"`, `"pref_dir='$RO_DIR'"`, etc.

## One-time env setup
```sh
cd pbs-engine
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
```

## Running
Use the local wrapper `run_local.sh` (already present; do NOT use the Ansible-managed
`run_pipeline.sh`, which has `/home/piercrew/...` paths + `conda run -n flair-pbs-env`):
```sh
./run_local.sh <ro_input.txt> <output_dir> [extra hydra overrides...]
# e.g.
./run_local.sh ./data/114_20260528_171418_614_ro_input.txt ./outputs/local_smoke_114
```
It forces `rule_engine.mode=internal`, uses `+experiments=deploy/prod_0604`, and quotes paths.

## Verify (per §No-Illusion — run it, don't claim it)
```sh
.venv/bin/python -c "import json;d=json.load(open('<output_dir>/result.json'));\
print(d['status'], d['coverage_ratio'], d['final_global_rule_pass'], len(d['assignment']))"
grep -A1 'rule_engine:' <output_dir>/.hydra/config.yaml   # confirm mode: internal
```
A good run: `status=optimal`, `final_global_rule_pass=True`, full artifact set
(`result.json`, `ro_output.txt`, `all_columns.json`, `crew_pairing_matrix.csv`, gantt, credit_hour_report.csv).

## Gotchas
- Most `data/*` subdirs are empty (gitignored). Present full inputs: `data/114_…ro_input.txt`
  and the `ro-engine/baseline/scenario-537/` capture. To run a NEW scenario you need its
  `ro_input.txt` — there is no local DB→ro_input generator (that lives in the remote
  engine-server). Get the file, then point `run_local.sh` at it.
- First run builds the matplotlib font cache (slow once, then fine).
- `run_solver.log` may be 0 bytes; loguru logs go to stdout + the run summary table.
