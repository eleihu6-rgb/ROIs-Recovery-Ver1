/**
 * Regression tests for two scenario-KPI bugs:
 *
 * Scen-2090 — Scenario list shows "0 results" when optimizedCount SQL is broken
 *   Root cause: a complex SQL subquery for optimizedCount threw a runtime error,
 *   making the entire scenario-list query return 0 rows.
 *   Fix: use count(DISTINCT pairing_id) + count(*) - count(pairing_id) which
 *   correctly counts distinct pairings + ground tasks without segment inflation.
 *
 * Scen-2091 — KPI "Assigned" card description only shows "pairing: N" (no ground breakdown)
 *   Root cause: `const groundByAg` inside the try block shadowed the outer
 *   `let groundByAg`, so the description was always built from an empty map.
 *   Fix: removed the inner const redeclaration; outer map is now populated directly.
 *
 * Both tests run against scenario 623 (yuanz-Test YVR-Cabin, DONE, Jun 2026,
 * 348 optimizedCount = 45 distinct pairings + 303 ground tasks) on UAT.
 *
 * Run:
 *   GANTT_BASE_URL=https://crew-f8-usva-uat.roiscloud.com \
 *   GANTT_API_URL=https://crew-f8-usva-uat.roiscloud.com \
 *   npx playwright test e2e/tests/gantt/scenario-kpi-assigned-breakdown.spec.ts \
 *     --config=e2e/config/playwright.config.ts --project=gantt --reporter=list
 */
import { test, expect, type APIRequestContext } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API  = process.env.GANTT_API_URL  ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

// Scenario 623: yuanz-Test YVR-Cabin, DONE, Jun 2026
// optimizedCount = 45 distinct pairings + 303 ground tasks = 348
const SCENARIO_ID   = 623
const SCENARIO_NAME = 'yuanz-Test YVR-Cabin'

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

test.describe('Scenario KPI — Assigned breakdown regression', () => {

  // ── Scen-2090 ─────────────────────────────────────────────────────────────

  test('Scen-2090 — DONE scenario shows non-zero optimizedCount in list (not "0 results")', async ({
    page,
    request,
  }) => {
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

    // Locate scenario 623 in the list — proves the list query returned rows at all
    const row = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)

    // The optimized-count chip must NOT say "0 results"
    const countChip = row.getByTestId('scenario-item-optimized-count')
    await expect(countChip).toBeVisible()
    await expect(countChip).not.toHaveText('0 results')

    // It must show the correct count (45 pairings + 303 ground = 348)
    await expect(countChip).toHaveText('348 results')
  })

  // ── Scen-2091 ─────────────────────────────────────────────────────────────

  test('Scen-2091 — KPI Assigned card description includes both pairing and ground breakdown', async ({
    page,
    request,
  }) => {
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

    // Open scenario 623
    const row = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await row.click()
    await expect(scenario.detailPanel).toBeVisible()

    // KPI section must be present (status is DONE)
    const kpiSection = scenario.detailPanel.locator('[data-testid="kpi-card"]')
    await expect(kpiSection.first()).toBeVisible({ timeout: 15_000 })

    // Find the "Assigned" card by its name label
    const assignedCard = scenario.detailPanel
      .locator('[data-testid="kpi-card"]')
      .filter({ has: page.locator('[data-testid="kpi-card-name"]', { hasText: /^assigned$/i }) })

    await expect(assignedCard).toBeVisible()

    // Value must be a positive number (total = pairings + ground tasks)
    const valueEl = assignedCard.locator('[data-testid="kpi-card-value"]')
    const valueText = await valueEl.textContent()
    expect(Number(valueText?.trim()), 'Assigned total must be > 0').toBeGreaterThan(0)

    // Description must contain "pairing:" AND at least one "/" separator,
    // proving ground-task breakdown is present (not just "pairing: N" alone).
    // Before the fix the shadowed groundByAg left description = "pairing: 45" with no "/".
    const descEl = assignedCard.locator('[data-testid="kpi-card-description"]')
    await expect(descEl).toBeVisible()
    const descText = await descEl.textContent()
    expect(descText, 'description must contain "pairing:"').toMatch(/pairing:/i)
    expect(descText, 'description must contain a ground-task component (the "/" separator)').toContain('/')
  })

})
