/**
 * Scenario Duplicate E2E Tests.
 *
 * Verifies that clicking Duplicate from the scenario three-dot menu:
 *   - creates a new DRAFT scenario named "Copy of <original>"
 *   - auto-selects it and opens the detail panel
 *   - focuses / selects the name input for immediate rename
 *
 * The source scenario is created via API to keep the test focused.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API  = process.env.GANTT_API_URL  ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario — Duplicate', () => {
  const unique = `${Date.now()}`
  const sourceName  = `RO-DUP-SRC-${unique}`
  const copiedName  = `Copy of ${sourceName}`

  let token = ''

  const login = async (request: import('@playwright/test').APIRequestContext) => {
    const res = await request.post(`${GANTT_API}/api/auth/login`, {
      data: { userCode: GANTT_USER, password: GANTT_PASS },
    })
    expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
    const json = (await res.json()) as { data: { token: string; userCode: string; userName: string; schema: string } }
    return json.data
  }

  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    token = auth.token

    // Seed auth into sessionStorage for every navigation
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)

    // Create source scenario via API
    const createRes = await request.post(`${GANTT_API}/api/scenario`, {
      data: {
        name: sourceName,
        fileType: 'RO',
        strDtLoc: '2026-05-01',
        endDtLoc: '2026-05-31',
        leadinLive: 1,
        username: GANTT_USER,
      },
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(createRes.ok(), `source create failed: ${createRes.status()}`).toBeTruthy()
  })

  test.afterEach(async ({ request }) => {
    // Delete all scenarios whose name matches source or copy
    for (const nameFilter of [sourceName, copiedName]) {
      const listRes = await request.get(`${GANTT_API}/api/scenario`, {
        params: { page: 1, pageSize: 50, fileType: 'RO', name: nameFilter },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!listRes.ok()) continue
      const { data } = (await listRes.json()) as { data: { items: Array<{ id: number }> } }
      for (const item of data.items) {
        await request.delete(`${GANTT_API}/api/scenario/${item.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }
    }
  })

  test('Scen-2035 — duplicates scenario: new item appears in list with "Copy of" name and detail panel opens with name selected', async ({ page }) => {
    const scenario = new ScenarioPage(page)

    // Navigate to RO scenario list
    await scenario.gotoRo()

    // Confirm the source scenario is visible
    const sourceItem = scenario.listItemByName(sourceName)
    await expect(sourceItem).toBeVisible()

    // Open the three-dot menu for the source item and click Duplicate
    await sourceItem.hover()
    const menuTrigger = sourceItem.locator('button').last()
    await menuTrigger.click()
    await page.getByRole('menuitem', { name: 'Duplicate' }).click()

    // The copied item must appear in the list
    const copiedItem = scenario.listItemByName(copiedName)
    await expect(copiedItem).toBeVisible({ timeout: 8000 })

    // The detail panel must open and show the copied name
    await expect(scenario.detailPanel).toBeVisible()
    await expect(scenario.nameInput).toHaveValue(copiedName)

    // The name input must be focused (ready for rename)
    await expect(scenario.nameInput).toBeFocused()
  })
})
