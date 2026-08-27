# Altair Missing Scenario Redirect Design

## Goal

When a user opens an Altair scenario URL for a scenario that does not exist, the Gantt app redirects from `/altair/scenario/:id` to the Scenario list at `/altair/scenario` instead of leaving the page on a blank error state.

## Scope

- Applies to direct navigation and browser refresh on `/altair/scenario/:id`.
- Applies only when the scenario Gantt load error is a not-found response such as `Scenario not found`.
- Other scenario Gantt load failures remain visible as errors so API, server, and data issues are not hidden.
- No backend API changes are required.

## Architecture

`ScenarioGanttView` already owns the per-scenario load state and receives the current error string from the scenario Gantt store. The redirect should live there because that is the first point where the app can distinguish a missing scenario from another scenario load failure.

Add a small pure helper that identifies a missing-scenario error message. `ScenarioGanttView` will use it in an effect. If the active scenario tab receives a missing-scenario error, the view closes that tab, destroys its per-scenario stores, and switches to the Scenario module. The existing URL sync layer then pushes `/altair/scenario`.

## User Experience

- `/altair/scenario/577` continues to open scenario `577` when it exists.
- `/altair/scenario/77` redirects to `/altair/scenario` when scenario `77` does not exist.
- The user should not see `Error: Scenario not found` as a final page state.
- Other errors, for example a server failure, continue to render in the Gantt content area.

## Testing

- Unit test the missing-scenario error predicate.
- E2E test direct navigation to a missing scenario URL and verify the final URL is `/altair/scenario`.
- Keep the existing direct scenario URL E2E behavior for non-not-found errors, proving only missing scenarios redirect.

## Non-Goals

- Do not add a new preflight API request before opening scenario URLs.
- Do not redirect all scenario load errors.
- Do not change the `/altair`, `/altair/live`, or valid `/altair/scenario/:id` route behavior.
