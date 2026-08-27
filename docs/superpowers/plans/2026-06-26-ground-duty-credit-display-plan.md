# Ground Duty Credit Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show persisted saved/imported ground-duty credit as a read-only row when editing an existing Live Gantt ground task.

**Architecture:** The existing Live Gantt roster API already returns `actCreditedMinutes` and `schCreditedMinutes` from `roster_flight`. The implementation is a frontend-only dialog change: format `actCreditedMinutes` first, fall back to `schCreditedMinutes`, and render a read-only `Credit` row in edit mode only. Tests cover the formatter and the create/edit visibility behavior without adding a backend request.

**Tech Stack:** React 19, TypeScript, Zustand, Vite/Vitest, Playwright, `@rois/ui`, Live Gantt custom Canvas/overlay UI.

## Global Constraints

- Source columns: use `roster_flight.act_credited_minutes` first, then `roster_flight.sch_credited_minutes`.
- Data source is Live `roster_flight`, not PBS.
- Show persisted saved/imported roster credit only when editing an existing ground duty.
- Do not calculate preview credit from `assignment.fixed_credit_min`, `assignment.credit_pct`, assignment duration, or other assignment metadata.
- Do not render a credit row in Create Ground Task mode.
- Do not send credit fields when saving the ground task.
- Runtime frontend code changes must increment `FRONTEND_VERSION` in `gantt/src/version.ts`.
- UI feature work requires Playwright coverage and `npm run check:ui`.
- Keep changes surgical; do not refactor the dialog to `AppDialog` in this task.

---

## File Structure

- Modify `gantt/src/components/roster/ground-task-dialog.tsx`
  - Add local `formatGroundTaskCredit` helper.
  - Render read-only `Credit` row only for `mode === 'edit'`.
  - Keep submit payload unchanged.
- Create `gantt/src/components/roster/__tests__/ground-task-dialog-credit.test.ts`
  - Unit-test credit formatting and fallback selection through an exported helper.
- Modify `e2e/tests/gantt/ground-task-dialog.spec.ts`
  - Extend existing Playwright coverage to verify create mode has no credit row.
  - Add a test that opens the dialog with a controlled existing ground task and verifies the read-only credit row.
- Modify `gantt/src/version.ts`
  - Increment `FRONTEND_VERSION` by 1.

---

### Task 1: Add Credit Formatting Helper And Unit Tests

**Files:**
- Modify: `gantt/src/components/roster/ground-task-dialog.tsx`
- Create: `gantt/src/components/roster/__tests__/ground-task-dialog-credit.test.ts`

**Interfaces:**
- Consumes: `actCreditedMinutes: string | number | null | undefined`, `schCreditedMinutes: string | number | null | undefined`
- Produces: `export const formatGroundTaskCredit = (actCreditedMinutes, schCreditedMinutes) => string`
- Contract: return formatted positive credit from actual first, scheduled fallback second, otherwise `-`.

- [ ] **Step 1: Write the failing unit test**

Create `gantt/src/components/roster/__tests__/ground-task-dialog-credit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { formatGroundTaskCredit } from '../ground-task-dialog'

describe('formatGroundTaskCredit', () => {
  it('uses actual credited minutes first', () => {
    expect(formatGroundTaskCredit('180', '240')).toBe('3h 00m')
  })

  it('falls back to scheduled credited minutes when actual is absent', () => {
    expect(formatGroundTaskCredit(null, '240')).toBe('4h 00m')
  })

  it('returns dash for absent, invalid, zero, or negative credit', () => {
    expect(formatGroundTaskCredit(null, null)).toBe('-')
    expect(formatGroundTaskCredit('bad', null)).toBe('-')
    expect(formatGroundTaskCredit('0', '0')).toBe('-')
    expect(formatGroundTaskCredit('-15', '0')).toBe('-')
  })

  it('rounds decimal minute values from numeric DB payloads', () => {
    expect(formatGroundTaskCredit('89.6', null)).toBe('1h 30m')
  })
})
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run:

```bash
cd gantt
npm run test -- src/components/roster/__tests__/ground-task-dialog-credit.test.ts
```

Expected: FAIL because `formatGroundTaskCredit` is not exported from `ground-task-dialog.tsx`.

- [ ] **Step 3: Implement the helper**

In `gantt/src/components/roster/ground-task-dialog.tsx`, add this helper near `calcDuration`:

```typescript
type CreditValue = string | number | null | undefined

const creditMinutes = (value: CreditValue): number | null => {
  if (value == null || value === '') return null
  const minutes = Math.round(Number(value))
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  return minutes
}

export const formatGroundTaskCredit = (
  actCreditedMinutes: CreditValue,
  schCreditedMinutes: CreditValue,
): string => {
  const minutes = creditMinutes(actCreditedMinutes) ?? creditMinutes(schCreditedMinutes)
  if (minutes == null) return '-'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours}h ${remainder.toString().padStart(2, '0')}m`
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run:

```bash
cd gantt
npm run test -- src/components/roster/__tests__/ground-task-dialog-credit.test.ts
```

Expected: PASS for all `formatGroundTaskCredit` tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add gantt/src/components/roster/ground-task-dialog.tsx gantt/src/components/roster/__tests__/ground-task-dialog-credit.test.ts
git commit -m "test: cover ground duty credit formatting"
```

---

### Task 2: Render Read-Only Credit Row In Edit Mode

**Files:**
- Modify: `gantt/src/components/roster/ground-task-dialog.tsx`

**Interfaces:**
- Consumes: `formatGroundTaskCredit(editItem?.actCreditedMinutes, editItem?.schCreditedMinutes)`
- Produces: a visible read-only row with label `Credit` and `data-testid="ground-task-credit-row"` only in edit mode.

- [ ] **Step 1: Add a failing component-level assertion to the existing unit test file**

Append this test to `gantt/src/components/roster/__tests__/ground-task-dialog-credit.test.ts`:

```typescript
import type { RosterItem } from '@/types'

const creditedGroundTask = {
  id: 1292674,
  crewId: '1010',
  pairingId: null,
  ver: 1,
  base: 'YOW',
  label: null,
  assignmentGroup: 'GRD',
  assignment: 'SIM',
  role: null,
  subRole: null,
  source: 'F8',
  isRequested: 0,
  isSwapped: 0,
  preference: null,
  comments: null,
  score: null,
  workingHour: null,
  schStrDtUtc: '2026-06-21T06:00:00.000Z',
  schEndDtUtc: '2026-06-21T18:00:00.000Z',
  actStrDtUtc: null,
  actEndDtUtc: null,
  fltId: null,
  fltDt: null,
  dutySeq: null,
  segSeq: null,
  division: 'P',
  flightActingRank: '',
  rosterActingRank: null,
  activeRank: null,
  position: null,
  schCreditedMinutes: '240',
  actCreditedMinutes: '180',
  tagSet: null,
  exceptionCode: null,
  ybh: null,
  mbh: null,
  yal: null,
  mal: null,
  ydo: null,
  mdo: null,
  mcred: null,
} satisfies RosterItem

describe('ground task credit row contract', () => {
  it('documents the edit-mode display value from a roster item', () => {
    expect(formatGroundTaskCredit(
      creditedGroundTask.actCreditedMinutes,
      creditedGroundTask.schCreditedMinutes,
    )).toBe('3h 00m')
  })
})
```

Run:

```bash
cd gantt
npm run test -- src/components/roster/__tests__/ground-task-dialog-credit.test.ts
```

Expected: PASS. This test locks the source-field precedence before the UI row is added.

- [ ] **Step 2: Render the edit-only row**

In `gantt/src/components/roster/ground-task-dialog.tsx`, compute the display value after `duration`:

```typescript
  const duration = calcDuration(startDate, startTime, endDate, endTime)
  const creditDisplay = mode === 'edit'
    ? formatGroundTaskCredit(editItem?.actCreditedMinutes, editItem?.schCreditedMinutes)
    : '-'
```

Then add this block after the existing `Assignment Group (auto-fill)` row and before `Start`:

```tsx
            {/* Credit (persisted roster value, read-only) */}
            {mode === 'edit' && (
              <div
                className="grid grid-cols-[110px_1fr] items-center gap-2"
                data-testid="ground-task-credit-row"
              >
                <label className="text-xs text-muted-foreground">Credit</label>
                <div className="flex h-8 items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 text-xs text-muted-foreground">
                  <span
                    className="font-mono font-semibold tabular-nums text-foreground"
                    data-testid="ground-task-credit-value"
                  >
                    {creditDisplay}
                  </span>
                  <span className="text-2xs">read-only</span>
                  <Lock className="ml-auto h-3 w-3 text-muted-foreground/60" />
                </div>
              </div>
            )}
```

Do not add `actCreditedMinutes` or `schCreditedMinutes` to `handleSubmit`, `CreateGroundTaskInput`, or `UpdateRosterInput`.

- [ ] **Step 3: Run the unit test again**

Run:

```bash
cd gantt
npm run test -- src/components/roster/__tests__/ground-task-dialog-credit.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit Task 2**

```bash
git add gantt/src/components/roster/ground-task-dialog.tsx gantt/src/components/roster/__tests__/ground-task-dialog-credit.test.ts
git commit -m "feat: show ground duty credit in edit dialog"
```

---

### Task 3: Add Playwright Coverage For Create/Edit Dialog Behavior

**Files:**
- Modify: `e2e/tests/gantt/ground-task-dialog.spec.ts`

**Interfaces:**
- Consumes: `data-testid="ground-task-credit-row"` and `data-testid="ground-task-credit-value"` from Task 2.
- Produces: Playwright coverage proving create mode has no credit row and edit mode shows persisted credit.

- [ ] **Step 1: Add create-mode no-credit assertion**

In existing test `GroundTask-1`, immediately after the dialog locator is assigned, add:

```typescript
    await expect(dialog.getByTestId('ground-task-credit-row')).toHaveCount(0)
```

- [ ] **Step 2: Add an edit-mode test using controlled store state**

Append this test inside `test.describe('Create Ground Task dialog', () => { ... })`:

```typescript
  test('GroundTask-2 — edit dialog shows persisted roster credit as read-only', async ({ page }) => {
    const existing = (await rosterObjects(page))[0]
    const groundTask = {
      ...existing,
      id: 987654321,
      crewId: String(existing.crewId),
      pairingId: null,
      assignmentGroup: 'GRD',
      assignment: 'SIM',
      label: 'SIM',
      source: 'F8',
      actCreditedMinutes: '180',
      schCreditedMinutes: '240',
      dutySeq: null,
      segSeq: null,
      fltId: null,
      fltDt: null,
    }

    await page.evaluate((task) => {
      const hook = (window as unknown as {
        __ganttTest?: {
          patchRoster?: (paneId: 'main' | 'sub', items: Array<Record<string, unknown>>) => void
          openGroundTaskEdit?: (item: Record<string, unknown>) => void
        }
      }).__ganttTest
      if (!hook?.patchRoster || !hook.openGroundTaskEdit) {
        throw new Error('Gantt test hook is missing patchRoster/openGroundTaskEdit')
      }
      hook.patchRoster('main', [task])
      hook.openGroundTaskEdit(task)
    }, groundTask)

    const heading = page.getByRole('heading', { name: 'Edit Ground Task' })
    await expect(heading).toBeVisible({ timeout: 5_000 })
    const dialog = page.locator('div.bg-card').filter({ has: heading })

    await expect(dialog.getByTestId('ground-task-credit-row')).toBeVisible()
    await expect(dialog.getByTestId('ground-task-credit-value')).toHaveText('3h 00m')
    await expect(dialog.getByTestId('ground-task-credit-row')).toContainText('read-only')
  })
```

If the `__ganttTest` hook does not expose `patchRoster` or `openGroundTaskEdit`, add the smallest test-only hook in the file that currently defines `window.__ganttTest` so the test can drive the real dialog without persisting business data:

```typescript
patchRoster: (paneId: 'main' | 'sub', items: RosterItem[]) => useRosterStore.getState().patchItems(paneId, items),
openGroundTaskEdit: (item: RosterItem) => useUiStore.getState().openGroundTaskEdit(item),
```

- [ ] **Step 3: Run the targeted Playwright test**

Run:

```bash
npx playwright test -c e2e/config/playwright.config.ts e2e/tests/gantt/ground-task-dialog.spec.ts
```

Expected: PASS for `GroundTask-1` and `GroundTask-2`.

- [ ] **Step 4: Commit Task 3**

```bash
git add e2e/tests/gantt/ground-task-dialog.spec.ts
git commit -m "test: cover ground duty credit dialog"
```

If a test hook file was modified, include that exact file in `git add` and keep the commit message unchanged.

---

### Task 4: Version Bump And Required Verification

**Files:**
- Modify: `gantt/src/version.ts`

**Interfaces:**
- Consumes: current `FRONTEND_VERSION` numeric value.
- Produces: `FRONTEND_VERSION` incremented by exactly 1.

- [ ] **Step 1: Increment frontend version**

Open `gantt/src/version.ts` and increment only `FRONTEND_VERSION` by 1. Do not change `BACKEND_VERSION`.

Example when current frontend version is `123`:

```typescript
export const FRONTEND_VERSION = 124
```

- [ ] **Step 2: Run required verification**

Run:

```bash
cd gantt
npm run test -- src/components/roster/__tests__/ground-task-dialog-credit.test.ts
```

Expected: PASS.

Run from repo root:

```bash
npx playwright test -c e2e/config/playwright.config.ts e2e/tests/gantt/ground-task-dialog.spec.ts
```

Expected: PASS.

Run from repo root:

```bash
npm run check:ui
```

Expected: PASS with hard violations equal to zero.

- [ ] **Step 3: Review diff for forbidden scope creep**

Run:

```bash
git diff -- gantt/src/components/roster/ground-task-dialog.tsx gantt/src/components/roster/__tests__/ground-task-dialog-credit.test.ts e2e/tests/gantt/ground-task-dialog.spec.ts gantt/src/version.ts
```

Expected:

- no backend files changed
- no credit fields added to submit payloads
- no create-mode credit preview
- only `FRONTEND_VERSION` changed in `gantt/src/version.ts`

- [ ] **Step 4: Commit Task 4**

```bash
git add gantt/src/version.ts
git commit -m "chore: bump frontend version for ground duty credit"
```

---

## Plan Self-Review

- Spec coverage: Task 1 covers actual-first/scheduled-fallback formatting; Task 2 covers edit-only read-only UI and unchanged submit payloads; Task 3 covers Playwright UI behavior; Task 4 covers version bump and required verification.
- Placeholder scan: no TBD/TODO/fill-in placeholders remain. The only conditional is the explicit fallback for missing test-hook support, with exact code to add.
- Type consistency: helper names, data-testid values, and `RosterItem` credit property names are consistent across all tasks.
