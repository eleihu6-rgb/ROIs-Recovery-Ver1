import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { gotoScenarioList } from '../../pages/gantt/scenario-nav'
import {
  applyFilterLight,
  counts,
  openFilter,
  seedGanttAuth,
  selectDropdownOption,
} from '../../utils/gantt-hook'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'
const WARNING = 'Invalid rank for selected division. Use P with CA/FO, or C with FA/IFD.'

const login = async (request: APIRequestContext) => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: GANTT_USER, password: GANTT_PASS },
  })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  return (await res.json()).data as { token: string; userCode: string; userName: string; schema: string }
}

const optionVisible = async (page: Page, testId: string, value: string): Promise<boolean> => {
  await page.getByTestId(`${testId}-trigger`).click()
  const visible = await page.getByTestId(`${testId}-opt-${value}`).isVisible({ timeout: 2_000 }).catch(() => false)
  await page.getByTestId('filter-tab-pairing').click()
  return visible
}

const openFirstDoneScenario = async (page: Page): Promise<void> => {
  await page.goto('/altair/')
  await gotoScenarioList(page)
  await page.getByTestId('scenario-nav-ro').click()
  await expect(page.getByTestId('scenario-list-item').first()).toBeVisible({ timeout: 30_000 })

  const doneRow = page.getByTestId('scenario-list-item').filter({
    has: page.locator('[aria-label="Scenario status: Done"]'),
  }).first()
  const doneCount = await doneRow.count()
  test.skip(doneCount === 0, 'no DONE scenario with optimization result is visible in the current environment')

  await doneRow.click()
  const detail = page.getByTestId('scenario-detail-panel')
  await expect(detail).toBeVisible()
  await expect(detail.getByTestId('scenario-status-badge')).toHaveText(/Done/i)
  await expect(detail.getByTestId('scenario-open-btn')).toBeEnabled({ timeout: 10_000 })
  await detail.getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 90_000 })
}

test.describe('Pairing rank filter', () => {
  test('Live-1501 — selects pilot and cabin ranks with Open/Partial coverage', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectPairingPaneVisible()
    await expect.poll(async () => (await counts(page)).pairing, { timeout: 30_000 }).toBeGreaterThan(0)

    await openFilter(page, 'pairing')
    const hasCa = await optionVisible(page, 'filter-pairing-rank', 'CA')
    const hasIfd = await optionVisible(page, 'filter-pairing-rank', 'IFD')
    test.skip(!hasCa || !hasIfd, 'rank reference options CA and IFD are not both visible in current environment')

    await selectDropdownOption(page, 'filter-pairing-rank', 'CA', 'pairing')
    await selectDropdownOption(page, 'filter-pairing-rank', 'IFD', 'pairing')
    await expect(page.getByTestId('filter-pairing-rank-warning')).toHaveCount(0)
    await applyFilterLight(page)

    await expect(dashboard.pairingPane.locator('[data-testid="pane-filter-chip"][title="Rank: CA"]')).toHaveCount(1)
    await expect(dashboard.pairingPane.locator('[data-testid="pane-filter-chip"][title="Rank: IFD"]')).toHaveCount(1)
    await expect(dashboard.pairingPane.locator('[data-testid="pane-filter-chip"][title="Coverage: Open, Partial"]')).toHaveCount(1)
  })

  test('Live-1502 — invalid Pairing Division/Rank selection warns without clearing chips', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectPairingPaneVisible()

    await openFilter(page, 'pairing')
    await page.getByTestId('filter-pairing-division-C').click()
    const hasCa = await optionVisible(page, 'filter-pairing-rank', 'CA')
    test.skip(!hasCa, 'rank reference option CA is not visible in current environment')

    await selectDropdownOption(page, 'filter-pairing-rank', 'CA', 'pairing')
    await expect(page.getByTestId('filter-pairing-rank-warning')).toHaveText(WARNING)
    await applyFilterLight(page)

    await expect(dashboard.pairingPane.locator('[data-testid="pane-filter-chip"][title="Division: C"]')).toHaveCount(1)
    await expect(dashboard.pairingPane.locator('[data-testid="pane-filter-chip"][title="Rank: CA"]')).toHaveCount(1)
  })

  test('Scen-2501 — DONE optimization result exposes the same Pairing Rank selector', async ({ page, request }) => {
    const auth = await login(request)
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)

    await openFirstDoneScenario(page)
    const buttons = page.getByTestId('pane-filter-button')
    const filterBtn = (await buttons.count()) >= 2 ? buttons.nth(1) : buttons.first()
    await filterBtn.click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('filter-tab-pairing')).toHaveAttribute('data-active', 'true')
    await expect(page.getByTestId('filter-pairing-rank-trigger')).toBeVisible()
  })
})
