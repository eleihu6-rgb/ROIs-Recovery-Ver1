# Scenario Algorithm Parameters UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the gantt Scenario → Algorithm Parameters dialog: widen it, stack Reserve Priority weekdays vertically with an appended default line, add delete support (with a team→rules guard) to Team Rules, and add explicit crew/pairing selection (checkboxes + select-all + virtual scrolling) to the Add Team / Add Rule dialogs, persisted as `crew_ids` / `pairing_ids`.

**Architecture:** Pure gantt-frontend change. `scenario-parameters-dialog.tsx` handles dialog sizing + Reserve Priority; `scenario-parameter-editors.tsx` hosts the editors. A new pure helper module `team-rule-selection.ts` centralizes selection logic for testability. `PreviewTable` gains an optional checkbox column and `@tanstack/react-virtual`-based body virtualization. The persisted team/rule JSON gains `crew_ids` / `pairing_ids` arrays; no backend/solver change (values pass through as opaque JSON, and the solver's `TEAM_RULES.json` already consumes explicit ID arrays).

**Tech Stack:** React 19, Vite, TypeScript, Vitest (jsdom + `createRoot`), `@tanstack/react-virtual` (new), Tailwind tokens from `@rois/ui`.

## Global Constraints

- UI text must be English only (no Chinese UI strings).
- No new magic values: use token scales — font sizes `text-2xs/xs/sm`, spacing Tailwind 4px steps, `rounded-sm/md`, semantic colors. `text-[Npx]`, hardcoded colors, and arbitrary spacing are forbidden in new code.
- `npm run check:ui` (repo root) must stay green — hard violations are blocking.
- New feature must ship with tests: Vitest unit tests for logic/components + a Playwright spec for the UI surface.
- `@tanstack/react-virtual` is MIT from TanStack (trusted source), acceptable under the dependency rules.
- Do not modify `live-server`, `engine-server`, or `pbs-engine` files.
- Commit after every task with the repo's `<type>: <subject>` format and `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Only commit the files a task touches. Leave unrelated working-tree changes (AGENTS.md, CLAUDE.md, pbs-engine submodule, untracked dirs) alone.

---

### Task 1: Add `@tanstack/react-virtual` dependency

**Files:**
- Modify: `gantt/package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes: nothing.
- Produces: `@tanstack/react-virtual` installed for the `gantt` workspace package (used by Task 3).

- [ ] **Step 1: Install the dependency**

Run from the repo root (`/home/yuan.z/rois/rois-ai`):

```bash
pnpm --filter gantt add @tanstack/react-virtual
```

- [ ] **Step 2: Verify install**

Run:
```bash
grep '"@tanstack/react-virtual"' gantt/package.json
```
Expected: a line like `"@tanstack/react-virtual": "^3.x.y",` in `dependencies`.

- [ ] **Step 3: Commit**

```bash
git add gantt/package.json pnpm-lock.yaml
git commit -m "chore: add @tanstack/react-virtual for scenario table virtualization"
```

---

### Task 2: Pure selection helpers + unit tests

**Files:**
- Create: `gantt/src/components/scenario/team-rule-selection.ts`
- Create: `gantt/src/components/scenario/__tests__/team-rule-selection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `defaultSelectedIds<T>(rows: T[], idOf: (row: T) => string, stored: string[] | null | undefined, matchesFilter: (row: T) => boolean): string[]`
  - `toggleId(selected: string[], id: string): string[]`
  - `applyToggleAll(selected: string[], visible: string[], shouldSelectAll: boolean): string[]`
  These are imported by `scenario-parameter-editors.tsx` in Tasks 5–6.

- [ ] **Step 1: Write the failing test**

Create `gantt/src/components/scenario/__tests__/team-rule-selection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyToggleAll, defaultSelectedIds, toggleId } from '../team-rule-selection'

describe('team-rule selection helpers', () => {
  const rows = [
    { id: 'c1', match: true },
    { id: 'c2', match: true },
    { id: 'c3', match: false },
  ]
  const idOf = (row: { id: string }) => row.id
  const matches = (row: { id: string }) => row.match

  it('uses the stored array when present', () => {
    expect(defaultSelectedIds(rows, idOf, ['c1'], matches)).toEqual(['c1'])
  })

  it('defaults to all filter-matching rows when no stored array exists', () => {
    expect(defaultSelectedIds(rows, idOf, undefined, matches)).toEqual(['c1', 'c2'])
  })

  it('defaults to every row when the filter matches everything', () => {
    expect(defaultSelectedIds(rows, idOf, undefined, () => true)).toEqual(['c1', 'c2', 'c3'])
  })

  it('returns a copy of the stored array, not the same reference', () => {
    const stored = ['c2']
    expect(defaultSelectedIds(rows, idOf, stored, matches)).not.toBe(stored)
  })

  it('toggleId adds an id and removes a present id', () => {
    expect(toggleId(['c1'], 'c2')).toEqual(['c1', 'c2'])
    expect(toggleId(['c1', 'c2'], 'c1')).toEqual(['c2'])
  })

  it('applyToggleAll with select-all unions the visible ids', () => {
    expect(applyToggleAll(['c1'], ['c2', 'c3'], true)).toEqual(['c1', 'c2', 'c3'])
  })

  it('applyToggleAll with deselect-all removes only the visible ids', () => {
    expect(applyToggleAll(['c1', 'c2', 'c3'], ['c1', 'c3'], false)).toEqual(['c2'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `/home/yuan.z/rois/rois-ai/gantt`:

```bash
npx vitest run src/components/scenario/__tests__/team-rule-selection.test.ts
```

Expected: FAIL — `Cannot find module '../team-rule-selection'` (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `gantt/src/components/scenario/team-rule-selection.ts`:

```ts
/**
 * Selection helpers for the Add Team / Add Rule crew & pairing tables.
 * A stored array is the source of truth when present; otherwise the selection
 * defaults to every row the team/rule filter currently matches (an empty
 * filter matches everything, so a brand-new team/rule defaults to all rows).
 */

export const defaultSelectedIds = <T>(
  rows: T[],
  idOf: (row: T) => string,
  stored: string[] | null | undefined,
  matchesFilter: (row: T) => boolean,
): string[] => {
  if (Array.isArray(stored)) return [...stored]
  return rows.filter(matchesFilter).map(idOf)
}

export const toggleId = (selected: string[], id: string): string[] =>
  selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]

export const applyToggleAll = (
  selected: string[],
  visible: string[],
  shouldSelectAll: boolean,
): string[] =>
  shouldSelectAll
    ? [...new Set([...selected, ...visible])]
    : selected.filter((id) => !visible.includes(id))
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run src/components/scenario/__tests__/team-rule-selection.test.ts
```
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/scenario/team-rule-selection.ts src/components/scenario/__tests__/team-rule-selection.test.ts
git commit -m "feat: add team/rule selection helpers with default-all semantics"
```

---

### Task 3: `PreviewTable` — checkbox column + virtual scrolling

**Files:**
- Modify: `gantt/src/components/scenario/scenario-parameter-editors.tsx` (the `PreviewTable` component, ~line 352)
- Create: `gantt/src/components/scenario/__tests__/preview-table.test.tsx`

**Interfaces:**
- Consumes: `useVirtualizer` from `@tanstack/react-virtual` (Task 1).
- Produces: `export const PreviewTable = ({ rows, columns, emptyText, caption, warning, selectable, rowId, selectedIds, onToggleRow, onToggleAll }: PreviewTableProps): ReactNode` where
  - `PreviewTableProps = { rows: JsonRecord[]; columns: { key: string; label: string }[]; emptyText: string; caption: string; warning?: string | null; selectable?: boolean; rowId?: (row: JsonRecord) => string; selectedIds?: string[]; onToggleRow?: (id: string) => void; onToggleAll?: (shouldSelectAll: boolean) => void }`
  - `onToggleAll` receives the boolean the caller should apply (`true` = select all visible rows). The component computes "all visible selected" internally.
  Consumed by Tasks 5–6.

- [ ] **Step 1: Write the failing test**

Create `gantt/src/components/scenario/__tests__/preview-table.test.tsx`:

```tsx
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-virtual', () => {
  const useVirtualizer = ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * estimateSize(),
        end: (index + 1) * estimateSize(),
        size: estimateSize(),
      })),
    getTotalSize: () => count * estimateSize(),
  })
  return { useVirtualizer }
})

import { PreviewTable } from '../scenario-parameter-editors'

const rows = [
  { crew_id: 'F8001', name: 'Alice', rank: 'CA' },
  { crew_id: 'F8002', name: 'Bob', rank: 'FO' },
  { crew_id: 'F8003', name: 'Carol', rank: 'CA' },
]

const renderTable = (props: Parameters<typeof PreviewTable>[0]) => {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => {
    root.render(<PreviewTable {...props} />)
  })
  return { container, root }
}

describe('PreviewTable', () => {
  it('renders a checkbox column before the data columns when selectable', () => {
    const { container, root } = renderTable({
      rows,
      columns: [{ key: 'crew_id', label: 'Crew' }],
      emptyText: 'none',
      caption: '3 crews',
      selectable: true,
      rowId: (row) => String(row.crew_id),
      selectedIds: [],
      onToggleRow: vi.fn(),
      onToggleAll: vi.fn(),
    })
    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(1 + rows.length) // header + one per row
    const firstCell = container.querySelector('thead th')
    expect(firstCell?.querySelector('input[type="checkbox"]')).not.toBeNull()
    act(() => root.unmount())
  })

  it('marks the header checked only when every visible row is selected', () => {
    const { container, root } = renderTable({
      rows,
      columns: [{ key: 'crew_id', label: 'Crew' }],
      emptyText: 'none',
      caption: '3 crews',
      selectable: true,
      rowId: (row) => String(row.crew_id),
      selectedIds: ['F8001', 'F8002', 'F8003'],
      onToggleRow: vi.fn(),
      onToggleAll: vi.fn(),
    })
    const header = container.querySelector<HTMLInputElement>('thead input[type="checkbox"]')
    expect(header?.checked).toBe(true)
    act(() => root.unmount())
  })

  it('calls onToggleAll(false) when all rows are selected and the header is clicked', () => {
    const onToggleAll = vi.fn()
    const { container, root } = renderTable({
      rows,
      columns: [{ key: 'crew_id', label: 'Crew' }],
      emptyText: 'none',
      caption: '3 crews',
      selectable: true,
      rowId: (row) => String(row.crew_id),
      selectedIds: ['F8001', 'F8002', 'F8003'],
      onToggleRow: vi.fn(),
      onToggleAll,
    })
    act(() => {
      container.querySelector<HTMLInputElement>('thead input[type="checkbox"]')?.click()
    })
    expect(onToggleAll).toHaveBeenCalledWith(false)
    act(() => root.unmount())
  })

  it('renders an empty-row placeholder when there are no rows', () => {
    const { container, root } = renderTable({
      rows: [],
      columns: [{ key: 'crew_id', label: 'Crew' }],
      emptyText: 'No crews match.',
      caption: '0 crews',
      selectable: true,
      rowId: (row) => String(row.crew_id),
      selectedIds: [],
      onToggleRow: vi.fn(),
      onToggleAll: vi.fn(),
    })
    expect(container.textContent).toContain('No crews match.')
    act(() => root.unmount())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `/home/yuan.z/rois/rois-ai/gantt`:

```bash
npx vitest run src/components/scenario/__tests__/preview-table.test.tsx
```

Expected: FAIL — `PreviewTable` is not exported (or the checkbox column/virtualizer is absent).

- [ ] **Step 3: Implement `PreviewTable`**

In `gantt/src/components/scenario/scenario-parameter-editors.tsx`:

1. Add imports at the top (after the existing `@rois/ui` import):

```ts
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
```

(Change `useEffect, useMemo, useState` → add `useRef` if not already imported; the file currently imports `useEffect, useMemo, useState, type ReactNode`.)

2. Replace the existing `PreviewTable` component (currently `const PreviewTable = ({ rows, columns, emptyText, caption, warning }: ...) => (...)` at ~line 352) with:

```tsx
export const PreviewTable = ({
  rows,
  columns,
  emptyText,
  caption,
  warning,
  selectable = false,
  rowId,
  selectedIds = [],
  onToggleRow,
  onToggleAll,
}: {
  rows: JsonRecord[]
  columns: { key: string; label: string }[]
  emptyText: string
  caption: string
  warning?: string | null
  selectable?: boolean
  rowId?: (row: JsonRecord) => string
  selectedIds?: string[]
  onToggleRow?: (id: string) => void
  onToggleAll?: (shouldSelectAll: boolean) => void
}): ReactNode => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 30,
    overscan: 10,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const colSpan = columns.length + (selectable ? 1 : 0)
  const ids = rows.map((row) => (rowId ? rowId(row) : stringValue(row.id ?? row.crew_id ?? row.pairing_id)))
  const selectedCount = ids.filter((id) => selectedIds.includes(id)).length
  const allSelected = ids.length > 0 && selectedCount === ids.length
  const someSelected = selectedCount > 0 && !allSelected
  const headerCheckboxRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someSelected
  }, [someSelected])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-border">
      <div className="shrink-0 border-b border-border bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">{caption}</div>
      {warning && <div className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">{warning}</div>}
      <div ref={scrollRef} className="min-h-0 h-80 overflow-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
            <tr>
              {selectable && (
                <th className="w-8 border-b border-border px-2 py-1.5">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    aria-label="Select all rows"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={allSelected}
                    onChange={() => onToggleAll?.(!allSelected)}
                  />
                </th>
              )}
              {columns.map((column) => (
                <th key={column.key} className="border-b border-border px-2 py-1.5 font-semibold">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={colSpan} className="px-2 py-3 text-muted-foreground">{emptyText}</td></tr>
            ) : (
              <>
                {virtualItems.length > 0 && virtualItems[0].start > 0 && (
                  <tr aria-hidden="true"><td colSpan={colSpan} style={{ height: virtualItems[0].start }} /></tr>
                )}
                {virtualItems.map((virtualRow) => {
                  const row = rows[virtualRow.index]
                  const id = rowId ? rowId(row) : stringValue(row.id ?? row.crew_id ?? row.pairing_id)
                  return (
                    <tr key={String(id)} className="odd:bg-background even:bg-muted/20">
                      {selectable && (
                        <td className="border-b border-border px-2 py-1.5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${id}`}
                            className="h-3.5 w-3.5 accent-primary"
                            checked={selectedIds.includes(id)}
                            onChange={() => onToggleRow?.(id)}
                          />
                        </td>
                      )}
                      {columns.map((column) => (
                        <td key={column.key} className="border-b border-border px-2 py-1.5">{stringValue(row[column.key]) || '-'}</td>
                      ))}
                    </tr>
                  )
                })}
                {virtualItems.length > 0 && totalSize - (virtualItems[virtualItems.length - 1].end ?? 0) > 0 && (
                  <tr aria-hidden="true"><td colSpan={colSpan} style={{ height: totalSize - (virtualItems[virtualItems.length - 1].end ?? 0) }} /></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run src/components/scenario/__tests__/preview-table.test.tsx
```
Expected: 4 passed.

- [ ] **Step 5: Run the existing editor tests to confirm no regression**

Run:
```bash
npx vitest run src/components/scenario/__tests__/scenario-parameter-editors.test.tsx
```
Expected: existing 2 tests still pass (they don't render `PreviewTable` with the new props).

- [ ] **Step 6: Commit**

```bash
git add src/components/scenario/scenario-parameter-editors.tsx src/components/scenario/__tests__/preview-table.test.tsx
git commit -m "feat: virtualize PreviewTable and add optional checkbox selection column"
```

---

### Task 4: Reserve Priority tab + dialog sizing

**Files:**
- Modify: `gantt/src/components/scenario/scenario-parameters-dialog.tsx`
- Modify: `gantt/src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx`

**Interfaces:**
- Consumes: the existing `renderReservePriority` and `WEEKDAYS` in the same file.
- Produces: Reserve Priority renders a vertical Mon→Sun list and the appended default line; the dialog is wider/taller. No new exported API.

- [ ] **Step 1: Write the failing test**

Append to `gantt/src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx` (inside the existing `describe`):

```tsx
it('Reserve Priority shows the algorithm default line and stacks weekdays vertically Mon→Sun', async () => {
  vi.mocked(scenarioApi.getParameters).mockResolvedValue({
    items: [
      {
        code: 'reserve_weekday_priority',
        type: 'OBJ',
        description: 'Reserve Priority',
        idx: 30,
        schema: {},
        defaultValue: { mon: 3, tue: 1, wed: 1, thu: 3, fri: 2, sat: 2, sun: 2 },
        value: { mon: 3, tue: 1, wed: 1, thu: 3, fri: 2, sat: 2, sun: 2 },
        hasScenarioValue: false,
      },
    ],
    summary: { templateCount: 1, configuredCount: 0 },
  })
  const container = document.createElement('div')
  const root = createRoot(container)

  await act(async () => {
    root.render(<ScenarioParametersDialog scenarioId={42} open onOpenChange={() => undefined} disabled={false} />)
  })

  expect(container.textContent).toContain('Algorithm default: Tue/Wed 1, Fri/Sat/Sun 2, Mon/Thu 3.')

  const labels = [...container.querySelectorAll<HTMLElement>('span')]
    .map((span) => span.textContent?.trim())
    .filter((text) => text && ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(text))
  expect(labels).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])

  // Vertical layout: the weekday inputs live inside a flex-col container.
  const priorityInput = container.querySelector<HTMLInputElement>('input[aria-label="Monday reserve priority"]')
  expect(priorityInput).not.toBeNull()
  const col = priorityInput?.closest('div[class*="flex-col"]')
  expect(col).not.toBeNull()

  await act(async () => { root.unmount() })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `/home/yuan.z/rois/rois-ai/gantt`:

```bash
npx vitest run src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx
```

Expected: FAIL — the default line text is absent (assertion on `textContent` fails) and/or the weekday labels are not in Mon→Sun order.

- [ ] **Step 3: Implement the changes**

In `gantt/src/components/scenario/scenario-parameters-dialog.tsx`:

1. Widen and heighten the dialog:
   - `className="sm:max-w-[760px]"` → `className="sm:max-w-[960px]"`
   - `<div className="max-h-[65vh] space-y-3 overflow-y-auto py-1">` → `<div className="max-h-[80vh] space-y-3 overflow-y-auto py-1">`

2. In `renderReservePriority`:

```tsx
const renderReservePriority = (item: ScenarioParameterItem): ReactNode => {
  const value = asRecord(item.value)
  return (
    <div className="space-y-2">
      <div className="font-semibold text-xs text-foreground">Reserve Priority (by weekday)</div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        1 = highest priority; reserves on higher-priority weekdays are covered first.
        Algorithm default: Tue/Wed 1, Fri/Sat/Sun 2, Mon/Thu 3.
      </p>
      <div className="flex flex-col gap-2 text-xs">
        {WEEKDAYS.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <span className="w-24 text-muted-foreground">{label}</span>
            <Input
              aria-label={`${label} reserve priority`}
              type="number"
              min={1}
              max={9}
              step={1}
              className="h-7 w-20 text-xs"
              value={valueAsString(value[key])}
              disabled={disabled || saving}
              onChange={(event) => updateValue(item.code, { ...value, [key]: Number(event.target.value) })}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx
```
Expected: all tests pass (existing 2 + the new 1).

- [ ] **Step 5: Commit**

```bash
git add src/components/scenario/scenario-parameters-dialog.tsx src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx
git commit -m "feat: widen Algorithm Parameters dialog and stack Reserve Priority weekdays vertically"
```

---

### Task 5: Add Team dialog — layout + crew selection

**Files:**
- Modify: `gantt/src/components/scenario/scenario-parameter-editors.tsx` (`TeamEditor`, ~line 501)
- Modify: `gantt/src/components/scenario/__tests__/scenario-parameter-editors.test.tsx`

**Interfaces:**
- Consumes: `PreviewTable` (Task 3), `defaultSelectedIds`/`toggleId`/`applyToggleAll` (Task 2).
- Produces: `TeamEditor` persists `crew_ids` on Done; the Name/Description row uses the `[15rem_minmax(0,1fr)]` grid.

- [ ] **Step 1: Write the failing test**

Add the virtualization mock at the top of `gantt/src/components/scenario/__tests__/scenario-parameter-editors.test.tsx` (after the existing `vi.mock('@rois/ui', ...)` block), then append the new test inside `describe('TeamRulesEditor')`:

```tsx
vi.mock('@tanstack/react-virtual', () => {
  const useVirtualizer = ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * estimateSize(),
        end: (index + 1) * estimateSize(),
        size: estimateSize(),
      })),
    getTotalSize: () => count * estimateSize(),
  })
  return { useVirtualizer }
})

it('Add Team defaults all crews selected, unchecking one persists crew_ids on Done', async () => {
  mocks.getGanttData.mockResolvedValue({
    crew: [
      { crewId: 'F8001', crewName: 'Alice', rank: 'CA', base: 'YEG', seniorityNum: '12', division: 'P' },
      { crewId: 'F8002', crewName: 'Bob', rank: 'CA', base: 'YEG', seniorityNum: '9', division: 'P' },
      { crewId: 'F8003', crewName: 'Carol', rank: 'CA', base: 'YEG', seniorityNum: '7', division: 'P' },
    ],
    pairings: [],
    pairingSegments: [],
    scenarioStrDt: '2026-06-01',
    strDtLoc: '2026-06-01',
    scenarioEndDt: '2026-06-30',
    endDtLoc: '2026-06-30',
  })

  const onChange = vi.fn()
  const container = document.createElement('div')
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <TeamRulesEditor value={{ teams: [], rules: [] }} scenarioDetail={scenarioDetail} disabled={false} saving={false} onChange={onChange} />,
    )
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  const addTeam = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === '+ Add Team')
  await act(async () => { addTeam?.click() })

  const rowCheckboxes = [...container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')]
  expect(rowCheckboxes).toHaveLength(3)
  expect(rowCheckboxes.every((input) => input.checked)).toBe(true)

  // Uncheck the middle crew.
  await act(async () => {
    container.querySelector<HTMLInputElement>('tbody input[aria-label="Select F8002"]')?.click()
  })

  const name = container.querySelector<HTMLInputElement>('input[placeholder="e.g. Senior YVR CAs"]')
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(name, 'YVR CAs')
    name!.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const done = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === 'Done')
  await act(async () => { done?.click() })

  const saved = onChange.mock.calls.at(-1)?.[0] as { teams: Array<{ crew_ids: string[] }> }
  expect(saved.teams[0].crew_ids).toEqual(['F8001', 'F8003'])
  await act(async () => { root.unmount() })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `/home/yuan.z/rois/rois-ai/gantt`:

```bash
npx vitest run src/components/scenario/__tests__/scenario-parameter-editors.test.tsx
```

Expected: FAIL — `saved.teams[0].crew_ids` is `undefined` (Done doesn't write `crew_ids` yet) and/or no checkboxes render.

- [ ] **Step 3: Implement `TeamEditor`**

In `gantt/src/components/scenario/scenario-parameter-editors.tsx`, replace the `TeamEditor` body (keep its signature) with:

```tsx
const TeamEditor = ({
  team,
  crews,
  division,
  rankOptions,
  baseOptions,
  onCancel,
  onSave,
}: {
  team: JsonRecord
  crews: CrewPreviewRow[]
  division: string
  rankOptions: string[]
  baseOptions: string[]
  onCancel: () => void
  onSave: (team: JsonRecord) => void
}): ReactNode => {
  const [draft, setDraft] = useState(team)
  const filter = cleanCrewFilter(draft.crew_filter)
  const shown = useMemo(() => crews.filter((crew) => crewMatchesTeamFilter(crew, filter)), [crews, filter])
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    defaultSelectedIds(
      crews,
      (crew) => crew.crew_id,
      draft.crew_ids,
      (crew) => crewMatchesTeamFilter(crew, draft.crew_filter),
    ),
  )
  const visibleIds = shown.map((crew) => crew.crew_id)
  return (
    <AppDialog open onOpenChange={(open) => !open && onCancel()} title={team.name ? `Edit Team - ${team.name}` : 'Add Team'} className="sm:max-w-[940px]">
      <div className="space-y-3 text-xs">
        <div className="grid gap-2 sm:grid-cols-[15rem_minmax(0,1fr)]">
          <label className="flex flex-col gap-1"><span>Name</span><Input className="h-8 text-xs" value={String(draft.name)} placeholder="e.g. Senior YVR CAs" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="flex flex-col gap-1"><span>Description</span><Input className="h-8 text-xs" value={String(draft.description)} placeholder="optional" onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        </div>
        <div className="grid items-stretch gap-3 sm:grid-cols-[15rem_minmax(0,1fr)]">
          <CrewFilterPanel filter={filter} division={division} rankOptions={rankOptions} baseOptions={baseOptions} onChange={(crew_filter) => setDraft({ ...draft, crew_filter })} />
          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            <PreviewTable
              rows={shown as unknown as JsonRecord[]}
              caption={`${shown.length} of ${crews.length} crews match${shown.length === 0 ? ' - this team would be empty' : ''}`}
              columns={[{ key: 'crew_id', label: 'Crew' }, { key: 'name', label: 'Name' }, { key: 'rank', label: 'Rank' }, { key: 'base', label: 'Base' }, { key: 'seniority', label: 'Seniority' }, { key: 'division', label: 'Division' }]}
              emptyText="No crews match."
              selectable
              rowId={(row) => stringValue(row.crew_id)}
              selectedIds={selectedIds}
              onToggleRow={(id) => setSelectedIds(toggleId(selectedIds, id))}
              onToggleAll={(shouldSelectAll) => setSelectedIds(applyToggleAll(selectedIds, visibleIds, shouldSelectAll))}
            />
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{String(draft.name).trim() ? `${selectedIds.length} crews selected` : 'Name is required.'}</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" disabled={!String(draft.name).trim()} onClick={() => onSave({ ...draft, name: String(draft.name).trim(), crew_filter: filter, crew_ids: selectedIds })}>Done</Button>
        </div>
      </div>
    </AppDialog>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run src/components/scenario/__tests__/scenario-parameter-editors.test.tsx
```
Expected: all tests pass (2 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/components/scenario/scenario-parameter-editors.tsx src/components/scenario/__tests__/scenario-parameter-editors.test.tsx
git commit -m "feat: Add Team dialog crew checkbox selection, aligned columns, crew_ids on Done"
```

---

### Task 6: Add Rule dialog — layout + pairing selection

**Files:**
- Modify: `gantt/src/components/scenario/scenario-parameter-editors.tsx` (`RuleEditor`, ~line 546; also delete the now-unused `ruleWarning` helper)
- Modify: `gantt/src/components/scenario/__tests__/scenario-parameter-editors.test.tsx`

**Interfaces:**
- Consumes: `PreviewTable` (Task 3), selection helpers (Task 2).
- Produces: `RuleEditor` persists `pairing_ids` on Done; Name is in the 15rem column aligned with Pairing Filter; the ONLY-empty warning is based on `selectedIds.length`.

- [ ] **Step 1: Write the failing test**

Append to `gantt/src/components/scenario/__tests__/scenario-parameter-editors.test.tsx`:

```tsx
it('Add Rule defaults all pairings selected and persists pairing_ids on Done', async () => {
  mocks.getGanttData.mockResolvedValue({
    crew: [],
    pairings: [
      { pairingId: 1, sourcePairingId: 2001, pairingLabel: 'P2001', assignment: 'FLT', assignmentGroup: 'FLT', base: 'YEG', division: 'P', schStrDtUtc: '2026-06-01T00:00:00Z', schEndDtUtc: '2026-06-02T00:00:00Z', compositions: [{ rank: 'CA', plan: 1, fill: 1 }] },
      { pairingId: 2, sourcePairingId: 2002, pairingLabel: 'P2002', assignment: 'FLT', assignmentGroup: 'FLT', base: 'YEG', division: 'P', schStrDtUtc: '2026-06-01T00:00:00Z', schEndDtUtc: '2026-06-02T00:00:00Z', compositions: [{ rank: 'CA', plan: 1, fill: 1 }] },
    ],
    pairingSegments: [],
    scenarioStrDt: '2026-06-01',
    strDtLoc: '2026-06-01',
    scenarioEndDt: '2026-06-30',
    endDtLoc: '2026-06-30',
  })

  const onChange = vi.fn()
  const container = document.createElement('div')
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <TeamRulesEditor
        value={{ teams: [{ id: 't1', name: 'Team A', crew_filter: {} }], rules: [] }}
        scenarioDetail={scenarioDetail}
        disabled={false}
        saving={false}
        onChange={onChange}
      />,
    )
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  const addRule = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === '+ Add Rule')
  await act(async () => { addRule?.click() })

  const rowCheckboxes = [...container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')]
  expect(rowCheckboxes).toHaveLength(2)
  expect(rowCheckboxes.every((input) => input.checked)).toBe(true)

  await act(async () => {
    container.querySelector<HTMLInputElement>('tbody input[aria-label="Select 2001"]')?.click()
  })

  const name = container.querySelector<HTMLInputElement>('input[placeholder="e.g. No redeyes"]')
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(name, 'No redeyes')
    name!.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const done = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === 'Done')
  await act(async () => { done?.click() })

  const saved = onChange.mock.calls.at(-1)?.[0] as { rules: Array<{ pairing_ids: string[] }> }
  expect(saved.rules[0].pairing_ids).toEqual(['2002'])
  await act(async () => { root.unmount() })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `/home/yuan.z/rois/rois-ai/gantt`:

```bash
npx vitest run src/components/scenario/__tests__/scenario-parameter-editors.test.tsx
```

Expected: FAIL — `saved.rules[0].pairing_ids` is `undefined`.

- [ ] **Step 3: Implement `RuleEditor`**

In `gantt/src/components/scenario/scenario-parameter-editors.tsx`:

1. Delete the now-unused `ruleWarning` helper (currently near line 498):

```ts
const ruleWarning = (mode: unknown, pairingCount: number): string | null =>
  mode === 'only_do' && pairingCount === 0 ? 'Matches no pairings - this team would be blocked from flying anything.' : null
```

2. Replace the `RuleEditor` body (keep its signature) with:

```tsx
const RuleEditor = ({
  rule,
  teams,
  pairings,
  onCancel,
  onSave,
}: {
  rule: JsonRecord
  teams: JsonRecord[]
  pairings: PairingPreviewRow[]
  onCancel: () => void
  onSave: (rule: JsonRecord) => void
}): ReactNode => {
  const [draft, setDraft] = useState(rule)
  const filter = cleanPairingFilter(draft.pairing_filter)
  const shown = useMemo(() => pairings.filter((pairing) => pairingMatchesRuleFilter(pairing, filter)), [pairings, filter])
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    defaultSelectedIds(
      pairings,
      (pairing) => pairing.pairing_id,
      draft.pairing_ids,
      (pairing) => pairingMatchesRuleFilter(pairing, draft.pairing_filter),
    ),
  )
  const visibleIds = shown.map((pairing) => pairing.pairing_id)
  const warn = draft.mode === 'only_do' && selectedIds.length === 0
    ? 'Matches no pairings - this team would be blocked from flying anything.'
    : null
  return (
    <AppDialog open onOpenChange={(open) => !open && onCancel()} title={rule.name ? `Edit Rule - ${rule.name}` : 'Add Rule'} className="sm:max-w-[980px]">
      <div className="space-y-3 text-xs">
        <div className="grid gap-2 sm:grid-cols-[15rem_minmax(0,1fr)]">
          <label className="flex flex-col gap-1"><span>Name</span><Input className="h-8 text-xs" value={String(draft.name)} placeholder="e.g. No redeyes" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1"><span>Team</span><select className="h-8 rounded border border-border bg-background px-2 text-xs" value={String(draft.team_id ?? '')} onChange={(e) => setDraft({ ...draft, team_id: e.target.value })}><option value="">Select...</option>{teams.map((team) => <option key={String(team.id)} value={String(team.id)}>{String(team.name)}</option>)}</select></label>
            <div><span className="mb-1 block">Mode</span><div className="flex gap-1"><Button type="button" className="h-8 px-3 text-xs" variant={draft.mode === 'only_do' ? 'default' : 'outline'} onClick={() => setDraft({ ...draft, mode: 'only_do' })}>ONLY</Button><Button type="button" className="h-8 px-3 text-xs" variant={draft.mode === 'not_do' ? 'default' : 'outline'} onClick={() => setDraft({ ...draft, mode: 'not_do' })}>NEVER</Button></div></div>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {draft.mode === 'only_do'
            ? 'ONLY - the team may fly just the matched pairings. Everything else becomes forbidden for them.'
            : 'NEVER - the team may not fly any of the matched pairings. Everything else stays available.'}
        </p>
        <div className="grid items-stretch gap-3 sm:grid-cols-[15rem_minmax(0,1fr)]">
          <PairingFilterPanel filter={filter} rows={pairings} onChange={(pairing_filter) => setDraft({ ...draft, pairing_filter })} />
          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            <PreviewTable
              rows={shown as unknown as JsonRecord[]}
              caption={`${shown.length} of ${pairings.length} pairings match`}
              warning={warn}
              columns={[{ key: 'pairing_id', label: 'Pairing' }, { key: 'label', label: 'Label' }, { key: 'type_label', label: 'Type' }, { key: 'carry_in', label: 'Carry-in' }, { key: 'base', label: 'Base' }, { key: 'start', label: 'Start' }, { key: 'days', label: 'Days' }]}
              emptyText="No pairings match."
              selectable
              rowId={(row) => stringValue(row.pairing_id)}
              selectedIds={selectedIds}
              onToggleRow={(id) => setSelectedIds(toggleId(selectedIds, id))}
              onToggleAll={(shouldSelectAll) => setSelectedIds(applyToggleAll(selectedIds, visibleIds, shouldSelectAll))}
            />
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{!String(draft.name).trim() ? 'Name is required.' : !String(draft.team_id).trim() ? 'Pick a team.' : `${selectedIds.length} pairings selected`}</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" disabled={!String(draft.name).trim() || !String(draft.team_id).trim()} onClick={() => onSave({ ...draft, name: String(draft.name).trim(), pairing_filter: filter, pairing_ids: selectedIds })}>Done</Button>
        </div>
      </div>
    </AppDialog>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run src/components/scenario/__tests__/scenario-parameter-editors.test.tsx
```
Expected: all tests pass (2 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/components/scenario/scenario-parameter-editors.tsx src/components/scenario/__tests__/scenario-parameter-editors.test.tsx
git commit -m "feat: Add Rule dialog pairing checkbox selection and aligned Name column"
```

---

### Task 7: Team Rules — deletion + guard + badges

**Files:**
- Modify: `gantt/src/components/scenario/scenario-parameter-editors.tsx` (`TeamRulesEditor`, ~line 594)
- Modify: `gantt/src/components/scenario/__tests__/scenario-parameter-editors.test.tsx`

**Interfaces:**
- Consumes: the existing `teams`/`rules` arrays and `onChange`.
- Produces: Team rows and Rule rows get Delete buttons; deleting a team with dependent rules is blocked with an inline error; `teamCount`/`ruleCount` prefer explicit `crew_ids`/`pairing_ids`.

- [ ] **Step 1: Write the failing test**

Append to `gantt/src/components/scenario/__tests__/scenario-parameter-editors.test.tsx`:

```tsx
it('blocks deleting a Team that still has Team Rules and lists them', async () => {
  mocks.getGanttData.mockResolvedValue({ crew: [], pairings: [], pairingSegments: [], scenarioStrDt: '2026-06-01', strDtLoc: '2026-06-01', scenarioEndDt: '2026-06-30', endDtLoc: '2026-06-30' })
  const onChange = vi.fn()
  const container = document.createElement('div')
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <TeamRulesEditor
        value={{
          teams: [{ id: 't1', name: 'Team A', crew_ids: ['F8001'] }],
          rules: [{ id: 'r1', name: 'No redeyes', team_id: 't1', mode: 'not_do', pairing_ids: ['2001'] }],
        }}
        scenarioDetail={scenarioDetail}
        disabled={false}
        saving={false}
        onChange={onChange}
      />,
    )
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  const teamsSection = [...container.querySelectorAll<HTMLElement>('section')]
    .find((section) => section.textContent?.includes('+ Add Team'))
  const teamDelete = [...(teamsSection?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    .find((button) => button.textContent === 'Delete')
  await act(async () => { teamDelete?.click() })

  expect(container.textContent).toContain('delete these Team Rules first')
  expect(container.textContent).toContain('No redeyes')
  expect(onChange).not.toHaveBeenCalled()

  // Deleting the rule first unblocks the team delete.
  const rulesSection = [...container.querySelectorAll<HTMLElement>('section')]
    .find((section) => section.textContent?.includes('No redeyes'))
  const ruleDelete = [...(rulesSection?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    .find((button) => button.textContent === 'Delete')
  await act(async () => { ruleDelete?.click() })
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ rules: [] }))

  // The team delete now succeeds.
  const teamDeleteAgain = [...(teamsSection?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    .find((button) => button.textContent === 'Delete')
  await act(async () => { teamDeleteAgain?.click() })
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ teams: [] }))

  await act(async () => { root.unmount() })
})

it('deletes a Team immediately when it has no rules', async () => {
  mocks.getGanttData.mockResolvedValue({ crew: [], pairings: [], pairingSegments: [], scenarioStrDt: '2026-06-01', strDtLoc: '2026-06-01', scenarioEndDt: '2026-06-30', endDtLoc: '2026-06-30' })
  const onChange = vi.fn()
  const container = document.createElement('div')
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <TeamRulesEditor
        value={{ teams: [{ id: 't1', name: 'Team A', crew_ids: ['F8001'] }], rules: [] }}
        scenarioDetail={scenarioDetail}
        disabled={false}
        saving={false}
        onChange={onChange}
      />,
    )
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  const teamDelete = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === 'Delete')
  await act(async () => { teamDelete?.click() })

  const saved = onChange.mock.calls.at(-1)?.[0] as { teams: unknown[] }
  expect(saved.teams).toEqual([])
  await act(async () => { root.unmount() })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `/home/yuan.z/rois/rois-ai/gantt`:

```bash
npx vitest run src/components/scenario/__tests__/scenario-parameter-editors.test.tsx
```

Expected: FAIL — no Delete button exists (the `.find(...textContent === 'Delete')` returns `undefined` and clicking throws, or `onChange` isn't called).

- [ ] **Step 3: Implement the deletion logic**

In `gantt/src/components/scenario/scenario-parameter-editors.tsx`, inside `TeamRulesEditor`:

1. Add a `deleteError` state (near the other `useState` lines, ~line 610):

```tsx
const [deleteError, setDeleteError] = useState<string | null>(null)
```

2. Replace the `teamCount` / `ruleCount` definitions (~lines 633–634):

```tsx
const teamCount = (team: JsonRecord): number =>
  Array.isArray(team.crew_ids) ? team.crew_ids.length : crewRows.filter((crew) => crewMatchesTeamFilter(crew, team.crew_filter)).length
const ruleCount = (rule: JsonRecord): number =>
  Array.isArray(rule.pairing_ids) ? rule.pairing_ids.length : pairingRows.filter((pairing) => pairingMatchesRuleFilter(pairing, rule.pairing_filter)).length
```

3. Add `deleteTeam` / `deleteRule` handlers (after `saveRule`, ~line 680):

```tsx
const deleteTeam = (team: JsonRecord) => {
  const dependent = rules.filter((rule) => String(rule.team_id) === String(team.id))
  if (dependent.length > 0) {
    setDeleteError(`Cannot delete team "${String(team.name)}" - delete these Team Rules first: ${dependent.map((rule) => String(rule.name)).filter(Boolean).join(', ') || 'the rules attached to it'}.`)
    return
  }
  setDeleteError(null)
  onChange({ ...source, teams: teams.filter((row) => row.id !== team.id) })
}
const deleteRule = (rule: JsonRecord) => {
  setDeleteError(null)
  onChange({ ...source, rules: rules.filter((row) => row.id !== rule.id) })
}
```

4. Add a Delete button to each Team row (the row div at ~line 695) — append after the Edit button:

```tsx
<Button type="button" variant="ghost" className="h-7 px-2 text-xs text-destructive" disabled={disabled || saving} onClick={() => deleteTeam(team)}>Delete</Button>
```

5. Add a Delete button to each Rule row (the row div at ~line 707) — append after the Edit button:

```tsx
<Button type="button" variant="ghost" className="h-7 px-2 text-xs text-destructive" disabled={disabled || saving} onClick={() => deleteRule(rule)}>Delete</Button>
```

6. Render the delete error after the two `<section>` blocks (after line ~712, before the `{editingTeam && ...}` lines):

```tsx
{deleteError && <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{deleteError}</div>}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run src/components/scenario/__tests__/scenario-parameter-editors.test.tsx
```
Expected: all tests pass (2 existing + 4 new).

- [ ] **Step 5: Run the full scenario component test set**

Run:
```bash
npx vitest run src/components/scenario/
```
Expected: all pass (dialog, editors, basic-info, kpi, etc.).

- [ ] **Step 6: Commit**

```bash
git add src/components/scenario/scenario-parameter-editors.tsx src/components/scenario/__tests__/scenario-parameter-editors.test.tsx
git commit -m "feat: Team Rules delete support with team→rules guard and explicit-ID badges"
```

---

### Task 8: Playwright E2E — scenario parameters UI

**Files:**
- Create: `e2e/tests/gantt/scenario/scenario-params-team-rules.spec.ts`

**Interfaces:**
- Consumes: the real gantt UI; the Algorithm Parameters dialog is opened via `data-testid="scenario-parameters-open"` in the scenario detail panel. Uses scenario #595 (RO "Backup: TEST-New-YVR-Pilot", used by other scenario specs) or any stable RO scenario on the remote live-server DB.
- Produces: regression coverage for Reserve Priority default text, Add Team crew selection persistence, and the team→rules delete guard.

- [ ] **Step 1: Write the spec**

Create `e2e/tests/gantt/scenario/scenario-params-team-rules.spec.ts` modeled on `scenario-nav-dropdown.spec.ts`:

```ts
/**
 * Scenario Algorithm Parameters UI — Reserve Priority default text, Add Team
 * crew selection persistence, and the Team → Team Rules delete guard.
 *
 * Requires: live-server (SCENARIO_GANTT_SOURCE=db) and a stable RO scenario.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

interface Auth { token: string; userCode: string; userName: string; schema: string }

const login = async (request: APIRequestContext): Promise<Auth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, { data: { userCode: GANTT_USER, password: GANTT_PASS } })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { data: Auth }).data
}

async function openScenarioById(page: Page, id: number, nameSearch: string): Promise<void> {
  await page.goto('/altair/')
  await page.waitForLoadState('networkidle')
  await page.getByTestId('module-nav-scenario').click()
  await page.getByTestId('scenario-nav-list').click()
  await page.getByPlaceholder('Search scenarios…').fill(nameSearch)
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(`#${id}`, { exact: true }),
  })
  await expect(item).toBeVisible({ timeout: 15_000 })
  await item.click()
  await page.getByTestId('scenario-detail-panel').getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 15_000 })
}

test('Reserve Priority tab shows the algorithm default line with vertically stacked weekdays', async ({ page, request }) => {
  await login(request)
  await openScenarioById(page, 595, 'TEST-New-YVR-Pilot')
  await page.getByTestId('scenario-parameters-open').click()
  await expect(page.getByTestId('scenario-parameters-dialog')).toBeVisible()

  await page.getByRole('button', { name: 'Reserve Priority' }).click()
  await expect(page.getByText('Algorithm default: Tue/Wed 1, Fri/Sat/Sun 2, Mon/Thu 3.')).toBeVisible()
  // Weekday labels appear in Mon→Sun order, each on its own row.
  const weekdayLabels = await page.locator('div.flex.flex-col label span').allTextContents()
  const filtered = weekdayLabels.filter((t) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(t.trim()))
  expect(filtered).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
  await page.getByRole('button', { name: 'Cancel' }).click()
})

test('Add Team defaults all crews selected and persists unchecking a crew', async ({ page, request }) => {
  await login(request)
  await openScenarioById(page, 595, 'TEST-New-YVR-Pilot')
  await page.getByTestId('scenario-parameters-open').click()
  await expect(page.getByTestId('scenario-parameters-dialog')).toBeVisible()

  await page.getByRole('button', { name: 'Team Rules' }).click()
  await page.getByRole('button', { name: '+ Add Team' }).click()

  const rowCheckboxes = page.locator('tbody input[type="checkbox"]')
  await expect(rowCheckboxes.first()).toBeVisible()
  const count = await rowCheckboxes.count()
  expect(count).toBeGreaterThan(0)
  for (const idx of [0, 1, 2]) {
    if (idx < count) await expect(rowCheckboxes.nth(idx)).toBeChecked()
  }

  const firstCrew = page.locator('tbody tr').first().getByRole('checkbox').first()
  await firstCrew.uncheck()

  await page.getByPlaceholder('e.g. Senior YVR CAs').fill(`E2E Crew Team ${Date.now()}`)
  await page.getByRole('button', { name: 'Done' }).click()

  // Reopen the team — the unchecked crew stays unchecked (selection persisted).
  await page.getByText(/E2E Crew Team/).locator('..').getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('button', { name: 'Done' })).toBeVisible()
  const reopenedCheckboxes = page.locator('tbody input[type="checkbox"]')
  await expect(reopenedCheckboxes.first()).toBeVisible()
  // The first-row crew remains unchecked after reopen.
  await expect(page.locator('tbody tr').first().getByRole('checkbox').first()).not.toBeChecked()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
})

test('deleting a Team with Team Rules is blocked until the rules are removed', async ({ page, request }) => {
  await login(request)
  await openScenarioById(page, 595, 'TEST-New-YVR-Pilot')
  await page.getByTestId('scenario-parameters-open').click()
  await expect(page.getByTestId('scenario-parameters-dialog')).toBeVisible()

  await page.getByRole('button', { name: 'Team Rules' }).click()

  // Create a team + a rule attached to it.
  await page.getByRole('button', { name: '+ Add Team' }).click()
  await page.getByPlaceholder('e.g. Senior YVR CAs').fill('E2E Delete Guard Team')
  await page.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: '+ Add Rule' }).click()
  await page.getByPlaceholder('e.g. No redeyes').fill('E2E Guard Rule')
  await page.getByRole('button', { name: 'Done' }).click()

  // Deleting the team is blocked and names the rule.
  await page.getByText('E2E Delete Guard Team').locator('..').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(/delete these Team Rules first/)).toBeVisible()
  await expect(page.getByText('E2E Guard Rule')).toBeVisible()

  // Delete the rule, then the team succeeds.
  await page.getByText('E2E Guard Rule').locator('..').getByRole('button', { name: 'Delete' }).click()
  await page.getByText('E2E Delete Guard Team').locator('..').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('E2E Delete Guard Team')).toBeHidden()
  await page.getByRole('button', { name: 'Cancel' }).click()
})
```

> Note for the implementer: adjust the scenario id / name fragment to a stable RO scenario available on the remote live-server DB (same requirement as the other `e2e/tests/gantt/scenario/*.spec.ts` files). The second test reopens the saved team to prove `crew_ids` persisted; if the first-row row order is non-deterministic across runs, assert persistence by counting checked rows instead (`await expect(page.locator('tbody input[type="checkbox"]:checked')).toHaveCount(count - 1)`).

- [ ] **Step 2: Run the spec**

Run from `/home/yuan.z/rois/rois-ai/e2e`:

```bash
npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/scenario/scenario-params-team-rules.spec.ts
```

Expected: 3 tests pass against the running live-server + gantt dev servers.

- [ ] **Step 3: Commit**

```bash
git add tests/gantt/scenario/scenario-params-team-rules.spec.ts
git commit -m "test: scenario algorithm params UI e2e (reserve priority, team selection, delete guard)"
```

---

### Task 9: Full validation

**Files:**
- No source changes.

**Interfaces:**
- Consumes: all prior tasks.

- [ ] **Step 1: Run the full gantt unit test suite**

Run from `/home/yuan.z/rois/rois-ai/gantt`:

```bash
npx vitest run
```

Expected: all gantt tests pass.

- [ ] **Step 2: Run the UI-standard gate**

Run from `/home/yuan.z/rois/rois-ai`:

```bash
npm run check:ui
```

Expected: 0 hard violations.

- [ ] **Step 3: Typecheck gantt**

Run from `/home/yuan.z/rois/rois-ai/gantt`:

```bash
npx tsc -b
```

Expected: clean (no type errors).

- [ ] **Step 4: Report results**

Paste the PASS summaries from Steps 1–3 to the user (the test output is the proof, per §No-Illusion).

---

## Self-Review

**Spec coverage:**
- Dialog sizing → Task 4.
- Reserve Priority appended default line + vertical layout → Task 4.
- Team/rule deletion → Task 7.
- Team delete guard → Task 7.
- Add Team layout (Name↔Crew Filter, Description↔table) → Task 5.
- Crew checkbox column, default-all, select-all header, virtual scroll, Done records `crew_ids` → Tasks 3+5.
- Add Rule layout (Name↔Pairing Filter), pairing checkbox column, select-all, virtual scroll, Done records `pairing_ids` → Tasks 3+6.
- `@tanstack/react-virtual` dependency → Task 1.
- Selection helpers → Task 2.
- Backend/solver untouched → all tasks restricted to `gantt/` and `e2e/`.
- Testing (Vitest + Playwright) → Tasks 2–8; full validation → Task 9.

**Placeholder scan:** No TBD/TODO; every code step contains the full implementation.

**Type consistency:** `defaultSelectedIds`/`toggleId`/`applyToggleAll` (Task 2) match the calls in Tasks 5–6; `PreviewTable` props (`selectable`, `rowId`, `selectedIds`, `onToggleRow`, `onToggleAll: (shouldSelectAll: boolean) => void`) match all call sites; `crew_ids`/`pairing_ids` field names are consistent across Tasks 5–7.
