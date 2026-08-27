/**
 * Scenario persisted legality (Rust-computed) reaches the opened scenario gantt.
 *
 * End-to-end through the running app: open the linked RO scenario 460 (pairing→405,
 * flight→456), then exercise the SAME read path the scenario view uses on mount — an
 * authenticated GET /api/scenario/:id/legality (via the app's own /altair/live proxy +
 * sessionStorage token) — and assert it returns READY with the Rust-computed violations
 * that drive the scenario gantt bells (8002 cumulative-block + 8056 spacing).
 *
 * (The scenario bells render on the canvas via the violation source; the store-population
 * step is unit-proven. Canvas introspection via __ganttTest.scenarioViolationKeys is not
 * used here because the dev test-hook is a separately-imported chunk with its own store
 * registry — a pre-existing infra limitation, not a feature bug.)
 *
 * Spec: docs/superpowers/specs/2026-06-15-scenario-persisted-legality-design.md
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'
const SCENARIO_ID = 460
const SCENARIO_NAME = 'Ryan-2026-06 YEG Test---'

test('Scen-2410 — opened scenario serves persisted Rust legality (8002 + 8056) to the gantt', async ({ page, request }) => {
  test.setTimeout(90_000)
  const res = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: GANTT_USER, password: GANTT_PASS },
  })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  const { data: auth } = (await res.json()) as {
    data: { token: string; userCode: string; userName: string; schema: string }
  }
  await page.addInitScript((a) => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
    )
  }, auth)

  // Open the existing linked RO scenario 460 → its gantt view mounts and triggers loadPersisted.
  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  await scenario.listItemByName(SCENARIO_NAME).first().click()
  await expect(scenario.detailPanel).toBeVisible()
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 15_000 })

  // Exercise the view's read path: poll the legality endpoint (via the app's proxy + token)
  // until READY, then assert the Rust-computed violations are present and well-formed.
  type Legality = { status: string; violations: Array<{ rule_code: string; pairing_id: number | null; severity: number }> }
  const getLegality = (id: number) =>
    page.evaluate(async (sid) => {
      const tok = JSON.parse(sessionStorage.getItem('rois-auth') ?? '{}').token
      const r = await fetch(`/altair/live/api/scenario/${sid}/legality`, { headers: { authorization: `Bearer ${tok}` } })
      return (await r.json()).data as { status: string; violations: unknown[] }
    }, id)

  await expect
    .poll(async () => (await getLegality(SCENARIO_ID)).status, { timeout: 60_000, intervals: [1500] })
    .toBe('READY')

  const legality = (await getLegality(SCENARIO_ID)) as Legality
  expect(legality.violations.length).toBeGreaterThan(100)
  // Multiple Rust rules reach the gantt: roster-level 8002 (block) + 7501 (SDFD),
  // pairing-level 8056 (spacing) + 8030 (age) + 7504 (WOCL spacing) + 7505 (GDO).
  const codes = new Set(legality.violations.map((v) => v.rule_code))
  for (const code of ['8002', '8056', '8030', '7501', '7504', '7505']) {
    expect(codes, `expected rule ${code} in scenario legality`).toContain(code)
  }
  // pairing-level shape (puck bells) present.
  expect(legality.violations.some((v) => v.rule_code === '8056' && v.pairing_id !== null)).toBe(true)

  // ── Scenario Alert Center: the shared per-pane bell (unified with Live, §Gantt-Unify) ──
  // The bell now lives in the roster condition strip (was a standalone top-toolbar component).
  const view = page.getByTestId('scenario-gantt-view')
  const bell = view.getByTestId('violations-button')
  await expect(bell).toBeVisible()
  // Badge caps at "99+" like Live; scenario 460 has >100 persisted violations (asserted above).
  await expect(view.getByTestId('violations-button-count')).toHaveText('99+', { timeout: 30_000 })
  await bell.click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()
  // Group by rule → the firing rules appear as distinct groups.
  await dialog.getByTestId('alert-groupby-rule').click()
  await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8056/001' })).toHaveCount(1)
  await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8002/001' })).toHaveCount(1)
})
