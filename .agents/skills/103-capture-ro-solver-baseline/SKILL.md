---
name: 103-capture-ro-solver-baseline
description: Capture a genuine PBS column-gen RO solver run (+ its C++ rule-engine artifacts) from the remote CoreServer as a baseline under ro-engine/baseline/scenario-<N>/, for porting the solver/legality to Rust. Use when the user kicks off a real solver run on CoreServer for a scenario id and wants the input/output/result.json + C++ rule.log/violation codes pulled down as the parity oracle.
---

# Capture an RO solver baseline from CoreServer

Pulls the **actual files a production column-gen solver run produced** (not a reconstruction)
into `ro-engine/baseline/scenario-<N>/`, mirroring `ro-engine/baseline/scenario-6/`. The
prize is the **C++ rule-engine evidence** (`logs/rule.log` + `output_rules.txt`) — the oracle
the Rust legality port must reproduce. Background: `docs/modules/ro-engine/solver-playbook.md`,
plan `docs/superpowers/plans/2026-06-20-python-solver-rust-rule-engine-plan.md`.

## 0. Before you start
- Get the **SSH password** from the user (per-session, never stored).
- Confirm the run is **kicked off** and get the **scenario id**. The id the user says may
  be corrected mid-run (we expected "536", it was "537") — always verify against the server.

## 1. Login (ProxyJump + askpass — webserver-01 has no sshpass)
```sh
cat > /tmp/.ap.sh <<'X'
#!/bin/sh
echo "<PASSWORD>"
X
chmod +x /tmp/.ap.sh
export SSH_ASKPASS=/tmp/.ap.sh SSH_ASKPASS_REQUIRE=force DISPLAY=:0
ssh -o StrictHostKeyChecking=accept-new -J root@47.89.181.217 root@10.15.12.3 'bash -s' <<'EOF'
  ...commands...
EOF
rm -f /tmp/.ap.sh
```
Topology: gateway `webserver-01` 47.89.181.217 → `coreserver-01` 10.15.12.3 (real backend).

## 2. Find the run — TWO possible paths
A run reaches the server one of two ways. Check both:
- **Direct `run_pipeline.sh`** → `…/rostering_algorithm/PBS_column_based_algorithm/data/<N>_<ts>/`
  (this is where `scenario-6` came from).
- **engine-server LegacyRO** (the gantt UI / API path) → workspace
  `…/engine-server/workspace/F8/LegacyRO_<N>_<ts>_<taskid>/`, archived on completion to
  `…/engine-server/complete/F8/<N>/`. Confirm via `tail engine-server/logs/app.log`
  (look for `scenarioId=<N> status=DONE` + `归档到 …/complete/F8/<N>`).

engine-server lives at `/home/yuan.z/rois/rois-ai/engine-server` (uvicorn :3003).
If nothing matches the scenario id, **say so** — don't fabricate; the run may be queued,
still generating `ro_input.txt`, or the id may be wrong.

## 3. Verify the C++ seam (the deliverable, not just file-copying)
From the run's `output/.hydra/`:
- `overrides.yaml` → which `+experiments=…` was used + the `data=`/`pref_dir=` paths.
- resolved `config.yaml` `rule_engine:` block → **the effective `mode`**. Base
  `conf/config.yaml` defaults `internal`; prod experiments override to **`hybrid`**
  (Python prefilter → C++ only when Python passes). Report the mode you actually saw.
- `logs/rule.log` is the **C++ engine's own log** — confirm it fired: look for
  `initRule … ruleId size:N, list:…` (the 14 F8 rules: 2014,7272,7500,7501,7502,7503,7504,
  7505,7506,8002,8004,8030,8056) and `Start Rule Engine`.
- `output_rules.txt` = the **C++ violation codes** for this run (the Rust-port oracle).

The seam in code: `run_solver.py` → `HybridRuleChecker(mode, cpp_params)` (in
`ColumnModelSolver_python/rules/hybrid_checker.py`) composes `InternalRuleChecker` +
`CppRegulationChecker`, implementing the `Checker` ABC (`bind_problem`/`check_single`/`check_all`).
Rust plugs in as the `.cpp` member or a 4th `mode=rust`.

## 4. Copy the baseline (selective tar streamed over the ProxyJump)
```sh
mkdir -p ro-engine/baseline/scenario-<N>
ssh … 'cd …/complete/F8/<N> && tar czf - \
   ro_input.txt input.gz output.gz err.log output_rules.txt \
   ro_input_rule.txt LINE_RULES.csv LINE_RULES_README.md ro_rule_8014.txt logs/rule.log \
   output/ro_output.txt output/result.json output/all_columns.json \
   output/crew_pairing_matrix.csv output/result_crew_award_satisfaction.csv \
   output/credit_hour_report.csv output/run_solver.log output/.hydra 2>/dev/null' \
  | tar xzf - -C ro-engine/baseline/scenario-<N>/
```

## 5. Verify integrity + write README
- `python3 -c "import json;json.load(open('output/result.json'))"` (valid + grab
  status/coverage_ratio/objective_value/solve_time).
- `sort output_rules.txt | uniq -c | sort -rn` (the violation-count table).
- Write `README.md` mirroring `ro-engine/baseline/scenario-6/README.md` PLUS an
  effective-run-config table and a **C++ evidence** section (rule.log + output_rules.txt) —
  that's what makes a 537-style baseline more than a scenario-6 copy.
- Update the handoff memory + `MEMORY.md` index line.

## Gotchas
- Files named `ro_input.gz`/`ro_output.gz` are the solver's NATIVE `^`-delimited format,
  NOT the `## CSV` gz — don't confuse them with `input.gz`/`output.gz`.
- `rule_engine.scenario_id` in the config is the C++ engine's internal id (e.g. 114), not
  the ROIS scenario id.
- `err.log` `invalid rank——position data, rank=` warnings are benign data-quality noise.
- Times in the remote logs are server-local; local `ls` may show a TZ-shifted mtime.
