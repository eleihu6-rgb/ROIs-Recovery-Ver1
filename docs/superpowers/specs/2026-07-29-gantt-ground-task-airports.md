# Gantt Ground Task Airport Fields

## Context

Live and Scenario Gantt ground tasks are roster entries with `pairing_id IS NULL`. The current UI exposes `base` in the ground-task status line and Ground Task dialog, while the data model also has `roster_flight.dep_arp` and `roster_flight.arv_arp` for ground-task start/end locations.

The requested behavior changes the user-facing ground-task location fields from `base` to `dep_arp` / `arv_arp`, while preserving the existing `base` column as a backend compatibility field.

## Required Behavior

1. Status Bar
   - For ground tasks, show departure and arrival airport/location from `dep_arp` and `arv_arp`.
   - Do not show `base` as a separate status-line field.
   - Timezone formatting may continue to resolve from the departure airport first, with UTC fallback if no airport timezone is known.

2. Ground Task Dialog / Ground Editor
   - Replace the visible `Base` row with two fields: `Dep Arp` and `Arv Arp`.
   - In create mode, both fields are required.
   - In edit/view-only mode, show the saved `dep_arp` and `arv_arp` values.
   - Scenario ground-task dialog remains view-only; it should display the two airport fields and not expose editable writes.

3. Create Ground Task
   - The create request must include `depArp` and `arvArp`.
   - Server persistence must write:
     - `roster_flight.dep_arp = depArp`
     - `roster_flight.arv_arp = arvArp`
     - `roster_flight.base = depArp`
   - This intentionally keeps `base` populated for existing downstream consumers while no longer making it the planner-facing field.

4. Edit Ground Task
   - Updating `depArp` must also update `base` to the same value.
   - Updating `arvArp` must update only `arv_arp`.
   - Existing immutable behavior remains unchanged: Scenario rows are view-only, and IMP rows remain non-editable except for the existing delete affordance where allowed.

## Implementation Scope

- `gantt/src/types/roster.ts`: add `depArp` / `arvArp` to `RosterItem`, `CreateGroundTaskInput`, and `UpdateRosterInput`.
- `gantt/src/components/roster/ground-task-dialog.tsx`: replace visible Base control with Dep/Arv controls and wire create/edit payloads.
- `gantt/src/utils/format-ground-task-status-line.ts`: format dep/arv, stop listing base.
- Live and Scenario Gantt sources should continue using the shared status formatter.
- `live-server/src/routes/roster/roster.ts`: accept `depArp` / `arvArp` on create.
- `live-server/src/services/roster/roster-service.ts`: persist create fields and ensure base follows depArp.
- Existing update route/service must be extended only if it does not already pass through `depArp` / `arvArp`.
- Tests should cover formatter output, dialog payload behavior, and live-server create persistence.

## Validation Plan

- Run focused unit tests for the ground-task status formatter and dialog helpers.
- Run focused live-server roster service/route tests for create-ground-task.
- Run TypeScript checks for touched modules.
- Run `npm run check:ui` if frontend markup/style changes trigger the UI standard gate.
- Run or add a focused Playwright Gantt test that opens the real Ground Task dialog and verifies Dep/Arv fields in create/edit/view-only behavior, unless the local environment cannot start the required app stack; any blocker must be reported explicitly.

## Known Tooling Constraint

Root `AGENTS.md` requires the `brainstorming` skill and GitNexus impact analysis before implementation. In this Codex session, no `brainstorming` skill file or GitNexus tool namespace was available after local search/tool loading. This spec is the fallback written artifact; implementation should proceed only after explicit user approval.
