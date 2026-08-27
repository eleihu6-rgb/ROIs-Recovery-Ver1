# Scenario Scope Filter Cleanup Design

Date: 2026-07-08
Module: `gantt`, `live-server`

## Goal

Make Scenario scope controls match the data that the optimizer and Scenario Gantt actually use:

- Fleet filters are selected from the `fleet` table, not typed manually.
- Pairing Source is removed because it is not used by the optimizer export path.
- Scenario Flight pane loads flights referenced by the scoped pairing set, not every flight in the date window.
- Scenario lead-in/pre-occupied Live roster data is loaded by default; it is no longer a user-facing option.

This keeps Scenario setup honest: every visible scope control must have a backend effect.

## Current Findings

`RoCrewFilter` and `RoPairingFilter` currently use free-text `TagInput` for fleet values. The app already has `referenceApi.listFleets()` and `useReferenceStore().fleets`, loaded from `/api/fleet`, so no new endpoint is needed.

`Pairing Source` is displayed in the UI and persisted as `filterParams.pairing.sources`, but `scenario-export-service.pairingIdSet()` does not read it. The real optimizer pairing scope is date overlap, division, pairing base, and pairing fleet.

Completed Scenario Gantt DB rendering loads pairings by optimizer-result references from `scenario.roster_flight`, then loads flights by date window. That means the Flight pane can show flights unrelated to the scoped pairings. The first fix should make Scenario flights derive from the scoped pairing segments' `flt_id` values.

`leadinLive` is stored and shown as a choice, but product behavior should always include Live pre-occupied data for Scenario context. The UI should not ask the user whether to load it.

## Design

### Frontend

Replace the two Scenario fleet `TagInput` controls with `MultiSelect` controls:

- Crew `Fleet Quals`: options from `useReferenceStore().fleets`.
- Pairing `Fleets`: options from `useReferenceStore().fleets`.
- Labels remain English.
- Existing selected values continue to render if present and matching the fleet table.

Remove Pairing Source from:

- `RoPairingFilter` controls.
- Pairing filter summary.
- badge count.
- default RO/TO filter params in `ScenarioFilterSection`.

Keep read compatibility with old scenario rows that still have `filterParams.pairing.sources`; the UI simply ignores it.

Remove the user-facing Scenario LeadIn Live option from Scenario create/edit UI. New/updated scenarios should be sent with `leadinLive: 1` by default, and existing scenarios should be treated as if Live pre-occupied data is enabled when building Scenario Gantt/optimizer context.

### Backend

Keep `pairingIdSet()` as the authority for optimizer pairing scope, but update comments/types so they no longer claim `sources` are part of the filter.

For Scenario Gantt DB data, load Flight pane rows from the scoped pairing segments' `flt_id` values:

- Build scoped pairings from optimizer-result references plus SBY references.
- Load segments for those scoped pairings.
- Load flights whose `id` appears in those segments.
- Avoid date-window-only loading for Scenario DB Gantt.

For seed/live-refresh/snapshot paths, apply the same principle where practical: the Scenario Flight pane should show flights referenced by the exported scoped pairing segments, not all flights in the scenario window.

Lead-in behavior becomes default:

- Treat missing/null/zero `leadinLive` as enabled for Scenario Gantt data builders.
- Preserve DB column compatibility for now to avoid schema churn.
- Hide the option in UI instead of removing the column.

## Testing

Focused coverage:

- Frontend test: Scenario filter renders fleet controls as select/multi-select options from `fleet` and does not render Pairing Source.
- Backend test: `buildRoInputGz`/`pairingIdSet` with `pairing.bases = ['YYZ']` exports only YYZ pairings.
- Backend or E2E regression: Scenario Gantt Flight pane data contains only flights referenced by scoped pairings.
- UI E2E: creating/editing a Scenario no longer exposes LeadIn Live, and opening Scenario still shows Live pre-occupied roster duties.

Verification commands should include:

- focused Vitest for Scenario export/Gantt builder
- focused Gantt Playwright test
- `npm run check:ui` after frontend style/control changes
- `gantt` and `live-server` build if touched runtime code crosses modules

## Risks

Existing scenarios may have `leadinLive = 0`; treating them as enabled changes their reopened Scenario Gantt context. This is intentional per product direction, but the final implementation should mention it in release notes or handoff if user-visible.

Flight pane scoping may hide unrelated date-window flights that users previously saw. That is also intentional for this Scenario scope cleanup: the pane should reflect the optimizer input scope.
