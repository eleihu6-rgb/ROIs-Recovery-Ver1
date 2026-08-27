/**
 * Client-side memory — Live + Scenario 6 gantt.
 *
 * Playbook focus area #1 (user-side gantt performance → client-side memory). Proves the
 * shipped hidden-scenario-tab optimization
 * (docs/superpowers/specs/2026-06-15-120419-gantt-memory-optimization-scenario-focus-ai-coding.md):
 * a hidden scenario tab SUSPENDS its canvas/grid tree (canvas elements dropped, RAF render
 * loop + lock polling paused) and RESTORES from store data on return with no /gantt-data
 * refetch. NOTE: JS heap barely moves — measurement showed the per-tab JS heap is dominated
 * by one-time scenario module compilation + shared caches, NOT the canvas or store.data — so
 * the idle data-release (Phase 4/5) was measured (~1.3 MB) and dropped as not worth a reload.
 *
 * Local dev DB has no engine optimization artifacts (every scenario gantt-data 502s), so run
 * a LOCAL frontend (with the fix) proxied to a backend that has scenario data, e.g.:
 *   VITE_PORT=5373 VITE_LIVE_TARGET=https://crew-f8-usva-tst.roiscloud.com/altair/live npx vite
 *   GANTT_BASE_URL=http://localhost:5373 \
 *   GANTT_API_URL=https://crew-f8-usva-tst.roiscloud.com/altair/live \
 *   GANTT_TEST_USER=admin GANTT_TEST_PASS=123456 \
 *   npx playwright test --config config/playwright.config.ts \
 *     tests/gantt/scenario-memory-baseline.spec.ts --project=gantt --no-deps
 * It skips gracefully where scenario data is unavailable.
 */
import { test, expect, type Page } from '@playwright/test'
import { gotoScenarioList, switchToOpenScenario } from '../../pages/gantt/scenario-nav'
import { seedGanttAuth, openLiveView } from '../../utils/gantt-hook'

const SCENARIO_ID = 6
const SCENARIO_NAME = 'RO-2026-06 YEG Test' // scenario id 6 (RO, DONE)
const MODULE_KEY = `scenario-gantt:${SCENARIO_ID}` // Scenarios submenu row testid: scenario-nav-tab-<key>
const SCN_CANVAS =
  '[data-testid="scenario-roster-canvas"],[data-testid="scenario-pairing-canvas"],[data-testid="scenario-flight-canvas"]'

interface Snap {
  heapMB: number | null
  totalCanvas: number
  scnCanvas: number
  scnViews: number
  suspended: number
  domNodes: number
}

// Hook-free Live load (prod build has no window.__ganttTest): drive the Live UI, wait for canvases.
const gotoLive = async (page: Page) => {
  await page.goto('/altair/')
  await openLiveView(page)
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
}

// PRECISE V8 heap via CDP (performance.memory is quantized) + forced GC before each sample.
const createMeter = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable').catch(() => {})
  const snap = async (label: string): Promise<Snap> => {
    await page.waitForTimeout(1200) // settle
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {})
    let heap: number | null = null
    try {
      const { metrics } = await cdp.send('Performance.getMetrics')
      const v = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value
      heap = v != null ? Math.round((v / 1048576) * 10) / 10 : null
    } catch {
      /* heap unavailable */
    }
    const dom = await page.evaluate((scnSel) => {
      const q = (sel: string) => document.querySelectorAll(sel).length
      return {
        totalCanvas: q('canvas'),
        scnCanvas: q(scnSel),
        scnViews: q('[data-testid="scenario-gantt-view"]'),
        suspended: q('[data-testid="scenario-gantt-suspended"]'),
        domNodes: q('*'),
      }
    }, SCN_CANVAS)
    const m = { heapMB: heap, ...dom }
    // eslint-disable-next-line no-console
    console.log(
      `[MEM] ${label.padEnd(30)} heap=${m.heapMB}MB  canvas=${m.totalCanvas}  scn-canvas=${m.scnCanvas}  scn-views=${m.scnViews}  suspended=${m.suspended}  dom=${m.domNodes}`,
    )
    return m
  }
  return { snap }
}

// Open scenario 6 via the real UI (Scenario tab → row → Open). Returns false if its data
// could not load in this env (engine artifacts missing) — caller skips the scenario stages.
const openScenario6 = async (page: Page): Promise<boolean> => {
  await gotoScenarioList(page)
  await page.getByTestId('scenario-nav-ro').click()
  // Demo DB has several copies named SCENARIO_NAME (#6/#460/#467); `.first()` would pick
  // the wrong copy (its tab chip key ≠ scenario-gantt:6, breaking the return-tab click).
  // Search to surface the row, then pin to the unique #6 id chip.
  await page.getByPlaceholder('Search scenarios…').fill(SCENARIO_NAME)
  const row = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(`#${SCENARIO_ID}`, { exact: true }),
  })
  await expect(row, 'scenario 6 row present in RO list').toBeVisible({ timeout: 15_000 })
  await row.click()
  await expect(page.getByTestId('scenario-detail-panel')).toBeVisible()
  await page.getByTestId('scenario-detail-panel').getByTestId('scenario-open-btn').click()
  const outcome = await Promise.race([
    page.getByTestId('scenario-gantt-view').waitFor({ state: 'visible', timeout: 25_000 }).then(() => 'view').catch(() => null),
    page.getByText(/Error:/).waitFor({ state: 'visible', timeout: 25_000 }).then(() => 'error').catch(() => null),
  ])
  return outcome === 'view'
}

test('Phase 2 — hidden scenario tab SUSPENDS canvases and RESTORES on return (no refetch)', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)
  const { snap } = await createMeter(page)

  let ganttDataReqs = 0
  page.on('request', (req) => {
    if (req.url().includes(`/api/scenario/${SCENARIO_ID}/gantt-data`)) ganttDataReqs++
  })

  await seedGanttAuth(page, request)
  await gotoLive(page)
  const m1 = await snap('M1 Live only')
  expect(m1.scnViews, 'no scenario tab open yet').toBe(0)

  if (!(await openScenario6(page))) {
    const why = await page.evaluate(() => document.body.innerText.match(/Error:.*/)?.[0] ?? 'no view')
    test.skip(true, `scenario 6 gantt-data unavailable (${why}); run against a backend with scenario data`)
    return
  }

  await expect(page.getByTestId('scenario-gantt-toolbar')).toBeVisible()
  await expect(page.locator(SCN_CANVAS).first()).toBeVisible({ timeout: 20_000 })
  const m2 = await snap('M2 Scenario 6 active')
  expect(m2.scnCanvas, 'scenario canvases rendered when active').toBeGreaterThan(0)
  const reqsAfterOpen = ganttDataReqs

  // Hide → must suspend (drop canvas tree, NOT refetch).
  await page.getByTestId('module-nav-live').click()
  await expect(page.getByTestId('scenario-gantt-suspended')).toBeAttached({ timeout: 10_000 })
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  const m3 = await snap('M3 Live, scn-6 HIDDEN')
  expect(m3.suspended, 'suspended placeholder present').toBe(1)
  expect(m3.scnViews, 'scenario view unmounted').toBe(0)
  expect(m3.scnCanvas, 'scenario canvases removed from DOM').toBe(0)
  expect(m3.totalCanvas, 'canvas count back to Live-only').toBe(m1.totalCanvas)

  // Return → restore from store data, still no refetch (quick switch, no idle release).
  await switchToOpenScenario(page, MODULE_KEY)
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator(SCN_CANVAS).first()).toBeVisible({ timeout: 15_000 })
  const m4 = await snap('M4 Scenario 6 restored')
  expect(m4.scnCanvas, 'canvases restored on return').toBeGreaterThan(0)
  expect(m4.suspended, 'no longer suspended').toBe(0)
  expect(ganttDataReqs, 'quick suspend/restore must NOT refetch gantt-data').toBe(reqsAfterOpen)

  // eslint-disable-next-line no-console
  console.log(
    `\n  [Phase 2] hide reclaimed -${m2.totalCanvas - m3.totalCanvas} canvas / -${m2.domNodes - m3.domNodes} dom nodes; ` +
      `restore added them back. JS heap M1=${m1.heapMB} M2=${m2.heapMB} M3=${m3.heapMB} M4=${m4.heapMB} MB ` +
      `(heap barely moves — the win is native canvas backing-store + render-loop/polling work, not JS heap).\n`,
  )
})
