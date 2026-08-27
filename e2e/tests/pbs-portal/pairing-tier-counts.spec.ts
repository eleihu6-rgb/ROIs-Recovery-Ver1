/**
 * PBS-3501 — Pairing existing condition tier toggles preserve row COUNT.
 *
 * Destructive by design: clears the test user's Pairing existing properties so
 * the current Tx summary has a deterministic rule set. Use only in a test DB.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'
import { BidWorkbenchPage, type FixtureProperty } from '../../pages/pbs-portal/bid-workbench-page'

const TEST_ID = 'PBS-3501'
const PBS_USER = process.env.PBS_TIER_TEST_USER ?? process.env.PBS_TEST_USER ?? '247'
const PBS_PASS = process.env.PBS_TIER_TEST_PASS ?? process.env.PBS_TEST_PASS ?? 'rois'

const testProperty: FixtureProperty = {
  tier: 'T4',
  page: 'pairing',
  propertyCode: 103,
  name: 'Pairing Check-In / Check-Out Time',
  action: 'avoid',
  bid: { type: 'pairing-check-time', timeType: 'check_in', operator: '>', value: '15:00', dateScope: null },
}

const normalizeText = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim()

const currentRulesCountResponse = (page: Page, tier: string) =>
  page.waitForResponse((response) => {
    const request = response.request()

    if (
      request.method() !== 'POST'
      || !response.url().includes('/api/pairing-search/current-rules/counts')
      || !response.ok()
    ) {
      return false
    }

    try {
      const body = request.postDataJSON() as { tier?: string }

      return body.tier === tier
    } catch {
      return false
    }
  }, { timeout: 45_000 })

const pairingRow = (page: Page, propertyName: string): Locator =>
  page.locator('[data-testid^="pairing-property-row-"]').filter({ hasText: propertyName }).first()

const tierButton = (row: Locator, propertyName: string, tier: string): Locator =>
  row.getByRole('button', { name: `Toggle existing ${tier} for ${propertyName}` })

const rowCount = (row: Locator): Locator =>
  row.locator('[data-testid^="pairing-pool-count-"]:not([data-testid^="pairing-pool-count-skeleton-"])').first()

const readSummary = async (page: Page): Promise<{ pairings: string; rules: string }> => ({
  pairings: normalizeText(await page.getByTestId('pairing-pool-counts-pairings').textContent()),
  rules: normalizeText(await page.getByTestId('pairing-pool-counts-rules').textContent()),
})

const expectSummary = async (page: Page, summary: { pairings: string; rules: string }): Promise<void> => {
  await expect(page.getByTestId('pairing-pool-counts-rules')).toHaveText(summary.rules)
  await expect(page.getByTestId('pairing-pool-counts-pairings')).toHaveText(summary.pairings)
}

const readVisibleRowCount = async (row: Locator): Promise<string> => {
  const count = rowCount(row)

  await expect(count).toBeVisible({ timeout: 30_000 })
  await expect(count).toContainText('pairings')

  return normalizeText(await count.textContent())
}

const expectRowCount = async (row: Locator, expected: string): Promise<void> => {
  await expect(rowCount(row)).toHaveText(expected)
}

test.use({ storageState: { cookies: [], origins: [] } })

test(`${TEST_ID} — current Tx refreshes while row COUNT stays stable across T4/T5 tier toggles`, async ({ page }) => {
  test.setTimeout(180_000)

  let delayNextT4Count = false

  await page.route('**/api/pairing-search/current-rules/counts', async (route) => {
    const request = route.request()

    if (delayNextT4Count && request.method() === 'POST') {
      try {
        const body = request.postDataJSON() as { tier?: string }

        if (body.tier === 'T4') {
          delayNextT4Count = false
          await new Promise((resolve) => setTimeout(resolve, 800))
        }
      } catch {
        // Continue normally when the request body is not JSON.
      }
    }

    await route.continue()
  })

  const login = new PbsLoginPage(page)
  const wb = new BidWorkbenchPage(page, { crewId: PBS_USER, testId: TEST_ID })

  await login.goto()
  await login.login(PBS_USER, PBS_PASS)
  await page.waitForURL(/\/dashboard$/, { timeout: 30_000 })

  await wb.goto('pairing')
  await wb.clearExisting('pairing')

  const selectT4Counts = currentRulesCountResponse(page, 'T4')
  await page.getByRole('button', { name: 'TIER-04' }).click()
  await selectT4Counts
  await expect(page.getByTestId('pairing-pool-counts-tier')).toHaveText('T4')

  const addRefresh = currentRulesCountResponse(page, 'T4')
  const placeResult = await wb.placeProperty(testProperty)

  expect(placeResult.placed, placeResult.reason).toBe(true)
  await addRefresh

  const row = pairingRow(page, testProperty.name)
  const t4 = tierButton(row, testProperty.name, 'T4')
  const t5 = tierButton(row, testProperty.name, 'T5')

  await expect(row).toBeVisible({ timeout: 30_000 })
  await expect(t4).toHaveAttribute('data-active', 'true')
  await expect(t5).toHaveAttribute('data-active', 'false')
  await expect(page.getByTestId('pairing-pool-counts-tier')).toHaveText('T4')
  await expect(page.getByTestId('pairing-pool-counts-rules')).toHaveText('1 rule')

  const initialSummary = await readSummary(page)
  const initialRowCount = await readVisibleRowCount(row)

  await t4.click()
  await expect(t4).toHaveAttribute('data-active', 'true')
  await expect(t5).toHaveAttribute('data-active', 'false')
  await expectSummary(page, initialSummary)
  await expectRowCount(row, initialRowCount)

  await t5.click()
  await expect(t4).toHaveAttribute('data-active', 'true')
  await expect(t5).toHaveAttribute('data-active', 'true')
  await expectSummary(page, initialSummary)
  await expectRowCount(row, initialRowCount)

  delayNextT4Count = true
  const removeT4Refresh = currentRulesCountResponse(page, 'T4')

  await t4.click()
  await expect(t4).toHaveAttribute('data-active', 'false')
  await expect(t5).toHaveAttribute('data-active', 'true')
  await expect(page.getByTestId('pairing-pool-counts-rules')).toContainText('Refreshing')
  await expect(page.getByTestId('pairing-pool-counts-pairings')).toContainText('Calculating...')
  await expectRowCount(row, initialRowCount)

  await removeT4Refresh
  await expect(page.getByTestId('pairing-pool-counts-rules')).toHaveText('0 rules')
  await expect(page.getByTestId('pairing-pool-counts-pairings')).toHaveText('No active pairing properties')
  await expectRowCount(row, initialRowCount)
})
