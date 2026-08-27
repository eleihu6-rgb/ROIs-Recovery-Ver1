/**
 * V4-P08 regression: scenario canvas must coalesce per-commit redraws into RAF
 * frames, and content must still update after pxPerHour change (no stale frames).
 *
 * Environment note: the demo env engine-server returns 502 for
 * /api/scenario/:id/gantt-data (engine-server /optimize/result 401), so
 * ScenarioGanttView always enters the error state when opening any scenario in
 * this env. This also explains why scenario-gantt-open.spec.ts and other
 * scenario-gantt-* specs fail — they all require a loaded ScenarioGanttView.
 *
 * Workaround: use Playwright page.route() to intercept the gantt-data API call
 * and return a minimal mock payload. This lets the ScenarioGanttCanvas mount
 * and draw without the engine-server, allowing us to measure RAF coalescing.
 *
 * Triggering mechanism (v2, spec-review fix): `scenarioRedrawBurst` test hook
 * writes 24 DISTINCT scrollX values to the scenario-gantt-store, each in its
 * own setTimeout(0) macrotask, forcing 24 independent React commits. This
 * replaces the original zoom-click burst, which collapsed to ONE React commit
 * (stale `pxPerHour` closure + Zustand dedup → all 8 clicks wrote the same
 * value, so pre-fix and post-fix were indistinguishable).
 *
 * Why 24 instead of 12: under parallel-suite CPU load the 12 macrotask-spaced
 * writes could spread across ≥6 animation frames, tripping the delta<writes/2
 * bound (pre-fix: delta==writes==12, always ≥ writes/2). 24 writes keep the
 * pre-fix case (delta==writes==24) failing decisively while doubling post-fix
 * headroom — even under heavy load the RAF guard keeps delta well under 16.
 *
 * Threshold is writes*2/3 (floor), not writes/2: post-fix observed deltas are
 * 1–13 in practice; using writes/2=12 could still flake at delta=13 under
 * momentary CPU saturation. writes*2/3=16 provides the necessary margin while
 * still decisively catching the pre-fix case (delta==writes==24 ≥ 16).
 *
 * Pre-fix failure root cause: bare `useEffect(() => { drawFrame() })` fires a
 * synchronous redraw on every React commit. 24 independent commits = 24 draws.
 * Post-fix (RAF): the effect schedules requestAnimationFrame on the first commit
 * within a frame; subsequent commits within the same animation frame are no-ops
 * (rafRef guard). 24 commits spread over a few frames → delta << 16.
 * pre-fix draws once per commit (delta == writes == 24, always ≥ writes*2/3);
 * post-fix RAF coalesces — even under heavy parallel-suite load the 24
 * macrotask writes span well under 16 frames.
 *
 * StrictMode safety: the cleanup effect MUST reset rafRef.current = 0 after
 * cancelAnimationFrame — otherwise StrictMode unmount cancels the RAF but leaves
 * rafRef non-zero, and the remount's effect guard (`if (rafRef.current) return`)
 * prevents any subsequent RAF from being scheduled. This mirrors the fix already
 * present in pane-canvas.tsx (line ~229).
 *
 * Note: a reviewer suggested a shared RAF-scheduling hook across PaneCanvas /
 * PaneHeaderCanvas / ScenarioGanttCanvas — not done in this task (structurally
 * different: drawFrame/propsRef vs render/renderRef+dirty); noted as future work.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, renderStats } from '../../utils/gantt-hook'

/** The demo DONE RO scenario used to open the scenario detail panel. */
const DEMO_SCENARIO_NAME = 'RO-2026-03 Mar Full Assignment'
const DEMO_SCENARIO_ID = 8

/** Minimal ScenarioGanttData payload with enough crew rows. */
const MOCK_GANTT_DATA = {
  scenarioId: DEMO_SCENARIO_ID,
  scenarioName: DEMO_SCENARIO_NAME,
  fileType: 'RO',
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  // Official scenario dates (no lead-in/out) — required by ScenarioGanttView's
  // updateZoomBounds (data.scenarioStrDt/scenarioEndDt .slice on first load).
  scenarioStrDt: '2026-03-01T00:00:00',
  scenarioEndDt: '2026-03-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot',
  crew: Array.from({ length: 30 }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`,
    base: 'YEG',
    division: 'Pilots',
    rank: i % 2 === 0 ? 'CA' : 'FO',
    seniorityNum: String(i + 1),
    crewName: `Crew ${i + 1}`,
  })),
  pairings: [],
  assignments: [],
  pairingSegments: [],
  flights: [],
  groundItems: [],
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

const scenarioRenders = async (page: import('@playwright/test').Page): Promise<number> => {
  const stats = await renderStats(page)
  // Scenario roster converged onto the shared PaneCanvas; the default roster pane
  // publishes render stats under its layout paneId 'roster-1' (was 'scenario-gantt'
  // on the old ScenarioGanttCanvas fork).
  return stats.find((s) => s.paneId === 'roster-1')?.renders ?? 0
}

/**
 * Open the demo DONE RO scenario in the Scenario Gantt view.
 * Intercepts the gantt-data API call with MOCK_GANTT_DATA so the view loads
 * without the engine-server. Returns once the scenario-roster-canvas and
 * zoom-in are visible.
 */
async function openMockedScenarioGantt(page: import('@playwright/test').Page): Promise<void> {
  await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/gantt-data`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: MOCK_GANTT_DATA, message: 'ok' }),
    }),
  )
  await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/lock-status`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: MOCK_LOCK_STATUS, message: 'ok' }),
    }),
  )

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()

  // Demo DB holds several rows sharing the exact name DEMO_SCENARIO_NAME (id 8 + copies),
  // so an exact-name filter resolves to >1 row. Search to surface the row, then pin by the
  // unique `#<id>` chip.
  const item = await scenario.scenarioRow(DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()
  await expect(scenario.detailPanel.getByTestId('scenario-status-badge')).toHaveText('Done')

  await scenario.detailPanel.getByTestId('scenario-open-btn').click()

  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('zoom-in')).toBeVisible({ timeout: 5_000 })

  // Let the initial render storm (resize observer + first draw) settle.
  await page.waitForTimeout(600)
}

test.describe('V4-P08 — Scenario canvas RAF coalescing', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Scen-2005 — scenario canvas coalesces a burst of store-write-induced redraws', async ({ page }) => {
    await openMockedScenarioGantt(page)
    await page.waitForTimeout(200)

    const before = await scenarioRenders(page)

    // Trigger 24 cross-macrotask scenario-store writes via the test hook.
    // Each write uses a distinct scrollX value (7, 14, ..., 161, 0) chained through
    // setTimeout(0), so React's automatic batching CANNOT merge them into one commit.
    // This produces 24 independent React commits in a short window (~24 macrotasks).
    //
    // Pre-fix (bare useEffect): canvas draws once synchronously per React commit
    //   → delta ≈ 24 (always ≥ writes/2 = 12, so the assertion below would FAIL).
    // Post-fix (RAF): first commit schedules RAF; subsequent commits within the
    //   same animation frame are no-ops (rafRef guard) → delta << 12.
    // Uses default steps=24 (omitting args) so the hook default is exercised.
    const writes = await page.evaluate(() =>
      (window as unknown as { __ganttTest: { scenarioRedrawBurst: (id?: number) => Promise<number> } })
        .__ganttTest.scenarioRedrawBurst(8),
    )

    // Wait for RAF and React to settle (all 24 macrotasks + RAF flush + a margin).
    await page.waitForTimeout(400)

    const after = await scenarioRenders(page)
    const delta = after - before

    expect(writes, 'burst must have produced 24 writes').toBeGreaterThanOrEqual(24)
    // At least one draw must have happened.
    expect(delta, 'some redraws must have occurred after the burst').toBeGreaterThan(0)
    // Pre-fix: ~24 draws (one synchronous draw per React commit, delta == writes == 24,
    //   always ≥ writes*2/3 = 16).
    // Post-fix: RAF coalesces commits sharing a frame. 24 setTimeout(0) writes
    //   spread over only a few animation frames → delta well under 16.
    // pre-fix draws once per commit (delta == writes == 24, always ≥ writes*2/3);
    // post-fix RAF coalesces — even under heavy parallel-suite load the 24
    // macrotask writes span well under 16 frames.
    // Threshold is writes*2/3 (not writes/2) to tolerate modest CPU jitter —
    // post-fix observed deltas are 1–13 in practice; pre-fix is always 24.
    const threshold = Math.floor(writes * 2 / 3)
    expect(
      delta,
      `RAF must coalesce the ${writes} burst writes into fewer than ${threshold} draws (got ${delta})`,
    ).toBeLessThan(threshold)
  })

  test('Scen-2006 — scenario canvas content still updates after zoom (not stale)', async ({ page }) => {
    await openMockedScenarioGantt(page)

    const canvas = page.getByTestId('scenario-roster-canvas')
    const zoomIn = page.getByTestId('zoom-in')
    await page.waitForTimeout(200)

    // Screenshot before zoom.
    const before = await canvas.screenshot()

    // Zoom in enough to shift the timeline scale visibly.
    const zoomInEl = await zoomIn.elementHandle()
    await page.evaluate((el) => {
      if (!el) throw new Error('zoom-in not found')
      for (let i = 0; i < 4; i++) {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      }
    }, zoomInEl)

    await page.waitForTimeout(400) // RAF flush

    const after = await canvas.screenshot()

    // Pixel buffers must differ — the canvas was redrawn with new pxPerHour.
    // If RAF were buggy (stale closure / never firing), the buffers would be identical.
    expect(
      before.equals(after),
      'canvas pixel buffer must change after zoom — RAF must fire with latest props',
    ).toBe(false)
  })
})
