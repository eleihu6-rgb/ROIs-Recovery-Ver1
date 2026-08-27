/**
 * Data Tab — Crew Expiry Filter UI tests.
 *
 * Verifies that the expiry filter bar on the Crew Master page renders correctly,
 * that the default mode is "current", and that selecting "expiring_in_days" shows
 * the days input while switching back hides it.
 *
 * §No-Illusion: tests verify concrete UI state changes, not just visibility.
 * Actual row-count assertions are intentionally omitted because remote DB crew
 * expiry dates cannot be guaranteed in a test environment.
 *
 * Note: data-filter-expiry-mode is a Radix UI Select (not a native <select>).
 * Interaction: click trigger → wait for option → click option by role/text.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Data Tab — Crew Expiry Filter', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.getByTestId('module-nav-data').click()
    await page.getByTestId('data-view').waitFor({ state: 'visible', timeout: 10_000 })

    // Navigate to Crew Master (crew root defaults to expanded)
    await page.getByTestId('data-tree-item-crew.master').click()
    await page.getByTestId('data-section-crew').waitFor({ state: 'visible', timeout: 10_000 })
  })

  test('Data-5001 — Crew Master filter bar shows expiry controls', async ({ page }) => {
    // Both filter trigger buttons must be present
    await expect(page.getByTestId('data-filter-expiry-scope')).toBeVisible()
    await expect(page.getByTestId('data-filter-expiry-mode')).toBeVisible()

    // Days input is NOT attached when mode is not 'expiring_in_days'
    const modeText = await page.getByTestId('data-filter-expiry-mode').textContent()
    if (!modeText?.includes('Expiring in Days')) {
      await expect(page.getByTestId('data-filter-expiry-days')).not.toBeAttached()
    }

    // Switch mode to 'Expiring in Days' via Radix Select interaction
    await page.getByTestId('data-filter-expiry-mode').click()
    await page.getByRole('option', { name: 'Expiring in Days' }).click()
    // Days input must now appear
    await expect(page.getByTestId('data-filter-expiry-days')).toBeVisible()
  })

  test('Data-5002 — Expiry mode defaults to current', async ({ page }) => {
    const modeTrigger = page.getByTestId('data-filter-expiry-mode')
    await expect(modeTrigger).toBeVisible()
    // The Radix Select trigger shows the selected option label — default is "Current"
    await expect(modeTrigger).toContainText('Current')
  })

  test('Data-5003 — Selecting expiring_in_days mode shows days input; switching back hides it', async ({ page }) => {
    // Step 1: confirm default mode shows "Current" and days input is absent
    await expect(page.getByTestId('data-filter-expiry-mode')).toContainText('Current')
    await expect(page.getByTestId('data-filter-expiry-days')).not.toBeAttached()

    // Step 2: switch to "Expiring in Days" via Radix Select
    await page.getByTestId('data-filter-expiry-mode').click()
    await page.getByRole('option', { name: 'Expiring in Days' }).click()
    // Days input must now be visible
    await expect(page.getByTestId('data-filter-expiry-days')).toBeVisible()
    // Trigger must reflect the new selection
    await expect(page.getByTestId('data-filter-expiry-mode')).toContainText('Expiring in Days')

    // Step 3: switch back to "Current" — days input must disappear
    await page.getByTestId('data-filter-expiry-mode').click()
    await page.getByRole('option', { name: 'Current' }).click()
    await expect(page.getByTestId('data-filter-expiry-days')).not.toBeAttached()
    await expect(page.getByTestId('data-filter-expiry-mode')).toContainText('Current')
  })
})
