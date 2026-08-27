# Scenario Gantt Default Buffered Viewport Design

## Problem

When opening a scenario Gantt, the initial horizontal viewport is currently fit to the scenario definition dates. For a scenario optimized for June 1-30, users need immediate context around the boundary days as well: a few lead-in days before June 1 and a few lead-out days after June 30.

Live Gantt opening behavior must not change.

## Decision

Scenario Gantt will open with a scenario-only buffered default viewport:

- Start: `scenarioStrDt - 5 calendar days`
- End: `scenarioEndDt + 5 calendar days`, displayed as a full inclusive day range
- Example: `2026-06-01` through `2026-06-30` opens on `2026-05-27` through `2026-07-05`

The full canvas range continues to come from `strDtLoc` / `endDtLoc`, so lead-in/out roster, pairing, and flight data remains available for scrolling and rendering.

## Scope

In scope:

- Scenario Gantt first-load zoom and scroll initialization.
- Scenario-only regression coverage.
- Frontend version bump.

Out of scope:

- Live Gantt default date range behavior.
- Scenario API shape changes.
- Backend date model changes.

## Architecture

The implementation remains frontend-only and localized to Scenario Gantt. `ScenarioGanttView` will compute the first-load viewport window from `scenarioStrDt` / `scenarioEndDt`, convert the buffered calendar dates with the existing timezone-aware `calendarDateToUtcMidnight`, and set `pxPerHour` / `scrollX` so that the buffered window fills the measured scenario viewport.

The zoom min/max bounds continue to use the full `strDtLoc` / `endDtLoc` data range, preserving scroll access to all loaded data outside the default viewport.

## Testing

Add a Playwright regression that opens a mocked scenario:

- Full canvas range includes May lead-in and July lead-out.
- Scenario definition is June 1-30.
- Initial scenario zoom maps the viewport to about 40 days.
- Initial `scrollX` maps the viewport start to May 27.

Run the focused Playwright test and frontend type/UI checks after implementation.

## Risks

If the full canvas range is shorter than the requested buffered window, zoom min bounds may clamp the effective viewport. That is acceptable: the app cannot show days that are not in the loaded scenario data range. Scenario data normally includes lead-in/out for the optimized roster context.
