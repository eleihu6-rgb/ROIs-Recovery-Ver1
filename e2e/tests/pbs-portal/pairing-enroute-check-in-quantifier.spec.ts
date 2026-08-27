/**
 * PBS-3502 — Any/Every Enroute Check-In Time supports Every in the Portal.
 *
 * Destructive by design: clears the test user's Pairing existing properties so
 * the resulting EXISTING row is deterministic. Use only in a test DB.
 */
import { test, expect, type Page } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'
import { BidWorkbenchPage, type FixtureProperty } from '../../pages/pbs-portal/bid-workbench-page'

const TEST_ID = 'PBS-3502'
const PBS_USER = process.env.PBS_TIER_TEST_USER ?? process.env.PBS_TEST_USER ?? '247'
const PBS_PASS = process.env.PBS_TIER_TEST_PASS ?? process.env.PBS_TEST_PASS ?? 'rois'
const ENROUTE_CHECK_IN_PROPERTY_CODE = 114
const ENROUTE_CHECK_IN_NAME = 'Any/Every Enroute Check-In Time'

const everyEnrouteCheckInTemplate: Omit<FixtureProperty, 'name'> = {
  tier: 'T1',
  page: 'pairing',
  propertyCode: ENROUTE_CHECK_IN_PROPERTY_CODE,
  action: 'award',
  quantifier: 'every',
  bid: { type: 'time', operator: '=', value: '09:15' },
}

const resolveRuntimePairingPropertyName = async (page: Page): Promise<string> => {
  return page.evaluate(
    async ({ propertyCode, fallbackName }) => {
      const token = window.sessionStorage.getItem('pbs-portal.auth.token')
      const response = await fetch('/api/pairing-bids/current', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) return fallbackName
      const payload = await response.json()
      const catalog = payload?.data?.propertyCatalog ?? []
      const property = catalog.find((item: { propertyCode?: number }) => item.propertyCode === propertyCode)
      return typeof property?.name === 'string' && property.name.length > 0 ? property.name : fallbackName
    },
    { propertyCode: ENROUTE_CHECK_IN_PROPERTY_CODE, fallbackName: ENROUTE_CHECK_IN_NAME },
  )
}

test.use({ storageState: { cookies: [], origins: [] } })

test(`${TEST_ID} — adds Every Enroute Check-In Time through the Pairing UI`, async ({ page }) => {
  test.setTimeout(180_000)

  const login = new PbsLoginPage(page)
  const wb = new BidWorkbenchPage(page, { crewId: PBS_USER, testId: TEST_ID })

  await login.goto()
  await login.login(PBS_USER, PBS_PASS)
  await page.waitForURL(/\/dashboard$/, { timeout: 30_000 })

  await wb.goto('pairing')
  await wb.clearExisting('pairing')

  const runtimePropertyName = await resolveRuntimePairingPropertyName(page)
  const everyEnrouteCheckIn: FixtureProperty = {
    ...everyEnrouteCheckInTemplate,
    name: runtimePropertyName,
  }

  const placeResult = await wb.placeProperty(everyEnrouteCheckIn)
  expect(placeResult.placed, placeResult.reason).toBe(true)

  const row = page
    .locator('[data-testid^="pairing-property-row-"]')
    .filter({ hasText: everyEnrouteCheckIn.name })
    .first()

  await expect(row).toBeVisible({ timeout: 30_000 })
  await expect(row).toContainText('Award · Every · = 09:15')
  await expect(
    row.getByRole('button', { name: `Toggle existing T1 for ${everyEnrouteCheckIn.name}` }),
  ).toHaveAttribute('data-active', 'true')
})
