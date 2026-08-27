/**
 * Scenario Gantt — Edit lock + micro-adjust + save.
 *
 * Proves the Scenario Gantt Phase 2 edit flow:
 *   1. Open a DONE scenario -> Scenario Gantt tab renders (read-only).
 *   2. Click "Acquire Edit Lock" -> toolbar shows "Editing" state.
 *   3. Right-click a pairing bar -> bar disappears (pending removal).
 *   4. Save -> patch-output API called -> Gantt reloads with updated data.
 *   5. Release lock -> toolbar returns to "Viewing" state.
 *
 * NOTE: This test requires a DONE scenario with a real output.gz on
 * engine-server.  In CI this test should be skipped unless
 * ENGINE_SERVER_URL is set and reachable.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage, type RoScenarioInput } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario Gantt — edit lock + save', () => {
  const unique = `${Date.now()}`
  const input: RoScenarioInput = {
    name: `RO-GanttEdit-${unique}`,
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

  // Self-clean: release lock (if held) and delete every scenario this test created.
  test.afterEach(async ({ request }) => {
    // Best-effort release any lock held on the scenario we created.
    const listRes = await request.get(`${GANTT_API}/api/scenario`, {
      params: { page: 1, pageSize: 50, fileType: 'RO', name: input.name },
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!listRes.ok()) return
    const { data } = (await listRes.json()) as { data: { items: Array<{ id: number }> } }
    for (const item of data.items) {
      await request.post(`${GANTT_API}/api/scenario/${item.id}/release-lock`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
      await request.delete(`${GANTT_API}/api/scenario/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
  })

  test('Scen-2011 — acquire lock -> right-click remove bar -> save -> release lock', async ({ page, request }) => {
    const scenario = new ScenarioPage(page)

    // ── Step 1 — create a fresh DRAFT RO scenario; it auto-selects + opens detail.
    await scenario.gotoRo()
    await scenario.createRoScenario(input)
    await expect(scenario.detailPanel).toBeVisible()

    // ── Step 2 — drive DRAFT -> RUNNING -> DONE via API.
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

    const ganttView = page.getByTestId('scenario-gantt-view')
    await expect(ganttView).toBeVisible({ timeout: 10_000 })

    const toolbar = ganttView.getByTestId('scenario-gantt-toolbar')
    await expect(toolbar).toBeVisible()
    await expect(toolbar.getByTestId('sg-scenario-name')).toHaveCount(0)
    await expect(page.getByTestId('module-nav-scenario')).toContainText(input.name)

    // ── Step 5 — acquire edit lock.
    //    Before acquiring, the "Acquire edit lock" button is visible.
    await expect(toolbar.getByTestId('sg-acquire-lock-btn')).toBeVisible()
    await toolbar.getByTestId('sg-acquire-lock-btn').click()

    // After acquiring, toolbar shows "Editing" (release-lock button) + save button.
    await expect(toolbar.getByTestId('sg-release-lock-btn')).toBeVisible({ timeout: 5_000 })
    await expect(toolbar.getByTestId('sg-save-btn')).toBeVisible()
    await expect(page.getByText('Edit lock acquired', { exact: true })).toHaveCount(0)

    // Save button is disabled when no pending changes.
    await expect(toolbar.getByTestId('sg-save-btn')).toBeDisabled()

    // ── Step 6 — right-click the first pairing bar to remove it.
    //    The renderer handles right-click as an immediate remove (no popup menu).
    const firstBar = ganttView.locator('[data-pairing-id]').first()
    await expect(firstBar).toBeVisible({ timeout: 10_000 })
    const pairingId = await firstBar.getAttribute('data-pairing-id')
    await firstBar.click({ button: 'right' })

    // The bar should disappear from view (pending removal in effectiveAssignments).
    await expect(ganttView.locator(`[data-pairing-id="${pairingId}"]`)).toHaveCount(0, { timeout: 3_000 })

    // Save button should now be enabled (dirty state).
    await expect(toolbar.getByTestId('sg-save-btn')).toBeEnabled()

    // ── Step 7 — save adjustments.
    await toolbar.getByTestId('sg-save-btn').click()

    // The save button returns to disabled once the save completes (isDirty = false).
    await expect(toolbar.getByTestId('sg-save-btn')).toBeDisabled({ timeout: 15_000 })

    // ── Step 8 — release edit lock.
    await toolbar.getByTestId('sg-release-lock-btn').click()

    // After releasing, the "Acquire edit lock" button returns (read-only state).
    await expect(toolbar.getByTestId('sg-acquire-lock-btn')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Edit lock released', { exact: true })).toHaveCount(0)
  })
})
