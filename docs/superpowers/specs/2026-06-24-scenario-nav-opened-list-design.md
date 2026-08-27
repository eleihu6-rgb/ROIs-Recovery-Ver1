# Scenario Nav Opened List Design

Date: 2026-06-24

## Goal

Simplify the Gantt top navigation Scenario dropdown so opened scenario Gantt views are visible directly in the first-level dropdown, without the current nested "Opened Scenarios" submenu.

## Current Behavior

The Scenario top-nav item opens a dropdown with:

- `Scenarios`, which navigates to the scenario management/list page.
- `Opened Scenarios`, a nested submenu containing currently opened scenario Gantt views.

When a scenario is open, the top-nav trigger can show that scenario label. Closing a scenario currently follows the generic shell tab close fallback, which can activate a nearby remaining tab.

## Desired Behavior

The Scenario top-nav item remains a dropdown in all Scenario-related states.

Dropdown contents are flat:

1. `Scenarios`
2. Zero or more opened scenario rows directly below `Scenarios`

Each opened scenario row:

- Shows the existing scenario type icon and existing stored label, such as `#597 597-YVR-Pilot-Ryan` or `#541 YVR-CC-Ryan-Ver1`.
- Opens that scenario Gantt when the row is selected.
- Shows an `X` close affordance on the right.
- Closes only that scenario when `X` is clicked.

After closing a scenario from this dropdown, the active view becomes the Scenario management/list page (`activeModule = 'scenario'`). If other scenarios remain open, the next click on the Scenario top-nav dropdown still shows those remaining scenario rows directly below `Scenarios`. For example, closing `#597` returns to the Scenario list page, and the dropdown still offers `#541` if it remains open.

When no scenario Gantt views are open, the dropdown shows only `Scenarios`.

## Scope

In scope:

- `gantt/src/components/shell/scenario-nav-dropdown.tsx`
- A focused shell-store helper only if needed to avoid changing global close behavior for other tabs.
- Focused tests or type checks for the dropdown close fallback behavior.

Out of scope:

- Scenario list panel filtering, sorting, or selection behavior.
- Scenario Gantt rendering and data loading behavior.
- Global tab close behavior outside the Scenario dropdown.
- Styling changes beyond what is needed for the flat dropdown rows and right-side close button.

## Design Notes

The safest implementation is to keep the existing `openTabs`, `scenarioTabLabels`, and `scenarioTabTypes` state model. The dropdown should remove `DropdownMenuSub` and render `openScenarios.map(...)` directly after the `Scenarios` menu item.

Closing from this dropdown should call the existing tab cleanup path, destroy the scenario Gantt store, and then set the active module to `scenario`. If the generic `closeTab` fallback conflicts with that result, add a small scenario-specific wrapper in the component or a narrow store action that explicitly closes a module and activates `scenario`.

The direct-navigation special case where the Scenario trigger becomes a plain button should be removed or adjusted, because the user needs the dropdown even when currently on the Scenario management page or after closing one scenario with others still open.

## Acceptance Criteria

- The `Opened Scenarios` submenu text no longer appears.
- Opened scenarios appear directly under `Scenarios`.
- Selecting an opened scenario switches to that scenario Gantt.
- Closing `#597` from the dropdown returns to the Scenario management/list page.
- If `#541` remains open after closing `#597`, clicking the Scenario top-nav dropdown shows `#541` directly under `Scenarios`.
- With no opened scenarios, the dropdown shows only `Scenarios`.
- TypeScript passes for the Gantt app.
