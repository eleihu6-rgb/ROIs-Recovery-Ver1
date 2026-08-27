/**
 * PO Basic Info — Division (required) + Bases (optional multi-select).
 *
 * Proves:
 *   Scen-PO-Div-1 — new PO shows Division default P and Bases control
 *   Scen-PO-Div-2 — set Division + Bases → Save → re-open still has values
 *   Scen-RO-Div-1 — RO Crew Division has no All option
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario — PO Basic Info Division / Bases', () => {
  const poName = `PO-DivBases-${Date.now()}`
  let token = ''

  const login = async (request: import('@playwright/test').APIRequestContext) => {
    const res = await request.post(`${GANTT_API}/api/auth/login`, {
      data: { userCode: GANTT_USER, password: GANTT_PASS },
    })
    expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
    const json = (await res.json()) as {
      data: { token: string; userCode: string; userName: string; schema: string }
    }
    return json.data
  }

  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    token = auth.token
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({
          user: { userCode: a.userCode, userName: a.userName, schema: a.schema },
          token: a.token,
        }),
      )
    }, auth)
  })

  test.afterEach(async ({ request }) => {
    for (const fileType of ['PO', 'RO'] as const) {
      const listRes = await request.get(`${GANTT_API}/api/scenario`, {
        params: { page: 1, pageSize: 50, fileType, search: poName },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!listRes.ok()) continue
      const { data } = (await listRes.json()) as { data: { items: Array<{ id: number; name: string }> } }
      for (const item of data.items) {
        if (!item.name.includes('PO-DivBases') && !item.name.includes('RO-DivNoAll')) continue
        await request.delete(`${GANTT_API}/api/scenario/${item.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }
    }
  })

  test('Scen-PO-Div-1 — new PO shows Division (default P) and Bases multi-select', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoPo()
    await scenario.newButton.click()
    await expect(scenario.detailPanel).toBeVisible()
    await expect(scenario.typeBadge).toHaveText('PO')

    await expect(scenario.poDivisionSelect).toBeVisible()
    await expect(scenario.poBases).toBeVisible()
    // Default division is P (code or label containing P / Pilot)
    await expect(scenario.poDivisionSelect).toContainText(/P|Pilot|飞行员/i)
    await expect(scenario.poBases).toContainText(/All bases/i)
  })

  test('Scen-PO-Div-2 — Division + Bases persist after Save and re-open', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoPo()

    await scenario.createPoScenario({
      name: poName,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      division: 'C',
      base: 'YEG',
    })

    // Re-select from list to prove server persistence
    await scenario.listItemByName(poName).click()
    await expect(scenario.detailPanel).toBeVisible()
    await expect(scenario.nameInput).toHaveValue(poName)
    await expect(scenario.poDivisionSelect).toContainText(/C|Cabin|客舱/i)
    await expect(scenario.poBases).toContainText('YEG')
  })

  test('Scen-RO-Div-1 — RO Crew Division has no All option', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await scenario.newButton.click()
    await expect(scenario.detailPanel).toBeVisible()
    await expect(scenario.divisionSelect).toBeVisible()

    await scenario.divisionSelect.click()
    const allOption = page.getByRole('option', { name: 'All', exact: true })
    await expect(allOption).toHaveCount(0)
    // Close the list
    await page.keyboard.press('Escape')
  })
})
