import { expect, test, type Page, type Route } from '@playwright/test'

const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const mockDashboardApis = async (page: Page) => {
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

  await page.route('**/api/dashboard/summary', async (route) => {
    await fulfillJson(route, {
      profile: {
        id: 'u-1',
        employeeNo: 'F8001',
        name: 'Alex Crew',
        email: 'alex.crew@example.com',
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
      },
      bidPackage: {
        periodCode: 'Apr 2026',
        businessNow: '2026-04-02T12:00:00.000Z',
        timezoneLabel: 'YVR Local Time',
        bidStartAt: '2026-04-01T07:00:00.000Z',
        bidCloseAt: '2026-04-09T06:59:00.000Z',
        bidStartLabel: 'Apr 01, 00:00',
        bidCloseLabel: 'Apr 08, 23:59',
        remainingLabel: '6 DAYS 11 HRS 59 MINS',
        computedStage: 'OPEN',
        targetedLine: null,
        targetedReserve: null,
        totalBidder: 147,
      },
      messageCenter: {
        title: 'MESSAGE CENTER',
        baseLineAverage: null,
        fleetItems: [],
        messages: [],
      },
    })
  })

  await page.route('**/api/bidding-calendar/current', async (route) => {
    await fulfillJson(route, {
      periodCode: 'Apr 2026',
      bidContext: 'Current',
      currentPeriod: {
        id: 42,
        periodCode: 'Apr 2026',
        filiale: 'F8',
        division: 'C',
        status: 'OPEN',
        computedStage: 'OPEN',
        bidOpenAt: '2026-04-01T00:00:00.000Z',
        bidCloseAt: '2026-04-08T23:59:00.000Z',
        canEditBid: true,
        readOnlyReason: null,
      },
      activeTierRange: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
      events: [
        {
          id: 'pairing-bid-award-m4959',
          type: 'pairing_bid',
          tier: 'T1',
          label: 'M4959',
          startDate: '2026-04-06',
          endDate: '2026-04-08',
          tone: 'blue',
          source: 'pbs_bid_group',
          readonly: true,
          metadata: {
            actionId: 1,
            pairingNumber: 'M4959',
            pairingId: '4959001',
            originDate: '2026-04-06',
            occurrenceMode: 'specific_date',
          },
        },
        {
          id: 'pairing-bid-avoid-legacy-red',
          type: 'pairing_bid',
          tier: 'T1',
          label: 'AVOID99',
          startDate: '2026-04-10',
          endDate: '2026-04-11',
          tone: 'red',
          source: 'pbs_bid_group',
          readonly: true,
          metadata: {
            actionId: 2,
            pairingNumber: 'AVOID99',
            pairingId: '990099',
            originDate: '2026-04-10',
            occurrenceMode: 'specific_date',
          },
        },
      ],
    })
  })
}

test.use({
  storageState: { cookies: [], origins: [] },
})

test('PBS-3061 — Dashboard calendar hides Avoid pairing bid events', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockDashboardApis(page)

  await page.goto('dashboard')

  await expect(page.getByRole('heading', { name: 'APR 2026' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'View pairing bid M4959' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'View pairing bid AVOID99' })).toHaveCount(0)
  await expect(page.getByText('AVOID99', { exact: true })).toHaveCount(0)
})
