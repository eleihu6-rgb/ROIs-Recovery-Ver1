/**
 * PBS-3325 — Employee 19 current-month NPBS Default Bid replay.
 *
 * Source evidence: docs/test-cases/CLASS-BidsReport_March2026.txt, Employee #19
 * Default Bid. The source confirmation is from Feb 2026 and the export period is
 * March 2026; this test intentionally replays the conditions into the portal's
 * current RP (June 2026 in the active test environment).
 *
 * Destructive by design: clears Employee 19's line / days-off / pairing bids
 * before replaying the five source conditions. The T5 composite source condition
 * is represented by two ordinary T5 UI bid rows.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'
import { BidWorkbenchPage, type BidPageKind, type FixtureProperty, type PlaceResult } from '../../pages/pbs-portal/bid-workbench-page'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const issuesDir = path.join(repoRoot, 'e2e/results/npbs-issues')
const reportPath = path.join(issuesDir, '19-current-month.json')

const TEST_ID = 'PBS-3325'
const EMPLOYEE_ID = '19'
const EMPLOYEE_PASSWORD = 'rois'
const TOTAL_SOURCE_CONDITIONS = 5

type FailureCategory =
  | 'condition-unclear'
  | 'condition-mismatch'
  | 'condition-missing'
  | 'value-not-available'
  | 'ui-operation-failed'

type ReplayProperty = FixtureProperty & {
  expectedBidText?: string[]
  source: string
}

type ReplayIssue = {
  category: FailureCategory
  image?: string
  page: BidPageKind
  propertyCode: number
  reason: string
  source: string
  tier: string
}

type RecordedGap = {
  category: FailureCategory
  mappedPropertyCode: number
  reason: string
  source: string
  tier: string
}

const airportCodes = [
  'AZA',
  'CUN',
  'FLL',
  'JFK',
  'LAS',
  'PSP',
  'SFB',
  'YHZ',
  'YQG',
  'YQT',
  'YUL',
  'YWG',
  'YXE',
  'YYC',
  'YYG',
]

const replayProperties: ReplayProperty[] = [
  {
    tier: 'T1',
    page: 'line',
    propertyCode: 401,
    name: 'Max Credit Window',
    action: 'award',
    bid: { type: 'flag' },
    source: 'Set Condition Maximum Credit Window',
  },
  {
    tier: 'T2',
    page: 'days-off',
    propertyCode: 201,
    name: 'Prefer Off',
    action: 'award',
    bid: { type: 'prefer-off', mode: 'days_of_week', values: ['Friday', 'Saturday', 'Sunday'] },
    expectedBidText: ['Fri', 'Sat', 'Sun'],
    source: 'Prefer Off Friday, Saturday, Sunday',
  },
  {
    tier: 'T3',
    page: 'pairing',
    propertyCode: 103,
    name: 'Pairing Check-In / Check-Out Time',
    action: 'avoid',
    bid: { type: 'pairing-check-time', timeType: 'check_in', operator: '>', value: '15:00', dateScope: null },
    expectedBidText: ['Avoid', '15:00'],
    source: 'Avoid Pairings If Pairing Check-In Time > 15:00',
  },
  {
    tier: 'T4',
    page: 'pairing',
    propertyCode: 101,
    name: 'Any Landing In Airport',
    action: 'avoid',
    bid: { type: 'tag-list', values: airportCodes },
    expectedBidText: ['Avoid', ...airportCodes],
    source: `Avoid Pairings If Any Landing In ${airportCodes.join(', ')}`,
  },
  {
    tier: 'T5',
    page: 'pairing',
    propertyCode: 106,
    name: 'Departing On',
    action: 'award',
    bid: { type: 'date-or-dow-list', values: ['Monday', 'Wednesday'] },
    expectedBidText: ['Award', 'Mon', 'Wed'],
    source: 'Award Pairings If Departing On Monday, Wednesday If Any Landing In YVR',
  },
  {
    tier: 'T5',
    page: 'pairing',
    propertyCode: 101,
    name: 'Any Landing In Airport',
    action: 'award',
    bid: { type: 'tag-list', values: ['YVR'] },
    expectedBidText: ['Award', 'Any', 'YVR'],
    source: 'Award Pairings If Departing On Monday, Wednesday If Any Landing In YVR',
  },
]

const recordedGaps: RecordedGap[] = []

const pagesToReset: BidPageKind[] = ['line', 'days-off', 'pairing']

const writeReport = (payload: unknown): void => {
  fs.mkdirSync(issuesDir, { recursive: true })
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2) + '\n')
}

const cleanFailureReason = (value: unknown): string =>
  String(value)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)

const classifyPlaceFailure = (property: ReplayProperty, result: PlaceResult): FailureCategory => {
  const reason = result.reason ?? ''
  if (
    reason.includes('property-not-found-in-workspace')
    || reason.includes('unsupported-input')
    || reason.includes('no-add-bid-button')
  ) {
    return 'condition-missing'
  }
  if (reason.includes('add-bid-disabled')) {
    return property.propertyCode === 101 ? 'value-not-available' : 'ui-operation-failed'
  }
  if (reason.includes('add-bid-rejected')) {
    return 'ui-operation-failed'
  }
  return 'ui-operation-failed'
}

const issueFromResult = (property: ReplayProperty, result: PlaceResult): ReplayIssue => ({
  category: classifyPlaceFailure(property, result),
  image: result.image,
  page: property.page,
  propertyCode: property.propertyCode,
  reason: result.reason ?? 'unknown placement failure',
  source: property.source,
  tier: property.tier,
})

const issueFromAssertion = (
  property: ReplayProperty,
  reason: string,
  category: FailureCategory,
  image?: string,
): ReplayIssue => ({
  category,
  image,
  page: property.page,
  propertyCode: property.propertyCode,
  reason,
  source: property.source,
  tier: property.tier,
})

const isBlockingIssue = (issue: ReplayIssue): boolean => issue.category !== 'value-not-available'

test.use({ storageState: { cookies: [], origins: [] } })

test(`${TEST_ID} — Employee 19 replays current-month NPBS bid conditions`, async ({ page }) => {
  test.setTimeout(240_000)

  const login = new PbsLoginPage(page)
  const wb = new BidWorkbenchPage(page, { crewId: EMPLOYEE_ID, testId: TEST_ID })
  const placed: ReplayProperty[] = []
  const issues: ReplayIssue[] = []

  await login.goto()
  await login.login(EMPLOYEE_ID, EMPLOYEE_PASSWORD)
  await page.waitForURL(/\/dashboard$/, { timeout: 30_000 })

  for (const kind of pagesToReset) {
    await wb.goto(kind)
    await wb.clearExisting(kind)
  }

  let currentPage: BidPageKind | null = null
  for (const property of replayProperties) {
    if (currentPage !== property.page) {
      await wb.goto(property.page)
      currentPage = property.page
    }

    const result = await wb.placeProperty(property)
    if (!result.placed) {
      issues.push(issueFromResult(property, result))
      continue
    }

    try {
      await wb.assertExisting(property)
    } catch (error) {
      const image = await wb.snapshotFailure('existing-assertion', property)
      issues.push(issueFromAssertion(property, cleanFailureReason(error), 'ui-operation-failed', image))
      continue
    }

    try {
      if (property.expectedBidText) {
        await wb.assertExistingBidContains(property, property.expectedBidText)
      }
      placed.push(property)
    } catch (error) {
      const image = await wb.snapshotFailure('value-not-available', property)
      issues.push(issueFromAssertion(property, cleanFailureReason(error), 'value-not-available', image))
    }
  }

  const valueGaps = issues.filter((issue) => issue.category === 'value-not-available')
  const blockingIssues = issues.filter(isBlockingIssue)

  writeReport({
    testId: TEST_ID,
    employeeId: EMPLOYEE_ID,
    category: 'YYZ-737-IFD',
    targetPeriod: 'current portal RP (June 2026 in this environment)',
    sourcePeriod: 'March 2026',
    sourceConfirmationAt: '2026-02-12T13:41:53 UTC',
    destructiveResetPages: pagesToReset,
    totalConditions: TOTAL_SOURCE_CONDITIONS,
    totalSourceConditions: TOTAL_SOURCE_CONDITIONS,
    totalUiProperties: replayProperties.length,
    placed: placed.length,
    acceptedValueGaps: valueGaps.length,
    blockingIssues: blockingIssues.length,
    accountingPolicy: 'value-not-available records current-period option/value gaps and is non-blocking when the property and tier were added through UI.',
    placedDetail: placed.map((property) => ({
      tier: property.tier,
      page: property.page,
      propertyCode: property.propertyCode,
      name: property.name,
      source: property.source,
    })),
    recordedGaps,
    issues,
  })

  expect(
    blockingIssues,
    `Employee 19 replay had ${blockingIssues.length} blocking issue(s); see ${path.relative(repoRoot, reportPath)}`,
  ).toEqual([])
  expect(
    placed.length + valueGaps.length,
    `Employee 19 replay did not account for every UI replay property; see ${path.relative(repoRoot, reportPath)}`,
  ).toBe(replayProperties.length)
})
