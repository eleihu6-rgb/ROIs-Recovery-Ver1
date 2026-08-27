# Reserve Priority Default → "2331112" + 动态 Algorithm default 提示行

**Date:** 2026-08-13 (updated 2026-08-14)
**Status:** Approved (brainstorming) — revised to Option A on 2026-08-14
**Affected modules:** `live-server` (scenario parameter service), `gantt` (scenario parameters dialog), `e2e`

## Problem

The Algorithm Parameters dialog's Reserve Priority editor starts from a default of
`3113222` (Mon 3, Tue 1, Wed 1, Thu 3, Fri 2, Sat 2, Sun 2). The desired default is
`2331112` (Mon 2, Tue 3, Wed 3, Thu 1, Fri 1, Sat 1, Sun 2).

An earlier revision also proposed making the `scenario_id = 0` template default follow
the last value a user saved in a scenario ("0 Default follows last-modified"). That was
**rejected**: mutating the shared default makes the dialog's "Changed" indicator unstable
(`summarizeParameters` compares `value != defaultValue`; once a saved value becomes the new
default, the scenario that set it stops showing "Changed"). The default therefore stays
**static** (Option A). See `docs/superpowers/plans/2026-08-13-reserve-priority-default.md`
and the git history for the rejected design.

## Current Architecture

- `live-server/src/services/scenario/scenario-parameter-service.ts` defines
  `DEFAULT_ALGORITHM_PARAMETER_TEMPLATES`, including `reserve_weekday_priority` with
  `defaultValue`.
- `ensureDefaultTemplates()` upserts these templates into `scenario_parameter` rows with
  `scenario_id = 0` (the "0 Default" template). The `on conflict ... do update set
  param_val = excluded.param_val` clause propagates any constant change into the DB row on
  the next call — no manual SQL migration needed.
- `ensureScenarioDefaults()` copies the template's `defaultValue` into a new scenario's
  `scenario_parameter` row at creation time. Existing scenarios keep their already-seeded
  value; only newly created scenarios pick up the current template default.
- `saveValues()` writes scenario-specific values. It does **not** mutate the template
  default.
- `gantt/src/components/scenario/scenario-parameters-dialog.tsx` renders the 7 weekday
  inputs and a helper line describing the algorithm default. The API already returns
  `item.defaultValue` to the dialog.

## Design

### Change 1 — New initial default ("3113222" → "2331112")

Change the `reserve_weekday_priority` template `defaultValue` in
`scenario-parameter-service.ts` from `{ mon: 3, tue: 1, wed: 1, thu: 3, fri: 2, sat: 2,
sun: 2 }` to `{ mon: 2, tue: 3, wed: 3, thu: 1, fri: 1, sat: 1, sun: 2 }`.

Propagation to the DB `scenario_id = 0` row happens automatically through the existing
`ensureDefaultTemplates` upsert. The default remains static; new scenarios are seeded from
it and never mutate it.

### Change 2 — Dialog helper line becomes dynamic

Replace the hardcoded helper line in `scenario-parameters-dialog.tsx` with one rendered
from `item.defaultValue`. A small pure formatter groups weekday names by priority value —
chronological within a group, groups sorted ascending — producing e.g. for the new
default: **"Algorithm default: Thu/Fri/Sat 1, Mon/Sun 2, Tue/Wed 3."**

The line renders from the current static default and stays correct if the default constant
ever changes.

## Rejected: "0 Default follows last-modified" (Option B/C)

Updating the `scenario_id = 0` template default when a user saves a modified Reserve
Priority was rejected because the dialog's "Changed" badge compares `value` against the
live `defaultValue` (`summarizeParameters`). After a saved value becomes the new default,
the scenario that set it no longer shows "Changed", and new scenarios inherit the mutated
default — a confusing, unstable comparison basis. Keeping the default static preserves
both the badge semantics and the predictable seeding behavior.

## Out of Scope

- **Solver fallback**: `pbs-engine`'s `DEFAULT_RESERVE_WEEKDAY_PRIORITY` stays `3113222`.
  It is effectively unused in the scenario flow (scenarios always pass explicit
  all-7-weekday `hydra_args`). Confirmed by user.
- No mutable default / write-back behavior. Existing scenarios keep their already-seeded
  values; only new scenarios pick up the new static default.

## Tests

| Layer | File | Change |
|-------|------|--------|
| Frontend unit | `gantt/src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx` | Update helper-line assertion to the new default; add `formatReservePriorityDefault` unit test |
| E2E | `e2e/tests/gantt/scenario/scenario-params-team-rules.spec.ts` | Update helper-line assertion text |

Backend: only the `defaultValue` constant changes; no new backend test required (existing
payload/merge tests still pass).

## Validation

- `npm run check:ui` passes (no new frontend styles touched).
- Run the gantt dialog Vitest file and the backend service Vitest file; paste PASS
  summaries (§No-Illusion).
