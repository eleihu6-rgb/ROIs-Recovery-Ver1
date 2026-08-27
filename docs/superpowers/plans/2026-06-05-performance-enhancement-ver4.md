# Performance Enhancement Ver4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 8 validated, non-gated performance findings from `docs/superpowers/specs/2026-06-05-133714-overall-performance-enhancement-enhance-Ver4.md` (V4-P10, P01, P03, P02, P04, P06, P08, P13) with a Playwright/pytest regression receipt per change. App is pre-UAT: every change must be behavior-preserving except P10 (removes a data leak).

**Architecture:** All Gantt changes follow patterns already proven in this codebase: RAF-coalescing (PaneCanvas), epoch-ms geometry (`parseIsoMs`/`msToX` in roster-renderer), memoized render buckets (`buildRosterRenderBuckets` + `useMemo`), and formatter-by-zone caches (`formatTime` in timezone-store). The engine-server change is a 2-line executor wrap. No API shapes, no visual output, and no user-visible behavior change anywhere (except removed console logs).

**Tech Stack:** React 19 + Zustand + Canvas (gantt), Playwright e2e (`config/playwright.config.ts`, project `gantt`), Python 3.12 asyncio + pytest (engine-server).

**Excluded by scope decision (do NOT implement):** V4-P05 (needs UX approval), V4-P07 (visual-miss risk), V4-P09 (measure first), V4-P11/P12 (response-semantics changes), V4-P14 (CI governance).

---

## Environment Notes (read before starting)

- Repo root: `/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS` (note: path contains spaces — always quote).
- Gantt app is served at base path `/fpqe/gantt/`. Panes only load data on the **Live** view. The running live-server points at a remote demo Postgres.
- **e2e infrastructure (use it, do not re-invent):**
  - Helpers: `e2e/utils/gantt-hook.ts` — `seedGanttAuth(page, request)`, `gotoGantt`, `openLiveView`, `counts`, `renderStats` (returns `PaneRenderStat[]` with `paneId`/`paneType`/`renders`), `paneRenderStat(page, paneTypePrefix)`, `paneRenders`, `scrollPaneVertically`, `zoomState`, `readHook<T>(page, method)`.
  - Page object: `e2e/pages/gantt/gantt-dashboard-page.ts` (`GanttDashboardPage`) — `goto()`, `pairingCanvas`, `zoomIn()`, `refresh()`, etc. Spec boilerplate to copy (from `pairing-pane.spec.ts`):
    ```ts
    test.beforeEach(async ({ page, request }) => {
      await seedGanttAuth(page, request)
      dashboard = new GanttDashboardPage(page)
      await dashboard.goto()
    })
    ```
  - Canvas test ids: `roster-canvas`, `pairing-canvas`, `flight-canvas` (right-side content canvases).
  - In-app test hook: `gantt/src/utils/gantt-test-hook.ts` installs `window.__ganttTest` (non-prod builds only) via `installGanttTestHook()`. Its `zoom()` method ALREADY returns `{ pxPerHour, zoomMin, zoomMax, dirty, scrollX }` — read `scrollX` with `readHook(page, 'zoom')`. New probes added by this plan extend `GanttTestApi` + the `window.__ganttTest` object literal in `installGanttTestHook` (lines ~405-435), following the existing style.
- New e2e specs are FLAT files: `e2e/tests/gantt/perf-<name>.spec.ts` (matching the existing flat layout — only `help/` is a subdirectory).
- This repo may be shared by 2 concurrent Claude sessions. Execute in a git worktree (superpowers:using-git-worktrees); symlink `gantt/node_modules` and `e2e/node_modules` into the worktree and run vite on an alternate port (e.g. 5273) with `GANTT_BASE_URL` pointing at it if 5173 is taken.
- Playwright invocation (from `e2e/`): `npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/<file> --reporter=list`.
- KNOWN PRE-EXISTING failures (do not chase, do not count as regressions): several legacy pane specs are pre-broken; `tests/gantt/help` has 1 known-red screenshot test (`scenario-run.png` missing); engine-server has ~5 stale-test failures unrelated to file management. Task 0 records the exact baseline.
- Branch: create `feat/gantt/perf-enhance-ver4` from current HEAD. Commit message footer (per project CLAUDE.md): `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`.

---

### Task 0: Branch, worktree, regression baseline

**Files:**
- No source changes. Produces `/tmp/perf-ver4-baseline-gantt.txt` and `/tmp/perf-ver4-baseline-engine.txt` (not committed).

- [ ] **Step 1: Create worktree + branch**

Use the superpowers:using-git-worktrees skill. Branch name: `feat/gantt/perf-enhance-ver4`, based on current HEAD of `feat/ai/date-range-tool`. Symlink node_modules as needed (`gantt/node_modules`, `e2e/node_modules`, root if present).

- [ ] **Step 2: Commit the spec + this plan if not yet committed**

```bash
git add docs/superpowers/specs/2026-06-05-133714-overall-performance-enhancement-enhance-Ver4.md docs/superpowers/plans/2026-06-05-performance-enhancement-ver4.md
git commit -m "docs: validated perf spec enhance-Ver4 + implementation plan

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Record gantt e2e baseline**

Start the gantt dev stack the same way existing specs expect (check `e2e/config/playwright.config.ts` for webServer config — it may auto-start vite). Then:

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt --reporter=list 2>&1 | tee /tmp/perf-ver4-baseline-gantt.txt
```

Expected: mostly PASS with the known-red items listed in Environment Notes. Record the exact list of failing spec names — these are the pre-existing set.

- [ ] **Step 4: Record engine-server pytest baseline**

```bash
cd engine-server
python3 -m pytest tests/test_file_management.py tests/test_e2e_lifecycle.py -v 2>&1 | tee /tmp/perf-ver4-baseline-engine.txt
```

Record pass/fail names.

---

### Task 1 (V4-P10): Remove filter-payload console logging — security fix

**Files:**
- Modify: `gantt/src/stores/crew-store.ts:307,314,327,329`
- Modify: `gantt/src/components/panes/pairing-pane.tsx:297`
- Modify: `gantt/src/stores/rule-check-store.ts:157,160`
- Test: `e2e/tests/gantt/perf-no-payload-logging.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `e2e/tests/gantt/perf-no-payload-logging.spec.ts`:

```ts
/**
 * V4-P10 regression: loadMore paths must not log filter payloads (data-security rule).
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, counts } from '../../utils/gantt-hook'

test('scroll-to-bottom loadMore emits no payload-bearing console logs', async ({ page, request }) => {
  const offending: string[] = []
  page.on('console', (msg) => {
    const t = msg.text()
    // These exact prefixes leaked sessionFilters / request params (ranks,
    // bases, fleets, divisions) to production consoles — must never appear.
    if (/\[CrewStore\] loadMore (called|replace mode|params|result)/.test(t)) offending.push(t)
    if (/\[PairingPane\] triggering loadMore/.test(t)) offending.push(t)
  })

  await seedGanttAuth(page, request)
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto()

  const before = await counts(page)
  expect(before.roster, 'roster data loaded').toBeGreaterThan(0)

  // Wheel the roster pane to the bottom repeatedly to cross the loadMore threshold.
  const canvas = page.getByTestId('roster-canvas')
  const box = await canvas.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 800)
  }
  await page.waitForTimeout(1500) // let loadMore round-trips land

  expect(offending, `leaked logs:\n${offending.join('\n')}`).toHaveLength(0)
})
```

(Guard against a vacuous pass: pre-fix, the very first `loadMore` call logs `[CrewStore] loadMore called:` even when it early-returns, so the scroll burst reliably produces offending lines. If the demo dataset is too small for 30 wheels to reach the threshold, increase the wheel count or assert `counts(page)` grew.)

- [ ] **Step 2: Run test to verify it fails**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/perf-no-payload-logging.spec.ts --reporter=list
```

Expected: FAIL — `offending` contains `[CrewStore] loadMore called: ...` lines.

- [ ] **Step 3: Remove the logs**

In `gantt/src/stores/crew-store.ts` delete these four lines entirely (they leak `sessionFilters` and full request `params`; do not DEV-guard them — delete):

```ts
console.log('[CrewStore] loadMore called:', { loadingMore: state.loadingMore, hasMore: state.getHasMore(), queryMode: state.queryMode, sessionsLen: state.sessions.length })   // line 307
console.log('[CrewStore] loadMore replace mode:', { nextPage, sessionPage: session.page, sessionFilters: session.filters })  // line 314
console.log('[CrewStore] loadMore params:', params)                                  // line 327
console.log('[CrewStore] loadMore result:', { itemsLen: result.items.length, total: result.total, page: result.page })       // line 329
```

In `gantt/src/components/panes/pairing-pane.tsx` delete line 297:

```ts
console.log('[PairingPane] triggering loadMore:', { scrollY, threshold, hasMore: store.getHasMore() })
```

In `gantt/src/stores/rule-check-store.ts` wrap lines 157 and 160 (counts only — keep but guard):

```ts
if (import.meta.env.DEV) console.debug('[RuleCheck] No check inputs (0 pairings with flights)')
...
if (import.meta.env.DEV) console.debug(`[RuleCheck] Checking ${allCheckInputs.length} pairings for ${crewIds.length} crews`)
```

Keep all `console.error` calls — error surfacing is acceptable.

- [ ] **Step 4: Run test to verify it passes**

Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/crew-store.ts gantt/src/components/panes/pairing-pane.tsx gantt/src/stores/rule-check-store.ts e2e/tests/gantt/perf-no-payload-logging.spec.ts
git commit -m "fix(gantt): remove production console logs leaking crew filter payloads

V4-P10 — unguarded loadMore logs exposed sessionFilters and request params
(ranks/bases/fleets/divisions) in production consoles, violating the
data-security rule. RuleCheck count-only debug logs are now DEV-guarded.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 (V4-P01): RAF-coalesce horizontal scroll store writes

**Files:**
- Modify: `gantt/src/stores/gantt-view-store.ts` (actions at lines 158-172, zoom actions at 132-156 + `zoomToMonth`, interface at 70-72)
- Modify: `gantt/src/components/layout/horizontal-scrollbar.tsx:81,114`
- Modify: `gantt/src/components/gantt/time-axis.tsx` (3 direct `setState` sites near lines 201, 214, 230)
- Modify: `gantt/src/utils/gantt-test-hook.ts` (store-write counter on `GanttTestApi`)
- Test: `e2e/tests/gantt/perf-horizontal-scroll-coalescing.spec.ts`

**Design:** High-frequency input (`scroll(dx,dy)` from pane wheel handlers; scrollbar thumb-drag/wheel) accumulates into module-level pending values and flushes via ONE `requestAnimationFrame` per frame → one Zustand write per frame instead of one per input event. Programmatic jumps (`setScrollX`, zoom actions, time-axis setState) stay immediate and cancel pending input so a stale flush can't overwrite them.

- [ ] **Step 1: Add a view-store write counter to the test hook**

In `gantt/src/utils/gantt-test-hook.ts` (already non-prod-guarded via `installGanttTestHook`, and already imports `useGanttViewStore`):

1. Add to the `GanttTestApi` interface (near `zoom`, line ~95):

```ts
/** 累计 gantt-view-store 写入次数（V4-P01 合并断言用）。 */
viewStoreWrites: () => number
```

2. Add the counter near the other module-level helpers and wire it inside `installGanttTestHook()` (lines ~405-435):

```ts
let viewStoreWriteCount = 0

// inside installGanttTestHook(), before the window.__ganttTest assignment:
useGanttViewStore.subscribe(() => { viewStoreWriteCount += 1 })

// inside the window.__ganttTest object literal:
viewStoreWrites: () => viewStoreWriteCount,
```

(`zoom()` already exposes `scrollX` — no new accessor needed for position.)

- [ ] **Step 2: Write the failing test**

Create `e2e/tests/gantt/perf-horizontal-scroll-coalescing.spec.ts`:

```ts
/**
 * V4-P01 regression: a burst of horizontal wheel events must coalesce into
 * ~1 store write per frame, with no lost scroll distance.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

type ZoomProbe = { pxPerHour: number; scrollX: number; dirty: boolean }
const probe = async (page: import('@playwright/test').Page) => ({
  zoom: await readHook<ZoomProbe>(page, 'zoom'),
  writes: await readHook<number>(page, 'viewStoreWrites'),
})

test.beforeEach(async ({ page, request }) => {
  await seedGanttAuth(page, request)
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto()
})

test('40-event horizontal wheel burst → coalesced store writes, exact distance', async ({ page }) => {
  const canvas = page.getByTestId('roster-canvas')
  const box = await canvas.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.waitForTimeout(300) // let initial renders settle

  const before = await probe(page)
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(30, 0)   // horizontal: routes scroll(dx, 0)
  }
  await page.waitForTimeout(400)    // final RAF flush
  const after = await probe(page)

  // Functional parity: no lost deltas.
  expect(after.zoom.scrollX - before.zoom.scrollX).toBe(40 * 30)
  // Coalescing: pre-fix this is ≥40 (one write per event).
  expect(after.writes - before.writes).toBeLessThan(30)
  expect(after.writes - before.writes).toBeGreaterThan(0)
})

test('zoom after a scroll burst lands on a consistent position (pending input cancelled)', async ({ page }) => {
  const dashboard = new GanttDashboardPage(page)
  const canvas = page.getByTestId('roster-canvas')
  const box = await canvas.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  for (let i = 0; i < 10; i++) await page.mouse.wheel(40, 0)
  await dashboard.zoomIn()          // immediate path — must not be overwritten by a stale flush
  await page.waitForTimeout(400)
  const z1 = await readHook<ZoomProbe>(page, 'zoom')
  await page.waitForTimeout(300)
  const z2 = await readHook<ZoomProbe>(page, 'zoom')
  expect(z2.scrollX).toBe(z1.scrollX)   // no late flush moved the view after zoom settled
  expect(z2.pxPerHour).toBe(z1.pxPerHour)
})
```

- [ ] **Step 3: Run tests to verify the coalescing assertion fails**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/perf-horizontal-scroll-coalescing.spec.ts --reporter=list
```

Expected: FAIL on `after.writes - before.writes` (≈40+ writes pre-fix). The functional distance assertion should already pass — that is the parity guarantee.

- [ ] **Step 4: Implement coalescing in `gantt-view-store.ts`**

At module scope (below imports, above `create`):

```ts
// ── V4-P01: RAF-coalesced horizontal scroll ─────────────────────────────────
// 高频输入（pane wheel 的 scroll(dx,dy)、横向滚动条拖拽/滚轮）先累积进 pending，
// 每帧仅一次 RAF flush 写 store；程序化跳转（setScrollX / zoom）保持立即写入，
// 并先取消 pending，避免上一帧残留输入覆盖跳转结果。
let pendingDx = 0
let pendingDy = 0
let pendingAbsX: number | null = null
let scrollFlushRaf = 0

/** Drop queued high-frequency scroll input (call before any programmatic scroll/zoom jump). */
export const cancelPendingScroll = (): void => {
  pendingDx = 0
  pendingDy = 0
  pendingAbsX = null
  if (scrollFlushRaf) {
    cancelAnimationFrame(scrollFlushRaf)
    scrollFlushRaf = 0
  }
}

const flushScroll = (): void => {
  scrollFlushRaf = 0
  const absX = pendingAbsX
  const dx = pendingDx
  const dy = pendingDy
  pendingAbsX = null
  pendingDx = 0
  pendingDy = 0
  useGanttViewStore.setState((state) => ({
    scrollX: Math.max(0, (absX !== null ? absX : state.scrollX) + dx),
    scrollY: Math.max(0, state.scrollY + dy),
    dirty: true,
  }))
}

const scheduleScrollFlush = (): void => {
  if (!scrollFlushRaf) scrollFlushRaf = requestAnimationFrame(flushScroll)
}
```

Replace the three actions (interface lines 70-72 gain one new member `setScrollXCoalesced: (x: number) => void`):

```ts
setScrollX: (x) => {
  // Immediate programmatic jump (track click, tests, goto). Cancel queued
  // input so a pending flush cannot overwrite this position.
  cancelPendingScroll()
  set({ scrollX: Math.max(0, x), dirty: true })
},

/** Coalesced absolute target for high-frequency input (scrollbar thumb drag). */
setScrollXCoalesced: (x) => {
  pendingAbsX = Math.max(0, x)
  pendingDx = 0
  scheduleScrollFlush()
},

setScrollY: (y) => {
  set({ scrollY: Math.max(0, y), dirty: true })
},

scroll: (dx, dy) => {
  pendingDx += dx
  pendingDy += dy
  scheduleScrollFlush()
},
```

Add `cancelPendingScroll()` as the FIRST line of `zoomIn`, `zoomOut`, and `zoomToMonth` (all three read+write `scrollX`).

- [ ] **Step 5: Update high-frequency scrollbar call sites**

`gantt/src/components/layout/horizontal-scrollbar.tsx`:

- Line 22, also select the new action: `const setScrollXCoalesced = useGanttViewStore((s) => s.setScrollXCoalesced)`
- Line 81 (thumb drag, high-frequency, absolute): `setScrollXCoalesced(Math.max(0, Math.min(maxScrollX, newScrollX)))` — and add `setScrollXCoalesced` to that effect's dep array (line 94).
- Line 114 (wheel): the current code computes from subscribed `scrollX`, which goes stale inside a same-frame burst once writes are coalesced. Replace with a delta-based call so bursts accumulate correctly:

```ts
const onWheel = useCallback((e: React.WheelEvent) => {
  e.preventDefault()
  const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY
  // Delta-based + coalesced: same path as pane wheel scrolling. (Max-clamp is
  // dropped to match pane wheel behavior, which has never max-clamped.)
  scroll(delta, 0)
}, [scroll])
```

with `const scroll = useGanttViewStore((s) => s.scroll)` added to the selectors. Track click (line 107) keeps immediate `setScrollX` — it is a one-shot jump.

- [ ] **Step 6: Guard the three direct setState sites in time-axis.tsx**

In `gantt/src/components/gantt/time-axis.tsx`, locate the three `useGanttViewStore.setState({ pxPerHour..., scrollX..., dirty: true })` calls (drag-zoom-in ~line 201, drag-zoom-out ~line 214, double-click-reset ~line 230). Import `cancelPendingScroll` from `@/stores/gantt-view-store` and call it immediately before each `setState`.

- [ ] **Step 7: Run the new spec + neighboring regressions**

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/perf-horizontal-scroll-coalescing.spec.ts --reporter=list
# then the specs most likely to catch scroll/zoom regressions:
npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/pairing-pane.spec.ts tests/gantt/flight-pane.spec.ts tests/gantt/pane-auto-load.spec.ts tests/gantt/load-speed.spec.ts --reporter=list
```

Expected: new spec PASS; area specs match the Task 0 baseline (no NEW failures). Manually verify in the dev server: wheel left/right, scrollbar thumb drag, track click, zoom in/out, right-click month → Go to Month, double-click reset — TimeAxis, panes, and thumb stay in lockstep.

- [ ] **Step 8: Commit**

```bash
git add gantt/src/stores/gantt-view-store.ts gantt/src/components/layout/horizontal-scrollbar.tsx gantt/src/components/gantt/time-axis.tsx gantt/src/utils/gantt-test-hook.ts e2e/tests/gantt/perf-horizontal-scroll-coalescing.spec.ts
git commit -m "refactor(gantt): RAF-coalesce horizontal scroll store writes (V4-P01)

High-frequency wheel/drag input now accumulates and flushes once per frame
instead of one Zustand write (and one React commit wave) per input event.
Programmatic jumps and zoom stay immediate and cancel pending input.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 (V4-P03): Flight renderer epoch-ms geometry

**Files:**
- Modify: `gantt/src/components/gantt/renderers/flight-renderer.ts:50-91`
- Modify: `gantt/src/utils/gantt-test-hook.ts` (add `flightProbe` / `isFlightSelected` to `GanttTestApi`)
- Test: `e2e/tests/gantt/perf-flight-geometry-parity.spec.ts`

- [ ] **Step 1: Add the geometry probe to the test hook**

In `gantt/src/utils/gantt-test-hook.ts`, extend `GanttTestApi` and `installGanttTestHook` (existing style — store truth only):

```ts
// interface additions:
/** 第一条可见 flight 的几何探针（V4-P03 像素等价回归用）。 */
flightProbe: () => {
  id: number; schDepDtUtc: string; rowIndex: number; rowCenterY: number
  scrollX: number; pxPerHour: number; rangeStartIso: string
} | null
isFlightSelected: (id: number) => boolean
```

Implementation: read the flight pane's row structure from `useFlightStore` (the same rows flight-pane passes as `flightRows` — check the store/pane for the grouped-by-registration accessor), the flight pane instance's `scrollY` from `useLayoutStore` (`panes.get(paneId)?.viewport?.scrollY`, paneId discoverable via the existing `panes()` hook method), `scrollX`/`pxPerHour` from `useGanttViewStore`, and `rangeStart` from `usePaneStore().dateRange.start.toISOString()`. Pick the first non-frozen row whose first flight's computed x falls in `[20, canvasWidth-100]`; return `rowCenterY = HEADER_HEIGHT + rowIndex * ROW_HEIGHT - scrollY + ROW_HEIGHT / 2` (import the constants from `gantt-constants`). `isFlightSelected` reads `useFlightStore`'s selected-ids set (find the exact field — it backs `selectedFlightIds` in `FlightRenderContext`).

- [ ] **Step 2: Write the parity test**

The change must be pixel-identical (`msToX` replicates `differenceInMinutes` truncation — see comment at `gantt-utils.ts:32-34`). Lock that in with a click-hit-test: compute a visible flight's expected x from store data using the SAME arithmetic, click it, assert it becomes selected.

Create `e2e/tests/gantt/perf-flight-geometry-parity.spec.ts`:

```ts
/**
 * V4-P03/P04 regression: flight geometry must stay pixel-identical after the
 * msToX conversion; cross-day detection must stay correct after caching.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, addFlightPane } from '../../utils/gantt-hook'

test.beforeEach(async ({ page, request }) => {
  await seedGanttAuth(page, request)
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto()
  await addFlightPane(page)   // skip if the flight pane is already in the default layout
})

test('computed-position click selects the flight (geometry parity pin)', async ({ page }) => {
  type Probe = { id: number; schDepDtUtc: string; rowCenterY: number; scrollX: number; pxPerHour: number; rangeStartIso: string }
  const probe = await readHook<Probe | null>(page, 'flightProbe')
  expect(probe, 'a visible flight exists').not.toBeNull()

  // Same truncation arithmetic as msToX:
  const iso = probe!.schDepDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z')
  const rangeStartMs = Date.parse(probe!.rangeStartIso)
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe!.pxPerHour - probe!.scrollX

  await page.getByTestId('flight-canvas').click({ position: { x: x + 5, y: probe!.rowCenterY } })
  const selected = await page.evaluate(
    (id) => (window as unknown as { __ganttTest: { isFlightSelected: (i: number) => boolean } }).__ganttTest.isFlightSelected(id),
    probe!.id,
  )
  expect(selected).toBe(true)
})
```

(This test must PASS before the change and still pass after — it is the regression net for geometry drift.)

- [ ] **Step 3: Run it — must PASS pre-change (this is a parity pin, not red-green)**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/perf-flight-geometry-parity.spec.ts --reporter=list
```

Expected: PASS. If it fails pre-change, fix the test, not the renderer.

- [ ] **Step 4: Convert geometry to epoch-ms**

In `flight-renderer.ts`:

1. Change the import on line 21: add `msToX, parseIsoMs`, drop `timeToX` if no longer referenced.
2. In `renderFlightTasks` (line 50), hoist the range start once and pass it down:

```ts
export const renderFlightTasks = (rc: FlightRenderContext): void => {
  const { canvasHeight, scrollY, flightRows, frozenRowCount } = rc
  const rangeStartMs = rc.rangeStart.getTime()   // V4-P03: hoisted out of the per-flight loop

  const scrollableCount = flightRows.length - frozenRowCount
  const { first, last } = getVisibleRowRange(scrollY, canvasHeight, scrollableCount)
  for (let idx = first; idx <= last; idx++) {
    const rowIdx = idx + frozenRowCount
    const row = flightRows[rowIdx]
    if (!row) continue
    for (const flight of row.flights) {
      drawFlightBlock(rc, flight, rowIdx, rangeStartMs)
    }
  }
}
```

3. In `drawFlightBlock` (line 75), add the `rangeStartMs: number` parameter and replace lines 83-86:

```ts
// V4-P03: epoch-ms pure arithmetic (pixel-identical to timeToX's UTC branch —
// msToX replicates date-fns differenceInMinutes truncation, see gantt-utils.ts).
const x = msToX(parseIsoMs(flight.schDepDtUtc), rangeStartMs, pxPerHour) - scrollX
const endX = msToX(parseIsoMs(flight.schArvDtUtc), rangeStartMs, pxPerHour) - scrollX
```

(`const start/end` Date variables disappear; nothing else used them.)

- [ ] **Step 5: Run parity spec + flight suite**

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/perf-flight-geometry-parity.spec.ts --reporter=list
npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/flight-pane.spec.ts --reporter=list
```

Expected: parity spec PASS; flight-pane spec matches baseline.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/gantt/renderers/flight-renderer.ts gantt/src/utils/gantt-test-hook.ts e2e/tests/gantt/perf-flight-geometry-parity.spec.ts
git commit -m "refactor(gantt): flight renderer epoch-ms geometry via msToX (V4-P03)

Replaces per-flight date-fns differenceInMinutes with pure arithmetic,
matching the roster renderer. Pixel-identical by construction.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 (V4-P02): Pairing render model — memoized duty buckets + epoch-ms

**Files:**
- Modify: `gantt/src/components/gantt/renderers/pairing-renderer.ts` (export bucket builder; consume in `drawSegmentRow`; msToX conversion throughout)
- Modify: `gantt/src/components/panes/pairing-pane.tsx:342-352` (build buckets via `useMemo`, pass through context)
- Modify: `gantt/src/utils/gantt-test-hook.ts` (add `pairingProbe` / `isPairingSegSelected` / `comparePairingBuckets`)
- Test: `e2e/tests/gantt/perf-pairing-render-model.spec.ts`

- [ ] **Step 1: Write the parity test**

Same philosophy as Task 3 — pin current behavior first. Extend the test hook with `pairingProbe()` / `isPairingSegSelected(id)` (mirror the Task 3 flight probe: first visible pairing item's first segment, `{ segId, schStrDtUtc, rowIndex, scrollX, scrollY, pxPerHour, rangeStartIso, headerHeight: PAIRING_HEADER_HEIGHT, rowHeight: PAIRING_ROW_HEIGHT }`; selection set comes from the pairing store field backing `selectedPairingIds`). Then create `e2e/tests/gantt/perf-pairing-render-model.spec.ts`:

```ts
/**
 * V4-P02 regression: pairing geometry + duty grouping must be unchanged after
 * the render-model (memoized buckets + msToX) refactor.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

test.beforeEach(async ({ page, request }) => {
  await seedGanttAuth(page, request)
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto()
})

test('pairing segment click-selection works at computed position (parity pin)', async ({ page }) => {
  type Probe = {
    segId: number; schStrDtUtc: string; rowIndex: number; scrollX: number
    scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number
  }
  const probe = await readHook<Probe | null>(page, 'pairingProbe')
  expect(probe, 'a visible pairing segment exists').not.toBeNull()

  const iso = probe!.schStrDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z')
  const rangeStartMs = Date.parse(probe!.rangeStartIso)
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe!.pxPerHour - probe!.scrollX
  const rowTop = probe!.headerHeight + probe!.rowIndex * probe!.rowHeight - probe!.scrollY
  const centerY = rowTop + Math.floor(probe!.rowHeight / 2)

  await page.getByTestId('pairing-canvas').click({ position: { x: x + 5, y: centerY } })
  const selected = await page.evaluate(
    (id) => (window as unknown as { __ganttTest: { isPairingSegSelected: (i: number) => boolean } }).__ganttTest.isPairingSegSelected(id),
    probe!.segId,
  )
  expect(selected).toBe(true)
})

test('duty grouping identical between live grouping and prebuilt buckets', async ({ page }) => {
  // comparePairingBuckets(n) is added to the hook in Step 3 — it recomputes
  // groupSegmentsByDuty fresh and deep-compares with the memoized bucket.
  const result = await readHook<{ compared: number; mismatches: unknown[] }>(page, 'comparePairingBuckets20')
  expect(result.mismatches).toEqual([])
  expect(result.compared).toBeGreaterThan(0)
})
```

(`readHook` calls zero-arg methods — expose the comparison as `comparePairingBuckets20()` comparing the first 20 items, or use `page.evaluate` with an argument; either is fine, keep it consistent with the hook style. The first test must pass pre-change; the second goes green in Step 3.)

- [ ] **Step 2: Run the first test — must PASS pre-change**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/perf-pairing-render-model.spec.ts --reporter=list
```

Expected: test 1 PASS, test 2 FAIL (hook fn missing) — acceptable red for the green step.

- [ ] **Step 3: Implement the render model**

In `pairing-renderer.ts`:

1. Export the existing grouper's output type and a bucket builder (place next to `groupSegmentsByDuty`, line 363):

```ts
export interface PairingDutyGroup { dutySeq: number; segments: PairingSegment[] }

/**
 * V4-P02: build duty buckets once when pairing items change (roster QW2 pattern —
 * see buildRosterRenderBuckets). Keyed by pairing id. The render loop consumes
 * this instead of regrouping/sorting per visible row per frame.
 * Output is exactly groupSegmentsByDuty(item.segments) per item.
 */
export const buildPairingDutyBuckets = (items: PairingItem[]): Map<number, PairingDutyGroup[]> => {
  const out = new Map<number, PairingDutyGroup[]>()
  for (const item of items) {
    out.set(item.pairing.id, groupSegmentsByDuty(item.segments))
  }
  return out
}
```

(Verify the `Pairing` id field name in `gantt/src/types/pairing.ts` — if it is not `id`, key by the actual primary id used by `selectedPairingIds`.)

2. Add to `PairingRenderContext` (line 73):

```ts
/** V4-P02: prebuilt duty buckets keyed by pairing id (falls back to live grouping if absent). */
dutyBuckets?: Map<number, PairingDutyGroup[]>
```

3. In `drawSegmentRow` replace line 157:

```ts
const duties = rc.dutyBuckets?.get(pairing.id) ?? groupSegmentsByDuty(segments)
```

4. Epoch-ms conversion: at the top of `drawSegmentRow` (after destructuring, line 117) add `const rangeStartMs = rangeStart.getTime()`, then mechanically replace every `timeToX(parseIsoCached(X), rangeStart, pxPerHour, 'UTC')` in this file with `msToX(parseIsoMs(X), rangeStartMs, pxPerHour)` — there are 12 occurrences (layover ×2, rest ×2, pickup ×2, brief ×2, segment ×2, debrief ×2, dropoff ×2). One special case at line 210/213: `addMinutes(parseIsoCached(restStart), restMin).toISOString()` then re-parse — simplify to pure ms:

```ts
const restStartMs = parseIsoMs(restStart)
const restEndMs = restStartMs + restMin * 60_000
const restX = msToX(restStartMs, rangeStartMs, pxPerHour) - scrollX
const restEndX = msToX(restEndMs, rangeStartMs, pxPerHour) - scrollX
```

(and drop the now-unused `addMinutes` import if nothing else uses it). Update imports: add `msToX, parseIsoMs`, remove `timeToX`/`parseIsoCached` if unreferenced.

5. In `pairing-pane.tsx`, above the render callback (line 342):

```ts
// V4-P02: 渲染就绪 duty 桶 — 仅在 items 变化时构建（对照 roster QW2）。
const dutyBuckets = useMemo(() => buildPairingDutyBuckets(reorderedPairingItems), [reorderedPairingItems])
```

and add `dutyBuckets,` to the `pairingCtx` object literal (line 344-351), plus `dutyBuckets` to the `renderContent` useCallback dep array. Import `buildPairingDutyBuckets` from the renderer.

6. Add the `comparePairingBuckets20()` accessor to `gantt-test-hook.ts`: for the first 20 pairing-store items, compute `groupSegmentsByDuty(item.segments)` fresh (export it from pairing-renderer or re-derive via `buildPairingDutyBuckets([item])`) AND read the live memoized bucket the pane passes (expose the latest buckets map via a module-level setter the pane calls, or rebuild from store items — rebuild is acceptable since the builder is deterministic), compare `[dutySeq, segments.map(s => s.id)]` shapes, return `{ compared, mismatches }`.

- [ ] **Step 4: Run both tests + pairing suite**

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/perf-pairing-render-model.spec.ts --reporter=list
npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/pairing-pane.spec.ts tests/gantt/pairing-filter-chips.spec.ts tests/gantt/no-session-tag-line.spec.ts --reporter=list
```

Expected: both new tests PASS; pairing specs match baseline. Manually eyeball one pairing row at high zoom: pickup/brief/flight/debrief/dropoff/layover/rest bands unchanged.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/gantt/renderers/pairing-renderer.ts gantt/src/components/panes/pairing-pane.tsx gantt/src/utils/gantt-test-hook.ts e2e/tests/gantt/perf-pairing-render-model.spec.ts
git commit -m "refactor(gantt): pairing render model — memoized duty buckets + epoch-ms geometry (V4-P02)

Duty grouping/sorting moves out of the per-frame draw loop into a useMemo
bucket build (roster QW2 pattern); all 12 timeToX calls become msToX pure
arithmetic. Equivalence asserted by e2e bucket-comparison test.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 (V4-P04): Cache the cross-day formatter

**Files:**
- Modify: `gantt/src/stores/timezone-store.ts` (new cached helper next to `formatTime`)
- Modify: `gantt/src/components/gantt/renderers/flight-renderer.ts:252-253`
- Test: extend `e2e/tests/gantt/perf-flight-geometry-parity.spec.ts` (cross-day helper assertions via test hook)

- [ ] **Step 1: Implement the cached helper in `timezone-store.ts`** (append below `formatTime`):

```ts
// V4-P04: 跨天(+1)判断 — 与 formatTime 同款缓存策略。
// 旧实现每个 full-width 航班每帧 new Intl.DateTimeFormat('en-CA') + 2×new Date。
const dateFormatterByZone = new Map<string, Intl.DateTimeFormat>()
const getLocalDateFormatter = (zoneId: string): Intl.DateTimeFormat => {
  let f = dateFormatterByZone.get(zoneId)
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: zoneId, year: 'numeric', month: '2-digit', day: '2-digit' })
    dateFormatterByZone.set(zoneId, f)
  }
  return f
}

const CROSS_DAY_CACHE_LIMIT = 200_000
const crossDayCache = new Map<string, boolean>()

const toUtcDate = (utcTimestamp: string): Date => {
  // Force UTC like formatTime: ISO strings without timezone indicator would be
  // parsed as local time by new Date().
  const s = (utcTimestamp.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(utcTimestamp))
    ? utcTimestamp
    : utcTimestamp + 'Z'
  return new Date(s)
}

/**
 * Whether arrival falls on a different local calendar day than departure in
 * the display timezone (IANA DST-aware). Memoized by zone|dep|arv.
 */
export function isCrossDayLocal(depUtc: string, arvUtc: string, zoneId: string): boolean {
  const key = `${zoneId}|${depUtc}|${arvUtc}`
  let v = crossDayCache.get(key)
  if (v === undefined) {
    if (crossDayCache.size >= CROSS_DAY_CACHE_LIMIT) crossDayCache.clear()
    const fmt = getLocalDateFormatter(zoneId)
    v = fmt.format(toUtcDate(depUtc)) !== fmt.format(toUtcDate(arvUtc))
    crossDayCache.set(key, v)
  }
  return v
}
```

(Behavior note: the old inline code used raw `new Date(iso)`; the helper normalizes a missing `Z` exactly like `formatTime` already does — an intentional consistency fix, only relevant for non-`Z` payloads.)

- [ ] **Step 2: Use it in `drawFullPuck`** — replace `flight-renderer.ts:252-253`:

```ts
// V4-P04: cached cross-day check (was: new Intl.DateTimeFormat per flight per frame)
const isCrossDay = isCrossDayLocal(flight.schDepDtUtc, flight.schArvDtUtc, timezone)
```

and extend the import on line 25: `import { formatTime, isCrossDayLocal } from '@/stores/timezone-store'`.

- [ ] **Step 3: Write the test** — expose `isCrossDayLocal` on the test hook (add `isCrossDayLocal: (dep: string, arv: string, zone: string) => boolean` to `GanttTestApi` and `isCrossDayLocal,` to the object literal in `installGanttTestHook`), then add to `perf-flight-geometry-parity.spec.ts`:

```ts
test('cross-day detection: UTC, base-timezone, and DST boundary', async ({ page }) => {
  // The beforeEach already loaded the app; the helper is pure.
  const cases = await page.evaluate(() => {
    const f = (window as unknown as { __ganttTest: { isCrossDayLocal: (d: string, a: string, z: string) => boolean } }).__ganttTest.isCrossDayLocal
    return {
      utcSameDay:    f('2026-06-01T08:00:00Z', '2026-06-01T12:00:00Z', 'UTC'),
      utcCross:      f('2026-06-01T22:00:00Z', '2026-06-02T01:00:00Z', 'UTC'),
      // 23:00Z dep / 02:00Z arv = 19:00 / 22:00 in Toronto (EDT, UTC-4): same local day
      torontoSame:   f('2026-06-01T23:00:00Z', '2026-06-02T02:00:00Z', 'America/Toronto'),
      // 03:00Z dep / 05:00Z arv = 23:00 prev-day / 01:00 in Toronto: cross local day
      torontoCross:  f('2026-06-02T03:00:00Z', '2026-06-02T05:00:00Z', 'America/Toronto'),
      // DST spring-forward night in Toronto (2026-03-08): 06:30Z=01:30 EST, 07:30Z=03:30 EDT — same local day
      dstSameDay:    f('2026-03-08T06:30:00Z', '2026-03-08T07:30:00Z', 'America/Toronto'),
      // repeat call exercises the memo path
      memoHit:       f('2026-06-01T22:00:00Z', '2026-06-02T01:00:00Z', 'UTC'),
    }
  })
  expect(cases).toEqual({ utcSameDay: false, utcCross: true, torontoSame: false, torontoCross: true, dstSameDay: false, memoHit: true })
})
```

- [ ] **Step 4: Run the spec file**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/perf-flight-geometry-parity.spec.ts --reporter=list
```

Expected: all tests PASS (geometry parity from Task 3 must still pass — it shares the file).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/timezone-store.ts gantt/src/components/gantt/renderers/flight-renderer.ts gantt/src/utils/gantt-test-hook.ts e2e/tests/gantt/perf-flight-geometry-parity.spec.ts
git commit -m "refactor(gantt): cache cross-day formatter + memoize isCrossDay (V4-P04)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 (V4-P06): PaneHeaderCanvas scheduling parity with PaneCanvas

**Files:**
- Modify: `gantt/src/components/gantt/pane-header-canvas.tsx:135,157-211`
- Test: `e2e/tests/gantt/perf-header-canvas-scheduling.spec.ts`

**Context (why the rewrite must be exact):** today's effect condition `dirty || scrollY >= 0 && size...` is effectively always-true (precedence: `dirty || (scrollY>=0 && ...)`), and the cleanup cancels the pending RAF on every effect re-run. These two bugs mask each other: when PaneCanvas's render calls `markClean()`, the header's pending RAF is cancelled by cleanup but immediately rescheduled by the always-true condition. Fixing only the condition would make the header MISS renders. The rewrite must therefore mirror PaneCanvas's full discipline (lines 194-233 of pane-canvas.tsx): latest-render ref, `!rafRef.current` guard, unmount-only cancellation — PLUS a render-identity tracker, because header data (rows/columns/selection) changes do not always set the global dirty flag.

- [ ] **Step 1: Write the failing test**

Create `e2e/tests/gantt/perf-header-canvas-scheduling.spec.ts`. Header canvases already publish via `publishRenderStats(`${paneId}:header`, ...)`, and the e2e helper `renderStats(page)` returns `PaneRenderStat[]` (`paneId`, `renders` cumulative):

```ts
/**
 * V4-P06 regression: PaneHeaderCanvas must not schedule a redraw on every
 * unrelated React commit; pane-scoped vertical scroll must still redraw it.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, renderStats } from '../../utils/gantt-hook'

const rosterHeaderRenders = async (page: import('@playwright/test').Page): Promise<number> => {
  const stats = await renderStats(page)
  const header = stats.find((s) => s.paneId.startsWith('roster') && s.paneId.endsWith(':header'))
  return header?.renders ?? 0
}

test.beforeEach(async ({ page, request }) => {
  await seedGanttAuth(page, request)
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto()
  await page.waitForTimeout(1000) // let initial render storm settle
})

test('header canvas does not re-render on unrelated mouse-hover commits', async ({ page }) => {
  const before = await rosterHeaderRenders(page)
  // Hover across the toolbar (top chrome) — React commits without dirty/scrollY/rows changes.
  for (let i = 0; i < 15; i++) {
    await page.mouse.move(400 + i * 10, 30)
    await page.waitForTimeout(30)
  }
  const after = await rosterHeaderRenders(page)
  // Pre-fix the always-true condition schedules a header RAF per commit (~15+).
  expect(after - before).toBeLessThanOrEqual(2)
})

test('header still redraws on its own pane vertical scroll', async ({ page }) => {
  const before = await rosterHeaderRenders(page)
  const canvas = page.getByTestId('roster-canvas')
  const box = await canvas.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.wheel(0, 300)
  await expect.poll(() => rosterHeaderRenders(page)).toBeGreaterThan(before)
})
```

(If hovering the toolbar produces zero commits in practice, substitute any interaction known to commit without marking dirty — e.g. hovering the AI chat button or summary bar; verify pre-fix the count grows, otherwise the red step proves nothing.)

- [ ] **Step 2: Run to verify test 1 fails** (same playwright command pattern). Expected: FAIL — header count grows with unrelated commits.

- [ ] **Step 3: Rewrite the scheduling effect in `pane-header-canvas.tsx`**

Add refs next to `rafRef` (line 135):

```ts
const rafRef = useRef<number>(0)
// V4-P06: pane-scoped scheduling state — mirrors PaneCanvas (P1-2 discipline).
const lastRenderedScrollYRef = useRef<number>(-1)
const lastScheduledRenderRef = useRef<(() => void) | null>(null)
```

After the `render` useCallback (line 197), add the latest-ref and replace the effect at lines 199-211 entirely:

```ts
// Always-latest render reference so a pending RAF uses the newest closure.
const renderRef = useRef(render)
renderRef.current = render

// V4-P06: schedule one RAF per actual cause — global dirty, own scrollY change,
// or render-identity change (rows/columns/selection/size → new useCallback).
// Mirrors PaneCanvas: no cancellation in cleanup (markClean() from the content
// canvas flips `dirty` and re-runs this effect; cancelling here would drop the
// pending frame), guard with !rafRef.current, cancel only on unmount.
useEffect(() => {
  const scrollYChanged = scrollY !== lastRenderedScrollYRef.current
  const renderChanged = render !== lastScheduledRenderRef.current
  if ((dirty || scrollYChanged || renderChanged) && !rafRef.current) {
    lastScheduledRenderRef.current = render
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      lastRenderedScrollYRef.current = useLayoutStore.getState().panes.get(paneId)?.viewport?.scrollY ?? 0
      renderRef.current()
    })
  }
}, [render, dirty, scrollY, paneId])

// Cancel pending RAF only on unmount.
useEffect(() => {
  return () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }
}, [])
```

(`size` changes flow through `render` identity — `size` is in the render useCallback deps — so the old `size` dep is covered by `renderChanged`. Initial mount: `lastRenderedScrollYRef` starts at `-1` ≠ `scrollY 0` and `renderChanged` is true, so the first frame schedules.)

- [ ] **Step 4: Run both new tests + pane-scoped scroll regressions**

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/perf-header-canvas-scheduling.spec.ts --reporter=list
npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/pane-auto-load.spec.ts tests/gantt/pairing-pane.spec.ts tests/gantt/load-speed.spec.ts --reporter=list
```

Expected: new tests PASS; area specs match baseline. Manual checks: select rows (highlight appears in header), pin/freeze a row, resize a column, sort — all must repaint immediately; vertical wheel on header scrolls both canvases in lockstep; loadMore-appended rows appear in the header without further interaction.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/gantt/pane-header-canvas.tsx e2e/tests/gantt/perf-header-canvas-scheduling.spec.ts
git commit -m "refactor(gantt): PaneHeaderCanvas RAF scheduling parity with PaneCanvas (V4-P06)

Fixes the always-true precedence condition (dirty || scrollY>=0 && ...) and
the cancel-every-cleanup pattern; header now schedules only on dirty, own
scrollY change, or render-identity change, guarded against duplicate RAFs.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7 (V4-P08): Scenario Gantt canvas — RAF + dirty parity

**Files:**
- Modify: `gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx:350` (+ rafRef + render stats)
- Test: `e2e/tests/gantt/perf-scenario-canvas-raf.spec.ts`

- [ ] **Step 1: Add render stats to scenario canvas** — inside `drawFrame` (the `useCallback` ending at line 348), after the draw completes, add:

```ts
// 测试自省回执（生产构建下 no-op）— V4-P08 RAF 合并断言用。
publishRenderStats('scenario-gantt', { paneType: 'roster', totalRows, width, height })
```

with `import { publishRenderStats } from '@/utils/gantt-test-hook'` (match the exact call signature used in pane-canvas.tsx:180-185; `totalRows`/`width`/`height` are already in scope in drawFrame — verify names).

- [ ] **Step 2: Write the failing test**

Create `e2e/tests/gantt/perf-scenario-canvas-raf.spec.ts`. Setup: open a scenario Gantt with data — copy the navigation/fixture from `e2e/tests/gantt/scenario-gantt-open.spec.ts` (which uses `e2e/pages/gantt/scenario-page.ts`), including its canvas locator:

```ts
/**
 * V4-P08 regression: scenario canvas must coalesce per-commit redraws into RAF
 * frames, and content must still update after scroll (no stale frames).
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, renderStats } from '../../utils/gantt-hook'
// + ScenarioPage from '../../pages/gantt/scenario-page' — reuse the open-scenario
//   flow from scenario-gantt-open.spec.ts verbatim (beforeEach included).

const scenarioRenders = async (page: import('@playwright/test').Page): Promise<number> => {
  const stats = await renderStats(page)
  return stats.find((s) => s.paneId === 'scenario-gantt')?.renders ?? 0
}

test('scenario canvas coalesces a burst of scroll-induced redraws', async ({ page }) => {
  // <scenario open + first paint — from scenario-gantt-open.spec.ts>
  const canvas = page.locator('canvas').last() // use the exact locator scenario-gantt-open uses
  const box = await canvas.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  const before = await scenarioRenders(page)
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 25)  // vertical scroll burst
  await page.waitForTimeout(400)
  const after = await scenarioRenders(page)
  expect(after - before).toBeGreaterThan(0)     // it did redraw
  expect(after - before).toBeLessThan(30)        // but coalesced (pre-fix: ~40, one per commit)
})

test('scenario canvas content still updates after scroll (not stale)', async ({ page }) => {
  // <same setup>
  const canvas = page.locator('canvas').last()
  const before = await canvas.screenshot()
  const box = await canvas.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(300)
  const after = await canvas.screenshot()
  expect(before.equals(after)).toBe(false)       // pixels moved
})
```

- [ ] **Step 3: Run — coalescing test fails pre-fix** (~40 draws). The staleness test must pass before AND after.

- [ ] **Step 4: Implement RAF coalescing** — in `scenario-gantt-canvas.tsx`, add `const rafRef = useRef(0)` next to the other refs, and replace line 350:

```ts
// V4-P08: 与 live PaneCanvas 同款 RAF 合并 — 每个 React commit 不再同步重绘；
// 同一帧内的多次 commit 合并为一次绘制。drawFrame 读取 propsRef.current，
// RAF 回调天然使用最新 props。
useEffect(() => {
  if (rafRef.current) return
  rafRef.current = requestAnimationFrame(() => {
    rafRef.current = 0
    drawFrame()
  })
})

useEffect(() => () => {
  if (rafRef.current) cancelAnimationFrame(rafRef.current)
}, [])
```

(`drawFrame` is a stable `useCallback([])` reading `propsRef`/`sizeRef` — exactly the closure-safety shape PaneCanvas uses with renderRef.)

- [ ] **Step 5: Run both new tests + the scenario suites**

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/perf-scenario-canvas-raf.spec.ts --reporter=list
npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/scenario-gantt-open.spec.ts tests/gantt/scenario-gantt-edit.spec.ts tests/gantt/scenario-gantt-no-request-loop.spec.ts --reporter=list
```

Expected: new tests PASS; scenario specs match baseline. Manual: scenario drag-assign / remove (right-click) / selection / horizontal scrollbar all behave normally.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx e2e/tests/gantt/perf-scenario-canvas-raf.spec.ts
git commit -m "refactor(gantt): scenario canvas RAF-coalesced rendering (V4-P08)

Replaces the bare useEffect(() => drawFrame()) (sync redraw on every React
commit) with one-RAF-per-frame scheduling, matching live PaneCanvas.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 8 (V4-P13): Engine-server cleanup off the event loop

**Files:**
- Modify: `engine-server/main.py:35-51`
- Test: `engine-server/tests/test_file_management.py` (append one test)

- [ ] **Step 1: Write the failing-ish test** (it pins the new contract: cleanup runs in an executor and the loop stays responsive). Append to `engine-server/tests/test_file_management.py`, following the file's existing fixture style:

```python
import asyncio
import time


def test_cleanup_in_executor_keeps_event_loop_responsive(tmp_path):
    """V4-P13: archive/cleanup must not stall the asyncio event loop.

    Simulates a slow filesystem pass and asserts a concurrent loop heartbeat
    keeps ticking while the blocking work runs in the default executor.
    """
    ticks = []

    def slow_fs_work():
        time.sleep(0.5)  # stand-in for os.walk over a large archive tree
        return True

    async def heartbeat():
        for _ in range(8):
            ticks.append(time.monotonic())
            await asyncio.sleep(0.05)

    async def main():
        loop = asyncio.get_running_loop()
        hb = asyncio.create_task(heartbeat())
        result = await loop.run_in_executor(None, slow_fs_work)
        await hb
        return result

    assert asyncio.run(main()) is True
    # ≥6 heartbeats must land DURING the 0.5s blocking window — impossible if
    # the work ran inline on the loop.
    assert len(ticks) >= 6
    gaps = [b - a for a, b in zip(ticks, ticks[1:])]
    assert max(gaps) < 0.3, f"event loop stalled: gaps={gaps}"
```

- [ ] **Step 2: Run it**

```bash
cd engine-server && python3 -m pytest tests/test_file_management.py -v
```

Expected: the new test PASSES standalone (it tests the pattern, not main.py — main.py's loop is not unit-importable here); the rest of the file matches the Task 0 baseline. This test is the executable documentation of the contract.

- [ ] **Step 3: Apply the executor wrap in `main.py`** — replace lines 44-46 of `_periodic_cleanup`:

```python
            # 文件归档和过期清理 — V4-P13: os.walk/tar/gzip 为阻塞 IO，
            # 放入默认线程池执行器，避免卡住事件循环；FileManager._lock
            # 已保证同一时间只有一个清理在跑。
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, file_manager.archive_files)
            await loop.run_in_executor(None, file_manager.cleanup_expired_files)
```

(`task_manager.cleanup_tasks()` on line 42 is an in-memory dict sweep — leave it inline.)

Note: `asyncio.CancelledError` raised while awaiting `run_in_executor` still propagates and hits the existing `except asyncio.CancelledError: break` — shutdown behavior unchanged.

- [ ] **Step 4: Run the engine-server suites**

```bash
cd engine-server && python3 -m pytest tests/test_file_management.py tests/test_e2e_lifecycle.py -v
```

Expected: matches Task 0 baseline + the new test PASS. (Pre-existing stale failures stay as-is.)

- [ ] **Step 5: Commit**

```bash
git add engine-server/main.py engine-server/tests/test_file_management.py
git commit -m "refactor(engine-server): run file archive/cleanup in executor (V4-P13)

os.walk/tar/gzip traversal in the periodic cleanup task blocked the asyncio
event loop; now dispatched to the default thread pool. FileManager._lock
already serializes runs.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Version bumps + full regression + wrap-up

**Files:**
- Modify: `gantt/src/version.ts` (`FRONTEND_VERSION` +1 for Tasks 1-7, `BACKEND_VERSION` +1 for Task 8)

- [ ] **Step 1: Bump versions** — read `gantt/src/version.ts`, increment `FRONTEND_VERSION` by 1 and `BACKEND_VERSION` by 1 (rule-engine untouched → `RULE_VERSION` unchanged).

- [ ] **Step 2: Full gantt regression**

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt --reporter=list 2>&1 | tee /tmp/perf-ver4-final-gantt.txt
diff <(grep -E "✘|failed" /tmp/perf-ver4-baseline-gantt.txt) <(grep -E "✘|failed" /tmp/perf-ver4-final-gantt.txt) || true
```

Expected: the failing set is IDENTICAL to the Task 0 baseline (pre-existing reds only) plus zero new failures, and all five new `tests/gantt/perf-*.spec.ts` specs PASS. Paste the final PASS/FAIL summary into the completion message (§No-Illusion).

- [ ] **Step 3: Engine-server final check**

```bash
cd engine-server && python3 -m pytest tests/test_file_management.py tests/test_e2e_lifecycle.py -v
```

- [ ] **Step 4: Help-Sync check** — confirm no user-visible behavior/spec change shipped (all tasks are render-scheduling/caching/log-removal). Per §Help-Sync, no help-topic update is required. State this explicitly in the completion message.

- [ ] **Step 5: Commit + finish**

```bash
git add gantt/src/version.ts
git commit -m "chore: bump FRONTEND_VERSION and BACKEND_VERSION for perf-enhance-ver4

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Then use superpowers:finishing-a-development-branch to choose merge/PR.

---

## Task Dependency Notes

- Task 1 is independent — land first (security).
- Task 2 must precede nothing but is highest-value; its test-hook work (`viewStoreWrites`) is reused conceptually by Tasks 3/4/6/7 probes.
- Task 4 reuses `msToX/parseIsoMs` exactly as introduced for flights in Task 3 — do Task 3 first so the pattern is established and reviewed once.
- Task 5 touches `flight-renderer.ts` — do after Task 3 to avoid merge friction in the same file.
- Tasks 6, 7, 8 are mutually independent.
- If any task's regression run shows a NEW failure vs baseline: stop, use superpowers:systematic-debugging, do not proceed to the next task on a dirty baseline.
