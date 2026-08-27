# Engine Report Scenario Cleanup Spec

## Request

After an optimization finishes and its report materials are copied into the report directory, run one more operation: clean optimization scenario materials older than 3 days under the report directory.

## Current Behavior

- `engine-server/src/tasks/task_manager.py` exports report materials in `Task._export_to_report_scenario()`.
- The destination root is controlled by `PBS_REPORT_SCENARIO_DIR`.
- Each export creates a new subdirectory named `{scenario_id}_{YYYYmmdd_HHmmss}`.
- Export is best-effort: failures are logged and do not fail the optimization.
- Main scenario artifacts are still archived under `complete/<airline>/<scenario_id...>/`; the report copy is secondary.

## Proposed Behavior

- Keep the existing export flow unchanged.
- After a successful copy attempt into `PBS_REPORT_SCENARIO_DIR`, clean only direct child directories of that same report root whose mtime is older than 3 days.
- Delete the full old scenario-material directory with `shutil.rmtree`.
- Ignore non-directories and leave files untouched.
- Log cleanup count when anything is removed.
- Treat cleanup as best-effort: cleanup errors must not fail optimization completion or result callback.

## Scope

- Runtime code: `engine-server/src/tasks/task_manager.py`
- Regression coverage: focused pytest around report export cleanup behavior.

## Out Of Scope

- No change to `complete/`, `finished/`, or `archive/` retention.
- No new config surface unless requested; retention is exactly 3 days per request.
- No UI or database change.

## Verification

- Run focused engine-server pytest for the touched report export behavior.
- Also run existing file-management tests if the implementation touches shared `FileManager`; current plan avoids that shared layer.

## Risk

- Low if cleanup is limited to direct child directories under `PBS_REPORT_SCENARIO_DIR`.
- The main risk is accidental deletion outside the report root; implementation must never follow arbitrary paths from scenario data and should only iterate `os.listdir(report_scenario_dir)`.
