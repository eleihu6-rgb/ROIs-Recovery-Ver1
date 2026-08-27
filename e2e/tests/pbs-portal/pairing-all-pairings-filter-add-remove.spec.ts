/**
 * PBS-3503 — Crew 19 All Pairings result filter add/remove replay.
 *
 * Destructive by design: clears crew 19's Pairing draft first so the flow is
 * repeatable. The test covers the real browser path:
 * login -> Pairing -> ALL PAIRINGS -> result date filter -> add T7 pairing ->
 * remove search criteria -> add again -> Back -> existing Pairing Number row.
 */
import { expect, type Locator, type Page, test } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'
import { BidWorkbenchPage } from '../../pages/pbs-portal/bid-workbench-page'

const TEST_ID = 'PBS-3503'
const EMPLOYEE_ID = '19'
const EMPLOYEE_PASSWORD = process.env.PBS_TEST_PASS ?? 'rois'
const FILTER_FROM_DATE = '2026-06-15'
const FILTER_TO_DATE = '2026-06-20'

const firstVisibleResultCard = (page: Page): Locator =>
  page
    .getByTestId('pairing-search-results-list')
    .locator('article')
    .filter({ has: page.getByRole('button', { name: 'ADD PAIRING' }) })
    .first()

const activeTierButton = (tier: string): string =>
  `ul[aria-label="Tier options"] button[data-active="true"]:has-text("${tier}")`

const pairingExistingRow = (page: Page, pairingNumber: string): Locator =>
  page
    .locator('[data-testid^="pairing-property-row-"]')
    .filter({ hasText: 'Pairing Number' })
    .filter({ hasText: pairingNumber })
    .filter({ has: page.locator(activeTierButton('T7')) })
    .first()

const readResultPairingNumber = async (resultCard: Locator): Promise<string> => {
  const text = (await resultCard.innerText())
    .replace(/\s+/g, ' ')
    .trim()
  const match = text.match(/\b[A-Z]{1,2}\d{4,}[A-Z]?\b/)
  if (!match) {
    throw new Error(`Unable to read pairing number from first result card: ${text}`)
  }
  return match[0]
}

const addFirstVisibleResultToT7 = async (page: Page): Promise<string> => {
  const resultCard = firstVisibleResultCard(page)
  await expect(resultCard).toBeVisible({ timeout: 60_000 })
  const pairingNumber = await readResultPairingNumber(resultCard)

  await resultCard.getByRole('button', { name: 'ADD PAIRING' }).click()
  const tierDialog = page.getByRole('dialog', { name: 'Choose pairing bid tier' })
  await expect(tierDialog).toBeVisible({ timeout: 10_000 })
  await tierDialog.getByRole('button', { name: 'T7', exact: true }).click()
  await tierDialog.getByRole('button', { name: 'ADD PAIRING', exact: true }).click()

  await expect(page.getByText('Pairing property added.')).toBeVisible({ timeout: 20_000 })
  const criteriaBid = page.getByLabel('Bid for search criteria Pairing Number')
  await expect(criteriaBid).toContainText('Award · Pairing Number', { timeout: 20_000 })
  await expect(criteriaBid).toContainText(pairingNumber, { timeout: 20_000 })
  await expect(
    page
      .locator('[data-testid^="pairing-search-criteria-actions-all-pairing-added-"]')
      .first()
      .getByRole('button', { name: 'Remove search criteria Pairing Number' }),
  ).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Toggle search criteria T7 for Pairing Number' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  return pairingNumber
}

test.use({ storageState: { cookies: [], origins: [] } })

test(`${TEST_ID} — crew 19 filters all pairings, adds T7, removes, re-adds, then returns`, async ({ page }) => {
  test.setTimeout(240_000)

  const login = new PbsLoginPage(page)
  const wb = new BidWorkbenchPage(page, { crewId: EMPLOYEE_ID, testId: TEST_ID })

  await login.goto()
  await login.login(EMPLOYEE_ID, EMPLOYEE_PASSWORD)
  await page.waitForURL(/\/dashboard$/, { timeout: 30_000 })

  await wb.goto('pairing')
  await wb.clearExisting('pairing')

  await page.getByRole('button', { name: 'ALL PAIRINGS' }).click()
  await page.waitForURL(/\/pairing\/search$/, { timeout: 30_000 })
  await expect(page.getByTestId('pairing-search-panel')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Showing all pairings available for this bid period.')).toBeVisible({ timeout: 30_000 })

  await page.getByLabel('Filter results from origin date').fill(FILTER_FROM_DATE)
  await page.getByLabel('Filter results to origin date').fill(FILTER_TO_DATE)
  await expect(page.getByRole('status', { name: 'Refreshing pairing search results' })).toBeVisible({ timeout: 10_000 }).catch(() => {})
  await expect(page.getByRole('status', { name: 'Refreshing pairing search results' })).toHaveCount(0, { timeout: 60_000 })
  await expect(page.getByText('No pairings match the current filters.')).toHaveCount(0, { timeout: 60_000 })

  const firstPairingNumber = await addFirstVisibleResultToT7(page)

  await page.getByRole('button', { name: 'Remove search criteria Pairing Number' }).click()
  await expect(page.getByText('Pairing property deleted.')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Remove search criteria Pairing Number' })).toHaveCount(0, {
    timeout: 20_000,
  })
  await expect(page.getByText('Showing all pairings available for this bid period.')).toBeVisible({ timeout: 20_000 })

  const secondPairingNumber = await addFirstVisibleResultToT7(page)
  const expectedPairingNumber = secondPairingNumber || firstPairingNumber

  await page.getByRole('button', { name: 'Back to pairing workbench' }).click()
  await page.waitForURL(/\/pairing$/, { timeout: 30_000 })
  await expect(page.getByTestId('pairing-add-properties-workspace')).toBeVisible({ timeout: 60_000 })
  await expect(pairingExistingRow(page, expectedPairingNumber)).toBeVisible({ timeout: 60_000 })
})
