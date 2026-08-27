/**
 * Scen-2040 — Scenario roster per-row violation bell (Issue 1 regression)
 *
 * The Scenario roster left gutter must draw a per-crew violation bell, exactly like
 * Live. Root cause of the bug: scenario-roster-pane built its panel rows without
 * `maxViolationSeverity`, and `pane-header-canvas` draws the gutter bell purely from
 * that field. The bell counter (Alert Center) showed N violations while the gutter
 * stayed empty.
 *
 * This test asserts the value that DRIVES the canvas bell (per-crew
 * maxViolationSeverity, published by the pane to the test hook), not pixels — so it
 * would have caught the bug before the fix (every severity was 0) and proves the fix
 * after (≥1 crew row carries a positive severity).
 *
 * Requires:
 *   - live-server running with SCENARIO_GANTT_SOURCE=db
 *   - Scenario #6 loaded (26 crew) with persisted Rust legality (status READY, >0 violations)
 */
import { test, expect, type APIRequestContext } from '@playwright/test'
import { gotoScenarioList } from '../../../pages/gantt/scenario-nav'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

interface Auth { token: string; userCode: string; userName: string; schema: string }

const login = async (request: APIRequestContext): Promise<Auth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: GANTT_USER, password: GANTT_PASS },
  })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  const json = (await res.json()) as { data: Auth }
  return json.data
}

async function openScenario6(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.goto('/altair/')
  await page.waitForLoadState('networkidle')
  await gotoScenarioList(page)
  await page.getByTestId('scenario-nav-ro').click()

  await page.getByPlaceholder('Search scenarios…').fill('RO-2026-06 YEG Test---')
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText('#6', { exact: true }),
  })
  await expect(item).toBeVisible({ timeout: 10_000 })
  await item.click()

  const detail = page.getByTestId('scenario-detail-panel')
  await expect(detail).toBeVisible()
  await detail.getByTestId('scenario-open-btn').click()

  const ganttView = page.getByTestId('scenario-gantt-view')
  await expect(ganttView).toBeVisible({ timeout: 15_000 })

  // Roster pane mounted + all 26 crew loaded.
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 15_000 })
  await expect
    .poll(async () => page.evaluate((sid) => window.__ganttTest?.scenarioRoster(sid)?.crew.length ?? 0, 6), {
      timeout: 15_000,
      message: 'scenario roster should load 26 crew',
    })
    .toBe(26)
}

test.describe('Scen-2040 — Scenario roster per-row violation bell', () => {
  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)
  })

  test('Scen-2040a — at least one crew row carries a positive violation severity (drives the bell)', async ({ page }) => {
    await openScenario6(page)

    // Sanity: persisted legality reached the scenario violation store (the bell counter source).
    await expect
      .poll(async () => page.evaluate((sid) => window.__ganttTest?.scenarioViolationKeys(sid)?.length ?? 0, 6), {
        timeout: 15_000,
        message: 'scenario #6 should load persisted legality violations into the store',
      })
      .toBeGreaterThan(0)

    // The value that drives the per-row gutter bell: published panel-row maxViolationSeverity.
    const severities = await page.evaluate(() => window.__ganttTest?.scenarioCrewViolationSeverities() ?? [])
    const violating = severities.filter((s) => s.severity > 0)

    // Before the fix every severity was 0 (no bells) → this would fail. After the fix ≥1 row
    // carries a positive severity, and every reported severity is a valid 1..5 level.
    expect(violating.length, `expected ≥1 crew row with a violation bell, got: ${JSON.stringify(severities)}`).toBeGreaterThan(0)
    for (const s of violating) {
      expect(s.severity).toBeGreaterThanOrEqual(1)
      expect(s.severity).toBeLessThanOrEqual(5)
    }
  })

  test('Scen-2041 — unified roster model builds once per dep change; a scroll burst does NOT rebuild it', async ({ page }) => {
    // Regression guard for the P0 collapse (gantt perf enhancement ver3): the scenario
    // source builds ONE memoized roster model (rows + panel rows + violation map + indexes)
    // instead of the old useRows/usePanelRows/useViolationMap trio. The model's deps are
    // data/filter/sort/frozen/found/violations — NOT scrollX. So a horizontal scroll burst
    // must add ZERO model rebuilds. A future regression that re-splits the model or folds a
    // hot dependency (e.g. scrollX) into its deps would make the build count climb here.
    await openScenario6(page)

    // Legality loaded → the model has built with violations at least once.
    await expect
      .poll(async () => page.evaluate((sid) => window.__ganttTest?.scenarioViolationKeys(sid)?.length ?? 0, 6), {
        timeout: 15_000,
        message: 'scenario #6 should load persisted legality violations into the store',
      })
      .toBeGreaterThan(0)

    const before = await page.evaluate(() => window.__ganttTest?.rosterModelBuilds('scenario-roster') ?? 0)
    expect(before, 'the unified scenario roster model should have built at least once').toBeGreaterThan(0)

    // Drive 24 horizontal scrollX writes through the store (scenarioRedrawBurst).
    const writes = await page.evaluate(() => window.__ganttTest?.scenarioRedrawBurst(6, 24) ?? Promise.resolve(0))
    expect(writes, 'scroll burst should have written scrollX 24 times').toBe(24)

    const after = await page.evaluate(() => window.__ganttTest?.rosterModelBuilds('scenario-roster') ?? 0)
    expect(
      after,
      `scrollX is not a model dependency — a ${writes}-write scroll burst must not rebuild the roster model (before=${before}, after=${after})`,
    ).toBe(before)

    // Parity: the per-row bells survive the scroll (model + violation map intact).
    const severities = await page.evaluate(() => window.__ganttTest?.scenarioCrewViolationSeverities() ?? [])
    expect(severities.filter((s) => s.severity > 0).length).toBeGreaterThan(0)
  })
})
