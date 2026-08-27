/**
 * Scenario Gantt — Open Read-Only.
 *
 * Proves that clicking "Open scenario" on a DONE RO scenario opens a
 * Scenario Gantt view with the correct scenario name and toolbar.
 * The Live Gantt tab is NOT switched to (the Open button no longer calls
 * setModule('live')).
 *
 * Auth is seeded into sessionStorage the same way as scenario-create.spec.ts
 * and scenario-detail-toolbar.spec.ts.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage, type RoScenarioInput } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario Gantt — open read-only', () => {
  const unique = `${Date.now()}`
  const input: RoScenarioInput = {
    name: `RO-GanttOpen-${unique}`,
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    crewBase: 'YEG',
    division: 'Pilots',
  }

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

  const findScenarioId = async (request: import('@playwright/test').APIRequestContext): Promise<number> => {
    const res = await request.get(`${GANTT_API}/api/scenario`, {
      params: { page: 1, pageSize: 50, fileType: 'RO', name: input.name },
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBeTruthy()
    const { data } = (await res.json()) as { data: { items: Array<{ id: number }> } }
    expect(data.items.length, 'created scenario should be listed').toBeGreaterThan(0)
    return data.items[0].id
  }

  const transition = async (
    request: import('@playwright/test').APIRequestContext,
    id: number,
    status: string,
  ): Promise<void> => {
    const res = await request.post(`${GANTT_API}/api/scenario/${id}/transition`, {
      data: { status },
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `transition -> ${status} failed: ${res.status()}`).toBeTruthy()
  }

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

  // Self-clean: delete every scenario this test created.
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

  test('Scen-2013 — Open scenario button opens a Scenario Gantt view (not Live)', async ({ page, request }) => {
    const scenario = new ScenarioPage(page)

    // ── Step 1 — create a fresh DRAFT RO scenario; it auto-selects + opens detail.
    await scenario.gotoRo()
    await scenario.createRoScenario(input)
    await expect(scenario.detailPanel).toBeVisible()

    // ── Step 2 — drive DRAFT → RUNNING → DONE via API (real optimization won't
    //    run in test, so we force the status to simulate a completed scenario).
    const id = await findScenarioId(request)
    await transition(request, id, 'RUNNING')
    await transition(request, id, 'DONE')

    // ── Step 3 — reload + re-navigate so the UI reflects DONE.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await scenario.gotoRo()
    await scenario.listItemByName(input.name).click()
    await expect(scenario.detailPanel).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-status-badge')).toHaveText('Done')

    // ── Step 4 — click the Open scenario icon button in the detail header.
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()

    // ── Step 5 — the Scenario Gantt view should mount. The duplicate scenario
    //    name is no longer shown in the toolbar; the top Scenario dropdown owns it.
    const ganttView = page.getByTestId('scenario-gantt-view')
    await expect(ganttView).toBeVisible({ timeout: 10_000 })

    const toolbar = ganttView.getByTestId('scenario-gantt-toolbar')
    await expect(toolbar).toBeVisible()

    await expect(toolbar.getByTestId('sg-scenario-name')).toHaveCount(0)
    await expect(page.getByTestId('module-nav-scenario')).toContainText(input.name)

    // ── Step 6 — the Live Gantt view was NOT switched to.  We verify by checking
    //    that the module-nav-live button does NOT carry the active class.
    //    (In ShellTopNav the active tab gets class "bg-accent".)
    await expect(page.getByTestId('module-nav-live')).not.toHaveClass(/bg-accent/)
  })
})
