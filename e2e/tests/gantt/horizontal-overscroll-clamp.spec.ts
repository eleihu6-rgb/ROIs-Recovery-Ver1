/**
 * Regression: horizontal scroll must not overscroll past the content's right edge.
 *
 * Bug (reported): after the date range ends on a given day (e.g. Jul 7), dragging /
 * wheel-scrolling the timeline horizontally pushed the viewport PAST the last day.
 * Past rangeEnd the body still paints its full-width horizontal row separators ("grid
 * prints"), but the date header has no day labels and the vertical day columns stop —
 * so the right side showed "no timeline date" over an empty grid.
 *
 * Root cause: every horizontal-scroll mutation in gantt-view-store clamped only the
 * lower bound (Math.max(0, …)); the wheel/trackpad path had no upper clamp, so scrollX
 * could exceed maxScrollX = contentWidth - viewportWidth.
 *
 * Invariant under test: after any horizontal scroll, the right edge of the viewport
 * never passes rangeEnd, i.e. scrollX <= maxScrollX. This would FAIL before the fix.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

type ZoomProbe = { pxPerHour: number; scrollX: number; viewportWidth: number }
type DateRangeProbe = { start: string; end: string }

let dashboard: GanttDashboardPage

/** maxScrollX as the store computes it: content width (exact hours × pxPerHour) − viewport width. */
const computeMaxScrollX = async (page: import('@playwright/test').Page): Promise<{ max: number; z: ZoomProbe }> => {
  const z = await readHook<ZoomProbe>(page, 'zoom')
  const dr = await readHook<DateRangeProbe>(page, 'dateRange')
  const contentHours = (new Date(dr.end).getTime() - new Date(dr.start).getTime()) / 3_600_000
  const max = Math.max(0, contentHours * z.pxPerHour - z.viewportWidth)
  return { max, z }
}

test.beforeEach(async ({ page, request }) => {
  await seedGanttAuth(page, request)
  dashboard = new GanttDashboardPage(page)
  await dashboard.goto()
  await page.waitForTimeout(300) // let first-month fit + initial renders settle
})

test('Live-1086 — programmatic jump past the end is clamped to the content end', async ({ page }) => {
  const { max } = await computeMaxScrollX(page)
  expect(max, 'precondition: content must be wider than the viewport').toBeGreaterThan(1000)

  // Jump far past the last day (track-click / goto path).
  await page.evaluate((x) => { (window.__ganttTest as unknown as { setScrollX: (n: number) => void }).setScrollX(x) }, max + 100_000)
  await page.waitForTimeout(100)

  const after = await readHook<ZoomProbe>(page, 'zoom')
  // Pre-fix: setScrollX only did Math.max(0, x) → scrollX = max + 100000 (right side empty).
  expect(after.scrollX).toBeLessThanOrEqual(max + 1)
  // And it should land exactly at the end, not snap back to 0.
  expect(after.scrollX).toBeGreaterThan(max - 2)
})

test('Live-1087 — horizontal wheel burst cannot scroll past the content end', async ({ page }) => {
  const { max } = await computeMaxScrollX(page)
  expect(max, 'precondition: content must be wider than the viewport').toBeGreaterThan(1000)

  const box = await dashboard.rosterCanvas.boundingBox()
  const cx = box!.x + box!.width / 2
  const cy = box!.y + box!.height / 2
  await page.mouse.move(cx, cy)

  // Fire a wheel burst whose total deltaX far exceeds maxScrollX, so an unclamped
  // store would sail past the last day. Synchronous dispatch = one RAF flush sees all.
  const totalDelta = max + 50_000
  const perEvent = 400
  const events = Math.ceil(totalDelta / perEvent)
  await page.evaluate(({ x, y, n, dx }) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    if (!el) throw new Error('No element at centre of roster canvas')
    for (let i = 0; i < n; i++) {
      el.dispatchEvent(new WheelEvent('wheel', {
        deltaX: dx, deltaY: 0, deltaMode: 0,
        bubbles: true, cancelable: true, clientX: x, clientY: y,
      }))
    }
  }, { x: cx, y: cy, n: events, dx: perEvent })

  await page.waitForTimeout(400) // final RAF flush
  const after = await readHook<ZoomProbe>(page, 'zoom')
  // Pre-fix: flushScroll did Math.max(0, scrollX + Σdx) with no upper bound → far past max.
  expect(after.scrollX).toBeLessThanOrEqual(max + 1)
})

test('Live-1088 — shrinking the date range re-clamps a now-out-of-range scroll position', async ({ page }) => {
  const { max } = await computeMaxScrollX(page)
  expect(max).toBeGreaterThan(1000)

  // Scroll to the current end.
  await page.evaluate((x) => { (window.__ganttTest as unknown as { setScrollX: (n: number) => void }).setScrollX(x) }, max)
  await page.waitForTimeout(100)

  // Zoom OUT shrinks content width (smaller pxPerHour) → maxScrollX drops; the stored
  // scrollX is now past the new end and must be re-clamped so the right side stays filled.
  await dashboard.zoomOut()
  await page.waitForTimeout(200)

  const { max: newMax } = await computeMaxScrollX(page)
  const after = await readHook<ZoomProbe>(page, 'zoom')
  expect(after.scrollX).toBeLessThanOrEqual(newMax + 1)
})
