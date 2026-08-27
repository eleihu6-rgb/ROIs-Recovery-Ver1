/**
 * Gantt Scenario Creation Tests.
 *
 * Validates the RO (Roster Optimization) scenario creation flow end-to-end:
 *   - create a new RO scenario,
 *   - set date range (May 2026), crew base (YEG) and crew division
 *     (Pilots == CA + FO ranks),
 *   - save it (PUT /api/scenario/:id),
 *   - assert it is persisted and rendered in both the detail panel and the
 *     RO scenario list — including after a full page reload.
 *
 * Auth is inherited from gantt-setup (storageState).
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage, type RoScenarioInput } from '../../pages/gantt/scenario-page'
import { formatUiDateRange } from '../../../packages/ui/src/lib/format-date'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario — RO creation', () => {
  // Unique name so list assertions target exactly the scenario created here.
  // (The numeric suffix is only a per-run uniqueness token — NOT the DB id.)
  const unique = `${Date.now()}`
  const input: RoScenarioInput = {
    name: `RO-YEG-May2026-${unique}`,
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    crewBase: 'YEG',
    division: 'Pilots', // CA + FO are the pilot ranks
  }
  // UI date standard: "May 1 – May 31, 2026"
  const dateRangeText = formatUiDateRange(input.startDate, input.endDate)

  let token = ''

  const login = async (request: import('@playwright/test').APIRequestContext) => {
    const res = await request.post(`${GANTT_API}/api/auth/login`, {
      data: { userCode: GANTT_USER, password: GANTT_PASS },
    })
    expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
    // live-server wraps responses: { code, data: { token, ... }, message }
    const json = (await res.json()) as { data: { token: string; userCode: string; userName: string; schema: string } }
    return json.data
  }

  // Gantt auth lives in per-tab sessionStorage ('rois-auth'), which Playwright
  // storageState cannot persist. Seed it via addInitScript so it is present on
  // every navigation AND survives page.reload().
  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    token = auth.token
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)
  })

  // Self-clean: delete every scenario this test created so the run is
  // idempotent and does not leave throwaway scenarios in the database.
  test.afterEach(async ({ request }) => {
    const listRes = await request.get(`${GANTT_API}/api/scenario`, {
      params: { page: 1, pageSize: 50, fileType: 'RO', name: input.name },
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!listRes.ok()) return
    const { data } = (await listRes.json()) as { data: { items: Array<{ id: number }> } }
    for (const item of data.items) {
      await request.delete(`${GANTT_API}/api/scenario/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  })

  test('Scen-2008 — creates an RO scenario (May 2026, base YEG, Pilots) and persists it', async ({ page }) => {
    const scenario = new ScenarioPage(page)

    // Step 1 — navigate to the RO section and create + fill + save.
    await scenario.gotoRo()
    await scenario.createRoScenario(input)

    // Step 2 — detail panel reflects everything we entered.
    await scenario.expectDetailMatches(input)

    // Step 3 — the new scenario shows up in the RO list with the right
    // type badge and date range (and exactly once, by unique name).
    const listItem = scenario.listItemByName(input.name)
    await expect(listItem).toHaveCount(1)
    await expect(listItem).toContainText('RO')
    await expect(listItem).toContainText(dateRangeText)

    // Step 4 — persistence proof: full reload, re-navigate, reopen, re-check.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await scenario.gotoRo()

    const reloadedItem = scenario.listItemByName(input.name)
    await expect(reloadedItem).toHaveCount(1)
    await expect(reloadedItem).toContainText(dateRangeText)

    await reloadedItem.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.expectDetailMatches(input)
  })
})
