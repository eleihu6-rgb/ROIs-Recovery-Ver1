/**
 * Toolbar RP multi-select (RpMultiSelect). Sits alongside the date-range picker on
 * the Live toolbar. Selecting one or more roster periods re-scopes the Gantt window
 * to [min(rp_start) − 7d, max(rp_end) + 7d] via the existing dateRange pipeline.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth, gotoGantt, waitGanttReady, readHook, counts } from '../../utils/gantt-hook'

const dateRange = (page: Page): Promise<{ start: string; end: string }> => readHook(page, 'dateRange')
const visibleRange = async (page: Page): Promise<{ startMs: number; endMs: number }> => {
  const zoom = await readHook<{ pxPerHour: number; scrollX: number; viewportWidth: number }>(page, 'zoom')
  const range = await dateRange(page)
  const startMs = Date.parse(range.start) + (zoom.scrollX / zoom.pxPerHour) * 3_600_000
  return { startMs, endMs: startMs + (zoom.viewportWidth / zoom.pxPerHour) * 3_600_000 }
}

type RosterPeriodShape = {
  id: number
  rosterPeriod: string
  name: string
  rpStart: string
  rpEnd: string
  isCurrent: boolean
}

const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
})

// Windowed initial batch: 2026RP02..2026RP12, 2027RP01, 2027RP02 (ids 2..14),
// current = 2026RP08 (id 8). Earliest loaded rpStart = 2026-02-01.
const WINDOW: RosterPeriodShape[] = Array.from({ length: 13 }, (_, i) => {
  const n = i + 2 // 2..14
  const year = n <= 12 ? 2026 : 2027
  const month = n <= 12 ? n : n - 12
  const ym = `${year}-${String(month).padStart(2, '0')}`
  return {
    id: n,
    rosterPeriod: `${year}RP${String(month).padStart(2, '0')}`,
    name: `${year}-${String(month).padStart(2, '0')}`,
    rpStart: `${ym}-01`,
    rpEnd: `${ym}-28`,
    isCurrent: n === 8, // 2026RP08
  }
})
// First older batch (12), ascending: 2025RP02..2025RP12 + 2026RP01 (nearest to the window).
const OLDER_1: RosterPeriodShape[] = [
  ...Array.from({ length: 11 }, (_, i) => {
    const n = i + 2 // 02,03,...,12
    const ym = `2025-${String(n).padStart(2, '0')}`
    return {
      id: 101 + i,
      rosterPeriod: `2025RP${String(n).padStart(2, '0')}`,
      name: ym,
      rpStart: `${ym}-01`,
      rpEnd: `${ym}-28`,
      isCurrent: false,
    }
  }),
  { id: 1, rosterPeriod: '2026RP01', name: '2026-01', rpStart: '2026-01-01', rpEnd: '2026-01-28', isCurrent: false },
]
// Final older batch (1): 2025RP01 (id 121).
const OLDER_2: RosterPeriodShape[] = [
  { id: 121, rosterPeriod: '2025RP01', name: '2025-01', rpStart: '2025-01-01', rpEnd: '2025-01-28', isCurrent: false },
]

test.describe('Toolbar RP multi-select', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page, 90_000)
  })

  test('defaults to the current RP; adding a second RP widens the window', async ({ page }) => {
    const trigger = page.getByTestId('toolbar-rp-multiselect-trigger')
    await expect(trigger, 'RpMultiSelect is on the Live toolbar').toBeVisible({ timeout: 15_000 })

    // Default: the current RP is pre-selected → the trigger shows its merged ±7d range.
    await expect(page.getByTestId('toolbar-rp-multiselect-range')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid^="toolbar-rp-multiselect-remove-"]'), 'compact trigger has no chips').toHaveCount(0)

    const before = await dateRange(page)
    await trigger.click()
    const options = page.locator('[data-testid^="toolbar-rp-multiselect-opt-"]')
    await expect(options.first()).toBeVisible({ timeout: 15_000 })
    expect(await options.count(), 'windowed RP list has several options').toBeGreaterThan(1)

    // Add a second RP.
    await options.nth(1).click()
    await page.keyboard.press('Escape')

    // The window widens to cover the second RP.
    await expect
      .poll(
        async () => {
          const dr = await dateRange(page)
          return dr.start !== before.start || dr.end !== before.end
        },
        { timeout: 30_000, message: 'window did not widen to cover the 2nd RP' },
      )
      .toBe(true)
  })

  test('re-applies the selected RP zoom after query filters are applied', async ({ page }) => {
    const trigger = page.getByTestId('toolbar-rp-multiselect-trigger')
    await expect(trigger).toBeVisible({ timeout: 15_000 })
    await trigger.click()
    const rp08 = page.locator('[data-testid^="toolbar-rp-multiselect-opt-"]').filter({ hasText: /2026RP08/ })
    await expect(rp08).toBeVisible({ timeout: 15_000 })
    await rp08.click()
    await page.keyboard.press('Escape')

    await expect.poll(async () => (await dateRange(page)).end.slice(0, 10), { timeout: 45_000 })
      .toBe('2026-09-07')
    await expect(page.getByTestId('filter-btn')).toBeEnabled({ timeout: 45_000 })
    await page.getByTestId('filter-btn').click({ force: true })
    const dialog = page.getByTestId('filter-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('filter-tab-crew').click()
    await dialog.getByTestId('filter-crew-division-P').click()
    await dialog.getByTestId('filter-apply').click()

    await expect.poll(async () => {
      const range = await visibleRange(page)
      return [
        new Date(range.startMs).toISOString().slice(0, 10),
        new Date(range.endMs).toISOString().slice(0, 10),
      ].join('..')
    }, { timeout: 45_000 }).toBe('2026-07-01..2026-08-31')
  })

  test('changing the RP shows "RP Date changed" hint without auto-requerying until Apply', async ({ page }) => {
    const trigger = page.getByTestId('toolbar-rp-multiselect-trigger')
    await expect(trigger).toBeVisible({ timeout: 15_000 })

    // Data is already loaded by gotoGantt (default Apply) → no "No data loaded" hint.
    const hint = page.getByTestId('live-empty-state')
    await expect(hint).toHaveCount(0)
    const rosterBefore = (await counts(page)).roster
    expect(rosterBefore).toBeGreaterThan(0)

    // Pick a second RP → the window widens, but the toolbar must NOT re-query.
    await trigger.click()
    const rp09 = page.locator('[data-testid^="toolbar-rp-multiselect-opt-"]').filter({ hasText: /2026RP09/ })
    await expect(rp09).toBeVisible({ timeout: 15_000 })
    await rp09.click()
    await page.keyboard.press('Escape')

    // The inline hint switches to the stale-data message (not "No data loaded").
    await expect(hint).toBeVisible({ timeout: 15_000 })
    await expect(hint).toContainText('RP Date changed — apply filters to pull data')

    // No auto-query ran: roster count is unchanged (Apply is the only pull path).
    expect((await counts(page)).roster).toBe(rosterBefore)

    // Clicking the hint opens the Filter dialog; Apply pulls the new window and clears it.
    await hint.click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()
    await page.getByTestId('filter-apply').click()
    await expect(hint).not.toBeVisible({ timeout: 90_000 })
  })

  test('loads 12 older RPs per click and hides Load more when history is exhausted', async ({ page, request }) => {
    await page.route('**/api/roster-periods*', async (route) => {
      const url = route.request().url()
      // First load-more: store passes before = earliest loaded rpStart = WINDOW[0] = 2026-02-01.
      if (url.includes('before=2026-02-01')) {
        await route.fulfill(ok({ maxSpan: 6, loadMoreCount: 12, hasMore: true, items: OLDER_1 }))
      } else if (url.includes('before=2025-02-01')) {
        // Second load-more: earliest is now 2025RP02; the store dedupes 2025RP03..12 → only 2025RP01 is new.
        await route.fulfill(ok({ maxSpan: 6, loadMoreCount: 12, hasMore: false, items: OLDER_2 }))
      } else {
        await route.fulfill(ok({ maxSpan: 6, loadMoreCount: 12, hasMore: true, items: WINDOW }))
      }
    })
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page, 90_000)

    const trigger = page.getByTestId('toolbar-rp-multiselect-trigger')
    await trigger.click()
    const options = page.locator('[data-testid^="toolbar-rp-multiselect-opt-"]')
    const before = await options.count()
    expect(before).toBe(13)

    await page.getByTestId('toolbar-rp-multiselect-load-more').click()
    await expect(options).toHaveCount(before + 12)
    await expect(page.locator('[data-testid^="toolbar-rp-multiselect-opt-"]').filter({ hasText: '2026RP01' })).toBeVisible()

    await page.getByTestId('toolbar-rp-multiselect-load-more').click()
    await expect(options).toHaveCount(before + 13)
    await expect(page.getByTestId('toolbar-rp-multiselect-load-more')).toHaveCount(0)
  })

  test('auto-fills a contiguous 6-RP window when the span would exceed 6', async ({ page, request }) => {
    await page.route('**/api/roster-periods*', (route) =>
      route.fulfill(ok({ maxSpan: 6, loadMoreCount: 12, hasMore: false, items: WINDOW })),
    )
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page, 90_000)

    const trigger = page.getByTestId('toolbar-rp-multiselect-trigger')
    // Default selection is the current RP (id 8) → trigger shows its merged range.
    await expect(page.getByTestId('toolbar-rp-multiselect-range')).toBeVisible()

    // The dropdown stays open between option clicks (Escape does not close it).
    await trigger.click()
    for (const n of [3, 4, 5, 6, 7]) {
      await page.getByTestId(`toolbar-rp-multiselect-opt-${n}`).click()
    }

    // Click 02 → span 02..08 = 7 > 6 → rebuild to the contiguous window {02..07}.
    await page.getByTestId('toolbar-rp-multiselect-opt-2').click()

    // The merged ±7d range now reflects {02..07}, not {02..08}:
    //   min 2026-02-01 −7d = 2026-01-25; max 2026-07-28 +7d = 2026-08-04.
    await expect(page.getByTestId('toolbar-rp-multiselect-range')).toHaveText('2026-01-25 ~ 2026-08-04')

    // The rebuild auto-filled 05 and dropped 08: options 02..07 checked, 08 unchecked.
    for (const n of [2, 3, 4, 5, 6, 7]) {
      await expect(page.getByTestId(`toolbar-rp-multiselect-opt-${n}`)).toContainText('✓')
    }
    await expect(page.getByTestId('toolbar-rp-multiselect-opt-8')).not.toContainText('✓')
    // No chips in compact mode.
    await expect(page.locator('[data-testid^="toolbar-rp-multiselect-remove-"]')).toHaveCount(0)
  })

  test('shows the merged ±7d date range and the performance hint', async ({ page, request }) => {
    await page.route('**/api/roster-periods*', (route) =>
      route.fulfill(ok({ maxSpan: 6, loadMoreCount: 12, hasMore: false, items: WINDOW })),
    )
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page, 90_000)

    // Default current RP08: [2026-08-01−7d, 2026-08-28+7d] = 2026-07-25 ~ 2026-09-04.
    await expect(page.getByTestId('toolbar-rp-multiselect-range')).toHaveText('2026-07-25 ~ 2026-09-04')
    // Compact trigger shows the range, not per-RP chips.
    await expect(page.getByTestId('toolbar-rp-multiselect-trigger')).not.toContainText('2026RP08')
    // Performance hint in the footer and on the trigger tooltip.
    await page.getByTestId('toolbar-rp-multiselect-trigger').click()
    await expect(page.getByTestId('toolbar-rp-multiselect-trigger')).toHaveAttribute('title', /max span/)
    await expect(page.getByText('Max 6 RPs span (performance)')).toBeVisible()

    // Option rows (RP code + date hint) fit on one line — the dropdown is wide enough.
    const opt8 = await page.getByTestId('toolbar-rp-multiselect-opt-8').boundingBox()
    expect(opt8?.height, 'option row is a single line, not wrapped').toBeLessThan(40)
  })
})
