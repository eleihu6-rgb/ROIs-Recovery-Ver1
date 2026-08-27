import { expect, test, type Page, type Route } from '@playwright/test'

const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'
const BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY = 'pbs.workbench.biddingCalendarCollapsed'
const BIDDING_CALENDAR_E2E_RESET_KEY = 'pbs.e2e.biddingCalendarStorageReset'

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const openCurrentPeriod = {
  id: 38,
  rosterPeriodId: 38,
  rosterPeriodKey: '2026RP06',
  periodCode: 'Jun 2026',
  filiale: 'F8',
  division: 'C',
  status: 'OPEN',
  computedStage: 'OPEN',
  bidOpenAt: '2026-05-01T00:00:00.000Z',
  bidCloseAt: '2026-05-08T23:59:00.000Z',
  base: null,
  zoneId: null,
  timezoneLabel: null,
  rpStartLocal: '2026-06-01',
  rpEndLocal: '2026-06-30',
  canEditBid: true,
  readOnlyReason: null,
}

const mockDashboardApis = async (
  page: Page,
  currentPeriod: Record<string, unknown> = openCurrentPeriod,
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

  await page.route('**/api/dashboard/summary', async (route) => {
    await fulfillJson(route, {
      profile: {
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
      },
      bidPackage: {
        periodCode: 'Jun 2026',
        businessNow: '2026-05-02T12:00:00.000Z',
        timezoneLabel: 'YVR Local Time',
        bidStartAt: '2026-05-01T07:00:00.000Z',
        bidCloseAt: '2026-05-09T06:59:00.000Z',
        bidStartLabel: 'May 01, 00:00',
        bidCloseLabel: 'May 08, 23:59',
        remainingLabel: '6 DAYS 11 HRS 59 MINS',
        computedStage: 'OPEN',
        targetedLine: null,
        targetedReserve: null,
        totalBidder: 147,
      },
      messageCenter: {
        title: 'MESSAGE CENTER',
        baseLineAverage: null,
        fleetItems: [{ fleet: '737', subFleet: null, pairingCount: 24 }],
        messages: [],
      },
    })
  })

  await page.route('**/api/bidding-calendar/current', async (route) => {
    await fulfillJson(route, {
      periodCode: 'Jun 2026',
      bidContext: 'Current',
      currentPeriod,
      activeTierRange: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
      dayOffCapacity: [
        {
          date: '2026-06-05',
          requestedDayOffCount: 23,
          totalCrewCount: 120,
          pairingDemandCount: 69,
          reserveDemandCount: 8,
          preAssignedDayOffCount: 10,
          maxDaysOffCount: 33,
        },
        {
          date: '2026-06-06',
          requestedDayOffCount: 33,
          totalCrewCount: 120,
          pairingDemandCount: 69,
          reserveDemandCount: 8,
          preAssignedDayOffCount: 10,
          maxDaysOffCount: 33,
        },
        {
          date: '2026-06-07',
          requestedDayOffCount: 39,
          totalCrewCount: 120,
          pairingDemandCount: 69,
          reserveDemandCount: 8,
          preAssignedDayOffCount: 10,
          maxDaysOffCount: 33,
        },
        {
          date: '2026-06-30',
          requestedDayOffCount: 46,
          totalCrewCount: 120,
          pairingDemandCount: 69,
          reserveDemandCount: 8,
          preAssignedDayOffCount: 10,
          maxDaysOffCount: 35,
        },
      ],
      events: [],
    })
  })
}

const mockDashboardLoadingApis = async (page: Page) => {
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

  await page.route('**/api/dashboard/summary', async (route) => {
    await fulfillJson(route, {
      profile: {
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
      },
      bidPackage: {
        periodCode: 'Jun 2026',
        businessNow: '2026-05-02T12:00:00.000Z',
        timezoneLabel: 'YVR Local Time',
        bidStartAt: '2026-05-01T07:00:00.000Z',
        bidCloseAt: '2026-05-09T06:59:00.000Z',
        bidStartLabel: 'May 01, 00:00',
        bidCloseLabel: 'May 08, 23:59',
        remainingLabel: '6 DAYS 11 HRS 59 MINS',
        computedStage: 'OPEN',
        targetedLine: null,
        targetedReserve: null,
        totalBidder: 147,
      },
      messageCenter: {
        title: 'MESSAGE CENTER',
        baseLineAverage: null,
        fleetItems: [{ fleet: '737', subFleet: null, pairingCount: 24 }],
        messages: [],
      },
    })
  })

  await page.route('**/api/bidding-calendar/current', async () => {
    await new Promise(() => {})
  })
}

test.use({
  storageState: { cookies: [], origins: [] },
})

test('PBS-3050 — current period status renders in the BIDDING CALENDAR header @smoke', async ({ page }) => {
  await page.addInitScript(({ authTokenKey, calendarCollapsedStorageKey, resetKey }) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
    if (window.sessionStorage.getItem(resetKey) !== 'true') {
      window.localStorage.removeItem(calendarCollapsedStorageKey)
      window.sessionStorage.setItem(resetKey, 'true')
    }
  }, {
    authTokenKey: AUTH_TOKEN_KEY,
    calendarCollapsedStorageKey: BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY,
    resetKey: BIDDING_CALENDAR_E2E_RESET_KEY,
  })
  await mockDashboardApis(page)

  await page.goto('dashboard')

  const schedulePanel = page.locator('[data-uiid="dashboard-schedule-panel"]')
  await expect(schedulePanel.getByTestId('bidding-calendar-title-strip')).toContainText('BIDDING CALENDAR')

  const currentPeriodStatus = schedulePanel.getByTestId('bidding-calendar-current-period-status')
  await expect(currentPeriodStatus).toContainText('Bidding open for Jun 2026')
  await expect(currentPeriodStatus).toContainText('Open May 01, 00:00 · Close May 08, 23:59')
  await expect(schedulePanel.getByText('May 01, 08:00')).toHaveCount(0)
  await expect(page.getByTestId('current-period-status')).toHaveCount(0)

  const availableCapacityBadge = schedulePanel.getByText('23/33')
  const fullCapacityBadge = schedulePanel.getByText('33/33')
  const overCapacityBadge = schedulePanel.getByText('39/33')

  await expect(availableCapacityBadge).toBeVisible()
  await expect(availableCapacityBadge).toHaveClass(/bg-\[\#3DC0A9\]/)
  await expect(availableCapacityBadge).not.toHaveAttribute('title', /.+/)
  await expect(fullCapacityBadge).toBeVisible()
  await expect(fullCapacityBadge).toHaveClass(/bg-\[\#F5B507\]/)
  await expect(overCapacityBadge).toBeVisible()
  await expect(overCapacityBadge).toHaveClass(/bg-\[\#D94C4C\]/)
})

test('PBS-3054 — not-open status uses base local time instead of raw ISO read-only reason', async ({ page }) => {
  await page.addInitScript(({ authTokenKey, calendarCollapsedStorageKey, resetKey }) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
    if (window.sessionStorage.getItem(resetKey) !== 'true') {
      window.localStorage.removeItem(calendarCollapsedStorageKey)
      window.sessionStorage.setItem(resetKey, 'true')
    }
  }, {
    authTokenKey: AUTH_TOKEN_KEY,
    calendarCollapsedStorageKey: BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY,
    resetKey: BIDDING_CALENDAR_E2E_RESET_KEY,
  })
  await mockDashboardApis(page, {
    ...openCurrentPeriod,
    periodCode: 'Oct 2026',
    rosterPeriodKey: '2026RP10',
    status: 'DRAFT',
    computedStage: 'NOT_OPEN',
    bidOpenAt: '2026-09-04T04:00:00.000Z',
    bidCloseAt: '2026-09-14T03:59:00.000Z',
    base: 'YYZ',
    zoneId: 'America/Toronto',
    timezoneLabel: 'YYZ Local Time',
    rpStartLocal: '2026-10-01',
    rpEndLocal: '2026-10-31',
    canEditBid: false,
    readOnlyReason: 'Bidding opens at 2026-09-04T04:00:00.000Z.',
  })

  await page.goto('dashboard')

  const currentPeriodStatus = page
    .locator('[data-uiid="dashboard-schedule-panel"]')
    .getByTestId('bidding-calendar-current-period-status')

  await expect(currentPeriodStatus).toContainText('Bidding not open for Oct 2026')
  await expect(currentPeriodStatus).toContainText('Bidding opens at Sep 04, 00:00 · YYZ Local Time')
  await expect(currentPeriodStatus).not.toContainText(/\.000Z|T04:00:00\.000Z/)
})

test('PBS-3055 — closed status uses base local time instead of raw ISO read-only reason', async ({ page }) => {
  await page.addInitScript(({ authTokenKey, calendarCollapsedStorageKey, resetKey }) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
    if (window.sessionStorage.getItem(resetKey) !== 'true') {
      window.localStorage.removeItem(calendarCollapsedStorageKey)
      window.sessionStorage.setItem(resetKey, 'true')
    }
  }, {
    authTokenKey: AUTH_TOKEN_KEY,
    calendarCollapsedStorageKey: BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY,
    resetKey: BIDDING_CALENDAR_E2E_RESET_KEY,
  })
  await mockDashboardApis(page, {
    ...openCurrentPeriod,
    periodCode: 'Oct 2026',
    rosterPeriodKey: '2026RP10',
    status: 'CLOSED',
    computedStage: 'CLOSED',
    bidOpenAt: '2026-09-04T04:00:00.000Z',
    bidCloseAt: '2026-09-14T03:59:00.000Z',
    base: 'YYZ',
    zoneId: 'America/Toronto',
    timezoneLabel: 'YYZ Local Time',
    rpStartLocal: '2026-10-01',
    rpEndLocal: '2026-10-31',
    canEditBid: false,
    readOnlyReason: 'Bidding closed at 2026-09-14T03:59:00.000Z.',
  })

  await page.goto('dashboard')

  const currentPeriodStatus = page
    .locator('[data-uiid="dashboard-schedule-panel"]')
    .getByTestId('bidding-calendar-current-period-status')

  await expect(currentPeriodStatus).toContainText('Bidding closed for Oct 2026')
  await expect(currentPeriodStatus).toContainText('Bidding closed at Sep 13, 23:59 · YYZ Local Time')
  await expect(currentPeriodStatus).not.toContainText(/\.000Z|T03:59:00\.000Z/)
})

test('PBS-3051 — dashboard calendar stays fixed and ignores collapsed workbench preference', async ({ page }) => {
  await page.addInitScript(({ authTokenKey, calendarCollapsedStorageKey, resetKey }) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
    window.localStorage.setItem(calendarCollapsedStorageKey, 'true')
    window.sessionStorage.setItem(resetKey, 'true')
  }, {
    authTokenKey: AUTH_TOKEN_KEY,
    calendarCollapsedStorageKey: BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY,
    resetKey: BIDDING_CALENDAR_E2E_RESET_KEY,
  })
  await mockDashboardApis(page)

  await page.goto('dashboard')

  const layout = page.getByTestId('dashboard-layout')
  const schedulePanel = page.locator('[data-uiid="dashboard-schedule-panel"]')

  await expect(schedulePanel.getByTestId('bidding-calendar-title-strip')).toContainText('BIDDING CALENDAR')
  await expect(schedulePanel.getByTestId('bidding-calendar-current-period-status')).toContainText('Bidding open for Jun 2026')
  await expect(page.getByRole('button', { name: 'Collapse bidding calendar' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Expand bidding calendar' })).toHaveCount(0)

  expect(await layout.getAttribute('data-calendar-collapsed')).toBeNull()

  const gridTemplateColumns = await layout.evaluate((element) => (
    window.getComputedStyle(element).gridTemplateColumns
  ))

  expect(gridTemplateColumns).toContain('436px')
  expect(gridTemplateColumns).toContain('365px')
})

test('PBS-3052 — dashboard loading calendar stays below the fixed top nav', async ({ page }) => {
  await page.addInitScript(({ authTokenKey, calendarCollapsedStorageKey, resetKey }) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
    if (window.sessionStorage.getItem(resetKey) !== 'true') {
      window.localStorage.removeItem(calendarCollapsedStorageKey)
      window.sessionStorage.setItem(resetKey, 'true')
    }
  }, {
    authTokenKey: AUTH_TOKEN_KEY,
    calendarCollapsedStorageKey: BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY,
    resetKey: BIDDING_CALENDAR_E2E_RESET_KEY,
  })
  await mockDashboardLoadingApis(page)

  await page.goto('dashboard', { waitUntil: 'domcontentloaded' })

  const loadingPanel = page.getByTestId('dashboard-schedule-panel-loading')
  await expect(loadingPanel).toBeVisible()
  await expect(loadingPanel).toContainText('Loading bidding calendar...')

  const metrics = await page.evaluate(() => {
    const header = document.querySelector('[data-testid="dashboard-top-nav"]')
    const loading = document.querySelector('[data-testid="dashboard-schedule-panel-loading"]')
    const headerRect = header?.getBoundingClientRect()
    const loadingRect = loading?.getBoundingClientRect()

    return {
      headerBottom: headerRect?.bottom ?? 0,
      loadingTop: loadingRect?.top ?? 0,
      maxScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }
  })

  expect(metrics.loadingTop).toBeGreaterThanOrEqual(metrics.headerBottom)
  expect(metrics.maxScroll).toBe(0)
})

test('PBS-3053 — dashboard schedule panel grows instead of clipping the calendar bottom', async ({ page }) => {
  await page.addInitScript(({ authTokenKey, calendarCollapsedStorageKey, resetKey }) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
    if (window.sessionStorage.getItem(resetKey) !== 'true') {
      window.localStorage.removeItem(calendarCollapsedStorageKey)
      window.sessionStorage.setItem(resetKey, 'true')
    }
  }, {
    authTokenKey: AUTH_TOKEN_KEY,
    calendarCollapsedStorageKey: BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY,
    resetKey: BIDDING_CALENDAR_E2E_RESET_KEY,
  })
  await mockDashboardApis(page)

  await page.goto('dashboard')

  const layout = page.getByTestId('dashboard-layout')
  await expect(layout).toBeVisible()

  const metrics = await layout.evaluate((layoutElement) => {
    const layout = layoutElement
    const panel = document.querySelector('[data-uiid="dashboard-schedule-panel"]')
    const layoutStyle = window.getComputedStyle(layout)
    const panelRect = panel?.getBoundingClientRect()
    const layoutRect = layout.getBoundingClientRect()

    return {
      layoutBottom: layoutRect.bottom,
      layoutOverflow: layoutStyle.overflow,
      panelBottom: panelRect?.bottom ?? 0,
      panelClientHeight: panel?.clientHeight ?? 0,
      panelScrollHeight: panel?.scrollHeight ?? 0,
    }
  })

  expect(metrics.layoutOverflow).toBe('visible')
  expect(metrics.panelClientHeight).toBeGreaterThanOrEqual(metrics.panelScrollHeight)
  expect(metrics.layoutBottom).toBeGreaterThanOrEqual(metrics.panelBottom)
})

test('PBS-3054 — dashboard calendar compacts in a short viewport without clipping the bottom row', async ({ page }) => {
  await page.addInitScript(({ authTokenKey, calendarCollapsedStorageKey, resetKey }) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
    if (window.sessionStorage.getItem(resetKey) !== 'true') {
      window.localStorage.removeItem(calendarCollapsedStorageKey)
      window.sessionStorage.setItem(resetKey, 'true')
    }
  }, {
    authTokenKey: AUTH_TOKEN_KEY,
    calendarCollapsedStorageKey: BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY,
    resetKey: BIDDING_CALENDAR_E2E_RESET_KEY,
  })
  await mockDashboardApis(page)

  await page.setViewportSize({ width: 1280, height: 650 })
  await page.goto('dashboard')

  const scrollContainer = page.getByTestId('dashboard-scroll-container')
  const schedulePanel = page.locator('[data-uiid="dashboard-schedule-panel"]')
  const bottomCapacityBadge = schedulePanel.getByText('46/35')

  await expect(scrollContainer).toBeVisible()
  await expect(schedulePanel).toHaveAttribute('data-layout-density', 'compact')
  await expect(bottomCapacityBadge).toBeVisible()

  const metrics = await page.evaluate(() => {
    const scrollContainerElement = document.querySelector('[data-testid="dashboard-scroll-container"]')
    const schedulePanelElement = document.querySelector('[data-uiid="dashboard-schedule-panel"]')
    const bottomBadge = Array.from(document.querySelectorAll('[aria-label^="Days off requests for 2026-06-30"]'))
      .at(0)
    const scrollRect = scrollContainerElement?.getBoundingClientRect()
    const panelRect = schedulePanelElement?.getBoundingClientRect()
    const badgeRect = bottomBadge?.getBoundingClientRect()

    return {
      badgeBottom: badgeRect?.bottom ?? 0,
      badgeTop: badgeRect?.top ?? 0,
      panelBottom: panelRect?.bottom ?? 0,
      scrollBottom: scrollRect?.bottom ?? 0,
      scrollMax: scrollContainerElement
        ? scrollContainerElement.scrollHeight - scrollContainerElement.clientHeight
        : -1,
      viewportHeight: window.innerHeight,
    }
  })

  expect(metrics.scrollMax).toBeLessThanOrEqual(2)
  expect(metrics.badgeTop).toBeGreaterThan(0)
  expect(metrics.badgeBottom).toBeLessThanOrEqual(metrics.scrollBottom + 1)
  expect(metrics.panelBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1)
})
