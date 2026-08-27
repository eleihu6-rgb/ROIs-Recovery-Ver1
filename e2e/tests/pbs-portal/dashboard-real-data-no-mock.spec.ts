import { expect, test, type Page, type Route } from '@playwright/test'

const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const mockDashboardRealDataApis = async (page: Page) => {
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
        fleet: ['737', '7M8'],
        languages: ['EN 5', 'FR'],
        seniorityLabel: '646',
        statusLabel: null,
        existingCreditLabel: '75.5',
        trainingMonthLabel: null,
        lastLoginLabel: 'Apr 01, 19:30',
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
        preAssignments: {
          totalDuties: 8,
          daysTouched: 8,
          categories: [
            { code: 'PAIRING', label: 'Pairing', count: 5 },
            { code: 'DAYS_OFF', label: 'Days Off', count: 3 },
          ],
          details: [
            {
              id: 'pairing:9001',
              type: 'pairing',
              code: 'PAIRING',
              label: 'T4501',
              startDate: '2026-04-06',
              endDate: '2026-04-06',
              timeText: '06:00-15:00',
            },
            {
              id: 'ground:do',
              type: 'ground',
              code: 'DO',
              label: 'Days Off',
              startDate: '2026-04-10',
              endDate: '2026-04-10',
              timeText: null,
            },
            {
              id: 'pairing:9002',
              type: 'pairing',
              code: 'PAIRING',
              label: 'T4502',
              startDate: '2026-04-11',
              endDate: '2026-04-11',
              timeText: '07:00-16:00',
            },
            {
              id: 'ground:do-2',
              type: 'ground',
              code: 'DO',
              label: 'Days Off',
              startDate: '2026-04-12',
              endDate: '2026-04-12',
              timeText: null,
            },
            {
              id: 'pairing:9003',
              type: 'pairing',
              code: 'PAIRING',
              label: 'T4503',
              startDate: '2026-04-13',
              endDate: '2026-04-13',
              timeText: '08:00-17:00',
            },
            {
              id: 'ground:do-3',
              type: 'ground',
              code: 'DO',
              label: 'Days Off',
              startDate: '2026-04-14',
              endDate: '2026-04-14',
              timeText: null,
            },
            {
              id: 'pairing:9004',
              type: 'pairing',
              code: 'PAIRING',
              label: 'T4504',
              startDate: '2026-04-15',
              endDate: '2026-04-15',
              timeText: '09:00-18:00',
            },
            {
              id: 'pairing:9005',
              type: 'pairing',
              code: 'PAIRING',
              label: 'T4505',
              startDate: '2026-04-16',
              endDate: '2026-04-16',
              timeText: '10:00-19:00',
            },
          ],
        },
        fleetItems: [{ fleet: '737', subFleet: null, pairingCount: 24 }],
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
        rosterPeriodId: 42,
        rosterPeriodKey: '2026RP04',
        periodCode: 'Apr 2026',
        filiale: 'F8',
        division: 'C',
        status: 'OPEN',
        computedStage: 'OPEN',
        bidOpenAt: '2026-04-01T00:00:00.000Z',
        bidCloseAt: '2026-04-08T23:59:00.000Z',
        base: 'YVR',
        zoneId: 'America/Vancouver',
        timezoneLabel: 'YVR Local Time',
        rpStartLocal: '2026-04-01',
        rpEndLocal: '2026-04-30',
        canEditBid: true,
        readOnlyReason: null,
      },
      activeTierRange: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
      events: [
        {
          id: 'day-off-2026-04-05',
          type: 'prefer_off_bid',
          tier: 'T1',
          label: 'Off',
          startDate: '2026-04-05',
          endDate: '2026-04-05',
          tone: 'green',
          source: 'pbs_bid_group',
          readonly: false,
        },
      ],
    })
  })
}

test.use({
  storageState: { cookies: [], origins: [] },
})

test('PBS-3060 — Dashboard renders real summary and calendar data without legacy mock values', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockDashboardRealDataApis(page)

  await page.goto('dashboard')

  await expect(page.getByRole('heading', { name: 'Alex Crew' })).toBeVisible()
  await expect(page.getByText('alex.crew@example.com')).toBeVisible()
  await expect(page.getByText('Apr 01, 00:00', { exact: true })).toBeVisible()
  await expect(page.getByText('Apr 08, 23:59', { exact: true })).toBeVisible()
  await expect(page.getByText('Apr 01, 19:30', { exact: true })).toBeVisible()
  await expect(page.getByText('6 DAYS 11 HRS', { exact: true })).toBeVisible()
  await expect(page.getByText('6 DAYS 11 HRS 59 MINS', { exact: true })).toHaveCount(0)
  await expect(page.getByText('147', { exact: true })).toHaveCount(0)
  await expect(page.getByText('TARGETED LINE', { exact: true })).toHaveCount(0)
  await expect(page.getByText('TOTAL BIDDER', { exact: true })).toHaveCount(0)
  await expect(page.getByText('TARGETED RESERVE', { exact: true })).toHaveCount(0)
  for (const userInfoLabel of ['EXISTING CREDIT', 'TRAINING MONTH', 'LAST LOGIN']) {
    const labelCell = page.getByText(userInfoLabel, { exact: true })
    await expect(labelCell).toBeVisible()
    await expect(labelCell).toHaveCSS('white-space', 'nowrap')
  }
  await expect(page.getByRole('heading', { name: 'Pre-assigned Duties' })).toBeVisible()
  await expect(page.getByText('8 days')).toBeVisible()
  await expect(page.getByText('Pairing', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Days Off', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Duty Details', { exact: true })).toBeVisible()
  await expect(page.getByText('T4501')).toBeVisible()
  await expect(page.getByText('Apr 06')).toBeVisible()
  const dutyDetails = page.getByRole('list', { name: 'Pre-assigned duty details' })
  await expect(dutyDetails).toHaveCSS('overflow-y', 'auto')
  await dutyDetails.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByText('T4505')).toBeVisible()
  await expect(page.getByText('Bid Package', { exact: true })).toHaveCount(0)
  await expect(page.getByText('24 pairings', { exact: true })).toHaveCount(0)
  await expect(page.getByText('BASE LINE AVERAGE: -')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'APR 2026' })).toBeVisible()
  await expect(page.getByText('STATUS', { exact: true })).toHaveCount(0)

  for (const staleValue of [
    'Emma Li@rois-tech.com',
    'FRI DEC 21 2024 12:00 PM',
    'NOV 2025',
    'LAX',
    '646/2132',
    '78:16',
    'F80001',
  ]) {
    await expect(page.getByText(staleValue, { exact: true })).toHaveCount(0)
  }
})
