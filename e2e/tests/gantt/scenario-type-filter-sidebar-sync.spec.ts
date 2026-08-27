/**
 * Scenario Type filter ↔ left sidebar sync (no TO option).
 *
 * Scen-Type-1 — Type dropdown has no TO and drives sidebar
 * Scen-Type-2 — sidebar PO → Type select shows PO
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario — Type filter sidebar sync', () => {
  test.beforeEach(async ({ page, request }) => {
    const res = await request.post(`${GANTT_API}/api/auth/login`, {
      data: { userCode: GANTT_USER, password: GANTT_PASS },
    })
    expect(res.ok()).toBeTruthy()
    const json = (await res.json()) as {
      data: { token: string; userCode: string; userName: string; schema: string }
    }
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({
          user: { userCode: a.userCode, userName: a.userName, schema: a.schema },
          token: a.token,
        }),
      )
    }, json.data)
  })

  test('Scen-Type-1 — Type dropdown has no TO and drives sidebar', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()

    const typeFilter = page.getByTestId('scenario-type-filter')
    await expect(typeFilter).toBeVisible()

    await typeFilter.click()
    await expect(page.getByRole('option', { name: 'TO', exact: true })).toHaveCount(0)
    await expect(page.getByRole('option', { name: 'PO', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: 'RO', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: 'All Types', exact: true })).toBeVisible()

    await page.getByRole('option', { name: 'PO', exact: true }).click()
    await expect(typeFilter).toContainText('PO')
    await expect(page.getByTestId('scenario-nav-po')).toBeVisible()

    await typeFilter.click()
    await page.getByRole('option', { name: 'RO', exact: true }).click()
    await expect(typeFilter).toContainText('RO')
    await expect(page.getByTestId('scenario-nav-ro')).toBeVisible()

    await typeFilter.click()
    await page.getByRole('option', { name: 'All Types', exact: true }).click()
    await expect(typeFilter).toContainText('All Types')
    await expect(page.getByTestId('scenario-nav-all')).toBeVisible()
  })

  test('Scen-Type-2 — sidebar PO sets Type filter to PO', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await page.getByTestId('scenario-nav-po').click()
    await expect(page.getByTestId('scenario-type-filter')).toContainText('PO')
  })
})
