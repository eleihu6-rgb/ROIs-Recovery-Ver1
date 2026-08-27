/**
 * Date-range picker constraints + fit-on-change behavior (user request).
 *
 * Req 1 — the end date can never be earlier than the start date.
 * Req 3 — the user-selectable window is capped at 3 calendar months.
 *   Both are encoded as native <input type="date"> min/max bounds AND enforced
 *   in the change handlers (typed/filled values that bypass the picker UI are
 *   rejected, so the store never holds an invalid range).
 * Req 2 — when the user CHANGES the date range on an already-open gantt, the whole
 *   newly-selected period is fitted to the viewport (left edge = start, right edge =
 *   end). The FIRST open is deliberately left untouched.
 *
 * Regression value: before the fix, the picker had no min/max and changing the
 * date kept the previous zoom (only ~the first week visible), so Req 2's
 * "pxPerHour collapses to zoomMin, scrollX === 0" assertion would have failed.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth, gotoGantt, waitGanttReady, readHook } from '../../utils/gantt-hook'

/** Mirror of the app's shiftYmdMonths (date-range-picker.tsx): N-month calendar shift, day-clamped. */
const shiftYmdMonths = (ymd: string, months: number): string => {
  const [y, m, d] = ymd.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day)).toISOString().slice(0, 10)
}

/** A calendar day before the given YYYY-MM-DD (for the "end before start" rejection probe). */
const dayBefore = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

const dateStore = (page: Page): Promise<{ start: string; end: string }> =>
  readHook<{ start: string; end: string }>(page, 'dateRange')

const zoomFull = (
  page: Page,
): Promise<{ pxPerHour: number; zoomMin: number; zoomMax: number; scrollX: number; viewportWidth: number }> =>
  readHook(page, 'zoom')

test.describe('Live gantt — date range constraints & fit-on-change', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page, 90_000)
  })

  test('Live-1029 — picker encodes end≥start and a 3-month max window as native min/max bounds', async ({ page }) => {
    const from = page.getByTestId('date-range-from')
    const to = page.getByTestId('date-range-to')
    const startVal = await from.inputValue()
    const endVal = await to.inputValue()
    expect(startVal, 'start value is a calendar date').toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(endVal, 'end value is a calendar date').toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // Req 1: end can't precede start; start can't exceed end.
    expect(await to.getAttribute('min'), 'end min = start date').toBe(startVal)
    expect(await from.getAttribute('max'), 'start max = end date').toBe(endVal)

    // Req 3: 3-month max window — outer bound on each input.
    expect(await to.getAttribute('max'), 'end max = start + 3 months').toBe(shiftYmdMonths(startVal, 3))
    expect(await from.getAttribute('min'), 'start min = end − 3 months').toBe(shiftYmdMonths(endVal, -3))
  })

  test('Live-1030 — rejects end-before-start and >3-month windows in the handler; accepts a valid change', async ({ page }) => {
    const to = page.getByTestId('date-range-to')
    const startVal = await page.getByTestId('date-range-from').inputValue()
    const before = await dateStore(page)

    // Req 1: an end before the start day is rejected — store end is unchanged.
    await to.fill(dayBefore(startVal))
    expect((await dateStore(page)).end, 'end-before-start rejected').toBe(before.end)

    // Req 3: a 4-month window exceeds the cap and is rejected — store end unchanged.
    await to.fill(shiftYmdMonths(startVal, 4))
    expect((await dateStore(page)).end, '>3-month window rejected').toBe(before.end)

    // Positive control: a valid 2-month end is accepted — store end actually moves.
    await to.fill(shiftYmdMonths(startVal, 2))
    await expect
      .poll(async () => (await dateStore(page)).end, { timeout: 10_000, message: 'valid end change was not applied' })
      .not.toBe(before.end)
  })

  test('Live-1031 — first open displays the first month fully (left=1st, ~one month across)', async ({ page }) => {
    const z = await zoomFull(page)
    expect(z.viewportWidth, 'timeline width was measured').toBeGreaterThan(0)
    // Left edge anchored to the range start (the 1st of the first month).
    expect(z.scrollX, 'scrolled to the start of the range').toBe(0)

    // Exactly one calendar month spans the viewport (28–31 days), not the old
    // ~6-day default zoom and not the whole 2-month range.
    const daysAcross = z.viewportWidth / z.pxPerHour / 24
    expect(daysAcross, 'about one month fills the viewport').toBeGreaterThanOrEqual(27.5)
    expect(daysAcross, 'about one month fills the viewport').toBeLessThanOrEqual(31.5)

    // The data range still spans well beyond the one shown month (≈2 months),
    // so month 2 lives off-screen to the right (scroll to reach it).
    const { start, end } = await dateStore(page)
    const rangeDays = (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000
    expect(rangeDays, 'range holds more than the single shown month').toBeGreaterThan(daysAcross + 20)
  })

  test('Live-1032 — changing the date range fits the whole new period to the viewport (left=start, right=end)', async ({ page }) => {
    test.setTimeout(150_000)

    // First-open behavior is untouched: the default zoom is NOT collapsed to fit
    // (pxPerHour sits well above zoomMin, so the whole range is NOT forced to fit).
    const z0 = await zoomFull(page)
    expect(z0.pxPerHour, 'first open is not auto-fitted to the full range').toBeGreaterThan(z0.zoomMin * 1.5)

    // User widens the range by one month back via the start picker.
    const startVal = await page.getByTestId('date-range-from').inputValue()
    await page.getByTestId('date-range-from').fill(shiftYmdMonths(startVal, -1))

    // Fit applied: the full range fills the viewport, so pxPerHour collapses to
    // zoomMin ("full range fits") and horizontal scroll resets to the start.
    await expect
      .poll(
        async () => {
          const z = await zoomFull(page)
          return Math.abs(z.pxPerHour - z.zoomMin) < 0.01 && z.scrollX === 0
        },
        { timeout: 90_000, message: 'date change did not fit the full period to the viewport' },
      )
      .toBe(true)

    // Regression guard: before the fix pxPerHour stayed at the prior (larger) zoom
    // and only the first days were visible; fitting collapses it well below that.
    const zf = await zoomFull(page)
    expect(zf.pxPerHour, 'zoom collapsed to fit the full period').toBeLessThan(z0.pxPerHour)
    expect(zf.scrollX, 'scroll reset to the start date').toBe(0)

    // The WHOLE range fits with no clipped tail days (the "only 28 of 30 days"
    // bug): content width = pxPerHour × range-hours must not overflow the measured
    // viewport. With scrollX = 0 the end date's X = content width, so end ≤ right edge.
    const { start, end } = await dateStore(page)
    const totalHours = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000
    const contentWidth = zf.pxPerHour * totalHours
    expect(zf.viewportWidth, 'timeline width was measured').toBeGreaterThan(0)
    // No overflow (≤ ~1h slack) → the last day is on-screen, not clipped.
    expect(contentWidth, 'full range fits without clipping the tail days')
      .toBeLessThanOrEqual(zf.viewportWidth + zf.pxPerHour)
    // And it genuinely fills the viewport (not zoomed too far out).
    expect(contentWidth, 'range fills the viewport').toBeGreaterThan(zf.viewportWidth * 0.9)
  })
})
