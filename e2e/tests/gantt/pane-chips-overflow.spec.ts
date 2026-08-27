/**
 * F54-P06 — condition-strip chip overflow.
 *
 * The strip renders chips on a single non-wrapping line inside the 30px band; chips
 * that don't fit are clipped and collapsed into a "+N" button. Clicking it opens a
 * popover listing ALL chips, where every chip stays removable (the spec's stated risk
 * is losing access to clipped filters — this proves access is preserved).
 *
 * Narrow viewport on purpose so ~7 chips overflow the chip row.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.use({ viewport: { width: 760, height: 720 } })

const MANY_FILTERS = { bases: ['YVR', 'YEG', 'YYZ', 'YOW', 'YUL'], ranks: ['CA', 'FO'] }
const TOTAL = MANY_FILTERS.bases.length + MANY_FILTERS.ranks.length // 7 chips

test.describe('F54-P06 chip overflow', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
  })

  test('Live-1142 — overflowing chips collapse into +N; popover keeps every chip removable @smoke', async ({ page }) => {
    const rosterPane = dashboard.rosterPane
    const strip = rosterPane.getByTestId('pane-condition-strip').first()

    // Apply 7 filter values through the real pipeline.
    await page.evaluate((f) => window.__ganttTest!.applyCrewFilter(f), MANY_FILTERS)
    await expect
      .poll(async () => (await page.evaluate(() => window.__ganttTest!.activeCrewFilter()))?.bases?.length ?? 0)
      .toBe(MANY_FILTERS.bases.length)

    // The strip stays a single 30px band (no second wrapped row pushing content)…
    const stripBox = (await strip.boundingBox())!
    expect(Math.round(stripBox.height)).toBe(30)

    // …and the chips that don't fit are summarized in a "+N" button.
    const overflowBtn = strip.getByTestId('chip-overflow-button')
    await expect(overflowBtn).toBeVisible()
    await expect(overflowBtn).toHaveText(/^\+\d+$/)
    const hiddenN = parseInt((await overflowBtn.innerText()).slice(1), 10)
    expect(hiddenN).toBeGreaterThan(0)
    expect(hiddenN).toBeLessThan(TOTAL)

    // Open the popover: it lists ALL chips (clipped ones included).
    await overflowBtn.click()
    const popover = page.getByTestId('chip-overflow-popover')
    await expect(popover).toBeVisible()
    await expect(popover.getByTestId('pane-filter-chip')).toHaveCount(TOTAL)
    // The LAST applied value (certainly clipped in the row) is present and visible.
    await expect(popover.getByTestId('pane-filter-chip').filter({ hasText: 'FO' })).toBeVisible()

    // Removing a chip FROM THE POPOVER works end-to-end.
    await popover.getByTestId('pane-filter-chip').filter({ hasText: 'FO' }).getByRole('button').click()
    await expect
      .poll(async () => (await page.evaluate(() => window.__ganttTest!.activeCrewFilter()))?.ranks ?? [])
      .toEqual(['CA'])
    await expect(popover.getByTestId('pane-filter-chip')).toHaveCount(TOTAL - 1)

    // Outside click closes the popover.
    await page.mouse.click(stripBox.x + 10, stripBox.y + stripBox.height + 200)
    await expect(popover).toBeHidden()
  })
})
