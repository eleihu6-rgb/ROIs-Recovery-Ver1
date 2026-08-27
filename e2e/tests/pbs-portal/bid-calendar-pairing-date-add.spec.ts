import { expect, test, type Page, type Route } from '@playwright/test'

const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

type PairingPreferencePayload = {
  property: {
    propertyCode: 102
    name: string
    action?: 'award' | 'avoid' | null
    quantifier?: null
    bid: {
      type: 'pairing-preference'
      pairingIds: string[]
      pairingLabels?: string[]
    }
    tiers: string[]
  }
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

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const installBidCalendarPairingApi = async (page: Page) => {
  const state: {
    draftVersion: number
    addPayloads: PairingPreferencePayload[]
  } = {
    draftVersion: 0,
    addPayloads: [],
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
          draftKey: 'days-off-38',
          bidId: 38,
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
          draftKey: 'line-38',
          bidId: 38,
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

    if (pathname.endsWith('/pairing-bids/current') && request.method() === 'GET') {
      await fulfillJson(route, {
        currentPeriod,
        draft: {
          draftKey: 'pairing-38',
          bidId: 38,
          periodId: currentPeriod.id,
          draftVersion: state.draftVersion,
          periodCode: currentPeriod.periodCode,
          bidContext: 'Current',
          remarks: '',
          properties: [],
        },
        propertyCatalog: [pairingPreferenceCatalogProperty],
        favoriteProperties: [],
        recommendedPropertyCodes: [102],
      })
      return
    }

    if (pathname.endsWith('/pairing-search/pairing-occurrences/by-date')) {
      const originDate = searchParams.get('originDate') ?? '2026-06-20'
      await fulfillJson(route, {
        originDate,
        periodCode: searchParams.get('periodCode') ?? 'Jun 2026',
        occurrences: [
          {
            occurrenceId: `496002:${originDate}`,
            pairingId: '496002',
            pairingNumber: 'PR142',
            originDate,
            startDate: originDate,
            endDate: originDate,
            label: `PR142 · ${originDate}`,
          },
        ],
      })
      return
    }

    if (pathname.endsWith('/pairing-bids/current/properties') && request.method() === 'POST') {
      const payload = request.postDataJSON() as PairingPreferencePayload
      state.addPayloads.push(payload)
      state.draftVersion += 1
      await fulfillJson(route, {
        saved: true,
        draftKey: 'pairing-38',
        bidId: 38,
        periodId: currentPeriod.id,
        periodCode: currentPeriod.periodCode,
        draftVersion: state.draftVersion,
        propertyGroupKey: 'pairing-preference-1',
        rowSeq: 1,
        tiers: payload.property.tiers,
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
          pairingIdCount: 1,
          totalItems: 1,
        },
        rows: [],
      })
      return
    }

    await fulfillJson(route, {})
  })

  return state
}

test.use({
  storageState: { cookies: [], origins: [] },
})

test('PBS-3087 — bid calendar can add a pairing bid from a selected date @smoke', async ({ page }) => {
  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  const state = await installBidCalendarPairingApi(page)

  await page.goto('bid')
  await expect(page.getByTestId('bid-page')).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: 'Add bid for 2026-06-20' }).click()
  const popover = page.getByTestId('schedule-action-popover')
  await expect(popover).toBeVisible()
  await popover.getByRole('tab', { name: 'PAIRING', exact: true }).click()

  await expect(popover.getByTestId('pairing-calendar-run-list')).toContainText('PR142')
  await popover.getByRole('checkbox', { name: /PR142/ }).click()
  await popover.getByRole('checkbox', { name: 'T2' }).click()

  await popover.getByRole('button', { name: 'ADD BID' }).click()
  await expect(popover).toBeHidden()

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
})
