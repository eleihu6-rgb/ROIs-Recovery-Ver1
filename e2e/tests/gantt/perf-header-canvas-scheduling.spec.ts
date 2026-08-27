/**
 * V4-P06 regression: PaneHeaderCanvas must not schedule a redraw on every
 * unrelated React commit; pane-scoped vertical scroll must still redraw it.
 *
 * The observable bug: header RAF is scheduled before content RAF (PaneHeaderCanvas
 * renders before PaneCanvas in the tree). When dirty=true, both fire; header fires
 * first → markClean() → dirty=false re-runs the header effect → always-true condition
 * reschedules a second RAF → header renders TWICE per dirty cycle.
 * Post-fix: the second re-run sees dirty=false && no scrollY/render change → no RAF.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, renderStats, waitGanttReady } from '../../utils/gantt-hook'

const rosterHeaderRenders = async (page: import('@playwright/test').Page): Promise<number> => {
  const stats = await renderStats(page)
  const header = stats.find((s) => s.paneId.startsWith('roster') && s.paneId.endsWith(':header'))
  return header?.renders ?? 0
}

const rosterContentRenders = async (page: import('@playwright/test').Page): Promise<number> => {
  const stats = await renderStats(page)
  const content = stats.find((s) => s.paneId.startsWith('roster') && !s.paneId.endsWith(':header'))
  return content?.renders ?? 0
}

let dashboard: GanttDashboardPage

test.beforeEach(async ({ page, request }) => {
  await seedGanttAuth(page, request)
  dashboard = new GanttDashboardPage(page)
  await dashboard.goto()
  await waitGanttReady(page)
  await page.waitForTimeout(1000) // let initial render storm settle
})

test('Live-1167 — header canvas does not double-render per dirty cycle (zoom burst)', async ({ page }) => {
  const headerBefore = await rosterHeaderRenders(page)
  const contentBefore = await rosterContentRenders(page)

  // Zoom in 8 times: each zoom marks dirty → content renders → markClean → header effect fires.
  // Pre-fix: header effect fires with always-true condition → extra RAF each cycle → ~2x renders.
  // Post-fix: second header effect re-run sees dirty=false + no renderChange → no RAF.
  for (let i = 0; i < 8; i++) {
    await dashboard.zoomIn()
    await page.waitForTimeout(80) // let RAF settle between zooms
  }

  await page.waitForTimeout(400) // let final RAF flush

  const headerAfter = await rosterHeaderRenders(page)
  const contentAfter = await rosterContentRenders(page)

  const headerDelta = headerAfter - headerBefore
  const contentDelta = contentAfter - contentBefore

  // Sanity: zooming must have triggered content renders.
  expect(contentDelta, 'content must have rendered during zoom').toBeGreaterThan(0)

  // Pre-fix: header renders roughly 2× content (double-render per dirty cycle).
  // Post-fix: header renders at most equal to content + 2 tolerance.
  // 1.5×: pre-fix is ~2.0×; 1.5 splits the difference to catch partial regressions
  // while absorbing RAF jitter; +2 absorbs boundary renders at the start/end of the burst.
  expect(headerDelta, `header (${headerDelta}) must not exceed content (${contentDelta}) × 1.5`).toBeLessThanOrEqual(
    Math.ceil(contentDelta * 1.5) + 2,
  )
})

test('Live-1168 — header still redraws on its own pane vertical scroll', async ({ page }) => {
  const before = await rosterHeaderRenders(page)
  const box = await dashboard.rosterCanvas.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.wheel(0, 300)
  await expect.poll(() => rosterHeaderRenders(page)).toBeGreaterThan(before)
})
