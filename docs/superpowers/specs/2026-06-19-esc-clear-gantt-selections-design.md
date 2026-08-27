# ESC — Clear All Gantt Pane Selections

**Date:** 2026-06-19
**Status:** Approved

## Problem

Pressing ESC in the Gantt currently only clears `useGanttViewStore.selectedTaskIds` (Live task puck selection). It does **not** clear:

- Live crew-row header selection (`usePaneStore` row selection)
- Scenario roster task selection (`scenario-roster-selection-store`)
- Scenario roster crew-row header selection (`scenario-roster-selection-store`)
- Scenario flight selection (`scenario-flight-selection-store`)
- Scenario pairing selection (`scenario-pairing-selection-store`)

The keyboard shortcuts dialog and Help already document ESC, but the label and implementation are incomplete.

## Goal

ESC clears **all** selection state across all open Gantt panes (Live + every open Scenario tab) in a single key press.

## File Changes

| File | Change |
|---|---|
| `gantt/src/stores/scenario-roster-selection-store.ts` | Add `clear()` method — missing; flight/pairing already have it |
| `gantt/src/utils/clear-gantt-selections.ts` | **New** — `clearAllGanttSelections()` utility |
| `gantt/src/hooks/use-keyboard.ts` | ESC handler: replace `clearSelection()` call with `clearAllGanttSelections()` |
| `gantt/src/components/common/keyboard-shortcuts-dialog.tsx` | Label: `"Clear selection / Close menu"` → `"Clear all selections / Close menu"` |
| `gantt/src/components/help/topics/live/live-keyboard.tsx` | Same label update |
| `e2e/gantt/keyboard-esc-clear-selection.spec.ts` | **New** — Playwright regression tests |

## Data Flow

### Live Gantt

All three Live panes (Roster, Flight, Pairing) share `useGanttViewStore.selectedTaskIds` for task selection. The roster pane additionally stores crew-row header selection in `usePaneStore` keyed by context `'live'`.

ESC must clear both:
```
useGanttViewStore.clearSelection()            // task puck selection (all Live panes)
getPaneStore('live').clearRowSelection('roster')  // crew-row header
```

### Scenario Gantt

Each open scenario tab is represented in `useShellStore.openTabs` as `'scenario-gantt:{id}'`. The numeric suffix is the scenario ID used to key all per-scenario stores.

Each scenario has three independent selection stores:
- `scenario-roster-selection-store` — `selectedTaskIds: Set<number>` + `selectedCrewIds: Set<string>`
- `scenario-flight-selection-store` — `selectedIds: Set<number>`
- `scenario-pairing-selection-store` — `selectedIds: Set<number>`

ESC must iterate all open scenario tabs and call `clear()` on each store:
```
const openTabs = useShellStore.getState().openTabs
for (const tab of openTabs) {
  if (!tab.startsWith('scenario-gantt:')) continue
  const id = parseInt(tab.split(':')[1], 10)
  getScenarioRosterSelectionStore(id).getState().clear()
  getScenarioFlightSelectionStore(id).getState().clear()
  getScenarioPairingSelectionStore(id).getState().clear()
}
```

### Guard (unchanged)

ESC is a no-op when `e.target` is `HTMLInputElement`, `HTMLTextAreaElement`, or `HTMLSelectElement` — the existing guard in `use-keyboard.ts` stays.

## `clearAllGanttSelections()` — full implementation

```ts
// gantt/src/utils/clear-gantt-selections.ts
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { getPaneStore } from '@/stores/pane-store'
import { useShellStore } from '@/stores/shell-store'
import { getScenarioRosterSelectionStore } from '@/stores/scenario-roster-selection-store'
import { getScenarioFlightSelectionStore } from '@/stores/scenario-flight-selection-store'
import { getScenarioPairingSelectionStore } from '@/stores/scenario-pairing-selection-store'

export function clearAllGanttSelections() {
  useGanttViewStore.getState().clearSelection()
  getPaneStore('live').getState().clearRowSelection('roster')

  const openTabs = useShellStore.getState().openTabs
  for (const tab of openTabs) {
    if (!tab.startsWith('scenario-gantt:')) continue
    const id = parseInt(tab.split(':')[1], 10)
    getScenarioRosterSelectionStore(id).getState().clear()
    getScenarioFlightSelectionStore(id).getState().clear()
    getScenarioPairingSelectionStore(id).getState().clear()
  }
}
```

## `scenario-roster-selection-store` — `clear()` addition

Add to the store definition inside `createStore()`:

```ts
clear: () => set({ selectedTaskIds: new Set<number>(), selectedCrewIds: new Set<string>() }),
```

Add to the interface:
```ts
/** Clear both task and crew-row selections. */
clear: () => void
```

## `use-keyboard.ts` — ESC handler update

Replace:
```ts
case 'Escape':
  clearSelection()
  closeContextMenu()
  break
```

With:
```ts
case 'Escape':
  clearAllGanttSelections()
  closeContextMenu()
  break
```

Remove `clearSelection` and `selectedTaskIds` from the hook's store subscriptions (they're no longer used directly — `clearAllGanttSelections` calls them internally). Also remove the `Delete`/`Backspace` handler's dependency on `selectedTaskIds` from hook state — replace with `useGanttViewStore.getState().selectedTaskIds` inline (same pattern already used elsewhere in the hook for `useDraftStore`).

## Label updates

**`keyboard-shortcuts-dialog.tsx`** — Edit group:
```ts
{ keys: ['Esc'], label: 'Clear all selections / Close menu' },
```

**`live-keyboard.tsx`** — SHORTCUTS array:
```ts
{ group: 'Edit', key: 'Esc', action: 'Clear all selections / Close menu' },
```

## Playwright Tests (`e2e/gantt/keyboard-esc-clear-selection.spec.ts`)

| # | Scenario | Assert |
|---|---|---|
| 1 | Live roster — select a task puck → press ESC | Task puck loses selected state |
| 2 | Live roster — click a crew-row header → press ESC | Crew row loses highlighted state |
| 3 | ESC inside an input is a no-op | Selection state unchanged after ESC in a text input |

Scenario Gantt tests are added if the e2e environment has scenario data; otherwise marked with `test.skip` with a comment noting the prerequisite.

## Out of Scope

- Shift-range selection is not affected — ESC only clears state, not changes interaction modes.
- Flight / Pairing pane crew-row selections do not exist (only Roster has crew-row headers).
- No changes to Delete/Backspace behaviour.
