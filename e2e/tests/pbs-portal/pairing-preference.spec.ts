import { expect, test, type Page, type Route } from '@playwright/test'
import { BidWorkbenchPage } from '../../pages/pbs-portal/bid-workbench-page'

const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

type PairingPreferenceBid = {
  type: 'pairing-preference'
  pairingIds: string[]
  pairingLabels?: string[]
}

type PairingPreferencePayload = {
  property: {
    propertyCode: 102
    name: string
    action?: 'award' | 'avoid' | null
    quantifier?: null
    bid: PairingPreferenceBid
    tiers: string[]
  }
}

type StoredPairingPreference = PairingPreferencePayload['property'] & {
  propertyGroupKey: string
  rowSeq: number
}

const currentPeriod = {
  id: 38,
  rosterPeriodId: 38,
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
  events: [
    {
      id: 'day-off-t1-2026-06-06',
      type: 'prefer_off_bid',
      tier: 'T1',
      label: 'Off',
      startDate: '2026-06-06',
      endDate: '2026-06-06',
      tone: 'green',
      source: 'pbs_bid_group',
      readonly: false,
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

const pairingPreferenceCatalogProperty = {
  propertyCode: 102,
  name: 'Pairing Preference',
  defaultBid: {
    type: 'pairing-preference',
    pairingIds: [],
    pairingLabels: [],
  },
  supportedActions: ['award', 'avoid'],
}

const pairingOptions = [
  {
    value: 'PR141',
    label: 'PR141 · YVR-YYC',
    pairingId: '496001',
    pairingLabel: 'PR141',
  },
  {
    value: 'PR142',
    label: 'PR142 · YYC-YVR',
    pairingId: '496002',
    pairingLabel: 'PR142',
  },
]

const buildPairingResult = (pairingId: string, pairingNumber: string, originDate: string) => ({
  id: pairingId,
  pairingId,
  pairingNumber,
  base: 'YVR',
  originDate,
  endDate: originDate,
  endDateLabel: originDate,
  compositionLabel: 'FA',
  reportTime: '0430',
  releaseTime: '1545',
  durationDays: 2,
  routeLabel: pairingNumber === 'PR141' ? 'YVR-YYC-YVR' : 'YVR-YYZ-YVR',
  priorityLabel: 'P3',
  prioritySequence: '02',
  totalBlock: '4:00',
  totalCredit: '5:30',
  totalPay: '5:30',
  activeDates: [originDate],
  legs: [],
})

const pairingResults = [
  buildPairingResult('496001', 'PR141', '2026-06-15'),
  buildPairingResult('496002', 'PR142', '2026-06-20'),
]

const occurrencesByPairingId = new Map([
  ['496001', [
    {
      occurrenceId: '496001:2026-06-15',
      pairingId: '496001',
      pairingNumber: 'PR141',
      originDate: '2026-06-15',
      startDate: '2026-06-15',
      endDate: '2026-06-15',
      label: 'PR141 · 2026-06-15',
    },
    {
      occurrenceId: '496001:2026-06-18',
      pairingId: '496001',
      pairingNumber: 'PR141',
      originDate: '2026-06-18',
      startDate: '2026-06-18',
      endDate: '2026-06-18',
      label: 'PR141 · 2026-06-18',
    },
  ]],
  ['496002', [
    {
      occurrenceId: '496002:2026-06-20',
      pairingId: '496002',
      pairingNumber: 'PR142',
      originDate: '2026-06-20',
      startDate: '2026-06-20',
      endDate: '2026-06-20',
      label: 'PR142 · 2026-06-20',
    },
  ]],
])

const buildCalendarOccurrences = (originDate: string) => Array.from({ length: 12 }, (_, index) => ({
  occurrenceId: `${index === 0 ? '496002' : 497000 + index}:${originDate}`,
  pairingId: index === 0 ? '496002' : `${497000 + index}`,
  pairingNumber: index === 0 ? 'PR142' : `F${8623 + index}`,
  originDate,
  startDate: originDate,
  endDate: originDate,
  label: `${index === 0 ? 'PR142' : `F${8623 + index}`} · ${originDate}`,
}))

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const installPairingPreferenceApi = async (
  page: Page,
  options: {
    previewDelayMs?: number
    previewPageSize?: number
    previewResults?: ReturnType<typeof buildPairingResult>[]
  } = {},
) => {
  const previewResults = options.previewResults ?? pairingResults
  const previewPageSize = options.previewPageSize ?? 1
  const state: {
    draftVersion: number
    properties: StoredPairingPreference[]
    addPayloads: PairingPreferencePayload[]
    previewRequests: Array<Record<string, unknown>>
    failNextAdd: boolean
  } = {
    draftVersion: 0,
    properties: [],
    addPayloads: [],
    previewRequests: [],
    failNextAdd: false,
  }
  const buildCurrentBiddingCalendar = () => {
    const pairingEvents = state.properties.flatMap((property) => {
      const pairingId = property.bid.pairingIds[0]
      const pairing = pairingResults.find((result) => result.pairingId === pairingId)

      if (!pairing || !pairingId) {
        return []
      }

      return [{
        id: `pairing-bid-${property.propertyGroupKey}-${pairingId}`,
        type: 'pairing_bid',
        tier: property.tiers[0] ?? 'T1',
        label: pairing.pairingNumber,
        startDate: pairing.originDate,
        endDate: pairing.endDate,
        tone: 'blue',
        source: 'pbs_bid_group',
        readonly: true,
        metadata: {
          propertyGroupKey: property.propertyGroupKey,
          pairingId,
          pairingNumber: pairing.pairingNumber,
          originDate: pairing.originDate,
          actionId: 1,
        },
      }]
    })

    return {
      ...biddingCalendar,
      events: [...biddingCalendar.events, ...pairingEvents],
    }
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const { pathname, searchParams } = url

    if (pathname.endsWith('/auth/session')) {
      await fulfillJson(route, {
        user: { id: profile.id, name: profile.name, employeeNo: profile.employeeNo },
        authMode: 'password',
      })
      return
    }

    if (pathname.endsWith('/portal/bootstrap')) {
      await fulfillJson(route, { profile, biddingCalendar: buildCurrentBiddingCalendar(), lineholderSummary })
      return
    }

    if (pathname.endsWith('/dashboard/profile')) {
      await fulfillJson(route, profile)
      return
    }

    if (pathname.endsWith('/bidding-calendar/current')) {
      await fulfillJson(route, buildCurrentBiddingCalendar())
      return
    }

    if (pathname.endsWith('/lineholder-bids/current/summary')) {
      await fulfillJson(route, lineholderSummary)
      return
    }

    if (pathname.endsWith('/days-off-bids/current') && request.method() === 'GET') {
      await fulfillJson(route, {
        currentPeriod,
        preferOffConfig: {
          weekdays: [],
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
        draft: {
          draftKey: 'days-off-42',
          bidId: 42,
          periodId: currentPeriod.id,
          draftVersion: 0,
          periodCode: currentPeriod.periodCode,
          bidContext: 'Current',
          remarks: '',
          properties: [],
        },
        propertyCatalog: [],
        favoriteProperties: [],
        recommendedPropertyCodes: [],
      })
      return
    }

    if (pathname.endsWith('/line-bids/current') && request.method() === 'GET') {
      await fulfillJson(route, {
        currentPeriod,
        draft: {
          draftKey: 'line-42',
          bidId: 42,
          periodId: currentPeriod.id,
          draftVersion: 0,
          periodCode: currentPeriod.periodCode,
          bidContext: 'Current',
          remarks: '',
          properties: [],
        },
        propertyCatalog: [],
        favoriteProperties: [],
        recommendedPropertyCodes: [],
      })
      return
    }

    if (pathname.endsWith('/pairing-search/pairing-ids')) {
      const query = (searchParams.get('query') ?? '').trim().toUpperCase()
      await fulfillJson(route, {
        options: pairingOptions.filter((option) => option.value.includes(query)),
      })
      return
    }

    if (pathname.endsWith('/pairing-search/pairing-occurrences')) {
      const pairingId = searchParams.get('pairingId') ?? ''
      await fulfillJson(route, {
        pairingId,
        periodCode: searchParams.get('periodCode') ?? 'Jun 2026',
        occurrences: occurrencesByPairingId.get(pairingId) ?? [],
      })
      return
    }

    if (pathname.endsWith('/pairing-search/pairing-occurrences/by-date')) {
      const originDate = searchParams.get('originDate') ?? '2026-06-06'
      await fulfillJson(route, {
        originDate,
        periodCode: searchParams.get('periodCode') ?? 'Jun 2026',
        occurrences: buildCalendarOccurrences(originDate),
      })
      return
    }

    if (pathname.endsWith('/pairing-search/airport-options')) {
      await fulfillJson(route, {
        airportPreferenceLayoverHours: {
          minHours: 0,
          maxHours: 48,
          stepHours: 1,
          defaultHours: 4,
        },
        airportPreferenceOptions: [],
        filterAirports: ['CUN', 'EWR', 'FLL', 'GDL', 'GUA', 'KIN', 'MEX', 'YEG', 'YKF', 'YUL', 'YVR', 'YYC', 'YHZ', 'YYZ'],
        landingAirports: ['YVR', 'YYZ', 'YYC', 'YHZ'],
        layoverAirports: ['CUN', 'EWR', 'FLL', 'GDL', 'GUA', 'KIN', 'MEX', 'YEG', 'YKF', 'YUL', 'YYC', 'YHZ'],
        workStartStations: ['YVR', 'YYZ'],
      })
      return
    }

    if (pathname.endsWith('/pairing-search/pairing-details') && request.method() === 'POST') {
      const payload = request.postDataJSON() as { targets: Array<{ pairingId: string }> }
      await fulfillJson(route, {
        results: payload.targets
          .map((target) => pairingResults.find((result) => result.pairingId === target.pairingId))
          .filter(Boolean),
      })
      return
    }

    if (pathname.endsWith('/pairing-search/preview') && request.method() === 'POST') {
      const payload = request.postDataJSON() as {
        preview?: { mode?: string; page?: number; filters?: Record<string, unknown> }
      }
      state.previewRequests.push(payload.preview ?? {})
      const pageNumber = payload.preview?.page ?? 1
      const query = String(payload.preview?.filters?.query ?? '').trim().toUpperCase()
      const filteredPreviewResults = previewResults.filter((result) =>
        !query || result.pairingNumber.toUpperCase().includes(query))
      const results = payload.preview?.filters?.pairingScope === 'fly'
        ? filteredPreviewResults.slice((pageNumber - 1) * previewPageSize, pageNumber * previewPageSize)
        : [buildPairingResult('599001', 'CRAM', '2026-06-15')]
      const totalItems = payload.preview?.filters?.pairingScope === 'fly'
        ? filteredPreviewResults.length
        : 1

      if (payload.preview?.filters?.pairingScope === 'fly' && options.previewDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.previewDelayMs))
      }

      await fulfillJson(route, {
        mode: 'all_pairings_preview',
        summary: { pairingIdCount: totalItems, totalItems },
        pagination: {
          page: pageNumber,
          pageSize: previewPageSize,
          totalItems,
          totalPages: Math.max(1, Math.ceil(totalItems / previewPageSize)),
        },
        results,
      })
      return
    }

    if (pathname.endsWith('/pairing-search/current-rules/counts')) {
      await fulfillJson(route, {
        mode: 'current_rules_counts',
        periodCode: 'Jun 2026',
        tier: 'T1',
        computedAt: '2026-06-01T00:00:00.000Z',
        summary: {
          activePropertyCount: 0,
          allRules: null,
        },
        rows: [],
      })
      return
    }

    if (pathname.endsWith('/pairing-search/current-rules/tier-pools')) {
      await fulfillJson(route, {
        mode: 'current_rules_tier_pools',
        periodCode: 'Jun 2026',
        computedAt: '2026-06-01T00:00:00.000Z',
        packageTotal: {
          pairingIdCount: 0,
          totalItems: 0,
        },
        rows: [],
      })
      return
    }

    if (pathname.endsWith('/pairing-bids/current/properties') && request.method() === 'POST') {
      if (state.failNextAdd) {
        state.failNextAdd = false
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Unable to add pairing bid.' }),
        })
        return
      }

      const payload = request.postDataJSON() as PairingPreferencePayload
      const propertyGroupKey = `pairing-preference-${state.properties.length + 1}`

      state.addPayloads.push(payload)
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
        tiers: payload.property.tiers,
      })
      return
    }

    if (pathname.endsWith('/pairing-bids/current') && request.method() === 'GET') {
      await fulfillJson(route, {
        currentPeriod,
        draft: {
          draftKey: '42',
          bidId: 42,
          periodId: currentPeriod.id,
          draftVersion: state.draftVersion,
          periodCode: currentPeriod.periodCode,
          bidContext: 'Current',
          remarks: '',
          properties: state.properties.map((property) => ({
            propertyGroupKey: property.propertyGroupKey,
            rowSeq: property.rowSeq,
            propertyCode: property.propertyCode,
            name: property.name,
            action: property.action ?? null,
            quantifier: property.quantifier ?? null,
            bid: property.bid,
            tiers: property.tiers,
          })),
        },
        propertyCatalog: [pairingPreferenceCatalogProperty],
        favoriteProperties: [],
        recommendedPropertyCodes: [102],
      })
      return
    }

    await fulfillJson(route, {})
  })

  return state
}

const openPairingPreferenceDialog = async (page: Page) => {
  await page.getByRole('tab', { name: 'PAIRING' }).click()
  const workspace = page.getByTestId('pairing-add-properties-workspace')
  await expect(workspace).toBeVisible({ timeout: 60_000 })
  await expect(workspace.getByRole('button', { name: 'Add Pairing Preference' })).toBeVisible()
  await workspace.getByRole('button', { name: 'Add Pairing Preference' }).click()
  const dialog = page.getByRole('dialog', { name: 'Configure Pairing Preference' })
  await expect(dialog).toBeVisible()
  return dialog
}

const selectPairing = async (dialog: ReturnType<Page['getByRole']>, pairingNumber: string) => {
  await dialog.getByRole('checkbox', { name: `Select pairing ${pairingNumber}` }).click()
  await expect(dialog.getByRole('button', { name: `Remove pairing ${pairingNumber}` })).toBeVisible()
}

test.use({ storageState: { cookies: [], origins: [] } })

test('PBS-3520 — Pairing Preference submits selected stable IDs without modifiers', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  const state = await installPairingPreferenceApi(page)

  await page.goto('bid')
  const dialog = await openPairingPreferenceDialog(page)

  await expect(dialog).toHaveCSS('width', '1120px')
  await expect(dialog.getByRole('button', { name: 'Award' })).toHaveCSS('cursor', 'pointer')
  await expect(dialog.getByText('Select at least one pairing number.')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Toggle T1 for Pairing Preference' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(dialog.getByRole('button', { name: 'Award' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('switch', { name: 'Pairing Preference limit to run date' })).toHaveCount(0)
  await expect(dialog.getByText('FULFILMENT')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Toggle T1 for Pairing Preference' }).click()
  await selectPairing(dialog, 'PR141')
  await expect(dialog.getByRole('switch', { name: 'Pairing Preference limit to run date' })).toHaveCount(0)
  await expect(dialog.getByText('Minimum required')).toHaveCount(0)
  await expect(dialog.getByText('Maximum required')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/pairing-bids/current/properties')
      && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'ADD BID' }).click(),
  ])

  expect(state.addPayloads).toHaveLength(1)
  expect(state.addPayloads[0].property).toMatchObject({
    propertyCode: 102,
    name: 'Pairing Preference',
    action: 'award',
    bid: {
      type: 'pairing-preference',
      pairingIds: ['496001'],
      pairingLabels: ['PR141'],
    },
    tiers: ['T1'],
  })
  await expect(page.getByRole('button', { name: 'View pairing bid PR141' })).toBeVisible()
})

test('PBS-3521 — Pairing Preference never renders run-date or fulfilment controls', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await installPairingPreferenceApi(page)

  await page.goto('pairing')
  const dialog = await openPairingPreferenceDialog(page)
  await dialog.getByRole('button', { name: 'Toggle T1 for Pairing Preference' }).click()
  await selectPairing(dialog, 'PR141')

  await expect(dialog.getByRole('switch', { name: 'Pairing Preference limit to run date' })).toHaveCount(0)
  await expect(dialog.getByText('LIMIT TO RUN DATE')).toHaveCount(0)
  await expect(dialog.getByText('FULFILMENT')).toHaveCount(0)
  await expect(dialog.getByRole('spinbutton', { name: 'Pairing Preference minimum required' })).toHaveCount(0)
  await expect(dialog.getByRole('spinbutton', { name: 'Pairing Preference maximum required' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
})

test('PBS-3530 — Pairing Preference keeps selection across filters and server pages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  const state = await installPairingPreferenceApi(page)

  await page.goto('pairing')
  const dialog = await openPairingPreferenceDialog(page)
  await expect.poll(() => state.previewRequests.at(-1)?.filters).toEqual({
    pairingScope: 'fly',
  })
  await expect(dialog.getByText('CRAM', { exact: true })).toHaveCount(0)
  await selectPairing(dialog, 'PR141')
  await dialog.getByRole('button', { name: 'Filters' }).click()
  const filtersDialog = page.getByRole('dialog', { name: 'Pairing Filters' })
  await expect(filtersDialog).toBeVisible()
  const filterDateRange = filtersDialog.locator('[data-density="filter"]')
  await expect(filterDateRange).toHaveCount(1)
  expect(await filterDateRange.evaluate((element) => window.getComputedStyle(element).height)).toBe('32px')
  await expect(filtersDialog.getByRole('group', { name: 'Route station' })).toBeVisible()
  await expect(filtersDialog.getByRole('group', { name: 'Layover station' })).toBeVisible()
  await expect(filtersDialog.getByText('Pairing start dates')).toBeVisible()
  await expect(filtersDialog.getByText('Basic', { exact: true })).toHaveCount(0)
  await expect(filtersDialog.getByText('Stations', { exact: true })).toHaveCount(0)
  await expect(filtersDialog.getByLabel('Credit minimum')).toHaveAttribute('placeholder', 'HH:MM')
  await expect(filtersDialog.getByText('Length (days)')).toBeVisible()
  await expect(filtersDialog.getByText('Credit (HH:MM)')).toBeVisible()
  await expect(filtersDialog.getByText('DAYS', { exact: true })).toHaveCount(0)
  await expect(filtersDialog.getByText('COUNT', { exact: true })).toHaveCount(0)
  const inputHeights = await filtersDialog.locator('input').evaluateAll((inputs) =>
    inputs.map((input) => Math.round(input.getBoundingClientRect().height)),
  )
  expect(new Set(inputHeights).size).toBe(1)
  const controlMetrics = await filtersDialog.locator([
    '[data-density="filter"]',
    '[data-testid="pairing-filter-route-station-field"] > button',
    '[data-testid="pairing-filter-layover-station-field"] > button',
    'input',
  ].join(', ')).evaluateAll((controls) =>
    controls.map((control) => ({
      layoutHeight: control.offsetHeight,
      visualHeight: Math.round(control.getBoundingClientRect().height),
    })),
  )
  expect(new Set(controlMetrics.map((metric) => metric.layoutHeight))).toEqual(new Set([32]))
  expect(new Set(controlMetrics.map((metric) => metric.visualHeight)).size).toBe(1)
  const controlRadii = await filtersDialog.locator([
    '[data-density="filter"]',
    '[data-testid="pairing-filter-route-station-field"] > button',
    '[data-testid="pairing-filter-layover-station-field"] > button',
    'input',
  ].join(', ')).evaluateAll((controls) =>
    controls.map((control) => window.getComputedStyle(control).borderRadius),
  )
  expect(new Set(controlRadii).size).toBe(1)
  const inputStyles = await filtersDialog.locator('input').evaluateAll((inputs) =>
    inputs.map((input) => {
      const style = window.getComputedStyle(input)
      return {
        fontSize: style.fontSize,
      }
    }),
  )
  expect(inputStyles.every((style) => style.fontSize === '12px')).toBe(true)
  await expect(filtersDialog.getByLabel('Check-in time from')).toHaveAttribute('type', 'time')
  await expect(filtersDialog.getByLabel('Check-out time to')).toHaveAttribute('type', 'time')
  await expect(filtersDialog.locator('input[type="date"]')).toHaveCount(0)
  await filtersDialog.getByRole('button', { name: 'Open Pairing Preference date range calendar' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-10' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-25' }).click()
  await expect(filtersDialog.getByRole('group', { name: 'Dates' })).toContainText('2026-06-10')
  await expect(filtersDialog.getByRole('group', { name: 'Dates' })).toContainText('2026-06-25')
  const dateValueLayout = await filterDateRange.locator('span').evaluateAll((spans) =>
    spans
      .filter((span) => /^2026-06-/.test(span.textContent ?? ''))
      .map((span) => ({
        fitsOnOneLine: span.scrollHeight <= span.clientHeight,
        whiteSpace: window.getComputedStyle(span).whiteSpace,
      })),
  )
  expect(dateValueLayout).toEqual([
    { fitsOnOneLine: true, whiteSpace: 'nowrap' },
    { fitsOnOneLine: true, whiteSpace: 'nowrap' },
  ])
  await filtersDialog.getByLabel('Pairing length minimum').fill('2')
  await filtersDialog.getByLabel('Pairing length maximum').fill('4')
  await filtersDialog.getByRole('button', { name: /Select route stations/i }).click()
  await page.getByRole('option', { name: 'YYZ' }).click()
  await filtersDialog.getByRole('button', { name: /Select layover stations/i }).click()
  await page.getByRole('option', { name: 'YHZ' }).click()
  await filtersDialog.getByLabel('Layover count minimum').fill('1')
  await filtersDialog.getByLabel('Layover count maximum').fill('2')
  await filtersDialog.getByLabel('Credit minimum').fill('04:30')
  await filtersDialog.getByLabel('Credit maximum').fill('12:15')
  await filtersDialog.getByRole('button', { name: 'Redeye' }).click()
  await filtersDialog.getByRole('button', { name: 'DHD' }).click()
  await filtersDialog.getByRole('button', { name: 'Apply Filters' }).click()
  await expect(filtersDialog).toHaveCount(0)

  await expect.poll(() => state.previewRequests.at(-1)?.filters).toEqual({
    pairingScope: 'fly',
    originDateFrom: '2026-06-10',
    originDateTo: '2026-06-25',
    durationDaysMin: 2,
    durationDaysMax: 4,
    airports: ['YYZ'],
    layoverAirports: ['YHZ'],
    layoverCountMin: 1,
    layoverCountMax: 2,
    creditMinutesMin: 270,
    creditMinutesMax: 735,
    hasRedeye: true,
    hasDeadhead: true,
  })
  await expect(dialog.getByRole('button', { name: 'Remove pairing PR141' })).toBeVisible()

  await dialog.getByRole('button', { name: /Filters/ }).click()
  const clearDialog = page.getByRole('dialog', { name: 'Pairing Filters' })
  await expect(clearDialog).toBeVisible()
  const callsBeforeClear = state.previewRequests.length
  await clearDialog.getByRole('button', { name: 'Clear All' }).click()
  expect(state.previewRequests).toHaveLength(callsBeforeClear)
  await clearDialog.getByRole('button', { name: 'Apply Filters' }).click()
  await expect(clearDialog).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Filters' })).toBeVisible()

  await dialog.getByRole('button', { name: 'Next pairing page' }).click()
  await expect.poll(() => state.previewRequests.at(-1)).toMatchObject({
    page: 2,
    filters: { pairingScope: 'fly' },
  })
  await selectPairing(dialog, 'PR142')
  await expect(dialog.getByText('2 selected')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Remove pairing PR141' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Remove pairing PR142' })).toBeVisible()

  await page.setViewportSize({ width: 816, height: 1256 })
  await dialog.getByRole('button', { name: 'Filters' }).click()
  const narrowFiltersDialog = page.getByRole('dialog', { name: 'Pairing Filters' })
  await expect(narrowFiltersDialog).toBeVisible()
  const narrowLayout = await narrowFiltersDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const body = element.querySelector('[data-testid="pairing-filter-dialog-body"]') as HTMLElement | null
    const portalRoot = element.closest('[data-testid="scaled-page-dialog-portal-root"]')

    return {
      bodyHasHorizontalOverflow: body ? body.scrollWidth > body.clientWidth : true,
      dialogFitsViewport: rect.left >= 0 && rect.right <= window.innerWidth,
      dialogWidth: rect.width,
      portalRootContainsDialog: Boolean(portalRoot),
      visualScale: element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1,
      viewportWidth: window.innerWidth,
    }
  })
  expect(narrowLayout).toMatchObject({
    bodyHasHorizontalOverflow: false,
    dialogFitsViewport: true,
    portalRootContainsDialog: true,
  })
  expect(narrowLayout.dialogWidth).toBeLessThanOrEqual(narrowLayout.viewportWidth - 32)
  expect(narrowLayout.visualScale).toBeLessThan(1)
  await expect(narrowFiltersDialog.getByRole('button', { name: 'Clear All' })).toBeVisible()
  await expect(narrowFiltersDialog.getByRole('button', { name: 'Apply Filters' })).toBeVisible()
  await expect(narrowFiltersDialog.locator('input[type="date"]')).toHaveCount(0)
  await expect(narrowFiltersDialog.getByRole('group', { name: 'Route station' })).toBeVisible()
  await expect(narrowFiltersDialog.getByRole('group', { name: 'Layover station' })).toBeVisible()
  await expect(narrowFiltersDialog.getByText('Basic', { exact: true })).toHaveCount(0)
  await expect(narrowFiltersDialog.getByText('Stations', { exact: true })).toHaveCount(0)
  const expectStationDropdownLayout = async (dropdownTestId: string, optionsTestId: string) => {
    const dropdown = page.getByTestId(dropdownTestId)
    await expect(dropdown).toBeVisible()
    const dropdownLayout = await dropdown.evaluate((element, listboxTestId) => {
      const rect = element.getBoundingClientRect()
      const footer = document.querySelector('[data-testid="pairing-filter-dialog-footer"]') as HTMLElement | null
      const footerRect = footer?.getBoundingClientRect()
      const listbox = element.querySelector(`[data-testid="${listboxTestId}"]`) as HTMLElement | null

      return {
        fitsAboveFooter: footerRect ? rect.bottom <= footerRect.top + 1 : false,
        fitsViewport: rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth,
        hasScrollableList: listbox ? listbox.scrollHeight > listbox.clientHeight : false,
        placement: element.getAttribute('data-placement'),
      }
    }, optionsTestId)

    expect(dropdownLayout).toEqual({
      fitsAboveFooter: true,
      fitsViewport: true,
      hasScrollableList: true,
      placement: 'bottom',
    })

    return dropdown
  }
  await narrowFiltersDialog.getByRole('button', { name: /Select route stations/i }).click()
  const routeDropdown = await expectStationDropdownLayout(
    'pairing-filter-route-station-field-dropdown',
    'pairing-filter-route-station-field-options',
  )
  await page.keyboard.press('Escape')
  await expect(routeDropdown).toHaveCount(0)
  await narrowFiltersDialog.getByRole('button', { name: /Select layover stations/i }).click()
  await expectStationDropdownLayout(
    'pairing-filter-layover-station-field-dropdown',
    'pairing-filter-layover-station-field-options',
  )
  await expect(narrowFiltersDialog.getByRole('button', { name: 'Apply Filters' })).toBeVisible()
  await narrowFiltersDialog.getByRole('button', { name: 'Cancel' }).click()

  await page.setViewportSize({ width: 640, height: 900 })
  await dialog.getByRole('button', { name: 'Filters' }).click()
  const mobileFiltersDialog = page.getByRole('dialog', { name: 'Pairing Filters' })
  await expect(mobileFiltersDialog).toBeVisible()
  const mobileLayout = await mobileFiltersDialog.evaluate((element) => {
    const body = element.querySelector('[data-testid="pairing-filter-dialog-body"]') as HTMLElement | null
    const fields = Array.from(element.querySelectorAll<HTMLElement>('[data-testid$="-field"]'))
    const fieldOverflow = fields.some((field) => field.scrollWidth > field.clientWidth)
    const firstRowTops = fields.slice(0, 2).map((field) => Math.round(field.getBoundingClientRect().top))
    const rect = element.getBoundingClientRect()
    const portalRoot = element.closest('[data-testid="scaled-page-dialog-portal-root"]')

    return {
      bodyHasHorizontalOverflow: body ? body.scrollWidth > body.clientWidth : true,
      fieldOverflow,
      firstTwoFieldsShareRow: firstRowTops.length >= 2 && firstRowTops[0] === firstRowTops[1],
      portalRootContainsDialog: Boolean(portalRoot),
      visualScale: element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1,
    }
  })
  expect(mobileLayout).toEqual({
    bodyHasHorizontalOverflow: false,
    fieldOverflow: false,
    firstTwoFieldsShareRow: true,
    portalRootContainsDialog: true,
    visualScale: expect.any(Number),
  })
  expect(mobileLayout.visualScale).toBeLessThan(1)
  await mobileFiltersDialog.getByRole('button', { name: 'Cancel' }).click()
})

test('PBS-3535 — Pairing Preference resets scroll and shows a skeleton while refreshing results', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  const previewResults = Array.from({ length: 16 }, (_, index) => buildPairingResult(
    `${497000 + index}`,
    `PX${String(index + 1).padStart(3, '0')}`,
    `2026-06-${String(index + 1).padStart(2, '0')}`,
  ))
  await installPairingPreferenceApi(page, {
    previewDelayMs: 500,
    previewPageSize: 8,
    previewResults,
  })

  await page.goto('pairing')
  const dialog = await openPairingPreferenceDialog(page)
  const resultsScroll = dialog.getByTestId('pairing-preference-results-scroll')
  await expect(dialog.getByText('PX001', { exact: true })).toBeVisible()
  await resultsScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect.poll(() => resultsScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

  await dialog.getByRole('button', { name: 'Next pairing page' }).click()

  await expect.poll(() => resultsScroll.evaluate((element) => element.scrollTop)).toBe(0)
  await expect(resultsScroll).toHaveAttribute('aria-busy', 'true')
  await expect(dialog.getByTestId('pairing-preference-page-loading')).toBeVisible()
  await expect(dialog.getByText('PX001', { exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Previous pairing page' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Next pairing page' })).toBeDisabled()
  await expect(dialog.getByText('Page 2 of 2')).toBeVisible()

  await expect(dialog.getByText('PX009', { exact: true })).toBeVisible()
  await expect(resultsScroll).toHaveAttribute('aria-busy', 'false')
  await expect(dialog.getByTestId('pairing-preference-page-loading')).toHaveCount(0)

  await resultsScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect.poll(() => resultsScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await dialog.getByRole('textbox', { name: 'Search pairings' }).fill('PX0')
  await expect(dialog.getByTestId('pairing-preference-page-loading')).toBeVisible()
  await expect.poll(() => resultsScroll.evaluate((element) => element.scrollTop)).toBe(0)
  await expect(dialog.getByText('PX009', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText('PX001', { exact: true })).toBeVisible()

  await resultsScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect.poll(() => resultsScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await dialog.getByRole('button', { name: 'Filters' }).click()
  const filtersDialog = page.getByRole('dialog', { name: 'Pairing Filters' })
  await expect(filtersDialog).toBeVisible()
  await filtersDialog.getByLabel('Pairing length minimum').fill('2')
  await filtersDialog.getByRole('button', { name: 'Apply Filters' }).click()
  await expect(dialog.getByTestId('pairing-preference-page-loading')).toBeVisible()
  await expect.poll(() => resultsScroll.evaluate((element) => element.scrollTop)).toBe(0)
  await expect(dialog.getByText('PX001', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText('PX001', { exact: true })).toBeVisible()

  await dialog.getByRole('textbox', { name: 'Search pairings' }).fill('PX01')
  await expect(dialog.getByTestId('pairing-preference-page-loading')).toBeVisible()
  await expect(dialog.getByText('PX010', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: /Filters/ }).click()
  const clearDialog = page.getByRole('dialog', { name: 'Pairing Filters' })
  await expect(clearDialog).toBeVisible()
  await clearDialog.getByRole('button', { name: 'Clear All' }).click()
  await clearDialog.getByRole('button', { name: 'Apply Filters' }).click()
  await expect(dialog.getByTestId('pairing-preference-page-loading')).toBeVisible()
  await expect(dialog.getByText('PX010', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText('PX010', { exact: true })).toBeVisible()
})

test('PBS-3536 — Pairing Preference keeps table columns aligned and routes readable', async ({ page }) => {
  const commonRoute = 'YYZ-YVR-YYC-YKF-YOW-YYZ'
  const longRoute = 'YYZ-YVR-YYC-YKF-YOW-YEG-YWG-YUL-YHZ-YYZ'
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  const previewResults = Array.from({ length: 8 }, (_, index) => {
    const result = buildPairingResult(
      `${498000 + index}`,
      `PA${String(index + 1).padStart(3, '0')}`,
      `2026-06-${String(index + 1).padStart(2, '0')}`,
    )

    return {
      ...result,
      ...(index === 2 ? {
        originDate: '2026-06-01',
        endDate: '2026-06-02',
        endDateLabel: '2026-06-02',
        activeDates: ['2026-06-01', '2026-06-02'],
      } : {}),
      routeLabel: index === 0 ? commonRoute : index === 1 ? longRoute : 'YYZ-YVR-YYZ',
    }
  })
  await installPairingPreferenceApi(page, {
    previewPageSize: 8,
    previewResults,
  })

  await page.goto('pairing')
  const dialog = await openPairingPreferenceDialog(page)
  const resultsScroll = dialog.getByTestId('pairing-preference-results-scroll')
  const headerCells = resultsScroll.locator('thead th')
  const firstRowCells = resultsScroll.locator('tbody tr').filter({ hasText: 'PA001' }).locator('td')
  const commonRouteCell = firstRowCells.nth(3)
  const longRouteCell = resultsScroll.locator('tbody tr').filter({ hasText: 'PA002' }).locator('td').nth(3)
  const singleDateRow = resultsScroll.locator('tbody tr').filter({ hasText: 'PA004' })
  const rangeDateRow = resultsScroll.locator('tbody tr').filter({ hasText: 'PA003' })
  const singleDateCell = singleDateRow.locator('td').nth(4)
  const rangeDateCell = rangeDateRow.locator('td').nth(4)
  const rangeDateParts = rangeDateCell.locator(':scope > span > span')

  await expect(commonRouteCell).toHaveText(commonRoute)
  expect(await commonRouteCell.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(await resultsScroll.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)

  const assertColumnsAligned = async () => {
    const headerBoxes = await headerCells.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right }
    }))
    const rowBoxes = await firstRowCells.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right }
    }))

    expect(headerBoxes).toHaveLength(10)
    expect(rowBoxes).toHaveLength(10)
    headerBoxes.forEach((headerBox, index) => {
      expect(Math.abs(headerBox.left - rowBoxes[index].left)).toBeLessThanOrEqual(1)
      expect(Math.abs(headerBox.right - rowBoxes[index].right)).toBeLessThanOrEqual(1)
    })
  }

  const assertHeadersStayOnOneLine = async () => {
    const headerLayouts = await headerCells.evaluateAll((elements) => elements.map((element) => ({
      text: element.textContent?.trim() ?? '',
      fits: element.scrollWidth <= element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      whiteSpace: window.getComputedStyle(element).whiteSpace,
    })))

    expect(headerLayouts).toHaveLength(10)
    expect(
      headerLayouts.every((layout) => layout.fits && layout.whiteSpace === 'nowrap'),
      JSON.stringify(headerLayouts),
    ).toBe(true)
  }

  await assertColumnsAligned()
  await assertHeadersStayOnOneLine()
  await resultsScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(headerCells.first()).toBeVisible()
  await assertColumnsAligned()

  await page.setViewportSize({ width: 1024, height: 768 })
  await expect.poll(() => resultsScroll.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  const longRouteLayout = await longRouteCell.evaluate((element) => {
    const style = window.getComputedStyle(element)
    return {
      clientHeight: element.clientHeight,
      lineHeight: Number.parseFloat(style.lineHeight),
      overflow: style.overflow,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
    }
  })
  expect(longRouteLayout.clientHeight).toBeGreaterThan(longRouteLayout.lineHeight * 1.5)
  expect(longRouteLayout.scrollWidth).toBeLessThanOrEqual(longRouteLayout.clientWidth)
  expect(longRouteLayout.whiteSpace).not.toBe('nowrap')
  expect(longRouteLayout.textOverflow).not.toBe('ellipsis')
  expect(longRouteLayout.overflow).not.toBe('hidden')
  const singleDateLayout = await singleDateCell.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return {
      clientHeight: element.clientHeight,
      lineHeight: Number.parseFloat(window.getComputedStyle(element).lineHeight),
      textHeight: range.getBoundingClientRect().height,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }
  })
  const rangeDateLayout = await rangeDateCell.evaluate((element) => {
    const style = window.getComputedStyle(element)
    const range = document.createRange()
    range.selectNodeContents(element)
    return {
      clientHeight: element.clientHeight,
      overflow: style.overflow,
      textHeight: range.getBoundingClientRect().height,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
    }
  })
  expect(singleDateLayout.textHeight).toBeLessThanOrEqual(singleDateLayout.lineHeight * 1.5)
  expect(singleDateLayout.scrollWidth).toBeLessThanOrEqual(singleDateLayout.clientWidth)
  expect(rangeDateLayout.clientHeight).toBeGreaterThan(singleDateLayout.clientHeight)
  expect(rangeDateLayout.textHeight).toBeGreaterThan(singleDateLayout.textHeight)
  expect(rangeDateLayout.scrollWidth).toBeLessThanOrEqual(rangeDateLayout.clientWidth)
  expect(rangeDateLayout.whiteSpace).not.toBe('nowrap')
  expect(rangeDateLayout.textOverflow).not.toBe('ellipsis')
  expect(rangeDateLayout.overflow).not.toBe('hidden')
  await expect(rangeDateParts).toHaveCount(2)
  await expect(rangeDateParts.nth(0)).toHaveText('2026-06-01 →')
  await expect(rangeDateParts.nth(1)).toHaveText('2026-06-02')
  const rangeDatePartLayouts = await rangeDateParts.evaluateAll((elements) => elements.map((element) => {
    const style = window.getComputedStyle(element)
    return {
      fitsOnOneLine: element.getBoundingClientRect().height <= Number.parseFloat(style.lineHeight) * 1.5,
      whiteSpace: style.whiteSpace,
    }
  }))
  expect(rangeDatePartLayouts.every((layout) => layout.fitsOnOneLine && layout.whiteSpace === 'nowrap')).toBe(true)
  await assertHeadersStayOnOneLine()
  await assertColumnsAligned()
})

test('PBS-3537 — Pairing Preference shows the check-in and check-out behind time filters', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  const previewResults = [
    {
      ...buildPairingResult('498101', 'T4536', '2026-06-05'),
      reportTime: '1645',
      releaseTime: '2340',
    },
    {
      ...buildPairingResult('498102', 'T4536', '2026-06-08'),
      reportTime: '16:45',
      releaseTime: '23:42',
    },
  ]
  const state = await installPairingPreferenceApi(page, {
    previewPageSize: 2,
    previewResults,
  })

  await page.goto('pairing')
  const dialog = await openPairingPreferenceDialog(page)
  await dialog.getByRole('button', { name: 'Filters' }).click()
  const filtersDialog = page.getByRole('dialog', { name: 'Pairing Filters' })
  await expect(filtersDialog).toBeVisible()
  await filtersDialog.getByLabel('Check-in time from').fill('16:00')
  await filtersDialog.getByLabel('Check-in time to').fill('17:00')
  await filtersDialog.getByLabel('Check-out time from').fill('23:30')
  await filtersDialog.getByLabel('Check-out time to').fill('23:45')
  await filtersDialog.getByRole('button', { name: 'Apply Filters' }).click()

  await expect.poll(() => state.previewRequests.at(-1)?.filters).toEqual({
    pairingScope: 'fly',
    timeFrom: '16:00',
    timeTo: '17:00',
    releaseTimeFrom: '23:30',
    releaseTimeTo: '23:45',
  })

  const resultsScroll = dialog.getByTestId('pairing-preference-results-scroll')
  const headerCells = resultsScroll.locator('thead th')
  await expect(headerCells).toHaveCount(10)
  await expect(headerCells.nth(5)).toHaveText('Check-in')
  await expect(headerCells.nth(6)).toHaveText('Check-out')

  const june5Row = resultsScroll.locator('tbody tr').filter({ hasText: '2026-06-05' })
  const june8Row = resultsScroll.locator('tbody tr').filter({ hasText: '2026-06-08' })
  await expect(june5Row.locator('td')).toHaveCount(10)
  await expect(june5Row.locator('td').nth(5)).toHaveText('16:45')
  await expect(june5Row.locator('td').nth(6)).toHaveText('23:40')
  await expect(june8Row.locator('td')).toHaveCount(10)
  await expect(june8Row.locator('td').nth(5)).toHaveText('16:45')
  await expect(june8Row.locator('td').nth(6)).toHaveText('23:42')

  expect(await resultsScroll.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect.poll(() => resultsScroll.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
})

test('PBS-3534 — Pairing Search keeps the shared date picker at default density', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await installPairingPreferenceApi(page)

  await page.goto('pairing')
  await page.getByRole('tab', { name: 'PAIRING' }).click()
  await page.getByRole('button', { name: 'ALL PAIRINGS' }).click()
  await expect(page).toHaveURL(/\/bid\/pairing\/search$/)

  const openDateRange = page.getByRole('button', { name: 'Open date range picker for pairing results' })
  await expect(openDateRange).toBeVisible()
  const defaultDateRange = openDateRange.locator('..')
  await expect(defaultDateRange).toHaveAttribute('data-density', 'default')
  expect(await defaultDateRange.evaluate((element) => window.getComputedStyle(element).height)).toBe('40px')

  const anchorBox = await defaultDateRange.boundingBox()
  expect(anchorBox).not.toBeNull()
  await openDateRange.click()
  const popover = page.getByTestId('prefer-off-calendar-popover')
  await expect(popover).toBeVisible()
  const popoverBox = await popover.boundingBox()
  expect(popoverBox).not.toBeNull()
  const visualScale = await defaultDateRange.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return element.clientWidth > 0 ? rect.width / element.clientWidth : 1
  })
  expect(Math.abs(popoverBox!.width - 320 * visualScale)).toBeLessThanOrEqual(2)
  expect(Math.abs(popoverBox!.y - anchorBox!.y - anchorBox!.height - 6 * visualScale)).toBeLessThanOrEqual(2)

  await page.getByRole('gridcell', { name: 'Select 2026-06-10' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-25' }).click()
  await expect(defaultDateRange).toContainText('2026-06-10')
  await expect(defaultDateRange).toContainText('2026-06-25')
})

test('PBS-3532 — NPBS UI replay selects every exact Pairing Number match across pages', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  const repeatedPairings = [
    buildPairingResult('98991', 'C4107', '2026-07-03'),
    buildPairingResult('99126', 'C4107', '2026-07-05'),
    buildPairingResult('99196', 'C4107', '2026-07-06'),
    buildPairingResult('99661', 'C4130', '2026-07-12'),
    buildPairingResult('99923', 'C4130', '2026-07-19'),
  ]
  const state = await installPairingPreferenceApi(page, {
    previewResults: repeatedPairings,
  })
  const workbench = new BidWorkbenchPage(page, {
    crewId: '264',
    testId: 'PBS-3532',
  })

  await workbench.goto('pairing')
  const result = await workbench.placeProperty({
    tier: 'T3',
    page: 'pairing',
    propertyCode: 102,
    name: 'Pairing Preference',
    action: 'award',
    bid: {
      type: 'pairing-preference',
      values: ['C4107', 'C4130'],
    },
  })

  expect(result).toEqual({ placed: true })
  expect(state.addPayloads).toHaveLength(1)
  expect(state.addPayloads[0]?.property.bid).toEqual({
    type: 'pairing-preference',
    pairingIds: ['98991', '99126', '99196', '99661', '99923'],
    pairingLabels: ['C4107', 'C4107', 'C4107', 'C4130', 'C4130'],
  })
  const pagesByQuery = (query: string) => state.previewRequests
    .filter((request) => (request.filters as Record<string, unknown> | undefined)?.query === query)
    .map((request) => request.page)
  expect(pagesByQuery('C4107')).toEqual(expect.arrayContaining([1, 2, 3]))
  expect(pagesByQuery('C4130')).toEqual(expect.arrayContaining([1, 2]))
})

test('PBS-3531 — pairing calendar uses free panel height without an outer scrollbar', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  const state = await installPairingPreferenceApi(page)

  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('bid')
  await page.getByRole('tab', { name: 'PAIRING', exact: true }).click()

  const panel = page.locator('[data-uiid="dashboard-schedule-panel"]')
  const contentRegion = page.getByTestId('bidding-calendar-content-region')
  const openDatePopover = async (isoDate: string) => {
    const dateButton = page.getByRole('button', { name: `Add bid for ${isoDate}` })
    await expect(dateButton).toBeVisible({ timeout: 15_000 })
    await dateButton.click()
    const popover = page.getByTestId('schedule-action-popover')
    await expect(popover).toBeVisible()
    await popover.getByRole('tab', { name: 'PAIRING', exact: true }).click()
    await expect(popover.getByText('APPLY TO TIERS · REQUIRED', { exact: true })).toBeVisible()
    return popover
  }
  const expectPopoverInsidePanel = async (popover: ReturnType<Page['getByTestId']>) => {
    await expect.poll(async () => {
      const panelBox = await panel.boundingBox()
      const popoverBox = await popover.boundingBox()

      if (!panelBox || !popoverBox) {
        return null
      }

      return {
        bottomInside: popoverBox.y + popoverBox.height <= panelBox.y + panelBox.height + 1,
        leftInside: popoverBox.x >= panelBox.x - 1,
        rightInside: popoverBox.x + popoverBox.width <= panelBox.x + panelBox.width + 1,
        topInside: popoverBox.y >= panelBox.y - 1,
      }
    }).toEqual({
      bottomInside: true,
      leftInside: true,
      rightInside: true,
      topInside: true,
    })
  }

  const firstWeekPopover = await openDatePopover('2026-06-06')
  const overflowState = await contentRegion.evaluate((element) => {
    const htmlElement = element as HTMLElement
    const style = window.getComputedStyle(htmlElement)
    htmlElement.scrollTop = 40
    const scrollTop = htmlElement.scrollTop
    htmlElement.scrollTop = 0

    return {
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      scrollTop,
    }
  })

  expect(overflowState).toEqual({
    overflowX: 'visible',
    overflowY: 'visible',
    scrollTop: 0,
  })

  const runList = firstWeekPopover.getByTestId('pairing-calendar-run-list')
  const runListState = await runList.evaluate((element) => {
    const htmlElement = element as HTMLElement
    const style = window.getComputedStyle(htmlElement)
    return {
      clientHeight: htmlElement.clientHeight,
      overflowY: style.overflowY,
      scrollHeight: htmlElement.scrollHeight,
    }
  })
  expect(runListState.overflowY).toBe('auto')
  expect(runListState.scrollHeight).toBeGreaterThan(runListState.clientHeight)

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport)
    await expectPopoverInsidePanel(firstWeekPopover)
    await expect(firstWeekPopover.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(firstWeekPopover.getByRole('button', { name: 'ADD BID' })).toBeVisible()
  }

  await page.setViewportSize({ width: 1920, height: 1080 })
  await firstWeekPopover.getByRole('checkbox', { name: /PR142/ }).click()
  await expect(firstWeekPopover.getByText('1 tier blocked by days off.')).toBeVisible()
  await expectPopoverInsidePanel(firstWeekPopover)

  await page.getByTestId('schedule-action-popover-dismiss').click({ position: { x: 2, y: 2 } })
  const laterWeekPopover = await openDatePopover('2026-06-20')
  await laterWeekPopover.getByRole('checkbox', { name: /PR142/ }).click()
  await laterWeekPopover.getByRole('checkbox', { name: 'T2' }).click()
  state.failNextAdd = true
  await laterWeekPopover.getByRole('button', { name: 'ADD BID' }).click()
  await expect(laterWeekPopover.getByText('Unable to add pairing bid.')).toBeVisible()
  await expectPopoverInsidePanel(laterWeekPopover)

  await laterWeekPopover.getByRole('button', { name: 'ADD BID' }).click()
  await expect(laterWeekPopover).toBeHidden()
  expect(state.addPayloads).toHaveLength(1)
  expect(state.addPayloads[0]?.property).toMatchObject({
    propertyCode: 102,
    action: 'award',
    tiers: ['T2'],
    bid: {
      type: 'pairing-preference',
      pairingIds: ['496002'],
      pairingLabels: ['PR142'],
    },
  })
  expect(state.addPayloads[0]?.property.bid).not.toHaveProperty('occurrences')

  await page.reload()
  await page.getByRole('button', { name: 'TIER-02' }).click()
  const pairingEvent = page.getByRole('button', { name: 'View pairing bid PR142' })
  await expect(pairingEvent).toBeVisible()
  await pairingEvent.click()
  const detailDialog = page.getByRole('dialog', { name: 'Pairing Bid' })
  await expect(detailDialog).toBeVisible()
  await expect(detailDialog.getByTestId('pairing-dialog-detail-badge')).toHaveText('PR142')
})
