/**
 * Pane condition chips — the active sort renders as a chip on the roster title bar,
 * the chip strip starts at the crew-list/canvas "virtual line" (left indent), and the
 * chip's × removes the sort. Filter chips are pre-existing; this covers the new sort
 * chips + alignment. Truth via DOM (chips are HTML) + __ganttTest.rosterSort().
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Pane condition chips', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
    await expect.poll(async () => (await page.evaluate(() => window.__ganttTest!.rosterPanel())).length)
      .toBeGreaterThan(0)
  })

  test('Live-1209 — active sort shows an indented chip and × removes it @smoke', async ({ page }) => {
    // No sort yet -> no sort chip.
    await expect(page.getByTestId('pane-sort-chip')).toHaveCount(0)

    // Apply a Seniority sort via the dialog.
    await page.getByTitle('Sort', { exact: true }).first().click()
    const dialog = page.getByTestId('sort-dialog')
    await dialog.getByTestId('sort-available-seniority').dblclick()
    await dialog.getByTestId('sort-order-asc').check()
    await dialog.getByTestId('sort-apply').click()
    await expect(dialog).toBeHidden()

    // A sort chip appears with the column label (SEN) and an ascending arrow.
    const chip = page.getByTestId('pane-sort-chip').first()
    await expect(chip).toContainText('SEN')
    await expect(chip).toContainText('↑')

    // The condition strip is indented to the virtual line (non-zero left padding).
    const padLeft = await page.getByTestId('pane-condition-strip').first().evaluate(
      (el) => parseFloat(getComputedStyle(el).paddingLeft),
    )
    expect(padLeft, 'chip strip indented to the crew-list/canvas boundary').toBeGreaterThan(0)

    // Removing the chip clears the sort.
    await chip.getByRole('button').click()
    await expect(page.getByTestId('pane-sort-chip')).toHaveCount(0)
    expect(await page.evaluate(() => window.__ganttTest!.rosterSort())).toEqual([])
  })
})
