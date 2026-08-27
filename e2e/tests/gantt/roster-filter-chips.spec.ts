/**
 * Roster condition chips for the GLOBAL crew filter (base/rank/fleet/division applied
 * via the Filter dialog). Regression for the bug where applying base+rank produced NO
 * chips: chips were read from crew-query sessions (whose filters are always {}) instead
 * of crew-store.activeGlobalFilter. Truth via DOM chips + __ganttTest.activeCrewFilter().
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Roster global-filter chips', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
    await expect.poll(async () => (await page.evaluate(() => window.__ganttTest!.rosterPanel())).length)
      .toBeGreaterThan(0)
  })

  test('Live-1213 — applying base + rank shows a chip per value; × removes it @smoke', async ({ page }) => {
    // No global filter yet -> no chips.
    expect(await page.evaluate(() => window.__ganttTest!.activeCrewFilter())).toBeNull()
    await expect(page.getByTestId('pane-filter-chip')).toHaveCount(0)

    // Apply base=YVR + rank=CA through the real apply pipeline (filter-store -> applyGanttFilters).
    await page.evaluate(() => window.__ganttTest!.applyCrewFilter({ bases: ['YVR'], ranks: ['CA'] }))

    // The applied global filter is recorded in crew-store.
    await expect
      .poll(async () => (await page.evaluate(() => window.__ganttTest!.activeCrewFilter()))?.bases?.[0])
      .toBe('YVR')

    // One chip per filter value appears on the roster title bar.
    await expect(page.getByTestId('pane-filter-chip').filter({ hasText: 'YVR' }).first()).toBeVisible()
    await expect(page.getByTestId('pane-filter-chip').filter({ hasText: 'CA' }).first()).toBeVisible()

    // Remove the YVR (base) chip -> base dropped from the applied filter, chip gone, rank kept.
    await page.getByTestId('pane-filter-chip').filter({ hasText: 'YVR' }).first().getByRole('button').click()
    await expect
      .poll(async () => (await page.evaluate(() => window.__ganttTest!.activeCrewFilter()))?.bases?.length ?? 0)
      .toBe(0)
    await expect(page.getByTestId('pane-filter-chip').filter({ hasText: 'YVR' })).toHaveCount(0)
    await expect(page.getByTestId('pane-filter-chip').filter({ hasText: 'CA' }).first()).toBeVisible()
  })
})
