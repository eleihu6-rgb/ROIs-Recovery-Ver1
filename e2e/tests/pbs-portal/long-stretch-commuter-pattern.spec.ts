import { expect, test, type Page, type Route } from '@playwright/test'

const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

type DaysOffAddPayload = {
  propertyCode: number
  action?: 'award' | 'avoid' | null
  bid: {
    type: 'stepper-date-range'
    value: number
    from: string
    to: string
    min?: number
    max?: number
  }
  tiers: string[]
  allOrNothing?: boolean
  minimumN?: number | null
  maximumN?: number | null
}

type LineAddPayload = {
  property: {
    propertyCode: number
    name: string
    bid:
      | {
        type: 'days-off-on-pattern'
        minDaysOn: number
        maxDaysOn: number
        minDaysOff: number
        dateRange?: {
          from: string
          to: string
        } | null
        min?: number
        max?: number
      }
      | {
        type: 'credit-window-preference'
        direction: 'more' | 'less'
      }
      | {
        type: 'flag'
      }
      | {
        type: 'reserve-call-type-date-scope'
        callType: string
        options?: string[]
        dateScope:
          | { mode: 'whole_month' }
          | { mode: 'date_range'; from: string; to: string }
      }
    tiers: string[]
    action?: 'award' | 'avoid' | null
  }
}

type PairingAddPayload = {
  property: {
    propertyCode: 428
    name: 'Efficient Flying First'
    action: 'award'
    bid: {
      type: 'efficient-flying-preference'
      mode: 'efficient' | 'inefficient'
    }
    tiers: string[]
  }
}

const currentPeriod = {
  id: 38,
  periodCode: 'Jun 2026',
  filiale: 'F8',
  division: 'C',
  status: 'OPEN',
  computedStage: 'OPEN',
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

const preferOffConfig = {
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
}

const longStretchCatalogProperty = {
  propertyCode: 204,
  name: 'Long Stretch Off / Compressed Flying',
  defaultBid: {
    type: 'stepper-date-range',
    value: 10,
    from: '',
    to: '',
    min: 1,
    max: 14,
  },
}

const commuterCatalogProperty = {
  propertyCode: 408,
  name: 'Commuter Pattern',
  defaultBid: {
    type: 'days-off-on-pattern',
    minDaysOff: 4,
    minDaysOn: 4,
    maxDaysOn: 5,
    min: 1,
    max: 14,
  },
}

const creditWindowCatalogProperty = {
  propertyCode: 429,
  name: 'Credit Window Preference',
  defaultBid: {
    type: 'credit-window-preference',
    direction: 'more',
  },
}

const efficientFlyingFirstCatalogProperty = {
  propertyCode: 428,
  name: 'Efficient Flying First',
  defaultAction: 'award',
  supportedActions: ['award'],
  defaultBid: {
    type: 'efficient-flying-preference',
    mode: 'efficient',
  },
}

const reserveCatalogProperty = {
  propertyCode: 427,
  name: 'Reserve',
  defaultAction: 'award',
  supportedActions: ['award', 'avoid'],
  defaultBid: {
    type: 'flag',
  },
}

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const installBidConditionApis = async (page: Page) => {
  const state: {
    draftVersion: number
    daysOffProperties: Array<DaysOffAddPayload & {
      propertyGroupKey: string
      rowSeq: number
      name: string
    }>
    lineProperties: Array<LineAddPayload['property'] & {
      propertyGroupKey: string
      rowSeq: number
    }>
    pairingProperties: Array<PairingAddPayload['property'] & {
      propertyGroupKey: string
      rowSeq: number
    }>
    daysOffAddPayloads: DaysOffAddPayload[]
    lineAddPayloads: LineAddPayload[]
    linePatchPayloads: Array<LineAddPayload & { propertyGroupKey: string }>
    lineDeleteKeys: string[]
    pairingAddPayloads: PairingAddPayload[]
    efficientFlyingPercentile: number
    efficientFlyingConfigRequests: number
  } = {
    draftVersion: 0,
    daysOffProperties: [],
    lineProperties: [],
    pairingProperties: [],
    daysOffAddPayloads: [],
    lineAddPayloads: [],
    linePatchPayloads: [],
    lineDeleteKeys: [],
    pairingAddPayloads: [],
    efficientFlyingPercentile: 20,
    efficientFlyingConfigRequests: 0,
  }

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
      await fulfillJson(route, {
        ...lineholderSummary,
        draftVersion: state.draftVersion,
        summaryItems: [
          ...state.lineProperties.map((property) => {
            const readableText = property.propertyCode === 427
              ? property.action === 'avoid'
                ? 'Pairing only for the whole bid month'
                : 'Reserve only for the whole bid month'
              : property.bid.type === 'credit-window-preference'
                ? property.bid.direction === 'more' ? 'More credit' : 'Less credit'
                : property.name

            return {
              id: property.propertyGroupKey,
              groupKey: property.propertyGroupKey,
              bidType: 'Line',
              action: property.action === 'avoid' ? 'Avoid' : 'Award',
              label: property.name,
              bid: readableText,
              value: readableText,
              readableText,
              tiers: property.tiers,
              editableSource: {
                module: 'Line',
                propertyGroupKey: property.propertyGroupKey,
              },
            }
          }),
          ...state.pairingProperties.map((property) => ({
            id: property.propertyGroupKey,
            groupKey: property.propertyGroupKey,
            bidType: 'Pairing',
            action: 'Award',
            label: property.name,
            bid: property.bid.mode === 'efficient'
              ? `Efficient flying · Top ${state.efficientFlyingPercentile}% by average daily credit`
              : `Inefficient flying · Bottom ${state.efficientFlyingPercentile}% by average daily credit`,
            value: property.bid.mode === 'efficient'
              ? `Efficient flying · Top ${state.efficientFlyingPercentile}% by average daily credit`
              : `Inefficient flying · Bottom ${state.efficientFlyingPercentile}% by average daily credit`,
            readableText: property.bid.mode === 'efficient'
              ? `Efficient flying · Top ${state.efficientFlyingPercentile}% by average daily credit`
              : `Inefficient flying · Bottom ${state.efficientFlyingPercentile}% by average daily credit`,
            tiers: property.tiers,
            editableSource: {
              module: 'Pairing',
              propertyGroupKey: property.propertyGroupKey,
            },
          })),
        ],
      })
      return
    }

    if (pathname.endsWith('/days-off-bids/current/properties') && request.method() === 'POST') {
      const payload = request.postDataJSON() as DaysOffAddPayload
      const propertyGroupKey = `long-stretch-${state.daysOffProperties.length + 1}`
      state.daysOffAddPayloads.push(payload)
      state.daysOffProperties.push({
        ...payload,
        propertyGroupKey,
        rowSeq: state.daysOffProperties.length + 1,
        name: longStretchCatalogProperty.name,
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
        rowSeq: state.daysOffProperties.length,
      })
      return
    }

    if (pathname.endsWith('/days-off-bids/current') && request.method() === 'GET') {
      await fulfillJson(route, {
        currentPeriod,
        preferOffConfig,
        draft: {
          draftKey: '42',
          bidId: 42,
          periodId: currentPeriod.id,
          draftVersion: state.draftVersion,
          periodCode: currentPeriod.periodCode,
          bidContext: 'Current',
          remarks: '',
          properties: state.daysOffProperties.map((property) => ({
            propertyGroupKey: property.propertyGroupKey,
            rowSeq: property.rowSeq,
            propertyCode: property.propertyCode,
            name: property.name,
            action: property.action ?? null,
            bid: property.bid,
            tiers: property.tiers,
            allOrNothing: property.allOrNothing ?? false,
            minimumN: property.minimumN ?? null,
            maximumN: property.maximumN ?? null,
          })),
        },
        propertyCatalog: [longStretchCatalogProperty],
        favoriteProperties: [],
        recommendedPropertyCodes: [204],
      })
      return
    }

    if (pathname.endsWith('/line-bids/current/properties') && request.method() === 'POST') {
      const payload = request.postDataJSON() as LineAddPayload
      const propertyGroupKey = `line-${state.lineProperties.length + 1}`
      state.lineAddPayloads.push(payload)
      state.lineProperties.push({
        ...payload.property,
        propertyGroupKey,
        rowSeq: state.lineProperties.length + 1,
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
        rowSeq: state.lineProperties.length,
      })
      return
    }

    if (pathname.includes('/line-bids/current/properties/') && request.method() === 'DELETE') {
      const propertyGroupKey = pathname.split('/').pop() ?? ''
      state.lineDeleteKeys.push(propertyGroupKey)
      state.lineProperties = state.lineProperties.filter((property) =>
        property.propertyGroupKey !== propertyGroupKey)
      state.draftVersion += 1
      await fulfillJson(route, {
        saved: true,
        draftKey: '42',
        bidId: 42,
        periodId: currentPeriod.id,
        periodCode: currentPeriod.periodCode,
        draftVersion: state.draftVersion,
      })
      return
    }

    if (pathname.includes('/line-bids/current/properties/') && request.method() === 'PATCH') {
      const propertyGroupKey = pathname.split('/').pop() ?? ''
      const payload = request.postDataJSON() as LineAddPayload
      state.linePatchPayloads.push({ ...payload, propertyGroupKey })
      state.lineProperties = state.lineProperties.map((property) =>
        property.propertyGroupKey === propertyGroupKey
          ? {
              ...payload.property,
              propertyGroupKey,
              rowSeq: property.rowSeq,
            }
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

    if (pathname.endsWith('/line-bids/credit-window-config') && request.method() === 'GET') {
      await fulfillJson(route, {
        available: true,
        deltaHours: 5,
      })
      return
    }

    if (pathname.endsWith('/line-bids/current') && request.method() === 'GET') {
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
          properties: state.lineProperties,
        },
        propertyCatalog: [
          creditWindowCatalogProperty,
          commuterCatalogProperty,
          reserveCatalogProperty,
        ],
        favoriteProperties: [],
        recommendedPropertyCodes: [429, 408, 427],
      })
      return
    }

    if (pathname.endsWith('/pairing-bids/efficient-flying-config') && request.method() === 'GET') {
      state.efficientFlyingConfigRequests += 1
      await fulfillJson(route, {
        available: true,
        percentile: state.efficientFlyingPercentile,
      })
      return
    }

    if (pathname.endsWith('/pairing-bids/current/properties') && request.method() === 'POST') {
      const payload = request.postDataJSON() as PairingAddPayload
      const propertyGroupKey = `pairing-${state.pairingProperties.length + 1}`
      state.pairingAddPayloads.push(payload)
      state.pairingProperties.push({
        ...payload.property,
        propertyGroupKey,
        rowSeq: state.pairingProperties.length + 1,
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
        rowSeq: state.pairingProperties.length,
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
          properties: state.pairingProperties,
        },
        propertyCatalog: [efficientFlyingFirstCatalogProperty],
        favoriteProperties: [],
        recommendedPropertyCodes: [428],
      })
      return
    }

    if (pathname.endsWith('/pairing-search/current-rules/counts') && request.method() === 'POST') {
      await fulfillJson(route, {
        mode: 'current_rules_counts',
        periodCode: currentPeriod.periodCode,
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

    if (pathname.endsWith('/pairing-search/current-rules/tier-pools') && request.method() === 'POST') {
      await fulfillJson(route, {
        mode: 'current_rules_tier_pools',
        periodCode: currentPeriod.periodCode,
        computedAt: '2026-06-01T00:00:00.000Z',
        packageTotal: {
          pairingIdCount: 0,
          totalItems: 0,
        },
        rows: [],
      })
      return
    }

    if (pathname.endsWith('/pairing-search/current-rules/tier-pools') && request.method() === 'POST') {
      await fulfillJson(route, {
        mode: 'current_rules_tier_pools',
        periodCode: currentPeriod.periodCode,
        computedAt: '2026-06-01T00:00:00.000Z',
        packageTotal: {
          pairingIdCount: 0,
          totalItems: 0,
        },
        rows: [],
      })
      return
    }

    if (pathname.endsWith('/pairing-search/preview') && request.method() === 'POST') {
      await fulfillJson(route, {
        mode: 'criteria_preview',
        properties: state.pairingProperties,
        summary: {
          pairingIdCount: 0,
          totalItems: 0,
        },
        pagination: {
          page: 1,
          pageSize: 30,
          totalItems: 0,
          totalPages: 1,
        },
        results: [],
      })
      return
    }

    await fulfillJson(route, {})
  })

  return state
}

const showAllRuleBidProperties = async (page: Page, category: 'DAYS OFF' | 'ROSTER' = 'ROSTER') => {
  const categoryTab = page.getByRole('tablist', { name: 'Bid property categories' })
    .getByRole('tab', { name: category })
  await expect(categoryTab).toBeVisible({ timeout: 60_000 })
  if (await categoryTab.getAttribute('aria-selected') !== 'true') {
    await categoryTab.click()
  }

  const workspace = page.getByTestId('rule-bid-add-properties-workspace')
  await expect(workspace).toBeVisible({ timeout: 60_000 })
  return workspace
}

test.use({ storageState: { cookies: [], origins: [] } })

test('PBS-3516 — Long Stretch Off submits whole month when date range is not limited', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  const state = await installBidConditionApis(page)

  await page.goto('days-off')
  const workspace = await showAllRuleBidProperties(page, 'DAYS OFF')
  await workspace.getByRole('button', { name: 'Add Long Stretch Off / Compressed Flying' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Long Stretch Off / Compressed Flying' })
  await expect(dialog).toBeVisible()
  const tierOne = dialog.getByRole('button', { name: 'Toggle T1 for Long Stretch Off / Compressed Flying' })
  await expect(tierOne).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('switch', {
    name: 'Configure bid for Long Stretch Off / Compressed Flying limit to a date range',
  })).toHaveAttribute('aria-checked', 'false')
  await expect(dialog.getByText('PREFERENCE')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Award' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Avoid' })).toHaveCount(0)
  await expect(dialog.getByText('Whole bid month')).toHaveCount(0)
  await expect(dialog.getByText(/REQUIRED/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'SAVE FAVORITE' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await tierOne.click()

  const limitSwitch = dialog.getByRole('switch', {
    name: 'Configure bid for Long Stretch Off / Compressed Flying limit to a date range',
  })
  await limitSwitch.click()
  await dialog
    .getByRole('button', { name: 'Open Configure bid for Long Stretch Off / Compressed Flying date range calendar' })
    .click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-01' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-03' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'Long Stretch Off / Compressed Flying date range must be at least 10 days long.',
  )
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await limitSwitch.click()
  await expect(dialog.getByText('Whole bid month')).toHaveCount(0)
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/days-off-bids/current/properties')
        && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'ADD BID' }).click(),
  ])

  expect(state.daysOffAddPayloads).toHaveLength(1)
  expect(state.daysOffAddPayloads[0]).toMatchObject({
    propertyCode: 204,
    action: 'award',
    bid: {
      type: 'stepper-date-range',
      value: 10,
      from: '2026-06-01',
      to: '2026-06-30',
    },
    tiers: ['T1'],
  })
  await expect(dialog).not.toBeVisible()
})

test('PBS-3517 — Commuter Pattern keeps fixed days-off semantics and tier required guard', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  const state = await installBidConditionApis(page)

  await page.goto('line')
  const workspace = await showAllRuleBidProperties(page)
  await workspace.getByRole('button', { name: 'Add Commuter Pattern' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Commuter Pattern' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('WORK BLOCK')).toBeVisible()
  await expect(dialog.getByText('OFF BLOCK')).toBeVisible()
  await expect(dialog.getByRole('switch', {
    name: 'Configure bid for Commuter Pattern limit to a date range',
  })).toHaveAttribute('aria-checked', 'false')

  const tierOne = dialog.getByRole('button', { name: 'Toggle T1 for Commuter Pattern' })
  await expect(tierOne).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByText(/REQUIRED/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'SAVE FAVORITE' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await tierOne.click()

  await dialog.getByRole('switch', { name: 'Configure bid for Commuter Pattern limit to a date range' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Open Configure bid for Commuter Pattern date range calendar' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-02' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-05' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'Commuter Pattern date range must be at least 8 days long.',
  )
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Open Configure bid for Commuter Pattern date range calendar' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-02' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-18' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'SAVE FAVORITE' })).toBeDisabled()

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/line-bids/current/properties')
        && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'ADD BID' }).click(),
  ])

  expect(state.lineAddPayloads).toHaveLength(1)
  const commuterBid = state.lineAddPayloads[0].property.bid
  expect(state.lineAddPayloads[0].property).toMatchObject({
    propertyCode: 408,
    name: 'Commuter Pattern',
    bid: {
      type: 'days-off-on-pattern',
      minDaysOn: 4,
      maxDaysOn: 5,
      minDaysOff: 4,
      dateRange: {
        from: '2026-06-02',
        to: '2026-06-18',
      },
    },
    tiers: ['T1'],
  })
  expect('maxDaysOff' in commuterBid).toBe(false)
  await expect(page.getByLabel('Commuter Pattern bid summary')).toContainText(
    'Work 4–5 days, then 4 days off from Jun 2, 2026 to Jun 18, 2026',
  )
})

test('PBS-4290 — Credit Window Preference saves More/Less with a company-defined adjustment', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  const state = await installBidConditionApis(page)

  await page.goto('bid')
  await page.getByRole('tablist', { name: 'Bid property categories' })
    .getByRole('tab', { name: 'ROSTER' })
    .click()
  const workspace = page.getByTestId('rule-bid-add-properties-workspace')
  await expect(workspace).toBeVisible()
  await workspace.getByRole('button', { name: 'Add Credit Window Preference' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Credit Window Preference' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('section > p')).toHaveText(['APPLY TO TIERS · REQUIRED', 'PREFERENCE'])
  const moreCredit = dialog.getByRole('button', { name: 'More credit' })
  const lessCredit = dialog.getByRole('button', { name: 'Less credit' })
  const helperText = dialog.getByLabel('Configure bid for Credit Window Preference company-defined adjustment')
  await expect(moreCredit).toHaveAttribute('aria-pressed', 'true')
  await expect(moreCredit).toHaveClass(/bg-white/)
  await expect(lessCredit).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await expect(helperText).not.toHaveClass(/border/)
  await expect(helperText).toContainText(
    'Aims for up to 5h above',
  )
  await expect(dialog.getByRole('button', { name: 'Custom' })).toHaveCount(0)
  await lessCredit.click()
  await expect(moreCredit).toHaveAttribute('aria-pressed', 'false')
  await expect(lessCredit).toHaveAttribute('aria-pressed', 'true')
  await expect(lessCredit).toHaveClass(/bg-white/)
  await expect(helperText).toContainText(
    'Aims for up to 5h below',
  )

  await dialog.getByRole('button', { name: 'Toggle T1 for Credit Window Preference' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/line-bids/current/properties')
        && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'ADD BID' }).click(),
  ])

  expect(state.lineAddPayloads).toHaveLength(1)
  expect(state.lineAddPayloads[0].property).toMatchObject({
    propertyCode: 429,
    name: 'Credit Window Preference',
    bid: {
      type: 'credit-window-preference',
      direction: 'less',
    },
    tiers: ['T1'],
  })
  await expect(page.getByTestId('bid-page').getByText('Less credit', { exact: true })).toBeVisible()
})

test('PBS-4280 — Efficient Flying First is an award-only Pairing percentile preference', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  const state = await installBidConditionApis(page)

  await page.goto('bid')
  await page.getByRole('tab', { name: 'PAIRING' }).click()
  const workspace = page.getByTestId('pairing-add-properties-workspace')
  await expect(workspace).toBeVisible()
  await workspace.getByRole('button', { name: 'Add Efficient Flying First' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Efficient Flying First' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/TIERS/)).toBeVisible()
  await expect(dialog.getByText('PREFERENCE', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Efficient flying', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(dialog.getByRole('button', { name: 'Inefficient flying', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(dialog.getByText('Top 20% by average daily credit')).toBeVisible()
  await expect(dialog.getByText('The percentage is company-defined.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Award$/ })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /^Avoid$/ })).toHaveCount(0)

  const firstRequestCount = state.efficientFlyingConfigRequests
  await dialog.getByRole('button', { name: /Close/ }).click()
  state.efficientFlyingPercentile = 15
  await workspace.getByRole('button', { name: 'Add Efficient Flying First' }).click()
  await expect(dialog.getByText('Top 15% by average daily credit')).toBeVisible()
  expect(state.efficientFlyingConfigRequests).toBeGreaterThan(firstRequestCount)

  const tierOne = dialog.getByRole('button', { name: 'Toggle T1 for Efficient Flying First' })
  await expect(tierOne).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await tierOne.click()
  await dialog.getByRole('button', { name: 'Inefficient flying', exact: true }).click()
  await expect(dialog.getByText('Bottom 15% by average daily credit')).toBeVisible()

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/pairing-bids/current/properties')
        && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'ADD BID' }).click(),
  ])

  expect(state.pairingAddPayloads).toHaveLength(1)
  expect(state.pairingAddPayloads[0].property).toMatchObject({
    propertyCode: 428,
    name: 'Efficient Flying First',
    action: 'award',
    bid: {
      type: 'efficient-flying-preference',
      mode: 'inefficient',
    },
    tiers: ['T1'],
  })
  await expect(page.getByLabel('Efficient Flying First bid summary')).toContainText(
    'Inefficient flying · Bottom 15% by average daily credit',
  )
  await page.getByRole('button', { name: 'SEARCH PAIRINGS' }).click()
  await expect(page).toHaveURL(/\/bid\/pairing\/search/)
  await expect(page.getByTestId('pairing-search-current-rules-preview')).toBeVisible()
  await expect(page.getByText(
    'Efficient Flying First: Inefficient flying · Bottom 15% by average daily credit',
    { exact: true },
  )).toBeVisible()
})

test('PBS-4270 — Mixed Line Bid saves Pairing Only and updates back to Short Call', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  const state = await installBidConditionApis(page)

  await page.goto('line')
  const workspace = await showAllRuleBidProperties(page)
  await workspace.getByRole('button', { name: 'Add Mixed Line Bid' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Mixed Line Bid' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('PREFERENCE', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Mixed Line', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(dialog.getByRole('button', { name: 'Reserve Only' })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'Pairing Only' })).toHaveAttribute('aria-pressed', 'false')

  const tierOne = dialog.getByRole('button', { name: 'Toggle T1 for Mixed Line Bid' })
  await expect(tierOne).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'SAVE FAVORITE' })).toBeDisabled()
  await expect(dialog.getByText('RESERVE SHORT CALL', { exact: true })).toBeVisible()
  await expect(dialog.getByText('RESERVE SHORT CALL BIDS', { exact: true })).toHaveCount(0)
  await tierOne.click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Pairing Only' }).click()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/line-bids/current/properties')
        && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'ADD BID' }).click(),
  ])

  expect(state.lineAddPayloads).toHaveLength(1)
  expect(state.lineAddPayloads[0].property).toMatchObject({
    propertyCode: 427,
    name: 'Reserve',
    action: 'avoid',
    bid: {
      type: 'flag',
    },
    tiers: ['T1'],
  })
  await expect(page.getByLabel('Mixed Line Bid bid summary')).toContainText(
    'Pairing only for the whole bid month',
  )

  await page.getByRole('button', {
    name: 'Open detail for T1 Pairing only for the whole bid month',
  }).click()
  const editDialog = page.getByRole('dialog', { name: 'Configure Mixed Line Bid' })
  await expect(editDialog.getByRole('button', { name: 'Pairing Only' })).toHaveAttribute('aria-pressed', 'true')
  await editDialog.getByRole('button', { name: 'Mixed Line', exact: true }).click()
  await editDialog.getByRole('button', { name: '+ ADD RESERVE SHORT CALL' }).click()
  await editDialog.getByRole('button', { name: '+ ADD RESERVE SHORT CALL' }).click()
  for (let index = 0; index < 5; index += 1) {
    await editDialog.getByRole('button', { name: '+ ADD RESERVE SHORT CALL' }).click()
  }
  await expect(editDialog.getByText('RESERVE SHORT CALL', { exact: true })).toHaveCount(1)
  await expect(editDialog.getByText('SHORT CALL 1', { exact: true })).toBeVisible()
  await expect(editDialog.getByText('SHORT CALL 7', { exact: true })).toBeVisible()
  const editDialogBox = await editDialog.boundingBox()
  const viewportSize = page.viewportSize()
  expect(editDialogBox).not.toBeNull()
  expect(viewportSize).not.toBeNull()
  expect(editDialogBox!.y).toBeGreaterThanOrEqual(40)
  expect(editDialogBox!.y + editDialogBox!.height).toBeLessThanOrEqual(viewportSize!.height - 40)
  for (let index = 0; index < 6; index += 1) {
    await editDialog.getByRole('button', { name: 'REMOVE' }).nth(1).click()
  }
  const shortCallDateRangeSwitch = editDialog.getByRole('switch', {
    name: 'Configure short-call 1 for Mixed Line Bid limit to a date range',
  })
  await shortCallDateRangeSwitch.click()
  await expect(editDialog.getByText('Start date', { exact: true })).toBeVisible()
  await expect(editDialog.getByText('End date', { exact: true })).toBeVisible()
  await expect(editDialog.getByRole('button', {
    name: 'Open Configure short-call 1 for Mixed Line Bid date range calendar',
  })).toBeVisible()
  await shortCallDateRangeSwitch.click()

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/line-bids/current/properties/line-1')
        && response.request().method() === 'DELETE'),
    page.waitForResponse((response) =>
      response.url().includes('/api/line-bids/current/properties')
        && response.request().method() === 'POST'),
    editDialog.getByRole('button', { name: 'UPDATE BID' }).click(),
  ])

  expect(state.lineDeleteKeys).toEqual(['line-1'])
  expect(state.linePatchPayloads).toHaveLength(0)
  expect(state.lineAddPayloads).toHaveLength(2)
  expect(state.lineAddPayloads[1]).toMatchObject({
    property: {
      propertyCode: 301,
      name: 'Reserve Preference',
      action: 'award',
      bid: {
        type: 'reserve-call-type-date-scope',
        callType: 'PRAM',
        dateScope: { mode: 'whole_month' },
      },
      tiers: ['T1'],
    },
  })
  await expect(page.getByLabel('Mixed Line Bid bid summary')).toContainText(
    'Award PRAM short call for the whole month',
  )
})

test('PBS-3518 — bid dialog follows the scaled workbench canvas on narrow viewports', async ({ page }) => {
  await page.setViewportSize({ width: 1052, height: 2048 })
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await installBidConditionApis(page)

  await page.goto('line')
  const workspace = await showAllRuleBidProperties(page)
  await workspace.getByRole('button', { name: 'Add Commuter Pattern' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Commuter Pattern' })
  await expect(dialog).toBeVisible()

  await expect.poll(async () =>
    dialog.evaluate((node) => Boolean(node.closest('[data-testid="shared-bidding-workbench-canvas"]'))),
  ).toBe(true)

  const dialogBox = await dialog.boundingBox()
  const canvasBox = await page.getByTestId('shared-bidding-workbench-canvas').boundingBox()

  expect(dialogBox).not.toBeNull()
  expect(canvasBox).not.toBeNull()
  expect(dialogBox!.width).toBeLessThan(420)
  expect(dialogBox!.width).toBeGreaterThan(320)
  expect(dialogBox!.width).toBeLessThan(canvasBox!.width / 2)
})
