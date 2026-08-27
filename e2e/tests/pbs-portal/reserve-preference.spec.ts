import { expect, test, type Page, type Route } from '@playwright/test'

const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

type ReservePreferenceProperty = {
  propertyGroupKey?: string
  rowSeq?: number
  propertyCode: number
  name: string
  bid: {
    type: 'reserve-call-type-date-scope'
    callType: string
    options: string[]
    dateScope:
      | { mode: 'whole_month' }
      | { mode: 'first_half' }
      | { mode: 'second_half' }
      | { mode: 'date_range'; from: string; to: string }
      | { mode: 'specific_dates'; dates: string[] }
  }
  tiers: string[]
}

type AddReservePreferenceRequest = {
  draftKey?: string
  bidId?: number
  periodCode?: string
  bidContext: 'Current'
  draftVersion: number
  property: ReservePreferenceProperty
}

const currentPeriod = {
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
}

const profile = {
  id: 'u-1',
  employeeNo: 'F8030',
  name: 'Casey Crew',
  email: 'casey.crew@example.com',
  base: 'YVR',
  rank: 'FA',
  division: 'C',
  fleet: ['737'],
  languages: ['EN 5'],
  seniorityLabel: '646',
  statusLabel: null,
  existingCreditLabel: '75.5',
  trainingMonthLabel: null,
  lastLoginLabel: null,
}

const biddingCalendar = {
  periodCode: 'Jun 2026',
  bidContext: 'Current',
  currentPeriod,
  activeTierRange: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
  events: [],
  dayOffCapacity: [
    {
      date: '2026-06-03',
      requestedDayOffCount: 23,
      maxDaysOffCount: 33,
      totalCrewCount: 120,
      pairingDemandCount: 69,
      reserveDemandCount: 8,
      preAssignedDayOffCount: 10,
    },
  ],
}

const lineholderSummary = {
  draftVersion: 0,
  periodCode: 'Jun 2026',
  bidContext: 'Current',
  statistics: [],
  summaryItems: [],
  warnings: [],
  diagnostics: [],
}

const draftBase = {
  draftKey: 'current-empty',
  bidId: 41,
  periodId: currentPeriod.id,
  draftVersion: 0,
  periodCode: currentPeriod.periodCode,
  bidContext: 'Current',
  remarks: '',
  properties: [],
}

const daysOffCurrent = {
  currentPeriod,
  preferOffConfig: {
    weekdays: [],
    weekend: null,
  },
  draft: { ...draftBase, draftKey: 'days-off-draft', bidId: 40 },
  propertyCatalog: [],
  favoriteProperties: [],
  recommendedPropertyCodes: [],
}

const pairingCurrent = {
  currentPeriod,
  draft: { ...draftBase, draftKey: 'pairing-draft', bidId: 41 },
  propertyCatalog: [],
  favoriteProperties: [],
  recommendedPropertyCodes: [],
}

const lineCurrent = {
  currentPeriod,
  draft: { ...draftBase, draftKey: 'line-draft', bidId: 43 },
  propertyCatalog: [],
  favoriteProperties: [],
  recommendedPropertyCodes: [],
}

const reservePreferenceCatalogProperty = {
  propertyCode: 301,
  name: 'Reserve Preference',
  defaultBid: {
    type: 'reserve-call-type-date-scope',
    callType: 'CRAM',
    options: ['CRAM', 'CRPM'],
    dateScope: { mode: 'whole_month' },
  },
}

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const installReservePreferenceApis = async (page: Page) => {
  const state: {
    draftVersion: number
    properties: ReservePreferenceProperty[]
    lastAddRequest: AddReservePreferenceRequest | null
    lastPatchRequest: AddReservePreferenceRequest | null
  } = {
    draftVersion: 0,
    properties: [],
    lastAddRequest: null,
    lastPatchRequest: null,
  }

  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, 'reserve-preference-e2e-token')
  }, AUTH_TOKEN_KEY)

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())

    if (pathname.endsWith('/auth/session')) {
      await fulfillJson(route, {
        user: { id: profile.id, name: profile.name, employeeNo: profile.employeeNo },
        authMode: 'password',
      })
      return
    }

    if (pathname.endsWith('/portal/bootstrap')) {
      await fulfillJson(route, { profile, biddingCalendar, lineholderSummary })
      return
    }

    if (pathname.endsWith('/dashboard/profile')) {
      await fulfillJson(route, profile)
      return
    }

    if (pathname.endsWith('/bidding-calendar/current')) {
      await fulfillJson(route, biddingCalendar)
      return
    }

    if (pathname.endsWith('/lineholder-bids/current/summary')) {
      await fulfillJson(route, lineholderSummary)
      return
    }

    if (pathname.endsWith('/days-off-bids/current') && request.method() === 'GET') {
      await fulfillJson(route, daysOffCurrent)
      return
    }

    if (pathname.endsWith('/pairing-bids/current') && request.method() === 'GET') {
      await fulfillJson(route, pairingCurrent)
      return
    }

    if (pathname.endsWith('/line-bids/current') && request.method() === 'GET') {
      await fulfillJson(route, lineCurrent)
      return
    }

    if (pathname.endsWith('/bid-feedback/current/conflicts')) {
      await fulfillJson(route, {
        draftVersion: '0:0:0:0',
        generatedAt: '2026-05-01T00:00:00.000Z',
        conflictCount: 0,
        advisoryCount: 0,
        conflicts: [],
      })
      return
    }

    if (pathname.endsWith('/reserve-bids/current/coverage')) {
      await fulfillJson(route, {
        periodCode: currentPeriod.periodCode,
        days: [
          {
            date: '2026-06-03',
            requiredReserveCount: 12,
            availableOffCount: 33,
          },
        ],
      })
      return
    }

    if (pathname.endsWith('/pairing-search/current-rules/counts') && request.method() === 'POST') {
      await fulfillJson(route, {
        mode: 'current_rules_counts',
        periodCode: currentPeriod.periodCode,
        tier: 'T1',
        computedAt: '2026-05-01T00:00:00.000Z',
        summary: {
          activePropertyCount: 0,
          allRules: null,
        },
        rows: [],
      })
      return
    }

    if (pathname.endsWith('/reserve-bids/current') && request.method() === 'GET') {
      await fulfillJson(route, {
        currentPeriod,
        draft: {
          draftKey: '42',
          bidId: 42,
          periodId: currentPeriod.id,
          draftVersion: state.draftVersion,
          periodCode: currentPeriod.periodCode,
          bidContext: 'Current',
          mode: 'legacy',
          remarks: '',
          properties: state.properties.map((property, index) => ({
            ...property,
            rowSeq: index + 1,
          })),
        },
        propertyCatalog: [reservePreferenceCatalogProperty],
      })
      return
    }

    if (pathname.endsWith('/reserve-bids/current/properties') && request.method() === 'POST') {
      const payload = request.postDataJSON() as AddReservePreferenceRequest
      const propertyGroupKey = `reserve-preference-${state.properties.length + 1}`
      state.lastAddRequest = payload
      state.properties.push({
        ...payload.property,
        propertyGroupKey,
        rowSeq: state.properties.length + 1,
      })
      state.draftVersion += 1
      await fulfillJson(route, {
        saved: true,
        draftKey: '42',
        bidId: 42,
        periodId: currentPeriod.id,
        periodCode: currentPeriod.periodCode,
        draftVersion: state.draftVersion,
        propertyGroupKey,
        rowSeq: state.properties.length,
      })
      return
    }

    if (pathname.includes('/reserve-bids/current/properties/') && request.method() === 'PATCH') {
      const payload = request.postDataJSON() as AddReservePreferenceRequest
      const propertyGroupKey = decodeURIComponent(pathname.split('/').at(-1) ?? '')
      state.lastPatchRequest = payload
      state.properties = state.properties.map((property) => property.propertyGroupKey === propertyGroupKey
        ? { ...payload.property, propertyGroupKey, rowSeq: property.rowSeq }
        : property)
      state.draftVersion += 1
      await fulfillJson(route, {
        saved: true,
        draftKey: '42',
        bidId: 42,
        periodId: currentPeriod.id,
        periodCode: currentPeriod.periodCode,
        draftVersion: state.draftVersion,
        propertyGroupKey,
        tiers: payload.property.tiers,
      })
      return
    }

    await fulfillJson(route, {})
  })

  return {
    getLastAddRequest: () => state.lastAddRequest,
    getLastPatchRequest: () => state.lastPatchRequest,
  }
}

test.use({
  storageState: { cookies: [], origins: [] },
})

test('PBS-3901 — Reserve Preference is available from Current Bid ROSTER and still saves to the reserve draft', async ({ page }) => {
  const apis = await installReservePreferenceApis(page)

  await page.goto('bid')

  await expect(page.getByRole('link', { name: 'Reserve' })).toHaveCount(0)
  const daysOffBadge = page.getByText('DO 23/33')
  const reserveBadge = page.getByText('RES 12/33')

  await expect(daysOffBadge).toBeVisible()
  await expect(reserveBadge).toBeVisible()
  const daysOffBox = await daysOffBadge.boundingBox()
  const reserveBox = await reserveBadge.boundingBox()

  expect(daysOffBox).not.toBeNull()
  expect(reserveBox).not.toBeNull()
  expect(reserveBox!.y).toBeGreaterThan(daysOffBox!.y)
  expect(Math.abs(reserveBox!.x - daysOffBox!.x)).toBeLessThan(4)
  const metricBadgeGroup = page.getByTestId('schedule-calendar-metric-badge-group').filter({ hasText: 'DO 23/33' })

  await expect(metricBadgeGroup).toHaveAttribute('data-metric-badge-count', '2')
  const metricBadgeBox = await metricBadgeGroup.boundingBox()
  const metricBadgeCell = page.locator('article').filter({ has: metricBadgeGroup }).first()
  const metricBadgeZoom = metricBadgeCell.getByTestId('schedule-calendar-metric-badge-zoom')
  const zoomRows = metricBadgeZoom.getByTestId('schedule-calendar-metric-badge-zoom-row')

  expect(metricBadgeBox).not.toBeNull()
  await expect(metricBadgeZoom).toBeHidden()
  await expect(zoomRows.nth(0)).toHaveAttribute('data-metric-label', 'DO 23/33')
  await expect(zoomRows.nth(1)).toHaveAttribute('data-metric-label', 'RES 12/33')
  await metricBadgeCell.hover()
  await expect(metricBadgeZoom).toBeVisible()
  await expect(zoomRows.nth(0)).toHaveCSS('font-weight', '400')
  await expect(zoomRows.nth(1)).toHaveCSS('font-weight', '400')
  const enlargedMetricBadgeBox = await metricBadgeZoom.boundingBox()

  expect(enlargedMetricBadgeBox).not.toBeNull()
  expect(enlargedMetricBadgeBox!.width).toBeGreaterThan(metricBadgeBox!.width * 1.3)
  expect(enlargedMetricBadgeBox!.height).toBeGreaterThan(metricBadgeBox!.height * 1.3)
  expect(enlargedMetricBadgeBox!.y).toBeLessThan(metricBadgeBox!.y)

  await page.getByRole('tab', { name: 'ROSTER' }).click()
  await expect(page.getByRole('tab', { name: 'ROSTER' })).toHaveAttribute('aria-selected', 'true')
  await expect(reserveBadge).toBeVisible()
  await expect(daysOffBadge).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Reserve Preference' })).toBeVisible()

  await page.getByRole('button', { name: 'Add Reserve Preference' }).click()
  const addDialog = page.getByRole('dialog', { name: 'Configure Reserve Preference' })
  await expect(addDialog).toBeVisible()
  await expect(page.getByText('APPLY TO TIERS · REQUIRED', { exact: true })).toBeVisible()
  await expect(addDialog.getByRole('button', { name: 'Toggle T1 for Reserve Preference' })).toHaveAttribute('aria-pressed', 'false')
  await expect(addDialog.getByLabel('Reserve Preference short-call type').locator('option')).toHaveText([
    'CRAM',
    'CRPM',
  ])
  await addDialog.getByLabel('Reserve Preference short-call type').selectOption('CRPM')
  await addDialog.getByLabel('Reserve Preference date scope').selectOption('first_half')
  await addDialog.getByRole('button', { name: 'Toggle T1 for Reserve Preference' }).click()
  await expect(page.getByText('APPLY TO TIERS · REQUIRED', { exact: true })).toBeVisible()
  await addDialog.getByRole('button', { name: 'ADD BID', exact: true }).click()

  await expect.poll(() => apis.getLastAddRequest()?.property).toMatchObject({
    propertyCode: 301,
    name: 'Reserve Preference',
    bid: {
      type: 'reserve-call-type-date-scope',
      callType: 'CRPM',
      dateScope: { mode: 'first_half' },
    },
    tiers: ['T1'],
  })
  await expect(page.getByLabel('Reserve Preference bid summary')).toContainText('CRPM')
  await expect(page.getByLabel('Reserve Preference bid summary')).toContainText(/first half/i)

  await page.getByRole('button', { name: /Open detail for Award CRPM short call/i }).click()
  const editDialog = page.getByRole('dialog', { name: 'Configure Reserve Preference' })
  await expect(editDialog).toBeVisible()
  await editDialog.getByRole('combobox', { name: 'Reserve Preference date scope' }).selectOption('date_range')
  await expect(editDialog.getByRole('button', { name: 'Open date picker for Reserve Preference date range' })).toHaveCount(1)
  await editDialog.getByRole('button', { name: 'Open date picker for Reserve Preference date range' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-03' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-15' }).click()
  await editDialog.getByRole('button', { name: 'UPDATE BID', exact: true }).click()

  await expect.poll(() => apis.getLastPatchRequest()?.property.bid).toMatchObject({
    type: 'reserve-call-type-date-scope',
    callType: 'CRPM',
    dateScope: { mode: 'date_range', from: '2026-06-03', to: '2026-06-15' },
  })
})
