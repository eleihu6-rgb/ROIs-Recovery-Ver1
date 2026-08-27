# Roster Seniority Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `SEN` (seniority) column to the Roster panes, sourced from `crew.seniority_num`, appearing in both the Column Settings dialog and the Roster pane header — visible by default, positioned right after Base.

**Architecture:** No backend change — `seniority_num` already flows to the frontend `crew` object via the slim list endpoint. We type it on `Crew`, add a `seniority` column entry to the roster column defaults (with a one-time localStorage migration), and map `crew.seniorityNum` into the pane's panel-row values through a small formatter. Tests use the existing `window.__ganttTest` introspection hook (extended) plus a Vitest unit test for the formatter — per §No-Illusion, assertions are against store truth and published render receipts, not bare visibility.

**Tech Stack:** React 19 + TypeScript + Zustand (gantt), Vitest (gantt unit), Playwright (e2e).

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `gantt/src/utils/format-seniority.ts` | Create | Pure formatter: `numeric(10,2)` string → display string |
| `gantt/src/utils/__tests__/format-seniority.test.ts` | Create | Vitest unit test for the formatter |
| `gantt/src/types/crew.ts` | Modify | Add `seniorityNum` to `Crew` interface |
| `gantt/src/stores/column-store.ts` | Modify | Add `seniority` column to roster defaults + reorder + migration |
| `gantt/src/utils/gantt-test-hook.ts` | Modify | Publish panel rows; expose `rosterColumns()`, `rosterPanel()`, `crewSeniority()` |
| `gantt/src/components/panes/roster-pane.tsx` | Modify | Map `crew.seniorityNum` into panel values; publish panel rows |
| `gantt/src/version.ts` | Modify | `FRONTEND_VERSION` +1 |
| `e2e/tests/gantt/roster-seniority-column.spec.ts` | Create | E2E: column listed, renders real crew data, toggles off |

Note: `column-config-dialog.tsx` and `pane-header-canvas.tsx` need **no** change — both read columns/values dynamically.

---

## Task 1: Seniority formatter (pure util, TDD)

**Files:**
- Create: `gantt/src/utils/format-seniority.ts`
- Test: `gantt/src/utils/__tests__/format-seniority.test.ts`

- [ ] **Step 1: Write the failing test**

Create `gantt/src/utils/__tests__/format-seniority.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatSeniority } from '@/utils/format-seniority'

describe('formatSeniority', () => {
  it('returns empty string for null / undefined / empty', () => {
    expect(formatSeniority(null)).toBe('')
    expect(formatSeniority(undefined)).toBe('')
    expect(formatSeniority('')).toBe('')
  })

  it('strips a trailing .00 (whole numbers display without decimals)', () => {
    expect(formatSeniority('1234.00')).toBe('1234')
    expect(formatSeniority('5.00')).toBe('5')
  })

  it('preserves a meaningful fractional part', () => {
    expect(formatSeniority('12.50')).toBe('12.50')
    expect(formatSeniority('12.5')).toBe('12.5')
  })

  it('passes through plain integer strings unchanged', () => {
    expect(formatSeniority('42')).toBe('42')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/utils/__tests__/format-seniority.test.ts`
Expected: FAIL — cannot resolve `@/utils/format-seniority` / `formatSeniority is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `gantt/src/utils/format-seniority.ts`:

```ts
/**
 * Format a crew seniority value for display.
 *
 * `crew.seniority_num` is `numeric(10,2)`, returned by Drizzle as a string
 * (e.g. "1234.00"). Whole numbers are shown without the trailing ".00";
 * a meaningful fractional part is preserved.
 */
export const formatSeniority = (value: string | null | undefined): string => {
  if (value == null || value === '') return ''
  return value.replace(/\.0+$/, '')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/utils/__tests__/format-seniority.test.ts`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/utils/format-seniority.ts gantt/src/utils/__tests__/format-seniority.test.ts
git commit -m "feat(gantt): add formatSeniority util for roster seniority display

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Type `seniorityNum` on the `Crew` interface

**Files:**
- Modify: `gantt/src/types/crew.ts:12-37` (the `Crew` interface)

- [ ] **Step 1: Add the field**

In `gantt/src/types/crew.ts`, inside the `Crew` interface, add `seniorityNum` right after `remarks` (around line 23):

```ts
export interface Crew {
  id: number
  crewId: string
  firstName: string
  middleName: string | null
  lastName: string
  preferredName: string | null
  gender: string
  division: string
  filiale: string
  status: number
  remarks: string | null
  /** Crew seniority (numeric(10,2) returned as string); present in slim list response. */
  seniorityNum: string | null
  // ... rest unchanged (quals, panelRank, etc.)
```

> `CrewDetail extends Crew` already declares `seniorityNum`. TypeScript permits a subtype to re-declare an identical property, so no change is needed in `CrewDetail`. If `tsc` reports a duplicate/conflict, delete the now-redundant `seniorityNum: string | null` line from the `CrewDetail` interface (around line 78).

- [ ] **Step 2: Verify type-checks**

Run: `cd gantt && npx tsc --noEmit`
Expected: No new errors referencing `crew.ts` or `seniorityNum`. (Pre-existing unrelated tsc errors may remain — see memory "Live-server pre-existing test failures"; do not attempt to fix those here.)

- [ ] **Step 3: Commit**

```bash
git add gantt/src/types/crew.ts
git commit -m "feat(gantt): type seniorityNum on Crew list interface

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Add the `seniority` column to roster defaults + migration

**Files:**
- Modify: `gantt/src/stores/column-store.ts:7-18` (defaults) and `:112-134` (`loadFromStorage`)

- [ ] **Step 1: Add the column and renumber the order**

Replace `DEFAULT_ROSTER_COLUMNS` (lines 7-18) with — note `seniority` at `order: 4`, everything after Base shifted by +1:

```ts
/** Default columns for Roster panes — keys match panelRows.values in roster-pane.tsx */
const DEFAULT_ROSTER_COLUMNS: ColumnConfig[] = [
  { key: 'crewId',    label: 'CrewId', width: 70, visible: true,  order: 1,  row: 1 },
  { key: 'rank',      label: 'Rank',   width: 45, visible: true,  order: 2,  row: 1 },
  { key: 'base',      label: 'Base',   width: 45, visible: true,  order: 3,  row: 1 },
  { key: 'seniority', label: 'SEN',    width: 50, visible: true,  order: 4,  row: 1 },
  { key: 'fleet',     label: 'Fleet',  width: 50, visible: true,  order: 5,  row: 1 },
  { key: 'ybh',       label: 'YBH',    width: 55, visible: true,  order: 6,  row: 1 },
  { key: 'mbh',       label: 'MBH',    width: 50, visible: false, order: 7,  row: 1 },
  { key: 'yal',       label: 'YAL',    width: 50, visible: false, order: 8,  row: 1 },
  { key: 'mal',       label: 'MAL',    width: 50, visible: false, order: 9,  row: 1 },
  { key: 'ydo',       label: 'YDO',    width: 50, visible: false, order: 10, row: 1 },
  { key: 'mdo',       label: 'MDO',    width: 50, visible: false, order: 11, row: 1 },
]
```

- [ ] **Step 2: Add the migration in `loadFromStorage`**

In `loadFromStorage` (lines 112-134), the stored roster configs from before this change have no `seniority` column. Extend the existing stale-check to also treat a missing `seniority` column as stale. Replace the `isStaleRoster` definition and the `merged` block (lines 119-129) with:

```ts
        // Migration: stored roster columns are stale if they still contain the removed
        // 'crewName' column OR are missing the newly-added 'seniority' column.
        const isStaleRoster = (cols: ColumnConfig[] | undefined) => {
          if (!cols) return false
          const hasCrewName = cols.some((c) => c.key === 'crewName')
          const hasSeniority = cols.some((c) => c.key === 'seniority')
          return hasCrewName || !hasSeniority
        }

        const merged: ColumnMap = {
          'roster-main': isStaleRoster(parsed['roster-main']) ? defaults['roster-main'] : (parsed['roster-main'] ?? defaults['roster-main']),
          'roster-sub':  isStaleRoster(parsed['roster-sub'])  ? defaults['roster-sub']  : (parsed['roster-sub']  ?? defaults['roster-sub']),
          'pairing': parsed['pairing'] ?? defaults['pairing'],
          'flight':  parsed['flight']  ?? defaults['flight'],
        }
```

> Note: `isStaleRoster(undefined)` now returns `false` so a pane with no stored config falls through to `?? defaults[...]` (defaults already include `seniority`). A pane *with* a stored config that lacks `seniority` is reset to defaults — the intended one-time migration.

- [ ] **Step 3: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: No new errors in `column-store.ts`.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/stores/column-store.ts
git commit -m "feat(gantt): add SEN column to roster defaults with localStorage migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Map seniority into panel values + extend the test hook

**Files:**
- Modify: `gantt/src/utils/gantt-test-hook.ts` (add publish + 3 getters)
- Modify: `gantt/src/components/panes/roster-pane.tsx` (map value + publish rows)

- [ ] **Step 1: Add panel-row publishing + getters to the test hook**

In `gantt/src/utils/gantt-test-hook.ts`:

(a) Add the import near the other store imports (after line 25):

```ts
import { useColumnStore } from '@/stores/column-store'
```

(b) Add the publish store + function next to `renderStats` (after line 96, the `const renderStats = ...` line):

```ts
// ── Panel-row 绘制回执（左侧表头列值；按 paneType 存最新一份）─────────────────
const panelRowsByPane = new Map<string, Array<Record<string, string>>>()

/** 由 RosterPane 在 panelRows 变化时调用；生产构建下 no-op。 */
export const publishPanelRows = (
  paneType: string,
  rows: Array<Record<string, string>>,
): void => {
  if (import.meta.env.PROD) return
  panelRowsByPane.set(paneType, rows)
}
```

(c) Add three getter functions next to the other getters (after the `rosterKeys` function, around line 194):

```ts
const rosterColumns = (): Array<{ key: string; label: string; visible: boolean }> =>
  useColumnStore.getState().getColumns('roster-main').map((c) => ({
    key: c.key,
    label: c.label,
    visible: c.visible,
  }))

const rosterPanel = (): Array<{ crewId: string; seniority: string }> =>
  (panelRowsByPane.get('roster-main') ?? []).map((v) => ({
    crewId: String(v.crewId ?? ''),
    seniority: String(v.seniority ?? ''),
  }))

const crewSeniority = (): Array<{ crewId: string; seniorityNum: string | null }> =>
  useCrewStore.getState().items.map((i) => ({
    crewId: i.crew.crewId,
    seniorityNum: i.crew.seniorityNum ?? null,
  }))
```

(d) Extend the `GanttTestApi` interface (after `rosterKeys: () => string[]`, around line 69):

```ts
  /** Roster-main 列配置（key/label/visible）——验证 SEN 列存在与可见性。 */
  rosterColumns: () => Array<{ key: string; label: string; visible: boolean }>
  /** Roster-main 左侧表头每行的 crewId + seniority 绘制值。 */
  rosterPanel: () => Array<{ crewId: string; seniority: string }>
  /** crew-store 中每个 crew 的原始 seniorityNum，用于交叉校验面板显示值。 */
  crewSeniority: () => Array<{ crewId: string; seniorityNum: string | null }>
```

(e) Register them in the `window.__ganttTest = { ... }` object (after `rosterKeys,`, around line 281):

```ts
    rosterColumns,
    rosterPanel,
    crewSeniority,
```

- [ ] **Step 2: Wire seniority into roster-pane panel values + publish rows**

In `gantt/src/components/panes/roster-pane.tsx`:

(a) Add the imports (after line 32, `import { useColumnStore } ...`):

```ts
import { formatSeniority } from '@/utils/format-seniority'
import { publishPanelRows } from '@/utils/gantt-test-hook'
```

(b) In the `unsortedPanelRows` `useMemo`, add `seniority` to the returned `values` object (insert right after the `crewId: cid,` line, around line 290):

```ts
          crewId: cid,
          rank,
          base,
          seniority: formatSeniority(crew?.seniorityNum),
          fleet,
          crewName,
```

(c) Publish the final rows for test introspection. Add this `useEffect` immediately after the `filteredPanelRows` `useMemo` (after line 438, before the `sortedCrewIdsRef` block):

```ts
  // Test introspection: publish the rendered left-panel row values (no-op in prod build).
  useEffect(() => {
    publishPanelRows(
      legacyPaneType,
      filteredPanelRows.map((r) => r.values as Record<string, string>),
    )
  }, [legacyPaneType, filteredPanelRows])
```

- [ ] **Step 3: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: No new errors in `roster-pane.tsx` or `gantt-test-hook.ts`.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/utils/gantt-test-hook.ts gantt/src/components/panes/roster-pane.tsx
git commit -m "feat(gantt): render seniority in roster panel + expose test introspection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: E2E test — column listed, renders real data, toggles off

**Files:**
- Create: `e2e/tests/gantt/roster-seniority-column.spec.ts`

- [ ] **Step 1: Write the e2e test**

Create `e2e/tests/gantt/roster-seniority-column.spec.ts`:

```ts
/**
 * Roster Seniority (SEN) column.
 *
 * Verifies the new SEN column: (1) is present & visible by default in roster-main
 * column config and listed in the Column Settings dialog; (2) renders real crew
 * seniority data (cross-checked against crew-store, not a placeholder); (3) can be
 * toggled off via the dialog. Assertions use window.__ganttTest store/render truth
 * per docs/test-cases/gantt/anti-illusion-rules.md (no bare toBeVisible on canvas).
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

const stripZeros = (v: string | null): string =>
  v == null || v === '' ? '' : v.replace(/\.0+$/, '')

test.describe('Roster Seniority Column', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
    // Wait until roster-main has drawn rows (panel rows published).
    await expect.poll(async () => (await page.evaluate(() => window.__ganttTest!.rosterPanel())).length)
      .toBeGreaterThan(0)
  })

  test('SEN column is present and visible by default @smoke', async ({ page }) => {
    const cols = await page.evaluate(() => window.__ganttTest!.rosterColumns())
    const sen = cols.find((c) => c.key === 'seniority')
    expect(sen, 'seniority column exists in roster-main config').toBeTruthy()
    expect(sen!.label, 'label is SEN').toBe('SEN')
    expect(sen!.visible, 'visible by default').toBe(true)
  })

  test('SEN column renders real crew seniority (cross-checked, not placeholder)', async ({ page }) => {
    const [panel, crew] = await page.evaluate(() => [
      window.__ganttTest!.rosterPanel(),
      window.__ganttTest!.crewSeniority(),
    ])
    expect(panel.length, 'panel rows present').toBeGreaterThan(0)

    // Every panel row carries a 'seniority' value (mapping is wired for all rows).
    const crewById = new Map(crew.map((c) => [c.crewId, c.seniorityNum]))
    for (const row of panel) {
      expect(crewById.has(row.crewId), `crew ${row.crewId} known to crew-store`).toBe(true)
      // The rendered value must equal the formatted store value — proves real data flow.
      expect(row.seniority).toBe(stripZeros(crewById.get(row.crewId) ?? null))
    }

    // At least one row has a non-empty numeric seniority (data actually present, not all blank).
    const nonEmpty = panel.filter((r) => r.seniority !== '')
    expect(nonEmpty.length, 'at least one crew has a seniority value').toBeGreaterThan(0)
    expect(nonEmpty.every((r) => /^\d+(\.\d+)?$/.test(r.seniority)), 'seniority values are numeric').toBe(true)
  })

  test('Column Settings dialog lists SEN and can toggle it off', async ({ page }) => {
    // Open the roster-main column settings (Settings2 button, title="Column settings").
    await page.getByTitle('Column settings').first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('SEN', { exact: true }), 'SEN listed in dialog').toBeVisible()

    // Toggle SEN off: its row's eye button is the sibling of the 'SEN' label.
    await dialog.getByText('SEN', { exact: true }).locator('xpath=preceding-sibling::button[1]').click()

    // Store truth: seniority column now hidden.
    await expect.poll(async () => {
      const cols = await page.evaluate(() => window.__ganttTest!.rosterColumns())
      return cols.find((c) => c.key === 'seniority')?.visible
    }).toBe(false)
  })
})
```

- [ ] **Step 2: Run the e2e test**

Run: `cd e2e && npx playwright test tests/gantt/roster-seniority-column.spec.ts --reporter=list`
Expected: PASS — 3 tests passing.

> If `getByTitle('Column settings').first()` matches multiple toolbars, it already resolves to the first (roster-main). If the dialog's eye-button xpath fails to locate (DOM structure differs), fall back to toggling via the store in the test: `await page.evaluate(() => window.__ganttTest && useColumnStore)` is not exposed — instead click the button that is the 2nd child of the SEN row container; debug with `await dialog.innerHTML()`. Do not weaken the assertion — keep the `visible === false` store check as the proof.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/gantt/roster-seniority-column.spec.ts
git commit -m "test(gantt): e2e for roster SEN column (listing, real data, toggle)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Version bump + full verification

**Files:**
- Modify: `gantt/src/version.ts:18`

- [ ] **Step 1: Bump frontend version**

In `gantt/src/version.ts`, change line 18:

```ts
export const FRONTEND_VERSION = 43
```

(from `42` → `43`; frontend-only change per root CLAUDE.md "版本号管理").

- [ ] **Step 2: Run the full gantt unit suite**

Run: `cd gantt && npx vitest run`
Expected: PASS including `format-seniority.test.ts` (note any pre-existing unrelated failures per memory; the new test must pass).

- [ ] **Step 3: Run the roster e2e suites to confirm no regression**

Run: `cd e2e && npx playwright test tests/gantt/roster-seniority-column.spec.ts tests/gantt/roster-pane.spec.ts --reporter=list`
Expected: PASS for the new spec; `roster-pane.spec.ts` unchanged/passing.

- [ ] **Step 4: Paste the PASS/FAIL summary** into the completion message (per §No-Illusion — claims require a test receipt).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore(gantt): bump FRONTEND_VERSION to 43 for SEN column

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** type (T2) ✓; column default visible-after-Base (T3) ✓; migration (T3) ✓; panel value mapping + formatter (T1, T4) ✓; no backend change ✓; dialog/header unchanged ✓; tests incl. real-data regression angle (T1, T5) ✓; version bump (T6) ✓.
- **Type consistency:** `formatSeniority`, `publishPanelRows`, `rosterColumns`/`rosterPanel`/`crewSeniority`, and `seniorityNum` are used with identical signatures across tasks.
- **No placeholders:** every code step shows complete code; commands have expected output.
