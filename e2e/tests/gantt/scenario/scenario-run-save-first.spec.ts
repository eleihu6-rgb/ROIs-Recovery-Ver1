/**
 * Scenario run with unsaved edits must prompt Save & Run first.
 *
 * Seeds a runnable DRAFT RO scenario (no blockers/warnings) via API, then drives
 * the real UI: rename → Run → Save & Run dialog. Cancel keeps edits unsaved and
 * fires no run; Save & Run persists the name and fires the run request (the run
 * POST is intercepted so no real optimisation starts).
 */
import { test, expect } from '@playwright/test'
import { gotoScenarioList } from '../../../pages/gantt/scenario-nav'
import { ganttApiUrl, seedGanttAuth } from '../../../utils/gantt-hook'

const unique = `E2E RunSaveFirst ${Date.now()}`

test('Run with unsaved changes prompts Save & Run; cancel keeps unsaved, confirm saves then runs', async ({ page, request }) => {
  const token = await seedGanttAuth(page, request)

  // Precondition: a runnable DRAFT RO scenario (pairing 0-Live, filters set → no warnings).
  const createRes = await request.post(`${ganttApiUrl}/api/scenario`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: unique,
      fileType: 'RO',
      division: 'P',
      rulesetId: 103,
      pairingScenarioId: 0,
      strDtLoc: '2026-07-01',
      endDtLoc: '2026-07-31',
      filterParams: {
        crew: { bases: ['YEG'], fleets: [], ranks: [], status: 'ACTIVE', birthday: { from: '', to: '' }, seniority: { min: null, max: null } },
        pairing: { bases: ['YEG'], fleets: [], ranks: [], types: [], duration: { min: null, max: null } },
      },
    },
  })
  expect(createRes.ok(), `seed create failed: ${createRes.status()}`).toBeTruthy()
  const scenarioId = ((await createRes.json()) as { data: { id: number } }).data.id

  // Intercept the run POST so no real optimisation job is created.
  let runRequested = false
  await page.route('**/api/scenario/*/run', async (route) => {
    runRequested = true
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { taskId: 'e2e-mock' } }) })
  })

  const getName = async (): Promise<string> =>
    ((await (await request.get(`${ganttApiUrl}/api/scenario/${scenarioId}`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { data: { name: string } }).data.name

  try {
    await page.goto('/altair/')
    await gotoScenarioList(page)
    await page.getByTestId('scenario-nav-ro').click()
    await expect(page.getByTestId('scenario-new-btn')).toBeVisible()

    await page.getByPlaceholder('Search scenarios…').fill(unique)
    const item = page.getByTestId('scenario-list-item').filter({ hasText: unique })
    await expect(item).toBeVisible({ timeout: 40_000 })
    await item.click()
    await expect(page.getByTestId('scenario-detail-panel')).toBeVisible()

    // Make it dirty: rename (unsaved edit). Save button lights up.
    const nameInput = page.getByTestId('scenario-name-input')
    const saveBtn = page.getByTestId('scenario-save-btn')
    await nameInput.fill(`${unique} edited`)
    await expect(saveBtn).toBeEnabled()

    // Run → the Save & Run dialog appears (scenario is runnable → no pre-run check).
    await page.getByTestId('scenario-run-btn').click()
    await expect(page.getByTestId('save-run-dialog')).toBeVisible()

    // Cancel → nothing saved, no run request, still dirty.
    await page.getByTestId('save-run-dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('save-run-dialog')).toBeHidden()
    await page.waitForTimeout(500)
    expect(runRequested).toBe(false)
    await expect(saveBtn).toBeEnabled()
    expect(await getName()).toBe(unique)

    // Run again → Save & Run → name persisted and run request fired.
    const runReqPromise = page.waitForRequest(
      (req) => /\/api\/scenario\/\d+\/run$/.test(req.url()) && req.method() === 'POST',
      { timeout: 15_000 },
    )
    await page.getByTestId('scenario-run-btn').click()
    await expect(page.getByTestId('save-run-dialog')).toBeVisible()
    await page.getByTestId('save-run-confirm').click()
    await runReqPromise
    await expect(page.getByTestId('save-run-dialog')).toBeHidden()
    await expect(saveBtn).toBeDisabled({ timeout: 15_000 })
    expect(runRequested).toBe(true)
    expect(await getName()).toBe(`${unique} edited`)
  } finally {
    await request.delete(`${ganttApiUrl}/api/scenario/${scenarioId}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined)
  }
})
