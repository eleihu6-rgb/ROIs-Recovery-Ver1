import { test, expect } from '@playwright/test'
import { gotoGantt, seedGanttAuth } from '../../utils/gantt-hook'

/**
 * Live-1406 — Manage existing tab shows a DEFAULT summary (KPI cards) on top,
 * tied to the loaded/filtered rows: total pairings, per-type (AM/PM) counts,
 * crew slots, bases, dates.
 *
 * Read-only: it only opens the Manage tab and loads existing RES pairings (no
 * generate/delete), so it does not churn data. Relies on RES pairings already in the demo DB.
 */
test('Live-1406: Manage tab default KPI summary (total / type / slots / bases / dates)', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)
  await page.getByTestId('module-nav-live').click()

  await page.getByTestId('res-pairing-button').click()
  await page.getByTestId('res-tab-manage').click()

  // default filter is the current month; load existing RES pairings
  await page.getByTestId('manage-filter-load').click()

  // the KPI summary renders on top
  await expect(page.getByTestId('manage-summary')).toBeVisible({ timeout: 15_000 })

  // the aggregate cards are present, and the total shows a number
  await expect(page.getByTestId('manage-summary-total')).toContainText(/\d/)
  await expect(page.getByTestId('manage-summary-slots')).toBeVisible()
  await expect(page.getByTestId('manage-summary-bases')).toBeVisible()
  await expect(page.getByTestId('manage-summary-dates')).toBeVisible()

  // at least one per-type (PRAM/PRPM/CRAM/CRPM) card is shown with a count
  const typeCard = page.locator('[data-testid^="manage-summary-type-"]').first()
  await expect(typeCard).toBeVisible()
  await expect(typeCard).toContainText(/\d/)
})
