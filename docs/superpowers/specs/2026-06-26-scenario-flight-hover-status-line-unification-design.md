# Scenario Flight Hover Status Line Unification

Date: 2026-06-26
Module: `gantt`
Status: approved design, pending implementation plan

## Problem

Scenario Gantt and Live Gantt already share the Flight pane component, but hovering a Scenario flight still shows a simpler status-bar line than Live. This violates the project `§Gantt-Unify` rule: where user-facing behavior is the same, Live and Scenario should use one shared code path with source differences hidden behind the source adapter.

Live flight hover uses `formatFlightStatusLine` to render a rich operational line:

```text
F8-281381 · YYZ 6/10 17:00 / 13:00L -> YHZ 6/10 19:10 / 16:10L · 7M8 · C-FLKA · CA 1/1  FO 1/0  FA 4/3
```

Scenario currently falls back to a short inline string in `SharedFlightPane` because the Scenario `FlightPaneSource` does not provide `formatStatusLine`.

## Goal

When hovering a flight sector in Scenario Gantt's Flight pane, the Scenario status bar should mirror the Live status-bar format and field order:

1. Flight number.
2. Departure airport with Gantt timezone and airport-local time.
3. Arrival airport with Gantt timezone and airport-local time.
4. Fleet.
5. Register.
6. Composition by rank as `plan/actual`.

For Scenario, `actual` means Scenario assignment fill, not Live roster fill.

## Design

Add `formatStatusLine` to the Scenario `FlightPaneSource` in `gantt/src/components/gantt/source/scenario-gantt-source.ts`.

The shared `SharedFlightPane` hover handler already prefers `flight.formatStatusLine(hit.itemId)` when present. Once Scenario supplies that capability, Live and Scenario use the same hover path and the same formatter utility.

Scenario status-line composition is derived from loaded Scenario Gantt data:

- Find `ScenarioGanttFlight` by hovered flight id.
- Find `ScenarioGanttPairingSegment` rows with `fltId === flight.id`.
- For each matching segment, find the corresponding `ScenarioGanttPairing`.
- Convert each pairing composition slot `{ rank, plan, fill }` to formatter shape `{ [rank]: { plan, actual: fill } }`.
- If multiple scenario pairings reference the same flight, aggregate by rank by summing `plan` and `fill`.
- Pass the result to `formatFlightStatusLine` as `composition`.

The formatter input for Scenario uses the same `Flight` shape already produced by `buildScenarioFlightItems`. Airport-local time uses `useAirportTzStore.zoneIdFor`, matching Live. The selected Gantt timezone uses `useTimezoneStore`.

## Source Boundaries

Scenario must not call Live flight composition or roster endpoints for this feature. The plan/fill source of truth is the Scenario data already loaded by `GET /api/scenario/:id/gantt-data`.

This is a frontend-only change unless implementation discovers that required composition fields are absent from `ScenarioGanttData`. Current code already carries `ScenarioGanttPairing.compositions`, and the Scenario backend recomputes `fill` from optimizer assignments before returning Gantt data.

## Expected Behavior

- Scenario flight hover uses the same field order and separators as Live.
- Scenario composition reflects optimizer assignment fill:
  - `plan` comes from the scenario pairing composition requirement.
  - `actual` comes from scenario `fill`.
- Airport-local time suffix rules remain the existing Live formatter rules.
- If a Scenario flight has no matching pairing composition, the formatter may show `No crew`, consistent with the existing formatter behavior.
- Moving off the flight clears the status text through the existing shared hover flow.

## Out Of Scope

- Adding new backend endpoints.
- Querying Live roster or Live flight composition for Scenario status-bar actuals.
- Changing Live flight hover behavior.
- Refactoring the Scenario status-bar component itself.
- Unifying the remaining Live/Scenario toolbar or layout grid forks.

## Testing

Add or extend Scenario Gantt tests to cover the real UI path:

- Open a Scenario Gantt with a Flight pane.
- Hover a rendered Scenario flight puck using real mouse movement.
- Assert `scenario-status-bar-text` contains a Live-style line with route/time/fleet/register and composition rank values.
- Use fixture data where the pairing composition has a non-full fill so the assertion proves Scenario assignment fill is used.

Add focused unit coverage if the composition derivation is extracted to a pure helper:

- One pairing, one flight, multiple ranks.
- Multiple pairings referencing the same flight aggregate by rank.
- Missing pairing or missing composition returns undefined or empty composition consistently with formatter expectations.

Run:

```bash
cd gantt && npx tsc --noEmit
npx playwright test e2e/tests/gantt/scenario-selection.spec.ts
```

Because this changes Gantt frontend runtime behavior, increment `FRONTEND_VERSION` in `gantt/src/version.ts` during implementation.
