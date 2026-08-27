import { expect, test } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'

test.use({ storageState: { cookies: [], origins: [] } })

test('PBS-3206 — Search Pairings excludes GRD pairings without legs', async ({ page }) => {
  test.setTimeout(120_000)

  const login = new PbsLoginPage(page)
  await login.goto()
  await login.login('1131', process.env.PBS_TEST_PASS ?? 'rois')
  await page.waitForURL(/\/dashboard$/, { timeout: 20_000 })

  await page.getByRole('link', { name: 'Bid', exact: true }).click()
  const bidPage = page.getByTestId('bid-page')
  await expect(bidPage).toBeVisible({ timeout: 20_000 })

  const tier3 = page.getByRole('button', { name: 'TIER-03' }).first()
  await tier3.click()
  await expect(tier3).toHaveAttribute('aria-pressed', 'true')
  await expect(bidPage.getByTestId('bid-existing-properties-scroll')).toContainText(
    'Avoid pairings checking check-in more than 06:51',
  )

  await page.getByRole('button', { name: 'SEARCH PAIRINGS' }).click()
  await expect(page).toHaveURL(/\/bid\/pairing\/search/)
  await expect(page.getByTestId('pairing-search-panel')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('pairing-result-card-detail').first()).toBeVisible({ timeout: 30_000 })

  await expect(page.getByText('TB8549', { exact: true })).toHaveCount(0)
  await expect(page.getByText('No legs available.', { exact: true })).toHaveCount(0)
})
