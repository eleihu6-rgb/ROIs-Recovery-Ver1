/**
 * Scenario 743 / crew 13372 — cleared Min-GDO (7505) must not linger in Alert Center.
 *
 * After a roster delete the backend recomputed legality (READY, no 7505 for 13372).
 * A prior frontend regression kept the pre-save persistedRaw snapshot in the violation
 * store when mount/save only fetched legality without applying it, so the crew bell /
 * Alert Center still showed 7505.
 *
 * §Simulate-User: open the scenario gantt, open the roster Alert Center, assert the
 * loaded UI list has no 7505 row for crew 13372 (API must also be clean).
 *
 * Run:
 *   cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/scenario-743-stale-7505-clear.spec.ts --reporter=list
 */
import { test, expect, type Page } from '@playwright/test'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'
const SCENARIO_ID = 743
const CREW = '13372'

type Viol = { crew_id: string; rule_code: string; message: string }

const getLegality = (page: Page): Promise<{ status: string; violations: Viol[] }> =>
  page.evaluate(async (sid) => {
    const tok = JSON.parse(sessionStorage.getItem('rois-auth') ?? '{}').token
    const r = await fetch(`/altair/live/api/scenario/${sid}/legality`, {
      headers: { authorization: `Bearer ${tok}` },
    })
    return (await r.json()).data as { status: string; violations: Viol[] }
  }, SCENARIO_ID)

test('Scen-743 — Alert Center must not show cleared 7505 for crew 13372', async ({ page, request }) => {
  test.setTimeout(120_000)

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
      JSON.stringify({
        user: { userCode: a.userCode, userName: a.userName, schema: a.schema },
        token: a.token,
      }),
    )
  }, auth)

  await page.goto(`/altair/scenario/${SCENARIO_ID}`)
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 30_000 })

  await expect
    .poll(async () => (await getLegality(page)).status, { timeout: 90_000, intervals: [1500] })
    .toBe('READY')

  const legality = await getLegality(page)
  const api7505 = legality.violations.filter((v) => v.crew_id === CREW && v.rule_code === '7505')
  expect(api7505, 'persisted legality must not still carry 7505 for crew 13372').toEqual([])
  const api8002 = legality.violations.filter((v) => v.crew_id === CREW && v.rule_code === '8002')
  expect(api8002.length, 'fixture expects remaining 8002 for crew 13372').toBeGreaterThan(0)

  const view = page.getByTestId('scenario-gantt-view')
  const bell = view.getByTestId('violations-button')
  await expect(bell).toBeVisible({ timeout: 30_000 })
  await bell.click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('alert-center-title')).toContainText('Alert Center')

  // Mount/save must apply READY into the store — otherwise Alert Center stays empty/stale.
  await expect(
    dialog.locator(
      `[data-testid="violation-list-row"][data-crew-id="${CREW}"][data-rule-code="8002"]`,
    ),
  ).toHaveCount(1, { timeout: 30_000 })

  // Cleared Min-GDO must not linger from a pre-save persistedRaw / draft-preview session snapshot.
  await expect(
    dialog.locator(
      `[data-testid="violation-list-row"][data-crew-id="${CREW}"][data-rule-code="7505"]`,
    ),
  ).toHaveCount(0)
})
