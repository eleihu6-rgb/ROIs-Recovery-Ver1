import { expect, test, type Page, type Route } from '@playwright/test'

const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

const currentPeriod = {
  id: 42,
  periodCode: 'Apr 2026',
  filiale: 'F8',
  division: 'C',
  status: 'OPEN',
  computedStage: 'OPEN',
  bidOpenAt: '2026-03-06T00:00:00.000Z',
  bidCloseAt: '2026-03-13T23:59:00.000Z',
  canEditBid: true,
  readOnlyReason: null,
}

const profile = {
  id: 'u-1',
  employeeNo: 'F8030',
  name: 'Casey Crew',
  email: null,
  base: 'YVR',
  rank: 'FA',
  division: 'C',
  fleet: ['737'],
  languages: [],
  seniorityLabel: 'Seniority 100',
  statusLabel: 'Active',
  existingCreditLabel: null,
  trainingMonthLabel: null,
  lastLoginLabel: null,
}

const biddingCalendar = {
  currentPeriod,
  periodCode: 'Apr 2026',
  bidContext: 'Current',
  activeTierRange: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
  events: [],
  warnings: [],
}

const lineholderSummary = {
  draftKey: 'draft-1',
  bidId: 1,
  periodId: 42,
  draftVersion: 0,
  periodCode: 'Apr 2026',
  bidContext: 'Current',
  statistics: [],
  summaryItems: [],
  warnings: [],
  diagnostics: [],
}

const tierLabels = ['T1']

const daysOffDraft = {
  currentPeriod,
  draft: {
    draftKey: 'days-off-draft-1',
    bidId: 1,
    periodId: 42,
    draftVersion: 0,
    periodCode: 'Apr 2026',
    bidContext: 'Current',
    remarks: '',
    properties: [
      {
        propertyGroupKey: 'existing-long-stretch-off-compressed-flying',
        rowSeq: 1,
        propertyCode: 211,
        name: 'Long Stretch Off / Compressed Flying',
        bid: { type: 'stepper-date-range', value: 2, from: '2026-05-01', to: '2026-05-07' },
        tiers: tierLabels,
      },
    ],
  },
  propertyCatalog: [],
  favoriteProperties: [],
  recommendedPropertyCodes: [],
}

const lineDraft = {
  currentPeriod,
  draft: {
    draftKey: 'line-draft-1',
    bidId: 1,
    periodId: 42,
    draftVersion: 0,
    periodCode: 'Apr 2026',
    bidContext: 'Current',
    remarks: '',
    properties: [
      {
        propertyGroupKey: 'line-clear-schedule-and-start-next-bid-group',
        rowSeq: 1,
        propertyCode: 403,
        name: 'Clear Schedule and Start Next Bid Group',
        bid: { type: 'flag' },
        tiers: tierLabels,
      },
    ],
  },
  propertyCatalog: [],
  favoriteProperties: [],
  recommendedPropertyCodes: [],
}

const pairingDraft = {
  currentPeriod,
  draft: {
    draftKey: 'pairing-draft-1',
    bidId: 1,
    periodId: 42,
    draftVersion: 0,
    periodCode: 'Apr 2026',
    bidContext: 'Current',
    remarks: '',
    properties: [
      {
        propertyGroupKey: 'existing-pairing-long-property-name',
        rowSeq: 1,
        propertyCode: 131,
        name: 'Prefer Pairing With Deadhead Duty In Operating Window',
        action: 'avoid',
        quantifier: null,
        bid: { type: 'duration', value: '06:00', operator: '<' },
        tiers: tierLabels,
      },
    ],
  },
  propertyCatalog: [],
  favoriteProperties: [],
  recommendedPropertyCodes: [],
}

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const mockPortalApi = async (page: Page) => {
  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, 'test-token')
  }, AUTH_TOKEN_KEY)

  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url())

    if (pathname.endsWith('/auth/session')) {
      await fulfillJson(route, {
        user: {
          id: profile.id,
          name: profile.name,
          employeeNo: profile.employeeNo,
        },
        authMode: 'password',
      })
      return
    }

    if (pathname.endsWith('/portal/bootstrap')) {
      await fulfillJson(route, {
        profile,
        biddingCalendar,
        lineholderSummary,
      })
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

    if (pathname.endsWith('/days-off-bids/current')) {
      await fulfillJson(route, daysOffDraft)
      return
    }

    if (pathname.endsWith('/line-bids/current')) {
      await fulfillJson(route, lineDraft)
      return
    }

    if (pathname.endsWith('/pairing-bids/current')) {
      await fulfillJson(route, pairingDraft)
      return
    }

    if (pathname.endsWith('/pairing-search/current-rules/counts')) {
      await fulfillJson(route, {
        mode: 'current_rules_counts',
        periodCode: 'Apr 2026',
        tier: 'T1',
        computedAt: '2026-07-06T00:00:00.000Z',
        summary: {
          activePropertyCount: 1,
          allRules: {
            pairingIdCount: 0,
            totalItems: 0,
          },
        },
        rows: [
          {
            propertyGroupKey: 'existing-pairing-long-property-name',
            rowSeq: 1,
            propertyCode: 131,
            name: 'Prefer Pairing With Deadhead Duty In Operating Window',
            rule: {
              pairingIdCount: 0,
              totalItems: 0,
            },
            funnel: {
              pairingIdCount: 0,
              totalItems: 0,
            },
          },
        ],
      })
      return
    }

    if (pathname.endsWith('/pairing-bids/reference-options')) {
      await fulfillJson(route, {
        pairingTypes: [],
        layoverCities: [],
        airports: [],
      })
      return
    }

    throw new Error(`Unexpected PBS API request in existing-property-name-wrap spec: ${pathname}`)
  })
}

test.describe('PBS Portal existing property name wrapping', () => {
  test.beforeEach(async ({ page }) => {
    await mockPortalApi(page)
  })

  test('wraps long property names in Days Off, Line, and Pairing existing rows', async ({ page }) => {
    await page.goto('days-off')
    await expect(page.getByText('EXISTING DAYS OFF PROPERTIES')).toBeVisible()
    const daysOffRow = page.getByTestId('rule-bid-existing-row')
    const daysOffName = daysOffRow.getByText('Long Stretch Off / Compressed Flying')
    await expect(daysOffName).toHaveClass(/whitespace-normal/)
    await expect(daysOffName).toHaveClass(/break-words/)
    await expect(daysOffName).not.toHaveClass(/truncate/)

    await page.goto('line')
    await expect(page.getByText('EXISTING LINE PROPERTIES')).toBeVisible()
    const lineRow = page.getByTestId('rule-bid-existing-row')
    const lineName = lineRow.getByText('Clear Schedule and Start Next Bid Group')
    await expect(lineName).toHaveClass(/whitespace-normal/)
    await expect(lineName).toHaveClass(/break-words/)
    await expect(lineName).not.toHaveClass(/truncate/)

    await page.goto('pairing')
    await expect(page.getByText('EXISTING PAIRING PROPERTIES')).toBeVisible()
    const pairingRow = page.getByTestId('pairing-property-row-existing-pairing-long-property-name')
    const pairingName = pairingRow.getByText('Prefer Pairing With Deadhead Duty In Operating Window')
    await expect(pairingName).toHaveClass(/whitespace-normal/)
    await expect(pairingName).toHaveClass(/break-words/)
    await expect(pairingName).not.toHaveClass(/truncate/)
    await expect(pairingRow.getByTestId('pairing-property-actions-existing-pairing-long-property-name')).toBeVisible()
  })
})
