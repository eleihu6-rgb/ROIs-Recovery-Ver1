# Gantt Live Empty Start + Filter-Driven Pull — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the "Open Live View" pop-up; Live view starts empty; the global Filter dialog is the only data-pull mechanism, guided by a motion-animated empty state.

**Architecture:** `filter-store.appliedFilters === null` is the single "nothing loaded yet" signal (in-memory only, resets per session). Apply Filters → existing `applyGanttFilters()` orchestrator, extended with a first-pull bootstrap fast path. A new `LiveEmptyState` overlay + animated toolbar funnel guide the user; filter-dialog open state lifts into shell-store so both can open it.

**Tech Stack:** React 19, Zustand, `motion` (motiondivision, MIT — `motion/react` import surface only), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-06-03-gantt-live-empty-start-filter-pull-design.md`

**Branch:** `feat/gantt/live-empty-start` created from current `feat/gantt/timeline-in-toolbar` HEAD (carries the committed spec; keeps the repo-wide FRONTEND_VERSION sequence — main still has an older counter).

**Commit format:** every `git commit` below must append the project trailer (omitted from the snippets for brevity):
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

**Validation environment:** live-server (:3000) + gantt vite dev (:5173) must be running (they were for the prior session's suite). All e2e commands run from `e2e/`. If another Claude session is concurrently using the repo's dev server, fall back to the worktree + alt-port recipe in memory `gantt-worktree-e2e-isolation`.

---

### Task 1: Branch + `motion` dependency

**Files:**
- Modify: `gantt/package.json` (+ lockfile)

- [ ] **Step 1: Create branch**

```bash
cd "/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS"
git checkout -b feat/gantt/live-empty-start
```

- [ ] **Step 2: Vet and install motion**

```bash
npm view motion license version   # Expect: MIT, ~12.x
cd gantt && npm install motion
npm audit --omit=dev              # Expect: 0 vulnerabilities (CLAUDE.md zero-tolerance)
```

If audit is non-zero or license ≠ MIT: STOP and report — do not proceed.

- [ ] **Step 3: Smoke-check the import compiles**

Add nothing yet; just verify resolution:

```bash
cd gantt && node -e "console.log(require.resolve('motion'))"
npx tsc --noEmit 2>&1 | tail -5   # Expect: only the 2 known pre-existing errors (violation-tooltip.tsx, use-rule-check.ts)
```

- [ ] **Step 4: Commit**

```bash
git add gantt/package.json gantt/package-lock.json
git commit -m "chore(gantt): add motion (MIT, motiondivision) for empty-state animation"
```

---

### Task 2: Write the failing e2e spec first

**Files:**
- Create: `e2e/tests/gantt/live-empty-start.spec.ts`

This spec encodes the spec's §Testing section. It MUST fail now (the old LiveSetupDialog still pops up, `live-empty-state` doesn't exist) — that failure is the §No-Illusion receipt that the test can catch the old behavior.

- [ ] **Step 1: Write the spec**

```ts
/**
 * Live view empty start + filter-driven data pull.
 *
 * Spec: docs/superpowers/specs/2026-06-03-gantt-live-empty-start-filter-pull-design.md
 * - No "Open Live View" pop-up; Live lands on an EMPTY gantt (no auto-load).
 * - A motion-animated empty state guides the user to the Filter dialog.
 * - Apply Filters is the only data pull; empty filter = load-all via bootstrap.
 * - Default planning period = current month start → next month end.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth, readHook, waitGanttReady } from '../../utils/gantt-hook'

const pad = (n: number): string => String(n).padStart(2, '0')

/** First day of the current month as yyyy-MM-dd. */
const currentMonthFirst = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}

/** Last day of NEXT month as yyyy-MM-dd. */
const nextMonthLast = (): string => {
  const d = new Date()
  const last = new Date(d.getFullYear(), d.getMonth() + 2, 0)
  return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`
}

const gotoLiveRaw = async (page: Page): Promise<void> => {
  await page.goto('/fpqe/gantt/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  await page.getByTestId('module-nav-live').click()
}

test.describe('Live empty start', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Live opens empty: no setup pop-up, zero rows, guided empty state @smoke', async ({ page }) => {
    await gotoLiveRaw(page)

    // 1. The old pop-up is gone — nothing to dismiss.
    await expect(page.getByTestId('live-setup-dialog')).toHaveCount(0)

    // 2. Empty state with exact guidance text.
    const empty = page.getByTestId('live-empty-state')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('No data loaded')
    await expect(empty).toContainText('Apply filters to pull crew, pairing and flight data')

    // 3. Toolbar funnel attention animation present while empty.
    await expect(page.getByTestId('filter-attention-ring')).toBeVisible()

    // 4. Stores are truly empty — nothing was auto-loaded.
    const counts = await readHook<{ roster: number; pairing: number; flightLegs: number }>(page, 'counts')
    expect(counts.roster).toBe(0)
    expect(counts.pairing).toBe(0)
    expect(counts.flightLegs).toBe(0)
  })

  test('default planning period is current month + next month', async ({ page }) => {
    await gotoLiveRaw(page)
    await expect(page.getByTestId('date-range-from')).toHaveValue(currentMonthFirst())
    await expect(page.getByTestId('date-range-to')).toHaveValue(nextMonthLast())
  })

  test('empty-state click opens Filter dialog; empty-filter Apply bootstraps load-all', async ({ page }) => {
    await gotoLiveRaw(page)

    // Step 1: overlay → dialog
    await page.getByTestId('live-empty-state').click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()

    // Step 2: Apply with no filters → load-all
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).not.toBeVisible()
    await expect(page.getByTestId('live-empty-state')).not.toBeVisible({ timeout: 60_000 })

    await waitGanttReady(page)
    const counts = await readHook<{ roster: number }>(page, 'counts')
    expect(counts.roster).toBeGreaterThan(0)

    // Step 3: attention animation stopped once data is loaded.
    await expect(page.getByTestId('filter-attention-ring')).toHaveCount(0)
  })

  test('filtered pull, then re-filter widens the crew set', async ({ page }) => {
    await gotoLiveRaw(page)
    await page.getByTestId('live-empty-state').click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()

    // First pull: restrict crew by base (pick the first base option in the dropdown).
    await page.getByTestId('filter-crew-base').click()
    await page.getByTestId('filter-crew-base-option-0').click()
    await page.keyboard.press('Escape') // close dropdown popover, keep dialog
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('live-empty-state')).not.toBeVisible({ timeout: 60_000 })
    await waitGanttReady(page)
    const filtered = await readHook<number>(page, 'selectedCrewCount')
    expect(filtered).toBeGreaterThan(0)

    // Re-filter: clear all filters → Apply → crew set must widen.
    await page.getByTestId('filter-btn').click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()
    await page.getByTestId('filter-reset').click()
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).not.toBeVisible()
    await expect
      .poll(async () => readHook<number>(page, 'selectedCrewCount'), { timeout: 60_000 })
      .toBeGreaterThan(filtered)
  })

  test('navigating away and back keeps loaded data (no empty state again)', async ({ page }) => {
    await gotoLiveRaw(page)
    await page.getByTestId('live-empty-state').click()
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('live-empty-state')).not.toBeVisible({ timeout: 60_000 })
    await waitGanttReady(page)

    await page.getByTestId('module-nav-dashboard').click()
    await page.getByTestId('module-nav-live').click()
    await expect(page.getByTestId('live-empty-state')).toHaveCount(0)
    const counts = await readHook<{ roster: number }>(page, 'counts')
    expect(counts.roster).toBeGreaterThan(0)
  })
})
```

Notes for the implementer:
- `readHook(page, 'counts')` — check the exact signature in `e2e/utils/gantt-hook.ts` (it may be `readHook(page, (t) => t.counts())`); adapt call sites to the existing helper, do not invent a new one.
- `filter-crew-base-option-0`: Task 6 adds indexed testids to `MultiSelectDropdown` options. If the dropdown closes on option click, drop the `Escape` press.

- [ ] **Step 2: Run to verify it fails for the right reason**

```bash
cd e2e && npx playwright test tests/gantt/live-empty-start.spec.ts --reporter=list
```

Expected: ALL 5 FAIL — first test fails on `live-setup-dialog` count (old dialog appears) or `live-empty-state` not found. If it fails on login/server instead, fix the environment first.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/gantt/live-empty-start.spec.ts
git commit -m "test(gantt): failing e2e for Live empty start + filter-driven pull"
```

---

### Task 3: filter-store — new default period, stop persisting dateRange

**Files:**
- Modify: `gantt/src/stores/filter-store.ts`

- [ ] **Step 1: Change defaults (lines 2, 7)**

```ts
import { startOfMonth, endOfMonth, addMonths } from 'date-fns'
// ...
const defaultStart = startOfMonth(today)
const defaultEnd = endOfMonth(addMonths(today, 1))
```

(`subMonths` import removed.)

- [ ] **Step 2: Drop dateRange from persistence**

`StoredFilters` (line 97) loses `dateRange`:

```ts
interface StoredFilters {
  ruleSetCode: string
  crew: CrewFilter
  pairing: PairingFilter
  flight: FlightFilter
}
```

`loadFromStorage` (line 181): delete the `start`/`end` parsing and the `dateRange` key from `set({...})` — keep restoring `ruleSetCode`/`crew`/`pairing`/`flight`:

```ts
loadFromStorage: () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const stored: StoredFilters = JSON.parse(raw)
    // dateRange deliberately NOT restored: every fresh session starts at the
    // default planning period (current month + next month). Filter values are
    // restored so the dialog prefills the user's last selections.
    set({
      ruleSetCode: stored.ruleSetCode ?? '',
      crew: { ...DEFAULT_CREW_FILTER, ...(stored.crew ?? {}) },
      pairing: { ...DEFAULT_PAIRING_FILTER, ...(stored.pairing ?? {}) },
      flight: { ...DEFAULT_FLIGHT_FILTER, ...(stored.flight ?? {}) },
    })
  } catch {
    // ignore corrupt data
  }
},
```

`saveToStorage` (line 201): remove the `dateRange` field from the `stored` object (old localStorage entries containing it parse fine and are ignored).

- [ ] **Step 3: Typecheck + commit**

```bash
cd gantt && npx tsc --noEmit 2>&1 | tail -5   # only the 2 known pre-existing errors
git add src/stores/filter-store.ts
git commit -m "feat(gantt): default planning period = current + next month, session-scoped"
```

---

### Task 4: shell-store — filterDialogOpen

**Files:**
- Modify: `gantt/src/stores/shell-store.ts`

- [ ] **Step 1: Add state + action**

In `interface ShellStore` (after `sidebarUserOverride`, line 19):

```ts
  /** Global Filter dialog visibility — opened from the toolbar funnel or the Live empty state. */
  filterDialogOpen: boolean
```

After `setSidebarState` in the interface:

```ts
  setFilterDialogOpen: (open: boolean) => void
```

In the store initializer (after `sidebarUserOverride: false,`):

```ts
  filterDialogOpen: false,
```

After the `setSidebarState` implementation:

```ts
  setFilterDialogOpen: (open) => set({ filterDialogOpen: open }),
```

Not persisted (transient UI state).

- [ ] **Step 2: Typecheck + commit**

```bash
cd gantt && npx tsc --noEmit 2>&1 | tail -5
git add src/stores/shell-store.ts
git commit -m "feat(gantt): lift filter-dialog open state into shell-store"
```

---

### Task 5: Remove the pop-up

**Files:**
- Modify: `gantt/src/components/shell/shell-top-nav.tsx`
- Delete: `gantt/src/components/layout/live-setup-dialog.tsx`
- Delete: `e2e/tests/gantt/live-setup.spec.ts`

- [ ] **Step 1: Simplify shell-top-nav**

Remove imports: `useState` (line 1 — keep other lucide imports), `useFilterStore` (line 13), `LiveSetupDialog` (line 14).
Remove `const [liveSetupOpen, setLiveSetupOpen] = useState(false)` (line 46), the whole `handleNavClick` function (lines 48–64), and the `<LiveSetupDialog .../>` element (lines 68–72) plus its now-redundant fragment wrapper if nothing else needs it.

Button onClick (line 106) becomes:

```tsx
onClick={() => setModule(module)}
```

- [ ] **Step 2: Delete the dialog and its spec**

```bash
git rm gantt/src/components/layout/live-setup-dialog.tsx e2e/tests/gantt/live-setup.spec.ts
grep -rn "live-setup-dialog\|LiveSetupDialog" gantt/src e2e/tests   # Expect: no hits in source; only a comment in new-pane-autoload.spec.ts is acceptable
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd gantt && npx tsc --noEmit 2>&1 | tail -5
git add -A gantt/src/components/shell/shell-top-nav.tsx
git commit -m "feat(gantt): remove Open Live View pop-up; Live nav goes straight to the view"
```

---

### Task 6: Toolbar — shell-store dialog state, animated funnel, testids

**Files:**
- Modify: `gantt/src/components/shell/gantt-sub-toolbar.tsx`
- Modify: `gantt/src/components/common/date-range-picker.tsx`
- Modify: `gantt/src/components/layout/filter-dialog.tsx` (MultiSelectDropdown option testids)

- [ ] **Step 1: gantt-sub-toolbar wiring**

Replace local dialog state (line 56) with shell-store:

```tsx
import { motion } from 'motion/react'
import { useShellStore } from '@/stores/shell-store'
// remove: const [filterOpen, setFilterOpen] = useState(false)  (and the now-unused useState import)
const filterOpen = useShellStore((s) => s.filterDialogOpen)
const setFilterOpen = useShellStore((s) => s.setFilterDialogOpen)
// Live starts empty — animate the funnel until the first successful pull (spec §3).
const noDataLoaded = useFilterStore((s) => s.appliedFilters === null)
```

`FilterDialog` mount (line 218) becomes:

```tsx
<FilterDialog open={filterOpen} onClose={() => setFilterOpen(false)} onApply={handleFilterApply} />
```

- [ ] **Step 2: Animated funnel (replace the filter-button block, lines 116–130)**

```tsx
{/* Filter button — amber with count badge when filters are active;
    pulsing attention ring while no data has been pulled yet (Live empty start) */}
<div className="relative">
  {noDataLoaded && (
    <motion.span
      data-testid="filter-attention-ring"
      className="pointer-events-none absolute inset-0 rounded-md bg-primary/35"
      initial={{ scale: 1, opacity: 0.55 }}
      animate={{ scale: 1.7, opacity: 0 }}
      transition={{ repeat: Infinity, duration: 1.4, ease: 'easeOut' }}
    />
  )}
  <ToolBtn
    tip={hasFilter ? `Filters (${activeFilterCount} active)` : 'Filter'}
    onClick={() => setFilterOpen(true)}
    amber={hasFilter}
    testId="filter-btn"
  >
    {noDataLoaded ? (
      <motion.span
        className="inline-flex"
        animate={{ scale: [1, 1.18, 1] }}
        transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
      >
        <Filter className="h-3.5 w-3.5 text-primary" />
      </motion.span>
    ) : (
      <Filter className="h-3.5 w-3.5" />
    )}
  </ToolBtn>
  {hasFilter && (
    <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
      {activeFilterCount > 9 ? '9+' : activeFilterCount}
    </span>
  )}
</div>
```

- [ ] **Step 3: date-range-picker testids (lines 66, 74)**

Add `data-testid="date-range-from"` to the first input and `data-testid="date-range-to"` to the second.

- [ ] **Step 4: MultiSelectDropdown option testids**

In `filter-dialog.tsx`, find the `MultiSelectDropdown` option rendering (component near the bottom of the file). Give each option row an indexed testid derived from the dropdown's `testId` prop:

```tsx
data-testid={testId ? `${testId}-option-${idx}` : undefined}
```

(Use the option's map index `idx`; only dropdowns that pass `testId` get testids.)

- [ ] **Step 5: Typecheck + commit**

```bash
cd gantt && npx tsc --noEmit 2>&1 | tail -5
git add src/components/shell/gantt-sub-toolbar.tsx src/components/common/date-range-picker.tsx src/components/layout/filter-dialog.tsx
git commit -m "feat(gantt): animated funnel while Live is empty; dialog state via shell-store; test ids"
```

---

### Task 7: LiveEmptyState overlay

**Files:**
- Create: `gantt/src/components/layout/live-empty-state.tsx`
- Modify: `gantt/src/components/shell/roster-view.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Filter } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useFilterStore } from '@/stores/filter-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useShellStore } from '@/stores/shell-store'

/**
 * Centered call-to-action shown over the Live gantt before the first data pull
 * (spec: Live starts EMPTY; the Filter dialog is the only load mechanism).
 * Hidden while the first pull is refreshing, and permanently once
 * filter-store.appliedFilters is set.
 */
export const LiveEmptyState = () => {
  const noDataLoaded = useFilterStore((s) => s.appliedFilters === null)
  const refreshing = useGanttViewStore((s) => s.refreshing)
  const setFilterDialogOpen = useShellStore((s) => s.setFilterDialogOpen)
  const show = noDataLoaded && !refreshing

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 bottom-0 top-9 z-20 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
        >
          <motion.button
            type="button"
            data-testid="live-empty-state"
            onClick={() => setFilterDialogOpen(true)}
            className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg border border-border bg-card/95 px-8 py-6 shadow-lg transition-colors hover:border-primary/40"
            initial={{ y: 14, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <motion.span
                className="absolute inset-0 rounded-full bg-primary/20"
                animate={{ scale: [1, 1.55], opacity: [0.6, 0] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeOut' }}
              />
              <motion.span
                className="inline-flex"
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
              >
                <Filter className="h-5 w-5 text-primary" />
              </motion.span>
            </span>
            <span className="text-sm font-semibold text-foreground">No data loaded</span>
            <span className="text-xs text-muted-foreground">
              Apply filters to pull crew, pairing and flight data
            </span>
            <span className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              Open Filters
            </span>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

(`top-9` = the 36px GanttSubToolbar height, so the overlay covers only the gantt area. All type sizes from the standard scale; colors via semantic tokens.)

- [ ] **Step 2: Mount in RosterView**

```tsx
import { GanttSubToolbar } from './gantt-sub-toolbar'
import { AppLayout } from '@/components/layout/app-layout'
import { LiveEmptyState } from '@/components/layout/live-empty-state'

/** Live → Roster 视图：Gantt 专用工具栏 + 完整排班界面（首次进入为空，经 Filter 拉取数据） */
export const RosterView = () => (
  <div className="relative flex h-full flex-col overflow-hidden">
    <GanttSubToolbar />
    <AppLayout />
    <LiveEmptyState />
  </div>
)
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd gantt && npx tsc --noEmit 2>&1 | tail -5
git add src/components/layout/live-empty-state.tsx src/components/shell/roster-view.tsx
git commit -m "feat(gantt): motion-animated Live empty state guiding to the Filter dialog"
```

---

### Task 8: apply-filters — first-pull bootstrap fast path

**Files:**
- Modify: `gantt/src/utils/apply-filters.ts:40-56`

- [ ] **Step 1: Replace the `crewChanged` branch**

```ts
    if (crewChanged) {
      const hasCrewFilter =
        crewFilter.divisions.length > 0 || crewFilter.bases.length > 0 ||
        crewFilter.ranks.length > 0 || crewFilter.fleets.length > 0
      if (!hasCrewFilter && !appliedFilters && visibleTypes.has('roster')) {
        // First pull of the session with no crew filter (Live empty start, load-all):
        // one round-trip for slim crew list + first-screen roster window.
        await useGanttViewStore.getState().loadFromBootstrap(dateRange)
      } else {
        if (hasCrewFilter) {
          await useCrewStore.getState().fetchCrewsWithFilter(crewFilter, dateRange)
        } else {
          await useCrewStore.getState().fetchCrews()
        }
        if (visibleTypes.has('roster')) {
          const { selectedCrewIds } = useCrewStore.getState()
          if (selectedCrewIds.length > 0) {
            // 筛选应用也走渐进式首屏入口，保持与初次打开一致的快速首屏。
            await useGanttViewStore.getState().loadRosterProgressive(selectedCrewIds, dateRange)
          }
        }
      }
    }
```

Everything else in the function (pairing/flight branches, `markApplied`, rule-check defer) is unchanged — the first apply sees all three groups as changed, so pairings/flights load for visible panes exactly as the deleted dialog's follow-ups did.

- [ ] **Step 2: Typecheck + commit**

```bash
cd gantt && npx tsc --noEmit 2>&1 | tail -5
git add src/utils/apply-filters.ts
git commit -m "feat(gantt): first filter apply uses bootstrap fast path when unfiltered"
```

---

### Task 9: e2e shared helper — new openLiveView flow

**Files:**
- Modify: `e2e/utils/gantt-hook.ts` (the `openLiveView` function)

The whole gantt suite enters Live through this helper; it must speak the new flow.

- [ ] **Step 1: Rewrite openLiveView**

```ts
/**
 * 进入 Live（Gantt）视图。Live 现在以"空 Gantt"启动（无 Open Live View 弹窗）——
 * 通过空态引导卡打开全局 Filter 弹窗，默认（无筛选）Apply 触发 bootstrap 全量加载。
 */
export const openLiveView = async (page: Page): Promise<void> => {
  await page.getByTestId('module-nav-live').click()
  const emptyState = page.getByTestId('live-empty-state')
  await expect(emptyState).toBeVisible({ timeout: 5_000 })
  await emptyState.click()
  await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).not.toBeVisible({ timeout: 10_000 })
  await expect(emptyState).not.toBeVisible({ timeout: 60_000 })
}
```

Caution: tests seed a fresh browser context, but `gantt-filter-v2` localStorage persists filter VALUES only per context — fresh contexts start clean, so the default Apply is an unfiltered load-all, same data the old dialog's default Load produced.

- [ ] **Step 2: Run a representative consumer spec**

```bash
cd e2e && npx playwright test tests/gantt/roster-pane.spec.ts --reporter=list
```

Expected: PASS (same pass/fail profile as before this branch).

- [ ] **Step 3: Commit**

```bash
git add e2e/utils/gantt-hook.ts
git commit -m "test(gantt): openLiveView helper speaks the empty-start + filter-pull flow"
```

---

### Task 10: Green the new spec, bump version, full validation

**Files:**
- Modify: `gantt/src/version.ts:18` (`FRONTEND_VERSION = 58`)

- [ ] **Step 1: Run the new spec**

```bash
cd e2e && npx playwright test tests/gantt/live-empty-start.spec.ts --reporter=list
```

Expected: 5 passed. Debug any failure before continuing (check option-testid wiring from Task 6 Step 4 first — it was written blind against `MultiSelectDropdown` internals).

- [ ] **Step 2: Repeat-run for flake resistance**

```bash
cd e2e && npx playwright test tests/gantt/live-empty-start.spec.ts --reporter=list --repeat-each=2
```

Expected: 10 passed.

- [ ] **Step 3: Bump FRONTEND_VERSION**

```ts
export const FRONTEND_VERSION = 58
```

- [ ] **Step 4: Full gantt e2e suite + typecheck**

```bash
cd gantt && npx tsc --noEmit 2>&1 | tail -5
cd ../e2e && npx playwright test tests/gantt --reporter=list 2>&1 | tail -25
```

Expected: same profile as the prior session's baseline (113 passed, 2 known environmental failures: scenario-run backend persistence, tunnel @local) minus the 4 deleted live-setup tests, plus the 5 new ones. Any NEW failure must be fixed before commit. Specs known to flake under parallel load (query-filter, roster-default-sort): re-run in isolation before judging.

- [ ] **Step 5: Final commit**

```bash
git add gantt/src/version.ts
git commit -m "feat(gantt): Live view starts empty; data pulled via Filter dialog (F58)

Spec: docs/superpowers/specs/2026-06-03-gantt-live-empty-start-filter-pull-design.md"
```

- [ ] **Step 6: Paste the §No-Illusion receipt**

Completion message must include the final PASS/FAIL summary lines of Step 1, 2 and 4 runs verbatim.
