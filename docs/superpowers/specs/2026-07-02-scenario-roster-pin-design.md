# Scenario Roster Pin Design

## Goal

Scenario Roster should mirror Live Roster's view-only row pin workflow: a planner can select one or more crew rows, right-click, choose `Pin N Selected Rows`, keep those crew rows fixed at the top while scrolling or sorting, and later choose `Unpin All (N)` or click the pin icon on a pinned row to release it.

## Scope

- Add Scenario Roster crew-row pinning only.
- Reuse the existing frozen-row rendering path in `PaneHeaderCanvas`, `PaneCanvas`, and the shared roster model.
- Keep pinning as a local view aid. It must not create scenario patches, optimizer edits, backend writes, or draft operations.
- Preserve Live behavior.
- Do not merge Live and Scenario context menus in this task.
- Do not add Scenario Pairing row pinning in this task.

## Current State

Live pinning is exposed through the Live-only `ContextMenu`. It reads selected row ids and frozen row ids from the Live pane store, then calls `freezeSelectedRows` or clears frozen rows.

Scenario right-clicks use `ScenarioContextMenu`, so the Live menu never renders for Scenario. Scenario already has the needed data path: `scenario-layout-store` stores `frozenCrewIds`, and `scenario-gantt-source` orders roster rows as frozen, then found, then rest. Shared roster already supports clicking the pin icon to unfreeze a Scenario row.

## Design

Add source-backed roster pin commands to `RosterPaneSource`:

- `usePinnedRowActions()` returns selected row count, frozen row count, whether all selected rows are already pinned, and two commands: `pinSelectedRows` and `unpinAllRows`.

Live implementation delegates to existing pane-store behavior for the current roster pane.

Scenario implementation reads selected crew rows from the context pane store under `scenario-roster`, reads frozen crew rows from `scenario-layout-store` for the current roster pane id, appends selected rows that are not already frozen, clears selected rows after pinning, and scrolls the roster pane to the top.

`ScenarioContextMenu` uses the source registry indirectly by following the same store ownership:

- Only show the pin entries for `paneType === 'scenario-roster'`.
- Show `Pin N Selected Rows` when at least one selected row is not frozen.
- Show `Unpin All (N)` when there are frozen rows.
- Do not require scenario edit lock or roster edit capability because this is view-only.

If implementation can keep the action fully behind `RosterPaneSource` without hook-order issues in the singleton menu, prefer that. If not, the menu may call a small helper owned by the Scenario source/store layer, but the helper must not touch backend or scenario patches.

## Testing

Use TDD:

1. Add a failing regression test that proves Scenario can pin selected roster rows via the Scenario context menu and then clear them.
2. Verify the test fails before production code.
3. Implement the minimal code.
4. Run the focused test and touched-area checks.

Required verification:

- Focused Scenario pin regression test.
- Existing Scenario roster/shared canvas touched-area test if feasible.
- `npm run check:ui` after UI text/menu changes.

## Risks

- Existing files are already dirty in the worktree, including source adapters. The implementation must inspect and preserve those changes.
- Scenario context menu is singleton UI-store driven, while `RosterPaneSource` is provider scoped. Avoid hook usage that depends on a missing provider.
- Scenario pinning must remain view-only. Accidentally adding scenario patches would be a product bug.
