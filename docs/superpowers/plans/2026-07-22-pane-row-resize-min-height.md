# Pane Row Resize Min-Height Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent any visible lower Live/Scenario Gantt pane from being vertically resized out of the viewport by enforcing a shared minimum visible row height clamp.

**Architecture:** Extend the shared `row-resize` helper so it clamps the dragged row against the total available stack height after reserving minimum space for every visible row below. Keep the DOM measurement and store wiring shared across Live and Scenario, then prove the clamp with focused unit and Playwright regressions.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Playwright

## Global Constraints

- Keep the fix in the shared Live/Scenario row-resize path to preserve §Gantt-Unify.
- Do not change data models, APIs, backend behavior, or pane ordering.
- Every visible vertically stacked pane must keep a minimum visible height; drag past the limit must become a no-op.
- Preserve the existing anchor-stability behavior that materializes upper flex rows into px heights on first drag.
- Use the smallest real solution; no speculative abstractions or config switches.
- Frontend behavior changes require focused automated coverage: shared-helper unit tests plus real UI Playwright regressions.

---

## File Map

- Modify: `gantt/src/components/layout/row-resize.ts`
  - Shared pure row-height clamp logic for Live + Scenario.
- Modify: `gantt/src/components/layout/layout-grid.tsx`
  - Pass stack container height and visible row measurements into the shared helper for Live.
- Modify: `gantt/src/components/scenario-gantt/scenario-layout-grid.tsx`
  - Pass stack container height and visible row measurements into the shared helper for Scenario.
- Modify: `gantt/src/components/layout/__tests__/row-resize.test.ts`
  - Add pure helper coverage for lower-row min-height reservation.
- Modify: `e2e/tests/gantt/live-pane-row-resize.spec.ts`
  - Add a regression that repeatedly drags the lower splitter downward and asserts the bottom pane remains visible.
- Modify: `e2e/tests/gantt/scenario-draft-leadin-roster.spec.ts`
  - Add the same regression in Scenario using a real RO scenario.

## Task 1: Clamp Shared Row Resize Geometry

**Files:**
- Modify: `gantt/src/components/layout/row-resize.ts`
- Modify: `gantt/src/components/layout/layout-grid.tsx`
- Modify: `gantt/src/components/scenario-gantt/scenario-layout-grid.tsx`
- Test: `gantt/src/components/layout/__tests__/row-resize.test.ts`

**Interfaces:**
- Consumes: existing `resizeRowHeights({ rowHeights, measuredHeights, draggedRowIndex, dy, fallbackHeight, minHeight })`
- Produces: `resizeRowHeights({ rowHeights, measuredHeights, draggedRowIndex, dy, fallbackHeight, minHeight, containerHeight, splitterCount, splitterHeight }): number[]`

- [ ] **Step 1: Write the failing shared-helper tests**

```ts
import { describe, expect, it } from 'vitest'
import { resizeRowHeights } from '@/components/layout/row-resize'

describe('resizeRowHeights', () => {
  it('keeps the bottom row at the minimum height when dragging the lower splitter downward', () => {
    const next = resizeRowHeights({
      rowHeights: [-1, -1, -1],
      measuredHeights: [240, 220, 180],
      draggedRowIndex: 1,
      dy: 300,
      containerHeight: 640,
      splitterCount: 2,
      splitterHeight: 6,
    })

    expect(next[2]).toBe(-1)
    expect(next[1]).toBe(640 - 80 - 240 - 12)
  })

  it('keeps the lower row visible in a two-row stack when dragging the upper splitter downward', () => {
    const next = resizeRowHeights({
      rowHeights: [-1, -1],
      measuredHeights: [260, 240],
      draggedRowIndex: 0,
      dy: 500,
      containerHeight: 560,
      splitterCount: 1,
      splitterHeight: 6,
    })

    expect(next).toEqual([474, -1])
  })
})
```

- [ ] **Step 2: Run the shared-helper tests to verify they fail**

Run: `cd gantt && npm test -- --run src/components/layout/__tests__/row-resize.test.ts`

Expected: FAIL because `resizeRowHeights` does not yet accept `containerHeight`, `splitterCount`, or `splitterHeight`, and the clamp is not implemented.

- [ ] **Step 3: Implement the shared clamp in `row-resize.ts`**

```ts
export interface ResizeRowHeightsInput {
  rowHeights: number[]
  measuredHeights: number[]
  draggedRowIndex: number
  dy: number
  fallbackHeight?: number
  minHeight?: number
  containerHeight: number
  splitterCount: number
  splitterHeight: number
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)

export const resizeRowHeights = ({
  rowHeights,
  measuredHeights,
  draggedRowIndex,
  dy,
  fallbackHeight,
  minHeight = 80,
  containerHeight,
  splitterCount,
  splitterHeight,
}: ResizeRowHeightsInput): number[] => {
  const next = [...rowHeights]

  for (let index = 0; index <= draggedRowIndex; index++) {
    if (next[index] !== -1) continue
    const measured = measuredHeights[index]
    if (Number.isFinite(measured) && measured > 0) {
      next[index] = Math.max(minHeight, Math.round(measured))
    }
  }

  const measuredDraggedHeight = measuredHeights[draggedRowIndex]
  const baseHeight =
    next[draggedRowIndex] === -1
      ? Math.max(
          minHeight,
          Math.round(
            (Number.isFinite(measuredDraggedHeight) && measuredDraggedHeight > 0
              ? measuredDraggedHeight
              : fallbackHeight) ?? minHeight,
          ),
        )
      : next[draggedRowIndex]

  const fixedAbove = sum(next.slice(0, draggedRowIndex).filter((height) => height !== -1))
  const rowsBelowCount = measuredHeights.length - draggedRowIndex - 1
  const reservedBelow = rowsBelowCount * minHeight
  const reservedSplitters = splitterCount * splitterHeight
  const maxHeight = Math.max(
    minHeight,
    Math.floor(containerHeight - fixedAbove - reservedBelow - reservedSplitters),
  )

  next[draggedRowIndex] = Math.max(minHeight, Math.min(maxHeight, baseHeight + dy))
  return next
}
```

- [ ] **Step 4: Wire Live and Scenario layouts to pass stack geometry**

```ts
const rowElements = Array.from(
  rootRef.current?.querySelectorAll<HTMLElement>('[data-pane-grid-row="true"]') ?? [],
)

const measuredHeights = rowElements.map((row) => row.getBoundingClientRect().height)
const containerHeight = rootRef.current?.getBoundingClientRect().height ?? measuredHeights.reduce((sum, h) => sum + h, 0)

setRowHeights(
  resizeRowHeights({
    rowHeights: useLayoutStore.getState().rowHeights,
    measuredHeights,
    draggedRowIndex: rowIndex,
    dy,
    fallbackHeight: startH,
    containerHeight,
    splitterCount: Math.max(0, measuredHeights.length - 1),
    splitterHeight: 6,
  }),
)
```

Apply the same shape in `scenario-layout-grid.tsx`, replacing `useLayoutStore` with the per-scenario store.

- [ ] **Step 5: Run the focused unit tests and typecheck**

Run:

```bash
cd gantt
npm test -- --run src/components/layout/__tests__/row-resize.test.ts
npm exec -- tsc -p tsconfig.json --noEmit
```

Expected:

- `row-resize.test.ts`: PASS
- `tsc`: PASS

- [ ] **Step 6: Commit the shared clamp**

```bash
git add \
  gantt/src/components/layout/row-resize.ts \
  gantt/src/components/layout/layout-grid.tsx \
  gantt/src/components/scenario-gantt/scenario-layout-grid.tsx \
  gantt/src/components/layout/__tests__/row-resize.test.ts
git commit -m "fix: clamp pane row resize minimum height"
```

## Task 2: Add Live Lower-Pane Visibility Regression

**Files:**
- Modify: `e2e/tests/gantt/live-pane-row-resize.spec.ts`
- Test: `e2e/tests/gantt/live-pane-row-resize.spec.ts`

**Interfaces:**
- Consumes: `dragSplitter(page, splitterIndex, deltaY)`, row test ids `live-grid-row-0/1/2`
- Produces: `Live-1162` Playwright regression proving the bottom pane stays visible when dragging the lower splitter to the limit

- [ ] **Step 1: Add the failing Live Playwright regression**

```ts
test('Live-1162 — dragging the lower splitter to the limit keeps the flight pane visible', async ({ page }) => {
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto()
  await dashboard.addFlightPane()

  await expect(dashboard.flightPane).toBeVisible()

  await dragSplitter(page, 1, 500)

  const flightRow = page.getByTestId('live-grid-row-2')
  const flightBox = await flightRow.boundingBox()
  expect(flightBox, 'flight row should still be measurable at the drag limit').not.toBeNull()
  expect(flightBox!.height).toBeGreaterThanOrEqual(80)
  await expect(dashboard.flightPane).toBeVisible()
})
```

- [ ] **Step 2: Run the Live regression to verify it fails before the clamp**

Run:

```bash
cd e2e
GANTT_API_URL=https://crew-f8-usva-sit.roiscloud.com/live \
VITE_LIVE_TARGET=https://crew-f8-usva-sit.roiscloud.com/live \
GANTT_TEST_USER=Ryan \
GANTT_TEST_PASS=Our2027 \
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps \
  tests/gantt/live-pane-row-resize.spec.ts -g "Live-1162" --reporter=list
```

Expected: FAIL because the flight row height can collapse below `80px` or disappear from view.

- [ ] **Step 3: Adjust the assertion if the actual measured floor includes border math**

```ts
expect(flightBox!.height).toBeGreaterThanOrEqual(76)
```

Use this only if the measured DOM box includes border/splitter rounding and the helper clamp still guarantees the visual minimum. Keep the threshold strict enough that the pane is clearly visible.

- [ ] **Step 4: Re-run the Live regression after Task 1**

Run the same command from Step 2.

Expected: PASS with the flight pane still visible after a large downward drag.

- [ ] **Step 5: Commit the Live regression**

```bash
git add e2e/tests/gantt/live-pane-row-resize.spec.ts
git commit -m "test: cover live lower pane resize clamp"
```

## Task 3: Add Scenario Lower-Pane Visibility Regression

**Files:**
- Modify: `e2e/tests/gantt/scenario-draft-leadin-roster.spec.ts`
- Test: `e2e/tests/gantt/scenario-draft-leadin-roster.spec.ts`

**Interfaces:**
- Consumes: `ganttApiLogin(request)`, `findScenario(request, token, { fileType: 'RO' })`, `openAnyRoScenario(page, id, name)`, `dragSplitter(page, splitterIndex, deltaY)`
- Produces: `Scen-2056` Playwright regression proving the bottom Scenario pane stays visible when dragging the lower splitter to the limit

- [ ] **Step 1: Add the failing Scenario Playwright regression**

```ts
test('Scen-2056 — dragging the flight splitter to the limit keeps the flight pane visible', async ({ page, request }) => {
  const token = await ganttApiLogin(request)
  const scenario = await findScenario(request, token, { fileType: 'RO' })
  await openAnyRoScenario(page, scenario.id, scenario.name)

  const toolbar = page.getByTestId('scenario-gantt-toolbar')
  const addFlightBtn = toolbar.getByTestId('sg-add-pane-flight')
  if (await addFlightBtn.isEnabled()) {
    await addFlightBtn.click()
  }

  await expect(page.getByTestId('scenario-flight-canvas')).toBeVisible({ timeout: 10_000 })

  await dragSplitter(page, 1, 500)

  const flightRow = page.getByTestId('scenario-grid-row-2')
  const flightBox = await flightRow.boundingBox()
  expect(flightBox, 'scenario flight row should still be measurable at the drag limit').not.toBeNull()
  expect(flightBox!.height).toBeGreaterThanOrEqual(80)
})
```

- [ ] **Step 2: Run the Scenario regression to verify it fails before the clamp**

Run:

```bash
cd e2e
GANTT_API_URL=https://crew-f8-usva-sit.roiscloud.com/live \
VITE_LIVE_TARGET=https://crew-f8-usva-sit.roiscloud.com/live \
GANTT_TEST_USER=Ryan \
GANTT_TEST_PASS=Our2027 \
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps \
  tests/gantt/scenario-draft-leadin-roster.spec.ts -g "Scen-2056" --reporter=list
```

Expected: FAIL because the flight row can be collapsed below the visible minimum.

- [ ] **Step 3: Re-run the Scenario regression after Task 1**

Run the same command from Step 2.

Expected: PASS with the Scenario flight pane still visible after a large downward drag.

- [ ] **Step 4: Run the touched focused suite together**

Run:

```bash
cd gantt
npm test -- --run src/components/layout/__tests__/row-resize.test.ts

cd ../e2e
GANTT_API_URL=https://crew-f8-usva-sit.roiscloud.com/live \
VITE_LIVE_TARGET=https://crew-f8-usva-sit.roiscloud.com/live \
GANTT_TEST_USER=Ryan \
GANTT_TEST_PASS=Our2027 \
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps \
  tests/gantt/live-pane-row-resize.spec.ts -g "Live-1161|Live-1162" --reporter=list

GANTT_API_URL=https://crew-f8-usva-sit.roiscloud.com/live \
VITE_LIVE_TARGET=https://crew-f8-usva-sit.roiscloud.com/live \
GANTT_TEST_USER=Ryan \
GANTT_TEST_PASS=Our2027 \
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps \
  tests/gantt/scenario-draft-leadin-roster.spec.ts -g "Scen-2055|Scen-2056" --reporter=list
```

Expected:

- shared unit test: PASS
- Live focused regressions: PASS
- Scenario focused regressions: PASS

- [ ] **Step 5: Commit the Scenario regression and verification receipt**

```bash
git add e2e/tests/gantt/scenario-draft-leadin-roster.spec.ts
git commit -m "test: cover scenario lower pane resize clamp"
```

## Coverage Check

- Spec requirement "visible lower pane cannot be dragged out of the viewport": covered by Task 1 clamp plus Tasks 2 and 3 Playwright regressions.
- Spec requirement "shared Live/Scenario path": covered by Task 1 modifying only the shared helper and the two shared layout entry points.
- Spec requirement "preserve existing anchor stability": covered by keeping the materialization logic in Task 1 and re-running `Live-1161` and `Scen-2055` in Task 3 Step 4.
- No gaps found.
