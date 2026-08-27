import { expect, test } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('PBS Bid summary unification (real backend)', () => {
  test('PBS-BID-906 — keeps Days Off, Pairing, Roster and Search Criteria readable', async ({ page }) => {
    test.setTimeout(120_000)

    const login = new PbsLoginPage(page)
    await login.goto()
    await login.login('906', process.env.PBS_TEST_PASS ?? 'rois')
    await page.waitForURL(/\/dashboard$/, { timeout: 20_000 })

    await page.getByRole('link', { name: 'Bid', exact: true }).click()
    const bidPage = page.getByTestId('bid-page')
    await expect(bidPage).toBeVisible({ timeout: 20_000 })

    const selectTier = async (tier: number) => {
      const button = page.getByRole('button', {
        name: `TIER-${String(tier).padStart(2, '0')}`,
      }).first()
      await button.click()
      await expect(button).toHaveAttribute('aria-pressed', 'true')
      await expect(bidPage.getByTestId('bid-existing-tier-filter-label')).toContainText(`T${tier} only`)
    }

    await expect(bidPage.getByTestId('bid-existing-properties-scroll')).toContainText('High credit window')

    await selectTier(2)
    const preferOffSummary = bidPage.getByLabel('Prefer Off bid summary')
    await expect(preferOffSummary).toContainText('Prefer off on 15 selected dates')
    await expect(preferOffSummary).toContainText('+12 more')
    await preferOffSummary.getByRole('button', { name: 'Show all 15 selected' }).click()
    await expect(preferOffSummary.getByRole('button', { name: 'Show less' })).toBeVisible()
    await preferOffSummary.getByRole('button', { name: 'Show less' }).click()

    await selectTier(3)
    const tier3Existing = bidPage.getByTestId('bid-existing-properties-scroll')
    await expect(tier3Existing).toContainText('Award pairings V4507 ×13')
    await expect(tier3Existing).not.toContainText('V4507, V4507')

    await page.getByRole('button', { name: 'SEARCH PAIRINGS' }).click()
    await expect(page).toHaveURL(/\/bid\/pairing\/search/)
    await expect(page.getByTitle(
      'Pairing Preference: Award pairings V4507 ×13',
    )).toBeVisible()
    await page.getByRole('button', { name: 'Back to pairing workbench' }).click()
    await expect(bidPage).toBeVisible()

    await selectTier(4)
    await expect(bidPage.getByTestId('bid-existing-properties-scroll')).toContainText('Award pairings V4505 ×17')

    await selectTier(5)
    await expect(bidPage.getByTestId('bid-existing-properties-scroll')).toContainText('Avoid pairings with a redeye leg')

    await selectTier(6)
    await expect(bidPage.getByTestId('bid-existing-properties-scroll')).toContainText(
      'Avoid pairings with any duty having more than 2 flying legs',
    )

    await selectTier(7)
    const tier7Existing = bidPage.getByTestId('bid-existing-properties-scroll')
    await expect(tier7Existing).toContainText('Avoid pairings landing at 10 selected airports')

    const allSummaryText = (await bidPage.getByTestId('tier-summary-readable-text').allTextContents()).join(' ')
    expect(allSummaryText).not.toMatch(/\{"type"|\[object Object\]|"pairingIds"|"pairingLabels"/)
  })
})
