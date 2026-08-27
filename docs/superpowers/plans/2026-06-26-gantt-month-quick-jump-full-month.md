# Gantt Month Quick Jump Full-Month Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Live Gantt month quick-jump show a full selected calendar month even when the current range only partially covers that month.

**Architecture:** Keep the existing Live `TimeAxisMenu` and `zoomToMonth` path. Pin the partial-month behavior with Playwright first, then only change production code if the test proves a gap.

**Tech Stack:** React 19, TypeScript, Zustand, Vite, Playwright.

## Global Constraints

- Runtime frontend code changes must increment `gantt/src/version.ts` `FRONTEND_VERSION`.
- UI behavior verification must use Playwright against the real UI.
- Do not change Scenario Gantt unless a matching bug is confirmed there.
- Do not touch backend, database, schema, or unrelated dirty files.
- Preserve first-paint behavior; use existing `applyGanttFilters()` loading.

---

### Task 1: Add Partial-Month Regression Test

**Files:**
- Modify: `e2e/tests/gantt/timeline-month-quicknav.spec.ts`

**Interfaces:**
- Consumes: `seedGanttAuth(page, request)`, `waitGanttReady(page)`, `readHook(page, 'dateRange')`, existing `visibleWindow()`, `shiftMonth()`, and `tzMidnightMs()`.
- Produces: A failing or passing Playwright regression named `Live-1230 — partially covered month expands before quick-jump fit`.

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `test.describe('timeline month quick-nav', () => { ... })` block:

```typescript
  test('Live-1230 — partially covered month expands before quick-jump fit', async ({ page, request }) => {
    test.setTimeout(180_000)
    await seedGanttAuth(page, request)

    await page.goto('/altair/')
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
    await page.getByTestId('module-nav-live').click()

    await page.getByTestId('live-empty-state').click()
    await selectDropdownOption(page, 'filter-crew-base', 'YEG', 'crew')
    await page.getByTestId('filter-apply').click()
    await waitGanttReady(page, 90_000)

    const tz = await page.evaluate(
      () => (JSON.parse(window.localStorage.getItem('gantt-timezone') ?? '{}').timezone as string) ?? 'UTC',
    )
    const initialStart = await page.getByTestId('date-range-from').inputValue()
    const [year, month] = initialStart.split('-').map(Number)
    const partialStart = `${year}-${pad(month)}-21`

    await page.getByTestId('date-range-from').fill(partialStart)
    await waitGanttReady(page, 90_000)
    await expect
      .poll(async () => (await page.getByTestId('date-range-from').inputValue()), { timeout: 30_000 })
      .toBe(partialStart)

    const monthStartMs = tzMidnightMs(year, month, 1, tz)
    const next = shiftMonth(year, month, 1)
    const monthEndMs = tzMidnightMs(next.y, next.m, 1, tz)

    const axis = page.getByTestId('pane-time-axis').first()
    await axis.click({ button: 'right', position: { x: 30, y: 20 } })
    const menu = page.getByTestId('time-axis-menu')
    await expect(menu).toBeVisible()
    await page.getByTestId(`time-axis-menu-month-${year}-${pad(month)}`).click()

    await expect
      .poll(async () => new Date((await readHook<{ start: string }>(page, 'dateRange')).start).getTime(), {
        timeout: 30_000,
        message: 'quick jump did not expand the range start to the selected month start',
      })
      .toBe(monthStartMs)

    await expect
      .poll(async () => {
        const range = await readHook<{ end: string }>(page, 'dateRange')
        return new Date(range.end).getTime() >= monthEndMs - 1
      }, {
        timeout: 30_000,
        message: 'quick jump did not keep the selected month end inside the range',
      })
      .toBe(true)

    const epsMs = 60_000
    await expect
      .poll(async () => {
        const win = await visibleWindow(page)
        return win.startMs <= monthStartMs + epsMs && win.endMs >= monthEndMs - epsMs
      }, {
        timeout: 60_000,
        message: `partially covered month ${year}-${pad(month)} was not fully visible after quick jump`,
      })
      .toBe(true)
  })
```

- [ ] **Step 2: Run test to verify RED or existing GREEN**

Run:

```bash
npx playwright test e2e/tests/gantt/timeline-month-quicknav.spec.ts -g "Live-1230" --project=chromium
```

Expected RED if the bug exists: the range start remains on day 21 or the visible window does not cover the full selected month.

Expected existing GREEN if the current implementation already handles partial-month expansion: the new regression passes and no production code is needed for this behavior.

### Task 2: Implement Minimal Quick-Jump Fix If RED

**Files:**
- Modify only if Task 1 is RED: `gantt/src/components/gantt/time-axis-menu.tsx`
- Modify only if runtime code changes: `gantt/src/version.ts`

**Interfaces:**
- Consumes: `calendarDateToUtcMidnight()`, `endOfCalendarDayUtc()`, `useFilterStore.getState().dateRange`.
- Produces: Month coverage logic where partial month overlap is treated as uncovered.

- [ ] **Step 1: Make production change only if the regression fails**

If the test fails because partial months are treated as covered, update `TimeAxisMenu` so a month is covered only when:

```typescript
const loaded = firstDay.getTime() >= start.getTime() && lastDay.getTime() <= end.getTime()
```

If the existing code already has this exact condition and the test failure comes from stale range timing, move the `zoomToMonth()` call after `filterStore.setDateRange(newStart, newEnd)` using the updated `rangeStart = newStart` value.

- [ ] **Step 2: Bump frontend version only when runtime code changed**

Change:

```typescript
export const FRONTEND_VERSION = 349  // gantt: tune shared selected row color across details and body
```

To:

```typescript
export const FRONTEND_VERSION = 350  // gantt: ensure month quick-jump expands partial months before fitting
```

- [ ] **Step 3: Re-run targeted Playwright**

Run:

```bash
npx playwright test e2e/tests/gantt/timeline-month-quicknav.spec.ts -g "Live-1230" --project=chromium
```

Expected: PASS.

### Task 3: Final Verification

**Files:**
- Verify: `gantt/src/components/gantt/time-axis-menu.tsx`
- Verify: `e2e/tests/gantt/timeline-month-quicknav.spec.ts`
- Verify if changed: `gantt/src/version.ts`

**Interfaces:**
- Consumes: completed Task 1 and Task 2.
- Produces: verification receipt for final response.

- [ ] **Step 1: Run TypeScript check**

Run:

```bash
cd gantt && npx tsc --noEmit
```

Expected: 0 TypeScript errors.

- [ ] **Step 2: Run quick-jump Playwright spec**

Run:

```bash
npx playwright test e2e/tests/gantt/timeline-month-quicknav.spec.ts --project=chromium
```

Expected: all tests in the file pass.

- [ ] **Step 3: Inspect isolated diff**

Run:

```bash
git diff -- docs/superpowers/specs/2026-06-26-gantt-month-quick-jump-full-month-design.md docs/superpowers/plans/2026-06-26-gantt-month-quick-jump-full-month.md e2e/tests/gantt/timeline-month-quicknav.spec.ts gantt/src/components/gantt/time-axis-menu.tsx gantt/src/version.ts
```

Expected: diff contains only the spec, plan, test, and any minimal runtime/version changes needed by the failing test.
