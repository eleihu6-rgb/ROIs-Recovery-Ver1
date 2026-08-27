# Scenario Run Map

## Current Run Pipeline

1. Gantt calls `POST /api/scenario/:id/run`.
2. `live-server/src/routes/scenario/scenario.ts` extracts the bearer token and airline schema.
3. `scenarioService.run` transitions the scenario to `RUNNING`.
4. `engineServerClient.startRoTask` calls:
   - URL: `${ENGINE_SERVER_URL}/api/optimize/start`
   - Type: `LegacyRO`
   - Parameters: `{ scenarioId, javaScenarioId: 114, inputSource: "db" }`
5. `engine-server` creates the task and workdir.
6. For `inputSource=db`, `engine-server/src/tasks/task_manager.py` calls `F8.ro_input_builder.cli.build` to build `ro_input.txt` and `input.gz` from PostgreSQL.
7. The same engine task derives scenario crew ids/window and calls pbs-server:
   - `POST /api/admin/algorithm-export/scenario-package`
   - Body includes `periodCode`, `crewIds`, and optionally `scenarioStart`/`scenarioEnd`.
8. `pbs-server` builds the scenario-scoped bid package from PBS/live tables.
9. `engine-server/F8/legacy_ro.sh` decompresses input, runs the Python solver, then runs `legacy_ro_converter.py`.
10. Solver output should include `ro_output.txt`, `result.json`, and related output artifacts.
11. `engine-server` posts metadata to live-server `/api/scenario/result`.
12. `saveResult` stores metadata and triggers best-effort `loadScenarioResultIntoDb`.
13. Gantt reads scenario data from result files and/or `scenario.*` DB rows depending on path.

## Important Files

| Boundary | Files |
|---|---|
| Live run route | `live-server/src/routes/scenario/scenario.ts` |
| Scenario status/task id | `live-server/src/services/scenario/scenario-service.ts` |
| Engine start/fetch clients | `live-server/src/services/engine-server-client.ts` |
| Engine API | `engine-server/src/api/routes.py` |
| Engine task lifecycle | `engine-server/src/tasks/task_manager.py` |
| ro_input builder | `engine-server/F8/ro_input_builder/cli.py`, `context.py`, `registry.py`, `sections/*` |
| PBS package route | `pbs-server/src/routes/algorithm-export.ts` |
| PBS package service | `pbs-server/src/services/algorithm-export/algorithm-export-service.ts` |
| PBS package client | `engine-server/src/utils/pbs_server_client.py` |
| Legacy run script | `engine-server/F8/legacy_ro.sh` |
| Local Rust run variant | `engine-server/F8/ro_rust.sh` |
| Result callback | `engine-server/src/tasks/task_manager.py`, `live-server/src/routes/scenario/scenario.ts` |
| Result persistence/load | `live-server/src/services/scenario/scenario-result-service.ts`, `scenario-result-loader.ts` |

## Source-Of-Truth Rules

- Scenario/PBS/solver-material debugging should use the remote PG/source used by the running services.
- Local generated material can be useful as a comparison artifact, but it is not authoritative unless the run was local.
- Preserve failed run evidence before rerunning: task id, scenario status, engine workdir, stdout/stderr, HTTP status/body, generated input package, and output artifacts.
- Keep secrets out of docs and skill resources. Refer to service env/config rather than writing credentials.

## Useful Evidence Shapes

| Evidence | Meaning |
|---|---|
| Scenario status `FAILED` and no `task_id` | Failure likely before or during `/optimize/start` response. |
| Scenario status `RUNNING` with `task_id` but no callback | Engine task may still be running, crashed, or failed before callback. |
| Engine workdir has `ro_input.txt` but no PBS CSVs | PBS package stage likely failed or was skipped. |
| PBS package exists but no `ro_output.txt` | Solver/script stage likely failed. |
| `ro_output.txt` exists but live-server remains `RUNNING` | Callback/result metadata path likely failed. |
| `DONE` but no `scenario.roster_flight` rows | Result metadata succeeded, DB load or artifact parse likely failed. |
