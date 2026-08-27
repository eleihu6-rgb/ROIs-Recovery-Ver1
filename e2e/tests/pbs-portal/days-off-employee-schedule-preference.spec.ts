/**
 * PBS-3503 — Employee Schedule Preference can be configured through Days Off UI.
 *
 * Destructive by design: clears the test user's Days Off existing properties so
 * the resulting row is deterministic. Use only in a test DB.
 */
import { test, expect } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'
import { BidWorkbenchPage, type FixtureProperty } from '../../pages/pbs-portal/bid-workbench-page'

const TEST_ID = 'PBS-3503'
const PBS_USER = process.env.PBS_TIER_TEST_USER ?? process.env.PBS_TEST_USER ?? '762'
const PBS_PASS = process.env.PBS_TIER_TEST_PASS ?? process.env.PBS_TEST_PASS ?? 'rois'

const employeeSchedulePreference: FixtureProperty = {
  tier: 'T1',
  page: 'days-off',
  propertyCode: 206,
  name: 'Employee Schedule Preference',
  action: 'award',
  bid: {
    type: 'employee-schedule-preference',
    crewId: PBS_USER,
    relationship: 'apart',
    scheduleType: 'days_off',
    thresholdType: 'minimum',
    days: 8,
  },
}

test.use({ storageState: { cookies: [], origins: [] } })

test(`${TEST_ID} — adds Days Off Opposite Employee as Employee Schedule Preference`, async ({ page }) => {
  test.setTimeout(180_000)

  const login = new PbsLoginPage(page)
  const wb = new BidWorkbenchPage(page, { crewId: PBS_USER, testId: TEST_ID })

  await login.goto()
  await login.login(PBS_USER, PBS_PASS)
  await page.waitForURL(/\/dashboard$/, { timeout: 30_000 })

  await wb.goto('days-off')
  await wb.clearExisting('days-off')

  const placeResult = await wb.placeProperty(employeeSchedulePreference)
  expect(placeResult.placed, placeResult.reason).toBe(true)

  await wb.assertExisting(employeeSchedulePreference)
  await wb.assertExistingBidContains(employeeSchedulePreference, [
    'Apart',
    'Days Off',
    'Crew',
    'Minimum 8',
  ])
})
