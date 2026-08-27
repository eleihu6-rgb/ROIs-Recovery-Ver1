import { expect, test, type Page, type Route } from '@playwright/test'

const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const closedCurrentPeriod = {
  id: 38,
  rosterPeriodId: 38,
  rosterPeriodKey: '2026RP06',
  periodCode: 'Jun 2026',
  filiale: 'F8',
  division: 'C',
  status: 'CLOSED',
  computedStage: 'CLOSED',
  bidOpenAt: '2026-05-01T04:00:00.000Z',
  bidCloseAt: '2026-05-09T02:59:00.000Z',
  base: 'YYZ',
  zoneId: 'America/Toronto',
  timezoneLabel: 'YYZ Local Time',
  rpStartLocal: '2026-06-01',
  rpEndLocal: '2026-06-30',
  canEditBid: false,
  readOnlyReason: 'Bidding closed at May 08, 22:59.',
}

const emptyRuleBidDraft = (draftKey: string, bidId: number) => ({
  currentPeriod: closedCurrentPeriod,
  draft: {
    draftKey,
    bidId,
    periodId: 38,
    draftVersion: 0,
    periodCode: 'Jun 2026',
    bidContext: 'Current',
    remarks: '',
    properties: [],
  },
  propertyCatalog: [],
  favoriteProperties: [],
  recommendedPropertyCodes: [],
})

const pairingDraft = {
  currentPeriod: closedCurrentPeriod,
  draft: {
    draftKey: 'pairing-draft-closed',
    bidId: 2001,
    periodId: 38,
    draftVersion: 0,
    periodCode: 'Jun 2026',
    bidContext: 'Current',
    remarks: '',
    properties: [
      {
        propertyGroupKey: 'pairing-length-closed',
        rowSeq: 1,
        propertyCode: 131,
        name: 'Prefer Pairing Length',
        action: 'award',
        bid: { type: 'stepper', value: 4, min: 1, max: 7, operator: '=' },
        tiers: ['T1'],
      },
    ],
  },
  propertyCatalog: [
    {
      propertyCode: 131,
      name: 'Prefer Pairing Length',
      defaultAction: 'award',
      defaultBid: { type: 'stepper', value: 3, min: 1, max: 7 },
      supportedActions: ['award', 'avoid'],
    },
  ],
  favoriteProperties: [],
  recommendedPropertyCodes: [131],
}

const daysOffDraft = {
  currentPeriod: closedCurrentPeriod,
  draft: {
    draftKey: 'days-off-draft-closed',
    bidId: 1001,
    periodId: 38,
    draftVersion: 0,
    periodCode: 'Jun 2026',
    bidContext: 'Current',
    remarks: '',
    properties: [
      {
        propertyGroupKey: 'prefer-off-closed',
        rowSeq: 1,
        propertyCode: 201,
        name: 'Prefer Off',
        bid: { type: 'tag-list', values: ['2026-06-10'], suggestions: [] },
        tiers: ['T1'],
        allOrNothing: false,
        minimumN: null,
        maximumN: null,
      },
    ],
  },
  propertyCatalog: [
    {
      propertyCode: 201,
      name: 'Prefer Off',
      defaultBid: { type: 'tag-list', values: [], suggestions: [] },
    },
  ],
  favoriteProperties: [],
  recommendedPropertyCodes: [201],
  preferOffConfig: {
    weekdays: [
      { code: 'MON', name: 'Monday', order: 1, isoDay: 1 },
      { code: 'TUE', name: 'Tuesday', order: 2, isoDay: 2 },
      { code: 'WED', name: 'Wednesday', order: 3, isoDay: 3 },
      { code: 'THU', name: 'Thursday', order: 4, isoDay: 4 },
      { code: 'FRI', name: 'Friday', order: 5, isoDay: 5 },
      { code: 'SAT', name: 'Saturday', order: 6, isoDay: 6 },
      { code: 'SUN', name: 'Sunday', order: 7, isoDay: 7 },
    ],
    weekend: {
      available: true,
      startDayCode: 'SAT',
      startDayName: 'Saturday',
      startTime: '00:00',
      endDayCode: 'SUN',
      endDayName: 'Sunday',
      endTime: '24:00',
    },
  },
}

const lineholderSummary = {
  draftKey: 'summary-draft-closed',
  bidId: 4001,
  periodId: 38,
  draftVersion: 0,
  periodCode: 'Jun 2026',
  bidContext: 'Current',
  statistics: [
    {
      tier: 'T1',
      totalItems: 1,
      pairingCount: 1,
      lineCount: 0,
      daysOffCount: 0,
      reserveCount: 0,
      unsupportedItemCount: 0,
    },
  ],
  summaryItems: [
    {
      id: 'summary-pairing-length',
      groupKey: 'pairing-length-closed',
      bidType: 'Pairing',
      action: 'Award',
      label: 'Prefer Pairing Length',
      bid: '4',
      operator: '=',
      value: '4',
      readableText: 'Award Prefer Pairing Length = 4',
      tiers: ['T1'],
      source: 'currentDraft',
      editableSource: {
        module: 'Pairing',
        propertyGroupKey: 'pairing-length-closed',
      },
    },
    {
      id: 'summary-prefer-off',
      groupKey: 'prefer-off-closed',
      bidType: 'DaysOff',
      action: 'SetCondition',
      label: 'Prefer Off',
      bid: 'Jun 10, 2026',
      value: 'Jun 10, 2026',
      readableText: 'Prefer Off Jun 10, 2026',
      tiers: ['T1'],
      source: 'currentDraft',
      editableSource: {
        module: 'DaysOff',
        propertyGroupKey: 'prefer-off-closed',
      },
    },
  ],
  diagnostics: [],
  warnings: [],
}

const mockBidApis = async (page: Page) => {
  await page.route('**/api/auth/session', async (route) => {
    await fulfillJson(route, {
      user: {
        id: 'u-1',
        name: 'Casey Crew',
        employeeNo: 'F8030',
      },
      authMode: 'password',
    })
  })

  await page.route('**/api/dashboard/profile', async (route) => {
    await fulfillJson(route, {
      id: 'u-1',
      employeeNo: 'F8030',
      name: 'Casey Crew',
      email: 'casey.crew@example.com',
      base: 'YYZ',
      rank: 'CA',
      division: 'F',
      fleet: ['737'],
      languages: ['EN 5'],
      seniorityLabel: '15',
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
      currentPeriod: closedCurrentPeriod,
      activeTierRange: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
      dayOffCapacity: [],
      events: [],
    })
  })

  await page.route('**/api/days-off-bids/current', async (route) => {
    await fulfillJson(route, daysOffDraft)
  })

  await page.route('**/api/pairing-bids/current', async (route) => {
    await fulfillJson(route, pairingDraft)
  })

  await page.route('**/api/line-bids/current', async (route) => {
    await fulfillJson(route, emptyRuleBidDraft('line-draft-closed', 3001))
  })

  await page.route('**/api/reserve-bids/current', async (route) => {
    await fulfillJson(route, emptyRuleBidDraft('reserve-draft-closed', 3002))
  })

  await page.route('**/api/lineholder-bids/current/summary', async (route) => {
    await fulfillJson(route, lineholderSummary)
  })

  await page.route('**/api/pairing-search/current-rules/tier-pools', async (route) => {
    await fulfillJson(route, {
      mode: 'current_rules_tier_pools',
      periodCode: 'Jun 2026',
      computedAt: '2026-05-09T03:00:00.000Z',
      packageTotal: { pairingIdCount: 0, totalItems: 0 },
      rows: [
        {
          tier: 'T1',
          activePropertyCount: 1,
          txSet: { pairingIdCount: 0, totalItems: 0 },
          totalPairings: { pairingIdCount: 0, totalItems: 0 },
          pairingsByTx: { pairingIdCount: 0, totalItems: 0 },
          status: 'success',
        },
      ],
    })
  })

  await page.route('**/api/pairing-search/current-rules/counts', async (route) => {
    await fulfillJson(route, {
      mode: 'current_rules_counts',
      periodCode: 'Jun 2026',
      tier: 'T1',
      computedAt: '2026-05-09T03:00:00.000Z',
      summary: {
        activePropertyCount: 1,
        allRules: { pairingIdCount: 0, totalItems: 0 },
      },
      rows: [
        {
          propertyGroupKey: 'pairing-length-closed',
          propertyCode: 131,
          name: 'Prefer Pairing Length',
          activePropertyCount: 1,
          rule: { pairingIdCount: 0, totalItems: 0 },
          funnel: { pairingIdCount: 0, totalItems: 0 },
        },
      ],
    })
  })

  await page.route('**/api/pairing-search/preview', async (route) => {
    await fulfillJson(route, {
      mode: 'single_property_preview',
      property: {
        propertyCode: 103,
        name: 'Pairing Check-In / Check-Out Time',
        action: 'award',
        quantifier: null,
        bid: {
          type: 'pairing-check-time',
          timeType: 'check_in',
          operator: 'Between',
          from: '14:00',
          to: '22:00',
          dateScope: null,
        },
      },
      summary: {
        pairingIdCount: 1,
        totalItems: 1,
      },
      pagination: {
        page: 1,
        pageSize: 30,
        totalItems: 1,
        totalPages: 1,
      },
      results: [
        {
          id: 'closed-search-result-e4101',
          pairingId: '10964',
          pairingNumber: 'E4101',
          base: 'YYZ',
          originDate: '2026-06-04',
          endDate: '2026-06-05',
          startDateLabel: 'Jun 4, 2026',
          compositionLabel: 'CA(1)FO(1)',
          reportTime: '1400',
          priorityLabel: 'P1',
          prioritySequence: '02',
          totalBlock: '369',
          totalCredit: '369',
          totalDp: '-',
          totalPay: '610',
          activeDates: ['2026-06-04', '2026-06-05'],
          legs: [],
        },
      ],
    })
  })

  await page.route('**/api/pairing-bids/current/properties/**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Closed period test should not save.' }),
    })
  })

  await page.route('**/api/days-off-bids/current/properties/**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Closed period test should not save.' }),
    })
  })
}

test.use({
  storageState: { cookies: [], origins: [] },
})

test('PBS-BID-READONLY-001 — closed period existing bid rows hide delete actions', async ({ page }) => {
  const propertyDeleteRequests: string[] = []

  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockBidApis(page)
  page.on('request', (request) => {
    const url = request.url()

    if (
      request.method() === 'DELETE'
      && url.includes('/api/')
      && url.includes('/current/properties/')
    ) {
      propertyDeleteRequests.push(url)
    }
  })

  await page.goto('bid')

  const bidPage = page.getByTestId('bid-page')
  await expect(bidPage).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('bidding-calendar-current-period-status')).toContainText('Bidding closed for Jun 2026')

  const existingRegion = bidPage.getByTestId('bid-existing-properties-scroll')
  await expect(existingRegion.getByTestId('tier-summary-row')).toHaveCount(2)
  await expect(existingRegion.getByRole('button', { name: /^Delete / })).toHaveCount(0)
  await expect(existingRegion.getByRole('button', { name: 'Open detail for T1 Award Prefer Pairing Length = 4' })).toBeVisible()
  await expect(page.getByText('Delete this bid from the current draft?')).toHaveCount(0)
  expect(propertyDeleteRequests).toEqual([])
})

test('PBS-PAIRING-READONLY-001 — closed period existing Pairing edit does not show UPDATING', async ({ page }) => {
  const propertyPatchRequests: string[] = []

  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockBidApis(page)
  page.on('request', (request) => {
    const url = request.url()

    if (
      request.method() === 'PATCH'
      && url.includes('/api/pairing-bids/current/properties/')
    ) {
      propertyPatchRequests.push(url)
    }
  })

  await page.goto('bid')

  const bidPage = page.getByTestId('bid-page')
  await expect(bidPage).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('bidding-calendar-current-period-status')).toContainText('Bidding closed for Jun 2026')
  await expect(bidPage.getByText('Award Prefer Pairing Length = 4')).toBeVisible()

  await bidPage.getByRole('button', { name: 'Open detail for T1 Award Prefer Pairing Length = 4' }).click()

  await expect(page.getByText('Bidding closed at May 08, 22:59.')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Configure Prefer Pairing Length' })).toHaveCount(0)
  await expect(page.getByText('UPDATING...')).toHaveCount(0)
  expect(propertyPatchRequests).toEqual([])
})

test('PBS-PAIRING-READONLY-002 — closed period Search Pairings existing edit stays read-only', async ({ page }) => {
  const propertyPatchRequests: string[] = []

  await page.addInitScript(({ authTokenKey, state }) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')

    if (window.location.pathname.endsWith('/bid/pairing/search')) {
      window.history.replaceState(
        {
          idx: 0,
          key: 'closed-search-pairings-existing-edit',
          usr: state,
        },
        '',
        window.location.href,
      )
    }
  }, {
    authTokenKey: AUTH_TOKEN_KEY,
    state: {
      previewProperty: {
        propertyCode: 103,
        name: 'Pairing Check-In / Check-Out Time',
        action: 'award',
        quantifier: null,
        bid: {
          type: 'pairing-check-time',
          timeType: 'check_in',
          operator: 'Between',
          from: '14:00',
          to: '22:00',
          dateScope: null,
        },
        tiers: [
          { key: 'T1', label: 'T1', active: true },
          { key: 'T2', label: 'T2', active: false },
          { key: 'T3', label: 'T3', active: false },
          { key: 'T4', label: 'T4', active: false },
          { key: 'T5', label: 'T5', active: false },
          { key: 'T6', label: 'T6', active: false },
          { key: 'T7', label: 'T7', active: false },
        ],
        favorited: false,
        pairingNumber: '',
        pairingType: 'Regular',
        effectiveDateRange: { from: '2026-06-01', to: '2026-06-30' },
      },
      previewSource: {
        type: 'existing',
        propertyGroupKey: 'pairing-check-time-closed',
      },
      draftMeta: {
        ...pairingDraft.draft,
        currentPeriod: closedCurrentPeriod,
      },
    },
  })
  await mockBidApis(page)
  page.on('request', (request) => {
    const url = request.url()

    if (
      request.method() === 'PATCH'
      && url.includes('/api/pairing-bids/current/properties/')
    ) {
      propertyPatchRequests.push(url)
    }
  })

  await page.goto('bid/pairing/search')
  await page.waitForURL(/\/pairing\/search$/, { timeout: 15_000 })

  const searchPanel = page.getByTestId('pairing-search-panel')
  await expect(searchPanel).toBeVisible({ timeout: 15_000 })
  await expect(searchPanel.getByText('Pairing Check-In / Check-Out Time')).toBeVisible()
  await expect(searchPanel.getByText('E4101')).toBeVisible()

  await expect(
    searchPanel.getByRole('button', { name: 'Edit search criteria Pairing Check-In / Check-Out Time' }),
  ).toBeDisabled()
  await expect(page.getByRole('dialog', { name: 'Configure Pairing Check-In / Check-Out Time' })).toHaveCount(0)
  await expect(page.getByText('UPDATING...')).toHaveCount(0)
  expect(propertyPatchRequests).toEqual([])
})

test('PBS-DAYS-OFF-READONLY-001 — closed period Days Off add entry does not show ADDING', async ({ page }) => {
  const propertyWriteRequests: string[] = []

  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockBidApis(page)
  page.on('request', (request) => {
    const url = request.url()

    if (
      ['POST', 'PUT', 'PATCH'].includes(request.method())
      && url.includes('/api/days-off-bids/current/properties')
    ) {
      propertyWriteRequests.push(url)
    }
  })

  await page.goto('bid')

  const bidPage = page.getByTestId('bid-page')
  await expect(bidPage).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('bidding-calendar-current-period-status')).toContainText('Bidding closed for Jun 2026')
  await expect(bidPage.getByText('Prefer off on Jun 10, 2026')).toBeVisible()

  await bidPage.getByRole('tab', { name: 'DAYS OFF' }).click()
  const workspace = page.getByTestId('rule-bid-add-properties-workspace')
  await expect(workspace).toBeVisible()
  await expect(workspace.getByRole('button', { name: 'Add Prefer Off' })).toBeDisabled()

  await expect(page.getByRole('dialog', { name: 'Configure Prefer Off' })).toHaveCount(0)
  await expect(page.getByText('ADDING...')).toHaveCount(0)
  expect(propertyWriteRequests).toEqual([])
})
