# Gantt Ground Task Status Bar Base-Local Time

## Problem

Live and Scenario Gantt Status Bar shows ground task times by slicing UTC timestamp strings, so a ground task such as `2026-06-10T09:00:00.000Z` is displayed as `06-10T09:00 ~ 12:00` instead of the task Base airport's local time.

## Scope

- Applies to ground tasks only: roster items with `pairingId == null`.
- Applies to both Live and Scenario Gantt via the shared `formatGroundTaskStatusLine` utility.
- Base timezone source is the task's own `base` field resolved through `airport-tz-store.zoneIdFor(base)`.
- If the Base has no known IANA timezone, fall back to `UTC` rather than using the currently selected Gantt display timezone.
- Do not change flight/pairing status-line behavior in this task.

## Design

- Extend `formatGroundTaskStatusLine` to accept an optional Base timezone resolver or explicit zone.
- Format start/end using existing cached timezone helpers (`formatDateShort`, `formatTime`) instead of substring slicing.
- Show the date in Base local calendar date and the times in Base local time, e.g. `6/10 02:00L ~ 05:00L`.
- Preserve the existing status-line parts: crew/id, base, assignment group, assignment, label, time, credit.
- In Live roster hover, pass `zoneIdFor(task.base)`.
- In Scenario roster hover, pass `zoneIdFor(task.base)` and ensure `airport-tz-store.load()` is triggered when the Scenario roster interaction source mounts.
- Keep the change surgical; no new API, schema, or broad UI styling changes.

## Tests

- Update `gantt/src/utils/__tests__/format-ground-task-status-line.test.ts` with a Base-local timezone case, including a UTC-to-local conversion that proves substring slicing is gone.
- Add/adjust a Scenario source unit test if the status formatter path is covered there.
- Run the smallest relevant Gantt test command for the utility/source tests.
- Because this is Status Bar UI behavior, run a focused Playwright Gantt hover check if an existing test harness can reliably synthesize the hover; otherwise document the blocker and the unit coverage.

## Tooling Limits

The repository asks for GitNexus `impact` / `detect_changes`, but this Codex session has no GitNexus tools exposed through `tool_search`. I will use local static search and focused tests instead, and report that limitation in final verification.
