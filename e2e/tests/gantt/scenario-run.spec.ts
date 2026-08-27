/**
 * Gantt Scenario optimization run + ruleset selector.
 *
 * Proves the scenario-optimization-loop feature on the gantt side:
 *   - the Rule Set selector persists scenario.ruleset_id through a
 *     save + reload (regression for the export filter that reads that field),
 *   - the Run button is gated by a Pre-run Check that blocks a run with missing
 *     prerequisites (Pairing Scenario / Rule Set),
 *   - once prerequisites are satisfied, a failing /run surfaces the server error
 *     as a toast instead of silently doing nothing (the old `void runScenario()`
 *     swallowed it).
 *
 * Note: we do NOT assert a real engine optimization completing (RUNNING→DONE/
 * FAILED) — that depends on engine-server state and is nondeterministic. The
 * run trigger is covered via a mocked /run response instead.
 *
 * Auth is seeded into sessionStorage the same way as scenario-detail-toolbar.spec.ts.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage, type RoScenarioInput } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario — optimization run', () => {
  // Per-test unique name so parallel afterEach cleanups (which delete by name)
  // never stomp another test's scenario. Built fresh in beforeEach.
  let input: RoScenarioInput

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

  const findScenario = async (
    request: import('@playwright/test').APIRequestContext,
  ): Promise<{ id: number; rulesetId: number | null; status: string }> => {
    const res = await request.get(`${GANTT_API}/api/scenario`, {
      params: { page: 1, pageSize: 50, fileType: 'RO', name: input.name },
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBeTruthy()
    const { data } = (await res.json()) as {
      data: { items: Array<{ id: number; rulesetId: number | null; status: string }> }
    }
    expect(data.items.length, 'created scenario should be listed').toBeGreaterThan(0)
    return data.items[0]
  }

  /** Fetch a non-default RULE-category workset so the value is guaranteed to change
   *  from the auto-selected default (id=103). Falls back to any RULE workset if all
   *  are defaults (unlikely but safe). */
  const nonDefaultRuleset = async (
    request: import('@playwright/test').APIRequestContext,
  ): Promise<{ id: number; name: string }> => {
    const res = await request.get(`${GANTT_API}/api/legality/rulesets`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), 'rulesets endpoint must be available').toBeTruthy()
    const { data } = (await res.json()) as {
      data: Array<{ id: number; name: string; category: string | null; isDefault: boolean }>
    }
    const ruleOnly = data.filter((r) => r.category === 'RULE')
    expect(ruleOnly.length, 'at least one RULE workset must exist').toBeGreaterThan(0)
    // Prefer a non-default to ensure onValueChange fires (Radix skips no-ops).
    return ruleOnly.find((r) => !r.isDefault) ?? ruleOnly[0]
  }

  test.beforeEach(async ({ page, request }, testInfo) => {
    // Unique per test (title + worker + timestamp) → isolated cleanup.
    input = {
      name: `RO-Run-${testInfo.workerIndex}-${testInfo.testId}-${Date.now()}`,
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      crewBase: 'YEG',
      division: 'Pilots',
    }
    const auth = await login(request)
    token = auth.token
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)
  })

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

  test('Scen-2025 — ruleset selection persists to ruleset_id and survives a reload', async ({ page, request }) => {
    const scenario = new ScenarioPage(page)
    const ruleset = await nonDefaultRuleset(request)
    const rulesetOptionLabel = `#${ruleset.id} ${ruleset.name}`

    // ── Step 1 — create a fresh DRAFT RO scenario (auto-selected, detail open).
    await scenario.gotoRo()
    await scenario.createRoScenario(input)
    await expect(scenario.detailPanel).toBeVisible()

    const panel       = scenario.detailPanel
    const statusBadge = panel.getByTestId('scenario-status-badge')
    const ruleSelect  = panel.getByTestId('scenario-ruleset-select')

    await expect(statusBadge).toHaveText('Draft')

    // ── Step 2 — pick the rule set (the dropdown binds the scenario's
    //    ruleset_id column directly) and save.
    await ruleSelect.click()
    await page.getByRole('option', { name: rulesetOptionLabel, exact: true }).click()
    await expect(ruleSelect).toContainText(String(ruleset.id))
    await scenario.save()

    // ── Step 3 — persistence: the API row now carries scenario.ruleset_id.
    const saved = await findScenario(request)
    expect(saved.rulesetId, 'ruleset_id persisted to the scenario').toBe(ruleset.id)

    // ── Step 4 — reload + reselect; the dropdown still shows the saved ruleset.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await scenario.gotoRo()
    await scenario.listItemByName(input.name).click()
    await expect(scenario.detailPanel).toBeVisible()
    await expect(ruleSelect).toContainText(String(ruleset.id))
  })

  test('Scen-2026 — Run is gated by the Pre-run Check when prerequisites are missing', async ({ page }) => {
    const scenario = new ScenarioPage(page)

    // A fresh RO scenario has no Pairing Scenario selected → not runnable.
    await scenario.gotoRo()
    await scenario.createRoScenario(input)
    await expect(scenario.detailPanel).toBeVisible()

    const panel       = scenario.detailPanel
    const statusBadge = panel.getByTestId('scenario-status-badge')
    const runBtn      = panel.getByTestId('scenario-run-btn')
    await expect(statusBadge).toHaveText('Draft')

    // Clicking Run opens the Pre-run Check rather than starting a run.
    await runBtn.click()
    const dialog = page.getByTestId('run-check-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Must fix before running')
    await expect(dialog.getByText('Pairing Scenario is required')).toBeVisible()
    // A blocking check offers only Close (no "Proceed Anyway").
    await expect(dialog.getByRole('button', { name: 'Proceed Anyway' })).toHaveCount(0)
    // The footer "Close" (text button), not the title-bar X (icon, aria-label "Close").
    await dialog.locator('button').filter({ hasText: /^Close$/ }).click()
    await expect(dialog).toBeHidden()

    // The blocked run never advanced the scenario.
    await expect(statusBadge).toHaveText('Draft')
  })

  test('Scen-2027 — a failing Run surfaces the server error as a toast instead of doing nothing', async ({ page, request }) => {
    const scenario = new ScenarioPage(page)
    const ruleset = await nonDefaultRuleset(request)
    const rulesetOptionLabel = `#${ruleset.id} ${ruleset.name}`

    // ── Step 1 — create a DRAFT RO scenario.
    await scenario.gotoRo()
    await scenario.createRoScenario(input)
    await expect(scenario.detailPanel).toBeVisible()

    const panel       = scenario.detailPanel
    const statusBadge = panel.getByTestId('scenario-status-badge')
    const ruleSelect  = panel.getByTestId('scenario-ruleset-select')
    const pairingSc   = panel.getByTestId('scenario-pairing-sc')
    const runBtn      = panel.getByTestId('scenario-run-btn')
    await expect(statusBadge).toHaveText('Draft')

    // ── Step 2 — satisfy the Pre-run Check blockers: a rule set + a pairing
    //    scenario ("0 - Live" is always available), then save.
    await ruleSelect.click()
    await page.getByRole('option', { name: rulesetOptionLabel, exact: true }).click()
    await expect(ruleSelect).toContainText(String(ruleset.id))
    await pairingSc.click()
    await page.getByRole('option', { name: '0 - Live', exact: true }).click()
    await expect(pairingSc).toContainText('0 - Live')
    await scenario.save()

    // ── Step 3 — force /run to fail with a specific server message (regression:
    //    the store used to `void runScenario()` with no catch, so this error was
    //    swallowed and the UI looked dead — "click Run, no response").
    const serverMessage = 'Engine unavailable (e2e)'
    await page.route(/\/api\/scenario\/\d+\/run(\?|$)/, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 500, data: null, message: serverMessage }),
      }),
    )

    // ── Step 4 — click Run; if any warnings surface in the Pre-run Check, proceed.
    await expect(runBtn).toBeEnabled()
    await runBtn.click()
    const dialog = page.getByTestId('run-check-dialog')
    if (await dialog.isVisible().catch(() => false)) {
      // No blockers remain → only warnings → "Proceed Anyway" is offered.
      await dialog.getByRole('button', { name: 'Proceed Anyway' }).click()
    }

    // ── Step 5 — the exact server message appears in an error toast…
    await expect(page.getByText(serverMessage)).toBeVisible({ timeout: 10_000 })

    // ── Step 6 — …and the scenario stays in Draft (the failed start did not advance it).
    await expect(statusBadge).toHaveText('Draft')
  })
})
