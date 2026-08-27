import { test, expect } from '@playwright/test'
import { gotoScenarioList } from '../../pages/gantt/scenario-nav'
import { seedScenarioListMocks } from '../../utils/gantt-hook'

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
})

test('Crew Bids Viewer searches by rosterPeriodId instead of periodCode', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({
        user: { userCode: 'admin', userName: 'Admin User', schema: 'f8', isAdmin: 1 },
        token: 'mock-token',
      }),
    )
  })
  await seedScenarioListMocks(page)
  await page.route('**/api/auth/me', (route) =>
    route.fulfill(ok({
      user: { userCode: 'admin', userName: 'Admin User', schema: 'f8', isAdmin: 1 },
      menus: ['ROOT'],
      ctrls: {},
      dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
    })))
  await page.route('**/api/public/config', (route) =>
    route.fulfill(ok({
      airline: 'F8',
      timezone: 'UTC',
      language: 'en',
      theme: 'light',
      dateFormat: 'YYYY-MM-DD',
    })))

  await page.route((url) => url.pathname === '/altair/live/api/roster-periods', (route) =>
    route.fulfill(ok({
      maxSpan: 6,
      loadMoreCount: 12,
      hasMore: false,
      items: [
        {
          id: 6,
          rosterPeriod: '2026RP06',
          name: '2026-06',
          rpStart: '2026-06-01',
          rpEnd: '2026-06-30',
          pbsPeriodCode: 'Jun 2026',
          isCurrent: true,
        },
      ],
    })))
  await page.route((url) => url.pathname === '/altair/live/api/base', (route) =>
    route.fulfill(ok([{ id: 1, base: 'YYZ', name: 'Toronto', displayOrder: 1 }])))
  await page.route((url) => url.pathname === '/altair/live/api/rank', (route) =>
    route.fulfill(ok([{ id: 1, rank: 'IFD', division: 'C', description: 'In-flight Director', displayOrder: 1 }])))

  let crewBidsRequestUrl = ''
  await page.route((url) => url.pathname === '/altair/live/api/pbs/crew-bids', (route) => {
    crewBidsRequestUrl = route.request().url()
    return route.fulfill(ok({
      rows: [{
        crewId: 'B79185',
        crewName: 'Mary Nasso',
        seniorityNum: 1,
        base: 'YYZ',
        rank: 'IFD',
        periodCode: 'Jun 2026',
        bidContext: 'Current',
        bidStatus: 'SUBMITTED',
        totalTiers: 1,
        submittedAt: '2026-05-08T14:00:00.000Z',
        bidTypes: [{
          bidType: 'Pairing',
          groupCount: 1,
          appliedTiers: [1],
          groupDetails: [{
            tier: 1,
            groupSeq: 1,
            actionId: 1,
            propertyName: 'Pairing Number',
            operator: 'In',
            paramA: 'V4102',
            paramB: '2026-06-02',
            limitN: null,
            allOrNothing: null,
            minimumN: null,
          }],
        }],
      }],
      total: 1,
    }))
  })

  await page.goto('/altair/')
  await gotoScenarioList(page)
  await page.getByTestId('scenario-nav-crew-bids').click()

  await expect(page.getByTestId('crew-bids-rp-period')).toContainText('2026RP06')
  await expect(page.locator('input[value="2026-06-01"]')).toBeVisible()
  await expect(page.locator('input[value="2026-06-30"]')).toBeVisible()

  await page.getByRole('button', { name: 'Search' }).click()

  await expect(page.getByText('B79185')).toBeVisible()
  await expect(page.getByText('Mary Nasso')).toBeVisible()
  await expect(page.getByText('Error loading data')).toHaveCount(0)

  const url = new URL(crewBidsRequestUrl)
  expect(url.searchParams.get('rosterPeriodId')).toBe('6')
  expect(url.searchParams.has('periodCode')).toBe(false)
})
