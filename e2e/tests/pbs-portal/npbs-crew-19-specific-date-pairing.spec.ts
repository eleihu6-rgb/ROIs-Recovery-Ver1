/**
 * PBS-3502 — Employee 19 June Current Bid, Pairing Number specific-date replay.
 *
 * Destructive by design: clears Employee 19's Days Off and Pairing draft before
 * replaying the June Current Bid through the real portal UI. This protects the
 * Pairing Number occurrence path: right-side Specific Date runs and left tier
 * heatmap blue pairing blocks must use the same stable pairing ids.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'
import { BidWorkbenchPage, type FixtureProperty } from '../../pages/pbs-portal/bid-workbench-page'

const TEST_ID = 'PBS-3502'
const EMPLOYEE_ID = '19'
const EMPLOYEE_PASSWORD = process.env.PBS_TEST_PASS ?? 'rois'

const preferOffDates = [
  'Jun 1, 2026',
  'Jun 3, 2026',
  'Jun 5, 2026',
  'Jun 7, 2026',
  'Jun 8, 2026',
  'Jun 10, 2026',
  'Jun 12, 2026',
  'Jun 14, 2026',
  'Jun 15, 2026',
  'Jun 17, 2026',
  'Jun 19, 2026',
  'Jun 20, 2026',
  'Jun 21, 2026',
  'Jun 22, 2026',
  'Jun 23, 2026',
  'Jun 24, 2026',
  'Jun 25, 2026',
  'Jun 26, 2026',
]

const airportCodes = [
  'CUN',
  'FLL',
  'KIN',
  'MEX',
  'YHZ',
  'YKF',
  'YQB',
  'YQM',
  'YQT',
  'YSJ',
  'YVR',
  'YWG',
  'YXX',
  'YYC',
  'YYG',
  'YYJ',
  'YYT',
]

type PairingRunCase = {
  tier: 'T3' | 'T4' | 'T5'
  pairingNumber: string
  sourceDates: string[]
  isoDates: string[]
}

const pairingRunCases: PairingRunCase[] = [
  {
    tier: 'T3',
    pairingNumber: 'T4520',
    sourceDates: ['Jun 2, 2026', 'Jun 6, 2026', 'Jun 11, 2026', 'Jun 13, 2026', 'Jun 16, 2026', 'Jun 18, 2026'],
    isoDates: ['2026-06-02', '2026-06-06', '2026-06-11', '2026-06-13', '2026-06-16', '2026-06-18'],
  },
  {
    tier: 'T4',
    pairingNumber: 'T4528',
    sourceDates: ['Jun 4, 2026'],
    isoDates: ['2026-06-04'],
  },
  {
    tier: 'T5',
    pairingNumber: 'T4542',
    sourceDates: ['Jun 9, 2026'],
    isoDates: ['2026-06-09'],
  },
]

const preferOffProperty: FixtureProperty = {
  tier: 'T1',
  page: 'days-off',
  propertyCode: 201,
  name: 'Prefer Off',
  action: 'award',
  bid: { type: 'prefer-off', mode: 'dates', values: preferOffDates },
}

const airportAvoidProperty: FixtureProperty = {
  tier: 'T2',
  page: 'pairing',
  propertyCode: 101,
  name: 'Any Landing In Airport',
  action: 'avoid',
  bid: { type: 'tag-list', values: airportCodes },
}

const departingOnProperty = (run: PairingRunCase): FixtureProperty => ({
  tier: run.tier,
  page: 'pairing',
  propertyCode: 106,
  name: 'Departure Date / Day',
  action: 'award',
  bid: { type: 'date-or-dow-list', values: run.sourceDates },
})

const pairingOccurrenceProperty = (run: PairingRunCase): FixtureProperty => ({
  tier: run.tier,
  page: 'pairing',
  propertyCode: 102,
  name: 'Pairing Number',
  action: 'award',
  bid: {
    type: 'pairing-occurrence-list',
    values: [run.pairingNumber],
    originDates: run.sourceDates,
  },
})

const activeTierButton = (tier: string): string =>
  `ul[aria-label="Tier options"] button[data-active="true"]:has-text("${tier}")`

const pairingExistingRow = (page: Page, propertyName: string, tier: string): Locator =>
  page
    .locator('[data-testid^="pairing-property-row-"]')
    .filter({ hasText: propertyName })
    .filter({ has: page.locator(activeTierButton(tier)) })
    .first()

const openExistingPairingNumberDialog = async (page: Page, run: PairingRunCase): Promise<Locator> => {
  const row = pairingExistingRow(page, 'Pairing Number', run.tier)
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.getByRole('button', { name: /^Edit existing pairing property Pairing Number/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Configure Pairing Number' })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  return dialog
}

const expectConfirmedRuns = async (dialog: Locator, run: PairingRunCase): Promise<void> => {
  await expect(dialog.getByRole('button', { name: 'Specific Date', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByText('CONFIRMED RUNS', { exact: true })).toBeVisible()
  await expect(dialog.getByText(run.pairingNumber).first()).toBeVisible()
  for (const isoDate of run.isoDates) {
    await expect(dialog.getByText(isoDate).last()).toBeVisible()
  }
}

const expectTierHeatmapPairingBlocks = async (page: Page): Promise<void> => {
  const expectations = [
    { tier: 'TIER-03', days: ['02', '06', '11', '13', '16', '18'] },
    { tier: 'TIER-04', days: ['04'] },
    { tier: 'TIER-05', days: ['09'] },
  ]

  for (const { tier, days } of expectations) {
    await expect(page.locator(`ol[aria-label="${tier} heatmap"]`)).toBeVisible({ timeout: 60_000 })
    for (const day of days) {
      await expect(
        page.locator(`ol[aria-label="${tier} heatmap"] li[aria-label="${tier} day ${day}"]`),
      ).toHaveClass(/bg-\[#4FCFED\]/, { timeout: 60_000 })
    }
  }
}

test.use({ storageState: { cookies: [], origins: [] } })

test(`${TEST_ID} — crew 19 specific-date Pairing Number runs render in dialog and heatmap`, async ({ page }) => {
  test.setTimeout(360_000)

  const login = new PbsLoginPage(page)
  const wb = new BidWorkbenchPage(page, { crewId: EMPLOYEE_ID, testId: TEST_ID })

  await login.goto()
  await login.login(EMPLOYEE_ID, EMPLOYEE_PASSWORD)
  await page.waitForURL(/\/dashboard$/, { timeout: 30_000 })

  await wb.goto('days-off')
  await wb.clearExisting('days-off')
  const preferOffResult = await wb.placeProperty(preferOffProperty)
  expect(preferOffResult.placed, preferOffResult.reason).toBe(true)
  await wb.assertExisting(preferOffProperty)

  await wb.goto('pairing')
  await wb.clearExisting('pairing')

  const airportResult = await wb.placeProperty(airportAvoidProperty)
  expect(airportResult.placed, airportResult.reason).toBe(true)
  await wb.assertExisting(airportAvoidProperty)

  for (const run of pairingRunCases) {
    const departingOn = departingOnProperty(run)
    const departingOnResult = await wb.placeProperty(departingOn)
    expect(departingOnResult.placed, departingOnResult.reason).toBe(true)
    await wb.assertExisting(departingOn)
    await wb.assertExistingBidContains(departingOn, ['Award'])

    const pairingNumber = pairingOccurrenceProperty(run)
    const pairingResult = await wb.placeProperty(pairingNumber)
    expect(pairingResult.placed, pairingResult.reason).toBe(true)
    await wb.assertExisting(pairingNumber)
    await wb.assertExistingBidContains(pairingNumber, ['Award', run.pairingNumber])
  }

  for (const run of pairingRunCases) {
    const dialog = await openExistingPairingNumberDialog(page, run)
    await expectConfirmedRuns(dialog, run)
    await dialog.getByRole('button', { name: 'CANCEL', exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 10_000 })
  }

  await expectTierHeatmapPairingBlocks(page)
})
