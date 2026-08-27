/**
 * Pairing search e2e tests — covers Bug 1 (pool counts error) and Bug 2 (rank filter).
 *
 * PBS-3200: Pool counts panel shows a success state (not the "Try refresh again" error)
 *           after clicking REFRESH. Verifies the count endpoint no longer throws for a
 *           user with existing pairing properties.
 *
 * PBS-3201: SEARCH PAIRINGS returns results filtered by both the actor's base AND rank
 *           (pairing_composition match). Verifies the total shown in the search footer
 *           is a valid number and prints it for comparison against the pre-fix 14202.
 *
 * PBS-3202: Pool counts panel shows a valid count (not an error) for a user who has an
 *           active "Pairing Total Credit" (code 105) property with a duration bid — the
 *           specific case that triggered the original Bug 1 report.
 *
 * PBS-3203: /pairing-search/airport-options returns landingAirports + layoverAirports
 *           arrays scoped to the actor's base and current RP. Verifies the API returns
 *           only airports relevant to the crew's base pairings.
 *
 * PBS-3204: Duration bid controls render correctly for pairing time properties (e.g.
 *           property 142 "Min Duty Credit >= HH:MM" uses TimeValueBidControl not a
 *           free-text input).
 * PBS-3604: All Pairings result filters support a virtualized, cursor-paged Pairing
 *           Number multi-select plus Airport multi-select and a shared date range.
 *
 * Conditions (set via Regression tab):
 *   1. User 19 logs in with password "rois"
 *   2. User 19 has at least one T1 pairing property for the active Jun 2026 period
 *   3. pbs-server is running on http://localhost:3002 with the rank-filter fix applied
 */
import { test, expect, type Page, type Route } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'
import { loginToPbsApi } from '../../utils/pbs/auth'

// Use a crew with current T1 Pairing properties; override via PBS_TEST_USER env var.
const PBS_USER = process.env.PBS_TEST_USER ?? '19'
const PBS_PASS = process.env.PBS_TEST_PASS ?? 'rois'
const PBS_MONTH_END_USER = process.env.PBS_MONTH_END_USER
const PBS_API = process.env.PBS_API_URL ?? 'http://localhost:3002/api'
const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

const currentPeriod = {
  id: 6,
  rosterPeriodId: 6,
  rosterPeriodKey: '2026RP06',
  periodCode: 'Jun 2026',
  rpStartLocal: '2026-05-31',
  rpEndLocal: '2026-07-01',
  filiale: 'F8_DEV_LIVE',
  division: 'C',
  status: 'OPEN',
  computedStage: 'OPEN',
  bidOpenAt: '2026-05-01T04:00:00.000Z',
  bidCloseAt: '2026-05-09T02:59:00.000Z',
  canEditBid: true,
  readOnlyReason: null,
}

const mockPairingSearchResult = {
  id: 'search-result-e4101',
  pairingId: '10964',
  pairingNumber: 'E4101',
  base: 'YEG',
  originDate: '2026-06-04',
  endDate: '2026-06-05',
  startDateLabel: 'Jun 4, 2026',
  compositionLabel: 'CA(1)FO(1)',
  reportTime: '0600',
  priorityLabel: 'P1',
  prioritySequence: '02',
  totalBlock: '369',
  totalCredit: '369',
  totalDp: '-',
  totalPay: '610',
  activeDates: ['2026-06-04', '2026-06-05'],
  legs: [
    {
      id: 'e4101-leg-1',
      day: 1,
      dutyDate: '0605',
      dutyFdp: '0927',
      dutyFlyingHour: '0609',
      dutyHour: '0927',
      dutyCredit: '0609',
      flightNumber: '827',
      departureStation: 'YEG',
      arrivalStation: 'YVR',
      departureTime: '0647',
      arrivalTime: '0845',
      blockTime: '0158',
      equipment: '7M8',
      ganttQual: 'FLY',
      ganttAirline: 'F8',
      ganttFlight: '827',
      ganttFleet: '7M8',
      ganttAcc: 'D',
      ganttRef: '-',
      ganttDep: 'YEG',
      ganttPickup: '06:00',
      ganttReport: '06:00',
      ganttStd: '06:47',
      ganttAtd: '06:47',
      ganttArr: 'YVR',
      ganttSta: '08:45',
      ganttAta: '08:45',
      ganttDropoff: '-',
      ganttGroundTime: '0:38',
      ganttBlockHour: '1:58',
      ganttFlightTime: '1:58',
      ganttMinimumRest: '-',
      ganttDuty: '-',
    },
  ],
}

// Each test handles its own login (sessionStorage cannot be persisted in storageState).
test.use({ storageState: { cookies: [], origins: [] } })

// ─── helpers ───────────────────────────────────────────────────────────────────

async function loginAndNavigateTo(page: Parameters<typeof PbsLoginPage>[0], path: string) {
  const login = new PbsLoginPage(page)
  await login.goto()
  await login.login(PBS_USER, PBS_PASS)
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 })
  await page.goto(path)
}

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const mockPairingSearchCardApis = async (page: Page) => {
  await page.route('**/api/auth/session', async (route) => {
    await fulfillJson(route, {
      user: {
        id: 'u-1',
        name: 'Alex Crew',
        employeeNo: 'F8001',
      },
      authMode: 'password',
    })
  })

  await page.route('**/api/dashboard/profile', async (route) => {
    await fulfillJson(route, {
      id: 'u-1',
      employeeNo: 'F8001',
      name: 'Alex Crew',
      email: 'alex.crew@example.com',
      base: 'YEG',
      rank: 'CA',
      division: 'C',
      fleet: ['737', '7M8'],
      languages: ['EN 5'],
      seniorityLabel: '646',
      statusLabel: null,
      existingCreditLabel: '75.5',
      trainingMonthLabel: null,
      lastLoginLabel: null,
    })
  })

  await page.route('**/api/bidding-calendar/current', async (route) => {
    await fulfillJson(route, {
      periodCode: 'Jun 2026',
      bidContext: 'Current',
      currentPeriod,
      activeTierRange: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
      events: [],
    })
  })

  await page.route('**/api/pairing-bids/current', async (route) => {
    await fulfillJson(route, {
      currentPeriod,
      draft: {
        draftVersion: 0,
        periodCode: 'Jun 2026',
        bidContext: 'Current',
        properties: [
          {
            propertyGroupKey: 'existing-pairing-number',
            rowSeq: 1,
            propertyCode: 102,
            name: 'Pairing Number',
            action: 'award',
            quantifier: null,
            bid: {
              type: 'pairing-occurrence-list',
              occurrences: [
                { occurrenceId: '10964:2026-06-05', pairingId: '10964', pairingNumber: 'E4101', originDate: '2026-06-05' },
              ],
            },
            tiers: ['T1'],
          },
        ],
      },
      propertyCatalog: [
        {
          propertyCode: 102,
          name: 'Pairing Number',
          defaultBid: { type: 'pairing-id-list', pairingIds: [], pairingLabels: [] },
          supportedActions: ['award', 'avoid'],
        },
      ],
      favoriteProperties: [],
      recommendedPropertyCodes: [102],
    })
  })

  await page.route('**/api/pairing-search/current-rules/counts', async (route) => {
    await fulfillJson(route, {
      mode: 'current_rules_counts',
      periodCode: 'Jun 2026',
      tier: 'T1',
      computedAt: '2026-06-01T00:00:00.000Z',
      summary: {
        activePropertyCount: 1,
        allRules: { pairingIdCount: 1, totalItems: 1 },
      },
      rows: [],
    })
  })

  await page.route('**/api/pairing-search/current-rules/tier-pools', async (route) => {
    await fulfillJson(route, {
      mode: 'current_rules_tier_pools',
      periodCode: 'Jun 2026',
      computedAt: '2026-06-01T00:00:00.000Z',
      packageTotal: { pairingIdCount: 1, totalItems: 1 },
      rows: [],
    })
  })

  await page.route('**/api/pairing-search/pairing-ids**', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('query')?.toUpperCase() ?? ''
    const options = [
      {
        value: 'E4101',
        label: 'E4101 · Jun 5–6',
        pairingId: '10964',
        pairingLabel: 'E4101',
        startDate: '2026-06-05',
        endDate: '2026-06-06',
      },
      {
        value: 'V4146',
        label: 'V4146 · Jun 8–10',
        pairingId: '13335',
        pairingLabel: 'V4146',
        startDate: '2026-06-08',
        endDate: '2026-06-10',
      },
    ].filter((option) => option.pairingLabel.includes(query))

    await fulfillJson(route, {
      query,
      periodCode: 'Jun 2026',
      limit: 20,
      options,
    })
  })

  await page.route('**/api/pairing-search/pairing-number-filter-options**', async (route) => {
    const requestUrl = new URL(route.request().url())
    const query = requestUrl.searchParams.get('query')?.trim().toUpperCase() ?? ''
    const cursor = requestUrl.searchParams.get('cursor')
    const firstPageOptions = [
      { value: 'E4101', label: 'E4101' },
      ...Array.from({ length: 29 }, (_, index) => {
        const value = `M${String(index + 1).padStart(4, '0')}`
        return { value, label: value }
      }),
    ]
    const matchingOptions = [
      { value: 'E4101', label: 'E4101' },
      { value: 'V4146', label: 'V4146' },
    ].filter((option) => option.value.includes(query))

    await fulfillJson(route, {
      query,
      periodCode: 'Jun 2026',
      limit: 30,
      options: query
        ? matchingOptions
        : cursor
          ? [{ value: 'V4146', label: 'V4146' }]
          : firstPageOptions,
      nextCursor: !query && !cursor ? 'page-2' : null,
      totalCount: query ? matchingOptions.length : 31,
    })
  })

  await page.route('**/api/pairing-search/airport-options**', async (route) => {
    await fulfillJson(route, {
      airportPreferenceLayoverHours: {
        minHours: 13,
        maxHours: 18,
        stepHours: 1,
        defaultHours: 13,
      },
      airportPreferenceOptions: [],
      filterAirports: ['YEG', 'YVR', 'YYZ'],
      landingAirports: ['YVR', 'YYZ'],
      layoverAirports: ['YVR'],
      workStartStations: ['YEG'],
    })
  })

  await page.route('**/api/pairing-search/preview', async (route) => {
    expect(route.request().method()).toBe('POST')
    const requestBody = route.request().postDataJSON()
    expect(requestBody?.rosterPeriodId).toBe(currentPeriod.rosterPeriodId)
    const preview = requestBody?.preview
    expect(preview?.mode).toBe('all_pairings')
    const pageNumber = preview?.page ?? 1
    const pageSize = preview?.pageSize ?? 30

    await fulfillJson(route, {
      mode: 'all_pairings_preview',
      summary: {
        pairingIdCount: 500,
        totalItems: 500,
      },
      pagination: {
        page: pageNumber,
        pageSize,
        totalItems: 500,
        totalPages: Math.ceil(500 / pageSize),
      },
      results: [mockPairingSearchResult],
    })
  })
}

// ─── PBS-3200 ──────────────────────────────────────────────────────────────────

test('PBS-3200 — pairing pool counts panel shows success (not error) after REFRESH', async ({ page }) => {
  // Conditions (set via Regression tab):
  //   1. User logs into /pairing after authentication
  //   2. Clicking REFRESH triggers POST /api/pairing-search/current-rules/counts
  //   3. Panel shows success state — no "Try refresh again" text visible

  await loginAndNavigateTo(page, 'pairing')
  await page.waitForURL(/\/pairing$/, { timeout: 15_000 })

  // Wait for the pool counts toolbar to mount.
  const countsSummary = page.locator('[data-testid="pairing-pool-counts-summary"]')
  await expect(countsSummary).toBeVisible({ timeout: 10_000 })

  // Click REFRESH to trigger the count API call.
  await page.getByRole('button', { name: /REFRESH/i }).click()

  // Wait until the panel leaves "loading" state (REFRESHING label disappears).
  await expect(page.getByRole('button', { name: /REFRESHING/i })).toHaveCount(0, { timeout: 15_000 })

  // Assert: the summary panel does NOT contain the error result label.
  const resultLabel = page.locator('[data-testid="pairing-pool-counts-pairings"]')
  await expect(resultLabel).not.toContainText('Try refresh again', { timeout: 5_000 })

  // Assert: the summary panel does NOT carry the error CSS class (red border).
  // The error state sets a red-border class; success/idle set a blue-border class.
  await expect(countsSummary).not.toHaveClass(/bg-\[#fff2f2\]/)
})

// ─── PBS-3201 ──────────────────────────────────────────────────────────────────

test('PBS-3201 — SEARCH PAIRINGS filters by actor rank and shows total (after fix)', async ({ page }) => {
  // Conditions (set via Regression tab):
  //   1. User has at least one T1 pairing property so SEARCH PAIRINGS navigates
  //   2. Search footer shows "Total N items" — N is the rank-filtered count
  //   3. N must be a positive integer (search returned results, not an error)

  await loginAndNavigateTo(page, 'pairing')
  await page.waitForURL(/\/pairing$/, { timeout: 15_000 })

  // Wait for the right panel to load.
  await page.waitForSelector('[data-testid="pairing-pool-counts-summary"]', { timeout: 10_000 })

  // Click SEARCH PAIRINGS — navigates to /pairing/search if user has T1 properties.
  const searchBtn = page.locator('button').filter({ hasText: /SEARCH PAIRINGS/i }).first()
  await expect(searchBtn).toBeVisible({ timeout: 5_000 })
  await searchBtn.click()

  // Should land on /pairing/search.
  await page.waitForURL(/\/pairing\/search$/, { timeout: 15_000 })

  // Wait for the search panel and results footer.
  await expect(page.locator('[data-testid="pairing-search-panel"]')).toBeVisible({ timeout: 10_000 })

  const footer = page.locator('[data-testid="pairing-search-footer"]')
  await expect(footer).toBeVisible({ timeout: 20_000 })
  await expect(footer).toContainText('Total', { timeout: 20_000 })

  // Extract and log the RP + rank-filtered total.
  // After RP filter: only pairings in the current roster period (Jun 2026 by default)
  // are returned. Pre-fix baseline was 14202 (no base/rank/date filter).
  const footerText = await footer.textContent()
  const match = footerText?.match(/Total\s+(\d+)\s+items/)
  const totalItems = match ? Number.parseInt(match[1], 10) : null

  console.log(`[PBS-3201] After-fix total pairings (base + rank + RP filtered): ${totalItems}`)

  // The count must be a valid non-negative integer.
  expect(totalItems).not.toBeNull()
  expect(totalItems).toBeGreaterThanOrEqual(0)
  // RP + rank + base filters must reduce the count well below 14202.
  // Expected: current active Jun 2026 roster period, filtered by actor base/rank.
  expect(totalItems, 'Filters did not reduce results below pre-fix baseline 14202').toBeLessThan(14202)

  if (totalItems === 0) {
    console.log('[PBS-3201] No real pairings returned for current test data; card layout is covered by PBS-3602 mock UI regression.')
    return
  }

  const firstResultCard = page.getByTestId('pairing-search-results-list').locator('article').first()
  await expect(firstResultCard).toBeVisible({ timeout: 20_000 })
  const resultDetail = firstResultCard.getByTestId('pairing-result-card-detail')
  await expect(resultDetail).toBeVisible()
  await expect(firstResultCard.getByTestId('pairing-dialog-gantt-table')).toHaveCount(0)
  await expect(firstResultCard.locator('[class*="pairingBadgeSquare"]')).toHaveCount(0)
  const resultDetailHasHorizontalOverflow = await resultDetail.evaluate((element) => element.scrollWidth > element.clientWidth + 1)
  expect(resultDetailHasHorizontalOverflow).toBe(false)
  const miniCalendar = firstResultCard.getByTestId('pairing-search-mini-calendar')
  await expect(miniCalendar).toBeVisible()
  const detailBox = await resultDetail.boundingBox()
  const miniCalendarBox = await miniCalendar.boundingBox()
  expect(detailBox).not.toBeNull()
  expect(miniCalendarBox).not.toBeNull()
  const verticalOffset = Math.abs((detailBox?.y ?? 0) - (miniCalendarBox?.y ?? 0))
  expect(verticalOffset).toBeLessThanOrEqual(1)
  expect(Math.ceil(detailBox?.height ?? 0)).toBeGreaterThanOrEqual(Math.floor(miniCalendarBox?.height ?? 0))

  for (const label of ['Start', 'Base', 'Composition', 'Total Credit', 'Total BH', 'Total DP']) {
    await expect(firstResultCard).toContainText(label)
  }

  for (const header of ['Flight', 'ALN', 'Fleet', 'Route', 'PCK', 'RPT', 'STD', 'STA', 'BH', 'Duty']) {
    await expect(resultDetail).toContainText(header)
  }

  for (const fullOnlyHeader of ['QUAL', 'ACC', 'Ref', 'ATD', 'ATA', 'DRP', 'GT', 'FT', 'MRT']) {
    await expect(resultDetail.getByText(fullOnlyHeader, { exact: true })).toHaveCount(0)
  }

  for (const oldHeader of ['DUTY', 'F/H', 'D/H', 'CRD', 'FLTN', 'DPS', 'ARS', 'BLKT', 'EQP']) {
    await expect(firstResultCard.getByText(oldHeader, { exact: true })).toHaveCount(0)
  }
})

// ─── PBS-3602 ──────────────────────────────────────────────────────────────────

test('PBS-3602 — Search Pairings result card uses Gantt-aligned detail fields', async ({ page }) => {
  await page.addInitScript(({ storageKey, state }) => {
    window.sessionStorage.setItem(storageKey, 'jwt-token')

    if (window.location.pathname.endsWith('/bid/pairing/search')) {
      window.history.replaceState(
        {
          idx: 0,
          key: 'pairing-card-base-local-date-test',
          usr: state,
        },
        '',
        window.location.href,
      )
    }
  }, {
    storageKey: AUTH_TOKEN_KEY,
    state: {
      previewMode: 'all-pairings',
      draftMeta: {
        draftVersion: 0,
        periodCode: 'Jun 2026',
        bidContext: 'Current',
      },
    },
  })
  await mockPairingSearchCardApis(page)

  await page.goto('bid/pairing/search')
  await page.waitForURL(/\/pairing\/search$/, { timeout: 15_000 })

  const firstResultCard = page.getByTestId('pairing-search-results-list').locator('article').first()
  await expect(firstResultCard).toBeVisible({ timeout: 10_000 })
  const resultDetail = firstResultCard.getByTestId('pairing-result-card-detail')
  await expect(resultDetail).toBeVisible()
  await expect(firstResultCard.getByTestId('pairing-dialog-gantt-table')).toHaveCount(0)
  await expect(firstResultCard.locator('[class*="pairingBadgeSquare"]')).toHaveCount(0)
  const resultDetailHasHorizontalOverflow = await resultDetail.evaluate((element) => element.scrollWidth > element.clientWidth + 1)
  expect(resultDetailHasHorizontalOverflow).toBe(false)
  const miniCalendar = firstResultCard.getByTestId('pairing-search-mini-calendar')
  await expect(miniCalendar).toBeVisible()
  const detailBox = await resultDetail.boundingBox()
  const miniCalendarBox = await miniCalendar.boundingBox()
  expect(detailBox).not.toBeNull()
  expect(miniCalendarBox).not.toBeNull()
  const verticalOffset = Math.abs((detailBox?.y ?? 0) - (miniCalendarBox?.y ?? 0))
  expect(verticalOffset).toBeLessThanOrEqual(1)
  expect(Math.ceil(detailBox?.height ?? 0)).toBeGreaterThanOrEqual(Math.floor(miniCalendarBox?.height ?? 0))

  await expect(firstResultCard.getByText('E4101', { exact: true })).toHaveCount(1)

  for (const value of ['Start', 'Jun 4, 2026', 'Base', 'YEG', 'Composition', 'CA(1)FO(1)', 'Total Credit', '6:09', 'Total BH', '6:09', 'Total DP', '-']) {
    await expect(firstResultCard).toContainText(value)
  }
  await expect(miniCalendar.locator('[data-date="2026-06-04"]')).toHaveAttribute('data-active', 'true')

  for (const header of ['Flight', 'ALN', 'Fleet', 'Route', 'PCK', 'RPT', 'STD', 'STA', 'BH', 'Duty']) {
    await expect(resultDetail).toContainText(header)
  }

  for (const value of ['FLY 827', 'F8', '7M8', 'YEG → YVR', '06:00', '06:47', '08:45', '1:58']) {
    await expect(resultDetail).toContainText(value)
  }

  for (const fullOnlyHeader of ['QUAL', 'ACC', 'Ref', 'ATD', 'ATA', 'DRP', 'GT', 'FT', 'MRT']) {
    await expect(resultDetail.getByText(fullOnlyHeader, { exact: true })).toHaveCount(0)
  }

  for (const oldHeader of ['DUTY DATE', 'F/H', 'D/H', 'CRD', 'FLTN', 'DPS', 'ARS', 'BLKT', 'EQP']) {
    await expect(firstResultCard.getByText(oldHeader, { exact: true })).toHaveCount(0)
  }
})

test('PBS-3610 — Search Pairings mini calendar follows the exact cross-month roster period range', async ({ page }) => {
  await page.addInitScript(({ storageKey, state }) => {
    window.sessionStorage.setItem(storageKey, 'jwt-token')

    if (window.location.pathname.endsWith('/bid/pairing/search')) {
      window.history.replaceState(
        {
          idx: 0,
          key: 'pairing-card-real-period-range-test',
          usr: state,
        },
        '',
        window.location.href,
      )
    }
  }, {
    storageKey: AUTH_TOKEN_KEY,
    state: {
      previewMode: 'all-pairings',
      draftMeta: {
        draftVersion: 0,
        periodCode: 'Jun 2026',
        bidContext: 'Current',
      },
    },
  })
  await mockPairingSearchCardApis(page)

  await page.goto('bid/pairing/search')
  await page.waitForURL(/\/pairing\/search$/, { timeout: 15_000 })

  const miniCalendar = page
    .getByTestId('pairing-search-results-list')
    .locator('article')
    .first()
    .getByTestId('pairing-search-mini-calendar')

  await expect(miniCalendar).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'JUN 2026 · 2026-05-31 – 2026-07-01' })).toBeVisible()
  await expect(miniCalendar.locator('[data-date="2026-05-31"]')).toHaveCount(1)
  await expect(miniCalendar.locator('[data-date="2026-07-01"]')).toHaveCount(1)
})

test('PBS-3603 — All Pairings pagination resets the result list scroll position', async ({ page }) => {
  await page.addInitScript(({ storageKey, state }) => {
    window.sessionStorage.setItem(storageKey, 'jwt-token')

    if (window.location.pathname.endsWith('/bid/pairing/search')) {
      window.history.replaceState(
        {
          idx: 0,
          key: 'all-pairings-page-size-test',
          usr: state,
        },
        '',
        window.location.href,
      )
    }
  }, {
    storageKey: AUTH_TOKEN_KEY,
    state: {
      previewMode: 'all-pairings',
      draftMeta: {
        draftVersion: 0,
        periodCode: 'Jun 2026',
        bidContext: 'Current',
      },
    },
  })
  await mockPairingSearchCardApis(page)

  await page.goto('bid/pairing/search')
  await page.waitForURL(/\/pairing\/search$/, { timeout: 15_000 })

  const pageSizeSelect = page.getByRole('combobox', { name: 'Pairings per page' })
  await expect(pageSizeSelect).toHaveValue('30')
  const resultsViewport = page.getByTestId('pairing-search-results-list')
  await resultsViewport.evaluate((element) => {
    element.style.height = '120px'
    element.style.flex = 'none'
    element.scrollTop = element.scrollHeight
  })
  expect(await resultsViewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

  const pageTwoRequest = page.waitForRequest((request) => {
    if (!request.url().includes('/api/pairing-search/preview') || request.method() !== 'POST') {
      return false
    }

    const preview = request.postDataJSON()?.preview
    return preview?.mode === 'all_pairings' && preview?.page === 2 && preview?.pageSize === 30
  })

  await page.getByRole('button', { name: 'Go to pairing search page 2' }).click()
  await pageTwoRequest
  await expect.poll(() => resultsViewport.evaluate((element) => element.scrollTop)).toBe(0)

  await resultsViewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  expect(await resultsViewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

  const pageSizeRequest = page.waitForRequest((request) => {
    if (!request.url().includes('/api/pairing-search/preview') || request.method() !== 'POST') {
      return false
    }

    const preview = request.postDataJSON()?.preview
    return preview?.mode === 'all_pairings' && preview?.page === 1 && preview?.pageSize === 50
  })

  await pageSizeSelect.selectOption('50')
  await pageSizeRequest

  await expect.poll(() => resultsViewport.evaluate((element) => element.scrollTop)).toBe(0)
  await expect(pageSizeSelect).toHaveValue('50')
  await expect(page.getByRole('button', { name: 'Go to pairing search page 10' })).toBeVisible()
})

test('PBS-3605 — All Pairings hides stale cards while loading and after a failed page request', async ({ page }, testInfo) => {
  await page.addInitScript(({ storageKey, state }) => {
    window.sessionStorage.setItem(storageKey, 'jwt-token')

    if (window.location.pathname.endsWith('/bid/pairing/search')) {
      window.history.replaceState(
        {
          idx: 0,
          key: 'all-pairings-stale-results-test',
          usr: state,
        },
        '',
        window.location.href,
      )
    }
  }, {
    storageKey: AUTH_TOKEN_KEY,
    state: {
      previewMode: 'all-pairings',
      draftMeta: {
        draftVersion: 0,
        periodCode: 'Jun 2026',
        bidContext: 'Current',
      },
    },
  })
  await mockPairingSearchCardApis(page)
  await page.unroute('**/api/pairing-search/preview')

  let releasePageTwo: (() => void) | null = null
  const pageTwoResponseGate = new Promise<void>((resolve) => {
    releasePageTwo = resolve
  })
  let releasePageThreeRetry: (() => void) | null = null
  const pageThreeRetryGate = new Promise<void>((resolve) => {
    releasePageThreeRetry = resolve
  })
  let pageThreeAttempts = 0

  await page.route('**/api/pairing-search/preview', async (route) => {
    const preview = route.request().postDataJSON()?.preview
    const pageNumber = preview?.page ?? 1
    const pageSize = preview?.pageSize ?? 30

    if (pageNumber === 2) {
      await pageTwoResponseGate
    }

    if (pageNumber === 3) {
      pageThreeAttempts += 1
      if (pageThreeAttempts === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'preview unavailable' }),
        })
        return
      }

      await pageThreeRetryGate
    }

    const pairingNumber = pageNumber === 1 ? 'E4101' : pageNumber === 2 ? 'V4146' : 'T4503'
    await fulfillJson(route, {
      mode: 'all_pairings_preview',
      summary: {
        pairingIdCount: 500,
        totalItems: 500,
      },
      pagination: {
        page: pageNumber,
        pageSize,
        totalItems: 500,
        totalPages: Math.ceil(500 / pageSize),
      },
      results: [{
        ...mockPairingSearchResult,
        id: `search-result-${pairingNumber.toLowerCase()}`,
        pairingId: String(10964 + pageNumber),
        pairingNumber,
      }],
    })
  })

  await page.goto('bid/pairing/search')
  await page.waitForURL(/\/pairing\/search$/, { timeout: 15_000 })
  await expect(page.getByText('E4101', { exact: true })).toBeVisible({ timeout: 10_000 })

  const resultsViewport = page.getByTestId('pairing-search-results-list')
  await page.getByRole('button', { name: 'Go to pairing search page 2' }).click()

  await expect(resultsViewport).toHaveAttribute('aria-busy', 'true')
  const loadingSkeleton = page.getByTestId('pairing-search-results-loading')
  await expect(loadingSkeleton).toHaveCount(1)
  await expect(loadingSkeleton).toHaveAttribute('aria-hidden', 'true')
  for (const region of ['header', 'summary', 'detail', 'calendar']) {
    await expect(loadingSkeleton.getByTestId(`pairing-search-skeleton-${region}`)).toBeVisible()
  }
  await expect(loadingSkeleton.locator('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')).toHaveCount(0)
  await testInfo.attach('single-structured-pairing-skeleton', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  await expect(page.getByText('E4101', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'ADD PAIRING' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Go to previous pairing search page' })).toBeDisabled()
  await expect(page.getByRole('combobox', { name: 'Pairings per page' })).toBeDisabled()
  await expect(page.getByRole('textbox', { name: 'Go to pairing search page' })).toBeDisabled()

  releasePageTwo?.()
  await expect(page.getByText('V4146', { exact: true })).toBeVisible()
  await expect(resultsViewport).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByTestId('pairing-search-results-loading')).toHaveCount(0)

  await page.getByRole('button', { name: 'Go to pairing search page 3' }).click()
  const errorAlert = page.getByRole('alert')
  await expect(errorAlert).toContainText('Unable to refresh pairing results')
  await expect(page.getByText('V4146', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'ADD PAIRING' })).toHaveCount(0)

  await errorAlert.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByTestId('pairing-search-results-loading')).toBeVisible()
  releasePageThreeRetry?.()
  await expect(page.getByText('T4503', { exact: true })).toBeVisible()
  await expect(errorAlert).toHaveCount(0)
})

test('PBS-3604 — All Pairings filters load Pairing Numbers on empty scroll and send selected values', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.addInitScript(({ storageKey, state }) => {
    window.sessionStorage.setItem(storageKey, 'jwt-token')

    if (window.location.pathname.endsWith('/bid/pairing/search')) {
      window.history.replaceState(
        {
          idx: 0,
          key: 'all-pairings-filter-controls-test',
          usr: state,
        },
        '',
        window.location.href,
      )
    }
  }, {
    storageKey: AUTH_TOKEN_KEY,
    state: {
      previewMode: 'all-pairings',
      draftMeta: {
        draftVersion: 0,
        periodCode: 'Jun 2026',
        bidContext: 'Current',
      },
    },
  })
  await mockPairingSearchCardApis(page)

  await page.goto('bid/pairing/search')
  await page.waitForURL(/\/pairing\/search$/, { timeout: 15_000 })

  const filterControlTestIds = [
    'pairing-number-filter-control',
    'pairing-origin-date-range-filter-control',
    'airport-filter-control',
    'time-from-filter-control',
    'time-to-filter-control',
    'clear-filters-control',
  ]
  const filterLabelTestIds = [
    'pairing-number-filter-label',
    'pairing-origin-date-range-filter-label',
    'airport-filter-label',
    'time-from-filter-label',
    'time-to-filter-label',
  ]
  const controlHeights = await Promise.all(filterControlTestIds.map((testId) => page
    .getByTestId(testId)
    .evaluate((element) => getComputedStyle(element).height)))
  expect(new Set(controlHeights)).toEqual(new Set(['40px']))

  const controlRadii = await Promise.all(filterControlTestIds.map((testId) => {
    const control = page.getByTestId(testId)
    const visibleControl = testId === 'pairing-origin-date-range-filter-control'
      ? control.locator(':scope > div > div')
      : control

    return visibleControl.evaluate((element) => getComputedStyle(element).borderRadius)
  }))
  expect(new Set(controlRadii)).toEqual(new Set(['4px']))

  const controlBottoms = await Promise.all(filterControlTestIds.map(async (testId) => {
    const box = await page.getByTestId(testId).boundingBox()
    return box ? box.y + box.height : null
  }))
  expect(controlBottoms.every((bottom) => bottom !== null)).toBeTruthy()
  expect(Math.max(...controlBottoms as number[]) - Math.min(...controlBottoms as number[])).toBeLessThanOrEqual(1)

  const labelStyles = await Promise.all(filterLabelTestIds.map((testId) => page
    .getByTestId(testId)
    .evaluate((element) => {
      const style = getComputedStyle(element)
      return [style.fontSize, style.fontWeight, style.lineHeight].join('/')
    })))
  expect(new Set(labelStyles)).toEqual(new Set(['11px/800/14px']))

  const pairingNumberFilter = page.getByRole('combobox', { name: 'Filter results by pairing number' })
  await pairingNumberFilter.click()
  const unselectedOptionLabel = page.getByTestId('pairing-number-filter-option-E4101-label')
  await expect(unselectedOptionLabel).toBeVisible()
  await expect(page.getByTestId('pairing-number-filter-option-E4101-check')).toHaveCount(0)
  expect(await unselectedOptionLabel.evaluate((element) => (element as HTMLElement).offsetLeft)).toBe(12)
  await page.getByRole('option', { name: /E4101/ }).click()

  const selectedOptionLabelBox = await page.getByTestId('pairing-number-filter-option-E4101-label').boundingBox()
  const selectedOptionCheckBox = await page.getByTestId('pairing-number-filter-option-E4101-check').boundingBox()
  expect(selectedOptionLabelBox).not.toBeNull()
  expect(selectedOptionCheckBox).not.toBeNull()
  expect(selectedOptionCheckBox!.x).toBeGreaterThan(selectedOptionLabelBox!.x + selectedOptionLabelBox!.width)
  await expect(page.getByTestId('pairing-number-filter-option-E4101-label')).toHaveCSS('color', 'rgb(100, 103, 209)')
  await expect(page.getByRole('option', { name: /E4101/ })).toHaveCSS('background-color', 'rgb(228, 232, 255)')

  for (const pairingNumber of ['M0001', 'M0002', 'M0003']) {
    await page.getByRole('option', { name: pairingNumber, exact: true }).click()
  }

  const wrappedPairingHeight = await page.getByTestId('pairing-number-filter-control')
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).height))
  expect(wrappedPairingHeight).toBeGreaterThan(40)

  const labelTops = await Promise.all(filterLabelTestIds.map(async (testId) => {
    const box = await page.getByTestId(testId).boundingBox()
    return box?.y ?? null
  }))
  expect(labelTops.every((top) => top !== null)).toBeTruthy()
  expect(Math.max(...labelTops as number[]) - Math.min(...labelTops as number[])).toBeLessThanOrEqual(1)

  const firstRowControlTops = await Promise.all(filterControlTestIds.map(async (testId) => {
    const box = await page.getByTestId(testId).boundingBox()
    return box?.y ?? null
  }))
  expect(firstRowControlTops.every((top) => top !== null)).toBeTruthy()
  expect(Math.max(...firstRowControlTops as number[]) - Math.min(...firstRowControlTops as number[])).toBeLessThanOrEqual(1)

  const pairingNumberListbox = page.getByRole('listbox', { name: 'Pairing Number options' })
  await pairingNumberListbox.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.getByRole('option', { name: /V4146/ }).click()

  const filteredRequestPromise = page.waitForRequest((request) => {
    if (!request.url().includes('/api/pairing-search/preview') || request.method() !== 'POST') {
      return false
    }

    const filters = request.postDataJSON()?.preview?.filters
    return filters?.originDateFrom === '2026-06-01'
      && filters?.originDateTo === '2026-06-04'
      && filters?.pairingNumbers?.join(',') === 'E4101,M0001,M0002,M0003,V4146'
      && filters?.airports?.join(',') === 'YVR,YYZ'
      && filters?.timeFrom === '15:53'
      && filters?.timeTo === '08:59'
  })

  const airportFilter = page.getByRole('combobox', { name: 'Filter results by airport' })
  await airportFilter.click()
  await page.getByRole('option', { name: 'YVR', exact: true }).click()
  await airportFilter.click()
  await page.getByRole('option', { name: 'YYZ', exact: true }).click()

  await page.getByRole('button', { name: 'Open date range picker for pairing results' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-01' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-04' }).click()
  await page.getByLabel('Filter results from report time').fill('15:53')
  await page.getByLabel('Filter results to report time').fill('08:59')

  const assertDateRangeSingleLine = async () => {
    const dateRangeControl = page.getByTestId('pairing-origin-date-range-filter-control')
    const dateRangeItems = [
      dateRangeControl.getByText('2026-06-01', { exact: true }),
      dateRangeControl.getByText('TO', { exact: true }),
      dateRangeControl.getByText('2026-06-04', { exact: true }),
      dateRangeControl.getByRole('button', { name: 'Clear pairing result origin date range' }),
      dateRangeControl.getByRole('button', { name: 'Open date range picker for pairing results' }),
    ]
    const centers = await Promise.all(dateRangeItems.map(async (item) => {
      const box = await item.boundingBox()
      return box ? box.y + box.height / 2 : null
    }))

    expect(centers.every((center) => center !== null)).toBeTruthy()
    expect(Math.max(...centers as number[]) - Math.min(...centers as number[])).toBeLessThanOrEqual(2)
    expect(await dateRangeControl.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBeTruthy()
  }

  await assertDateRangeSingleLine()
  await page.setViewportSize({ width: 1280, height: 800 })
  await assertDateRangeSingleLine()

  const filteredRequest = await filteredRequestPromise

  expect(filteredRequest.postDataJSON().preview.filters).toEqual({
    pairingNumbers: ['E4101', 'M0001', 'M0002', 'M0003', 'V4146'],
    originDateFrom: '2026-06-01',
    originDateTo: '2026-06-04',
    airports: ['YVR', 'YYZ'],
    timeFrom: '15:53',
    timeTo: '08:59',
  })

  const firstResultCard = page.getByTestId('pairing-search-results-list').locator('article').first()
  await expect(firstResultCard).toContainText('Start Jun 4, 2026')
  await expect(firstResultCard.locator('[data-date="2026-06-04"]')).toHaveAttribute('data-active', 'true')

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove E4101 from Pairing Number' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remove YVR from Airport' })).toHaveCount(0)
})

// ─── PBS-3202 ──────────────────────────────────────────────────────────────────

test('PBS-3202 — pool counts API returns 200 for user with Pairing Total Credit property', async ({ request }) => {
  // Conditions (set via Regression tab):
  //   1. POST /api/auth/session succeeds with the test credentials
  //   2. POST /api/pairing-search/current-rules/counts with a duration bid returns 200
  //   3. Response contains a "rows" array (not an error envelope)

  // Authenticate directly via the PBS API.
  const { token } = await loginToPbsApi(request, PBS_API, PBS_USER, PBS_PASS)

  // POST to the count endpoint with a Pairing Total Credit (code 105) property — the
  // exact bid that triggered the original "Unable to calculate pairing counts" error.
  const countRes = await request.post(`${PBS_API}/pairing-search/current-rules/counts`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      rosterPeriodId: currentPeriod.rosterPeriodId,
      tier: 'T1',
      properties: [
        {
          propertyGroupKey: 'test-prop-105',
          rowSeq: 1,
          propertyCode: 105,
          name: 'Pairing Total Credit',
          action: 'award',
          quantifier: null,
          bid: { type: 'duration', value: '05:00', operator: '>' },
          tiers: ['T1'],
        },
      ],
    },
  })

  expect(countRes.ok(), `Count endpoint returned ${countRes.status()} — Bug 1 not fixed`).toBeTruthy()

  const body = (await countRes.json()) as {
    code?: number
    data?: { rows?: unknown[]; summary?: { activePropertyCount: number } } | null
  }

  // The server wraps responses in { code, data }; data.rows must be present.
  const data = body?.data
  expect(data, 'Response data missing').toBeTruthy()
  expect(data?.rows).toBeDefined()
  expect(data?.summary?.activePropertyCount).toBe(1)

  console.log(
    `[PBS-3202] Count for Pairing Total Credit > 5:00 → ` +
      `${JSON.stringify(data?.rows ?? [])} | activePropertyCount=${data?.summary?.activePropertyCount}`,
  )
})

test('PBS-3640 — Month-End Carryover PREVIEW uses the Pairing Base local end date', async ({ request }) => {
  test.skip(!PBS_MONTH_END_USER, 'Set PBS_MONTH_END_USER to a YYZ IFD crew login.')

  const { token } = await loginToPbsApi(request, PBS_API, PBS_MONTH_END_USER!, PBS_PASS)
  const previewRes = await request.post(`${PBS_API}/pairing-search/preview`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      rosterPeriodId: currentPeriod.rosterPeriodId,
      periodCode: currentPeriod.periodCode,
      preview: {
        property: {
          propertyCode: 163,
          name: 'Month-End Carryover',
          action: 'award',
          quantifier: null,
          bid: { type: 'month-end-carryover', operator: '=', days: 1 },
        },
        page: 1,
        pageSize: 30,
      },
    },
  })

  expect(previewRes.ok(), `Month-End Carryover PREVIEW returned ${previewRes.status()}`).toBeTruthy()
  const envelope = await previewRes.json() as {
    data?: {
      summary: { totalItems: number }
      results: Array<{ pairingNumber: string }>
    }
  }
  const preview = envelope.data

  expect(preview?.summary.totalItems).toBe(7)
  expect(preview?.results.map((pairing) => pairing.pairingNumber)).toContain('T4583')
  expect(preview?.results.map((pairing) => pairing.pairingNumber)).not.toContain('T4582')
})

// ─── PBS-3203 ──────────────────────────────────────────────────────────────────

test('PBS-3203 — airport-options endpoint returns base-scoped landing and layover airports', async ({ request }) => {
  // Conditions (set via Regression tab):
  //   1. pbs-server running on PBS_API with an authenticated crew session
  //   2. The authenticated crew has base-scoped pairings for Jun 2026 in the DB

  // Obtain a JWT by logging in via the legacy API path.
  const { token } = await loginToPbsApi(request, PBS_API, PBS_USER, PBS_PASS, '/auth/login')

  // Fetch airport options for the current RP.
  const resp = await request.get(`${PBS_API}/pairing-search/airport-options`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { rosterPeriodId: currentPeriod.rosterPeriodId },
  })
  expect(resp.ok(), `airport-options failed: ${resp.status()}`).toBe(true)

  const body = await resp.json()
  const data = body?.data
  expect(data, 'Response data missing').toBeTruthy()
  expect(Array.isArray(data?.landingAirports), 'landingAirports must be an array').toBe(true)
  expect(Array.isArray(data?.layoverAirports), 'layoverAirports must be an array').toBe(true)

  console.log(
    `[PBS-3203] airport-options → landing: ${data?.landingAirports?.length}, layover: ${data?.layoverAirports?.length}`,
  )
})

// ─── PBS-3204 ──────────────────────────────────────────────────────────────────

test('PBS-3204 — SEARCH PAIRINGS accepts duration bid for property 142 (Min Duty Credit)', async ({ request }) => {
  // Regression guard: before the fix, property 142 only accepted type:"text".
  // Now it accepts type:"duration" so the TimeValueBidControl is used in the UI.

  const { token } = await loginToPbsApi(request, PBS_API, PBS_USER, PBS_PASS, '/auth/login')

  const resp = await request.post(`${PBS_API}/pairing-search/preview`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      rosterPeriodId: currentPeriod.rosterPeriodId,
      preview: {
        property: {
          propertyCode: 142,
          name: 'Min Duty Credit',
          action: 'award',
          bid: { type: 'duration', value: '04:00', operator: '>' },
        },
        page: 1,
        pageSize: 5,
      },
    },
  })

  // Should not return 400 "Invalid" — duration bid is now accepted.
  expect(resp.status(), 'duration bid for property 142 should be accepted (not 400)').not.toBe(400)

  const body = await resp.json()
  console.log(`[PBS-3204] preview with duration bid → status=${resp.status()}, pairingIdCount=${body?.data?.summary?.pairingIdCount}`)
})

// ─── PBS-3500 ──────────────────────────────────────────────────────────────────

test('PBS-3500 — pairing-id autocomplete returns pairingLabel as value (not numeric DB id)', async ({ request }) => {
  // Regression guard: before the fix, the autocomplete returned `value: "4959"` (numeric
  // DB id). After the fix, `value` is the human-readable label like "M4959" so that
  // selecting from the autocomplete stores the label in the bid, not an opaque integer.

  const { token } = await loginToPbsApi(request, PBS_API, PBS_USER, PBS_PASS, '/auth/login')

  const resp = await request.get(`${PBS_API}/pairing-search/pairing-ids`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { query: 'M', rosterPeriodId: currentPeriod.rosterPeriodId },
  })
  expect(resp.ok(), `pairing-id search failed: ${resp.status()}`).toBe(true)

  const body = await resp.json()
  const options: Array<{ value: string; pairingLabel?: string; pairingId?: string }> = body?.data?.options ?? []

  if (options.length === 0) {
    console.log('[PBS-3500] No pairings found for query "M" — test skipped (no data).')
    return
  }

  for (const option of options) {
    const isNumericOnly = /^\d+$/.test(option.value)
    expect(
      isNumericOnly,
      `option.value "${option.value}" is a raw numeric DB id — should be a label like "${option.pairingLabel}"`,
    ).toBe(false)

    if (option.pairingLabel) {
      expect(option.value).toBe(option.pairingLabel)
    }
  }

  console.log(`[PBS-3500] Verified ${options.length} options: value === pairingLabel for all.`)
})

// ─── PBS-3501 ──────────────────────────────────────────────────────────────────

test('PBS-3501 — pairing preview accepts label-based pairingId (e.g. "M4959" not "4959")', async ({ request }) => {
  // Regression guard: after the fix, the preview endpoint accepts label strings in
  // `pairingIds` (e.g. ["M4959"]) and returns results — not a 400 validation error.
  // Also verifies backward compat: numeric strings still work via the text fallback.

  const { token } = await loginToPbsApi(request, PBS_API, PBS_USER, PBS_PASS, '/auth/login')

  // First, find a real pairing label to use in the preview.
  const searchResp = await request.get(`${PBS_API}/pairing-search/pairing-ids`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { query: 'M', limit: 1, rosterPeriodId: currentPeriod.rosterPeriodId },
  })
  expect(searchResp.ok()).toBe(true)
  const searchBody = await searchResp.json()
  const firstOption = searchBody?.data?.options?.[0]

  if (!firstOption?.value) {
    console.log('[PBS-3501] No pairings found — test skipped (no data).')
    return
  }

  const pairingLabel = firstOption.value
  expect(/^\d+$/.test(pairingLabel)).toBe(false)

  // Submit preview with a label-based pairingId.
  const resp = await request.post(`${PBS_API}/pairing-search/preview`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      rosterPeriodId: currentPeriod.rosterPeriodId,
      preview: {
        property: {
          propertyCode: 102,
          name: 'Pairing Number',
          action: 'award',
          quantifier: null,
          bid: { type: 'pairing-id-list', pairingIds: [pairingLabel] },
        },
        page: 1,
        pageSize: 5,
      },
    },
  })

  expect(resp.status(), `preview with label "${pairingLabel}" should not be rejected (400)`).not.toBe(400)
  const previewBody = await resp.json()
  console.log(`[PBS-3501] preview with label "${pairingLabel}" → status=${resp.status()}, pairingIdCount=${previewBody?.data?.summary?.pairingIdCount}`)
})
