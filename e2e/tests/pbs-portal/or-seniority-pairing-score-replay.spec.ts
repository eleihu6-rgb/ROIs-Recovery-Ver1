/**
 * PBS-3510 — OR seniority PAIRING_SCORE portal replay.
 *
 * Destructive by design: for each crew in the fixture this test logs in through
 * the real PBS Portal UI, clears Days Off entries that would block specific-date
 * pairing runs, clears the Pairing page, and replays the aggregated Pairing
 * Number bids from PAIRING_SCORE.csv. The optimizer/scenario run is out of
 * scope; this verifies that the portal can store the crew bids needed by the
 * seniority award scenario.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'
import { BidWorkbenchPage, type FixtureProperty } from '../../pages/pbs-portal/bid-workbench-page'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const fixturePath = path.join(repoRoot, 'e2e/fixtures/pbs/or-seniority-pairing-score-p1-p6.json')
const resultsDir = path.join(repoRoot, 'e2e/results/or-seniority-portal-replay')
const TEST_ID = 'PBS-3510'
const EMPLOYEE_PASSWORD = process.env.PBS_TEST_PASS ?? 'rois'
const EXPECTED_PERIOD_HEADING = 'JUN 2026'

type ReplayProperty = FixtureProperty & {
  blockedRuns?: Array<Record<string, unknown>>
  sourcePairingIds?: string[]
  sourceInterfaceIds?: string[]
  sourceLivePairingIds?: string[]
}

type ReplayCrew = {
  employeeId: string
  sourceRowCount: number
  properties: ReplayProperty[]
}

type ReplayFixture = {
  caseId: string
  source: string
  period: string
  crew: ReplayCrew[]
}

type ReplayIssue = {
  employeeId: string
  image?: string
  reason: string
  tier?: string
  values?: string[]
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as ReplayFixture

const writeCrewResult = (employeeId: string, payload: unknown): void => {
  fs.mkdirSync(resultsDir, { recursive: true })
  fs.writeFileSync(path.join(resultsDir, `${employeeId}.json`), JSON.stringify(payload, null, 2) + '\n')
}

const loginAsCrew = async (page: Page, employeeId: string): Promise<void> => {
  const login = new PbsLoginPage(page)
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await login.goto()
    await login.login(employeeId, EMPLOYEE_PASSWORD)
    const landed = await page.waitForURL(/\/dashboard$/, { timeout: 25_000 }).then(() => true).catch(() => false)
    if (landed) return
    if (attempt < 3) await page.waitForTimeout(20_000)
  }
  throw new Error(`login failed for crew ${employeeId}`)
}

const verifyPlacedProperty = async (
  wb: BidWorkbenchPage,
  property: ReplayProperty,
): Promise<ReplayIssue | null> => {
  try {
    await wb.assertExisting(property)
    const expected = [
      ...(property.bid.values ?? []),
      ...(property.bid.originDates ?? []),
    ]
    await wb.assertExistingBidContains(property, ['Award', ...expected])
    return null
  } catch (error) {
    const image = await wb.snapshotFailure('verify-pairing-values', property)
    return {
      employeeId: '',
      tier: property.tier,
      values: property.bid.values,
      image,
      reason: `verification-failed: ${String(error).replace(/\s+/g, ' ').slice(0, 180)}`,
    }
  }
}

test.use({ storageState: { cookies: [], origins: [] } })

for (const [index, crew] of fixture.crew.entries()) {
  test(`${TEST_ID}.${index + 1} — crew ${crew.employeeId} replays ${crew.sourceRowCount} PAIRING_SCORE rows`, async ({ page }) => {
    test.setTimeout(420_000)

    const wb = new BidWorkbenchPage(page, { crewId: crew.employeeId, testId: TEST_ID })
    const issues: ReplayIssue[] = []
    const placed: Array<{ tier: string; values: string[] }> = []
    const blockedRuns = crew.properties.flatMap((property) =>
      (property.blockedRuns ?? []).map((run) => ({
        tier: property.tier,
        ...run,
      })),
    )

    try {
      await loginAsCrew(page, crew.employeeId)
      await wb.goto('days-off')
      await expect(page.getByRole('heading', { name: EXPECTED_PERIOD_HEADING })).toBeVisible({ timeout: 10_000 })
      await wb.clearExisting('days-off')

      await wb.goto('pairing')
      await expect(page.getByRole('heading', { name: EXPECTED_PERIOD_HEADING })).toBeVisible({ timeout: 10_000 })
      await wb.clearExisting('pairing')

      for (const property of crew.properties) {
        const result = await wb.placeProperty(property)
        if (!result.placed) {
          issues.push({
            employeeId: crew.employeeId,
            tier: property.tier,
            values: property.bid.values,
            image: result.image,
            reason: result.reason ?? 'placement failed',
          })
          continue
        }

        const verificationIssue = await verifyPlacedProperty(wb, property)
        if (verificationIssue) {
          issues.push({ ...verificationIssue, employeeId: crew.employeeId })
          continue
        }
        placed.push({ tier: property.tier, values: property.bid.values ?? [] })
      }
    } finally {
      writeCrewResult(crew.employeeId, {
        caseId: TEST_ID,
        source: fixture.source,
        employeeId: crew.employeeId,
        sourceRowCount: crew.sourceRowCount,
        attemptedRunCount: crew.properties.reduce((sum, property) => sum + (property.bid.values?.length ?? 0), 0),
        blockedRunCount: blockedRuns.length,
        blockedRuns,
        expectedPropertyRows: crew.properties.length,
        placedPropertyRows: placed.length,
        placed,
        issues,
      })
      await new PbsLoginPage(page).logout().catch(() => {})
    }

    expect(issues, `crew ${crew.employeeId} replay issues: ${JSON.stringify(issues, null, 2)}`).toEqual([])
    expect(placed.length).toBe(crew.properties.length)
  })
}
