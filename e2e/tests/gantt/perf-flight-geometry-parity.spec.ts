/**
 * V4-P03/P04 regression: flight geometry must stay pixel-identical after the
 * msToX conversion; cross-day detection must stay correct after caching.
 *
 * This is a parity PIN: it must pass BOTH before and after the renderer change.
 * The test asserts that clicking a flight block at the position computed by the
 * same pure-arithmetic msToX formula (as used by the renderer after V4-P03)
 * selects the flight — proving the geometry is correct either way.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, waitGanttReady, addFlightPane } from '../../utils/gantt-hook'

let dashboard: GanttDashboardPage

test.beforeEach(async ({ page, request }) => {
  await seedGanttAuth(page, request)
  dashboard = new GanttDashboardPage(page)
  await dashboard.goto()
  await waitGanttReady(page)
  await addFlightPane(page)
})

test('Live-1165 — cross-day detection: UTC, base-timezone, and DST boundary', async ({ page }) => {
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

test('Live-1166 — computed-position click selects the flight (geometry parity pin)', async ({ page }) => {
  type Probe = {
    id: number
    schDepDtUtc: string
    rowIndex: number
    rowCenterY: number
    scrollX: number
    pxPerHour: number
    rangeStartIso: string
  }

  // Read probe from the test hook (real store data — no hardcoded values)
  const probe = await readHook<Probe | null>(page, 'flightProbe')
  expect(probe, 'a visible flight exists in the flight pane').not.toBeNull()

  // Recompute x using the same pure arithmetic as msToX in gantt-utils.ts:
  //   msToX(ms, rangeStartMs, pxPerHour) = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * pxPerHour
  // This is pixel-identical to timeToX's UTC branch (which used date-fns differenceInMinutes).
  const iso = probe!.schDepDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z')
  const rangeStartMs = Date.parse(probe!.rangeStartIso)
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe!.pxPerHour - probe!.scrollX

  // Click slightly inside the flight block (x+5 to avoid landing on the block edge)
  const flightCanvas = page.getByTestId('flight-canvas')
  await flightCanvas.click({ position: { x: x + 5, y: probe!.rowCenterY } })

  // Verify selection via test hook (uses the same selectedTaskIds set that the renderer reads)
  const selected = await page.evaluate(
    (id) =>
      (
        window as unknown as { __ganttTest: { isFlightSelected: (i: number) => boolean } }
      ).__ganttTest.isFlightSelected(id),
    probe!.id,
  )
  expect(selected, `flight id=${probe!.id} should be selected after click`).toBe(true)
})
