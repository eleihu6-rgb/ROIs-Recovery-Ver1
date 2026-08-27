import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

const currentPeriod = {
  id: 38,
  rosterPeriodId: 38,
  rosterPeriodKey: '2026RP06',
  periodCode: 'Jun 2026',
  rpStartLocal: '2026-06-01',
  rpEndLocal: '2026-06-30',
  filiale: 'F8',
  division: 'C',
  status: 'OPEN',
  computedStage: 'OPEN',
  bidOpenAt: '2026-05-01T00:00:00.000Z',
  bidCloseAt: '2026-05-08T23:59:00.000Z',
  canEditBid: true,
  readOnlyReason: null,
}

const pbsDaysOffPropertyCatalog = [
  { propertyCode: 201, name: 'Prefer Off', defaultBid: { type: 'tag-list', values: [], suggestions: [] } },
  { propertyCode: 202, name: 'Max Consecutive Days On', defaultBid: { type: 'stepper', value: 5, min: 1, max: 14 } },
  { propertyCode: 203, name: 'Min Consecutive Days Off', defaultBid: { type: 'stepper', value: 2, min: 1, max: 14 } },
  { propertyCode: 204, name: 'Long Stretch Off / Compressed Flying', defaultBid: { type: 'stepper-date-range', value: 10, from: '2026-06-01', to: '2026-06-30', min: 1, max: 14 } },
  { propertyCode: 205, name: 'Days Off / Days On Pattern', defaultBid: { type: 'days-off-on-pattern', minDaysOff: 3, minDaysOn: 3, maxDaysOn: 5, min: 1, max: 14 } },
  { propertyCode: 206, name: 'Employee Schedule Preference', defaultBid: { type: 'employee-schedule-preference', crewId: '', relationship: 'together', scheduleType: 'days_off', thresholdType: 'minimum', days: 1, min: 1, max: 31 } },
]

const pbsPairingPropertyCatalog = [
  { propertyCode: 102, name: 'Pairing Preference', defaultBid: { type: 'pairing-preference', pairingIds: [], pairingLabels: [] } },
  {
    propertyCode: 103,
    name: 'Pairing Check-In / Check-Out Time',
    defaultBid: {
      type: 'pairing-check-time',
      timeType: 'check_in',
      operator: 'Between',
      from: '',
      to: '',
      dateScope: null,
    },
  },
  {
    propertyCode: 107,
    name: 'Flight Legs per Duty',
    defaultBid: { type: 'flight-legs-per-duty', operator: '=', legs: 2, dateScope: null },
    numericBounds: { min: 1, max: 8 },
  },
  { propertyCode: 110, name: 'Work Day Preference', defaultBid: { type: 'work-day-preference', days: [], dateScope: null } },
  {
    propertyCode: 112,
    name: 'Pairing Length',
    defaultBid: {
      type: 'pairing-length-preference',
      minDays: null,
      maxDays: null,
      dateScope: null,
      min: 1,
      max: 7,
    },
  },
  {
    propertyCode: 116,
    name: 'Flight Number Preference',
    defaultBid: {
      type: 'flight-number-preference',
      flightNumbers: [],
      dateScope: null,
    },
  },
  {
    propertyCode: 117,
    name: 'Redeye Preference',
    defaultAction: 'avoid',
    defaultBid: {
      type: 'redeye-preference',
      dateScope: null,
    },
  },
  {
    propertyCode: 122,
    name: 'Deadhead Flying',
    defaultAction: 'award',
    defaultBid: {
      type: 'deadhead-flying',
      mode: 'any-deadhead',
      dateScope: null,
    },
    supportedActions: ['award', 'avoid'],
  },
  {
    propertyCode: 129,
    name: 'Time Between Flights',
    defaultBid: {
      type: 'duration',
      value: '',
      operator: '>',
    },
  },
  {
    propertyCode: 163,
    name: 'Month-End Carryover',
    defaultBid: {
      type: 'month-end-carryover',
      operator: '>',
      days: null,
    },
  },
  {
    propertyCode: 168,
    name: 'Airport Preference',
    defaultBid: {
      type: 'airport-preference',
      event: 'landing',
      locations: [],
      dateScope: null,
      minimumLayoverDuration: null,
    },
  },
]

const pbsLinePropertyCatalog = [
  { propertyCode: 401, name: 'Max Credit Window', defaultBid: { type: 'flag' } },
  { propertyCode: 402, name: 'Min Credit Window', defaultBid: { type: 'flag' } },
  { propertyCode: 404, name: 'No Same Day Pairings', defaultBid: { type: 'flag' } },
  { propertyCode: 405, name: 'Waive No Same Day Duty Starts', defaultBid: { type: 'flag' } },
  { propertyCode: 406, name: 'Forget Line', defaultBid: { type: 'flag' } },
  { propertyCode: 408, name: 'Commuter Pattern', defaultBid: { type: 'days-off-on-pattern', minDaysOff: 4, minDaysOn: 4, maxDaysOn: 5, min: 1, max: 14 } },
]

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const catalogByCodes = <T extends { propertyCode: number }>(
  catalog: readonly T[],
  propertyCodes: number[],
): T[] => {
  const propertyCodeSet = new Set(propertyCodes)
  return catalog.filter((property) => propertyCodeSet.has(property.propertyCode))
}

type MockDraftProperty = {
  propertyGroupKey: string
  rowSeq: number
  propertyCode: number
  name: string
  bid: Record<string, unknown>
  tiers: string[]
  action?: 'award' | 'avoid' | null
  quantifier?: 'any' | 'every' | null
  allOrNothing?: boolean
  minimumN?: number | null
  maximumN?: number | null
}

const buildDraft = (periodCode = 'Jun 2026', properties: MockDraftProperty[] = []) => ({
  draftVersion: 0,
  periodCode,
  bidContext: 'Current',
  properties,
})

const mockWorkbenchApis = async (
  page: Page,
  options: {
    compactFavoriteFixtures?: boolean
    daysOffDraftProperties?: MockDraftProperty[]
    includeMergedBidSummary?: boolean
    omitExistingLineProperty?: boolean
    pairingDraftProperties?: MockDraftProperty[]
  } = {},
) => {
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
      base: 'YVR',
      rank: 'FA',
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

  await page.route('**/api/lineholder-bids/current/summary', async (route) => {
    await fulfillJson(route, {
      draftVersion: 0,
      periodCode: 'Jun 2026',
      bidContext: 'Current',
      statistics: [
        {
          tier: 'T1',
          totalItems: (options.includeMergedBidSummary ? 4 : 2)
            + (options.daysOffDraftProperties?.length ?? 0),
          pairingCount: 2,
          lineCount: options.includeMergedBidSummary ? 1 : 0,
          daysOffCount: (options.includeMergedBidSummary ? 1 : 0)
            + (options.daysOffDraftProperties?.length ?? 0),
        },
      ],
      summaryItems: [
        ...(options.includeMergedBidSummary ? [
          {
            id: 'existing-days-off-prefer',
            groupKey: 'existing-days-off-prefer',
            bidType: 'DaysOff',
            action: 'Award',
            label: 'Prefer Off',
            bid: 'Jun 18, 2026',
            value: 'Jun 18, 2026',
            readableText: 'Award day off on Jun 18, 2026',
            tiers: ['T1'],
            editableSource: {
              module: 'DaysOff',
              propertyGroupKey: 'existing-days-off-prefer-range',
            },
          },
        ] : []),
        {
          id: 'existing-pairing-length',
          groupKey: 'existing-pairing-length',
          bidType: 'Pairing',
          action: 'Award',
          label: 'Pairing Length',
          bid: '1–3 days long',
          value: '1–3 days long',
          readableText: 'Award pairings 1–3 days long',
          tiers: ['T1'],
          editableSource: {
            module: 'Pairing',
            propertyGroupKey: 'existing-pairing-length',
          },
        },
        {
          id: 'existing-pairing-number',
          groupKey: 'existing-pairing-number',
          bidType: 'Pairing',
          action: 'Award',
          label: 'Pairing Preference',
          bid: 'E4101, E4103, E4106, E4108',
          value: 'E4101, E4103, E4106, E4108',
          readableText: 'Award Pairing Preference: E4101, E4103, E4106, E4108',
          tiers: ['T1'],
          editableSource: {
            module: 'Pairing',
            propertyGroupKey: 'existing-pairing-number',
          },
        },
        ...(options.includeMergedBidSummary ? [
          {
            id: 'existing-line-max-credit',
            groupKey: 'existing-line-max-credit',
            bidType: 'Line',
            action: 'Award',
            label: 'Max Credit Window',
            bid: 'Enabled',
            value: 'Enabled',
            readableText: 'Award max credit window',
            tiers: ['T1'],
            editableSource: {
              module: 'Line',
              propertyGroupKey: 'existing-line-max-credit',
            },
          },
        ] : []),
        ...(options.pairingDraftProperties ?? []).map((property) => ({
          id: property.propertyGroupKey,
          groupKey: property.propertyGroupKey,
          bidType: 'Pairing',
          action: property.action === 'avoid' ? 'Avoid' : 'Award',
          label: property.name,
          bid: property.name,
          value: property.name,
          readableText: `${property.action === 'avoid' ? 'Avoid' : 'Award'} ${property.name}`,
          tiers: property.tiers,
          editableSource: {
            module: 'Pairing',
            propertyGroupKey: property.propertyGroupKey,
          },
        })),
        ...(options.daysOffDraftProperties ?? []).map((property) => ({
          id: property.propertyGroupKey,
          groupKey: property.propertyGroupKey,
          bidType: 'DaysOff',
          action: 'Award',
          label: property.name,
          bid: property.name,
          value: property.name,
          readableText: `${property.name} needs review`,
          tiers: property.tiers,
          editableSource: {
            module: 'DaysOff',
            propertyGroupKey: property.propertyGroupKey,
          },
        })),
      ],
      warnings: [],
      diagnostics: [],
    })
  })

  await page.route('**/api/days-off-bids/current', async (route) => {
    await fulfillJson(route, {
      currentPeriod,
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
      draft: buildDraft('Jun 2026', [
        {
          propertyGroupKey: 'existing-days-off-prefer-range',
          rowSeq: 1,
          propertyCode: 201,
          name: 'Prefer Off',
          bid: { type: 'tag-list', values: ['Between 2026-06-18 - 2026-06-21'] },
          tiers: ['T1'],
        },
        {
          propertyGroupKey: 'existing-days-off-prefer-dates',
          rowSeq: 2,
          propertyCode: 201,
          name: 'Prefer Off',
          bid: {
            type: 'tag-list',
            values: ['2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06'],
          },
          tiers: ['T1'],
          allOrNothing: true,
          minimumN: 2,
        },
        ...(options.daysOffDraftProperties ?? []),
      ]),
      propertyCatalog: catalogByCodes(pbsDaysOffPropertyCatalog, [201, 204]),
      favoriteProperties: options.compactFavoriteFixtures ? [
        {
          favoriteKey: 'compact-days-off-1',
          propertyId: 201,
          propertyCode: 201,
          name: 'Prefer Off',
          bid: { type: 'tag-list', values: ['Weekends'], suggestions: [] },
          allOrNothing: false,
          minimumN: null,
        },
        {
          favoriteKey: 'compact-days-off-2',
          propertyId: 201,
          propertyCode: 201,
          name: 'Prefer Off',
          bid: { type: 'tag-list', values: ['Weekends'], suggestions: [] },
          allOrNothing: false,
          minimumN: null,
        },
        {
          favoriteKey: 'compact-days-off-3',
          propertyId: 201,
          propertyCode: 201,
          name: 'Long Stretch Off / Compressed Flying',
          bid: {
            type: 'tag-list',
            values: ['10 consecutive days between 2026-06-03 – 2026-06-13'],
            suggestions: [],
          },
          allOrNothing: false,
          minimumN: null,
        },
        {
          favoriteKey: 'compact-days-off-4',
          propertyId: 201,
          propertyCode: 201,
          name: 'Prefer Off',
          bid: { type: 'tag-list', values: ['Window 08:00-18:00'], suggestions: [] },
          allOrNothing: false,
          minimumN: null,
        },
        {
          favoriteKey: 'compact-days-off-5',
          propertyId: 201,
          propertyCode: 201,
          name: 'Prefer Off',
          bid: {
            type: 'tag-list',
            values: [
              '2026-06-01',
              '2026-06-03',
              '2026-06-05',
              '2026-06-07',
              '2026-06-09',
              '2026-06-11',
              '2026-06-13',
            ],
            suggestions: [],
          },
          allOrNothing: false,
          minimumN: null,
        },
      ] : [
        {
          favoriteKey: 'favorite-days-off-201',
          propertyId: 201,
          propertyCode: 201,
          name: 'Prefer Off',
          bid: { type: 'tag-list', values: ['Weekends'], suggestions: [] },
          allOrNothing: true,
          minimumN: 1,
        },
      ],
      recommendedPropertyCodes: [201],
    })
  })

  await page.route('**/api/pairing-bids/current', async (route) => {
    await fulfillJson(route, {
      currentPeriod,
      draft: buildDraft('Jun 2026', [
        {
          propertyGroupKey: 'existing-pairing-length',
          rowSeq: 1,
          propertyCode: 112,
          name: 'Pairing Length',
          action: 'award',
          quantifier: null,
          bid: {
            type: 'pairing-length-preference',
            minDays: 1,
            maxDays: 3,
            dateScope: null,
            min: 1,
            max: 7,
          },
          tiers: ['T1'],
        },
        {
          propertyGroupKey: 'existing-pairing-number',
          rowSeq: 2,
          propertyCode: 102,
          name: 'Pairing Preference',
          action: 'award',
          quantifier: null,
          bid: {
            type: 'pairing-preference',
            pairingIds: ['4101', '4103', '4106', '4108'],
            pairingLabels: ['E4101', 'E4103', 'E4106', 'E4108'],
          },
          tiers: ['T1'],
          pairingNumber: '',
          pairingType: 'Regular',
          effectiveDateRange: { from: '2026-06-01', to: '2026-06-30' },
        },
        ...(options.pairingDraftProperties ?? []),
      ]),
      propertyCatalog: catalogByCodes(pbsPairingPropertyCatalog, [102, 103, 107, 110, 112, 116, 117, 122, 129, 163, 168]),
      favoriteProperties: [
        {
          favoriteKey: 'favorite-pairing-163',
          propertyId: 163,
          propertyCode: 163,
          name: 'Month-End Carryover',
          action: 'award',
          quantifier: null,
          bid: { type: 'month-end-carryover', operator: '>', days: 3 },
          pairingNumber: '',
          pairingType: 'All Types',
          effectiveDateRange: { from: '', to: '' },
        },
      ],
      recommendedPropertyCodes: [102, 168, 103, 107, 110],
    })
  })

  await page.route('**/api/pairing-bids/redeye-config', async (route) => {
    await fulfillJson(route, {
      available: true,
      startTime: '23:00',
      endTime: '05:00',
      crossesMidnight: true,
      version: '23:00|05:00',
    })
  })

  await page.route('**/api/pairing-search/current-rules/counts', async (route) => {
    await fulfillJson(route, {
      mode: 'current_rules_counts',
      periodCode: 'Jun 2026',
      tier: 'T1',
      computedAt: '2026-06-11T00:00:00.000Z',
      summary: {
        activePropertyCount: 0,
        allRules: null,
      },
      rows: [],
    })
  })

  await page.route('**/api/pairing-search/current-rules/tier-pools', async (route) => {
    await fulfillJson(route, {
      mode: 'current_rules_tier_pools',
      periodCode: 'Jun 2026',
      computedAt: '2026-06-11T00:00:00.000Z',
      packageTotal: {
        pairingIdCount: 0,
        totalItems: 0,
      },
      rows: [],
    })
  })

  await page.route('**/api/pairing-search/airport-options**', async (route) => {
    await fulfillJson(route, {
      airportPreferenceLayoverHours: { minHours: 13, maxHours: 18, stepHours: 1, defaultHours: 13 },
      airportPreferenceOptions: [
        { code: 'YVR', kind: 'airport', label: 'YVR · Vancouver International', events: ['landing'] },
        { code: 'YYZ', kind: 'airport', label: 'YYZ · Toronto Pearson', events: ['layover'] },
        { code: 'YYZ', kind: 'city', label: 'YYZ · Toronto', events: ['layover'] },
      ],
      landingAirports: ['YVR'],
      layoverAirports: ['YYZ'],
      workStartStations: ['YVR'],
    })
  })

  await page.route('**/api/pairing-search/flight-numbers**', async (route) => {
    const searchParams = new URL(route.request().url()).searchParams
    const selectedType = searchParams.get('type')

    await fulfillJson(route, {
      query: searchParams.get('query') ?? '',
      limit: 20,
      options: selectedType === 'charter'
        ? [{ value: '7001', label: '7001' }]
        : selectedType === 'positioning-charter-network'
          ? [{ value: '9900', label: '9900' }]
          : selectedType === 'recovery-charter-network'
            ? [{ value: '9950', label: '9950' }]
            : [
                { value: '0601', label: '0601' },
                { value: '0609', label: '0609' },
              ],
    })
  })

  await page.route('**/api/pairing-search/time-between-flights-bounds**', async (route) => {
    await fulfillJson(route, {
      minimumMinutes: 45,
      maximumMinutes: 260,
    })
  })

  await page.route('**/api/pairing-search/preview', async (route) => {
    await fulfillJson(route, {
      mode: 'criteria_preview',
      properties: [
        {
          propertyGroupKey: 'criteria-pairing-number',
          rowSeq: 1,
          propertyCode: 102,
          name: 'Pairing Preference',
          action: 'award',
          quantifier: null,
          bid: {
            type: 'pairing-preference',
            pairingIds: ['4101', '4103', '4106'],
            pairingLabels: ['E4101', 'E4103', 'E4106'],
          },
          tiers: ['T1'],
        },
      ],
      summary: {
        pairingIdCount: 6,
        totalItems: 6,
      },
      pagination: {
        page: 1,
        pageSize: 30,
        totalItems: 0,
        totalPages: 1,
      },
      results: [],
    })
  })

  await page.route('**/api/line-bids/current', async (route) => {
    await fulfillJson(route, {
      currentPeriod,
      draft: buildDraft('Jun 2026', options.omitExistingLineProperty ? [] : [
        {
          propertyGroupKey: 'existing-line-max-credit',
          rowSeq: 1,
          propertyCode: 401,
          name: 'Max Credit Window',
          bid: { type: 'flag' },
          tiers: ['T1'],
        },
      ]),
      propertyCatalog: catalogByCodes(pbsLinePropertyCatalog, [401, 402, 404, 405, 406, 408]),
      favoriteProperties: [
        {
          favoriteKey: 'favorite-line-401',
          propertyId: 401,
          propertyCode: 401,
          name: 'Max Credit Window',
          bid: { type: 'flag' },
        },
      ],
      recommendedPropertyCodes: [402, 401, 404, 405],
    })
  })
}

test('PBS-3610 — unified Bid favorites use compact single-row cards with icon actions', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page, { compactFavoriteFixtures: true })
  let keyboardAddRequestCount = 0
  await page.route('**/api/days-off-bids/current/properties', async (route) => {
    keyboardAddRequestCount += 1
    await fulfillJson(route, {
      saved: true,
      draftVersion: 2,
      propertyGroupKey: 'keyboard-added-favorite',
      rowSeq: 3,
    })
  })

  await page.goto('bid')

  const workspace = page.getByTestId('bid-available-properties-scroll')
  const cards = workspace.locator('[data-compact-favorite-card="true"]')
  await expect(cards).toHaveCount(7)
  await expect(workspace.getByText('Condition', { exact: true })).toHaveCount(0)
  await expect(workspace.getByText('Select Tx', { exact: true })).toHaveCount(0)

  const cardHeights = await cards.evaluateAll((elements) => (
    elements.slice(0, 4).map((element) => element.getBoundingClientRect().height)
  ))
  expect(cardHeights).toHaveLength(4)
  for (const height of cardHeights) {
    expect(height).toBeGreaterThanOrEqual(56)
    expect(height).toBeLessThanOrEqual(72)
  }

  const scrollBox = await workspace.boundingBox()
  const thirdCardBox = await cards.nth(2).boundingBox()
  expect(scrollBox).not.toBeNull()
  expect(thirdCardBox).not.toBeNull()
  expect(thirdCardBox!.y + thirdCardBox!.height).toBeLessThanOrEqual(
    scrollBox!.y + scrollBox!.height,
  )

  const firstCard = cards.first()
  const tierButtons = firstCard.getByRole('button', { name: /Select T[1-7] for favorite Prefer Off/ })
  await expect(tierButtons).toHaveCount(7)
  await expect(firstCard.getByRole('button', { name: 'Edit favorite Prefer Off' })).toBeVisible()
  await expect(firstCard.getByRole('button', { name: 'Remove favorite Prefer Off' })).toBeVisible()
  const addButton = firstCard.getByRole('button', { name: 'Add Prefer Off' })
  await expect(addButton).toBeDisabled()
  await expect(addButton).toHaveText('')
  await expect(firstCard.getByText('Add to Bid', { exact: true })).toHaveCount(0)
  const iconButtonSizes = await firstCard.locator('button[aria-label]').evaluateAll((buttons) => (
    buttons
      .filter((button) => /^(Edit favorite|Remove favorite|Add )/.test(button.getAttribute('aria-label') ?? ''))
      .map((button) => {
        const bounds = button.getBoundingClientRect()
        return { height: bounds.height, width: bounds.width }
      })
  ))
  expect(iconButtonSizes).toHaveLength(3)
  for (const size of iconButtonSizes) {
    expect(size.height).toBeGreaterThanOrEqual(28)
    expect(size.width).toBeGreaterThanOrEqual(28)
  }

  const firstContentBox = await firstCard.locator('[data-favorite-card-content="true"]').boundingBox()
  const firstTierGroupBox = await firstCard.locator('[data-favorite-card-tiers="true"]').boundingBox()
  expect(firstContentBox).not.toBeNull()
  expect(firstTierGroupBox).not.toBeNull()
  expect(Math.abs(
    firstContentBox!.y + firstContentBox!.height / 2
      - (firstTierGroupBox!.y + firstTierGroupBox!.height / 2),
  )).toBeLessThanOrEqual(1)

  await tierButtons.first().click()
  await expect(addButton).toBeEnabled()
  await addButton.focus()
  await expect(addButton).toBeFocused()
  await addButton.press('Enter')
  await expect.poll(() => keyboardAddRequestCount).toBe(1)
  await expect(addButton).toBeDisabled()

  const longSummary = workspace
    .getByLabel('Favorite bid for Prefer Off')
    .filter({ hasText: '2026-06-13' })
  await expect(longSummary).toContainText('2026-06-13')
  expect(await longSummary.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)

  await firstCard.getByRole('button', { name: 'Remove favorite Prefer Off' }).click()
  await expect(page.getByText('Remove this favorite?')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel removing favorite Prefer Off' }).click()
  await expect(page.getByText('Remove this favorite?')).toHaveCount(0)

  const pairingCard = cards.filter({ hasText: 'Month-End Carryover' })
  const compactPairingHeight = await pairingCard.evaluate((element) => element.getBoundingClientRect().height)
  const pairingDeleteButton = pairingCard.getByRole('button', { name: 'Delete favorite Month-End Carryover' })
  await pairingDeleteButton.click()
  await expect(pairingCard.getByText('Remove this favorite?')).toBeVisible()
  expect(await pairingCard.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(
    compactPairingHeight,
  )
  const pairingDeleteCancelButton = pairingCard.getByRole('button', { name: 'Cancel' })
  await expect(pairingDeleteCancelButton).toBeFocused()
  await pairingDeleteCancelButton.click()
  await expect(pairingCard.getByText('Remove this favorite?')).toHaveCount(0)
  await expect(pairingDeleteButton).toBeFocused()

  await page.setViewportSize({ width: 1366, height: 768 })
  await firstCard.scrollIntoViewIfNeeded()
  const tierButtonTops = await tierButtons.evaluateAll((elements) => (
    elements.map((element) => Math.round(element.getBoundingClientRect().top))
  ))
  expect(Math.max(...tierButtonTops) - Math.min(...tierButtonTops)).toBeLessThanOrEqual(1)

  const longTextCard = cards.filter({ hasText: 'Long Stretch Off / Compressed Flying' })
  const longTextCardBox = await longTextCard.boundingBox()
  const longTextContentBox = await longTextCard.locator('[data-favorite-card-content="true"]').boundingBox()
  const longTextTierBox = await longTextCard.locator('[data-favorite-card-tiers="true"]').boundingBox()
  const longTextActionsBox = await longTextCard.locator('[data-favorite-card-actions="true"]').boundingBox()
  expect(longTextCardBox).not.toBeNull()
  expect(longTextContentBox).not.toBeNull()
  expect(longTextTierBox).not.toBeNull()
  expect(longTextActionsBox).not.toBeNull()
  expect(longTextContentBox!.x + longTextContentBox!.width).toBeLessThan(longTextTierBox!.x)
  expect(longTextTierBox!.x + longTextTierBox!.width).toBeLessThan(longTextActionsBox!.x)
  expect(longTextActionsBox!.x + longTextActionsBox!.width).toBeLessThanOrEqual(
    longTextCardBox!.x + longTextCardBox!.width,
  )
  await expect(firstCard).toBeInViewport()
})

test('PBS-3603 — Pairing row PREVIEW sends exactly one property through the single-property contract', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)
  await page.unroute('**/api/pairing-search/preview')
  await page.route('**/api/pairing-search/preview', async (route) => {
    const requestBody = route.request().postDataJSON()

    expect(route.request().method()).toBe('POST')
    expect(requestBody.periodCode).toBe('Jun 2026')
    expect(requestBody.preview.mode).toBeUndefined()
    expect(requestBody.preview.properties).toBeUndefined()
    expect(requestBody.preview.property).toMatchObject({
      propertyCode: 112,
      name: 'Pairing Length',
      action: 'award',
      bid: {
        type: 'pairing-length-preference',
        minDays: 1,
        maxDays: 3,
      },
    })

    await fulfillJson(route, {
      mode: 'single_property_preview',
      property: requestBody.preview.property,
      summary: { pairingIdCount: 0, totalItems: 0 },
      pagination: { page: 1, pageSize: 30, totalItems: 0, totalPages: 1 },
      results: [],
    })
  })

  await page.goto('bid')
  const workspace = page.getByTestId('bid-page')
  await expect(workspace).toBeVisible({ timeout: 60_000 })
  await workspace.getByRole('tab', { name: 'PAIRING' }).click()
  await workspace.getByRole('button', { name: 'Preview Award pairings 1–3 days long' }).click()

  await page.waitForURL(/\/bid\/pairing\/search$/, { timeout: 15_000 })
  await expect(page.getByTestId('pairing-search-panel')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByLabel('Bid for search criteria Pairing Length')).toContainText(
    'Award pairings 1–3 days long',
  )
})

test('PBS-3636 — Current Summary never exposes structured Pairing bid JSON', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)
  await page.unroute('**/api/lineholder-bids/current/summary')
  await page.route('**/api/lineholder-bids/current/summary', async (route) => {
    await fulfillJson(route, {
      draftVersion: 146,
      periodCode: 'Jun 2026',
      bidContext: 'Current',
      statistics: [
        { tier: 'T1', totalItems: 2, pairingCount: 2, lineCount: 0, daysOffCount: 0 },
        { tier: 'T2', totalItems: 1, pairingCount: 1, lineCount: 0, daysOffCount: 0 },
      ],
      summaryItems: [
        {
          id: 'pairing-flight-number',
          groupKey: 'pairing-flight-number',
          bidType: 'Pairing',
          action: 'Award',
          label: 'Flight Number Preference',
          bid: 'I7013, I7153 on Jun 30, 2026',
          value: 'I7013, I7153 on Jun 30, 2026',
          readableText: 'Award pairings with flights I7013, I7153 on Jun 30, 2026',
          tiers: ['T1'],
          editableSource: { module: 'Pairing', propertyGroupKey: 'pairing-flight-number' },
        },
        {
          id: 'pairing-length',
          groupKey: 'pairing-length',
          bidType: 'Pairing',
          action: 'Award',
          label: 'Pairing Length',
          bid: '2–3 days long',
          value: '2–3 days long',
          readableText: 'Award pairings 2–3 days long',
          tiers: ['T1', 'T2'],
          editableSource: { module: 'Pairing', propertyGroupKey: 'pairing-length' },
        },
      ],
      warnings: [],
      diagnostics: [],
    })
  })

  await page.goto('bid')
  const workspace = page.getByTestId('bid-page')
  await expect(workspace).toBeVisible({ timeout: 60_000 })
  await workspace.getByRole('tab', { name: 'PAIRING' }).click()

  await expect(workspace.getByText('Award pairings with flights I7013, I7153 on Jun 30, 2026')).toBeVisible()
  await expect(workspace.getByText('Award pairings 2–3 days long')).toBeVisible()
  await expect(workspace.getByText('T1', { exact: true }).first()).toBeVisible()
  await expect(workspace.getByText('T2', { exact: true })).toBeVisible()
  await expect(workspace).not.toContainText('{"type":')
  await expect(workspace).not.toContainText('flight-number-preference')
  await expect(workspace).not.toContainText('pairing-length-preference')

  const leakedAccessibleText = await workspace.locator('[title], [aria-label]').evaluateAll((elements) =>
    elements
      .flatMap((element) => [element.getAttribute('title'), element.getAttribute('aria-label')])
      .filter((value): value is string => Boolean(value) && value.includes('{"type":')),
  )
  expect(leakedAccessibleText).toEqual([])
})

test('PBS-BID-REVIEW-TOOLTIP — truncated Bid Review messages expose their full text', async ({ page }) => {
  const longMessage = 'This bid appears in T1 and T2. Review whether it should apply to multiple Tx and confirm the intended tier distribution before submitting the bid. The same pairing preference is repeated across nearby tiers, so verify the priority and remove any unintended duplicate placement before the bidding window closes.'
  const shortMessage = 'OK'
  const longDiagnostic = {
    id: 'long-review-message',
    code: 'crossTierDuplicate',
    severity: 'info',
    message: longMessage,
    tiers: ['T1'],
    itemIds: [],
  }
  const shortDiagnostic = {
    id: 'short-review-message',
    code: 'shortReview',
    severity: 'info',
    message: shortMessage,
    tiers: ['T1'],
    itemIds: [],
  }
  let diagnostics = [longDiagnostic]

  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)
  await page.unroute('**/api/lineholder-bids/current/summary')
  await page.route('**/api/lineholder-bids/current/summary', async (route) => {
    await fulfillJson(route, {
      draftVersion: 147,
      periodCode: 'Jun 2026',
      bidContext: 'Current',
      statistics: [
        { tier: 'T1', totalItems: 2, pairingCount: 2, lineCount: 0, daysOffCount: 0 },
      ],
      summaryItems: [],
      warnings: [],
      diagnostics,
    })
  })

  await page.goto('bid')
  const panel = page.getByTestId('bid-review-panel')
  await expect(panel).toBeVisible({ timeout: 60_000 })

  const longTitle = panel.getByTestId('bid-review-chip-title').filter({ hasText: longMessage })
  await expect(longTitle).toHaveCSS('white-space', 'nowrap')
  await expect.poll(() => longTitle.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  await expect(longTitle).toHaveAttribute('tabindex', '0')

  const panelHeight = await panel.evaluate((element) => element.getBoundingClientRect().height)
  await longTitle.hover()
  const tooltip = page.getByRole('tooltip')
  const tooltipSurface = tooltip.locator('..')
  await expect(tooltip).toHaveText(longMessage)
  await expect(tooltipSurface).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(tooltipSurface).toHaveCSS('color', 'rgb(23, 29, 38)')
  expect(await panel.evaluate((element) => element.getBoundingClientRect().height)).toBe(panelHeight)

  await page.getByText('Dashboard', { exact: true }).hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)

  await longTitle.focus()
  await expect(page.getByRole('tooltip')).toHaveText(longMessage)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(longTitle).not.toBeFocused()

  diagnostics = [shortDiagnostic]
  await page.reload()
  await expect(panel).toBeVisible({ timeout: 60_000 })
  const shortTitle = panel.getByTestId('bid-review-chip-title').filter({ hasText: shortMessage })
  await expect.poll(() => shortTitle.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expect(shortTitle).not.toHaveAttribute('tabindex')
  await shortTitle.hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
})

const expectFavoriteTabIsDefault = async (page: Page, workspaceTestId: string) => {
  const workspace = page.getByTestId(workspaceTestId)
  await expect(workspace).toBeVisible({ timeout: 60_000 })

  const categoryTabs = page.getByRole('tablist', { name: 'Bid property categories' })
  const favoriteTab = categoryTabs.getByRole('tab', { name: 'FAVORITED PROPERTIES' })
  const firstCategoryTab = categoryTabs.getByRole('tab', { name: 'DAYS OFF' })
  await expect(favoriteTab).toHaveAttribute('aria-selected', 'true')
  await expect(firstCategoryTab).toHaveAttribute('aria-selected', 'false')

  const favoriteBox = await favoriteTab.boundingBox()
  const firstCategoryBox = await firstCategoryTab.boundingBox()
  expect(favoriteBox, 'favorite tab should be visible').not.toBeNull()
  expect(firstCategoryBox, 'first category tab should be visible').not.toBeNull()
  expect(favoriteBox!.x).toBeLessThan(firstCategoryBox!.x)

  return workspace
}

const expectAvailableButtonsInOrder = async (
  workspace: Locator,
  expectedNames: string[],
  hiddenNames: string[] = [],
) => {
  const positions = await Promise.all(expectedNames.map(async (name) => {
    const button = workspace.getByRole('button', { name: `Add ${name}` })
    await expect(button).toBeVisible()
    const box = await button.boundingBox()
    expect(box, `${name} button should be visible`).not.toBeNull()
    return box!.y * 10_000 + box!.x
  }))

  expect(positions).toEqual([...positions].sort((left, right) => left - right))

  for (const hiddenName of hiddenNames) {
    await expect(workspace.getByRole('button', { name: `Add ${hiddenName}` })).toHaveCount(0)
  }
}

const expectHorizontallyContained = async (
  container: Locator,
  target: Locator,
  label: string,
) => {
  await expect(container).toBeVisible()
  await expect(target).toBeVisible()

  const containerBox = await container.boundingBox()
  const targetBox = await target.boundingBox()

  expect(containerBox, `${label} container should have a visible bounding box`).not.toBeNull()
  expect(targetBox, `${label} should have a visible bounding box`).not.toBeNull()
  expect(targetBox!.x).toBeGreaterThanOrEqual(containerBox!.x - 1)
  expect(targetBox!.x + targetBox!.width).toBeLessThanOrEqual(containerBox!.x + containerBox!.width + 1)
}

const openBidCategory = async (
  page: Page,
  category?: 'DAYS OFF' | 'PAIRING' | 'ROSTER',
) => {
  await page.goto('bid')
  const bidPage = page.getByTestId('bid-page')
  await expect(bidPage).toBeVisible({ timeout: 60_000 })

  if (category) {
    const categoryTab = bidPage.getByRole('tab', { name: category })
    await categoryTab.click()
    await expect(categoryTab).toHaveAttribute('aria-selected', 'true')
  }

  return bidPage
}

test.use({
  storageState: { cookies: [], origins: [] },
})

test('PBS-3510A — Bid defaults to Favorited Properties', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page, { includeMergedBidSummary: true })

  const bidPage = await openBidCategory(page)
  const categoryTabs = bidPage.getByRole('tablist', { name: 'Bid property categories' }).getByRole('tab')
  await expect(categoryTabs).toHaveCount(4)
  expect(await categoryTabs.allTextContents()).toEqual([
    'FAVORITED PROPERTIES',
    'DAYS OFF',
    'PAIRING',
    'ROSTER',
  ])
  await expect(categoryTabs.nth(0)).toHaveAttribute('aria-selected', 'true')
  await expect(bidPage.getByText('ALL PROPERTIES', { exact: true })).toHaveCount(0)

  const favorites = bidPage.getByTestId('bid-available-properties-scroll')
  await expect(favorites.getByRole('heading', { name: 'Days Off' })).toBeVisible()
  await expect(favorites.getByRole('heading', { name: 'Pairing' })).toBeVisible()
  await expect(favorites.getByRole('heading', { name: 'Roster' })).toBeVisible()
  await expect(favorites.getByRole('button', { name: 'Add Prefer Off' })).toBeVisible()
  await expect(favorites.getByRole('button', { name: 'Add Month-End Carryover' })).toBeVisible()
  await expect(favorites.getByRole('button', { name: 'Add Max Credit Window' })).toBeVisible()
  await expect(favorites.getByText('AON', { exact: true })).toHaveCount(0)
  await expect(favorites.getByText('Min 1', { exact: true })).toBeVisible()
})

test('PBS-3510B — Days Off category is separate from favorites', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page, { includeMergedBidSummary: true })

  const bidPage = await openBidCategory(page, 'DAYS OFF')
  const existingRow = bidPage
    .getByTestId('tier-summary-row')
    .filter({ hasText: 'Prefer off from Jun 18, 2026 to Jun 21, 2026' })
  await expect(existingRow).toBeVisible()
  await expect(existingRow).toContainText('Days Off')

  const available = bidPage.getByTestId('bid-available-properties-scroll')
  await expectAvailableButtonsInOrder(available, [
    'Prefer Off',
    'Long Stretch Off / Compressed Flying',
  ], [
    'Month-End Carryover',
    'Max Credit Window',
  ])
  await expect(available.getByText('TOP USED').first()).toBeVisible()
  await expect(bidPage.getByText('ALL PROPERTIES', { exact: true })).toHaveCount(0)
})

test('PBS-3530 — Existing Prefer Off ranges and weekdays use semantic summaries', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page, {
    includeMergedBidSummary: true,
    daysOffDraftProperties: [
      {
        propertyGroupKey: 'existing-days-off-prefer-tuesday',
        rowSeq: 3,
        propertyCode: 201,
        name: 'Prefer Off',
        bid: { type: 'tag-list', values: ['Tuesday'] },
        tiers: ['T1'],
      },
      {
        propertyGroupKey: 'existing-days-off-prefer-weekends',
        rowSeq: 4,
        propertyCode: 201,
        name: 'Prefer Off',
        bid: { type: 'tag-list', values: ['Weekends'] },
        tiers: ['T1'],
      },
    ],
  })

  const bidPage = await openBidCategory(page)

  await expect(bidPage.getByText(
    'Prefer off from Jun 18, 2026 to Jun 21, 2026',
    { exact: true },
  )).toBeVisible()
  await expect(bidPage.getByText('Prefer off on Tuesdays', { exact: true })).toBeVisible()
  await expect(bidPage.getByText('Prefer off on weekends', { exact: true })).toBeVisible()
  await expect(bidPage.getByText('Prefer Off needs review', { exact: true })).toHaveCount(0)
})

test('PBS-3510C — Pairing category preserves rules and search previews', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page, { includeMergedBidSummary: true })

  let bidPage = await openBidCategory(page, 'PAIRING')
  const pairingLengthRow = bidPage
    .getByTestId('tier-summary-row')
    .filter({ hasText: 'Award pairings 1–3 days long' })
  const pairingPreferenceRow = bidPage
    .getByTestId('tier-summary-row')
    .filter({ hasText: 'Award Pairing Preference: E4101, E4103, E4106, E4108' })
  await expect(pairingLengthRow).toBeVisible()
  await expect(pairingPreferenceRow).toBeVisible()

  const existingScroll = bidPage.getByTestId('bid-existing-properties-scroll')
  await expectHorizontallyContained(
    existingScroll,
    pairingLengthRow.getByTestId('tier-summary-actions'),
    'Pairing Length existing actions',
  )

  await bidPage.getByRole('button', { name: 'VIEW RULES' }).click()
  const rulesDialog = page.getByRole('dialog', { name: 'VIEW RULES' })
  await expect(rulesDialog).toBeVisible()
  await expect(rulesDialog.getByText('Pairing Length: Award pairings 1–3 days long', { exact: true })).toBeVisible()
  const pairingPreferenceRule = page.getByText('Pairing Preference: Award · E4101, E4103, E4106, E4108', { exact: true })
  await expect(pairingPreferenceRule).toBeVisible()
  await expect(pairingPreferenceRule).not.toContainText('2026-06')
  await rulesDialog.getByRole('button', { name: 'Close pairing rules' }).click()
  await expect(rulesDialog).toHaveCount(0)

  await bidPage.getByRole('button', { name: 'SEARCH PAIRINGS' }).click()
  await expect(page).toHaveURL(/\/bid\/pairing\/search/)
  await expect(page.getByTestId('pairing-search-current-rules-preview')).toBeVisible()
  await expect(page.getByText('Pairing Length: Award pairings 1–3 days long', { exact: true })).toBeVisible()
  const currentRulesPairingPreferenceRule = page.getByText('Pairing Preference: Award · E4101, E4103, E4106, E4108', { exact: true })
  await expect(currentRulesPairingPreferenceRule).toBeVisible()
  await expect(currentRulesPairingPreferenceRule).toContainText('Award · E4101, E4103, E4106, E4108')
  await expect(currentRulesPairingPreferenceRule).not.toContainText('2026-06')

  bidPage = await openBidCategory(page, 'PAIRING')
  await bidPage.getByRole('button', { name: /^Preview Award Pairing Preference/ }).click()
  await expect(page).toHaveURL(/\/bid\/pairing\/search/)
  await expect(page.getByTestId('pairing-search-panel')).toBeVisible()
  await expect(page.getByRole('article', { name: 'Search criteria Pairing Preference' })).toBeVisible()
  await expect(page.getByTestId('pairing-search-panel').getByText('ACTIONS')).toHaveCount(0)
  await expect(page.getByTestId('pairing-search-panel').getByText('TIERS')).toHaveCount(0)
  const searchCriteriaBid = page.getByLabel('Bid for search criteria Pairing Preference')
  await expect(searchCriteriaBid).toContainText('Award · E4101, E4103, E4106, E4108')
  await expect(searchCriteriaBid).not.toContainText('Jun')
  await expect(
    page
      .getByTestId('pairing-search-criteria-actions-preview-102')
      .getByRole('button', { name: 'Edit search criteria Pairing Preference' }),
  ).toBeVisible()
  await page
    .getByTestId('pairing-search-criteria-actions-preview-102')
    .getByRole('button', { name: 'Edit search criteria Pairing Preference' })
    .click()
  const pairingPreferenceConfigDialog = page.getByRole('dialog', { name: 'Configure Pairing Preference' })
  await expect(pairingPreferenceConfigDialog).toBeVisible()
  await expect(pairingPreferenceConfigDialog.getByText('Configure Pairing Preference')).toBeVisible()
  await expect(pairingPreferenceConfigDialog.getByText('LIMIT TO RUN DATE')).toHaveCount(0)
  await expect(pairingPreferenceConfigDialog.getByText('FULFILMENT')).toHaveCount(0)
  await expect(pairingPreferenceConfigDialog.getByText('E4101')).toBeVisible()
  await expect(pairingPreferenceConfigDialog.getByText('E4108')).toBeVisible()
  await expect(pairingPreferenceConfigDialog.getByRole('button', { name: 'UPDATE BID' })).toBeVisible()
  const dialogBox = await pairingPreferenceConfigDialog.boundingBox()
  const viewport = page.viewportSize()
  expect(dialogBox, 'Pairing Preference config dialog should have a visible bounding box').not.toBeNull()
  expect(viewport, 'Playwright viewport should be available').not.toBeNull()
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0)
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(viewport!.height)
  await pairingPreferenceConfigDialog.getByRole('button', { name: 'Close configure dialog for Pairing Preference' }).click()
  await expect(pairingPreferenceConfigDialog).toHaveCount(0)

  bidPage = await openBidCategory(page, 'PAIRING')
  const available = bidPage.getByTestId('bid-available-properties-scroll')
  await expectAvailableButtonsInOrder(available, [
    'Pairing Preference',
    'Airport Preference',
    'Pairing Check-In / Check-Out Time',
    'Flight Legs per Duty',
    'Work Day Preference',
  ], [
    'Prefer Off',
    'Max Credit Window',
  ])
  await expect(available.getByRole('button', { name: 'Add Pairing Length' })).toBeVisible()
  await expect(available.getByRole('button', { name: 'Add Flight Number Preference' })).toBeVisible()
  await expect(available.getByRole('button', { name: 'Add Redeye Preference' })).toBeVisible()
  await expect(available.getByRole('button', { name: 'Add Deadhead Flying' })).toBeVisible()
  await expect(available.getByRole('button', { name: 'Add Time Between Flights' })).toBeVisible()
  await expect(available.getByRole('button', { name: 'Add Month-End Carryover' })).toBeVisible()
})

test('PBS-3510D — Roster category is separate from favorites', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page, { includeMergedBidSummary: true })

  const bidPage = await openBidCategory(page, 'ROSTER')
  const existingRow = bidPage
    .getByTestId('tier-summary-row')
    .filter({ hasText: 'Award max credit window' })
  await expect(existingRow).toBeVisible()
  await expect(existingRow).toContainText('Roster')

  const available = bidPage.getByTestId('bid-available-properties-scroll')
  await expectAvailableButtonsInOrder(available, [
    'Min Credit Window',
    'Max Credit Window',
    'No Same Day Pairings',
    'Waive No Same Day Duty Starts',
  ], [
    'Prefer Off',
    'Month-End Carryover',
  ])
  await expect(available.getByRole('button', { name: 'Add Commuter Pattern' })).toBeVisible()
  await expect(bidPage.getByText('ALL PROPERTIES', { exact: true })).toHaveCount(0)
})

test('PBS-3513 — Airport Preference defaults Award and Landing without a Tier or date scope', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 862 })
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  await page.goto('bid')
  const workspace = page.getByTestId('bid-page')
  await expect(workspace).toBeVisible({ timeout: 60_000 })
  await workspace.getByRole('tab', { name: 'PAIRING' }).click()
  await workspace.getByPlaceholder('Search Bid Properties').fill('Airport Preference')
  await workspace.getByRole('button', { name: 'Add Airport Preference' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Airport Preference' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Configure Airport Preference')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Toggle T1 for Airport Preference' })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'Award', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Landing', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Layover', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await expect(dialog.getByRole('switch', { name: 'Airport Preference limit to event date' })).toHaveAttribute('aria-checked', 'false')
  await expect(dialog.getByRole('button', { name: 'Specific Dates' })).toHaveCount(0)
  await expect(dialog.getByText('FULFILMENT')).toHaveCount(0)
  await expect(dialog.getByText('Minimum Required')).toHaveCount(0)
  await expect(dialog.getByText('Maximum Required')).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Layover', exact: true }).click()
  const locationPicker = dialog.getByRole('combobox', { name: 'Airport Preference airports or cities' })
  await locationPicker.click()
  const airportDropdown = page.getByTestId('airport-preference-location-dropdown')
  await expect(airportDropdown).toBeVisible()

  const scaledDropdownMetrics = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>(
      '[role="combobox"][aria-label="Airport Preference airports or cities"]',
    )
    const dropdown = document.querySelector<HTMLElement>(
      '[data-testid="airport-preference-location-dropdown"]',
    )
    const triggerRect = trigger?.getBoundingClientRect()
    const dropdownRect = dropdown?.getBoundingClientRect()

    return {
      dropdown: dropdownRect
        ? {
            bottom: dropdownRect.bottom,
            left: dropdownRect.left,
            right: dropdownRect.right,
            top: dropdownRect.top,
          }
        : null,
      dropdownScale: dropdown
        ? new DOMMatrixReadOnly(window.getComputedStyle(dropdown).transform).a
        : null,
      triggerScale: trigger && trigger.offsetWidth > 0
        ? triggerRect!.width / trigger.offsetWidth
        : null,
    }
  })

  expect(scaledDropdownMetrics.dropdown).not.toBeNull()
  expect(scaledDropdownMetrics.dropdownScale).toBeCloseTo(scaledDropdownMetrics.triggerScale ?? 1, 2)
  expect(scaledDropdownMetrics.dropdown!.left).toBeGreaterThanOrEqual(11)
  expect(scaledDropdownMetrics.dropdown!.right).toBeLessThanOrEqual(989)
  expect(scaledDropdownMetrics.dropdown!.top).toBeGreaterThanOrEqual(11)
  expect(scaledDropdownMetrics.dropdown!.bottom).toBeLessThanOrEqual(851)
  await expect(page.getByRole('option', { name: /YYZ · Toronto Pearson/i })).toBeVisible()
  await expect(page.getByRole('option', { name: /YVR · Vancouver International/i })).toHaveCount(0)
  await page.getByRole('option', { name: /YYZ · Toronto Pearson/i }).click()
  await expect(locationPicker).toContainText('YYZ')
  await locationPicker.click()
  await expect(page.getByRole('listbox')).toHaveCount(0)

  const dateLimit = dialog.getByRole('switch', { name: 'Airport Preference limit to event date' })
  await dateLimit.click()
  await expect(dateLimit).toHaveAttribute('aria-checked', 'true')
  await expect(dialog.getByRole('button', { name: 'Specific Dates' })).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'Open date picker for Airport Preference event dates' }).click()
  const datePopover = page.getByTestId('prefer-off-calendar-popover')
  await datePopover.getByRole('gridcell', { name: 'Select 2026-06-15' }).click()
  await dialog.getByText('Configure Airport Preference', { exact: true }).click()
  await expect(datePopover).toHaveCount(0)

  await expect(dialog.getByText('FULFILMENT')).toHaveCount(0)
  await expect(dialog.getByRole('spinbutton', { name: /Airport Preference (minimum|maximum) required/ })).toHaveCount(0)

  await dialog.getByRole('switch', { name: 'Airport Preference preferred layover hours' }).click()
  await expect(dialog.getByRole('slider', { name: 'Airport Preference preferred layover hours value' })).toHaveValue('13')
  await dialog.getByRole('slider', { name: 'Airport Preference preferred layover hours value' }).evaluate((input) => {
    if (!(input instanceof HTMLInputElement)) return
    input.value = '16'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })

  await dialog.getByRole('button', { name: 'Toggle T2 for Airport Preference' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()

  await dialog.getByRole('button', { name: 'Landing', exact: true }).click()
  await expect(locationPicker).not.toContainText('YYZ')
  await expect(dialog.getByRole('switch', { name: 'Airport Preference preferred layover hours' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
})

test('PBS-3511 — Prefer Off Specific Dates uses the Portal multiple date picker', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  await page.goto('bid')
  const workspace = page.getByTestId('bid-available-properties-scroll')
  await expect(workspace).toBeVisible({ timeout: 60_000 })
  await page.getByRole('tab', { name: 'DAYS OFF' }).click()
  await workspace.getByRole('button', { name: 'Add Prefer Off' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Prefer Off' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('PREFER OFF TYPE')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Specific Dates' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Days of Week' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Date Range' })).toBeVisible()

  await dialog.getByRole('button', { name: 'Open Prefer Off calendar' }).click()
  const popover = page.getByTestId('prefer-off-calendar-popover')
  const calendar = page.getByRole('grid', { name: 'Prefer Off calendar' })
  const addBidButton = dialog.getByRole('button', { name: 'ADD BID' })
  await expect(calendar).toBeVisible()
  await expect(popover).toBeVisible()
  const popoverBox = await popover.boundingBox()
  const addBidButtonBox = await addBidButton.boundingBox()
  expect(popoverBox, 'date picker popover should have a visible bounding box').not.toBeNull()
  expect(addBidButtonBox, 'dialog ADD BID button should have a visible bounding box').not.toBeNull()
  const overlapsAddBidButton = !(
    popoverBox!.x + popoverBox!.width <= addBidButtonBox!.x
    || addBidButtonBox!.x + addBidButtonBox!.width <= popoverBox!.x
    || popoverBox!.y + popoverBox!.height <= addBidButtonBox!.y
    || addBidButtonBox!.y + addBidButtonBox!.height <= popoverBox!.y
  )
  expect(overlapsAddBidButton).toBe(false)

  await calendar.getByRole('gridcell', { name: 'Select 2026-06-10' }).click()
  await calendar.getByRole('gridcell', { name: 'Select 2026-06-12' }).click()
  await expect(dialog.getByRole('button', { name: 'Remove Prefer Off date 2026-06-10' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Remove Prefer Off date 2026-06-12' })).toBeVisible()
  await expect(dialog.getByText('FULFILMENT')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Flexible quantity' })).toHaveCount(0)
})

test('PBS-3512 — 102, 201, 204, and 408 begin with no selected Tier', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  await page.goto('days-off')
  const daysOffWorkspace = await expectFavoriteTabIsDefault(page, 'rule-bid-add-properties-workspace')
  await daysOffWorkspace.getByRole('button', { name: 'ALL PROPERTIES' }).click()
  await daysOffWorkspace.getByRole('button', { name: 'Add Prefer Off' }).click()

  const daysOffDialog = page.getByRole('dialog', { name: 'Configure Prefer Off' })
  const daysOffT1 = daysOffDialog.getByRole('button', { name: 'Toggle T1 for Prefer Off' })
  const daysOffT2 = daysOffDialog.getByRole('button', { name: 'Toggle T2 for Prefer Off' })
  await expect(daysOffDialog).toBeVisible()
  await expect(daysOffDialog.getByText('PREFER OFF TYPE')).toBeVisible()
  await expect(daysOffT1).toHaveAttribute('aria-pressed', 'false')
  await expect(daysOffT2).toHaveAttribute('aria-pressed', 'false')
  await expect(daysOffDialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await expect(daysOffDialog.getByText(/REQUIRED/)).toBeVisible()
  await daysOffT2.click()
  await expect(daysOffT2).toHaveAttribute('aria-pressed', 'true')
  await daysOffDialog.getByRole('button', { name: 'Close days off bid dialog' }).click()

  await daysOffWorkspace.getByRole('button', { name: 'Add Long Stretch Off / Compressed Flying' }).click()
  const longStretchDialog = page.getByRole('dialog', { name: 'Configure Long Stretch Off / Compressed Flying' })
  await expect(longStretchDialog).toBeVisible()
  await expect(longStretchDialog.getByRole('button', { name: 'Toggle T1 for Long Stretch Off / Compressed Flying' })).toHaveAttribute('aria-pressed', 'false')
  await expect(longStretchDialog.getByRole('button', { name: 'Toggle T2 for Long Stretch Off / Compressed Flying' })).toHaveAttribute('aria-pressed', 'false')
  await expect(longStretchDialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await longStretchDialog.getByRole('button', { name: 'Close days off bid dialog' }).click()

  await page.goto('line')
  const lineWorkspace = await expectFavoriteTabIsDefault(page, 'rule-bid-add-properties-workspace')
  await lineWorkspace.getByRole('button', { name: 'ALL PROPERTIES' }).click()
  await lineWorkspace.getByRole('button', { name: 'Add Commuter Pattern' }).click()
  const commuterDialog = page.getByRole('dialog', { name: 'Configure Commuter Pattern' })
  const commuterT1 = commuterDialog.getByRole('button', { name: 'Toggle T1 for Commuter Pattern' })
  await expect(commuterDialog).toBeVisible()
  await expect(commuterT1).toHaveAttribute('aria-pressed', 'false')
  await expect(commuterDialog.getByRole('button', { name: 'Toggle T2 for Commuter Pattern' })).toHaveAttribute('aria-pressed', 'false')
  await expect(commuterDialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await commuterT1.click()
  await expect(commuterDialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
  await commuterDialog.getByRole('button', { name: 'Close line bid dialog' }).click()

  await page.goto('pairing')
  const pairingWorkspace = await expectFavoriteTabIsDefault(page, 'pairing-add-properties-workspace')
  await pairingWorkspace.getByRole('button', { name: 'ALL PROPERTIES' }).click()
  await pairingWorkspace.getByRole('button', { name: 'Add Pairing Preference' }).click()

  const pairingPreferenceDialog = page.getByRole('dialog').filter({ hasText: 'Configure Pairing Preference' })
  await expect(pairingPreferenceDialog).toBeVisible()
  await expect(pairingPreferenceDialog.getByRole('button', { name: 'Toggle T1 for Pairing Preference' })).toHaveAttribute('aria-pressed', 'false')
  await expect(pairingPreferenceDialog.getByRole('button', { name: 'Award' })).toHaveAttribute('aria-pressed', 'true')
  await expect(pairingPreferenceDialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await pairingPreferenceDialog.getByRole('button', { name: 'Close configure dialog for Pairing Preference' }).click()

  await pairingWorkspace.getByRole('button', { name: 'Add Flight Legs per Duty' }).click()

  const pairingDialog = page.getByRole('dialog', { name: 'Configure Flight Legs per Duty' })
  const pairingT1 = pairingDialog.getByRole('button', { name: 'Toggle T1 for Flight Legs per Duty' })
  const pairingT2 = pairingDialog.getByRole('button', { name: 'Toggle T2 for Flight Legs per Duty' })
  const addPairingBid = pairingDialog.getByRole('button', { name: 'ADD BID' })
  await expect(pairingDialog).toBeVisible()
  await expect(pairingT1).toHaveAttribute('aria-pressed', 'false')
  await expect(pairingT2).toHaveAttribute('aria-pressed', 'false')
  await expect(pairingDialog.getByRole('button', { name: 'Award' })).toHaveAttribute('aria-pressed', 'true')
  await expect(pairingDialog.getByRole('button', { name: 'Avoid' })).toHaveAttribute('aria-pressed', 'false')
  await expect(pairingDialog.getByRole('button', { name: 'Any duty', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(pairingDialog.getByRole('button', { name: 'Every duty', exact: true })).toHaveAttribute('aria-pressed', 'false')
  const pairingOperatorSelect = pairingDialog.getByRole('combobox', { name: 'Flight Legs per Duty operator' })
  await expect(pairingOperatorSelect).toHaveValue('')
  await expect(pairingOperatorSelect.getByRole('option', { name: 'Between' })).toHaveCount(1)
  await expect(pairingDialog.getByRole('switch', { name: 'Flight Legs per Duty limit to event date' })).toHaveAttribute('aria-checked', 'false')
  const pairingLegsInput = pairingDialog.getByRole('spinbutton', { name: 'Flight Legs per Duty legs per duty' })
  await expect(pairingLegsInput).toHaveValue('')
  await pairingLegsInput.click()
  await expect(pairingLegsInput).toBeFocused()
  await expect(pairingLegsInput).toHaveCSS('z-index', '10')
  await expect(pairingLegsInput.locator('..')).toHaveCSS('z-index', '10')
  const pairingLegsSuffix = pairingLegsInput.locator('xpath=following-sibling::span')
  await expect(pairingLegsSuffix).toBeVisible()
  await expect(pairingLegsSuffix).toHaveCSS('z-index', '20')
  const focusBorders = await pairingLegsInput.evaluate((input) => {
    const styles = getComputedStyle(input)

    return {
      bottomColor: styles.borderBottomColor,
      bottomWidth: styles.borderBottomWidth,
      leftColor: styles.borderLeftColor,
      leftWidth: styles.borderLeftWidth,
      rightColor: styles.borderRightColor,
      rightWidth: styles.borderRightWidth,
      topColor: styles.borderTopColor,
      topWidth: styles.borderTopWidth,
    }
  })
  expect(focusBorders).toEqual({
    bottomColor: focusBorders.topColor,
    bottomWidth: '2px',
    leftColor: focusBorders.topColor,
    leftWidth: '2px',
    rightColor: focusBorders.topColor,
    rightWidth: '2px',
    topColor: focusBorders.topColor,
    topWidth: '2px',
  })
  await expect(addPairingBid).toBeDisabled()
  await pairingT2.click()
  await expect(pairingT2).toHaveAttribute('aria-pressed', 'true')
  await expect(addPairingBid).toBeDisabled()
  await pairingOperatorSelect.selectOption('>')
  await pairingLegsInput.fill('3')
  await expect(pairingDialog.getByText('Award pairings with any duty having more than 3 legs.')).toHaveCount(0)
  await expect(addPairingBid).toBeEnabled()
})

test('PBS-3515 — Flight Legs per Duty submits Between with multiple event dates through the real Pairing dialog', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  let addedPayload: Record<string, unknown> | null = null
  await page.route('**/api/pairing-bids/current/properties', async (route) => {
    expect(route.request().method()).toBe('POST')
    addedPayload = route.request().postDataJSON() as Record<string, unknown>
    await fulfillJson(route, {
      saved: true,
      draftVersion: 1,
      propertyGroupKey: 'added-flight-legs',
      rowSeq: 3,
    })
  })

  await page.goto('pairing')
  const workspace = await expectFavoriteTabIsDefault(page, 'pairing-add-properties-workspace')
  await workspace.getByRole('button', { name: 'ALL PROPERTIES' }).click()
  await workspace.getByRole('button', { name: 'Add Flight Legs per Duty' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Flight Legs per Duty' })
  await dialog.getByRole('button', { name: 'Toggle T1 for Flight Legs per Duty' }).click()
  await dialog.getByRole('button', { name: 'Avoid' }).click()
  await dialog.getByRole('combobox', { name: 'Flight Legs per Duty operator' }).selectOption('Between')
  await dialog.getByRole('spinbutton', { name: 'Flight Legs per Duty from legs' }).fill('2')
  await dialog.getByRole('spinbutton', { name: 'Flight Legs per Duty to legs' }).fill('4')
  const dateLimit = dialog.getByRole('switch', { name: 'Flight Legs per Duty limit to event date' })
  await dateLimit.click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Open date picker for Flight Legs per Duty event dates' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-15' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-18' }).click()
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  await expect(dialog).toHaveCount(0)
  expect(addedPayload).toMatchObject({
    property: {
      propertyCode: 107,
      action: 'avoid',
      quantifier: 'any',
      tiers: ['T1'],
      bid: {
        type: 'flight-legs-per-duty',
        operator: 'Between',
        from: 2,
        to: 4,
        dateScope: { mode: 'specific_dates', dates: ['2026-06-15', '2026-06-18'] },
      },
    },
  })
})

test('PBS-3516 — Work Day Preference submits award-only weekday check-in windows through the real Pairing dialog', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  let addedPayload: Record<string, unknown> | null = null
  await page.route('**/api/pairing-bids/current/properties', async (route) => {
    expect(route.request().method()).toBe('POST')
    addedPayload = route.request().postDataJSON() as Record<string, unknown>
    await fulfillJson(route, {
      saved: true,
      draftVersion: 1,
      propertyGroupKey: 'added-work-day-preference',
      rowSeq: 3,
    })
  })

  await page.goto('pairing')
  const workspace = await expectFavoriteTabIsDefault(page, 'pairing-add-properties-workspace')
  await page.getByRole('tablist', { name: 'Bid property categories' }).getByRole('tab', { name: 'PAIRING' }).click()
  await workspace.getByRole('button', { name: 'Add Work Day Preference' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Work Day Preference' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Award' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Avoid' })).toHaveCount(0)
  await expect(dialog.getByRole('switch', { name: 'Work Day Preference limit to event date' })).toHaveAttribute('aria-checked', 'false')
  await expect(dialog.getByRole('button', { name: 'Toggle T1 for Work Day Preference' })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Toggle T1 for Work Day Preference' }).click()
  await dialog.getByRole('button', { name: 'Mon' }).click()
  await dialog.getByRole('button', { name: 'Thu' }).click()
  await dialog.getByLabel('Work Day Preference Mon check-in from').fill('06:00')
  await dialog.getByLabel('Work Day Preference Mon check-in to').fill('10:00')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'SAVE FAVORITE' })).toBeEnabled()

  await dialog.getByRole('switch', { name: 'Work Day Preference limit to event date' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Open date picker for Work Day Preference event dates' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-03' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Selected dates do not match the selected work days.')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Open date picker for Work Day Preference event dates' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-04' }).click()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'SAVE FAVORITE' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  await expect(dialog).toHaveCount(0)
  expect(addedPayload).toMatchObject({
    property: {
      propertyCode: 110,
      action: 'award',
      quantifier: null,
      tiers: ['T1'],
      bid: {
        type: 'work-day-preference',
        days: [
          { dayOfWeek: 'MON', checkInFrom: '06:00', checkInTo: '10:00' },
          { dayOfWeek: 'THU', checkInFrom: null, checkInTo: null },
        ],
        dateScope: { mode: 'specific_dates', dates: ['2026-06-03', '2026-06-04'] },
      },
    },
  })
})

test('PBS-3517 — Work Day Preference rehydrates its saved date-range rule in the real Pairing dialog', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page, {
    pairingDraftProperties: [
      {
        propertyGroupKey: 'existing-work-day-preference-range',
        rowSeq: 3,
        propertyCode: 110,
        name: 'Work Day Preference',
        action: 'award',
        quantifier: null,
        bid: {
          type: 'work-day-preference',
          days: [{ dayOfWeek: 'TUE', checkInFrom: '06:00', checkInTo: '10:00' }],
          dateScope: { mode: 'date_range', from: '2026-06-02', to: '2026-06-08' },
        },
        tiers: ['T2'],
      },
    ],
  })

  await page.goto('pairing')
  await page.getByRole('button', { name: 'TIER-02' }).click()
  const row = page.getByTestId('tier-summary-row').filter({ hasText: 'Work Day Preference' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: /Open detail for T2 Award Work Day Preference/ }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Work Day Preference' })
  await expect(dialog.getByRole('button', { name: 'Toggle T2 for Work Day Preference' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Award' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Tue' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByLabel('Work Day Preference Tue check-in from')).toHaveValue('06:00')
  await expect(dialog.getByRole('button', { name: 'Date Range', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Open date picker for Work Day Preference event date range', exact: true })).toBeVisible()
  await expect(dialog.getByText('2026-06-02')).toBeVisible()
  await expect(dialog.getByText('2026-06-08')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'UPDATE BID' })).toBeEnabled()
})

test('PBS-3518 — Work Day Preference favorite stores configuration and selects Tx when reused', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  let favoritePayload: Record<string, unknown> | null = null
  let addedPayload: Record<string, unknown> | null = null
  await page.route('**/api/pairing-bids/current/favorites', async (route) => {
    expect(route.request().method()).toBe('POST')
    favoritePayload = route.request().postDataJSON() as Record<string, unknown>
    await fulfillJson(route, {
      saved: true,
      favoriteKey: 'work-day-preference-favorite',
      propertyId: 110,
      propertyCode: 110,
      name: 'Work Day Preference',
      action: 'award',
      quantifier: null,
      bid: {
        type: 'work-day-preference',
        days: [{ dayOfWeek: 'MON', checkInFrom: '06:00', checkInTo: '10:00' }],
        dateScope: { mode: 'specific_dates', dates: ['2026-06-01'] },
      },
    })
  })
  await page.route('**/api/pairing-bids/current/properties', async (route) => {
    expect(route.request().method()).toBe('POST')
    addedPayload = route.request().postDataJSON() as Record<string, unknown>
    await fulfillJson(route, {
      saved: true,
      draftVersion: 1,
      propertyGroupKey: 'added-work-day-preference-favorite',
      rowSeq: 3,
    })
  })

  await page.goto('pairing')
  const workspace = await expectFavoriteTabIsDefault(page, 'pairing-add-properties-workspace')
  await page.getByRole('tablist', { name: 'Bid property categories' }).getByRole('tab', { name: 'PAIRING' }).click()
  await workspace.getByRole('button', { name: 'Add Work Day Preference' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Work Day Preference' })
  await dialog.getByRole('button', { name: 'Mon' }).click()
  await dialog.getByLabel('Work Day Preference Mon check-in from').fill('06:00')
  await dialog.getByLabel('Work Day Preference Mon check-in to').fill('10:00')
  await dialog.getByRole('switch', { name: 'Work Day Preference limit to event date' }).click()
  await dialog.getByRole('button', { name: 'Open date picker for Work Day Preference event dates' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-01' }).click()
  await dialog.getByRole('button', { name: 'SAVE FAVORITE' }).click()

  await expect(dialog).toHaveCount(0)
  expect(favoritePayload).toMatchObject({
    property: {
      propertyCode: 110,
      action: 'award',
      quantifier: null,
      bid: {
        type: 'work-day-preference',
        days: [{ dayOfWeek: 'MON', checkInFrom: '06:00', checkInTo: '10:00' }],
        dateScope: { mode: 'specific_dates', dates: ['2026-06-01'] },
      },
    },
  })
  expect((favoritePayload as { property?: { tiers?: unknown } }).property?.tiers).toBeUndefined()

  await page.getByRole('tablist', { name: 'Bid property categories' }).getByRole('tab', { name: 'FAVORITED PROPERTIES' }).click()
  const addFavorite = workspace.getByRole('button', { name: 'Add Work Day Preference' })
  await expect(addFavorite).toBeDisabled()
  await workspace.getByRole('button', { name: 'Select T2 for favorite Work Day Preference' }).click()
  await expect(addFavorite).toBeEnabled()
  await addFavorite.click()

  expect(addedPayload).toMatchObject({
    property: {
      propertyCode: 110,
      action: 'award',
      quantifier: null,
      tiers: ['T2'],
      bid: {
        type: 'work-day-preference',
        days: [{ dayOfWeek: 'MON', checkInFrom: '06:00', checkInTo: '10:00' }],
        dateScope: { mode: 'specific_dates', dates: ['2026-06-01'] },
      },
    },
  })
})

test('PBS-3518B — Days Off and Roster favorites select Tx only when added', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page, { omitExistingLineProperty: true })

  const addedPayloads: Record<string, unknown>[] = []
  for (const endpoint of [
    '**/api/days-off-bids/current/properties',
    '**/api/line-bids/current/properties',
  ]) {
    await page.route(endpoint, async (route) => {
      addedPayloads.push(route.request().postDataJSON() as Record<string, unknown>)
      await fulfillJson(route, {
        saved: true,
        draftVersion: addedPayloads.length,
        propertyGroupKey: `favorite-add-${addedPayloads.length}`,
        rowSeq: addedPayloads.length,
      })
    })
  }

  await page.goto('bid')
  const favorites = page.getByTestId('bid-available-properties-scroll')
  await expect(favorites).toBeVisible()
  const daysOffWorkspace = favorites.getByRole('heading', { name: 'Days Off' }).locator('..')
  const addPreferOff = daysOffWorkspace.getByRole('button', { name: 'Add Prefer Off' })
  const preferOffT3 = daysOffWorkspace.getByRole('button', { name: 'Select T3 for favorite Prefer Off' })
  await expect(addPreferOff).toBeDisabled()
  await expect(preferOffT3).toHaveAttribute('aria-pressed', 'false')
  await preferOffT3.click()
  await addPreferOff.click()
  await expect(preferOffT3).toHaveAttribute('aria-pressed', 'false')

  const lineWorkspace = favorites.getByRole('heading', { name: 'Roster' }).locator('..')
  const addMaxCredit = lineWorkspace.getByRole('button', { name: 'Add Max Credit Window' })
  const maxCreditT5 = lineWorkspace.getByRole('button', { name: 'Select T5 for favorite Max Credit Window' })
  await expect(addMaxCredit).toBeDisabled()
  await expect(maxCreditT5).toHaveAttribute('aria-pressed', 'false')
  await maxCreditT5.click()
  await addMaxCredit.click()
  await expect(maxCreditT5).toHaveAttribute('aria-pressed', 'false')

  expect(addedPayloads).toHaveLength(2)
  expect(addedPayloads[0]).toMatchObject({ tiers: ['T3'] })
  expect(addedPayloads[1]).toMatchObject({ property: { tiers: ['T5'] } })
})

test('PBS-3520 — Favorite cards edit conditions without storing or clearing Tx', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page, { omitExistingLineProperty: true })

  const patchedPayloads: Record<string, unknown>[] = []
  await page.route('**/api/days-off-bids/current/favorites/by-key/favorite-days-off-201', async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>
    patchedPayloads.push(payload)
    await fulfillJson(route, {
      saved: true,
      favoriteKey: 'favorite-days-off-201',
      propertyId: 201,
      propertyCode: 201,
      name: 'Prefer Off',
      bid: { type: 'tag-list', values: ['Weekends'] },
      allOrNothing: true,
      minimumN: 1,
      maximumN: null,
      draftVersion: 1,
    })
  })
  await page.route('**/api/pairing-bids/current/favorites/by-key/favorite-pairing-163', async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>
    patchedPayloads.push(payload)
    await fulfillJson(route, {
      saved: true,
      favoriteKey: 'favorite-pairing-163',
      propertyId: 163,
      propertyCode: 163,
      name: 'Month-End Carryover',
      action: 'award',
      quantifier: null,
      bid: { type: 'month-end-carryover', operator: '>', days: 3 },
      draftVersion: 1,
    })
  })
  await page.route('**/api/line-bids/current/favorites/by-key/favorite-line-401', async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>
    patchedPayloads.push(payload)
    await fulfillJson(route, {
      saved: true,
      favoriteKey: 'favorite-line-401',
      propertyId: 401,
      propertyCode: 401,
      name: 'Max Credit Window',
      bid: { type: 'flag' },
      draftVersion: 1,
    })
  })

  await page.goto('bid')
  const favorites = page.getByTestId('bid-available-properties-scroll')
  await expect(favorites).toBeVisible()

  for (const setup of [
    { heading: 'Days Off', name: 'Prefer Off', tier: 'T3' },
    { heading: 'Pairing', name: 'Month-End Carryover', tier: 'T4' },
    { heading: 'Roster', name: 'Max Credit Window', tier: 'T5' },
  ]) {
    const workspace = favorites.getByRole('heading', { name: setup.heading }).locator('..')
    const tier = workspace.getByRole('button', { name: `Select ${setup.tier} for favorite ${setup.name}` })
    const editFavorite = workspace.getByRole('button', { name: `Edit favorite ${setup.name}` })
    await expect(editFavorite).toHaveCSS('cursor', 'pointer')
    await tier.click()
    await editFavorite.click()
    const dialog = page.getByRole('dialog', { name: `Configure ${setup.name}` })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('TIERS')).toBeHidden()
    if (setup.name === 'Prefer Off') {
      await expect(dialog.getByRole('button', { name: 'Specific Dates' })).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: 'Date Range' })).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: 'Days of Week' })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Weekends' })).toBeVisible()
    }
    await dialog.getByRole('button', { name: 'UPDATE FAVORITE' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(tier).toHaveAttribute('aria-pressed', 'true')
  }

  await page.getByRole('tab', { name: 'DAYS OFF' }).click()
  await favorites.getByRole('button', { name: 'Add Prefer Off' }).click()
  const currentBidDialog = page.getByRole('dialog', { name: 'Configure Prefer Off' })
  await expect(currentBidDialog.getByRole('button', { name: 'Specific Dates' })).toBeVisible()
  await expect(currentBidDialog.getByRole('button', { name: 'Date Range' })).toBeVisible()
  await currentBidDialog.getByRole('button', { name: 'Close days off bid dialog' }).click()

  expect(patchedPayloads).toHaveLength(3)
  expect(patchedPayloads.every((payload) => !('tiers' in payload))).toBe(true)
  expect(patchedPayloads.every((payload) =>
    !('property' in payload)
    || !(payload.property && typeof payload.property === 'object' && 'tiers' in payload.property),
  )).toBe(true)

  await page.getByRole('tab', { name: 'FAVORITED PROPERTIES' }).click()
  const pairingWorkspace = favorites.getByRole('heading', { name: 'Pairing' }).locator('..')
  await pairingWorkspace.getByRole('button', { name: 'Preview Month-End Carryover' }).click()
  await expect(page.getByRole('heading', { name: 'Search Pairings' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to pairing workbench' }).click()
  const restoredFavorites = page.getByTestId('bid-available-properties-scroll')
  await page.getByRole('tab', { name: 'FAVORITED PROPERTIES' }).click()
  const restoredPairingWorkspace = restoredFavorites.getByRole('heading', { name: 'Pairing' }).locator('..')
  await expect(
    restoredPairingWorkspace.getByRole('button', { name: 'Select T4 for favorite Month-End Carryover' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('PBS-3519 — Work Day Preference switches event-date modes without clearing weekday windows', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  await page.goto('pairing')
  const workspace = await expectFavoriteTabIsDefault(page, 'pairing-add-properties-workspace')
  await workspace.getByRole('button', { name: 'ALL PROPERTIES' }).click()
  await workspace.getByRole('button', { name: 'Add Work Day Preference' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Work Day Preference' })
  await dialog.getByRole('button', { name: 'Toggle T1 for Work Day Preference' }).click()
  await dialog.getByRole('button', { name: 'Mon' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()

  await dialog.getByRole('switch', { name: 'Work Day Preference limit to event date' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Date Range', exact: true }).click()

  await expect(dialog.getByText('Start date')).toBeVisible()
  await expect(dialog.getByText('End date')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Open date picker for Work Day Preference event date range', exact: true }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-08' }).click()
  await dialog.getByRole('button', { name: 'Specific Dates' }).click()

  await expect(dialog.getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
})

test('PBS-3522 — Pairing Length supports specific and ranged pairing start dates', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  let addedPayload: Record<string, unknown> | null = null
  await page.route('**/api/pairing-bids/current/properties', async (route) => {
    expect(route.request().method()).toBe('POST')
    addedPayload = route.request().postDataJSON() as Record<string, unknown>
    await fulfillJson(route, {
      saved: true,
      draftVersion: 1,
      propertyGroupKey: 'added-pairing-length',
      rowSeq: 3,
    })
  })

  await page.goto('pairing')
  const workspace = await expectFavoriteTabIsDefault(page, 'pairing-add-properties-workspace')
  await workspace.getByRole('button', { name: 'ALL PROPERTIES' }).click()
  await workspace.getByRole('button', { name: 'Add Pairing Length' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Pairing Length' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Toggle T1 for Pairing Length' })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'Award', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Avoid', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('spinbutton', { name: 'Pairing Length minimum days' })).toHaveValue('')
  await expect(dialog.getByRole('spinbutton', { name: 'Pairing Length maximum days' })).toHaveValue('')
  await expect(dialog.getByRole('switch', { name: 'LIMIT TO PAIRING START DATE' })).toHaveAttribute('aria-checked', 'false')
  await expect(dialog.getByLabel('BID Pairing Length')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await dialog.getByRole('spinbutton', { name: 'Pairing Length minimum days' }).fill('1')
  await dialog.getByRole('spinbutton', { name: 'Pairing Length maximum days' }).fill('3')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Toggle T1 for Pairing Length' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()

  await dialog.getByRole('switch', { name: 'LIMIT TO PAIRING START DATE' }).click()
  await expect(dialog.getByRole('switch', { name: 'LIMIT TO PAIRING START DATE' })).toHaveAttribute('aria-checked', 'true')
  await expect(dialog.getByRole('button', { name: 'Specific Dates' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Date Range' })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Open date picker for Pairing Length pairing start dates' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-03' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-18' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()

  await dialog.getByRole('button', { name: 'Date Range' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Open date picker for Pairing Length pairing start date range' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-10' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-20' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()

  await dialog.getByRole('button', { name: 'Specific Dates' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Open date picker for Pairing Length pairing start dates' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-03' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-18' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  await expect(dialog).toHaveCount(0)
  expect(addedPayload).toMatchObject({
    property: {
      propertyCode: 112,
      action: 'award',
      quantifier: null,
      tiers: ['T1'],
      bid: {
        type: 'pairing-length-preference',
        minDays: 1,
        maxDays: 3,
        dateScope: { mode: 'specific_dates', dates: ['2026-06-03', '2026-06-18'] },
        min: 1,
        max: 7,
      },
    },
  })
})

test('PBS-3523 — Flight Number Preference clears date modes and submits its dedicated payload', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  let addedPayload: Record<string, unknown> | null = null
  await page.route('**/api/pairing-bids/current/properties', async (route) => {
    addedPayload = route.request().postDataJSON() as Record<string, unknown>
    await fulfillJson(route, {
      saved: true,
      draftVersion: 1,
      propertyGroupKey: 'added-flight-number-preference',
      rowSeq: 3,
    })
  })

  await page.goto('bid')
  const bidPage = page.getByTestId('bid-page')
  await expect(bidPage).toBeVisible({ timeout: 60_000 })
  await bidPage.getByRole('tab', { name: 'PAIRING' }).click()
  const workspace = page.getByTestId('pairing-add-properties-workspace')
  await expect(workspace).toBeVisible()
  await bidPage.getByPlaceholder('Search Bid Properties').fill('Flight Number Preference')
  await workspace.getByRole('button', { name: 'Add Flight Number Preference' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Flight Number Preference' })
  await expect(dialog.getByRole('button', { name: 'Toggle T1 for Flight Number Preference' })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'Award', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('switch', { name: 'LIMIT TO FLIGHT DATE' })).toHaveAttribute('aria-checked', 'false')
  const typeSelect = dialog.getByRole('combobox', { name: 'Flight Number Preference type' })
  const flightNumberInput = dialog.getByLabel('Flight Number Preference flight numbers')
  await expect(typeSelect).toHaveValue('')
  await expect(typeSelect.getByRole('option', { name: 'Charter', exact: true })).toHaveCount(1)
  await expect(typeSelect.getByRole('option', { name: 'Positioning Flights - Charter Network' })).toHaveCount(1)
  await expect(typeSelect.getByRole('option', { name: 'Recovery Flights - Charter Network' })).toHaveCount(0)
  await expect(dialog.getByText('MATCHING FLIGHTS')).toHaveCount(0)
  await expect(dialog.getByRole('spinbutton')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await typeSelect.selectOption('positioning-charter-network')
  await flightNumberInput.fill('99')
  await expect(page.getByTestId('pairing-tag-list-autocomplete').getByRole('button', { name: /9900/ })).toBeVisible()
  await flightNumberInput.fill('')
  await dialog.getByRole('button', { name: 'Clear Flight Number Preference type' }).click()
  await expect(typeSelect).toHaveValue('')
  await flightNumberInput.fill('06')
  await expect(page.getByTestId('pairing-tag-list-autocomplete').getByRole('button', { name: /0601/ })).toBeVisible()
  await flightNumberInput.fill('')

  await typeSelect.selectOption('charter')
  await flightNumberInput.fill('70')
  await flightNumberInput.press('Enter')
  await expect(flightNumberInput).toHaveValue('')
  await expect(dialog.getByRole('button', { name: 'Remove 70 from Flight Number Preference flight numbers' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await flightNumberInput.fill('70')
  await page.getByTestId('pairing-tag-list-autocomplete').getByRole('button').first().click()
  await dialog.getByRole('switch', { name: 'LIMIT TO FLIGHT DATE' }).click()
  await expect(dialog.getByRole('button', { name: 'Specific Dates' })).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'Open date picker for Flight Number Preference flight dates' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-03' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-18' }).click()
  await dialog.getByRole('button', { name: 'Toggle T1 for Flight Number Preference' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  expect(addedPayload).toMatchObject({
    property: {
      propertyCode: 116,
      action: 'award',
      quantifier: null,
      tiers: ['T1'],
      bid: {
        type: 'flight-number-preference',
        flightNumbers: ['7001'],
        dateScope: { mode: 'specific_dates', dates: ['2026-06-03', '2026-06-18'] },
      },
    },
  })
  expect(JSON.stringify(addedPayload)).not.toContain('charter')
  expect(JSON.stringify(addedPayload)).not.toContain('positioning-charter-network')
})

test('PBS-3527 — Time Between Flights uses dynamic bounds and submits its dedicated payload', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  let addedPayload: Record<string, unknown> | null = null
  await page.route('**/api/pairing-bids/current/properties', async (route) => {
    addedPayload = route.request().postDataJSON() as Record<string, unknown>
    await fulfillJson(route, {
      saved: true,
      draftVersion: 1,
      propertyGroupKey: 'added-time-between-flights',
      rowSeq: 3,
    })
  })

  await page.goto('pairing')
  const workspace = await expectFavoriteTabIsDefault(page, 'pairing-add-properties-workspace')
  await page.getByRole('tab', { name: 'PAIRING', exact: true }).click()
  await page.getByPlaceholder('Search Bid Properties').fill('Time Between')
  await workspace.getByRole('button', { name: 'Add Time Between Flights' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Time Between Flights' })
  const duration = dialog.getByRole('textbox', { name: 'Time Between Flights duration' })
  await expect(dialog.getByRole('button', { name: 'Toggle T1 for Time Between Flights' })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'Award', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Any', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('combobox', { name: 'Time Between Flights operator' })).toHaveValue('>')
  await expect(duration).toHaveAttribute('placeholder', '00:45 – 04:20')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Toggle T1 for Time Between Flights' }).click()
  await duration.fill('004')
  await expect(duration).toHaveValue('004')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await duration.fill('0045-2405')
  await expect(duration).toHaveValue('00:45')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
  await duration.fill('00:44')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await expect(dialog.getByText('Enter 00:45 to 04:20.')).toBeVisible()

  await dialog.getByRole('combobox', { name: 'Time Between Flights operator' }).selectOption('=')
  await dialog.getByRole('button', { name: 'Every', exact: true }).click()
  await duration.fill('01:30')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  expect(addedPayload).toMatchObject({
    property: {
      propertyCode: 129,
      action: 'award',
      quantifier: 'every',
      tiers: ['T1'],
      bid: {
        type: 'duration',
        value: '01:30',
        operator: '=',
      },
    },
  })
})

test('PBS-4281 — Time Between Flights refetches the minimum when its dialog is reopened', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  let boundsRequestCount = 0
  await page.route('**/api/pairing-search/time-between-flights-bounds**', async (route) => {
    boundsRequestCount += 1
    await fulfillJson(route, {
      minimumMinutes: boundsRequestCount === 1 ? 45 : 75,
      maximumMinutes: 260,
    })
  })

  await page.goto('pairing')
  const workspace = await expectFavoriteTabIsDefault(page, 'pairing-add-properties-workspace')
  await page.getByRole('tab', { name: 'PAIRING', exact: true }).click()
  await page.getByPlaceholder('Search Bid Properties').fill('Time Between')
  const add = workspace.getByRole('button', { name: 'Add Time Between Flights' })
  await add.click()

  let dialog = page.getByRole('dialog', { name: 'Configure Time Between Flights' })
  const duration = dialog.getByRole('textbox', { name: 'Time Between Flights duration' })
  await expect(duration).toHaveAttribute('placeholder', '00:45 – 04:20')
  await dialog.getByRole('button', { name: 'Close configure dialog for Time Between Flights' }).click()
  await add.click()

  dialog = page.getByRole('dialog', { name: 'Configure Time Between Flights' })
  await expect(dialog.getByRole('textbox', { name: 'Time Between Flights duration' })).toHaveAttribute(
    'placeholder',
    '01:15 – 04:20',
  )
  expect(boundsRequestCount).toBe(2)
})

test('PBS-3525 — Redeye Preference defaults to Avoid and submits multiple flight dates', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  let addedPayload: Record<string, unknown> | null = null
  await page.route('**/api/pairing-bids/current/properties', async (route) => {
    expect(route.request().method()).toBe('POST')
    addedPayload = route.request().postDataJSON() as Record<string, unknown>
    await fulfillJson(route, {
      saved: true,
      draftVersion: 1,
      propertyGroupKey: 'added-redeye-preference',
      rowSeq: 3,
    })
  })

  await page.goto('pairing')
  const workspace = await expectFavoriteTabIsDefault(page, 'pairing-add-properties-workspace')
  await page.getByRole('tab', { name: 'PAIRING' }).click()
  await workspace.getByRole('button', { name: 'Add Redeye Preference' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Redeye Preference' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('note', { name: 'Redeye Preference redeye definition' })).toContainText(
    '23:00–05:00 local time · Crosses midnight',
  )
  await expect(dialog.getByRole('textbox', { name: /redeye definition/i })).toHaveCount(0)
  await expect(dialog.getByText('REDEYE', { exact: true })).toBeVisible()
  await expect(dialog.getByText('REDEYE DEFINITION')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Toggle T1 for Redeye Preference' })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'Award', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'Avoid', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('switch', { name: 'LIMIT TO FLIGHT DATE' })).toHaveAttribute('aria-checked', 'false')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await dialog.getByRole('switch', { name: 'LIMIT TO FLIGHT DATE' }).click()
  await expect(dialog.getByRole('button', { name: 'Specific Dates' })).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'Open date picker for Redeye Preference flight dates' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-03' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-18' }).click()
  await dialog.getByRole('button', { name: 'Toggle T1 for Redeye Preference' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  await expect(dialog).toHaveCount(0)
  expect(addedPayload).toMatchObject({
    property: {
      propertyCode: 117,
      action: 'avoid',
      quantifier: null,
      tiers: ['T1'],
      bid: {
        type: 'redeye-preference',
        dateScope: {
          mode: 'specific_dates',
          dates: ['2026-06-03', '2026-06-18'],
        },
      },
    },
  })
})

test('PBS-3526 — Month-End Carryover submits the dedicated comparison payload', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  let addedPayload: Record<string, unknown> | null = null
  await page.route('**/api/pairing-bids/current/properties', async (route) => {
    expect(route.request().method()).toBe('POST')
    addedPayload = route.request().postDataJSON() as Record<string, unknown>
    await fulfillJson(route, {
      saved: true,
      draftVersion: 1,
      propertyGroupKey: 'added-month-end-carryover',
      rowSeq: 3,
    })
  })

  await page.goto('pairing')
  const workspace = await expectFavoriteTabIsDefault(page, 'pairing-add-properties-workspace')
  await workspace.getByRole('button', { name: 'ALL PROPERTIES' }).click()
  await workspace.getByPlaceholder('Search Properties').fill('Month-End')
  await workspace.getByRole('button', { name: 'Add Month-End Carryover' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Month-End Carryover' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Toggle T1 for Month-End Carryover' })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'Award', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Avoid', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('combobox', { name: 'Month-End Carryover operator' })).toHaveValue('')
  await expect(dialog.getByRole('spinbutton', { name: 'Month-End Carryover carry-out days' })).toHaveAttribute('placeholder', 'Enter')
  await expect(dialog.locator('input[placeholder="1-5"]')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Toggle T1 for Month-End Carryover' }).click()
  await dialog.getByRole('combobox', { name: 'Month-End Carryover operator' }).selectOption('>')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await dialog.getByRole('spinbutton', { name: 'Month-End Carryover carry-out days' }).fill('6')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  await expect(dialog).toHaveCount(0)
  expect(addedPayload).toMatchObject({
    property: {
      propertyCode: 163,
      action: 'award',
      quantifier: null,
      tiers: ['T1'],
      bid: {
        type: 'month-end-carryover',
        operator: '>',
        days: 6,
      },
    },
  })
})

test('PBS-3528 — Deadhead Flying defaults to Award and submits fixed mode with flight dates', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  let addedPayload: Record<string, unknown> | null = null
  await page.route('**/api/pairing-bids/current/properties', async (route) => {
    expect(route.request().method()).toBe('POST')
    addedPayload = route.request().postDataJSON() as Record<string, unknown>
    await fulfillJson(route, {
      saved: true,
      draftVersion: 1,
      propertyGroupKey: 'added-deadhead-flying',
      rowSeq: 3,
    })
  })

  await page.goto('pairing')
  const workspace = await expectFavoriteTabIsDefault(page, 'pairing-add-properties-workspace')
  await workspace.getByRole('button', { name: 'ALL PROPERTIES' }).click()
  await workspace.getByPlaceholder('Search Properties').fill('Deadhead')
  await workspace.getByRole('button', { name: 'Add Deadhead Flying' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Deadhead Flying' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Toggle T1 for Deadhead Flying' })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'Award', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Avoid', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'Any deadhead', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Deadhead-only duty', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('combobox')).toHaveCount(0)
  await expect(dialog.getByRole('spinbutton')).toHaveCount(0)
  await expect(dialog.getByRole('switch', { name: 'LIMIT TO FLIGHT DATE' })).toHaveAttribute('aria-checked', 'false')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Toggle T1 for Deadhead Flying' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Deadhead-only duty', exact: true }).click()
  await dialog.getByRole('switch', { name: 'LIMIT TO FLIGHT DATE' }).click()
  await expect(dialog.getByRole('button', { name: 'Specific Dates' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Open date picker for Deadhead Flying flight dates' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-03' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-18' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  await expect(dialog).toHaveCount(0)
  expect(addedPayload).toMatchObject({
    property: {
      propertyCode: 122,
      action: 'award',
      quantifier: null,
      tiers: ['T1'],
      bid: {
        type: 'deadhead-flying',
        mode: 'deadhead-only-duty',
        dateScope: { mode: 'specific_dates', dates: ['2026-06-03', '2026-06-18'] },
      },
    },
  })
})

test('PBS-3529 — Search Pairings reuses Deadhead Flying mode and flight-date range', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page, {
    pairingDraftProperties: [{
      propertyGroupKey: 'existing-deadhead-flying',
      rowSeq: 3,
      propertyCode: 122,
      name: 'Deadhead Flying',
      action: 'avoid',
      quantifier: null,
      bid: {
        type: 'deadhead-flying',
        mode: 'deadhead-only-duty',
        dateScope: { mode: 'date_range', from: '2026-06-10', to: '2026-06-18' },
      },
      tiers: ['T1'],
    }],
  })

  await page.goto('pairing')
  await page.getByRole('button', { name: 'Preview existing pairing property Deadhead Flying' }).click()
  await expect(page).toHaveURL(/\/pairing\/search/)
  await page
    .getByTestId('pairing-search-criteria-actions-preview-122')
    .getByRole('button', { name: 'Edit search criteria Deadhead Flying' })
    .click()

  const dialog = page.getByRole('dialog', { name: 'Configure Deadhead Flying' })
  await expect(dialog.getByRole('button', { name: 'Avoid', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Deadhead-only duty', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('switch', { name: 'LIMIT TO FLIGHT DATE' })).toHaveAttribute('aria-checked', 'true')
  await expect(dialog.getByRole('button', { name: 'Date Range', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByText('2026-06-10')).toBeVisible()
  await expect(dialog.getByText('2026-06-18')).toBeVisible()
  await expect(dialog.getByRole('combobox')).toHaveCount(0)
  await expect(dialog.getByRole('spinbutton')).toHaveCount(0)
})

test('PBS-3524 — Search Pairings reuses the Flight Number Preference editor and rehydrates its payload', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page, {
    pairingDraftProperties: [
      {
        propertyGroupKey: 'existing-flight-number-preference',
        rowSeq: 3,
        propertyCode: 116,
        name: 'Flight Number Preference',
        action: 'avoid',
        quantifier: null,
        bid: {
          type: 'flight-number-preference',
          flightNumbers: ['0601'],
          dateScope: { mode: 'date_range', from: '2026-06-03', to: '2026-06-18' },
        },
        tiers: ['T1'],
      },
    ],
  })

  await page.goto('pairing')
  await page.getByRole('button', { name: 'Preview existing pairing property Flight Number Preference' }).click()
  await expect(page).toHaveURL(/\/pairing\/search/)
  await page
    .getByTestId('pairing-search-criteria-actions-preview-116')
    .getByRole('button', { name: 'Edit search criteria Flight Number Preference' })
    .click()

  const dialog = page.getByRole('dialog', { name: 'Configure Flight Number Preference' })
  await expect(dialog.getByRole('button', { name: 'Avoid', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('switch', { name: 'LIMIT TO FLIGHT DATE' })).toHaveAttribute('aria-checked', 'true')
  await expect(dialog.getByRole('button', { name: 'Date Range', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByText('0601')).toBeVisible()
  await expect(dialog.getByText('MATCHING FLIGHTS')).toHaveCount(0)
  await expect(dialog.getByRole('spinbutton')).toHaveCount(0)
})

test('PBS-3527 — Search Pairings reuses the Redeye editor and preserves an existing Award', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page, {
    pairingDraftProperties: [
      {
        propertyGroupKey: 'existing-redeye-preference',
        rowSeq: 3,
        propertyCode: 117,
        name: 'Redeye Preference',
        action: 'award',
        quantifier: null,
        bid: {
          type: 'redeye-preference',
          dateScope: { mode: 'specific_dates', dates: ['2026-06-03', '2026-06-18'] },
        },
        tiers: ['T1'],
      },
    ],
  })

  await page.goto('pairing')
  await page.getByRole('button', { name: 'Preview Award Redeye Preference' }).click()
  await expect(page).toHaveURL(/\/pairing\/search/)
  await page
    .getByTestId('pairing-search-criteria-actions-preview-117')
    .getByRole('button', { name: 'Edit search criteria Redeye Preference' })
    .click()

  const dialog = page.getByRole('dialog', { name: 'Configure Redeye Preference' })
  await expect(dialog.getByRole('button', { name: 'Award', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Avoid', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('switch', { name: 'LIMIT TO FLIGHT DATE' })).toHaveAttribute('aria-checked', 'true')
  await expect(dialog.getByRole('button', { name: 'Specific Dates' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByText('2026-06-03')).toBeVisible()
  await expect(dialog.getByText('2026-06-18')).toBeVisible()
})

test('PBS-3514 — unified Check-In / Check-Out Time defaults and controls follow the Jen design', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockWorkbenchApis(page)

  let addedPayload: Record<string, unknown> | null = null
  await page.route('**/api/pairing-bids/current/properties', async (route) => {
    expect(route.request().method()).toBe('POST')
    addedPayload = route.request().postDataJSON() as Record<string, unknown>
    await fulfillJson(route, {
      saved: true,
      draftVersion: 1,
      propertyGroupKey: 'added-pairing-check-time',
      rowSeq: 3,
    })
  })

  await page.goto('pairing')
  const workspace = await expectFavoriteTabIsDefault(page, 'pairing-add-properties-workspace')
  await workspace.getByRole('button', { name: 'ALL PROPERTIES' }).click()
  await workspace.getByRole('button', { name: 'Add Pairing Check-In / Check-Out Time' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Pairing Check-In / Check-Out Time' })
  const tierOne = dialog.getByRole('button', { name: 'Toggle T1 for Pairing Check-In / Check-Out Time' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Configure Check-In / Check-Out Time')).toBeVisible()
  await expect(tierOne).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByText(/REQUIRED/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Award' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Check-In', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Check-Out', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByLabel('Pairing Check-In / Check-Out Time operator')).toHaveValue('Between')
  await expect(dialog.getByLabel('Pairing Check-In / Check-Out Time from')).toHaveValue('')
  await expect(dialog.getByLabel('Pairing Check-In / Check-Out Time to')).toHaveValue('')
  const dateLimit = dialog.getByRole('switch', { name: 'Pairing Check-In / Check-Out Time limit to event date' })
  await expect(dateLimit).toHaveAttribute('aria-checked', 'false')
  await expect(dialog.getByRole('button', { name: 'Specific Dates' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Check-Out', exact: true }).click()
  await dialog.getByRole('button', { name: 'PM 14:00–22:00' }).click()
  await tierOne.click()
  await expect(dialog.getByRole('button', { name: 'Check-Out', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'PM 14:00–22:00' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByLabel('Pairing Check-In / Check-Out Time from')).toHaveValue('14:00')
  await expect(dialog.getByLabel('Pairing Check-In / Check-Out Time to')).toHaveValue('22:00')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()

  await dateLimit.click()
  await expect(dateLimit).toHaveAttribute('aria-checked', 'true')
  await expect(dialog.getByRole('button', { name: 'Specific Dates' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await dialog
    .getByRole('button', { name: 'Open date picker for Pairing Check-In / Check-Out Time event dates' })
    .click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-15' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-18' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()

  await dialog.getByRole('button', { name: 'ADD BID' }).click()
  await expect(dialog).toHaveCount(0)
  expect(addedPayload).toMatchObject({
    property: {
      propertyCode: 103,
      action: 'award',
      tiers: ['T1'],
      bid: {
        type: 'pairing-check-time',
        timeType: 'check_out',
        operator: 'Between',
        from: '14:00',
        to: '22:00',
        dateScope: { mode: 'specific_dates', dates: ['2026-06-15', '2026-06-18'] },
      },
    },
  })
  await expect(page.getByText(/Check-Out Between 14:00 - 22:00 on 2026-06-15, 2026-06-18/)).toBeVisible()
})
