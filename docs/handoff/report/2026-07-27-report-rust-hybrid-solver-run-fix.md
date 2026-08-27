# Report PBS Solver rust-hybrid Run Fix - 2026-07-27

## Context

Report Unit Test page symptom:

- User clicks `Run PBS Solver`.
- API returns 200 and starts a solver subprocess.
- UI remains at `No schedule yet - run the scenario to generate the roster.`

Affected environments checked:

- Local/UAT host: `/home/rois/Flair_PBS_Optimization_Report`
- SIT host: `yuan.z@10.15.12.4:/home/rois/Flair_PBS_Optimization_Report`

Important requirement from the user:

- UAT and SIT must keep `RULE_ENGINE_MODE=rust-hybrid`.
- Do not solve this by falling back to `internal`.

## Root Causes Found

There were multiple sequential failures hidden behind the same UI symptom.

1. Solver Python dependency drift
   - The report redeploy script updated report frontend/backend files but did not sync solver Python requirements.
   - SIT failed at import time:
     `ModuleNotFoundError: No module named 'pyarrow'`

2. Rust ground-rest strict classification
   - `rust-hybrid` failed when roster ground assignment used `GRD`.
   - `ro_input.txt` Assignment master had `GND`, not `GRD`.
   - Existing code had `_LEGACY_WORK_ASSIGNMENTS = {"GRD"}`, but it checked `missing from Assignment` before applying this fallback.
   - Failure:
     `ValueError: unknown ground rest classifications: [{'assignment': 'GRD', ... 'missing from Assignment'}]`

3. Invalid unused airport timezone
   - `Airport WLO` had `zoneId='UA'`.
   - Rust timezone builder parsed every Airport row and failed before knowing whether that airport was used.
   - Failure:
     `ValueError: Airport WLO has invalid zoneId='UA'`

4. SIT PyO3 extension version drift
   - Python solver passed `pairing_assignment_type`.
   - SIT installed `rois_rule_engine_rs` extension had an older `Engine` signature without that argument.
   - Failure:
     `TypeError: Engine.__new__() got an unexpected keyword argument 'pairing_assignment_type'`

## Files Changed

### Report service scripts

Local/UAT:

- `/home/yuan.z/rois/rois.sh`
- `/home/rois/redeploy-report.sh`

SIT:

- `yuan.z@10.15.12.4:/home/yuan.z/rois/rois.sh`
- `yuan.z@10.15.12.4:/home/rois/redeploy-report.sh`

Required script behavior:

- Keep `REPORT_RULE_ENGINE_MODE="${REPORT_RULE_ENGINE_MODE:-rust-hybrid}"`.
- In `redeploy report`, after frontend dependency install, run solver dependency sync:
  - `$REPORT_SOLVER_PYTHON -m pip install -r "$REPORT_ALGO_REPO/requirements.txt"`
  - smoke import `hydra`, `ortools`, `pyarrow`
  - rebuild/reinstall Rust PyO3 extension with `maturin develop --release`
  - smoke check `rois_rule_engine_rs.Engine` signature contains `pairing_assignment_type`

### Solver code

Local and SIT:

- `/home/rois/PBS_column_based_algorithm-main/ColumnModelSolver_python/rules/rust_ground_rest.py`
- `/home/rois/PBS_column_based_algorithm-main/ColumnModelSolver_python/rules/rust_crew_timezone.py`
- `/home/rois/PBS_column_based_algorithm-main/tests/unit/test_rust_ground_rest.py`
- `/home/rois/PBS_column_based_algorithm-main/tests/unit/test_rust_crew_timezone.py`

Behavior changes:

- `rust_ground_rest.py`
  - If an assignment is missing from Assignment master, check `_legacy_assignment_flag(assignment)`.
  - Only known legacy assignments such as `GRD` are allowed to fall back.
  - Unknown missing assignments still fail.

- `rust_crew_timezone.py`
  - Invalid Airport `zoneId` is now logged and skipped.
  - This prevents unused bad airport rows such as `WLO/UA` from blocking the solver.
  - A used crew base with no known timezone still fails later, as it should.

## Restore If Overwritten

If report redeploy or solver pull overwrites the fix, restore in this order.

1. Confirm service remains `rust-hybrid`.

```bash
grep -n 'REPORT_RULE_ENGINE_MODE' /home/yuan.z/rois/rois.sh /home/rois/redeploy-report.sh
pid=$(pgrep -f 'uvicorn app.main:app.*5101' | head -1)
tr '\0' '\n' < /proc/$pid/environ | grep -E '^(RULE_ENGINE_MODE|SOLVER_PYTHON|ALGO_REPO)='
```

Expected:

```text
REPORT_RULE_ENGINE_MODE="${REPORT_RULE_ENGINE_MODE:-rust-hybrid}"
RULE_ENGINE_MODE=rust-hybrid
```

2. Re-apply solver code fixes.

Use the behavior in this document as the source of truth:

- `GRD` missing from Assignment master must use legacy work fallback.
- Invalid unused Airport timezone must warn and skip.

3. Reinstall solver Python requirements and PyO3 extension.

UAT/local:

```bash
/home/rois/redeploy-report.sh
```

SIT:

```bash
ssh yuan.z@10.15.12.4 '/home/rois/redeploy-report.sh'
```

If only rebuilding PyO3 manually on SIT:

```bash
ssh yuan.z@10.15.12.4 '
cd /home/rois/PBS_column_based_algorithm-main/rois-rule-engine-rs/rule-engine-rs/py &&
PATH=/home/yuan.z/.cargo/bin:$PATH \
CARGO_TARGET_DIR=/home/yuan.z/rois/sit/build-cache/report-rule-engine-rs-target \
VIRTUAL_ENV=/home/yuan.z/rois/sit/ro-engine/pbs-rostering-solver-snapshot/PBS_column_based_algorithm/.venv \
/home/yuan.z/rois/sit/ro-engine/pbs-rostering-solver-snapshot/PBS_column_based_algorithm/.venv/bin/python3 -m maturin develop --release
'
```

## Verification Receipts

Local/UAT:

```bash
/home/rois/redeploy-report.sh
```

Result:

- PASS
- API 5101 running
- frontend 5174 running
- `RULE_ENGINE_MODE=rust-hybrid`

Local solver API smoke:

```bash
POST http://127.0.0.1:5101/api/unittest/scenario/Test_2/run
```

Result:

- `done 0`
- generated:
  - `/home/rois/Flair_PBS_Optimization_Report/unit_test/Test_2/outputs/ro_output.txt`
  - `/home/rois/Flair_PBS_Optimization_Report/unit_test/Test_2/outputs/result.json`
  - `/home/rois/Flair_PBS_Optimization_Report/unit_test/Test_2/outputs/credit_hour_report.csv`

SIT:

```bash
ssh yuan.z@10.15.12.4 '/home/rois/redeploy-report.sh'
```

Result:

- PASS
- API 5101 running
- frontend 5174 running
- `RULE_ENGINE_MODE=rust-hybrid`

SIT solver API smoke:

```bash
POST http://127.0.0.1:5101/api/unittest/scenario/JenTest/run
```

Result:

- `done 0`
- report data:
  - `schedule_gantt.crews=5`
  - `schedule_gantt.demand=647`
- generated:
  - `/home/rois/Flair_PBS_Optimization_Report/unit_test/JenTest/outputs/ro_output.txt`
  - `/home/rois/Flair_PBS_Optimization_Report/unit_test/JenTest/outputs/result.json`
  - `/home/rois/Flair_PBS_Optimization_Report/unit_test/JenTest/outputs/credit_hour_report.csv`

Unit tests:

```bash
cd /home/rois/PBS_column_based_algorithm-main
/home/yuan.z/rois/rois-ai/ro-engine/pbs-rostering-solver-snapshot/PBS_column_based_algorithm/.venv/bin/python3 \
  -m pytest tests/unit/test_rust_ground_rest.py tests/unit/test_rust_crew_timezone.py -q
```

Result:

- Local/UAT: `15 passed`
- SIT: `15 passed`

## Known Non-Blocking Issues

- `npm ci` reports `2 vulnerabilities (1 low, 1 high)`.
- This is not the cause of `Run PBS Solver` producing no result.
- It should be handled separately as dependency audit work.
