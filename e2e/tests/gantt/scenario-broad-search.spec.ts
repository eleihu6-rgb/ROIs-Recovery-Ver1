import { test, expect } from '@playwright/test'
import { gotoScenarioList } from '../../pages/gantt/scenario-nav'
import { seedGanttAuth } from '../../utils/gantt-hook'

const MATCHED_SCENARIO = {
  id: 577,
  name: 'Qiang roster recovery',
  fileType: 'RO',
  status: 'DONE',
  strDtLoc: '2026-06-01',
  endDtLoc: '2026-06-30',
  optimizedCount: 12,
  leadinLive: 1,
  updatedBy: 'qiang',
  updatedByName: 'Qiang Chen',
  updatedAt: '2026-06-26T00:00:00.000Z',
}

test.describe('Scenario broad search', () => {
  test('Scen-2035 — partial scenario id search uses backend search and renders the matched row', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    let sawSearch577 = false
    await page.route(/\/api\/scenario(\?|$)/, (route) => {
      const url = new URL(route.request().url())
      const search = url.searchParams.get('search')
      sawSearch577 ||= search === '577'

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'ok',
          data: {
            items: search === '577' ? [MATCHED_SCENARIO] : [],
            total: search === '577' ? 1 : 0,
            page: 1,
            pageSize: 20,
            totalPages: search === '577' ? 1 : 0,
          },
        }),
      })
    })

    await page.goto('/altair/')
    await page.waitForLoadState('networkidle')
    await gotoScenarioList(page)

    await page.getByPlaceholder('Search scenarios…').fill('577')
    const row = page.getByTestId('scenario-list-item').filter({
      has: page.getByTestId('scenario-item-id').getByText('577', { exact: true }),
    })

    await expect(row).toBeVisible()
    expect(sawSearch577, 'scenario list request should use search=577').toBe(true)
  })
})
