/**
 * Scen-2084 — Scenario name save does not corrupt date inputs after PUT response
 * Scen-2085 — KPI cards auto-refresh when optimization poll exits on DONE
 *
 * Both tests run against scenario 607 (Copy of Bid max credit #1, YVR RO,
 * 1-30 Jun 2026, 2075 results) on the target server.
 *
 * Scen-2085 duplicates 607 to get a runnable DRAFT copy, kicks off a real
 * optimization, and asserts KPI cards appear automatically — without navigating
 * away and back — proving the pollUntilDone → getKpis fix.
 *
 * Run against UAT:
 *   GANTT_BASE_URL=https://crew-f8-usva-uat.roiscloud.com \
 *   GANTT_API_URL=https://crew-f8-usva-uat.roiscloud.com \
 *   npx playwright test e2e/tests/gantt/scenario-name-save-kpi-refresh.spec.ts \
 *     --config=e2e/config/playwright.config.ts --project=gantt --reporter=list
 */
import { test, expect, type APIRequestContext } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API  = process.env.GANTT_API_URL  ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

const SOURCE_SCENARIO_ID = 607   // "Copy of Bid max credit #1" — YVR RO, Jun 2026

// ── Auth helpers ────────────────────────────────────────────────────────────

async function apiLogin(request: APIRequestContext) {
  const res = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: GANTT_USER, password: GANTT_PASS },
  })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  const { data } = (await res.json()) as {
    data: { token: string; userCode: string; userName: string; schema: string }
  }
  return data
}

async function deleteScenarioByName(
  request: APIRequestContext,
  token: string,
  name: string,
) {
  const listRes = await request.get(`${GANTT_API}/api/scenario`, {
    params: { page: 1, pageSize: 20, name },
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!listRes.ok()) return
  const { data } = (await listRes.json()) as { data: { items: { id: number; name: string }[] } }
  for (const item of data.items) {
    if (item.name === name) {
      await request.delete(`${GANTT_API}/api/scenario/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  }
}

// ── Scen-2084 — Name save: date inputs stay valid after PUT response ─────────

test.describe('Scenario — name save and KPI auto-refresh', () => {

test('Scen-2084 — scenario name save does not corrupt date inputs', async ({ page, request }) => {
  const auth = await apiLogin(request)

  await page.addInitScript((a) => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({
        user: { userCode: a.userCode, userName: a.userName, schema: a.schema },
        token: a.token,
      }),
    )
  }, auth)

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()

  // Locate scenario 607 in the list.
  const row = scenario.listItemById(SOURCE_SCENARIO_ID)
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.click()
  await expect(scenario.detailPanel).toBeVisible()

  // Capture the original name so we can restore it.
  const originalName = await scenario.nameInput.inputValue()

  // Record the start-date value before save — must survive the round-trip.
  const startDateInput = scenario.detailPanel.getByTestId('scenario-start-date')
  const startDateBefore = await startDateInput.inputValue()
  expect(startDateBefore).toMatch(/^\d{4}-\d{2}-\d{2}$/)   // must be YYYY-MM-DD

  // Edit the name.
  const newName = `${originalName} [2084]`
  await scenario.nameInput.fill(newName)

  // Use scenario.save() which waits for the actual PUT response before returning.
  // Direct click + toBeDisabled races: the button becomes disabled immediately when
  // saving: true is set, but the success handler that resets draftDetail runs later.
  // If we re-fill before the handler runs, the handler overwrites our edit.
  await scenario.save()

  // Name must appear in the sidebar list item.
  await expect(scenario.listItemById(SOURCE_SCENARIO_ID)).toContainText(newName.slice(0, 20))

  // Date input must NOT have been corrupted to ISO datetime (the pre-fix bug).
  const startDateAfter = await startDateInput.inputValue()
  expect(startDateAfter).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(startDateAfter).toBe(startDateBefore)

  // Restore the original name.
  await scenario.nameInput.fill(originalName)
  await scenario.save()
})

// ── Scen-2085 — KPI auto-refresh when poll exits on DONE ────────────────────

test('Scen-2085 — KPI cards appear automatically after optimization completes', async ({
  page,
  request,
}) => {
  test.setTimeout(600_000)   // real RO run can take several minutes

  const auth = await apiLogin(request)
  let copyName = ''

  await page.addInitScript((a) => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({
        user: { userCode: a.userCode, userName: a.userName, schema: a.schema },
        token: a.token,
      }),
    )
  }, auth)

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()

  // ── Step 1: duplicate scenario 607 via the UI ─────────────────────────────
  const sourceRow = scenario.listItemById(SOURCE_SCENARIO_ID)
  await expect(sourceRow).toBeVisible({ timeout: 15_000 })

  // Hover to reveal the "…" menu button, then open the dropdown.
  await sourceRow.hover()
  await sourceRow.getByRole('button').last().click()   // "…" kebab button
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()

  // The copy lands at the top of the list as DRAFT.
  const copyRow = page.getByTestId('scenario-list-item').first()
  await expect(copyRow).toBeVisible({ timeout: 10_000 })
  copyName = (await copyRow.locator('[data-testid="scenario-item-name"]').textContent() ?? '').trim()

  // Click the copy to open its detail panel.
  await copyRow.click()
  await expect(scenario.detailPanel).toBeVisible()

  const statusBadge = scenario.detailPanel.getByTestId('scenario-status-badge')
  await expect(statusBadge).toHaveText('Draft')

  // ── Step 2: kick off the run ──────────────────────────────────────────────
  const runBtn = scenario.detailPanel.getByTestId('scenario-run-btn')
  await expect(runBtn).toBeEnabled()
  await runBtn.click()

  // Pre-run Check dialog may appear — if warnings-only, proceed; if blockers, fail fast.
  const runCheckDialog = page.getByTestId('run-check-dialog')
  if (await runCheckDialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const proceedBtn = runCheckDialog.getByRole('button', { name: 'Proceed Anyway' })
    if (await proceedBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await proceedBtn.click()
    } else {
      throw new Error('Pre-run Check has blockers — copy of 607 is not runnable')
    }
  }

  // ── Step 3: wait for RUNNING → DONE ──────────────────────────────────────
  await expect(statusBadge).toHaveText('Running', { timeout: 30_000 })
  await expect(statusBadge).toHaveText('Done', { timeout: 540_000 })   // up to 9 min

  // ── Step 4: KPI cards must appear WITHOUT navigating away (the regression) ─
  //    KPI section is only rendered when status === 'DONE' and kpis.length > 0.
  const kpiSection = scenario.detailPanel.locator('text=KPI Results')
  await expect(kpiSection).toBeVisible({ timeout: 15_000 })

  // At least one KPI card with a non-empty value.
  const kpiCards = scenario.detailPanel.locator('.grid.grid-cols-2.gap-2 > div')
  await expect(kpiCards).not.toHaveCount(0)
  await expect(kpiCards.first()).toBeVisible()

  // ── Cleanup: delete the copy ──────────────────────────────────────────────
  if (copyName) {
    await deleteScenarioByName(request, auth.token, copyName)
  }
})

}) // end describe
