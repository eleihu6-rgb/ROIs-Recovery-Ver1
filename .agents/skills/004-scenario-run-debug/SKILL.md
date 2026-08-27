---
name: 004-scenario-run-debug
description: Use when a ROIS scenario run, scen run, scenario optimization, LegacyRO, engine-server /optimize/start, fetch failed, ro_input, pbs scenario-package, ro_output, task_id, or scenario result callback fails or returns no usable roster.
---

# Scenario Run Debug

## Core Rule

Use `superpowers:systematic-debugging` first. Find the first failing boundary before proposing a fix. A top-level `fetch failed` is only a symptom.

Treat remote PostgreSQL/CoreServer as authoritative for scenario, PBS, and solver-material debugging unless the user explicitly says local. Never write DB passwords, JWTs, SSH passwords, or production tokens into docs, logs, or skill resources.

## First Triage

Collect these facts before changing code:

| Fact | Where to look |
|---|---|
| Scenario id, airline/schema, date window | `f8.scenario`, UI request, run logs |
| Current status and `task_id` | `f8.scenario.status`, `f8.scenario.task_id` |
| Did `/api/scenario/:id/run` reach live-server? | live-server route/service logs |
| Did live-server receive a task id? | `scenario-service.run`, `engine-server-client.startRoTask` |
| Did engine-server create a workdir? | engine-server task logs and `working/complete/failed` dirs |
| Did ro_input build finish? | `engine-server/F8/ro_input_builder` logs/artifacts |
| Did pbs scenario package build finish? | pbs-server `scenario-package` response/logs |
| Did solver produce `ro_output`/`result.json`? | task output dir |
| Did engine-server callback live-server? | `/api/scenario/result` logs |
| Did live-server load rows for Gantt? | `scenario-result-loader`, `scenario.roster_flight` |

## Boundary Order

Trace in this order:

1. Gantt/UI request to `POST /api/scenario/:id/run`.
2. `live-server/src/routes/scenario/scenario.ts`.
3. `live-server/src/services/scenario/scenario-service.ts`.
4. `live-server/src/services/engine-server-client.ts`.
5. `engine-server/src/api/routes.py`.
6. `engine-server/src/tasks/task_manager.py`.
7. `engine-server/F8/ro_input_builder/`.
8. `pbs-server/src/routes/algorithm-export.ts` and `pbs-server/src/services/algorithm-export/`.
9. `engine-server/F8/legacy_ro.sh` or environment-specific RO script.
10. Solver output files.
11. `engine-server` result metadata submission.
12. `live-server/src/services/scenario/scenario-result-service.ts` and `scenario-result-loader.ts`.

Read `references/scenario-run-map.md` for the detailed map. Read `references/failure-signatures.md` when matching an error string to the likely boundary. Read `references/case-notes.md` for prior open/solved cases; never convert an open case note into a root-cause claim without evidence.

## Red Flags

Stop and gather evidence if you are about to:

- Fix frontend handling of `fetch failed` before checking live-server and engine-server logs.
- Rerun the scenario before preserving the failed task id, workdir, logs, and DB status.
- Use local PG as evidence when the run used remote PG/CoreServer.
- Assume pbs-server is unrelated; scenario bids are built during kickoff.
- Assume `DONE` means Gantt data loaded; callback metadata and DB row load are separate.
- Paste credentials into notes, code, docs, or command output.

## Completion Criteria

A debug answer should identify the failing boundary and cite the evidence: status/task id, log line, HTTP status/body, missing/present artifact, row count, or callback payload. If the root cause is still unknown, state exactly which boundary remains unproven and what evidence is needed next.
