import { expect, test, type Page, type Route } from '@playwright/test'

const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

type StandingProperty = {
  propertyGroupKey?: string
  rowSeq: number
  bidType?: 'DaysOff' | 'Pairing' | 'Line' | 'Reserve'
  propertyCode: number
  name: string
  action?: 'award' | 'avoid' | null
  bid: Record<string, unknown>
  tiers: string[]
}

type StandingDraft = {
  draftKey?: string
  bidId?: number
  periodId: null
  draftVersion: number
  periodCode: 'STANDING'
  bidContext: 'StandingLineholder' | 'StandingReserve'
  remarks: string
  properties: StandingProperty[]
}

type StandingResponse = {
  currentPeriod: {
    id: number | null
    rosterPeriodId?: number
    rosterPeriodKey?: string
    periodCode: string
    filiale: string | null
    division: string | null
    status: string
    computedStage: string
    rpStartLocal?: string
    rpEndLocal?: string
    bidOpenAt: string | null
    bidCloseAt: string | null
    canEditBid: boolean
    readOnlyReason: null
  }
  lineholderDraft: StandingDraft
  reserveDraft: StandingDraft
  preferOffConfig: {
    weekdays: Array<{
      code: string
      name: string
      order: number
      isoDay: number
    }>
    weekend: {
      available: boolean
      startDayCode?: string
      startDayName?: string
      startTime?: string
      endDayCode?: string
      endDayName?: string
      endTime?: string
    }
  }
  propertyCatalog: {
    lineholder: Array<{
      bidType: 'DaysOff' | 'Pairing' | 'Line'
      propertyCode: number
      name: string
      defaultAction?: 'award' | 'avoid' | null
      supportedActions?: Array<'award' | 'avoid'>
      defaultBid: Record<string, unknown>
    }>
    reserve: Array<{
      bidType: 'Reserve'
      propertyCode: number
      name: string
      defaultBid: Record<string, unknown>
    }>
  }
}

type SaveStandingDraftRequest = {
  mode: 'lineholder' | 'reserve'
  draft: StandingDraft
}

type MockStandingBidApisOptions = {
  currentDelayMs?: number
  currentPeriodOverride?: StandingResponse['currentPeriod']
  lineholderProperties?: StandingProperty[]
  reserveProperties?: StandingProperty[]
  saveDelayMs?: number
}

const standingLineholderPropertyCatalog = [
  {
    bidType: 'DaysOff',
    propertyCode: 201,
    name: 'Prefer Off',
    defaultBid: { type: 'tag-list', values: [] },
  },
  {
    bidType: 'DaysOff',
    propertyCode: 204,
    name: 'Long Stretch Off / Compressed Flying',
    defaultBid: { type: 'stepper-date-range', value: 10, from: '', to: '', min: 1, max: 14 },
  },
  {
    bidType: 'Pairing',
    propertyCode: 168,
    name: 'Airport Preference',
    defaultAction: 'award',
    supportedActions: ['award', 'avoid'],
    defaultBid: {
      type: 'airport-preference',
      event: 'landing',
      locations: [],
      dateScope: null,
      minimumLayoverDuration: null,
    },
  },
  {
    bidType: 'Pairing',
    propertyCode: 428,
    name: 'Efficient Flying First',
    defaultAction: 'award',
    supportedActions: ['award'],
    defaultBid: { type: 'efficient-flying-preference', mode: 'efficient' },
  },
  {
    bidType: 'Pairing',
    propertyCode: 103,
    name: 'Pairing Check-In / Check-Out Time',
    defaultAction: 'award',
    supportedActions: ['award', 'avoid'],
    supportedOperators: ['=', '<', '>', 'Between'],
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
    bidType: 'Pairing',
    propertyCode: 107,
    name: 'Flight Legs per Duty',
    defaultAction: 'award',
    supportedActions: ['award', 'avoid'],
    supportedOperators: ['=', '<', '>', 'Between'],
    supportedQuantifiers: ['any', 'every'],
    defaultQuantifier: 'any',
    numericBounds: { min: 1, max: 8 },
    defaultBid: { type: 'flight-legs-per-duty', operator: '=', legs: 2, dateScope: null },
  },
  {
    bidType: 'Pairing',
    propertyCode: 110,
    name: 'Work Day Preference',
    defaultAction: 'award',
    supportedActions: ['award'],
    defaultBid: { type: 'work-day-preference', days: [], dateScope: null },
  },
  {
    bidType: 'Pairing',
    propertyCode: 112,
    name: 'Pairing Length',
    defaultAction: 'award',
    supportedActions: ['award', 'avoid'],
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
    bidType: 'Pairing',
    propertyCode: 116,
    name: 'Flight Number Preference',
    defaultAction: 'award',
    supportedActions: ['award', 'avoid'],
    defaultBid: { type: 'flight-number-preference', flightNumbers: [], dateScope: null },
  },
  {
    bidType: 'Pairing',
    propertyCode: 117,
    name: 'Redeye Preference',
    defaultAction: 'avoid',
    supportedActions: ['award', 'avoid'],
    defaultBid: { type: 'redeye-preference', dateScope: null },
  },
  {
    bidType: 'Pairing',
    propertyCode: 122,
    name: 'Deadhead Flying',
    defaultAction: 'award',
    supportedActions: ['award', 'avoid'],
    defaultBid: { type: 'deadhead-flying', mode: 'any-deadhead', dateScope: null },
  },
  {
    bidType: 'Pairing',
    propertyCode: 129,
    name: 'Time Between Flights',
    defaultAction: 'award',
    supportedActions: ['award', 'avoid'],
    supportedOperators: ['<', '=', '>'],
    supportedQuantifiers: ['any', 'every'],
    defaultQuantifier: 'any',
    defaultBid: { type: 'duration', value: '', operator: '>' },
  },
  {
    bidType: 'Pairing',
    propertyCode: 163,
    name: 'Month-End Carryover',
    defaultAction: 'award',
    supportedActions: ['award', 'avoid'],
    supportedOperators: ['<', '=', '>', 'Between'],
    defaultBid: { type: 'month-end-carryover', operator: '>', days: null },
  },
  {
    bidType: 'Line',
    propertyCode: 429,
    name: 'Credit Window Preference',
    defaultBid: { type: 'credit-window-preference', direction: 'more' },
  },
  {
    bidType: 'Line',
    propertyCode: 407,
    name: 'Minimum Base Layover',
    defaultBid: { type: 'minimum-base-layover', minimumDuration: '' },
  },
  {
    bidType: 'Line',
    propertyCode: 408,
    name: 'Commuter Pattern',
    defaultBid: {
      type: 'days-off-on-pattern',
      minDaysOff: 4,
      minDaysOn: 4,
      maxDaysOn: 5,
      dateRange: null,
      min: 1,
      max: 14,
    },
  },
  {
    bidType: 'Line',
    propertyCode: 427,
    name: 'Reserve',
    defaultAction: 'award',
    supportedActions: ['award', 'avoid'],
    defaultBid: { type: 'flag' },
  },
] as const

const standingReservePropertyCatalog = [
  {
    bidType: 'Reserve',
    propertyCode: 301,
    name: 'Reserve Preference',
    defaultBid: {
      type: 'reserve-call-type-date-scope',
      callType: 'CRAM',
      options: ['CRAM', 'CRPM'],
      dateScope: { mode: 'whole_month' },
    },
  },
] as const

test.use({
  storageState: { cookies: [], origins: [] },
})

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const waitForMs = (delayMs: number) => new Promise((resolve) => {
  setTimeout(resolve, delayMs)
})

const cloneStandingPropertyCatalog = () => structuredClone({
  lineholder: standingLineholderPropertyCatalog,
  reserve: standingReservePropertyCatalog,
}) as unknown as StandingResponse['propertyCatalog']

const buildStandingResponse = (): StandingResponse => ({
  currentPeriod: {
    id: null,
    periodCode: 'Standing Bid',
    filiale: null,
    division: null,
    status: 'OPEN',
    computedStage: 'OPEN',
    bidOpenAt: null,
    bidCloseAt: null,
    canEditBid: true,
    readOnlyReason: null,
  },
  lineholderDraft: {
    draftKey: '1001',
    bidId: 1001,
    periodId: null,
    draftVersion: 0,
    periodCode: 'STANDING',
    bidContext: 'StandingLineholder',
    remarks: '',
    properties: [],
  },
  reserveDraft: {
    draftKey: '2001',
    bidId: 2001,
    periodId: null,
    draftVersion: 0,
    periodCode: 'STANDING',
    bidContext: 'StandingReserve',
    remarks: '',
    properties: [],
  },
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
  propertyCatalog: cloneStandingPropertyCatalog(),
})

const mockStandingBidApis = async (
  page: Page,
  {
    currentDelayMs = 0,
    currentPeriodOverride,
    lineholderProperties = [],
    reserveProperties = [],
    saveDelayMs = 0,
  }: MockStandingBidApisOptions = {},
) => {
  const initialResponse = buildStandingResponse()
  let standingResponse = {
    ...initialResponse,
    currentPeriod: currentPeriodOverride ?? initialResponse.currentPeriod,
    lineholderDraft: {
      ...initialResponse.lineholderDraft,
      properties: lineholderProperties,
    },
    reserveDraft: {
      ...initialResponse.reserveDraft,
      properties: reserveProperties,
    },
  }
  let lastSaveRequest: SaveStandingDraftRequest | null = null
  const saveRequests: SaveStandingDraftRequest[] = []

  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, 'standing-bid-e2e-token')
  }, AUTH_TOKEN_KEY)

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

  await page.route('**/api/standing-bids/current', async (route) => {
    if (route.request().method() === 'GET') {
      if (currentDelayMs > 0) {
        await waitForMs(currentDelayMs)
      }

      await fulfillJson(route, { code: 200, data: standingResponse, message: 'ok' })
      return
    }

    if (route.request().method() === 'PUT') {
      lastSaveRequest = route.request().postDataJSON() as SaveStandingDraftRequest
      saveRequests.push(lastSaveRequest)
      const targetDraft = {
        ...lastSaveRequest.draft,
        draftVersion: lastSaveRequest.draft.draftVersion + 1,
      }

      standingResponse = lastSaveRequest.mode === 'lineholder'
        ? { ...standingResponse, lineholderDraft: targetDraft }
        : { ...standingResponse, reserveDraft: targetDraft }

      if (saveDelayMs > 0) {
        await waitForMs(saveDelayMs)
      }

      await fulfillJson(route, { code: 200, data: standingResponse, message: 'ok' })
      return
    }

    await route.fallback()
  })

  await page.route('**/api/pairing-bids/reference-options', async (route) => {
    await fulfillJson(route, {
      code: 200,
      data: {
        airports: [],
        cities: [],
      },
      message: 'ok',
    })
  })
  await page.route('**/api/pairing-bids/efficient-flying-config', async (route) => {
    await fulfillJson(route, {
      code: 200,
      data: {
        available: true,
        defaultMode: 'efficient',
        percentileOptions: [],
      },
      message: 'ok',
    })
  })
  await page.route('**/api/pairing-bids/redeye-config', async (route) => {
    await fulfillJson(route, {
      code: 200,
      data: {
        available: true,
        defaultMode: 'redeye',
      },
      message: 'ok',
    })
  })
  await page.route('**/api/pairing-search/airport-options**', async (route) => {
    await fulfillJson(route, {
      code: 200,
      data: {
        airportPreferenceLayoverHours: {
          defaultHours: 13,
          maxHours: 18,
          minHours: 13,
          stepHours: 1,
        },
        airportPreferenceOptions: [],
        filterAirports: [],
        landingAirports: [],
        layoverAirports: [],
        workStartStations: [],
      },
      message: 'ok',
    })
  })
  await page.route('**/api/pairing-search/time-between-flights-bounds**', async (route) => {
    await fulfillJson(route, {
      code: 200,
      data: {
        minimumMinutes: 0,
        maximumMinutes: null,
      },
      message: 'ok',
    })
  })
  await page.route('**/api/line-bids/credit-window-config', async (route) => {
    await fulfillJson(route, {
      code: 200,
      data: {
        available: true,
        minCreditMinutes: 0,
        maxCreditMinutes: 9_999,
      },
      message: 'ok',
    })
  })
  await page.route('**/api/line-bids/minimum-base-layover-config', async (route) => {
    await fulfillJson(route, {
      code: 200,
      data: {
        available: true,
        minDuration: '011:00',
      },
      message: 'ok',
    })
  })

  return {
    getLastSaveRequest: () => lastSaveRequest,
    getSaveRequests: () => [...saveRequests],
  }
}

test('PBS-3301 — Standing Bid opens as a standalone portal page without Bidding Calendar', async ({ page }) => {
  await mockStandingBidApis(page)

  await page.goto('standing-bid')

  await expect(page.getByTestId('dashboard-top-nav')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Standing Bid' })).toHaveCount(0)
  await expect(page.getByText(
    'Reusable long-term preferences used when no current bid applies.',
  )).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Lineholder' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Reserve', exact: true })).toHaveCount(0)
  await expect(page.getByText('EXISTING STANDING BID')).toBeVisible()
  await expect(page.getByText('ADD STANDING BID')).toBeVisible()
  await expect(page.getByText('No saved properties yet. Add one from the list below to start building this draft.')).toBeVisible()
  await expect(page.getByText('FAVORITED PROPERTIES')).toHaveCount(0)
  await expect(page.getByText('BIDDING CALENDAR')).toHaveCount(0)
})

test('PBS-3310 — Existing Standing Bid can be viewed by tier without changing Add properties', async ({ page }) => {
  const standingApis = await mockStandingBidApis(page, {
    lineholderProperties: [
      {
        propertyGroupKey: 'prefer-off-t1',
        rowSeq: 1,
        bidType: 'DaysOff',
        propertyCode: 201,
        name: 'Prefer Off',
        bid: { type: 'tag-list', values: ['Monday'] },
        tiers: ['T1'],
      },
      {
        propertyGroupKey: 'airport-t2',
        rowSeq: 2,
        bidType: 'Pairing',
        propertyCode: 168,
        name: 'Airport Preference',
        action: 'award',
        bid: {
          type: 'airport-preference',
          event: 'landing',
          locations: [{ code: 'YYZ', kind: 'airport' }],
          dateScope: null,
          minimumLayoverDuration: null,
        },
        tiers: ['T2'],
      },
      {
        propertyGroupKey: 'commuter-t1-t2',
        rowSeq: 3,
        bidType: 'Line',
        propertyCode: 408,
        name: 'Commuter Pattern',
        bid: {
          type: 'days-off-on-pattern',
          minDaysOff: 4,
          minDaysOn: 4,
          maxDaysOn: 5,
          dateRange: null,
          min: 1,
          max: 14,
        },
        tiers: ['T1', 'T2'],
      },
    ],
  })

  await page.goto('standing-bid')

  const tierFilter = page.getByRole('group', { name: 'Filter existing Standing Bid by tier' })
  await expect(page.getByRole('radio', { name: 'ALL' })).toBeChecked()
  await expect(page.getByLabel('Prefer Off bid summary')).toBeVisible()
  await expect(page.getByLabel('Airport Preference bid summary')).toBeVisible()
  await expect(page.getByLabel('Commuter Pattern bid summary')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Add / }).first()).toBeVisible()
  const addButtonsBefore = await page.getByRole('button', { name: /^Add / }).count()

  await tierFilter.getByText('T1', { exact: true }).click()
  await expect(page.getByLabel('Prefer Off bid summary')).toBeVisible()
  await expect(page.getByLabel('Airport Preference bid summary')).toHaveCount(0)
  await expect(page.getByLabel('Commuter Pattern bid summary')).toBeVisible()

  await tierFilter.getByText('T2', { exact: true }).click()
  await expect(page.getByLabel('Prefer Off bid summary')).toHaveCount(0)
  await expect(page.getByLabel('Airport Preference bid summary')).toBeVisible()
  await expect(page.getByLabel('Commuter Pattern bid summary')).toBeVisible()

  await tierFilter.getByText('T7', { exact: true }).click()
  await expect(page.getByText('No saved Standing Bid properties in T7.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Add / })).toHaveCount(addButtonsBefore)
  expect(standingApis.getSaveRequests()).toHaveLength(0)
})

test('PBS-3305 — Standing Bid loading state keeps the adaptive single-column shell', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await mockStandingBidApis(page, { currentDelayMs: 800 })

  await page.goto('standing-bid')

  await expect(page.getByTestId('standing-bid-page-layout')).toBeVisible()
  await expect(page.getByTestId('standing-bid-left-panel-loading')).toHaveCount(0)
  await expect(page.getByTestId('standing-bid-page-loading')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Standing Bid' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Lineholder' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Reserve', exact: true })).toHaveCount(0)
  await expect(page.getByText('EXISTING STANDING BID')).toBeVisible()
  await expect(page.getByText('BIDDING CALENDAR')).toHaveCount(0)

  const loadingHorizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)

  expect(loadingHorizontalOverflow).toBeLessThanOrEqual(1)
  await expect(page.getByText('No saved properties yet. Add one from the list below to start building this draft.')).toBeVisible()
})

test('PBS-3302 — Lineholder Standing Bid can add and auto-save a long-term rule', async ({ page }) => {
  const standingApis = await mockStandingBidApis(page)

  await page.goto('standing-bid')
  await expect(page.getByRole('heading', { name: 'Standing Bid' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Add Long Stretch Off / Compressed Flying' }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Configure Standing Bid for Long Stretch Off / Compressed Flying',
  })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('LIMIT TO A DATE RANGE')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /calendar/i })).toHaveCount(0)
  await dialog.getByRole('spinbutton', {
    name: 'Configure bid for Long Stretch Off / Compressed Flying minimum consecutive days off',
  }).fill('8')
  await dialog.getByRole('button', {
    name: 'Toggle T1 for Long Stretch Off / Compressed Flying',
  }).click()
  await page.getByRole('button', { name: 'ADD BID' }).click()

  await expect.poll(() => standingApis.getLastSaveRequest()?.mode).toBe('lineholder')
  expect(standingApis.getLastSaveRequest()?.draft).toMatchObject({
    periodCode: 'STANDING',
    bidContext: 'StandingLineholder',
    properties: [
      {
        propertyCode: 204,
        name: 'Long Stretch Off / Compressed Flying',
        bid: { type: 'stepper-date-range', value: 8, from: '', to: '' },
        tiers: ['T1'],
      },
    ],
  })
  await expect(page.getByLabel(
    'Long Stretch Off / Compressed Flying bid summary',
  )).toHaveText('Award at least 8 consecutive days off')
})

test('PBS-3314 — Standing add dialog preserves its values until the delayed save succeeds', async ({ page }) => {
  await mockStandingBidApis(page, { saveDelayMs: 3000 })

  await page.goto('standing-bid')
  await page.getByRole('button', { name: 'Add Long Stretch Off / Compressed Flying' }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Configure Standing Bid for Long Stretch Off / Compressed Flying',
  })
  const valueInput = dialog.getByRole('spinbutton', {
    name: 'Configure bid for Long Stretch Off / Compressed Flying minimum consecutive days off',
  })
  const tierButton = dialog.getByRole('button', {
    name: 'Toggle T1 for Long Stretch Off / Compressed Flying',
  })

  await valueInput.fill('8')
  await tierButton.click()
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  await expect(dialog.getByRole('button', { name: 'ADDING...' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'CANCEL' })).toBeDisabled()
  await expect(valueInput).toHaveValue('8')
  await expect(tierButton).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel(
    'Long Stretch Off / Compressed Flying bid summary',
  )).toHaveCount(0)

  await expect(dialog).toHaveCount(0)
  await expect(page.getByLabel(
    'Long Stretch Off / Compressed Flying bid summary',
  )).toHaveText('Award at least 8 consecutive days off')
})

test('PBS-3315 — Standing Pairing dialog keeps tiers and values during a delayed save', async ({ page }) => {
  await mockStandingBidApis(page, { saveDelayMs: 3000 })

  await page.goto('standing-bid')
  await page.getByRole('button', { name: 'Add Flight Legs per Duty' }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Configure Standing Bid for Flight Legs per Duty',
  })
  const tierButton = dialog.getByRole('button', {
    name: 'Toggle T1 for Flight Legs per Duty',
  })
  const operatorSelect = dialog.getByRole('combobox', {
    name: 'Flight Legs per Duty operator',
  })
  const legsInput = dialog.getByRole('spinbutton', {
    name: 'Flight Legs per Duty legs per duty',
  })

  await tierButton.click()
  await operatorSelect.selectOption('<')
  await legsInput.fill('3')
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  await expect(dialog.getByRole('button', { name: 'ADDING...' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'CANCEL' })).toBeDisabled()
  await expect(tierButton).toHaveAttribute('aria-pressed', 'true')
  await expect(operatorSelect).toHaveValue('<')
  await expect(legsInput).toHaveValue('3')

  await expect(dialog).toHaveCount(0)
})

test('PBS-3313 — Standing Lineholder Mixed Line Bid saves explicit Pairing Only action', async ({ page }) => {
  const standingApis = await mockStandingBidApis(page)

  await page.goto('standing-bid')
  const addWorkspace = page.getByTestId('rule-bid-add-properties-workspace')
  await addWorkspace.getByPlaceholder('Search Standing Properties').fill('Mixed Line')
  await addWorkspace.getByRole('button', { name: 'Add Mixed Line Bid', exact: true }).click()

  const dialog = page.getByRole('dialog', {
    name: 'Configure Standing Bid for Mixed Line Bid',
  })
  await expect(dialog.getByRole('button', { name: 'Mixed Line', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await dialog.getByRole('button', { name: '+ ADD RESERVE SHORT CALL' }).click()
  await expect(dialog.getByLabel('Configure short-call 1 for Mixed Line Bid short-call type')).toBeVisible()
  await dialog.getByRole('button', { name: 'Pairing Only' }).click()
  await expect(dialog.getByText('Pairing Only conflicts with Reserve Short Call bids.')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'CLEAR BIDS' })).toHaveCount(0)
  await expect(dialog.getByText('RESERVE SHORT CALL', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', {
    name: 'Toggle T1 for Mixed Line Bid',
  }).click()
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  await expect.poll(() => standingApis.getLastSaveRequest()?.mode).toBe('lineholder')
  expect(standingApis.getLastSaveRequest()?.draft).toMatchObject({
    periodCode: 'STANDING',
    bidContext: 'StandingLineholder',
    properties: [
      {
        propertyCode: 427,
        name: 'Reserve',
        action: 'avoid',
        bid: {
          type: 'flag',
        },
        tiers: ['T1'],
      },
    ],
  })
})

test('PBS-3314 — Standing Mixed Line moves existing Reserve 427 to reserve short-call', async ({ page }) => {
  const standingApis = await mockStandingBidApis(page, {
    lineholderProperties: [
      {
        propertyGroupKey: 'standing-line-427',
        rowSeq: 1,
        bidType: 'Line',
        propertyCode: 427,
        name: 'Reserve',
        action: 'award',
        bid: { type: 'flag' },
        tiers: ['T1'],
      },
    ],
  })

  await page.goto('standing-bid')

  await expect(page.getByLabel('Mixed Line Bid bid summary')).toContainText(
    'Reserve only for the whole bid month',
  )
  await page.getByRole('button', { name: 'Edit existing property Mixed Line Bid' }).click()

  const dialog = page.getByRole('dialog', {
    name: 'Configure Standing Bid for Mixed Line Bid',
  })
  await expect(dialog.getByRole('button', { name: 'Reserve Only' })).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'Mixed Line', exact: true }).click()
  await dialog.getByRole('button', { name: '+ ADD RESERVE SHORT CALL' }).click()
  await dialog.getByRole('button', { name: 'UPDATE BID' }).click()

  await expect.poll(() => standingApis.getSaveRequests().length).toBe(2)
  const [lineholderSave, reserveSave] = standingApis.getSaveRequests()

  expect(lineholderSave).toMatchObject({
    mode: 'lineholder',
    draft: {
      bidContext: 'StandingLineholder',
      properties: [],
    },
  })
  expect(reserveSave).toMatchObject({
    mode: 'reserve',
    draft: {
      bidContext: 'StandingReserve',
      properties: [
        {
          propertyCode: 301,
          propertyGroupKey: expect.stringMatching(/^ml-sc-/),
          name: 'Reserve Preference',
          action: 'award',
          bid: {
            type: 'reserve-call-type-date-scope',
            callType: 'PRAM',
            dateScope: { mode: 'whole_month' },
          },
          tiers: ['T1'],
        },
      ],
    },
  })
  await expect(page.getByLabel('Mixed Line Bid bid summary')).toContainText('PRAM on Whole Month')
})

test('PBS-3323 — new Minimum Base Layover uses the latest managed definition', async ({ page }) => {
  const standingApis = await mockStandingBidApis(page)
  await page.route('**/api/line-bids/minimum-base-layover-config', async (route) => {
    await fulfillJson(route, {
      code: 200,
      data: { available: true, minDuration: '014:00' },
      message: 'ok',
    })
  })

  await page.goto('standing-bid')
  const addWorkspace = page.getByTestId('rule-bid-add-properties-workspace')
  await addWorkspace.getByRole('tab', { name: 'ROSTER' }).click()
  await addWorkspace.getByPlaceholder('Search Standing Properties').fill('Minimum Base Layover')
  await addWorkspace.getByRole('button', { name: 'Add Minimum Base Layover' }).click()

  const dialog = page.getByRole('dialog', {
    name: 'Configure Standing Bid for Minimum Base Layover',
  })
  const duration = dialog.getByRole('textbox', {
    name: 'Minimum Base Layover minimum base layover',
  })
  await expect(duration).toHaveValue('14:00')
  await expect(dialog.getByText('Minimum 14:00')).toBeVisible()
  await dialog.getByRole('button', {
    name: 'Toggle T1 for Minimum Base Layover',
  }).click()
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  await expect.poll(() => standingApis.getLastSaveRequest()?.draft.properties[0]?.bid).toEqual({
    type: 'minimum-base-layover',
    minimumDuration: '14:00',
  })
})

test('PBS-3306 — Standing Bid reusable catalog follows the current Bid catalog without favorites', async ({ page }) => {
  await mockStandingBidApis(page)

  await page.goto('standing-bid')
  await expect(page.getByRole('heading', { name: 'Standing Bid' })).toHaveCount(0)

  const addWorkspace = page.getByTestId('rule-bid-add-properties-workspace')
  await expect(addWorkspace.getByRole('tab', { name: 'DAYS OFF' })).toBeVisible()
  await expect(addWorkspace.getByRole('tab', { name: 'PAIRING' })).toBeVisible()
  await expect(addWorkspace.getByRole('tab', { name: 'ROSTER' })).toBeVisible()
  await expect(addWorkspace.getByRole('tab', { name: 'RESERVE' })).toHaveCount(0)
  await expect(addWorkspace.getByRole('button', { name: 'Add Prefer Off' })).toBeVisible()
  await expect(addWorkspace.getByRole('button', {
    name: 'Add Long Stretch Off / Compressed Flying',
  })).toBeVisible()
  await expect(addWorkspace.getByRole('button', { name: 'Add Airport Preference' })).toBeVisible()
  await expect(addWorkspace.getByRole('button', { name: 'Add Efficient Flying First' })).toBeVisible()
  await addWorkspace.getByRole('tab', { name: 'ROSTER' }).click()
  await expect(addWorkspace.getByRole('button', { name: 'Add Credit Window Preference' })).toBeVisible()
  await expect(addWorkspace.getByRole('button', { name: 'Add Reserve Preference' })).toBeVisible()
  await expect(page.getByText('FAVORITED PROPERTIES')).toHaveCount(0)
  await expect(addWorkspace.getByText('Any Landing In Airport')).toHaveCount(0)
  await expect(addWorkspace.getByText('Any Layover In Airport')).toHaveCount(0)
  await expect(addWorkspace.getByText('Pairing Number')).toHaveCount(0)
  await expect(addWorkspace.getByText('Day of Week Off')).toHaveCount(0)
  await expect(addWorkspace.getByText('Reserve / Flying Date Pattern')).toHaveCount(0)
})

test('PBS-Standing-Airport — Airport Preference dropdown follows the scaled Standing dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 700 })
  await mockStandingBidApis(page, {
    currentPeriodOverride: {
      id: 38,
      rosterPeriodId: 38,
      rosterPeriodKey: '2026RP06',
      periodCode: 'Jun 2026',
      filiale: 'F8',
      division: 'C',
      status: 'OPEN',
      computedStage: 'OPEN',
      rpStartLocal: '2026-06-01',
      rpEndLocal: '2026-06-30',
      bidOpenAt: '2026-05-01T00:00:00.000Z',
      bidCloseAt: '2026-05-08T23:59:00.000Z',
      canEditBid: true,
      readOnlyReason: null,
    },
  })
  await page.route('**/api/pairing-bids/reference-options', async (route) => {
    await fulfillJson(route, {
      code: 200,
      data: {
        airports: [{ code: 'YYZ', abbr: 'YYZ', city: 'Toronto Pearson' }],
        cities: [],
      },
      message: 'ok',
    })
  })
  await page.route('**/api/pairing-search/airport-options**', async (route) => {
    await fulfillJson(route, {
      code: 200,
      data: {
        airportPreferenceLayoverHours: {
          defaultHours: 13,
          maxHours: 18,
          minHours: 13,
          stepHours: 1,
        },
        airportPreferenceOptions: [
          {
            code: 'YYZ',
            events: ['landing', 'layover'],
            kind: 'airport',
            label: 'YYZ · Toronto Pearson',
          },
        ],
        landingAirports: ['YYZ'],
        layoverAirports: ['YYZ'],
        workStartStations: ['YYZ'],
      },
      message: 'ok',
    })
  })

  await page.goto('standing-bid')
  await page.getByRole('button', { name: 'Add Airport Preference' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Standing Bid for Airport Preference' })
  const trigger = dialog.getByRole('combobox', { name: 'Airport Preference airports or cities' })
  await expect(trigger).toBeVisible()
  await trigger.click()

  const dropdown = page.getByTestId('airport-preference-location-dropdown')
  await expect(dropdown).toBeVisible()
  await expect(page.getByRole('option', { name: /YYZ · Toronto Pearson/ })).toBeVisible()

  const metrics = await page.evaluate(() => {
    const triggerElement = document.querySelector<HTMLElement>(
      '[role="combobox"][aria-label="Airport Preference airports or cities"]',
    )
    const dropdownElement = document.querySelector<HTMLElement>(
      '[data-testid="airport-preference-location-dropdown"]',
    )
    const triggerRect = triggerElement?.getBoundingClientRect()
    const dropdownRect = dropdownElement?.getBoundingClientRect()

    return {
      dropdown: dropdownRect
        ? {
            bottom: dropdownRect.bottom,
            left: dropdownRect.left,
            right: dropdownRect.right,
            top: dropdownRect.top,
          }
        : null,
      dropdownScale: dropdownElement
        ? new DOMMatrixReadOnly(window.getComputedStyle(dropdownElement).transform).a
        : null,
      triggerScale: triggerElement && triggerElement.offsetWidth > 0
        ? triggerRect!.width / triggerElement.offsetWidth
        : null,
    }
  })

  expect(metrics.dropdown).not.toBeNull()
  expect(metrics.dropdownScale).toBeCloseTo(metrics.triggerScale ?? 1, 2)
  expect(metrics.dropdown!.left).toBeGreaterThanOrEqual(11)
  expect(metrics.dropdown!.right).toBeLessThanOrEqual(1355)
  expect(metrics.dropdown!.top).toBeGreaterThanOrEqual(11)
  expect(metrics.dropdown!.bottom).toBeLessThanOrEqual(689)

  await page.keyboard.press('Escape')
  await expect(dropdown).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(trigger).toBeFocused()
})

test('PBS-3309 — Standing Bid category tabs filter before search', async ({ page }) => {
  await mockStandingBidApis(page)

  await page.goto('standing-bid')
  await expect(page.getByRole('heading', { name: 'Standing Bid' })).toHaveCount(0)

  const addWorkspace = page.getByTestId('rule-bid-add-properties-workspace')
  await expect(addWorkspace.getByRole('tab', { name: 'ALL PROPERTIES' })).toHaveAttribute('aria-selected', 'true')
  await expect(addWorkspace.getByRole('tab', { name: 'DAYS OFF' })).toBeVisible()
  await expect(addWorkspace.getByRole('tab', { name: 'PAIRING' })).toBeVisible()
  await expect(addWorkspace.getByRole('tab', { name: 'ROSTER' })).toBeVisible()
  await expect(addWorkspace.getByRole('tab', { name: 'RESERVE' })).toHaveCount(0)

  await addWorkspace.getByRole('tab', { name: 'PAIRING' }).click()
  await expect(addWorkspace.getByRole('tab', { name: 'PAIRING' })).toHaveAttribute('aria-selected', 'true')
  await expect(addWorkspace.getByRole('button', { name: 'Add Airport Preference' })).toBeVisible()
  await expect(addWorkspace.getByRole('button', { name: 'Add Efficient Flying First' })).toBeVisible()
  await expect(addWorkspace.getByRole('button', { name: 'Add Prefer Off' })).toHaveCount(0)
  await expect(addWorkspace.getByRole('button', { name: 'Add Credit Window Preference' })).toHaveCount(0)

  await addWorkspace.getByPlaceholder('Search Standing Properties').fill('credit')
  await expect(addWorkspace.getByRole('button', { name: 'Add Airport Preference' })).toHaveCount(0)
  await expect(addWorkspace.getByRole('button', { name: 'Add Efficient Flying First' })).toHaveCount(0)
  await expect(addWorkspace.getByRole('button', { name: 'Add Credit Window Preference' })).toHaveCount(0)

  await addWorkspace.getByRole('tab', { name: 'ALL PROPERTIES' }).click()
  await expect(addWorkspace.getByRole('tab', { name: 'ALL PROPERTIES' })).toHaveAttribute('aria-selected', 'true')
  await expect(addWorkspace.getByRole('button', { name: 'Add Credit Window Preference' })).toBeVisible()
})

test('PBS-3307 — Standing Prefer Off hides absolute dates and keeps recurring time controls', async ({ page }) => {
  const standingApis = await mockStandingBidApis(page)

  await page.goto('standing-bid')
  await page.getByRole('button', { name: 'Add Prefer Off' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Standing Bid for Prefer Off' })

  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Specific Dates' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Date Range' })).toHaveCount(0)
  await expect(dialog.getByText('SPECIFIC DATES', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText('DAYS OF WEEK', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Weekends' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Weekends' }).click()
  await expect(dialog.getByText('Every weekend', { exact: true })).toBeVisible()
  await expect(dialog.getByText('0 weekends', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Days of Week' }).click()
  await dialog.getByRole('button', { name: 'Monday' }).click()
  await dialog.getByRole('button', { name: 'Saturday' }).click()
  await expect(dialog.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Saturday' })).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('switch', { name: 'Prefer Off time window' }).click()
  await dialog.getByLabel('Prefer Off time from').fill('08:00')
  await dialog.getByLabel('Prefer Off time to').fill('18:00')
  await dialog.getByRole('button', { name: 'Toggle T1 for Prefer Off' }).click()
  await page.getByRole('button', { name: 'ADD BID' }).click()

  await expect.poll(() => standingApis.getLastSaveRequest()?.mode).toBe('lineholder')
  expect(standingApis.getLastSaveRequest()?.draft).toMatchObject({
    properties: [
      {
        propertyCode: 201,
        name: 'Prefer Off',
        bid: { type: 'tag-list', values: ['Monday', 'Saturday', 'Window 08:00-18:00'] },
        tiers: ['T1'],
      },
    ],
  })
})

test('PBS-3310 — Standing Prefer Off reuses the Current Bid badge and semantic summary', async ({ page }) => {
  await mockStandingBidApis(page, {
    lineholderProperties: [
      {
        propertyGroupKey: 'prefer-off-weekdays-window',
        rowSeq: 1,
        bidType: 'DaysOff',
        propertyCode: 201,
        name: 'Prefer Off',
        bid: {
          type: 'tag-list',
          values: ['Friday', 'Tuesday', 'Saturday', 'Window 18:00-23:59'],
        },
        tiers: ['T4'],
      },
      {
        propertyGroupKey: 'prefer-off-weekends-window',
        rowSeq: 2,
        bidType: 'DaysOff',
        propertyCode: 201,
        name: 'Prefer Off',
        bid: {
          type: 'tag-list',
          values: ['Weekends', 'Window 18:00-23:59'],
        },
        tiers: ['T1'],
      },
    ],
  })

  await page.goto('standing-bid')

  const existingRows = page.getByTestId('rule-bid-existing-row')
  await expect(existingRows).toHaveCount(2)
  await expect(page.getByLabel('Prefer Off bid summary').filter({
    hasText: 'Prefer off on Tuesday, Friday, Saturday from 18:00 to 23:59',
  })).toBeVisible()
  await expect(page.getByLabel('Prefer Off bid summary').filter({
    hasText: 'Prefer off on weekends from 18:00 to 23:59',
  })).toBeVisible()

  for (const row of await existingRows.all()) {
    const badge = row.getByText('Days Off', { exact: true })

    await expect(badge).toHaveClass(/border-\[#bddfcb\]/)
    await expect(badge).toHaveClass(/bg-\[#effaf3\]/)
    await expect(row.getByText('Prefer Off', { exact: true })).toHaveCount(0)
    await expect(row.getByRole('button', { name: 'Edit existing property Prefer Off' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Delete existing property Prefer Off' })).toBeVisible()
  }
})

test('PBS-3311 — Standing Existing rows reuse Bid-style badges and semantic summaries', async ({ page }) => {
  await mockStandingBidApis(page, {
    lineholderProperties: [
      {
        propertyGroupKey: 'pairing-existing',
        rowSeq: 1,
        bidType: 'Pairing',
        propertyCode: 168,
        name: 'Airport Preference',
        action: 'award',
        bid: {
          type: 'airport-preference',
          event: 'landing',
          locations: [{ code: 'YYZ', kind: 'airport' }],
          dateScope: null,
          minimumLayoverDuration: null,
        },
        tiers: ['T1'],
      },
      {
        propertyGroupKey: 'roster-existing',
        rowSeq: 2,
        bidType: 'Line',
        propertyCode: 408,
        name: 'Commuter Pattern',
        bid: {
          type: 'days-off-on-pattern',
          minDaysOff: 4,
          minDaysOn: 4,
          maxDaysOn: 5,
          dateRange: null,
        },
        tiers: ['T1'],
      },
    ],
    reserveProperties: [
      {
        propertyGroupKey: 'reserve-existing',
        rowSeq: 1,
        bidType: 'Reserve',
        propertyCode: 301,
        name: 'Reserve Preference',
        bid: {
          type: 'reserve-call-type-date-scope',
          callType: 'PRAM',
          options: ['PRAM'],
          dateScope: { mode: 'whole_month' },
        },
        tiers: ['T1'],
      },
    ],
  })

  await page.goto('standing-bid')

  const expectedRows = [
    {
      name: 'Airport Preference',
      badge: 'Pairing',
      badgeClass: /border-\[#c9c7f5\]/,
      summary: 'Award pairings landing at YYZ',
    },
    {
      name: 'Commuter Pattern',
      badge: 'Roster',
      badgeClass: /border-\[#ffd8ac\]/,
      summary: 'Work 4–5 days, then 4 days off',
    },
    {
      name: 'Reserve Preference',
      badge: 'Roster',
      badgeClass: /border-\[#ffd8ac\]/,
      summary: 'PRAM on Whole Month',
    },
  ]

  const existingRows = page.getByTestId('rule-bid-existing-row')
  await expect(existingRows).toHaveCount(expectedRows.length)

  for (const expected of expectedRows) {
    const row = existingRows.filter({ has: page.getByLabel(`${expected.name} bid summary`) })

    await expect(row).toHaveCount(1)
    await expect(row.getByText(expected.badge, { exact: true })).toHaveClass(expected.badgeClass)
    await expect(row.getByLabel(`${expected.name} bid summary`)).toHaveText(expected.summary)
    await expect(row.getByText(expected.name, { exact: true })).toHaveCount(0)
    await expect(row.getByRole('button', { name: `Edit existing property ${expected.name}` })).toBeVisible()
    await expect(row.getByRole('button', { name: `Delete existing property ${expected.name}` })).toBeVisible()
  }
})

test('PBS-3303 — Reserve Standing Bid uses an independent save context on the unified page', async ({ page }) => {
  const standingApis = await mockStandingBidApis(page)

  await page.goto('standing-bid')

  await expect(page.getByText('EXISTING STANDING BID')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'RESERVE' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'ROSTER' }).click()
  await page.getByRole('button', { name: 'Add Reserve Preference' }).click()
  const dialog = page.getByRole('dialog', { name: 'Configure Standing Bid for Reserve Preference' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Configure bid for Reserve Preference short-call type').locator('option')).toHaveText([
    'CRAM',
    'CRPM',
  ])
  await page.getByRole('button', { name: 'Toggle T1 for Reserve Preference' }).click()
  await page.getByRole('button', { name: 'ADD BID' }).click()

  await expect.poll(() => standingApis.getLastSaveRequest()?.mode).toBe('reserve')
  expect(standingApis.getLastSaveRequest()?.draft).toMatchObject({
    periodCode: 'STANDING',
    bidContext: 'StandingReserve',
    properties: [
      {
        propertyCode: 301,
        name: 'Reserve Preference',
        bid: {
          type: 'reserve-call-type-date-scope',
          callType: 'CRAM',
          dateScope: { mode: 'whole_month' },
        },
        tiers: ['T1'],
      },
    ],
  })
})

test('PBS-3308 — Reserve Standing Bid supports Reserve Preference with relative date scopes only', async ({ page }) => {
  const standingApis = await mockStandingBidApis(page)

  await page.goto('standing-bid')
  const addWorkspace = page.getByTestId('rule-bid-add-properties-workspace')
  await expect(addWorkspace.getByRole('tab', { name: 'RESERVE' })).toHaveCount(0)
  await expect(addWorkspace.getByRole('tab', { name: 'STANDING' })).toHaveCount(0)
  await addWorkspace.getByRole('tab', { name: 'ROSTER' }).click()
  await expect(addWorkspace.getByRole('button', { name: 'Add Reserve Preference' })).toBeVisible()
  await expect(addWorkspace.getByText('Reserve Day of Week Off')).toHaveCount(0)
  await expect(addWorkspace.getByText('Reserve Work Block Size')).toHaveCount(0)
  await expect(addWorkspace.getByText('Waive to Allow Carry over to be Days Off')).toHaveCount(0)
  await page.getByRole('button', { name: 'Add Reserve Preference' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Standing Bid for Reserve Preference' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Configure bid for Reserve Preference short-call type').locator('option')).toHaveText([
    'CRAM',
    'CRPM',
  ])
  await expect(page.getByRole('option', { name: 'Date Range' })).toHaveCount(0)
  await expect(page.getByRole('option', { name: 'Specific Dates' })).toHaveCount(0)
  await page.getByLabel('Configure bid for Reserve Preference date scope').selectOption('second_half')
  await page.getByRole('button', { name: 'Toggle T1 for Reserve Preference' }).click()
  await page.getByRole('button', { name: 'ADD BID' }).click()

  await expect.poll(() => standingApis.getLastSaveRequest()?.mode).toBe('reserve')
  expect(standingApis.getLastSaveRequest()?.draft).toMatchObject({
    bidContext: 'StandingReserve',
    properties: [
      {
        propertyCode: 301,
        name: 'Reserve Preference',
        bid: {
          type: 'reserve-call-type-date-scope',
          callType: 'CRAM',
          dateScope: { mode: 'second_half' },
        },
        tiers: ['T1'],
      },
    ],
  })
})

test('PBS-3310 — unified Existing list keeps Lineholder and Reserve drafts separate', async ({ page }) => {
  const standingApis = await mockStandingBidApis(page)

  await page.goto('standing-bid')
  await page.getByRole('button', { name: 'Add Long Stretch Off / Compressed Flying' }).click()
  await page.getByRole('button', {
    name: 'Toggle T1 for Long Stretch Off / Compressed Flying',
  }).click()
  await page.getByRole('button', { name: 'ADD BID' }).click()
  await expect(page.getByRole('button', {
    name: 'Edit existing property Long Stretch Off / Compressed Flying',
  })).toBeVisible()

  await expect(page.getByRole('tab', { name: 'RESERVE' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'ROSTER' }).click()
  await page.getByRole('button', { name: 'Add Reserve Preference' }).click()
  await page.getByRole('button', { name: 'Toggle T1 for Reserve Preference' }).click()
  await page.getByRole('button', { name: 'ADD BID' }).click()
  await expect(page.getByRole('button', { name: 'Edit existing property Reserve Preference' })).toBeVisible()

  await expect.poll(() => standingApis.getSaveRequests().length).toBe(2)
  const [lineholderSave, reserveSave] = standingApis.getSaveRequests()

  expect(lineholderSave?.mode).toBe('lineholder')
  expect(lineholderSave?.draft.properties.map((property) => property.propertyCode)).toEqual([204])
  expect(reserveSave?.mode).toBe('reserve')
  expect(reserveSave?.draft.properties.map((property) => property.propertyCode)).toEqual([301])
})

test('PBS-3312 — Standing Work Day Preference keeps weekday windows without event dates', async ({ page }) => {
  await mockStandingBidApis(page)
  await page.goto('standing-bid')

  const addWorkspace = page.getByTestId('rule-bid-add-properties-workspace')
  await addWorkspace.getByPlaceholder('Search Standing Properties').fill('Work Day Preference')
  await addWorkspace.getByRole('button', { name: 'Add Work Day Preference' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Standing Bid for Work Day Preference' })
  await expect(dialog.getByRole('switch', {
    name: 'Work Day Preference limit to event date',
  })).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Toggle T1 for Work Day Preference' }).click()
  await dialog.getByRole('button', { name: 'Wed' }).click()
  await dialog.getByRole('button', { name: 'Fri' }).click()
  await expect(dialog.getByLabel('Work Day Preference Wed check-in from')).toBeEnabled()
  await expect(dialog.getByLabel('Work Day Preference Fri check-in from')).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
})

test('PBS-3311 — all database-visible Standing properties use the unified dialog header and no favorite action', async ({ page }) => {
  await mockStandingBidApis(page)
  await page.goto('standing-bid')

  const addWorkspace = page.getByTestId('rule-bid-add-properties-workspace')
  const search = addWorkspace.getByPlaceholder('Search Standing Properties')
  const properties = [
    ...standingLineholderPropertyCatalog,
    ...standingReservePropertyCatalog,
  ]
  const propertiesWithAbsoluteDateScopes = new Set([
    'Airport Preference',
    'Deadhead Flying',
    'Flight Legs per Duty',
    'Flight Number Preference',
    'Pairing Check-In / Check-Out Time',
    'Pairing Length',
    'Redeye Preference',
    'Work Day Preference',
    'Commuter Pattern',
  ])

  expect(properties).toHaveLength(18)

  for (const property of properties) {
    const displayName = property.propertyCode === 427 ? 'Mixed Line Bid' : property.name
    await search.fill(displayName)
    await addWorkspace.getByRole('button', { name: `Add ${displayName}`, exact: true }).click()

    const dialog = page.getByRole('dialog', { name: `Configure Standing Bid for ${displayName}` })
    await expect(dialog, displayName).toBeVisible()
    await expect(dialog.getByText('Configure Standing Bid', { exact: true })).toBeVisible()
    await expect(dialog.getByText(displayName, { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'SAVE FAVORITE' })).toHaveCount(0)
    if (propertiesWithAbsoluteDateScopes.has(displayName)) {
      await expect(dialog.getByText(/^LIMIT TO (AN? )?(EVENT|FLIGHT|PAIRING START|DATE RANGE)/)).toHaveCount(0)
    }
    await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
    await dialog.getByRole('button', { name: /^Close / }).click()
  }
})

const viewportStressExistingProperties: StandingProperty[] = Array.from(
  { length: 8 },
  (_, index) => ({
    propertyGroupKey: `standing-viewport-${index + 1}`,
    rowSeq: index + 1,
    bidType: 'DaysOff',
    propertyCode: 204,
    name: 'Long Stretch Off / Compressed Flying',
    action: 'award',
    bid: {
      type: 'stepper-date-range',
      value: index + 4,
      from: '',
      to: '',
      min: 1,
      max: 14,
    },
    tiers: [`T${(index % 7) + 1}`],
  }),
)

for (const viewport of [
  { width: 2048, height: 1152 },
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
]) {
  test(`PBS-3304 — Standing Bid scales inside ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await mockStandingBidApis(page, {
      lineholderProperties: viewportStressExistingProperties,
    })

    await page.goto('standing-bid')
    await expect(page.getByTestId('standing-bid-page-canvas')).toBeVisible()
    await expect(page.getByTestId('standing-bid-page-layout')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Standing Bid' })).toHaveCount(0)

    const footer = page.getByTestId('rule-bid-add-properties-footer')
    const existingRows = page.getByTestId('rule-bid-existing-rows-scroll')
    const availableRows = page.getByTestId('rule-bid-available-rows-scroll')
    await expect(footer).toBeVisible()

    const footerBox = await footer.boundingBox()
    expect(footerBox).not.toBeNull()
    expect((footerBox?.y ?? 0) + (footerBox?.height ?? 0)).toBeLessThanOrEqual(viewport.height)

    const scrollMetrics = await page.evaluate(() => {
      const existing = document.querySelector<HTMLElement>('[data-testid="rule-bid-existing-rows-scroll"]')
      const available = document.querySelector<HTMLElement>('[data-testid="rule-bid-available-rows-scroll"]')

      return {
        existingClientHeight: existing?.clientHeight ?? 0,
        existingScrollHeight: existing?.scrollHeight ?? 0,
        availableClientHeight: available?.clientHeight ?? 0,
        availableScrollHeight: available?.scrollHeight ?? 0,
      }
    })

    expect(scrollMetrics.existingScrollHeight).toBeGreaterThan(scrollMetrics.existingClientHeight)
    expect(scrollMetrics.availableScrollHeight).toBeGreaterThan(scrollMetrics.availableClientHeight)

    const fixedPositionsBefore = await page.evaluate(() => ({
      categoryTop: document.querySelector('[aria-label="Property categories"]')?.getBoundingClientRect().top,
      searchTop: document.querySelector('[data-testid="rule-bid-search-shell"]')?.getBoundingClientRect().top,
      footerTop: document.querySelector('[data-testid="rule-bid-add-properties-footer"]')?.getBoundingClientRect().top,
    }))
    await existingRows.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await availableRows.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const fixedPositionsAfter = await page.evaluate(() => ({
      categoryTop: document.querySelector('[aria-label="Property categories"]')?.getBoundingClientRect().top,
      searchTop: document.querySelector('[data-testid="rule-bid-search-shell"]')?.getBoundingClientRect().top,
      footerTop: document.querySelector('[data-testid="rule-bid-add-properties-footer"]')?.getBoundingClientRect().top,
    }))

    expect(fixedPositionsAfter).toEqual(fixedPositionsBefore)

    const horizontalOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)

    expect(horizontalOverflow).toBeLessThanOrEqual(1)
  })
}
