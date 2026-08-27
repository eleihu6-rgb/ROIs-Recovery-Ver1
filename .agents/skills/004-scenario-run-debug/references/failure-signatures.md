# Failure Signatures

Use this table to choose the first boundary to inspect. It is a starting point, not proof.

| Symptom | First likely boundary | Evidence to gather |
|---|---|---|
| UI says `fetch failed` immediately | Browser to live-server, or live-server to engine-server | Browser network status, live-server route log, `ENGINE_SERVER_URL`, `/optimize/start` status/body |
| User says `scen <id> return fetch failed` | Usually live-server to engine-server `/optimize/start`, unless browser network proves live-server was never reached | Scenario status/task_id, live-server `/api/scenario/:id/run` error body, engine-server `/optimize/start` log/response, workdir presence |
| `engine-server /optimize/start 500` in live-server | Engine kickoff | Engine-server task log, traceback, workdir creation, response body |
| `AbortSignal.timeout` or long start timeout | Synchronous kickoff material build | Duration split for ro_input build and PBS package build; scenario crew count/window |
| `Java server login failed` or `:8011 Connection refused` | Wrong input source path | Confirm `inputSource: "db"` reached engine-server; inspect config fallback |
| `pbs-server login failed` | PBS package download | pbs-server URL/config, auth response status, admin user availability |
| `scenario-package` 400 | Bad package request | Request body has `periodCode` and non-empty `crewIds` |
| `scenario-package` 500 or `fetch failed` | PBS package generation | pbs-server logs, failing export file, bad bid row, pairing-score/date cast errors |
| Empty or tiny `ro_input.txt` | ro_input builder scope/filter | Scenario filter params, crew count, date window, DB source/schema |
| Solver parse error | Solver input compatibility | Last solver stderr lines, offending ro_input section, converter logs |
| No feasible roster / rejected all rows | Solver/rule/preference stage | `result.json`, `all_columns.json`, rule mode, crew/pairing matrix size |
| `ro_output.txt` exists but callback failed | Engine to live-server result metadata | `_submit_scenario_result` log, `/api/scenario/result` response body |
| Scenario is `DONE` but Gantt empty | Result load or Gantt read path | `scenario-result-loader` logs, `scenario.roster_flight` count, `GET /gantt-data` response |
| `GET /api/optimize/result/:task_id` 404 | Engine task memory/archive lookup | Complete/failed dirs, scenario_id query fallback, task id stored on scenario |
| Reproduces locally but not remotely | Wrong source of truth | Compare DB DSN/source, config, generated material timestamps |

## Minimum Debug Report

Include:

- Scenario id and airline/schema.
- Status and `task_id`.
- First failing boundary.
- Exact evidence: log line, HTTP status/body, artifact presence/absence, or row count.
- Next action only if more evidence is needed.

## Common Wrong Turns

- Treating `fetch failed` as the root cause.
- Debugging local PG when the actual run used remote PG/CoreServer.
- Looking only at `f8.scenario.status` and ignoring engine workdirs.
- Ignoring the pbs-server package stage because the user said "scenario run".
- Rerunning before preserving the failed run artifacts.

## Case Notes

Check `case-notes.md` for accumulated scenario-specific facts. Treat notes marked **Open** as investigation starting points only.
