# Roster Condition Chips + Universal Sorting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add filter/sort condition chips to the roster pane title bars (aligned to the crew-list/canvas "virtual line") and a multi-key "Universal Sorting" dialog, with Seniority as the headline sort field.

**Architecture:** Extend the per-pane sort state in `pane-store` from a single column to an ordered `sortCriteria[]` (keeping the existing `sortColumn`/`sortDirection` as derived views so the canvas header indicator and header-click path keep working). `RosterPane` gains a multi-key comparator, a new `SortDialog` (built on `@rois/ui` `AppDialog`), and passes both filter and sort chips to `PaneToolbar`, which renders them in a Row-2 strip indented by the shared `leftPanelWidth`.

**Tech Stack:** React 19, TypeScript, Zustand, `@rois/ui` (AppDialog/Button), Canvas panes, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-06-02-roster-chips-and-universal-sorting-design.md`

**Conventions for every task:**
- Run from repo root: `/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS`
- Type-check gantt with: `cd gantt && npx tsc --noEmit` (Note from project memory: there are **2 pre-existing** gantt tsc errors unrelated to this work — confirm your changes add **no new** errors, don't try to fix the pre-existing ones).
- Run e2e from `e2e/`: servers auto-start via Playwright `webServer` (`reuseExistingServer: true`). Gantt dev server must be reachable at `http://localhost:5173/fpqe/gantt/`.
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `gantt/src/stores/pane-store.ts` | Per-pane `sortCriteria[]` model + derived single-key getters + actions | Modify |
| `gantt/src/components/panes/roster-pane.tsx` | Multi-key sort engine; wire `SortDialog`, sort chips, `leftPanelWidth` | Modify |
| `gantt/src/components/panes/sort-dialog.tsx` | Universal Sorting dialog (dual list, priority, double-click move, Asc/Desc) | Create |
| `gantt/src/components/panes/pane-toolbar.tsx` | Row-2 strip: `sortChips` prop, `leftPanelWidth` indent, pill styling, testids | Modify |
| `gantt/src/utils/gantt-test-hook.ts` | `rosterSort()` introspection | Modify |
| `gantt/src/version.ts` | `FRONTEND_VERSION` 43 → 44 | Modify |
| `e2e/tests/gantt/roster-universal-sorting.spec.ts` | Multi-step sort behavior test | Create |
| `e2e/tests/gantt/roster-condition-chips.spec.ts` | Sort-chip lifecycle + alignment test | Create |

---

## Task 1: Extend pane-store with multi-key `sortCriteria`

**Files:**
- Modify: `gantt/src/stores/pane-store.ts`

- [ ] **Step 1: Add the `SortCriterion` type and replace the per-pane sort fields**

In `gantt/src/stores/pane-store.ts`, just below the imports (after line 4), add:

```typescript
/** One sort key; priority is the array index in PaneInteractiveState.sortCriteria. */
export interface SortCriterion {
  column: string
  direction: 'asc' | 'desc'
}
```

In `interface PaneInteractiveState` (lines 57-68), **remove** these two lines:

```typescript
  sortColumn: string | null
  sortDirection: 'asc' | 'desc'
```

and **add** in their place:

```typescript
  /** Ordered sort keys (index 0 = primary). Empty = no sort. */
  sortCriteria: SortCriterion[]
```

In `createDefaultInteractiveState` (lines 70-78), **remove**:

```typescript
  sortColumn: null,
  sortDirection: 'asc',
```

and **add**:

```typescript
  sortCriteria: [],
```

- [ ] **Step 2: Update the store interface (the `PaneStore` `Per-pane sort` block, lines 115-118)**

Replace:

```typescript
  /** Per-pane sort */
  getSortColumn: (paneType: PaneType) => string | null
  getSortDirection: (paneType: PaneType) => 'asc' | 'desc'
  setSortColumn: (paneType: PaneType, column: string) => void
```

with:

```typescript
  /** Per-pane sort (multi-key with priority) */
  getSortColumn: (paneType: PaneType) => string | null
  getSortDirection: (paneType: PaneType) => 'asc' | 'desc'
  getSortCriteria: (paneType: PaneType) => SortCriterion[]
  /** Header-click sort: replace criteria with a single toggled key */
  setSortColumn: (paneType: PaneType, column: string) => void
  /** Dialog Apply: replace the full criteria list */
  setSortCriteria: (paneType: PaneType, criteria: SortCriterion[]) => void
  /** Chip ×: drop one key */
  removeSortCriterion: (paneType: PaneType, column: string) => void
```

- [ ] **Step 3: Replace the getter/action implementations**

Replace the existing implementations (lines 246-268, the `getSortColumn` / `getSortDirection` / `setSortColumn` block) with:

```typescript
  getSortColumn: (paneType) => get().interactiveState[paneType].sortCriteria[0]?.column ?? null,

  getSortDirection: (paneType) => get().interactiveState[paneType].sortCriteria[0]?.direction ?? 'asc',

  getSortCriteria: (paneType) => get().interactiveState[paneType].sortCriteria,

  setSortColumn: (paneType, column) => {
    set((state) => {
      const primary = state.interactiveState[paneType].sortCriteria[0]
      const newDirection: 'asc' | 'desc' =
        primary && primary.column === column && primary.direction === 'asc' ? 'desc' : 'asc'
      return {
        interactiveState: {
          ...state.interactiveState,
          [paneType]: {
            ...state.interactiveState[paneType],
            sortCriteria: [{ column, direction: newDirection }],
          },
        },
      }
    })
  },

  setSortCriteria: (paneType, criteria) => {
    set((state) => ({
      interactiveState: {
        ...state.interactiveState,
        [paneType]: {
          ...state.interactiveState[paneType],
          sortCriteria: criteria,
        },
      },
    }))
  },

  removeSortCriterion: (paneType, column) => {
    set((state) => ({
      interactiveState: {
        ...state.interactiveState,
        [paneType]: {
          ...state.interactiveState[paneType],
          sortCriteria: state.interactiveState[paneType].sortCriteria.filter((c) => c.column !== column),
        },
      },
    }))
  },
```

- [ ] **Step 4: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no **new** errors referencing `pane-store.ts`, `sortColumn`, or `sortCriteria`. (The 2 known pre-existing errors may still appear — they are unrelated.)

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/pane-store.ts
git commit -m "feat(gantt): multi-key sortCriteria in pane-store

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Multi-key sort engine in RosterPane

**Files:**
- Modify: `gantt/src/components/panes/roster-pane.tsx`

- [ ] **Step 1: Bind the new store selectors**

In `roster-pane.tsx`, find the sort bindings (lines 182-184):

```typescript
  const sortColumn = usePaneStore((s) => s.getSortColumn(legacyPaneType))
  const sortDirection = usePaneStore((s) => s.getSortDirection(legacyPaneType))
  const setSortColumn = usePaneStore((s) => s.setSortColumn)
```

Add immediately after line 184:

```typescript
  const sortCriteria = usePaneStore((s) => s.getSortCriteria(legacyPaneType))
  const setSortCriteria = usePaneStore((s) => s.setSortCriteria)
  const removeSortCriterion = usePaneStore((s) => s.removeSortCriterion)
```

(Keep `sortColumn`/`sortDirection`/`setSortColumn` — they still drive the canvas header indicator and header-click toggle.)

- [ ] **Step 2: Replace the single-key sort `useMemo` with a multi-key comparator**

Replace the block at lines 310-321:

```typescript
  // Sorted panel rows + sorted crew IDs for canvas rendering
  const { sortedRows, sortedCrewIds } = useMemo(() => {
    if (!sortColumn) return { sortedRows: unsortedPanelRows, sortedCrewIds: selectedCrewIds }
    const sorted = [...unsortedPanelRows].sort((a, b) => {
      const va = String(a.values[sortColumn] ?? '')
      const vb = String(b.values[sortColumn] ?? '')
      const na = Number(va), nb = Number(vb)
      const cmp = !isNaN(na) && !isNaN(nb) ? na - nb : va.localeCompare(vb)
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return { sortedRows: sorted, sortedCrewIds: sorted.map((r) => r.rowId) }
  }, [unsortedPanelRows, sortColumn, sortDirection, selectedCrewIds])
```

with:

```typescript
  // Sorted panel rows + sorted crew IDs for canvas rendering.
  // Multi-key: iterate criteria in priority order; first non-zero comparison wins.
  // Numeric-aware per key: both values numeric & non-empty -> numeric compare, else localeCompare.
  const { sortedRows, sortedCrewIds } = useMemo(() => {
    if (sortCriteria.length === 0) {
      return { sortedRows: unsortedPanelRows, sortedCrewIds: selectedCrewIds }
    }
    const sorted = [...unsortedPanelRows].sort((a, b) => {
      for (const { column, direction } of sortCriteria) {
        const va = String(a.values[column] ?? '')
        const vb = String(b.values[column] ?? '')
        const na = Number(va), nb = Number(vb)
        const numeric = va !== '' && vb !== '' && !isNaN(na) && !isNaN(nb)
        const cmp = numeric ? na - nb : va.localeCompare(vb)
        if (cmp !== 0) return direction === 'asc' ? cmp : -cmp
      }
      return 0
    })
    return { sortedRows: sorted, sortedCrewIds: sorted.map((r) => r.rowId) }
  }, [unsortedPanelRows, sortCriteria, selectedCrewIds])
```

- [ ] **Step 3: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors. `sortColumn`/`sortDirection` remain used (lines 749-750), so no "unused variable" errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/panes/roster-pane.tsx
git commit -m "feat(gantt): multi-key roster sort engine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Write the Universal Sorting e2e test (RED)

**Files:**
- Create: `e2e/tests/gantt/roster-universal-sorting.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `e2e/tests/gantt/roster-universal-sorting.spec.ts`:

```typescript
/**
 * Universal Sorting dialog — multi-key sort, Seniority first.
 *
 * Drives the dialog (double-click to move criteria, Asc/Desc), then verifies the
 * DISPLAYED roster order via window.__ganttTest.rosterPanel() (store/render truth,
 * not pixels) and the committed criteria via __ganttTest.rosterSort(). Cross-checks
 * seniority against crew-store. Anti-illusion: asserts actual ordering, not visibility.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

/** Seniority values (display order), empties removed, as numbers. */
const seniorityNums = (panel: Array<{ seniority: string }>): number[] =>
  panel.map((r) => r.seniority).filter((s) => s !== '' && /^\d+(\.\d+)?$/.test(s)).map(Number)

const isNonDecreasing = (xs: number[]): boolean => xs.every((v, i) => i === 0 || xs[i - 1] <= v)
const isNonIncreasing = (xs: number[]): boolean => xs.every((v, i) => i === 0 || xs[i - 1] >= v)

test.describe('Universal Sorting', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
    await expect.poll(async () => (await page.evaluate(() => window.__ganttTest!.rosterPanel())).length)
      .toBeGreaterThan(0)
  })

  test('sorts roster by Seniority ascending then descending @smoke', async ({ page }) => {
    // Open the sort dialog from the first roster pane's toolbar.
    await page.getByTitle('Sort', { exact: true }).first().click()
    const dialog = page.getByTestId('sort-dialog')
    await expect(dialog).toBeVisible()

    // Double-click SENIORITY in the available list -> moves to Selected with priority 1.
    await dialog.getByTestId('sort-available-seniority').dblclick()
    await expect(dialog.getByTestId('sort-selected-seniority')).toContainText('1')

    // Ascending (default) + Apply.
    await dialog.getByTestId('sort-order-asc').check()
    await dialog.getByTestId('sort-apply').click()
    await expect(dialog).toBeHidden()

    // Committed criteria.
    expect(await page.evaluate(() => window.__ganttTest!.rosterSort()))
      .toEqual([{ column: 'seniority', direction: 'asc' }])

    // Displayed order is non-decreasing by seniority, cross-checked vs crew-store.
    const [panelAsc, crew] = await page.evaluate(() => [
      window.__ganttTest!.rosterPanel(),
      window.__ganttTest!.crewSeniority(),
    ])
    const ascNums = seniorityNums(panelAsc)
    expect(ascNums.length, 'some crew have seniority').toBeGreaterThan(0)
    expect(isNonDecreasing(ascNums), `ascending order: ${ascNums.slice(0, 8)}`).toBe(true)
    const known = new Map(crew.map((c) => [c.crewId, c.seniorityNum]))
    for (const row of panelAsc) expect(known.has(row.crewId)).toBe(true)

    // Re-open, switch to Descending, Apply.
    await page.getByTitle('Sort', { exact: true }).first().click()
    await page.getByTestId('sort-order-desc').check()
    await page.getByTestId('sort-apply').click()
    await expect(page.getByTestId('sort-dialog')).toBeHidden()

    const panelDesc = await page.evaluate(() => window.__ganttTest!.rosterPanel())
    const descNums = seniorityNums(panelDesc)
    expect(isNonIncreasing(descNums), `descending order: ${descNums.slice(0, 8)}`).toBe(true)
  })

  test('double-click moves a criterion back and clears the sort', async ({ page }) => {
    await page.getByTitle('Sort', { exact: true }).first().click()
    const dialog = page.getByTestId('sort-dialog')

    // Add then remove via double-click on each side.
    await dialog.getByTestId('sort-available-seniority').dblclick()
    await expect(dialog.getByTestId('sort-selected-seniority')).toBeVisible()
    await dialog.getByTestId('sort-selected-seniority').dblclick()
    await expect(dialog.getByTestId('sort-available-seniority')).toBeVisible()
    await expect(dialog.getByTestId('sort-selected-seniority')).toBeHidden()

    await dialog.getByTestId('sort-apply').click()
    expect(await page.evaluate(() => window.__ganttTest!.rosterSort())).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run from `e2e/`:
```bash
npx playwright test --config=config/playwright.config.ts tests/gantt/roster-universal-sorting.spec.ts --project=gantt --reporter=list
```
Expected: FAIL — the `Sort` button does nothing yet / `sort-dialog` never appears / `rosterSort` is undefined. This confirms the test exercises the not-yet-built dialog.

- [ ] **Step 3: Commit the failing test**

```bash
git add e2e/tests/gantt/roster-universal-sorting.spec.ts
git commit -m "test(gantt): universal sorting e2e (red)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Add `rosterSort()` introspection hook

**Files:**
- Modify: `gantt/src/utils/gantt-test-hook.ts`

- [ ] **Step 1: Import the pane store**

Confirm `usePaneStore` is imported at the top of `gantt-test-hook.ts`. If absent, add with the other store imports:

```typescript
import { usePaneStore } from '@/stores/pane-store'
```

- [ ] **Step 2: Declare the method on the API interface**

In the `GanttTestApi` interface, immediately after the `crewSeniority` declaration (line 76), add:

```typescript
  /** Active sort criteria (priority-ordered) for a roster pane. Default: roster-main. */
  rosterSort: (paneType?: 'roster-main' | 'roster-sub') => Array<{ column: string; direction: 'asc' | 'desc' }>
```

- [ ] **Step 3: Implement the function**

Immediately after the `crewSeniority` implementation (after line 232), add:

```typescript
const rosterSort = (
  paneType: 'roster-main' | 'roster-sub' = 'roster-main',
): Array<{ column: string; direction: 'asc' | 'desc' }> =>
  usePaneStore.getState().getSortCriteria(paneType).map((c) => ({ column: c.column, direction: c.direction }))
```

- [ ] **Step 4: Register it on the hook object**

In `installGanttTestHook`, in the `window.__ganttTest = { ... }` literal, add `rosterSort,` immediately after `crewSeniority,` (line 319):

```typescript
    crewSeniority,
    rosterSort,
```

- [ ] **Step 5: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/utils/gantt-test-hook.ts
git commit -m "test(gantt): expose rosterSort introspection hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Create the Universal Sorting dialog

**Files:**
- Create: `gantt/src/components/panes/sort-dialog.tsx`

- [ ] **Step 1: Write the component**

Create `gantt/src/components/panes/sort-dialog.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { AppDialog, Button } from '@rois/ui'
import { ArrowUpDown, ChevronRight, ChevronLeft, ChevronUp, ChevronDown } from 'lucide-react'
import type { SortCriterion } from '@/stores/pane-store'

/** A field the user may sort by (derived from a pane's column config). */
export interface SortField {
  key: string
  label: string
}

interface SortDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Shown as the single pane tab (placeholder for future multi-pane tabs). */
  paneLabel: string
  /** All sortable fields for this pane. */
  fields: SortField[]
  /** Current committed criteria (used to seed the dialog when it opens). */
  initialCriteria: SortCriterion[]
  /** Commit handler — called on Apply with the new priority-ordered criteria. */
  onApply: (criteria: SortCriterion[]) => void
}

/**
 * Universal Sorting dialog. Dual list (Sort Item / Selected Item + Priority) with
 * arrow buttons and double-click to move between lists; a single global Asc/Desc
 * applies to all selected criteria. Built on the standard @rois/ui AppDialog.
 */
export const SortDialog = ({ open, onOpenChange, paneLabel, fields, initialCriteria, onApply }: SortDialogProps) => {
  const [selected, setSelected] = useState<string[]>([])
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [availHi, setAvailHi] = useState<string | null>(null)
  const [selHi, setSelHi] = useState<string | null>(null)

  // Seed local state each time the dialog opens (committed only on Apply).
  useEffect(() => {
    if (!open) return
    setSelected(initialCriteria.map((c) => c.column))
    setOrder(initialCriteria[0]?.direction ?? 'asc')
    setAvailHi(null)
    setSelHi(null)
  }, [open, initialCriteria])

  const labelOf = (key: string): string => fields.find((f) => f.key === key)?.label ?? key
  const available = fields.filter((f) => !selected.includes(f.key)).map((f) => f.key)

  const moveToSelected = (key: string): void => {
    setSelected((prev) => (prev.includes(key) ? prev : [...prev, key]))
    setAvailHi(null)
    setSelHi(key)
  }
  const moveToAvailable = (key: string): void => {
    setSelected((prev) => prev.filter((k) => k !== key))
    setSelHi(null)
    setAvailHi(key)
  }
  const moveUp = (key: string): void => {
    setSelected((prev) => {
      const i = prev.indexOf(key)
      if (i <= 0) return prev
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  }
  const moveDown = (key: string): void => {
    setSelected((prev) => {
      const i = prev.indexOf(key)
      if (i < 0 || i >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
      return next
    })
  }

  const handleApply = (): void => {
    onApply(selected.map((column) => ({ column, direction: order })))
    onOpenChange(false)
  }

  const moveBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40'

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      data-testid="sort-dialog"
      className="sm:max-w-[680px]"
      icon={<ArrowUpDown className="h-4 w-4" />}
      title="Universal Sorting"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="sort-cancel">Cancel</Button>
          <Button onClick={handleApply} data-testid="sort-apply">Apply</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {/* Single pane tab (placeholder for future multi-pane tabs) */}
        <div className="flex items-center gap-1 border-b border-border">
          <span className="rounded-t bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{paneLabel}</span>
        </div>

        <div className="flex items-stretch gap-2">
          {/* Sort Item (available) */}
          <div className="flex-1" data-testid="sort-available">
            <div className="border-b border-border bg-muted/40 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sort Item
            </div>
            <ul className="h-56 overflow-auto rounded-sm border border-border">
              {available.map((key) => (
                <li
                  key={key}
                  data-testid={`sort-available-${key}`}
                  onClick={() => setAvailHi(key)}
                  onDoubleClick={() => moveToSelected(key)}
                  className={['cursor-pointer px-2 py-1 text-xs', availHi === key ? 'bg-primary/15 text-primary' : 'hover:bg-accent/50'].join(' ')}
                >
                  {labelOf(key)}
                </li>
              ))}
            </ul>
          </div>

          {/* Move controls */}
          <div className="flex flex-col items-center justify-center gap-2">
            <button data-testid="sort-move-right" disabled={!availHi} onClick={() => availHi && moveToSelected(availHi)} className={moveBtn} title="Add to sort">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button data-testid="sort-move-left" disabled={!selHi} onClick={() => selHi && moveToAvailable(selHi)} className={moveBtn} title="Remove from sort">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button data-testid="sort-move-up" disabled={!selHi} onClick={() => selHi && moveUp(selHi)} className={moveBtn} title="Raise priority">
              <ChevronUp className="h-4 w-4" />
            </button>
            <button data-testid="sort-move-down" disabled={!selHi} onClick={() => selHi && moveDown(selHi)} className={moveBtn} title="Lower priority">
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {/* Selected Item + Priority */}
          <div className="flex-1" data-testid="sort-selected">
            <div className="flex border-b border-border bg-muted/40 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="flex-1 px-2 py-1">Selected Item</span>
              <span className="w-14 border-l border-border px-2 py-1 text-center">Priority</span>
            </div>
            <ul className="h-56 overflow-auto rounded-sm border border-border">
              {selected.map((key, idx) => (
                <li
                  key={key}
                  data-testid={`sort-selected-${key}`}
                  onClick={() => setSelHi(key)}
                  onDoubleClick={() => moveToAvailable(key)}
                  className={['flex cursor-pointer text-xs', selHi === key ? 'bg-primary/15 text-primary' : 'hover:bg-accent/50'].join(' ')}
                >
                  <span className="flex-1 px-2 py-1">{labelOf(key)}</span>
                  <span className="w-14 border-l border-border px-2 py-1 text-center font-mono tabular-nums">{idx + 1}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Sort order — single global radio for all selected criteria */}
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">Sort Order:</span>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="sort-order" checked={order === 'asc'} onChange={() => setOrder('asc')} data-testid="sort-order-asc" />
            Ascending
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="sort-order" checked={order === 'desc'} onChange={() => setOrder('desc')} data-testid="sort-order-desc" />
            Descending
          </label>
        </div>
      </div>
    </AppDialog>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors. (`AppDialog` and `Button` are exported from `@rois/ui`; `AppDialog` accepts `data-testid`.)

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/panes/sort-dialog.tsx
git commit -m "feat(gantt): Universal Sorting dialog component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Wire the dialog into RosterPane (GREEN for Task 3)

**Files:**
- Modify: `gantt/src/components/panes/roster-pane.tsx`

- [ ] **Step 1: Add imports**

After the existing `import { VerticalSplitter } ...` line (line 37), add:

```typescript
import { SortDialog, type SortField } from './sort-dialog'
```

- [ ] **Step 2: Add dialog open state**

Next to the other `useState` hooks near the top of the component (after line 72, `const [quickFilterOpen, setQuickFilterOpen] = useState(false)`), add:

```typescript
  const [sortDialogOpen, setSortDialogOpen] = useState(false)
```

- [ ] **Step 3: Derive the sortable fields from the pane's column config**

Find the existing visible-columns binding (line 323): `const columns = useColumnStore((s) => s.getVisibleColumns(legacyPaneType))`.
Add immediately after it:

```typescript
  const allColumns = useColumnStore((s) => s.getColumns(legacyPaneType))
  const sortFields = useMemo<SortField[]>(
    () => allColumns.map((c) => ({ key: c.key, label: c.label })),
    [allColumns],
  )
```

- [ ] **Step 4: Pass `onSortClick` to the toolbar**

In the `<PaneToolbar ... />` element (starts line 713), add this prop (e.g. right after the `title=...` prop on line 715):

```typescript
        onSortClick={() => setSortDialogOpen(true)}
```

- [ ] **Step 5: Render the dialog**

Immediately after the closing `/>` of `<PaneToolbar ... />` (line 731) and before `{quickFilterOpen && (` (line 732), add:

```tsx
      <SortDialog
        open={sortDialogOpen}
        onOpenChange={setSortDialogOpen}
        paneLabel={legacyPaneType === 'roster-main' ? 'Roster Main' : 'Roster Sub'}
        fields={sortFields}
        initialCriteria={sortCriteria}
        onApply={(criteria) => setSortCriteria(legacyPaneType, criteria)}
      />
```

- [ ] **Step 6: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Run the sorting test — expect PASS**

Run from `e2e/`:
```bash
npx playwright test --config=config/playwright.config.ts tests/gantt/roster-universal-sorting.spec.ts --project=gantt --reporter=list
```
Expected: PASS (both tests). If the `Sort` button title collides, confirm `pane-toolbar.tsx:216` renders `title="Sort"` on the `ArrowUpDown` button and that `onSortClick` is now provided.

- [ ] **Step 8: Commit**

```bash
git add gantt/src/components/panes/roster-pane.tsx
git commit -m "feat(gantt): open Universal Sorting dialog from roster pane

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Write the condition-chips e2e test (RED)

**Files:**
- Create: `e2e/tests/gantt/roster-condition-chips.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `e2e/tests/gantt/roster-condition-chips.spec.ts`:

```typescript
/**
 * Pane condition chips — the active sort renders as a chip on the roster title bar,
 * the chip strip starts at the crew-list/canvas "virtual line" (left indent), and the
 * chip's × removes the sort. Filter chips are pre-existing; this covers the new sort
 * chips + alignment. Truth via DOM (chips are HTML) + __ganttTest.rosterSort().
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Pane condition chips', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
    await expect.poll(async () => (await page.evaluate(() => window.__ganttTest!.rosterPanel())).length)
      .toBeGreaterThan(0)
  })

  test('active sort shows an indented chip and × removes it @smoke', async ({ page }) => {
    // No sort yet -> no sort chip.
    await expect(page.getByTestId('pane-sort-chip')).toHaveCount(0)

    // Apply a Seniority sort via the dialog.
    await page.getByTitle('Sort', { exact: true }).first().click()
    const dialog = page.getByTestId('sort-dialog')
    await dialog.getByTestId('sort-available-seniority').dblclick()
    await dialog.getByTestId('sort-order-asc').check()
    await dialog.getByTestId('sort-apply').click()
    await expect(dialog).toBeHidden()

    // A sort chip appears with the column label (SEN) and an ascending arrow.
    const chip = page.getByTestId('pane-sort-chip').first()
    await expect(chip).toContainText('SEN')
    await expect(chip).toContainText('↑')

    // The condition strip is indented to the virtual line (non-zero left padding).
    const padLeft = await page.getByTestId('pane-condition-strip').first().evaluate(
      (el) => parseFloat(getComputedStyle(el).paddingLeft),
    )
    expect(padLeft, 'chip strip indented to the crew-list/canvas boundary').toBeGreaterThan(0)

    // Removing the chip clears the sort.
    await chip.getByRole('button').click()
    await expect(page.getByTestId('pane-sort-chip')).toHaveCount(0)
    expect(await page.evaluate(() => window.__ganttTest!.rosterSort())).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run from `e2e/`:
```bash
npx playwright test --config=config/playwright.config.ts tests/gantt/roster-condition-chips.spec.ts --project=gantt --reporter=list
```
Expected: FAIL — `pane-sort-chip` / `pane-condition-strip` testids don't exist yet (sort applies, but no chip renders).

- [ ] **Step 3: Commit the failing test**

```bash
git add e2e/tests/gantt/roster-condition-chips.spec.ts
git commit -m "test(gantt): roster condition chips e2e (red)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Render chips & alignment in PaneToolbar

**Files:**
- Modify: `gantt/src/components/panes/pane-toolbar.tsx`

- [ ] **Step 1: Add the `SortChip` type and toolbar props**

In `pane-toolbar.tsx`, after the `FilterChip` interface (lines 29-35), add:

```typescript
/** Sort chip displayed in the condition strip (one per active sort criterion). */
export interface SortChip {
  key: string
  label: string
  direction: 'asc' | 'desc'
  onRemove: () => void
}
```

In `interface PaneToolbarProps` (lines 37-77), add these props (place after `filterChips?: FilterChip[]`, line 56):

```typescript
  /** Active sort chips (priority-ordered) */
  sortChips?: SortChip[]
  /** Left panel width — indents the condition strip to the crew-list/canvas boundary */
  leftPanelWidth?: number
```

- [ ] **Step 2: Destructure the new props**

In the component's destructured params (lines 83-107), add `sortChips,` and `leftPanelWidth,` (e.g. after `filterChips,` on line 95).

- [ ] **Step 3: Update the show condition**

Replace line 112:

```typescript
  const hasFilters = filterChips && filterChips.length > 0
```

with:

```typescript
  const hasFilters = filterChips && filterChips.length > 0
  const hasSortChips = sortChips && sortChips.length > 0
```

- [ ] **Step 4: Rework Row 2 (the filter strip → condition strip)**

Replace the entire Row 2 block (lines 275-324, from `{/* Row 2: Filter strip (only when has filters) */}` through its closing `)}`) with:

```tsx
      {/* Row 2: Condition strip — filter + sort chips, indented to the virtual line */}
      {(hasFilters || hasSortChips) && (
        <div
          className="flex h-6 shrink-0 items-center gap-1 border-b bg-muted/20 pr-2"
          style={{ paddingLeft: leftPanelWidth ?? 8 }}
          data-testid="pane-condition-strip"
        >
          {/* Optional sort label (legacy text indicator, when provided) */}
          {sortLabel && (
            <span className="text-2xs text-muted-foreground mr-1">Sorted: {sortLabel}</span>
          )}

          {/* Chips (filters then sorts) */}
          <div className="flex flex-wrap items-center gap-1">
            {filterChips?.map((chip, index) => {
              const sessionColor = SESSION_COLORS[chip.sessionIndex % SESSION_COLORS.length]
              return (
                <div
                  key={`${chip.sessionId}-${chip.key}-${index}`}
                  data-testid="pane-filter-chip"
                  title={`${chip.key}: ${chip.value}`}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium"
                  style={{ backgroundColor: sessionColor, color: '#fff' }}
                >
                  <span>{chip.value}</span>
                  {onRemoveFilter && (
                    <button
                      className="inline-flex h-3 w-3 items-center justify-center rounded-full hover:bg-black/20"
                      onClick={() => onRemoveFilter(chip.sessionId, chip.key)}
                      title="Remove filter"
                    >
                      <X className="h-2 w-2" />
                    </button>
                  )}
                </div>
              )
            })}

            {sortChips?.map((chip) => (
              <div
                key={`sort-${chip.key}`}
                data-testid="pane-sort-chip"
                title={`Sorted by ${chip.label} (${chip.direction === 'asc' ? 'ascending' : 'descending'})`}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-2xs font-medium text-secondary-foreground"
              >
                <span>{chip.direction === 'asc' ? '↑' : '↓'} {chip.label}</span>
                <button
                  className="inline-flex h-3 w-3 items-center justify-center rounded-full hover:bg-foreground/10"
                  onClick={chip.onRemove}
                  title="Remove sort"
                >
                  <X className="h-2 w-2" />
                </button>
              </div>
            ))}
          </div>

          {/* Clear all filters */}
          {onClearAll && hasFilters && (
            <button
              className="ml-auto text-2xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={onClearAll}
            >
              Clear all
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 5: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/panes/pane-toolbar.tsx
git commit -m "feat(gantt): condition chips strip with sort chips + virtual-line indent

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Wire chips from RosterPane (GREEN for Task 7)

**Files:**
- Modify: `gantt/src/components/panes/roster-pane.tsx`

- [ ] **Step 1: Update the PaneToolbar import to include `SortChip`**

Change line 8 from:

```typescript
import { PaneToolbar, type FilterChip } from './pane-toolbar'
```

to:

```typescript
import { PaneToolbar, type FilterChip, type SortChip } from './pane-toolbar'
```

- [ ] **Step 2: Bind `leftPanelWidth`**

Near the other `usePaneStore` bindings (after line 186), add:

```typescript
  const leftPanelWidth = usePaneStore((s) => s.leftPanelWidth)
```

- [ ] **Step 3: Build the sort chips**

After the `sortFields` memo added in Task 6 Step 3 (just below the `allColumns` binding near line 323), add:

```typescript
  const sortChips = useMemo<SortChip[]>(
    () =>
      sortCriteria.map((c) => ({
        key: c.column,
        label: sortFields.find((f) => f.key === c.column)?.label ?? c.column.toUpperCase(),
        direction: c.direction,
        onRemove: () => removeSortCriterion(legacyPaneType, c.column),
      })),
    [sortCriteria, sortFields, legacyPaneType, removeSortCriterion],
  )
```

- [ ] **Step 4: Pass the new props to PaneToolbar**

In the `<PaneToolbar ... />` element, add after the `filterChips={filterChips}` prop (line 719):

```typescript
        sortChips={sortChips}
        leftPanelWidth={leftPanelWidth}
```

- [ ] **Step 5: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Run the chips test — expect PASS**

Run from `e2e/`:
```bash
npx playwright test --config=config/playwright.config.ts tests/gantt/roster-condition-chips.spec.ts --project=gantt --reporter=list
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add gantt/src/components/panes/roster-pane.tsx
git commit -m "feat(gantt): wire sort chips + leftPanelWidth into roster toolbar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Version bump + full regression

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Bump the frontend version**

In `gantt/src/version.ts`, change:

```typescript
export const FRONTEND_VERSION = 43
```

to:

```typescript
export const FRONTEND_VERSION = 44
```

(Leave `BACKEND_VERSION` and `RULE_VERSION` unchanged.)

- [ ] **Step 2: Final type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: only the 2 known pre-existing errors, no new ones.

- [ ] **Step 3: Run both new specs together — expect PASS**

Run from `e2e/`:
```bash
npx playwright test --config=config/playwright.config.ts tests/gantt/roster-universal-sorting.spec.ts tests/gantt/roster-condition-chips.spec.ts --project=gantt --reporter=list
```
Expected: all tests PASS. Paste the PASS/FAIL summary into the completion message (No-Illusion rule).

- [ ] **Step 4: Sanity-run the existing roster seniority spec (no regression)**

Run from `e2e/`:
```bash
npx playwright test --config=config/playwright.config.ts tests/gantt/roster-seniority-column.spec.ts --project=gantt --reporter=list
```
Expected: PASS (unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore(gantt): bump FRONTEND_VERSION to 44 for condition chips + sorting

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review notes (for the executor)

- **Spec coverage:** chips alignment (Task 8 Step 4 `paddingLeft`), sort chips (Task 8/9), show-on-sort (Task 8 Step 3-4), filter-chip restyle (Task 8 Step 4), dialog dual-list + priority + double-click + Asc/Desc (Task 5), multi-key engine (Task 2), `sortCriteria` model with derived single-key (Task 1), `rosterSort` hook (Task 4), version bump (Task 10), both tests (Tasks 3/7 red → 6/9 green). Applies to both roster panes via the shared `RosterPane`/`PaneToolbar`.
- **Filter chips in e2e:** Row-2 filter chips come from server crew-query sessions; driving that UI is out of scope for the e2e here, so Task 7 verifies the *new* sort-chip behavior + strip indent. Filter-chip rendering is unchanged logic (restyle only). Verify filter chips manually if a crew search session is active.
- **Type consistency:** `SortCriterion` (pane-store) ↔ `SortField`/`SortChip` (sort-dialog/pane-toolbar) ↔ `sortChips`/`leftPanelWidth` props all match across Tasks 1/5/8/9.
- **Colors:** filter chips keep the pre-existing hardcoded `SESSION_COLORS` (continuation of existing pattern, conveys query-session identity); sort chips use semantic `bg-secondary`/`text-secondary-foreground`. Font sizes migrated to the `text-2xs` token (no new `text-[Npx]` magic values).
```
