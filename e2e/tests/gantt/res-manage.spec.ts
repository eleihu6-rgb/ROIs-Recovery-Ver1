import { test, expect } from '@playwright/test'
import { gotoGantt, seedGanttAuth } from '../../utils/gantt-hook'

/**
 * Live-1405 — RES Manage tab: batch-modify a plan value and verify it reflects.
 *
 * Pre-condition: the YVR acceptance test (Live-1410) should have generated 60 PRAM/PRPM
 * pairings. This test opens the Manage tab, selects the first row, modifies its CA plan
 * to 6, and verifies the updated value appears in the row after apply.
 *
 * If no rows exist in the current period, the test skips gracefully.
 */
test('Live-1405: batch-modify a RES pairing plan value', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)
  await page.getByTestId('module-nav-live').click()

  // Open the RES Planner dialog
  await page.getByTestId('res-pairing-button').click()
  await expect(page.getByTestId('res-planner-dialog')).toBeVisible()

  // Switch to the Manage existing tab
  await page.getByText('Manage existing').click()

  // Wait for the Manage tab content to appear
  await page.waitForTimeout(2000)

  const firstRow = page.getByTestId('res-row-0')
  const hasRows = await firstRow.isVisible().catch(() => false)

  if (!hasRows) {
    // No RES pairings in the current period — skip the modify assertion
    test.skip()
    return
  }

  // Select first row
  await page.getByTestId('res-row-checkbox-0').check()

  // Open modify panel
  await page.getByTestId('res-modify').click()

  // Fill in CA plan value = 6
  await page.getByTestId('res-modify-CA').fill('6')

  // Apply the modification
  await page.getByTestId('res-modify-apply').click()

  // After apply, the row should refresh and show the new value somewhere in the row
  await expect(page.getByTestId('res-row-0')).toContainText('6', { timeout: 10_000 })
})
