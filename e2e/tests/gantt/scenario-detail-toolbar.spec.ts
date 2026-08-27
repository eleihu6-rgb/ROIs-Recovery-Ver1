/**
 * Gantt Scenario detail-panel toolbar.
 *
 * The per-scenario actions moved from a bottom action bar to an icon-only
 * toolbar in the TOP-RIGHT of the detail panel header. This test proves:
 *   - the five icon actions render in the detail header (Save, Run, Open,
 *     Remove result, Import to Live Roster),
 *   - the OLD bottom action bar (text buttons "Run Optimization" / "Open
 *     Gantt") is gone,
 *   - each icon surfaces the correct hover tooltip (icons carry no visible
 *     label, so the tooltip is the only affordance — it must be correct),
 *   - result-dependent actions (Remove result / Import to Live) are disabled
 *     for a fresh DRAFT scenario and enabled once it reaches DONE,
 *   - the Save icon toggles enabled/disabled with the dirty state,
 *   - clicking Remove result on a DONE scenario reverts it to DRAFT (clearing
 *     the result), proving the action end-to-end.
 *
 * Auth is seeded into sessionStorage the same way as scenario-create.spec.ts.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage, type RoScenarioInput } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario — detail-panel toolbar', () => {
  const unique = `${Date.now()}`
  const input: RoScenarioInput = {
    name: `RO-Toolbar-${unique}`,
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

  const findScenarioId = async (
    request: import('@playwright/test').APIRequestContext,
    name = input.name,
  ): Promise<number> => {
    const res = await request.get(`${GANTT_API}/api/scenario`, {
      params: { page: 1, pageSize: 50, fileType: 'RO', name },
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

  const updateScenario = async (
    request: import('@playwright/test').APIRequestContext,
    id: number,
    patch: Record<string, unknown>,
  ): Promise<void> => {
    const res = await request.put(`${GANTT_API}/api/scenario/${id}`, {
      data: patch,
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `update scenario failed: ${res.status()}`).toBeTruthy()
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

  test('Scen-2009 — icon toolbar lives top-right with correct tooltips, state-aware enablement, and a working Remove result', async ({ page, request }) => {
    const scenario = new ScenarioPage(page)

    // ── Step 1 — create a fresh DRAFT scenario; it auto-selects + opens detail.
    await scenario.gotoRo()
    await scenario.createRoScenario(input)
    await expect(scenario.detailPanel).toBeVisible()

    const panel       = scenario.detailPanel
    const statusBadge = panel.getByTestId('scenario-status-badge')
    const saveBtn     = panel.getByTestId('scenario-save-btn')
    const runBtn      = panel.getByTestId('scenario-run-btn')
    const openBtn     = panel.getByTestId('scenario-open-btn')
    const removeBtn   = panel.getByTestId('scenario-remove-result-btn')
    const publishBtn  = panel.getByTestId('scenario-publish-btn')

    // ── Step 2 — all five icon actions live in the detail header.
    for (const btn of [saveBtn, runBtn, openBtn, removeBtn, publishBtn]) {
      await expect(btn).toBeVisible()
    }

    // ── Step 3 — the OLD bottom action bar is gone (no text buttons remain).
    await expect(page.getByRole('button', { name: 'Run Optimization' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Open Gantt' })).toHaveCount(0)

    // ── Step 4 — DRAFT: no result yet → Remove result + Import to Live disabled;
    //    Run available; Save clean (disabled right after the create-save).
    await expect(statusBadge).toHaveText('Draft')
    await expect(removeBtn).toBeDisabled()
    await expect(publishBtn).toBeDisabled()
    await expect(runBtn).toBeEnabled()
    await expect(saveBtn).toBeDisabled()

    // ── Step 5 — tooltips on the enabled DRAFT actions (each label is unique).
    //    Radix tooltips also open on focus; focusing the next button blurs the
    //    previous one, so this avoids pointer-overlap flakiness between adjacent
    //    icons while still proving the icon→label mapping.
    const expectTooltip = async (btn: typeof runBtn, label: string): Promise<void> => {
      await btn.focus()
      await expect(page.getByRole('tooltip').filter({ hasText: label }).first()).toBeVisible()
    }
    await expectTooltip(runBtn, 'Kick off run')
    await expectTooltip(openBtn, 'Open scenario')

    // ── Step 6 — Save toggles with the dirty state.
    await scenario.nameInput.fill(`${input.name}-edited`)
    await expect(saveBtn).toBeEnabled()
    await expectTooltip(saveBtn, 'Save changes')
    await saveBtn.click()
    await expect(saveBtn).toBeDisabled({ timeout: 15_000 })

    // ── Step 7 — drive DRAFT → RUNNING → DONE via API, then reload + reselect
    //    so the UI reflects a completed scenario.
    const id = await findScenarioId(request)
    await transition(request, id, 'RUNNING')
    await transition(request, id, 'DONE')

    await page.reload()
    await page.waitForLoadState('networkidle')
    await scenario.gotoRo()
    await scenario.listItemByName(input.name).click()
    await expect(scenario.detailPanel).toBeVisible()
    await expect(statusBadge).toHaveText('Done')

    // ── Step 8 — DONE: result-dependent actions now enabled, tooltips correct.
    await expect(removeBtn).toBeEnabled()
    await expect(publishBtn).toBeEnabled()
    await expect(publishBtn.locator('svg.lucide-cloud-upload')).toBeVisible()
    await expect(publishBtn).toHaveClass(/text-amber-500/)
    await expectTooltip(removeBtn, 'Remove result')
    await expectTooltip(publishBtn, 'Import to Live Roster')

    // ── Step 9 — Remove result reverts the scenario to DRAFT end-to-end:
    //    clicking the icon opens a confirmation dialog; confirming flips the
    //    status to Draft and disables the result-dependent actions again.
    await page.mouse.move(2, 2)
    await removeBtn.click()
    const removeDialog = page.getByTestId('remove-result-dialog')
    await expect(removeDialog).toBeVisible()
    const deleteVersions = removeDialog.getByTestId('remove-result-delete-versions')
    await expect(deleteVersions).not.toBeChecked()
    await deleteVersions.check()
    await expect(deleteVersions).toBeChecked()
    await deleteVersions.uncheck()
    await removeDialog.getByRole('button', { name: 'Remove Result' }).click()
    await expect(statusBadge).toHaveText('Draft', { timeout: 15_000 })
    await expect(removeBtn).toBeDisabled()
    await expect(publishBtn).toBeDisabled()
  })

  test('Scen-2060 — Published scenarios preserve their configuration snapshot', async ({ page, request }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await scenario.createRoScenario(input)
    const id = await findScenarioId(request)
    await transition(request, id, 'RUNNING')
    await transition(request, id, 'DONE')
    await transition(request, id, 'PUBLISHED')

    await page.reload()
    await page.waitForLoadState('networkidle')
    await scenario.gotoRo()
    await scenario.listItemByName(input.name).click()
    await expect(scenario.detailPanel).toBeVisible()

    const panel = scenario.detailPanel
    await expect(panel.getByTestId('scenario-status-badge')).toHaveText('Published')
    await expect(panel.getByTestId('scenario-run-btn')).toBeDisabled()
    await expect(panel.getByTestId('scenario-save-btn')).toBeDisabled()
    await expect(panel.getByTestId('scenario-name-input')).toBeDisabled()

    // Algorithm Parameters are view-only for a published scenario: the button
    // stays enabled, the dialog opens read-only, and no Save is triggered.
    const paramsButton = panel.getByTestId('scenario-parameters-open')
    await expect(paramsButton).toBeEnabled()
    await paramsButton.click()
    const paramsDialog = page.getByTestId('scenario-parameters-dialog')
    await expect(paramsDialog).toBeVisible()
    await expect(page.getByLabel('CA credit min hours')).toBeDisabled()
    await expect(paramsDialog.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0)
    await paramsDialog.locator('button[data-action="close"]').click()
    await expect(paramsDialog).toBeHidden()
    await expect(panel.getByTestId('scenario-save-btn')).toBeDisabled()
  })

  test('Scen-2014 — Import to Live is hidden for analysis-only RO scenarios', async ({ page, request }) => {
    const scenario = new ScenarioPage(page)

    const analysisName = `${input.name}-analysis`
    await scenario.gotoRo()
    await scenario.createRoScenario({ ...input, name: analysisName })
    const id = await findScenarioId(request, analysisName)
    await updateScenario(request, id, { pairingScenarioId: 1 })
    await transition(request, id, 'RUNNING')
    await transition(request, id, 'DONE')

    await page.reload()
    await page.waitForLoadState('networkidle')
    await scenario.gotoRo()
    await scenario.listItemByName(analysisName).click()
    await expect(scenario.detailPanel).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-status-badge')).toHaveText('Done')
    await expect(scenario.detailPanel.getByTestId('scenario-publish-btn')).toHaveCount(0)
  })

  test('Scen-2015 — Import to Live dialog shows progress and imported count', async ({ page, request }) => {
    const scenario = new ScenarioPage(page)
    const importName = `${input.name}-import`

    await page.route('**/live/api/scenario/*/roster', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'ok',
          data: {
            publishSupported: true,
            assignments: Array.from({ length: 40 }, (_, index) => ({
                kind: 'GROUND',
                crewId: `F800${String(index + 3).padStart(2, '0')}`,
                pairingId: null,
                source: 'CR',
                rosterIds: [31 + index],
                pairingLabel: null,
                base: 'YVR',
                assignmentGroup: 'GRD',
                assignment: 'DO',
                division: 'P',
                schStrDtUtc: '2026-05-07T07:00:00.000Z',
                schEndDtUtc: '2026-05-08T06:59:59.000Z',
                status: 'PENDING',
                published: false,
                publishable: true,
              })),
          },
        }),
      })
    })

    await page.route('**/live/api/scenario/*/publish', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data: { published: 40 } }),
      })
    })

    await scenario.gotoRo()
    await scenario.createRoScenario({ ...input, name: importName })
    const id = await findScenarioId(request, importName)
    await transition(request, id, 'RUNNING')
    await transition(request, id, 'DONE')

    await page.reload()
    await page.waitForLoadState('networkidle')
    await scenario.gotoRo()
    await scenario.listItemByName(importName).click()
    await expect(scenario.detailPanel).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-status-badge')).toHaveText('Done')

    await scenario.detailPanel.getByTestId('scenario-publish-btn').click()
    const dialog = page.getByTestId('publish-roster-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Import Optimized Roster to Live' })).toBeVisible()
    await expect(dialog.locator('[data-app-dialog-header] svg.lucide-cloud-upload')).toBeVisible()
    const crewFilter = dialog.getByPlaceholder('Crew ID')
    await crewFilter.fill('F8000')
    await dialog.getByRole('button', { name: 'Search' }).click()
    await expect(dialog).toContainText('0 / 40 rows')
    await crewFilter.fill(' F80003 ')
    await dialog.getByRole('button', { name: 'Search' }).click()
    await expect(dialog).toContainText('1 / 40 rows')
    await dialog.getByRole('button', { name: 'Select Unpublished' }).click()
    await expect(dialog).toContainText('Import 1 Selected')
    await crewFilter.fill('')
    await dialog.getByRole('button', { name: 'Search' }).click()
    await expect(dialog).toContainText('40 / 40 rows')
    const scroll = dialog.getByTestId('publish-roster-table-scroll')
    const header = scroll.locator('thead th').first()
    const filters = dialog.getByTestId('publish-roster-filters')
    const scrollBox = await scroll.boundingBox()
    const filtersBefore = await filters.boundingBox()
    expect(scrollBox).toBeTruthy()
    expect(filtersBefore).toBeTruthy()
    await scroll.evaluate((element) => {
      element.scrollTop = 500
      element.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    await expect.poll(async () => (await scroll.evaluate((element) => element.scrollTop))).toBeGreaterThan(0)
    const headerAfter = await header.boundingBox()
    const filtersAfter = await filters.boundingBox()
    expect(headerAfter).toBeTruthy()
    expect(filtersAfter).toBeTruthy()
    expect(Math.abs(headerAfter!.y - scrollBox!.y)).toBeLessThanOrEqual(2)
    expect(Math.abs(filtersAfter!.y - filtersBefore!.y)).toBeLessThanOrEqual(2)
    await dialog.getByRole('button', { name: 'Select Unpublished' }).click()
    await expect(dialog.getByText('Import 40 Selected')).toBeVisible()

    await dialog.getByRole('button', { name: 'Import 40 Selected' }).click()

    await expect(dialog.getByTestId('import-to-live-progress')).toBeVisible()
    await expect(dialog.getByText('Complete')).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByTestId('import-to-live-progress')).toContainText('Imported: 40')
    await expect(dialog.getByTestId('import-to-live-progress')).toContainText('Elapsed:')
  })
})
