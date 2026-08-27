# Scenario Roster Puck Violation Hover Design

## Goal

Fix Scenario Gantt roster puck hover so hovering a roster task that has legality violations shows the shared violation tooltip. Scope is limited to Scenario roster pucks. Pairing pane hover is explicitly out of scope.

## Problem

Scenario 672 has persisted legality violations in SIT, and the roster crew-header bell hover works after the previous fix. Roster task/puck hover still does not show the tooltip because the Scenario roster source only updates the status bar during `onItemHover`; it never writes the hovered task into the shared `useGanttViewStore`. The shared `ViolationTooltip` also resolves hovered task ids from the Live roster store, so it cannot match Scenario roster task metadata.

## Confirmed Approach

Use the existing shared hover tooltip path and add only the missing Scenario roster wiring:

- In the Scenario roster source, set `useGanttViewStore.hoveredTaskId` on roster task hover and clear it when hover leaves a task.
- Keep the current status-bar hover text behavior unchanged.
- In `ViolationTooltip`, allow the aggregation helper to resolve hovered task ids from Scenario roster items when a `scenarioId` is present.
- Aggregate Scenario roster puck violations by:
  - exact roster target: `targetType === 'roster' && targetId === hoveredTaskId`
  - pairing target: `targetType === 'pairing' && targetId === task.pairingId`
  - crew-owned row: `v.crewId === task.crewId`
- Preserve existing Live task hover behavior and Scenario crew-header bell hover behavior.

## Files

- `gantt/src/components/gantt/source/scenario-gantt-source.ts`
  - Update Scenario roster `onItemHover` to set/clear the shared hovered task state.
- `gantt/src/components/gantt/violation-tooltip.tsx`
  - Extend pure aggregation to handle Scenario task-puck matching.
  - Read Scenario roster model/items for the active scenario without touching backend data.
- `gantt/src/components/gantt/__tests__/violation-tooltip.test.ts`
  - Add a regression test for Scenario roster puck aggregation.
- `e2e/tests/gantt/crew-bell-click-popup.spec.ts`
  - Extend the existing fully mocked Scenario coverage with a roster puck hover assertion.

## Non-Goals

- Do not implement Pairing pane violation hover.
- Do not change legality API shape, persisted violation schema, or backend recompute behavior.
- Do not alter roster selection, drag, context menu, or status-bar text behavior.

## Testing

- Unit RED/GREEN: `gantt/src/components/gantt/__tests__/violation-tooltip.test.ts`
- E2E RED/GREEN: mocked Scenario Gantt test hovers a real roster puck and asserts the shared tooltip contains Scenario violation details.
- Typecheck: `npm --prefix gantt exec -- tsc -p tsconfig.json --noEmit`
- Diff hygiene: `git diff --check`

## Risks

The main risk is accidentally showing stale tooltips after leaving a Scenario roster puck. The fix must clear the shared hovered task state when `onItemHover` receives no task. Another risk is double-counting crew-owned and pairing-owned persisted violations; the existing tooltip dedupe by rule/message remains in place.
