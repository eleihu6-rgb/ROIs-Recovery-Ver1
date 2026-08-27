# Refresh Live Violations — Design

> Date: 2026-06-11
> Module: gantt (Rule Manager / 法规集合) + live-server (existing endpoints, no change)
> Status: Approved (design), pending implementation

## Goal

Give an operator one manual control to **regenerate the live `rule_violation`
data for a chosen rule set (法规集合)**, with progress feedback, from inside the
Rule Manager UI.

Scenario-data violations are explicitly **out of scope** this round. They wait
until scenario working data is migrated from `.scenario.gz` files into a real
scenario schema; only then will a scenario violation table + per-scenario
refresh be designed.

## Background (existing pieces, reused as-is)

- Live violations persist to the partitioned `rule_violation` table in the
  airline schema.
- A BullMQ worker already computes them, and a manual-trigger route already
  exists in code (`live-server/src/routes/admin/violations-init.ts`):
  - `POST /api/admin/violations-init` body `{ ruleGroupCode?, yearsBack? }`
    — admin-only, queues `violationsInit:start`. Defaults: `ccar121_gantt`, 1 year.
  - `GET /api/admin/violations-init/status?ruleGroupCode=…`
    — returns `{ status, doneCount, totalCount, progress }` from Redis.
  - **However this route is never registered in `index.ts`**, so the endpoints
    are dead today. One-line fix: register it with prefix `/api/admin`.
- `rule_group.usage` ∈ `GANTT | PO | RO | PBS | ALL` already tags a set's
  intended consumer module.

The only backend change is registering the existing route. No SQL changes.

## Scope

In: a per-rule-set "Refresh Violations" button + trigger/poll wiring + a
deterministic e2e test.

Out: scenario violations, exposing `yearsBack`, batch/multi-set refresh,
scheduling changes, adding `isAdmin` to the frontend auth model.

## UI

**Placement:** `gantt/src/components/rule/rule-group-header.tsx` action row,
alongside Edit / Set as Default / Duplicate / Delete. A `RefreshCw`
"Refresh Violations" button scoped to the currently selected rule set.

**Visibility:** rendered only when `group.usage` is `GANTT` or `ALL` (the
live-checking sets). `PBS` / `PO` / `RO` sets do not write live violations and
do not show the button.

## Behavior / data flow

1. Click → confirm `AppDialog`:
   "Recompute live violations for «name»? This scans all crew rosters and may
   take a while." (Cancel / Refresh.)
2. Confirm → `POST /api/admin/violations-init { ruleGroupCode: group.groupCode }`.
   Button switches to a disabled "Refreshing… N%" state.
3. Poll `GET …/status?ruleGroupCode=…` every ~1.5s; derive `%` from
   `doneCount / totalCount` (fallback to the returned `progress`).
4. Terminal `status` of `done` / `completed` (or `idle` after having run) →
   success toast "Live violations refreshed", button resets to idle.
5. `403` response → toast "Admin access required" and reset. (Frontend does not
   track admin status, so we surface the backend gate instead of hiding the
   button.) Other errors → generic error toast + reset.

Polling is owned by local state inside `RuleGroupHeader` (started on trigger,
cleared on terminal status / unmount). No new Zustand store.

## Components / interfaces

- `gantt/src/services/violations-init-api.ts`
  - `trigger(ruleGroupCode: string): Promise<void>`
  - `getStatus(ruleGroupCode: string): Promise<{ status: string; doneCount: number; totalCount: number; progress: number }>`
- `RuleGroupHeader` — local state: `refreshing: boolean`, `percent: number`,
  `confirmOpen: boolean`; a polling effect keyed on the active `ruleGroupCode`.

## Testing (§Playwright-Required, §No-Illusion)

`e2e/tests/gantt/live-violation-refresh.spec.ts`:

- Intercept both endpoints with `page.route` to script a deterministic
  sequence: `POST` → 200 queued; `GET status` → `running 40%` then
  `done 100%`.
- Navigate: rule module → Rule Manager → select a `GANTT` set.
- Assert: button visible; click → confirm dialog text present; confirm →
  button shows "Refreshing…" + a mid-progress percent; after the scripted
  `done`, a success state/toast appears and the button returns to idle.
- Negative: a second case where `POST` → 403 asserts the "Admin access
  required" toast and that the button resets (no stuck spinner).

The route-scripted approach avoids depending on a real, slow batch job while
still proving each UI transition.

## Version impact

Frontend change → `FRONTEND_VERSION` +1. Registering the dead admin route is a
backend change → `BACKEND_VERSION` +1.
