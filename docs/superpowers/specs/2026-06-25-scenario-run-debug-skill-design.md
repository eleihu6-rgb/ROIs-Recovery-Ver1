# Scenario Run Debug Skill Design

## Goal

Create a repo-local skill named `scenario-run-debug` for Claude and Codex to use when a scenario run fails, especially errors such as `fetch failed`, `scen run fail`, `/optimize/start` failure, missing `task_id`, missing result callback, or empty scenario output.

## Placement

- Source of truth: `.agents/skills/scenario-run-debug/`
- Claude compatibility: `.claude/skills/scenario-run-debug` should point to or mirror the `.agents` skill.
- Prefer a symlink for Claude compatibility. If validation or tooling does not tolerate the symlink, duplicate the folder and treat `.agents/skills/scenario-run-debug/` as authoritative.

## Trigger Keywords

The skill description must include common user and log wording:

- `scenario run`
- `scen run`
- `scen run fail`
- `scenario failed`
- `fetch failed`
- `engine-server /optimize/start`
- `LegacyRO`
- `ro_input`
- `pbs scenario-package`
- `ro_output`
- `task_id`
- `scenario result callback`

## Core Principle

The skill must force boundary-by-boundary root-cause tracing. It must prevent agents from fixing frontend symptoms or guessing from a top-level `fetch failed` message before locating the first failing component.

## Pipeline Model

The skill should teach this current project flow:

1. Gantt UI calls `POST /api/scenario/:id/run`.
2. `live-server` transitions `f8.scenario.status` to `RUNNING`.
3. `live-server/src/services/engine-server-client.ts` calls `engine-server /api/optimize/start` with `type: "LegacyRO"` and `parameters.inputSource: "db"`.
4. `engine-server` creates a task/workdir.
5. For `inputSource=db`, `engine-server/F8/ro_input_builder` builds `ro_input.txt` and `input.gz` from PostgreSQL.
6. `engine-server` derives the same scenario crew/window and asks `pbs-server` for `/api/admin/algorithm-export/scenario-package`.
7. `engine-server` runs the LegacyRO script (`engine-server/F8/legacy_ro.sh` on CoreServer; local/rust variants are environment-specific).
8. The Python solver parses `ro_input`, applies configured rule engine mode, and produces `ro_output.txt`, `result.json`, and related artifacts.
9. The converter creates the output gz.
10. `engine-server` posts result metadata to `live-server` at `/api/scenario/result`.
11. `live-server` stores scenario metadata and best-effort loads scenario DB rows for Gantt.

## Required Debug Workflow

The skill must tell agents to:

- Use `superpowers:systematic-debugging` first for any failed run.
- Treat remote PostgreSQL/CoreServer as authoritative for scenario, PBS, and solver-material debugging unless the user explicitly says local.
- Do not write DB passwords, JWTs, SSH passwords, or production tokens into docs, logs, or skill resources.
- Identify scenario id, airline/schema, run `task_id`, current status, and whether the failure happened before or after task creation.
- Trace component boundaries in order: UI/live route, live service, engine-server start, ro_input builder, pbs-server package, solver script, solver output, result callback, DB load.
- Prefer logs and persisted artifacts over assumptions.
- Preserve user changes in the working tree.

## References To Include

Create two reference files:

- `references/scenario-run-map.md`: concise map of the pipeline, important files, and source-of-truth reminders.
- `references/failure-signatures.md`: symptom-to-boundary table for common failures.

Do not add executable scripts in the first version. The workflow is environment-sensitive and should not encode secrets or stale host assumptions.

## Validation

Validate the skill with:

- The skill creator `quick_validate.py`.
- Read-only checks that the created paths and frontmatter exist.
- A manual review against these pressure scenarios:
  1. User says only `scen 577 return fetch failed`; the agent must not guess a fix and must first locate the failing boundary.
  2. `live-server` reports `engine-server /optimize/start 500`; the agent must inspect engine-server logs/workdir and pbs-server/ro_input stages.
  3. Scenario is `DONE` but Gantt has no rows; the agent must inspect result callback, engine result artifacts, and scenario DB load rather than rerunning blindly.

## Out Of Scope

- No code changes to the scenario run pipeline.
- No new automation that connects to production systems.
- No storage of secrets or live credentials.
