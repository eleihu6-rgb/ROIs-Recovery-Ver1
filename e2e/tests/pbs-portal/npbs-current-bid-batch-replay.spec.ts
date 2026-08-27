/**
 * PBS-3330 — NPBS Current/Default bid batch replay.
 *
 * Source evidence: /Users/lei/.codex/attachments/.../pasted-text.txt
 *
 * Rules verified by this case:
 *   - Current Bid wins; Default Bid is used only when Current is absent.
 *   - Only the first seven real bid preferences map to T1..T7.
 *   - Group markers do not consume tiers.
 *   - Composite "If A If B" preferences are replayed as multiple ordinary UI
 *     rows sharing the same tier.
 *
 * The source period is March 2026. This test replays into the current Portal RP
 * used by the test environment (June 2026), matching the existing NPBS replay
 * convention in this repository.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { PbsLoginPage, PBS_AUTH_TOKEN_KEY } from '../../pages/pbs-portal/pbs-login-page'
import {
  BidWorkbenchPage,
  type BidPageKind,
  type FixtureProperty,
  type PlaceResult,
} from '../../pages/pbs-portal/bid-workbench-page'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const issuesDir = path.join(repoRoot, 'e2e/results/npbs-issues')
const reportPath = path.join(issuesDir, 'current-bid-batch-replay.json')

const TEST_ID = 'PBS-3330'
const CURRENT_RP_LABEL = 'June 2026'
const SOURCE_PERIOD_LABEL = 'March 2026'
const EMPLOYEE_PASSWORD = 'rois'

type FailureCategory =
  | 'condition-unclear'
  | 'condition-mismatch'
  | 'condition-missing'
  | 'ignored'
  | 'partial-import'
  | 'ui-operation-failed'
  | 'value-not-available'

type ReplayProperty = FixtureProperty & {
  expectedBidText?: string[]
  source: string
  sourceConditionId: string
  sourceSeq: number
  semanticGaps?: Array<{
    category: Extract<FailureCategory, 'partial-import' | 'condition-missing'>
    reason: string
  }>
}

type IgnoredPreference = {
  category: Extract<FailureCategory, 'ignored'>
  reason: string
  source: string
  sourceSeq: number
}

type CrewReplay = {
  category: string
  contextReason: string
  employeeId: string
  ignoredPreferences?: IgnoredPreference[]
  properties: ReplayProperty[]
  selectedContext: 'Current Bid' | 'Default Bid'
  skippedContexts?: Array<{ context: 'Current Bid' | 'Default Bid'; reason: string }>
  sourcePreferenceCount: number
}

type ReplayIssue = {
  category: FailureCategory
  employeeId: string
  image?: string
  name?: string
  page?: BidPageKind
  propertyCode?: number
  reason: string
  selectedContext: string
  source: string
  sourceConditionId?: string
  sourceSeq: number
  tier?: string
}

type PlacedProperty = {
  employeeId: string
  name: string
  page: BidPageKind
  propertyCode: number
  selectedContext: string
  source: string
  sourceConditionId: string
  sourceSeq: number
  tier: string
}

const dates = (...days: number[]): string[] => days.map((day) => `Jun ${day}, 2026`)

const pairingNumberProperty = (
  tier: string,
  sourceSeq: number,
  sourceConditionId: string,
  source: string,
  values: string[],
  action: 'award' | 'avoid' = 'award',
  semanticGaps?: ReplayProperty['semanticGaps'],
): ReplayProperty => ({
  tier,
  page: 'pairing',
  propertyCode: 102,
  name: 'Pairing Number',
  action,
  bid: { type: 'pairing-id-list', values },
  expectedBidText: [action === 'award' ? 'Award' : 'Avoid', ...values],
  source,
  sourceConditionId,
  sourceSeq,
  semanticGaps,
})

const airportProperty = (
  tier: string,
  sourceSeq: number,
  sourceConditionId: string,
  source: string,
  values: string[],
  action: 'award' | 'avoid' = 'avoid',
  semanticGaps?: ReplayProperty['semanticGaps'],
): ReplayProperty => ({
  tier,
  page: 'pairing',
  propertyCode: 101,
  name: 'Any Landing In Airport',
  action,
  bid: { type: 'tag-list', values },
  expectedBidText: [action === 'award' ? 'Award' : 'Avoid', ...values],
  source,
  sourceConditionId,
  sourceSeq,
  semanticGaps,
})

const departingOnProperty = (
  tier: string,
  sourceSeq: number,
  sourceConditionId: string,
  source: string,
  values: string[],
): ReplayProperty => ({
  tier,
  page: 'pairing',
  propertyCode: 106,
  name: 'Departing On',
  action: 'award',
  bid: { type: 'date-or-dow-list', values },
  source,
  sourceConditionId,
  sourceSeq,
})

const dutyOnProperty = (
  tier: string,
  sourceSeq: number,
  sourceConditionId: string,
  source: string,
  values: string[],
): ReplayProperty => ({
  tier,
  page: 'pairing',
  propertyCode: 110,
  name: 'Any/Every Duty On Date / Day',
  action: 'award',
  bid: { type: 'date-or-dow-list', values },
  source,
  sourceConditionId,
  sourceSeq,
})

const preferOffDatesProperty = (
  tier: string,
  sourceSeq: number,
  sourceConditionId: string,
  source: string,
  values: string[],
): ReplayProperty => ({
  tier,
  page: 'days-off',
  propertyCode: 201,
  name: 'Prefer Off',
  action: 'award',
  bid: { type: 'prefer-off', mode: 'dates', values, raw: values.join(', ') },
  source,
  sourceConditionId,
  sourceSeq,
})

const crews: CrewReplay[] = [
  {
    employeeId: '19',
    category: 'YYZ-737-IFD',
    selectedContext: 'Current Bid',
    contextReason: 'Current Bid exists, so it overrides Default Bid.',
    sourcePreferenceCount: 5,
    properties: [
      preferOffDatesProperty(
        'T1',
        2,
        '19-current-2',
        'Prefer Off Mar 3, 2026, Mar 5, 2026, Mar 6, 2026, Mar 7, 2026, Mar 8, 2026, Mar 9, 2026, Mar 11, 2026, Mar 13, 2026, Mar 14, 2026, Mar 15, 2026, Mar 17, 2026, Mar 18, 2026, Mar 19, 2026, Mar 21, 2026, Mar 22, 2026, Mar 24, 2026, Mar 25, 2026, Mar 26, 2026, Mar 28, 2026, Mar 29, 2026, Mar 31, 2026',
        dates(3, 5, 6, 7, 8, 9, 11, 13, 14, 15, 17, 18, 19, 21, 22, 24, 25, 26, 28, 29, 31),
      ),
      airportProperty(
        'T2',
        3,
        '19-current-3',
        'Avoid Pairings If Any Landing In FLL, KIN, MBJ, MCO, MEX, PUJ, PVR, YEG, YHZ, YKF, YVR, YWG, YXX, YYC',
        ['FLL', 'KIN', 'MBJ', 'MCO', 'MEX', 'PUJ', 'PVR', 'YEG', 'YHZ', 'YKF', 'YVR', 'YWG', 'YXX', 'YYC'],
      ),
      departingOnProperty(
        'T3',
        4,
        '19-current-4',
        'Award Pairings If Departing On Mar 2, 2026, Mar 4, 2026 If Pairing Number T4506',
        dates(2, 4),
      ),
      pairingNumberProperty(
        'T3',
        4,
        '19-current-4',
        'Award Pairings If Departing On Mar 2, 2026, Mar 4, 2026 If Pairing Number T4506',
        ['T4506'],
      ),
      departingOnProperty(
        'T4',
        5,
        '19-current-5',
        'Award Pairings If Departing On Mar 16, 2026, Mar 20, 2026, Mar 23, 2026, Mar 27, 2026, Mar 30, 2026 If Pairing Number T4545',
        dates(16, 20, 23, 27, 30),
      ),
      pairingNumberProperty(
        'T4',
        5,
        '19-current-5',
        'Award Pairings If Departing On Mar 16, 2026, Mar 20, 2026, Mar 23, 2026, Mar 27, 2026, Mar 30, 2026 If Pairing Number T4545',
        ['T4545'],
      ),
      departingOnProperty(
        'T5',
        6,
        '19-current-6',
        'Award Pairings If Departing On Mar 12, 2026 If Pairing Number T4537',
        dates(12),
      ),
      pairingNumberProperty(
        'T5',
        6,
        '19-current-6',
        'Award Pairings If Departing On Mar 12, 2026 If Pairing Number T4537',
        ['T4537'],
      ),
    ],
  },
  {
    employeeId: '73',
    category: 'YYZ-737-FO',
    selectedContext: 'Current Bid',
    contextReason: 'Current Bid exists, so Default Bid is skipped.',
    skippedContexts: [{ context: 'Default Bid', reason: 'Skipped because Current Bid exists for the same employee.' }],
    sourcePreferenceCount: 4,
    properties: [
      airportProperty(
        'T1',
        2,
        '73-current-2',
        'Avoid Pairings If Any Landing In CUN, FLL, KIN, MBJ, MCO, PVR, YEG, YHZ, YKF, YVR, YWG, YXX, YYC',
        ['CUN', 'FLL', 'KIN', 'MBJ', 'MCO', 'PVR', 'YEG', 'YHZ', 'YKF', 'YVR', 'YWG', 'YXX', 'YYC'],
      ),
      pairingNumberProperty('T2', 3, '73-current-3', 'Award Pairings If Pairing Number TB5355', ['TB5355']),
      departingOnProperty(
        'T3',
        4,
        '73-current-4',
        'Award Pairings If Departing On Mar 16, 2026, Mar 20, 2026, Mar 23, 2026, Mar 27, 2026, Mar 30, 2026 If Any Landing In GDL',
        dates(16, 20, 23, 27, 30),
      ),
      airportProperty(
        'T3',
        4,
        '73-current-4',
        'Award Pairings If Departing On Mar 16, 2026, Mar 20, 2026, Mar 23, 2026, Mar 27, 2026, Mar 30, 2026 If Any Landing In GDL',
        ['GDL'],
        'award',
      ),
      departingOnProperty(
        'T4',
        5,
        '73-current-5',
        'Award Pairings If Departing On Mar 2, 2026, Mar 6, 2026 If Pairing Number T4105',
        dates(2, 6),
      ),
      pairingNumberProperty(
        'T4',
        5,
        '73-current-5',
        'Award Pairings If Departing On Mar 2, 2026, Mar 6, 2026 If Pairing Number T4105',
        ['T4105'],
      ),
    ],
  },
  {
    employeeId: '96',
    category: 'YVR-737-IFD',
    selectedContext: 'Current Bid',
    contextReason: 'Current Bid exists; only the first seven real preferences are replayed into T1-T7.',
    skippedContexts: [{ context: 'Default Bid', reason: 'Skipped because Current Bid exists for the same employee.' }],
    sourcePreferenceCount: 11,
    ignoredPreferences: [
      {
        category: 'ignored',
        sourceSeq: 9,
        source: 'Prefer Off Mar 2, 2026, Mar 3, 2026, Mar 4, 2026, Mar 5, 2026, Mar 6, 2026, Mar 7, 2026, Mar 8, 2026, Mar 20, 2026, Mar 30, 2026, Mar 31, 2026',
        reason: 'ignored: exceeds T1-T7 capacity after the first seven real bid preferences.',
      },
      {
        category: 'ignored',
        sourceSeq: 10,
        source: 'Avoid Pairings If Any Landing In CUN, LAS, LAX, MEX, SFO, YEG, YYC, YYZ',
        reason: 'ignored: exceeds T1-T7 capacity after the first seven real bid preferences.',
      },
      {
        category: 'ignored',
        sourceSeq: 11,
        source: 'Avoid Pairings If Pairing Check-In Time < 06:15',
        reason: 'ignored: exceeds T1-T7 capacity after the first seven real bid preferences.',
      },
      {
        category: 'ignored',
        sourceSeq: 12,
        source: 'Avoid Pairings If Any Duty Legs (Counting Deadhead Legs) > 2 legs',
        reason: 'ignored: exceeds T1-T7 capacity after the first seven real bid preferences.',
      },
    ],
    properties: [
      dutyOnProperty('T1', 2, '96-current-2', 'Award Pairings If Any Duty On Mar 9, 2026 If Pairing Number V4521', dates(9)),
      pairingNumberProperty('T1', 2, '96-current-2', 'Award Pairings If Any Duty On Mar 9, 2026 If Pairing Number V4521', ['V4521']),
      dutyOnProperty('T2', 3, '96-current-3', 'Award Pairings If Any Duty On Mar 10, 2026 If Pairing Number V4522', dates(10)),
      pairingNumberProperty('T2', 3, '96-current-3', 'Award Pairings If Any Duty On Mar 10, 2026 If Pairing Number V4522', ['V4522']),
      dutyOnProperty('T3', 4, '96-current-4', 'Award Pairings If Any Duty On Mar 12, 2026 If Pairing Number V4522', dates(12)),
      pairingNumberProperty('T3', 4, '96-current-4', 'Award Pairings If Any Duty On Mar 12, 2026 If Pairing Number V4522', ['V4522']),
      dutyOnProperty('T4', 5, '96-current-5', 'Award Pairings If Any Duty On Mar 14, 2026 If Pairing Number V4531', dates(14)),
      pairingNumberProperty('T4', 5, '96-current-5', 'Award Pairings If Any Duty On Mar 14, 2026 If Pairing Number V4531', ['V4531']),
      dutyOnProperty('T5', 6, '96-current-6', 'Award Pairings If Any Duty On Mar 15, 2026 If Pairing Number V4522', dates(15)),
      pairingNumberProperty('T5', 6, '96-current-6', 'Award Pairings If Any Duty On Mar 15, 2026 If Pairing Number V4522', ['V4522']),
      dutyOnProperty('T6', 7, '96-current-7', 'Award Pairings If Any Duty On Mar 17, 2026 If Pairing Number V4522', dates(17)),
      pairingNumberProperty('T6', 7, '96-current-7', 'Award Pairings If Any Duty On Mar 17, 2026 If Pairing Number V4522', ['V4522']),
      dutyOnProperty('T7', 8, '96-current-8', 'Award Pairings If Any Duty On Mar 19, 2026 If Pairing Number V4531', dates(19)),
      pairingNumberProperty('T7', 8, '96-current-8', 'Award Pairings If Any Duty On Mar 19, 2026 If Pairing Number V4531', ['V4531']),
    ],
  },
  {
    employeeId: '113',
    category: 'YVR-737-CA',
    selectedContext: 'Current Bid',
    contextReason: 'Current Bid exists.',
    sourcePreferenceCount: 5,
    properties: [
      preferOffDatesProperty('T1', 2, '113-current-2', 'Prefer Off Mar 31, 2026', dates(31)),
      pairingNumberProperty(
        'T2',
        3,
        '113-current-3',
        'Avoid Pairings If Pairing Number V4102, V4106, V4107, V4111, V4115, V4127, V4132, V4134, V4138, V4145, V4148',
        ['V4102', 'V4106', 'V4107', 'V4111', 'V4115', 'V4127', 'V4132', 'V4134', 'V4138', 'V4145', 'V4148'],
        'avoid',
      ),
      pairingNumberProperty('T3', 4, '113-current-4', 'Award Pairings If Pairing Number V4119', ['V4119']),
      pairingNumberProperty(
        'T4',
        5,
        '113-current-5',
        'Award Pairings If Pairing Number V4114, V4131, V4137 Limit 3',
        ['V4114', 'V4131', 'V4137'],
        'award',
        [
          {
            category: 'partial-import',
            reason: 'The source has "Limit 3"; the current Portal manual Pairing Number dialog does not expose a Limit N control in this test flow, so only the pairing-number list is attempted.',
          },
        ],
      ),
      pairingNumberProperty(
        'T5',
        6,
        '113-current-6',
        'Award Pairings If Pairing Number V4112, V4122, V4133, V4136, V4141, V4143, V4144, V4147, V4199',
        ['V4112', 'V4122', 'V4133', 'V4136', 'V4141', 'V4143', 'V4144', 'V4147', 'V4199'],
      ),
    ],
  },
  {
    employeeId: '169',
    category: 'YOW-737-CA',
    selectedContext: 'Current Bid',
    contextReason: 'Current Bid exists.',
    sourcePreferenceCount: 4,
    properties: [
      preferOffDatesProperty('T1', 2, '169-current-2', 'Prefer Off Mar 10, 2026, Mar 11, 2026, Mar 12, 2026, Mar 13, 2026, Mar 14, 2026, Mar 15, 2026', dates(10, 11, 12, 13, 14, 15)),
      pairingNumberProperty('T2', 3, '169-current-3', 'Award Pairings If Pairing Number O4105', ['O4105']),
      pairingNumberProperty('T3', 4, '169-current-4', 'Award Pairings If Pairing Number O4109', ['O4109']),
      pairingNumberProperty('T4', 5, '169-current-5', 'Award Pairings If Pairing Number O4116', ['O4116']),
    ],
  },
  {
    employeeId: '106',
    category: 'YYZ-737-IFD',
    selectedContext: 'Default Bid',
    contextReason: 'No Current Bid block is present for this employee in the supplied source, so Default Bid is used as fallback.',
    sourcePreferenceCount: 3,
    properties: [
      {
        tier: 'T1',
        page: 'days-off',
        propertyCode: 201,
        name: 'Prefer Off',
        action: 'award',
        bid: { type: 'prefer-off', mode: 'weekends' },
        expectedBidText: ['Weekends'],
        source: 'Prefer Off Weekends',
        sourceConditionId: '106-default-2',
        sourceSeq: 2,
      },
      {
        tier: 'T2',
        page: 'line',
        propertyCode: 402,
        name: 'Min Credit Window',
        action: 'award',
        bid: { type: 'flag' },
        source: 'Set Condition Minimum Credit Window',
        sourceConditionId: '106-default-3',
        sourceSeq: 3,
      },
      airportProperty(
        'T3',
        4,
        '106-default-4',
        'Avoid Pairings If Any Landing In (Counting Deadhead Legs) FLL, KIN, MBJ, MCO, MEX, YHZ, YWG, YXX',
        ['FLL', 'KIN', 'MBJ', 'MCO', 'MEX', 'YHZ', 'YWG', 'YXX'],
        'avoid',
        [
          {
            category: 'partial-import',
            reason: 'The source says "(Counting Deadhead Legs)"; Portal airport bid dialog only exposes the airport selection in this test flow, so the deadhead-counting semantic is recorded as incomplete.',
          },
        ],
      ),
    ],
  },
]

const writeReport = (payload: unknown): void => {
  fs.mkdirSync(issuesDir, { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`)
}

const cleanFailureReason = (value: unknown): string =>
  String(value)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)

const pagesToReset = (crew: CrewReplay): BidPageKind[] => {
  const order: BidPageKind[] = ['days-off', 'line', 'pairing', 'reserve']
  const used = new Set(crew.properties.map((property) => property.page))
  return order.filter((pageKind) => used.has(pageKind))
}

const propertiesByPage = (crew: CrewReplay): Map<BidPageKind, ReplayProperty[]> => {
  const map = new Map<BidPageKind, ReplayProperty[]>()
  for (const kind of pagesToReset(crew)) {
    map.set(kind, crew.properties.filter((property) => property.page === kind))
  }
  return map
}

const resetAuth = async (page: Page): Promise<void> => {
  await page.goto('login').catch(() => {})
  await page.evaluate((key) => window.sessionStorage.removeItem(key), PBS_AUTH_TOKEN_KEY).catch(() => {})
  await page.context().clearCookies().catch(() => {})
}

const loginAsCrew = async (page: Page, employeeId: string): Promise<boolean> => {
  const login = new PbsLoginPage(page)
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await resetAuth(page)
    await login.goto()
    await login.login(employeeId, EMPLOYEE_PASSWORD)
    try {
      await page.waitForURL(/\/dashboard$/, { timeout: 30_000 })
      return true
    } catch {
      if (attempt < 3) await page.waitForTimeout(15_000)
    }
  }
  return false
}

const classifyPlaceFailure = (property: ReplayProperty, result: PlaceResult): FailureCategory => {
  const reason = result.reason ?? ''

  if (reason.includes('add-bid-disabled')) {
    if (property.propertyCode === 101 || property.propertyCode === 102) return 'value-not-available'
    return 'condition-mismatch'
  }

  if (
    reason.includes('property-not-found-in-workspace')
    || reason.includes('unsupported-input')
    || reason.includes('no-add-bid-button')
  ) {
    return 'condition-missing'
  }

  if (reason.includes('add-bid-rejected')) return 'ui-operation-failed'
  return 'ui-operation-failed'
}

const issueFromResult = (crew: CrewReplay, property: ReplayProperty, result: PlaceResult): ReplayIssue => ({
  category: classifyPlaceFailure(property, result),
  employeeId: crew.employeeId,
  image: result.image,
  name: property.name,
  page: property.page,
  propertyCode: property.propertyCode,
  reason: result.reason ?? 'unknown placement failure',
  selectedContext: crew.selectedContext,
  source: property.source,
  sourceConditionId: property.sourceConditionId,
  sourceSeq: property.sourceSeq,
  tier: property.tier,
})

const issueFromSemanticGap = (
  crew: CrewReplay,
  property: ReplayProperty,
  gap: NonNullable<ReplayProperty['semanticGaps']>[number],
): ReplayIssue => ({
  category: gap.category,
  employeeId: crew.employeeId,
  name: property.name,
  page: property.page,
  propertyCode: property.propertyCode,
  reason: gap.reason,
  selectedContext: crew.selectedContext,
  source: property.source,
  sourceConditionId: property.sourceConditionId,
  sourceSeq: property.sourceSeq,
  tier: property.tier,
})

const issueFromAssertion = (
  crew: CrewReplay,
  property: ReplayProperty,
  reason: string,
  category: FailureCategory,
  image?: string,
): ReplayIssue => ({
  category,
  employeeId: crew.employeeId,
  image,
  name: property.name,
  page: property.page,
  propertyCode: property.propertyCode,
  reason,
  selectedContext: crew.selectedContext,
  source: property.source,
  sourceConditionId: property.sourceConditionId,
  sourceSeq: property.sourceSeq,
  tier: property.tier,
})

const issueFromIgnored = (crew: CrewReplay, ignored: IgnoredPreference): ReplayIssue => ({
  category: 'ignored',
  employeeId: crew.employeeId,
  reason: ignored.reason,
  selectedContext: crew.selectedContext,
  source: ignored.source,
  sourceSeq: ignored.sourceSeq,
})

const assertionCategory = (property: ReplayProperty): FailureCategory =>
  property.propertyCode === 101 || property.propertyCode === 102 ? 'value-not-available' : 'condition-mismatch'

const uniqueSourceConditions = (properties: ReplayProperty[]): number =>
  new Set(properties.map((property) => property.sourceConditionId)).size

const placedDetail = (crew: CrewReplay, property: ReplayProperty): PlacedProperty => ({
  employeeId: crew.employeeId,
  selectedContext: crew.selectedContext,
  tier: property.tier,
  page: property.page,
  propertyCode: property.propertyCode,
  name: property.name,
  sourceSeq: property.sourceSeq,
  sourceConditionId: property.sourceConditionId,
  source: property.source,
})

test.use({ storageState: { cookies: [], origins: [] } })

test(`${TEST_ID} — replay supplied NPBS Current/Default bid selections`, async ({ page }) => {
  test.setTimeout(900_000)

  const placed: PlacedProperty[] = []
  const issues: ReplayIssue[] = []
  const crewSummaries: Array<Record<string, unknown>> = []

  for (const crew of crews) {
    const wb = new BidWorkbenchPage(page, { crewId: crew.employeeId, testId: TEST_ID })
    const loggedIn = await loginAsCrew(page, crew.employeeId)

    if (!loggedIn) {
      const image = await wb.snapshotFailure('login-failed')
      issues.push({
        category: 'ui-operation-failed',
        employeeId: crew.employeeId,
        image,
        reason: `login failed for crew ${crew.employeeId}`,
        selectedContext: crew.selectedContext,
        source: 'Login before bid replay',
        sourceSeq: 0,
      })
      continue
    }

    const placedBeforeCrew = placed.length
    const issuesBeforeCrew = issues.length

    for (const ignored of crew.ignoredPreferences ?? []) {
      issues.push(issueFromIgnored(crew, ignored))
    }

    for (const [kind, props] of propertiesByPage(crew)) {
      try {
        await wb.goto(kind)
        await wb.clearExisting(kind)
      } catch (error) {
        const image = await wb.snapshotFailure(`page-load-${kind}`)
        for (const property of props) {
          issues.push(issueFromAssertion(
            crew,
            property,
            `page-load-failed: ${cleanFailureReason(error)}`,
            'ui-operation-failed',
            image,
          ))
        }
        continue
      }

      for (const property of props) {
        for (const gap of property.semanticGaps ?? []) {
          issues.push(issueFromSemanticGap(crew, property, gap))
        }

        const result = await wb.placeProperty(property)
        if (!result.placed) {
          issues.push(issueFromResult(crew, property, result))
          continue
        }

        try {
          await wb.assertExisting(property)
        } catch (error) {
          const image = await wb.snapshotFailure('existing-assertion', property)
          issues.push(issueFromAssertion(
            crew,
            property,
            cleanFailureReason(error),
            'ui-operation-failed',
            image,
          ))
          continue
        }

        try {
          if (property.expectedBidText) {
            await wb.assertExistingBidContains(property, property.expectedBidText)
          }
          placed.push(placedDetail(crew, property))
        } catch (error) {
          const image = await wb.snapshotFailure('value-or-summary-mismatch', property)
          issues.push(issueFromAssertion(
            crew,
            property,
            cleanFailureReason(error),
            assertionCategory(property),
            image,
          ))
        }
      }
    }

    await new PbsLoginPage(page).logout().catch(() => {})

    const crewIssues = issues.slice(issuesBeforeCrew)
    crewSummaries.push({
      employeeId: crew.employeeId,
      category: crew.category,
      selectedContext: crew.selectedContext,
      contextReason: crew.contextReason,
      skippedContexts: crew.skippedContexts ?? [],
      sourcePreferenceCount: crew.sourcePreferenceCount,
      attemptedSourcePreferences: uniqueSourceConditions(crew.properties),
      attemptedUiProperties: crew.properties.length,
      ignoredPreferences: crew.ignoredPreferences?.length ?? 0,
      placedUiProperties: placed.length - placedBeforeCrew,
      issuesByCategory: crewIssues.reduce<Record<string, number>>((acc, issue) => {
        acc[issue.category] = (acc[issue.category] ?? 0) + 1
        return acc
      }, {}),
    })
  }

  const issuesByCategory = issues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.category] = (acc[issue.category] ?? 0) + 1
    return acc
  }, {})
  const unexpectedIssues = issues.filter((issue) => issue.category === 'ui-operation-failed')
  const selectedSourcePreferenceCount = crews.reduce((sum, crew) => sum + crew.sourcePreferenceCount, 0)
  const attemptedSourcePreferenceCount = crews.reduce((sum, crew) => sum + uniqueSourceConditions(crew.properties), 0)
  const ignoredPreferenceCount = crews.reduce((sum, crew) => sum + (crew.ignoredPreferences?.length ?? 0), 0)

  writeReport({
    testId: TEST_ID,
    sourcePeriod: SOURCE_PERIOD_LABEL,
    targetPeriod: `current Portal RP (${CURRENT_RP_LABEL} in this environment)`,
    sourceEvidence: '/Users/lei/.codex/attachments/a0db637e-8921-4836-8a0b-4a7d100dd7bf/pasted-text.txt',
    selectionPolicy: 'Current Bid wins; Default Bid is used only when Current Bid is absent.',
    tierPolicy: 'Only first seven real bid preferences map to T1-T7. Group labels do not consume tiers.',
    comboPolicy: 'Composite preferences are represented as multiple ordinary Portal rows with the same tier.',
    selectedCrew: crews.map((crew) => ({
      employeeId: crew.employeeId,
      category: crew.category,
      selectedContext: crew.selectedContext,
      contextReason: crew.contextReason,
      skippedContexts: crew.skippedContexts ?? [],
    })),
    summary: {
      selectedCrewCount: crews.length,
      selectedSourcePreferenceCount,
      attemptedSourcePreferenceCount,
      ignoredPreferenceCount,
      attemptedUiProperties: crews.reduce((sum, crew) => sum + crew.properties.length, 0),
      placedUiProperties: placed.length,
      issuesByCategory,
      unexpectedUiOperationFailures: unexpectedIssues.length,
    },
    crewSummaries,
    placed,
    issues,
  })

  expect(
    unexpectedIssues,
    `Unexpected UI operation failures; see ${path.relative(repoRoot, reportPath)}`,
  ).toEqual([])
  expect(
    attemptedSourcePreferenceCount + ignoredPreferenceCount,
    `Selected source preferences are not fully accounted for; see ${path.relative(repoRoot, reportPath)}`,
  ).toBe(selectedSourcePreferenceCount)
})
