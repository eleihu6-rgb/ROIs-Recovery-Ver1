# Legality Recheck Stuck-Button Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user manually break out of a legality-recheck stuck in "Checking legality…" forever, and notify them of success/failure once a (manual or passively-observed) recheck settles.

**Architecture:** Pure frontend fix, no backend changes. Each recheck surface (Scenario's pane-toolbar button + status indicator; Live's own recheck indicator) tracks, client-side, how long the current `COMPUTING` run has been going. Past a generous per-surface threshold, the Recheck button re-enables itself (still shows its spinner) so the user can force a retry — both backend recompute endpoints already handle being re-triggered correctly (Scenario's `forceRecompute` unconditionally restarts regardless of current status; Live's `/recheck` either genuinely restarts or harmlessly no-ops and the frontend just resumes polling). Separately, when a poll observes a transition from `COMPUTING` to settled (`READY`/`FAILED`), fire a toast via the existing `@/utils/notify` utility.

**Tech Stack:** React 19 + TypeScript, Zustand (scenario-violation-store), Vitest (store unit test), Playwright (e2e, using `page.clock` for deterministic time fast-forwarding).

## Global Constraints

- No backend changes (per spec §1 — both recompute endpoints already work correctly on re-trigger).
- No new dependencies.
- UI text stays in English (root CLAUDE.md 前端语言规范).
- Any UI-touching change ships with a Playwright test (root CLAUDE.md §Playwright-Required) proving the specific behavior — not just visibility.
- `FRONTEND_VERSION` in `gantt/src/version.ts` must be bumped +1 for this change (root CLAUDE.md 版本号管理).
- Thresholds: Scenario stuck-timeout = 90 seconds. Live stuck-timeout = 10 minutes. Live's poll cap raised from 200×1.5s (5 min) to 1200×1.5s (30 min, matching the backend's own Redis dedupe TTL).

---

### Task 1: `computingSince` tracking + manual-trigger reset in the scenario violation store

**Files:**
- Modify: `gantt/src/stores/scenario-violation-store.ts`
- Test: `gantt/src/stores/__tests__/scenario-violation-computing-since.test.ts` (new)

**Interfaces:**
- Produces: `ScenarioViolationStore.computingSince: number | null` (epoch ms, or `null` when not computing) and `ScenarioViolationStore.markRecheckTriggered(): void` (force-resets `computingSince` to "now" and optimistically sets `legalityStatus: 'COMPUTING'`) — both consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Create `gantt/src/stores/__tests__/scenario-violation-computing-since.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getScenarioViolationStore } from '@/stores/scenario-violation-store'

const SCENARIO_ID = 999001

const initialState = {
  violations: new Map(), legalityStatus: null, computedAt: null, errorText: null,
  paramsStale: false, persistedRaw: [], computingSince: null,
}

beforeEach(() => {
  vi.useFakeTimers()
  getScenarioViolationStore(SCENARIO_ID).setState(initialState)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('scenario-violation-store computingSince', () => {
  it('stamps computingSince the first time status transitions into COMPUTING', () => {
    vi.setSystemTime(new Date('2026-07-07T00:00:00Z'))
    const store = getScenarioViolationStore(SCENARIO_ID)

    store.getState().applyPersisted({ status: 'COMPUTING', violations: [] })

    expect(store.getState().computingSince).toBe(new Date('2026-07-07T00:00:00Z').getTime())
  })

  it('keeps the original computingSince across repeated COMPUTING polls', () => {
    vi.setSystemTime(new Date('2026-07-07T00:00:00Z'))
    const store = getScenarioViolationStore(SCENARIO_ID)
    store.getState().applyPersisted({ status: 'COMPUTING', violations: [] })
    const first = store.getState().computingSince

    vi.setSystemTime(new Date('2026-07-07T00:05:00Z'))
    store.getState().applyPersisted({ status: 'COMPUTING', violations: [] })

    expect(store.getState().computingSince).toBe(first)
  })

  it('clears computingSince once status settles to READY', () => {
    const store = getScenarioViolationStore(SCENARIO_ID)
    store.getState().applyPersisted({ status: 'COMPUTING', violations: [] })

    store.getState().applyPersisted({ status: 'READY', violations: [] })

    expect(store.getState().computingSince).toBeNull()
  })

  it('clears computingSince once status settles to FAILED', () => {
    const store = getScenarioViolationStore(SCENARIO_ID)
    store.getState().applyPersisted({ status: 'COMPUTING', violations: [] })

    store.getState().applyPersisted({ status: 'FAILED', violations: [], errorText: 'boom' })

    expect(store.getState().computingSince).toBeNull()
  })

  it('markRecheckTriggered force-resets computingSince to now even if already COMPUTING', () => {
    vi.setSystemTime(new Date('2026-07-07T00:00:00Z'))
    const store = getScenarioViolationStore(SCENARIO_ID)
    store.getState().applyPersisted({ status: 'COMPUTING', violations: [] })

    vi.setSystemTime(new Date('2026-07-07T00:10:00Z')) // scenario has been "stuck" for 10 min
    store.getState().markRecheckTriggered()

    expect(store.getState().computingSince).toBe(new Date('2026-07-07T00:10:00Z').getTime())
    expect(store.getState().legalityStatus).toBe('COMPUTING')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/stores/__tests__/scenario-violation-computing-since.test.ts`
Expected: FAIL — `computingSince` / `markRecheckTriggered` do not exist on the store yet (TypeScript error or `undefined` assertions failing).

- [ ] **Step 3: Implement `computingSince` + `markRecheckTriggered`**

In `gantt/src/stores/scenario-violation-store.ts`, add to the `ScenarioViolationStore` interface (right after the `paramsStale` field, around line 44):

```typescript
  /**
   * Epoch ms when the current COMPUTING/PENDING run was first observed, or null when not
   * computing. Lets the Recheck button + status indicator detect a stuck run (a compute
   * that died without ever flipping legality_status out of COMPUTING) and recover — see
   * docs/superpowers/specs/2026-07-07-legality-recheck-stuck-button-recovery-design.md.
   */
  computingSince: number | null
```

Add to the same interface, right after the `applyPersisted` method declaration (around line 54):

```typescript
  /**
   * Force-reset computingSince to "now" and optimistically flip legalityStatus to
   * COMPUTING. Called when the user manually clicks Recheck — without this, clicking
   * Recheck while a run is ALREADY (stuck) COMPUTING would not reset the stuck-timer,
   * since applyPersisted only stamps computingSince on a genuine status transition.
   */
  markRecheckTriggered: () => void
```

In the `createStore()` function, add `computingSince: null,` to the initial state object (after `persistedRaw: [],`, around line 131).

Replace the `applyPersisted` implementation (around lines 133-142) with:

```typescript
    applyPersisted: (res) => {
      const prevStatus = get().legalityStatus
      const prevComputingSince = get().computingSince
      const wasComputing = prevStatus === 'COMPUTING' || prevStatus === 'PENDING'
      const isComputing = res.status === 'COMPUTING' || res.status === 'PENDING'
      set({
        legalityStatus: res.status,
        paramsStale: res.paramsStale === true,
        computedAt: res.computedAt ?? null,
        errorText: res.errorText ?? null,
        computingSince: isComputing ? (wasComputing ? prevComputingSince : Date.now()) : null,
      })
      if (res.status !== 'READY') return
      set({ persistedRaw: res.violations, violations: buildKeyedFromRaw(res.violations) })
    },

    markRecheckTriggered: () => set({ computingSince: Date.now(), legalityStatus: 'COMPUTING' }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/stores/__tests__/scenario-violation-computing-since.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/scenario-violation-store.ts gantt/src/stores/__tests__/scenario-violation-computing-since.test.ts
git commit -m "feat: track computingSince in scenario violation store for stuck-recheck recovery"
```

---

### Task 2: Scenario Recheck button + status indicator stuck-recovery, and notify-on-settle

**Files:**
- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts`
- Modify: `gantt/src/components/gantt/source/gantt-pane-source.ts`
- Modify: `gantt/src/components/panes/shared/roster-pane.tsx`
- Modify: `gantt/src/components/panes/pane-condition-strip.tsx`
- Modify: `gantt/src/components/legality/scenario-recheck-indicator.tsx`
- Modify: `gantt/src/services/scenario-legality-api.ts`
- Modify: `gantt/src/version.ts` (bump `FRONTEND_VERSION`)
- Test: `e2e/tests/gantt/scenario-legality-recheck-stuck-recovery.spec.ts` (new)

**Interfaces:**
- Consumes: `ScenarioViolationStore.computingSince` / `.markRecheckTriggered()` from Task 1.
- Produces: `GanttPaneSource.useLegalityRecheck` return type gains `stuck: boolean`; `RecheckIndicatorInfo`'s scenario variant gains `stuck: boolean`; `PaneConditionStripProps` gains `recheckStuck?: boolean`; `ScenarioRecheckIndicator` gains a required `stuck: boolean` prop. These exact names/types are used by later steps in this same task — no other task depends on them.

- [ ] **Step 1: Add notify-on-settle to `pollScenarioLegality`**

In `gantt/src/services/scenario-legality-api.ts`, add the import at the top (after the existing `import { api } from '@/services/api'`):

```typescript
import { notify } from '@/utils/notify'
```

Replace the `pollScenarioLegality` function (lines 48-73) with:

```typescript
/**
 * Poll the persisted legality for one scenario until it settles (status no longer
 * COMPUTING/PENDING), invoking `onUpdate` for every response. Shared by the scenario
 * gantt view (mount-time load) and the pane-toolbar Recheck button so both run one
 * poll implementation. Returns a cancel fn — call it on unmount / supersede to stop
 * the chain and drop any in-flight write.
 *
 * Notifies (via `@/utils/notify`) only if THIS poll invocation actually observed the
 * status as COMPUTING/PENDING at some point before settling — a normal mount where the
 * status is already READY never notifies (there was nothing to "finish"). This mirrors
 * Live's LegalityRecheckIndicator, whose notify calls live inside startPolling and are
 * only reached when startPolling was actually invoked for an in-progress run.
 */
export function pollScenarioLegality(
  scenarioId: number,
  onUpdate: (res: ScenarioLegalityResponse) => void,
  intervalMs = 2500,
): () => void {
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let wasComputing = false
  const tick = async (): Promise<void> => {
    let res: ScenarioLegalityResponse
    try {
      res = await fetchScenarioLegality(scenarioId)
    } catch {
      return // transient — a later mount/recheck supersedes; stop this chain
    }
    if (cancelled) return
    onUpdate(res)
    const computing = res.status === 'COMPUTING' || res.status === 'PENDING'
    if (computing) {
      wasComputing = true
      timer = setTimeout(() => void tick(), intervalMs)
      return
    }
    if (wasComputing) {
      if (res.status === 'READY') notify.success('Legality recheck complete')
      else if (res.status === 'FAILED') notify.error(res.errorText ?? 'Legality recheck failed')
    }
  }
  void tick()
  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
  }
}
```

- [ ] **Step 2: Add the shared `useStuckAfter` hook + threshold constant in `scenario-gantt-source.ts`**

In `gantt/src/components/gantt/source/scenario-gantt-source.ts`, change the react import (line 2) from:

```typescript
import { useCallback, useMemo } from 'react'
```

to:

```typescript
import { useCallback, useMemo, useState, useEffect } from 'react'
```

Add this near the top of the file, after the imports (before the main exported function — find a natural spot right before the file's first non-import top-level statement):

```typescript
/** Real scenario computes finish in seconds; 90s is a generous "something's wrong" bar. */
const SCENARIO_RECHECK_STUCK_MS = 90_000

/**
 * True once `computingSince` is more than `thresholdMs` in the past. Ticks every 2s while
 * computing so consumers (the Recheck button + status indicator) recover even though no
 * new poll response has arrived — see
 * docs/superpowers/specs/2026-07-07-legality-recheck-stuck-button-recovery-design.md.
 */
function useStuckAfter(computingSince: number | null, thresholdMs: number): boolean {
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (computingSince == null) return
    const id = setInterval(() => forceTick((n) => n + 1), 2000)
    return () => clearInterval(id)
  }, [computingSince])
  return computingSince != null && Date.now() - computingSince > thresholdMs
}
```

- [ ] **Step 3: Wire `stuck` into `useAlertCenter`'s `recheckInfo` and `useLegalityRecheck`**

In the same file, replace the `useAlertCenter` hook's body (lines 604-632) — only the additions are new, the rest is unchanged:

```typescript
    useAlertCenter: () => {
      const persistedRaw = useViolationStore((s) => s.persistedRaw)
      const crew = useGanttStore((s) => s.data?.crew)
      const status = useViolationStore((s) => s.legalityStatus)
      const computedAt = useViolationStore((s) => s.computedAt)
      const errorText = useViolationStore((s) => s.errorText)
      const paramsStale = useViolationStore((s) => s.paramsStale)
      const computingSince = useViolationStore((s) => s.computingSince)
      const stuck = useStuckAfter(computingSince, SCENARIO_RECHECK_STUCK_MS)
      const rows = useMemo<CrewViolationRow[]>(() => {
        const meta = new Map((crew ?? []).map((c) => [c.crewId, { base: c.base, rank: c.rank }]))
        return persistedRaw.map((v) => ({
          crewId: v.crew_id,
          base: meta.get(v.crew_id)?.base ?? '',
          rank: meta.get(v.crew_id)?.rank ?? '',
          ruleCode: v.rule_code,
          ruleInstance: v.rule_instance,
          severity: v.severity,
          message: v.message,
        }))
      }, [persistedRaw, crew])
      return {
        rows,
        onScan: () => {
          void fetchScenarioLegality(scenarioId).then((res) =>
            getScenarioViolationStore(scenarioId).getState().applyPersisted(res),
          )
        },
        recheckInfo: { type: 'scenario', status, computedAt, errorText, paramsStale, stuck },
      }
    },
```

Replace the `useLegalityRecheck` hook's body (lines 644-658):

```typescript
    useLegalityRecheck: () => {
      const status = useViolationStore((s) => s.legalityStatus)
      const paramsStale = useViolationStore((s) => s.paramsStale)
      const computingSince = useViolationStore((s) => s.computingSince)
      const computing = status === 'COMPUTING' || status === 'PENDING'
      const stuck = useStuckAfter(computingSince, SCENARIO_RECHECK_STUCK_MS)
      const onRecheck = useCallback(() => {
        getScenarioViolationStore(scenarioId).getState().markRecheckTriggered()
        void recheckScenarioLegality(scenarioId)
          .then(() =>
            pollScenarioLegality(scenarioId, (res) =>
              getScenarioViolationStore(scenarioId).getState().applyPersisted(res),
            ),
          )
          .catch(() => notify.error('Failed to recheck legality'))
      }, [])
      return { onRecheck, computing, paramsStale, stuck }
    },
```

- [ ] **Step 4: Update the shared types in `gantt-pane-source.ts`**

In `gantt/src/components/gantt/source/gantt-pane-source.ts`, replace the `RecheckIndicatorInfo` type (lines 20-28):

```typescript
export type RecheckIndicatorInfo =
  | { type: 'live'; groupCode: string }
  | {
      type: 'scenario'
      status: 'PENDING' | 'COMPUTING' | 'READY' | 'FAILED' | null
      computedAt: string | null
      errorText: string | null
      paramsStale: boolean
      /** True once the current run has been COMPUTING/PENDING longer than expected. */
      stuck: boolean
    }
```

Replace the `useLegalityRecheck` type (line 216):

```typescript
  useLegalityRecheck?: () => { onRecheck: () => void; computing: boolean; paramsStale: boolean; stuck: boolean }
```

- [ ] **Step 5: Wire `recheckStuck` through `roster-pane.tsx`**

In `gantt/src/components/panes/shared/roster-pane.tsx`, add a new line right after `recheckStale` (line 616):

```typescript
          recheckStale={legalityRecheck ? legalityRecheck.paramsStale : undefined}
          recheckStuck={legalityRecheck ? legalityRecheck.stuck : undefined}
```

- [ ] **Step 6: Add `recheckStuck` prop and use it in the button's disabled condition in `pane-condition-strip.tsx`**

In `gantt/src/components/panes/pane-condition-strip.tsx`, add to the `PaneConditionStripProps` interface, right after `recheckStale?: boolean` (line 52):

```typescript
  /** Recheck has been COMPUTING longer than expected — re-enables the button even
   *  though `recheckComputing` is still true (see stuck-button-recovery spec). */
  recheckStuck?: boolean
```

Add `recheckStuck,` to the destructured props (right after `recheckStale,` on line 97).

Change the button's `disabled` attribute (line 292) from:

```typescript
                disabled={recheckComputing}
```

to:

```typescript
                disabled={recheckComputing && !recheckStuck}
```

- [ ] **Step 7: Add the "taking longer than usual" hint to `ScenarioRecheckIndicator`**

Replace the full contents of `gantt/src/components/legality/scenario-recheck-indicator.tsx`:

```typescript
import { ShieldCheck, Loader2, AlertTriangle } from 'lucide-react'

interface Props {
  status: 'PENDING' | 'COMPUTING' | 'READY' | 'FAILED' | null
  computedAt: string | null
  errorText: string | null
  paramsStale: boolean
  /** True once the current run has been COMPUTING/PENDING longer than expected — the
   *  pane-toolbar Recheck button is clickable again at this point even though this
   *  indicator (status-only, no button of its own) can't trigger it directly. */
  stuck: boolean
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

/**
 * Informational status line for the shared ViolationListDialog when opened from a Scenario —
 * mirrors LegalityRecheckIndicator's visual language but reads THIS scenario's own persisted
 * legality status (scenario.legality_status), never the global Live group. The actual "Recheck"
 * action lives solely on the pane-toolbar button (gantt/CLAUDE.md §Pane-Toolbar-Home) — this is
 * status-only, no button, matching how LegalityRecheckIndicator is used in this same dialog today.
 */
export function ScenarioRecheckIndicator({ status, computedAt, errorText, paramsStale, stuck }: Props) {
  const computing = status === 'COMPUTING' || status === 'PENDING'
  const failed = status === 'FAILED'
  return (
    <div className="flex items-center gap-1.5 text-2xs text-muted-foreground" data-testid="scenario-recheck-indicator">
      {computing ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        : failed ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        : <ShieldCheck className="h-3.5 w-3.5 shrink-0" />}
      <span data-testid="scenario-recheck-label" title={failed ? (errorText ?? undefined) : undefined}>
        {computing ? (stuck ? 'Checking legality… (taking longer than usual)' : 'Checking legality…')
          : failed ? 'Recheck failed'
          : paramsStale ? `Last checked ${fmt(computedAt)} (outdated)`
          : `Last checked ${fmt(computedAt)}`}
      </span>
    </div>
  )
}
```

- [ ] **Step 8: Pass `stuck` at the `ScenarioRecheckIndicator` call site**

In `gantt/src/components/panes/violation-list-dialog.tsx`, find the `<ScenarioRecheckIndicator ... />` call (around lines 181-186) and add `stuck={recheckInfo.stuck}` alongside the existing props:

```typescript
              : <ScenarioRecheckIndicator
                  status={recheckInfo.status}
                  computedAt={recheckInfo.computedAt}
                  errorText={recheckInfo.errorText}
                  paramsStale={recheckInfo.paramsStale}
                  stuck={recheckInfo.stuck}
                />}
```

- [ ] **Step 9: Typecheck**

Run: `cd gantt && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 10: Write the Playwright e2e test**

Create `e2e/tests/gantt/scenario-legality-recheck-stuck-recovery.spec.ts`. This mocks `/api/scenario/:id/legality` to stay `COMPUTING` forever, uses `page.clock` to fast-forward past the 90s stuck-threshold, asserts the Recheck button re-enables and the indicator shows the hint, then clicks it and asserts a success toast once the mock flips to `READY`:

```typescript
/**
 * Scenario Recheck — stuck-button recovery + settle notification (Scen-535 follow-up).
 *
 * Root cause of the original bug: scenario.legality_status can get pinned at COMPUTING
 * forever if the detached compute child dies without going through the code's own
 * exit/error handlers (see chat log for 2026-07-07). The Recheck button was permanently
 * disabled in that state with no way for the user to force a retry, and no notification
 * ever told them a recheck (manual or passively observed) had finished.
 *
 * This spec proves the frontend recovery: after 90s of continuous COMPUTING, the button
 * re-enables and the status indicator shows a "taking longer than usual" hint; clicking
 * it re-POSTs the recheck, and once the (mocked) backend settles to READY, a success
 * toast appears.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, findScenario } from '../../utils/gantt-hook'

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data: body, message: 'ok' }),
})

const buildMockGanttData = (scenarioId: number, scenarioName: string) => ({
  scenarioId,
  scenarioName,
  fileType: 'RO' as const,
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  scenarioStrDt: '2026-03-01T00:00:00',
  scenarioEndDt: '2026-03-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: [],
  pairings: [],
  assignments: [],
  pairingSegments: [],
  flights: [],
  groundItems: [],
  crewStats: {},
})

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

test.describe('Scenario Recheck — stuck-button recovery', () => {
  test('button re-enables after 90s stuck, notifies success on settle', async ({ page, request }) => {
    const token = await seedGanttAuth(page, request)
    const { id, name } = await findScenario(request, token, { fileType: 'RO', status: 'DONE' })

    // Fake clock BEFORE navigation so every timer the app sets (the 2s stuck-timer tick,
    // the 2.5s legality poll) is deterministically fast-forwardable.
    await page.clock.install({ time: new Date('2026-07-07T00:00:00Z') })

    await page.route(`**/api/scenario/${id}/gantt-data`, (route) => route.fulfill(json(buildMockGanttData(id, name))))
    await page.route(`**/api/scenario/${id}/lock-status`, (route) => route.fulfill(json(MOCK_LOCK_STATUS)))

    let legalityStatus: 'COMPUTING' | 'READY' = 'COMPUTING'
    await page.route(`**/api/scenario/${id}/legality`, (route) => route.fulfill(json(
      legalityStatus === 'COMPUTING'
        ? { status: 'COMPUTING', violations: [], computedAt: null, errorText: null }
        : { status: 'READY', violations: [], computedAt: '2026-07-07T00:02:00.000Z', errorText: null },
    )))
    await page.route(`**/api/scenario/${id}/legality/recheck`, (route) => route.fulfill(json({ status: 'COMPUTING' })))

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const item = await scenario.scenarioRow(id, name)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()
    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })

    const recheckBtn = page.getByTestId('scenario-legality-recheck')
    await expect(recheckBtn).toBeVisible()
    await expect(recheckBtn).toBeDisabled() // freshly COMPUTING — not yet "stuck"

    // Fast-forward past the 90s stuck threshold (and past several 2.5s polls + 2s stuck-ticks).
    await page.clock.fastForward(95_000)

    await expect(recheckBtn).toBeEnabled()

    // Open the alert dialog to confirm the status indicator shows the "taking longer" hint.
    await page.getByTestId('violations-button').click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('scenario-recheck-label')).toContainText('taking longer than usual')
    await page.getByTestId('violation-list-dialog').getByRole('button', { name: 'Close' }).click()

    // Click Recheck while "stuck" → re-POSTs. The mock still returns COMPUTING at this
    // point — legalityStatus only flips to 'READY' AFTER we confirm at least one poll
    // tick observed COMPUTING. pollScenarioLegality only notifies on a COMPUTING→settled
    // transition it actually witnessed (see Step 1's `wasComputing` guard); flipping to
    // READY before that first observation would silently skip the notify and defeat
    // this assertion.
    await recheckBtn.click()
    await page.clock.fastForward(3_000) // one 2.5s poll tick fires, observes COMPUTING

    legalityStatus = 'READY'
    await page.clock.fastForward(3_000) // next poll tick observes READY → notify fires
    await expect(page.getByText('Legality recheck complete')).toBeVisible({ timeout: 5_000 })
  })
})
```

- [ ] **Step 11: Run the e2e test**

Run: `cd e2e && npx playwright test tests/gantt/scenario-legality-recheck-stuck-recovery.spec.ts --reporter=list`
Expected: PASS (1 test). If `page.clock.install`/`fastForward` don't advance the app's timers as expected (e.g. the app uses a timer API `page.clock` doesn't intercept), fall back to asserting via `expect.poll` with the clock uninstalled and a short real threshold override — but try the clock approach first since it's fully deterministic.

- [ ] **Step 12: Bump FRONTEND_VERSION**

In `gantt/src/version.ts`, increment `FRONTEND_VERSION` by 1 and update its trailing comment to describe this change, e.g. `// Legality recheck stuck-button recovery (scenario + live)`.

- [ ] **Step 13: Run the UI standard gate**

Run: `npm run check:ui` (from repo root)
Expected: `UI Standard Gate: PASS — 0 hard violations` (this task adds no new magic font sizes/colors/radii, so the hard-violation count should be unchanged from the pre-existing baseline).

- [ ] **Step 14: Commit**

```bash
git add gantt/src/components/gantt/source/scenario-gantt-source.ts \
        gantt/src/components/gantt/source/gantt-pane-source.ts \
        gantt/src/components/panes/shared/roster-pane.tsx \
        gantt/src/components/panes/pane-condition-strip.tsx \
        gantt/src/components/legality/scenario-recheck-indicator.tsx \
        gantt/src/components/panes/violation-list-dialog.tsx \
        gantt/src/services/scenario-legality-api.ts \
        gantt/src/version.ts \
        e2e/tests/gantt/scenario-legality-recheck-stuck-recovery.spec.ts
git commit -m "feat: scenario legality recheck recovers from a stuck COMPUTING state"
```

---

### Task 3: Live's own recheck indicator — same stuck-recovery + raised poll cap + give-up notification

**Files:**
- Modify: `gantt/src/components/legality/legality-recheck-indicator.tsx`
- Test: `e2e/tests/gantt/legality-recheck-indicator-stuck-recovery.spec.ts` (new)

**Interfaces:**
- Consumes: nothing from Tasks 1-2 (Live's indicator is fully self-contained, no Zustand store).
- Produces: nothing consumed elsewhere — this task is independently testable and revertable.

- [ ] **Step 1: Replace the full contents of `legality-recheck-indicator.tsx`**

```typescript
import { useEffect, useRef, useState, useCallback } from 'react'
import { ShieldCheck, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@rois/ui'
import { legalityApi } from '@/services/legality-api'
import { notify } from '@/utils/notify'
import type { LegalityRecheckStatus } from '@/types/legality'

interface Props {
  groupCode: string
  /** When set, render a "Recheck now" button that triggers a live recheck for [from,to]. */
  recheck?: { from: string; to: string } | null
  /** External signal (incremented by the parent on param-save) to start polling immediately. */
  pollSignal?: number
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

/** Live's full-roster recheck legitimately takes low minutes; 10 min is a generous
 *  "something's wrong" bar. */
const STUCK_MS = 10 * 60_000
/** Give up after 30 min of polling — matches the backend's own Redis dedupe TTL
 *  (live-server/src/routes/rule/legality.ts), so we never poll long past the point
 *  the server-side status key itself would have expired. */
const POLL_CAP = 1200

export function LegalityRecheckIndicator({ groupCode, recheck = null, pollSignal = 0 }: Props) {
  const [st, setSt] = useState<LegalityRecheckStatus>({ status: 'idle', lastCheckedAt: null, error: null })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const computingSinceRef = useRef<number | null>(null)
  const [, forceTick] = useState(0)
  const stop = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  // Tick every 2s while computing so `stuck` re-evaluates without waiting for a poll response.
  useEffect(() => {
    if (st.status !== 'computing') { computingSinceRef.current = null; return }
    const id = setInterval(() => forceTick((n) => n + 1), 2000)
    return () => clearInterval(id)
  }, [st.status])

  const startPolling = useCallback(() => {
    stop()
    let polls = 0
    pollRef.current = setInterval(async () => {
      polls += 1
      try {
        const s = await legalityApi.getRecheckStatus(groupCode)
        setSt(s)
        if (s.status === 'done') { stop(); notify.success('Legality recheck done'); return }
        if (s.status === 'failed') { stop(); notify.error(s.error || 'Legality recheck failed'); return }
      } catch { /* transient — keep polling */ }
      if (polls >= POLL_CAP) { stop(); notify.error('Still checking — click Recheck to retry') }
    }, 1500)
  }, [groupCode])

  // Initial fetch (show last-checked on mount); re-fetch when groupCode changes.
  useEffect(() => {
    let alive = true
    legalityApi.getRecheckStatus(groupCode).then((s) => { if (alive) { setSt(s); if (s.status === 'computing') startPolling() } }).catch(() => {})
    return () => { alive = false; stop() }
  }, [groupCode, startPolling])

  // Parent bumps pollSignal after a param save → reflect "computing" and start polling.
  useEffect(() => {
    if (pollSignal > 0) {
      computingSinceRef.current = Date.now()
      setSt((p) => ({ ...p, status: 'computing' }))
      startPolling()
    }
  }, [pollSignal, startPolling])

  const onRecheck = async () => {
    if (!recheck) return
    // Force-reset regardless of prior (possibly stuck) state — a fresh compute starts now.
    computingSinceRef.current = Date.now()
    setSt((p) => ({ ...p, status: 'computing' }))
    try { await legalityApi.triggerRecheck(groupCode, recheck.from, recheck.to); startPolling() }
    catch (e) {
      computingSinceRef.current = null
      setSt((p) => ({ ...p, status: 'failed' }))
      notify.error(e instanceof Error ? e.message : 'Failed to start recheck')
    }
  }

  const computing = st.status === 'computing'
  if (computing && computingSinceRef.current == null) computingSinceRef.current = Date.now()
  const stuck = computing && computingSinceRef.current != null && Date.now() - computingSinceRef.current > STUCK_MS

  return (
    <div className="flex items-center gap-1.5 text-2xs text-muted-foreground" data-testid="legality-recheck-indicator">
      {computing ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        : st.status === 'failed' ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        : <ShieldCheck className="h-3.5 w-3.5 shrink-0" />}
      <span data-testid="legality-recheck-label">
        {computing ? (stuck ? 'Checking legality… (taking longer than usual)' : 'Checking legality…')
          : st.status === 'failed' ? 'Recheck failed'
          : `Last checked ${fmt(st.lastCheckedAt)}`}
      </span>
      {recheck && (
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2" disabled={computing && !stuck}
          onClick={onRecheck} data-testid="legality-recheck-now">
          <RefreshCw className="h-3.5 w-3.5" />
          Recheck now
        </Button>
      )}
    </div>
  )
}
```

Note on Step 1's `if (computing && computingSinceRef.current == null) computingSinceRef.current = Date.now()` line: this mutates a ref during render (not inside an effect). This is intentional and safe here — it's idempotent (only sets the ref the first time `computing` is observed true, a no-op on every subsequent render until it clears), doesn't trigger a re-render itself, and covers the case where `st.status` becomes `'computing'` via `setSt` inside `onRecheck`/`startPolling`'s first response before the `useEffect` on line "Tick every 2s..." has a chance to run. The effect-based `computingSinceRef.current = null` reset (when leaving computing) still handles cleanup.

- [ ] **Step 2: Typecheck**

Run: `cd gantt && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Write the Playwright e2e test**

The exact navigation to reach `LegalityRecheckIndicator` with a `recheck` prop (the
DEFAULT ruleset 103's header) is already established by the existing
`legality-auto-recheck.spec.ts` (`openLegalityDefault` helper: `goto('/altair/')` →
click `module-nav-legality` → wait for `legality-rule-sets-view` → click
`legality-ruleset-card-103` → wait for `legality-set-name` to contain `'PBS Solver
Ruleset'`). Reuse the same steps inline. Create
`e2e/tests/gantt/legality-recheck-indicator-stuck-recovery.spec.ts`:

```typescript
/**
 * Live's LegalityRecheckIndicator — stuck-button recovery + give-up notification.
 *
 * Same shape of bug as the Scenario recheck button (see
 * scenario-legality-recheck-stuck-recovery.spec.ts): "Recheck now" was permanently
 * disabled while status stayed 'computing', with no way to force a retry and no
 * notification if polling ever gave up. This proves: after 10 min stuck, the button
 * re-enables and the label shows the hint; after the 30-min poll cap with no
 * settlement, a "Still checking" toast appears instead of silent give-up.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data: body, message: 'ok' }),
})

test.describe('Live Legality Recheck — stuck-button recovery', () => {
  test('button re-enables after 10 min stuck; gives up with a toast after the 30 min poll cap', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.clock.install({ time: new Date('2026-07-07T00:00:00Z') })

    await page.route('**/api/legality/recheck-status**', (route) => route.fulfill(json({
      status: 'computing', lastCheckedAt: null, error: null,
    })))

    // Same navigation as legality-auto-recheck.spec.ts's openLegalityDefault helper.
    await page.goto('/altair/')
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByTestId('legality-ruleset-card-103').click()
    await expect(page.getByTestId('legality-set-name')).toContainText('PBS Solver Ruleset', { timeout: 10_000 })
    await expect(page.getByTestId('legality-recheck-indicator')).toBeVisible({ timeout: 10_000 })

    const recheckBtn = page.getByTestId('legality-recheck-now')
    await expect(recheckBtn).toBeDisabled()

    await page.clock.fastForward(10 * 60_000 + 5_000) // past the 10-min stuck threshold
    await expect(recheckBtn).toBeEnabled()
    await expect(page.getByTestId('legality-recheck-label')).toContainText('taking longer than usual')

    await page.clock.fastForward(20 * 60_000) // total ~30 min → exhausts the poll cap
    await expect(page.getByText('Still checking — click Recheck to retry')).toBeVisible({ timeout: 5_000 })
  })
})
```

- [ ] **Step 4: Run the e2e test**

Run: `cd e2e && npx playwright test tests/gantt/legality-recheck-indicator-stuck-recovery.spec.ts --reporter=list`
Expected: PASS (1 test).

- [ ] **Step 5: Run the full affected e2e suite to check for regressions**

Run: `cd e2e && npx playwright test tests/gantt/legality-auto-recheck.spec.ts tests/gantt/scenario-legality-param-invalidation.spec.ts tests/gantt/scenario/scenario-alert-dialog-recheck-status.spec.ts --reporter=list`
Expected: all PASS (these pre-existing tests never run long enough to hit either stuck threshold, so `disabled={recheckComputing && !recheckStuck}` behaves identically to the old `disabled={recheckComputing}` for them).

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/legality/legality-recheck-indicator.tsx \
        e2e/tests/gantt/legality-recheck-indicator-stuck-recovery.spec.ts
git commit -m "feat: live legality recheck indicator recovers from a stuck computing state"
```
