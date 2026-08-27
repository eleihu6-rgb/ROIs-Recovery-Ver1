# ESC — Clear All Gantt Pane Selections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ESC clear all selection state (task pucks + crew-row headers) across all open Live and Scenario Gantt panes simultaneously, add test probes for crew-row selection, write Playwright regression tests, and tighten the shortcut label in the dialog and Help.

**Architecture:** A single `clearAllGanttSelections()` utility reads open scenario tab IDs from `shell-store`, then calls `clear()` on each Live/Scenario selection store. The ESC handler in `use-keyboard.ts` delegates to this utility. Two new `__ganttTest` probes expose Live crew-row selection state for the tests.

**Tech Stack:** TypeScript, Zustand, React 19, Playwright

---

## File Map

| File | Action |
|---|---|
| `gantt/src/stores/scenario-roster-selection-store.ts` | Add `clear()` to interface + implementation |
| `gantt/src/utils/clear-gantt-selections.ts` | **Create** — `clearAllGanttSelections()` |
| `gantt/src/hooks/use-keyboard.ts` | ESC: call `clearAllGanttSelections()`; Delete: inline `selectedTaskIds` read |
| `gantt/src/components/common/keyboard-shortcuts-dialog.tsx` | Label update |
| `gantt/src/components/help/topics/live/live-keyboard.tsx` | Label update |
| `gantt/src/utils/gantt-test-hook.ts` | Add `liveRosterCrewRowIds` probe + `setLiveRosterCrewRow` driver |
| `gantt/src/version.ts` | `FRONTEND_VERSION` +1 |
| `e2e/tests/gantt/keyboard-esc-clear-selection.spec.ts` | **Create** — Playwright tests |

---

## Task 1 — Add `clear()` to `scenario-roster-selection-store`

**Files:**
- Modify: `gantt/src/stores/scenario-roster-selection-store.ts`

- [ ] **Step 1: Add `clear` to the `ScenarioRosterSelectionState` interface**

Open `gantt/src/stores/scenario-roster-selection-store.ts`. After the `selectCrewRow` declaration in the interface, add:

```ts
/** Clear both task and crew-row selections. */
clear: () => void
```

The interface block (lines 14–39) should end with:
```ts
  selectCrewRow: (crewId: string, mode: 'single' | 'toggle' | 'range', orderedIds: string[]) => void
  /** Clear both task and crew-row selections. */
  clear: () => void
```

- [ ] **Step 2: Add `clear` implementation inside `createStore()`**

Inside the `create<ScenarioRosterSelectionState>((set) => ({ ... }))` block, after the `selectCrewRow` implementation, add:

```ts
    clear: () => set({ selectedTaskIds: new Set<number>(), selectedCrewIds: new Set<string>() }),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/stores/scenario-roster-selection-store.ts
git commit -m "feat(scenario-roster-selection): add clear() method (mirrors flight/pairing stores)"
```

---

## Task 2 — Create `clearAllGanttSelections()` utility

**Files:**
- Create: `gantt/src/utils/clear-gantt-selections.ts`

- [ ] **Step 1: Create the utility file**

```ts
// gantt/src/utils/clear-gantt-selections.ts
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { getPaneStore } from '@/stores/pane-store'
import { useShellStore } from '@/stores/shell-store'
import { getScenarioRosterSelectionStore } from '@/stores/scenario-roster-selection-store'
import { getScenarioFlightSelectionStore } from '@/stores/scenario-flight-selection-store'
import { getScenarioPairingSelectionStore } from '@/stores/scenario-pairing-selection-store'

/**
 * Clear all gantt pane selection state across Live and every open Scenario tab.
 * Called by the ESC keyboard handler.
 *
 * Live: clears useGanttViewStore.selectedTaskIds (shared by all Live panes) and
 *       usePaneStore('live') roster row selection (crew-header highlight).
 * Scenario: for each open 'scenario-gantt:{id}' tab, clears the per-scenario
 *           roster/flight/pairing selection stores.
 */
export function clearAllGanttSelections(): void {
  // Live task puck selection (shared by all three Live panes)
  useGanttViewStore.getState().clearSelection()
  // Live crew-row header selection
  getPaneStore('live').getState().clearRowSelection('roster')

  // Scenario: iterate all open scenario tabs
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

- [ ] **Step 2: Verify imports compile**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/utils/clear-gantt-selections.ts
git commit -m "feat(gantt): add clearAllGanttSelections() utility"
```

---

## Task 3 — Update `use-keyboard.ts`

**Files:**
- Modify: `gantt/src/hooks/use-keyboard.ts`

The current hook subscribes to `clearSelection` and `selectedTaskIds` from `useGanttViewStore`. After this task:
- `clearSelection` is removed from hook deps (the utility calls it internally).
- `selectedTaskIds` is removed from hook deps (the Delete handler reads it inline via `getState()`).
- ESC calls `clearAllGanttSelections()`.
- Delete still calls `useGanttViewStore.getState().clearSelection()` (it only needs to clear Live task selection, not all panes).

- [ ] **Step 1: Add `clearAllGanttSelections` import and remove unused store subscriptions**

Replace the current import block and hook body with:

```ts
import { useEffect } from 'react'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useUiStore } from '@/stores/ui-store'
import { useRosterStore } from '@/stores/roster-store'
import { useFlightStore } from '@/stores/flight-store'
import { useDraftStore } from '@/stores/draft-store'
import { notify } from '@/utils/notify'
import { saveDraft } from '@/utils/save-draft'
import { clearAllGanttSelections } from '@/utils/clear-gantt-selections'

/**
 * Hook that binds global keyboard shortcuts for the Gantt chart.
 */
export const useKeyboard = () => {
  const zoomIn = useGanttViewStore((s) => s.zoomIn)
  const zoomOut = useGanttViewStore((s) => s.zoomOut)
  const closeContextMenu = useUiStore((s) => s.closeContextMenu)
  const removeTask = useRosterStore((s) => s.removeTask)
  const removeTasksByPairingAndCrew = useRosterStore((s) => s.removeTasksByPairingAndCrew)
  const undoOp = useDraftStore((s) => s.undoOp)
  const redoOp = useDraftStore((s) => s.redoOp)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }

      // Save: Ctrl+S / Cmd+S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveDraft()
        return
      }

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        const { operations } = useDraftStore.getState()
        if (operations.length > 0) undoOp()
        return
      }

      // Create Pairing from selected flights: Ctrl+Q
      if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
        e.preventDefault()
        const selected = useGanttViewStore.getState().selectedTaskIds
        if (selected.size === 0) return
        // Check if any selected IDs are flights
        const flightItems = useFlightStore.getState().items
        const allFlightIds = new Set<number>()
        for (const row of flightItems) {
          for (const flt of row.flights) allFlightIds.add(flt.id)
        }
        const flightIds = [...selected].filter((id) => allFlightIds.has(id))
        if (flightIds.length === 0) {
          notify.warning('Select flights first (Ctrl+Click in Flight Pane)')
          return
        }
        useDraftStore.getState().addOp(
          { type: 'create-pairing-from-flights', flightIds },
          [], [],
        )
        notify.info(`Pairing from ${flightIds.length} flight(s) will be created on Save`)
        useGanttViewStore.getState().clearSelection()
        return
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y
      if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) ||
          ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault()
        const { redoStack } = useDraftStore.getState()
        if (redoStack.length > 0) redoOp()
        return
      }

      switch (e.key) {
        case 'Escape':
          clearAllGanttSelections()
          closeContextMenu()
          break

        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            zoomIn()
          }
          break

        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            zoomOut()
          }
          break

        case 'Delete':
        case 'Backspace': {
          e.preventDefault()
          const selectedTaskIds = useGanttViewStore.getState().selectedTaskIds
          if (selectedTaskIds.size === 0) return

          const rosterItems = useRosterStore.getState().main.rosterItems

          // Group by pairingId+crewId for batch deletion
          const selectedRosterItems = rosterItems.filter((i) => selectedTaskIds.has(i.id))
          const pairingCrewGroups = new Map<string, { pairingId: number; crewId: string }>()
          const standaloneTaskIds: number[] = []

          for (const item of selectedRosterItems) {
            if (item.pairingId != null) {
              const key = `${item.pairingId}:${item.crewId}`
              pairingCrewGroups.set(key, { pairingId: item.pairingId, crewId: item.crewId })
            } else {
              standaloneTaskIds.push(item.id)
            }
          }

          // Delete entire pairing-crew combinations together
          for (const { pairingId, crewId } of pairingCrewGroups.values()) {
            removeTasksByPairingAndCrew('main', pairingId, crewId)
          }

          // Delete standalone tasks (without pairing)
          for (const id of standaloneTaskIds) {
            removeTask('main', id)
          }

          // Note: Pairing Pane selections are handled separately in Pairing Pane
          // Do NOT delete pairings when deleting roster items from Roster Pane
          // Roster deletion only removes roster_flight entries, not the pairing itself

          useGanttViewStore.getState().clearSelection()
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [zoomIn, zoomOut, closeContextMenu, removeTask, removeTasksByPairingAndCrew, undoOp, redoOp])
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/hooks/use-keyboard.ts
git commit -m "feat(gantt/keyboard): ESC clears all pane selections via clearAllGanttSelections()"
```

---

## Task 4 — Update shortcut label in dialog and Help

**Files:**
- Modify: `gantt/src/components/common/keyboard-shortcuts-dialog.tsx`
- Modify: `gantt/src/components/help/topics/live/live-keyboard.tsx`

- [ ] **Step 1: Update `keyboard-shortcuts-dialog.tsx`**

In `SHORTCUT_GROUPS`, find the Edit group's Esc row (line ~22) and change the label:

```ts
{ keys: ['Esc'], label: 'Clear all selections / Close menu' },
```

- [ ] **Step 2: Update `live-keyboard.tsx`**

In the `SHORTCUTS` array, find the Esc row (line ~11) and change the action:

```ts
{ group: 'Edit', key: 'Esc', action: 'Clear all selections / Close menu' },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/common/keyboard-shortcuts-dialog.tsx \
        gantt/src/components/help/topics/live/live-keyboard.tsx
git commit -m "docs(gantt): update ESC shortcut label to 'Clear all selections / Close menu'"
```

---

## Task 5 — Add `__ganttTest` probes for Live crew-row selection

**Files:**
- Modify: `gantt/src/utils/gantt-test-hook.ts`

The `GanttTestApi` interface (lines ~160–285) needs two new members:
- `liveRosterCrewRowIds(): string[]` — reads the Live pane's selected row IDs from `pane-store`
- `setLiveRosterCrewRow(crewId: string): void` — test driver: programmatically select a crew row

- [ ] **Step 1: Add the two new entries to the `GanttTestApi` interface**

Find the interface block near the `selectedTaskIds` and `selectRosterTasks` declarations (around line 200–204) and add the two new members right after them:

```ts
  /** Live roster pane crew-row header selection (drives the left-panel row highlight). */
  liveRosterCrewRowIds: () => string[]
  /** Test driver: programmatically select a crew row in the Live roster pane. */
  setLiveRosterCrewRow: (crewId: string) => void
```

- [ ] **Step 2: Add the implementations in `installGanttTestHook()`**

Find the `window.__ganttTest = { ... }` block (around line 1479) and add the two implementations alongside `selectedTaskIds` and `selectRosterTasks`. You'll need to import `getPaneStore` at the top of the function or use the already-imported reference.

First, add the import at the top of `gantt-test-hook.ts` if `getPaneStore` is not already imported:

```ts
import { getPaneStore } from '@/stores/pane-store'
```

Then in the `window.__ganttTest = { ... }` object add:

```ts
    liveRosterCrewRowIds: () => getPaneStore('live').getState().getSelectedRowIds('roster'),
    setLiveRosterCrewRow: (crewId: string) => {
      getPaneStore('live').getState().selectRow('roster', crewId)
    },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/utils/gantt-test-hook.ts
git commit -m "test(gantt): add liveRosterCrewRowIds + setLiveRosterCrewRow probes to __ganttTest"
```

---

## Task 6 — Bump FRONTEND_VERSION

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Increment `FRONTEND_VERSION` by 1**

Open `gantt/src/version.ts`. Find `FRONTEND_VERSION` and add 1 to the current value (check the current value in the file — do not assume it is 281).

- [ ] **Step 2: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore(gantt): bump FRONTEND_VERSION (ESC clear-all-selections + probes)"
```

---

## Task 7 — Write Playwright tests

**Files:**
- Create: `e2e/tests/gantt/keyboard-esc-clear-selection.spec.ts`

Before writing, confirm the existing `readHook` utility path:

```bash
grep -n "export.*readHook\|export.*counts" e2e/utils/gantt-hook.ts | head -5
```

Expected: lines showing `readHook` and `counts` are exported from `e2e/utils/gantt-hook.ts`.

- [ ] **Step 1: Create the test file**

```ts
/**
 * ESC key — clear all Gantt pane selections.
 *
 * Three tests cover the two main selection states that ESC must clear:
 *   ESC-01: Live roster TASK selection (useGanttViewStore.selectedTaskIds)
 *   ESC-02: Live roster CREW-ROW HEADER selection (usePaneStore 'live' row selection)
 *   ESC-03: ESC inside a text input is a no-op (guard in use-keyboard.ts must stay)
 *
 * Both Live task and crew-row tests use __ganttTest test drivers to seed selection
 * without needing canvas clicks — same determinism pattern as roster-box-delete.spec.ts.
 * ESC is dispatched as a real KeyboardEvent on the document body.
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

// ── helpers ─────────────────────────────────────────────────────────────────

/** Read Live selectedTaskIds from __ganttTest probe. */
const liveTaskSelection = (page: Page): Promise<number[]> =>
  readHook<number[]>(page, 'selectedTaskIds')

/** Read Live roster crew-row selection from __ganttTest probe. */
const liveCrewRowSelection = (page: Page): Promise<string[]> =>
  readHook<string[]>(page, 'liveRosterCrewRowIds')

/** Seed Live task selection directly (no canvas click needed). */
const seedTaskSelection = (page: Page, ids: number[]): Promise<void> =>
  page.evaluate((arg) => {
    (window.__ganttTest as unknown as { selectRosterTasks: (i: number[]) => void }).selectRosterTasks(arg)
  }, ids)

/** Seed Live crew-row selection directly. */
const seedCrewRowSelection = (page: Page, crewId: string): Promise<void> =>
  page.evaluate((arg) => {
    (window.__ganttTest as unknown as { setLiveRosterCrewRow: (id: string) => void }).setLiveRosterCrewRow(arg)
  }, crewId)

/** Press ESC on the document body (simulates user pressing the key outside any input). */
const pressEsc = (page: Page): Promise<void> =>
  page.evaluate(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })

// ── suite ────────────────────────────────────────────────────────────────────

test.describe('ESC — clear all Gantt pane selections', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    // Wait until at least some roster items are loaded so we have real ids to select.
    await expect.poll(async () => (await counts(page)).roster, {
      message: 'roster items must load before seeding selection',
      timeout: 30_000,
    }).toBeGreaterThan(0)
  })

  test('ESC-01 — ESC clears Live roster task selection', async ({ page }) => {
    // Get the real roster item ids from the hook so we seed valid ids.
    const items = await readHook<Array<{ id: number }>>(page, 'roster')
    expect(items.length, 'need at least one roster item').toBeGreaterThan(0)
    const ids = items.slice(0, 2).map((i) => i.id)

    // Seed selection.
    await seedTaskSelection(page, ids)
    await expect
      .poll(() => liveTaskSelection(page), { timeout: 3_000, message: 'task selection must be seeded' })
      .toEqual(ids)

    // Press ESC — must clear.
    await pressEsc(page)
    await expect
      .poll(() => liveTaskSelection(page), { timeout: 3_000, message: 'ESC must clear task selection' })
      .toEqual([])
  })

  test('ESC-02 — ESC clears Live roster crew-row header selection', async ({ page }) => {
    // Pick the first crew id from the roster items.
    const items = await readHook<Array<{ crewId: string }>>(page, 'roster')
    expect(items.length, 'need at least one roster item for a crewId').toBeGreaterThan(0)
    const crewId = items[0].crewId

    // Seed crew-row selection.
    await seedCrewRowSelection(page, crewId)
    await expect
      .poll(() => liveCrewRowSelection(page), { timeout: 3_000, message: 'crew-row selection must be seeded' })
      .toContain(crewId)

    // Press ESC — must clear.
    await pressEsc(page)
    await expect
      .poll(() => liveCrewRowSelection(page), { timeout: 3_000, message: 'ESC must clear crew-row selection' })
      .toEqual([])
  })

  test('ESC-03 — ESC inside a text input is a no-op (guard must stay)', async ({ page }) => {
    // Seed some task selection first.
    const items = await readHook<Array<{ id: number }>>(page, 'roster')
    expect(items.length).toBeGreaterThan(0)
    const ids = [items[0].id]
    await seedTaskSelection(page, ids)
    await expect
      .poll(() => liveTaskSelection(page), { timeout: 3_000 })
      .toEqual(ids)

    // Focus any visible text input (the date-range start input in the toolbar).
    const dateInput = page.locator('input[type="text"]').first()
    await dateInput.focus()

    // Press ESC — the guard (HTMLInputElement check) must prevent clearing.
    await page.keyboard.press('Escape')

    // Selection must be UNCHANGED.
    const afterEsc = await liveTaskSelection(page)
    expect(afterEsc, 'selection must be unchanged after ESC in an input').toEqual(ids)
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npx playwright test e2e/tests/gantt/keyboard-esc-clear-selection.spec.ts --reporter=list
```

Expected output:
```
  ✓ ESC-01 — ESC clears Live roster task selection
  ✓ ESC-02 — ESC clears Live roster crew-row header selection
  ✓ ESC-03 — ESC inside a text input is a no-op
  3 passed
```

- [ ] **Step 3: Fix any failures before committing**

If a test fails, diagnose and fix the implementation — do not weaken the assertions.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/gantt/keyboard-esc-clear-selection.spec.ts
git commit -m "test(e2e/gantt): Playwright regression for ESC clear-all selections (ESC-01/02/03)"
```

---

## Task 8 — Run UI standard check

- [ ] **Step 1: Run the check**

```bash
cd /home/yuan.z/rois/rois-ai && npm run check:ui
```

Expected: **0 hard violations**. If any exist, fix them before proceeding.

---

## Verification Checklist

After all tasks are done, run these in order:

```bash
# 1. TypeScript — no errors
cd gantt && npx tsc --noEmit

# 2. UI standard — 0 hard violations
cd .. && npm run check:ui

# 3. Playwright — all 3 tests pass
npx playwright test e2e/tests/gantt/keyboard-esc-clear-selection.spec.ts --reporter=list
```

Paste the final `3 passed` Playwright output before marking done (§No-Illusion).
