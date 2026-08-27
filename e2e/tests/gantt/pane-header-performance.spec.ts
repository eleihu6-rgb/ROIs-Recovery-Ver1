/**
 * F54 pane-header performance (docs/superpowers/specs/gantt-f54-pane-header-performance-enhance-ver3.md)
 *
 * F54-P01 — pane-scoped vertical scroll: wheeling over ONE pane (left header or canvas)
 *   must redraw only that pane's two canvases (content + left header), not every pane.
 *   Truth via __ganttTest.render() draw receipts (per-paneId `renders` counters; the left
 *   header publishes as `<paneId>:header`).
 *
 * F54-P05 — month-click zoom works on each pane's own TimeAxis (hit regions are now
 *   per-axis, not a shared module global owned by whichever axis drew last).
 *
 * F54-P03/P04 — pane chrome (PaneToolbar / PaneConditionStrip) must NOT re-render during
 *   plain horizontal or vertical scrolling. Truth via __ganttTest.chromeCommits()
 *   (render-body execution counters, the automatable equivalent of the spec's
 *   "React Profiler shows no chrome commit on scroll").
 */
import { test, expect, type Page, type Locator } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

const box = async (loc: Locator) => {
  const b = await loc.boundingBox()
  expect(b, 'element must be laid out').not.toBeNull()
  return b!
}

/** Read per-canvas draw counters keyed by paneId (includes `<paneId>:header` entries). */
const renderCounts = async (page: Page): Promise<Record<string, number>> => {
  const stats = await page.evaluate(() => window.__ganttTest!.render())
  return Object.fromEntries(stats.map((s) => [s.paneId, s.renders]))
}

/**
 * Wait until ALL async data has settled — i.e. neither the pane chrome commit counters
 * (toolbar/strip) nor the per-pane canvas draw counters change across a quiet window.
 *
 * These tests measure SCROLL isolation: a baseline taken before the wheel must be
 * attributable to the wheel only. But Live violation/manday data loads in batches AFTER
 * first paint (each persisted-violation batch bumps the global dirty signal → all canvases
 * redraw, and the Alert-Center badge count → the strip re-renders). That settle is
 * legitimate and identical on `main`; a fixed 800/1200ms baseline races it and yields false
 * "scroll re-rendered chrome" failures. Polling for a quiet window removes the race while
 * keeping the post-wheel assertions strict (still exact-equal, zero tolerance).
 */
const settleRenders = async (page: Page): Promise<void> => {
  const snapshot = async (): Promise<string> => {
    const [chrome, draws] = await Promise.all([
      page.evaluate(() => window.__ganttTest!.chromeCommits()),
      renderCounts(page),
    ])
    return JSON.stringify({ chrome, draws })
  }
  // Quiet = N consecutive identical snapshots ~600ms apart. Violation/stats data arrives in
  // bursts with sub-second gaps, so a single quiet gap can falsely look settled and let a
  // later burst re-render chrome mid-scroll; require a CONTINUOUS quiet window before
  // baselining. expect.poll re-evaluates until the closure returns true (or its timeout).
  const QUIET_SAMPLES = 4 // ~2.4s of continuous stability
  let prev = await snapshot()
  let quiet = 0
  await expect
    .poll(async () => {
      await page.waitForTimeout(600)
      const now = await snapshot()
      quiet = now === prev ? quiet + 1 : 0
      prev = now
      return quiet >= QUIET_SAMPLES
    }, { message: 'async data (violations / stats) must settle before baselining scroll counters', timeout: 30_000 })
    .toBe(true)
}

test.describe('F54 pane-header performance', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
    await dashboard.expectPairingPaneVisible()
    await expect.poll(async () => (await page.evaluate(() => window.__ganttTest!.rosterPanel())).length)
      .toBeGreaterThan(0)
  })

  test('Live-1156 — vertical wheel over roster left header redraws only the roster pane @smoke', async ({ page }) => {
    const rosterPane = dashboard.rosterPane
    const paneBox = await box(rosterPane)
    const strip = rosterPane.getByTestId('pane-condition-strip').first()
    const stripBox = await box(strip)

    // Position the cursor FIRST (a hover transition may legitimately mark the view dirty
    // once), then let redraw activity settle so deltas are attributable to the wheel only.
    await page.mouse.move(paneBox.x + 60, stripBox.y + stripBox.height + 60)
    await settleRenders(page)
    const before = await renderCounts(page)
    const rosterIds = Object.keys(before).filter((id) => id.startsWith('roster'))
    const pairingIds = Object.keys(before).filter((id) => id.startsWith('pairing'))
    expect(rosterIds.length, 'roster content + header receipts present').toBeGreaterThanOrEqual(2)
    expect(rosterIds.some((id) => id.endsWith(':header')), 'left header publishes draw receipts').toBe(true)
    expect(pairingIds.length).toBeGreaterThanOrEqual(2)

    // Wheel over the LEFT header region (below the condition strip, left of the virtual line).
    await page.mouse.wheel(0, 120)
    await page.mouse.wheel(0, 120)

    // Both roster canvases redrew…
    await expect.poll(async () => {
      const now = await renderCounts(page)
      return rosterIds.every((id) => (now[id] ?? 0) > (before[id] ?? 0))
    }, { message: 'roster content + header canvases redraw on own-pane scroll' }).toBe(true)

    // …and no pairing canvas did (pane-scoped scroll must not mark the whole view dirty).
    const after = await renderCounts(page)
    for (const id of pairingIds) {
      expect(after[id], `pairing canvas ${id} must not redraw on roster scroll`).toBe(before[id])
    }
  })

  test('Live-1157 — vertical wheel over roster canvas redraws only the roster pane', async ({ page }) => {
    const canvas = dashboard.rosterCanvas
    const canvasBox = await box(canvas)

    // Position the cursor FIRST (hover transition may mark dirty once), then settle.
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + 120)
    await settleRenders(page)
    const before = await renderCounts(page)
    const rosterContentId = Object.keys(before).find((id) => id.startsWith('roster') && !id.endsWith(':header'))!
    const pairingIds = Object.keys(before).filter((id) => id.startsWith('pairing'))

    // Vertical-only wheel over the gantt content area.
    await page.mouse.wheel(0, 120)
    await page.mouse.wheel(0, 120)

    await expect.poll(async () => (await renderCounts(page))[rosterContentId])
      .toBeGreaterThan(before[rosterContentId])

    const after = await renderCounts(page)
    for (const id of pairingIds) {
      expect(after[id], `pairing canvas ${id} must not redraw on roster vertical scroll`).toBe(before[id])
    }
  })

  test('Live-1158 — pane chrome does not re-render during horizontal or vertical scroll', async ({ page }) => {
    const canvas = dashboard.rosterCanvas
    const canvasBox = await box(canvas)

    // Position cursor, let loading/badge updates settle, then baseline the commit counters.
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + 120)
    await settleRenders(page)
    const before = await page.evaluate(() => window.__ganttTest!.chromeCommits())
    expect(before['toolbar:roster-main'], 'toolbar commit counter present').toBeGreaterThan(0)
    expect(before['strip:roster-main'], 'strip commit counter present').toBeGreaterThan(0)

    // Horizontal scroll (shared scrollX) + vertical scroll (pane scrollY).
    for (let i = 0; i < 10; i++) await page.mouse.wheel(40, 0)
    for (let i = 0; i < 10; i++) await page.mouse.wheel(-40, 0)
    await page.mouse.wheel(0, 240)
    await page.mouse.wheel(0, -240)

    // The canvas DID redraw (sanity that scrolling actually happened)…
    const stats = await renderCounts(page)
    expect(Object.keys(stats).some((id) => id.startsWith('roster'))).toBe(true)

    // …but neither chrome component committed a single re-render.
    await page.waitForTimeout(500)
    const after = await page.evaluate(() => window.__ganttTest!.chromeCommits())
    for (const key of ['toolbar:roster-main', 'strip:roster-main', 'toolbar:pairing', 'strip:pairing']) {
      expect(after[key], `${key} must not re-render during scroll`).toBe(before[key])
    }
  })

  test('Live-1159 — month-click zoom works on each pane\'s own time axis', async ({ page }) => {
    // Probe the top half of an axis for a month-label hit (cursor flips to 'pointer'),
    // click it, and verify the zoom actually changed — for BOTH roster and pairing axes.
    const probeAndClickMonth = async (axis: Locator): Promise<boolean> => {
      const axisBox = await box(axis)
      const y = axisBox.y + 8 // top row — month labels only
      for (let fx = 0.2; fx <= 0.8; fx += 0.05) {
        const x = axisBox.x + axisBox.width * fx
        await page.mouse.move(x, y)
        const cursor = await axis.evaluate((el) => getComputedStyle(el).cursor)
        if (cursor === 'pointer') {
          await page.mouse.click(x, y)
          return true
        }
      }
      return false
    }
    const resetZoom = async (axis: Locator) => {
      const axisBox = await box(axis)
      await page.mouse.dblclick(axisBox.x + axisBox.width * 0.5, axisBox.y + axisBox.height * 0.75)
      await expect.poll(async () => {
        const z = await page.evaluate(() => window.__ganttTest!.zoom())
        return Math.abs(z.pxPerHour - z.zoomMin)
      }).toBeLessThan(0.01)
    }

    for (const pane of [dashboard.rosterPane, dashboard.pairingPane]) {
      const axis = pane.getByTestId('pane-time-axis').first()
      // Start from min zoom, then zoom IN (at min zoom with a ~1-month date range,
      // zoomToMonth clamps back to zoomMin — an unobservable no-op by design).
      await resetZoom(axis)
      await dashboard.zoomIn()
      await dashboard.zoomIn()
      await dashboard.zoomIn()
      const zBefore = await page.evaluate(() => window.__ganttTest!.zoom())
      expect(zBefore.pxPerHour).toBeGreaterThan(zBefore.zoomMin * 2)

      // Month-click → zoom-to-month → pxPerHour drops to fit the clicked month.
      const clicked = await probeAndClickMonth(axis)
      expect(clicked, 'found a month label hit region on this axis').toBe(true)
      await expect.poll(async () => (await page.evaluate(() => window.__ganttTest!.zoom())).pxPerHour)
        .toBeLessThan(zBefore.pxPerHour)
    }
  })
})
