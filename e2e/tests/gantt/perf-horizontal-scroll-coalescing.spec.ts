/**
 * V4-P01 regression: a burst of horizontal wheel events must coalesce into
 * ~1 store write per frame, with no lost scroll distance.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, waitGanttReady } from '../../utils/gantt-hook'

type ZoomProbe = { pxPerHour: number; scrollX: number; dirty: boolean; viewportWidth: number }
type DateRangeProbe = { start: string; end: string }

let dashboard: GanttDashboardPage

test.beforeEach(async ({ page, request }) => {
  await seedGanttAuth(page, request)
  dashboard = new GanttDashboardPage(page)
  await dashboard.goto()
  await waitGanttReady(page)
})

test('Live-1169 — 40-event horizontal wheel burst → coalesced store writes, exact distance', async ({ page }) => {
  const box = await dashboard.rosterCanvas.boundingBox()
  const cx = box!.x + box!.width / 2
  const cy = box!.y + box!.height / 2
  await page.mouse.move(cx, cy)
  await page.waitForTimeout(300) // let initial renders settle

  const zoomBefore = await readHook<ZoomProbe>(page, 'zoom')
  const writesBefore = await readHook<number>(page, 'viewStoreWrites')

  // Keep the whole 40-event burst INSIDE the content's right edge — horizontal scroll is
  // now clamped to maxScrollX (content end), so a per-event delta that overran the last
  // day would clamp and lose distance. Size deltaX from the live geometry so the burst
  // exercises coalescing (40 events) while landing well short of the clamp.
  const dr = await readHook<DateRangeProbe>(page, 'dateRange')
  const contentHours = (new Date(dr.end).getTime() - new Date(dr.start).getTime()) / 3_600_000
  const maxScrollX = Math.max(0, contentHours * zoomBefore.pxPerHour - zoomBefore.viewportWidth)
  const EVENTS = 40
  const perEvent = Math.max(1, Math.floor((maxScrollX - zoomBefore.scrollX) * 0.7 / EVENTS))
  expect(perEvent, 'precondition: room to scroll within the content').toBeGreaterThan(2)

  // Fire 40 WheelEvents synchronously in the browser (CDP mouse.wheel serializes
  // each event through a full round-trip, giving the RAF time to fire between events
  // and preventing coalescing). Synchronous dispatch ensures the RAF sees all deltas
  // in one frame — matching real high-frequency user input.
  await page.evaluate(({ x, y, n, dx }: { x: number; y: number; n: number; dx: number }) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    if (!el) throw new Error('No element at centre of roster canvas')
    for (let i = 0; i < n; i++) {
      el.dispatchEvent(new WheelEvent('wheel', {
        deltaX: dx, deltaY: 0, deltaMode: 0,
        bubbles: true, cancelable: true,
        clientX: x, clientY: y,
      }))
    }
  }, { x: cx, y: cy, n: EVENTS, dx: perEvent })

  await page.waitForTimeout(400)    // final RAF flush
  const zoomAfter = await readHook<ZoomProbe>(page, 'zoom')
  const writesAfter = await readHook<number>(page, 'viewStoreWrites')

  // Functional parity: no lost deltas (burst stays within the clamp).
  expect(zoomAfter.scrollX - zoomBefore.scrollX).toBe(EVENTS * perEvent)
  // Coalescing: pre-fix this is ≥40 (one write per event).
  expect(writesAfter - writesBefore).toBeLessThan(10)
  expect(writesAfter - writesBefore).toBeGreaterThan(0)
})

test('Live-1170 — zoom after a scroll burst lands on a consistent position (pending input cancelled)', async ({ page }) => {
  const box = await dashboard.rosterCanvas.boundingBox()
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
