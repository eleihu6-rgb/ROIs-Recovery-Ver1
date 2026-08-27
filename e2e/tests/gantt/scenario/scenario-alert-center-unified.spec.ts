/**
 * Scen-2042 — Legality Alert Center is unified onto the shared roster condition strip.
 *
 * §Gantt-Unify regression. The Alert Center bell used to be FORKED: Live rendered it in the
 * shared PaneConditionStrip (roster pane, right-aligned), while Scenario rendered a SEPARATE
 * `ScenarioAlertCenter` component up in the top `scenario-gantt-toolbar` (different component,
 * different position). They are now ONE code path: both contexts feed
 * RosterPaneSource.useAlertCenter, and SharedRosterPane renders the bell (in the condition
 * strip) + the shared ViolationListDialog. The standalone top-toolbar bell is deleted.
 *
 * This test would FAIL before the fix (the bell + testid `scenario-violations-button` lived in
 * the top toolbar, and `violations-button` was Live-only). After the fix it asserts:
 *   1. the old `scenario-violations-button` testid no longer exists anywhere,
 *   2. the shared `violations-button` bell is in the scenario roster condition strip (NOT the
 *      top toolbar), with a badge driven by the persisted legality,
 *   3. clicking it opens the SAME shared ViolationListDialog Live uses, grouped by rule.
 *
 * Environment note: like perf-scenario-canvas-raf, the demo engine-server 502s for scenario
 * gantt-data, so we intercept gantt-data + lock-status + legality with mock payloads. This
 * lets the scenario gantt mount and the bell populate WITHOUT the engine, so the test runs in
 * any env (no scenario backend required).
 *
 * Scenario id/name are queried from the real DB (findScenario) rather than hardcoded — demo data
 * drifts between environments, and a hardcoded fixture id silently rots into a stale test once
 * that particular scenario is gone (this test used to hardcode #8 "RO-2026-03 Mar Full
 * Assignment", which no longer exists in this environment).
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../../pages/gantt/scenario-page'
import { seedGanttAuth, findScenario } from '../../../utils/gantt-hook'

const buildMockGanttData = (scenarioId: number, scenarioName: string) => ({
  scenarioId,
  scenarioName,
  fileType: 'RO' as const,
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  scenarioStrDt: '2026-03-01T00:00:00',
  scenarioEndDt: '2026-03-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: Array.from({ length: 12 }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`,
    base: 'YEG',
    division: 'Pilots',
    rank: i % 2 === 0 ? 'CA' : 'FO',
    seniorityNum: String(i + 1),
    crewName: `Crew ${i + 1}`,
  })),
  pairings: [],
  assignments: [],
  pairingSegments: [],
  flights: [],
  groundItems: [],
  crewStats: {},
})

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

/** Three persisted (Rust-computed) violations: two 8002/001 + one 8056/001. */
const MOCK_LEGALITY = {
  status: 'READY' as const,
  violations: [
    {
      crew_id: 'C0001', pairing_id: null, duty_seq: null, rule_code: '8002', rule_instance: '006',
      severity: 3, actual_value: null, limit_value: null, unit: null,
      message: 'Cumulative block hours exceeded', start_dt: '2026-03-01T00:00:00', end_dt: '2026-03-31T00:00:00',
    },
    {
      crew_id: 'C0003', pairing_id: null, duty_seq: null, rule_code: '8002', rule_instance: '006',
      severity: 3, actual_value: null, limit_value: null, unit: null,
      message: 'Cumulative block hours exceeded', start_dt: '2026-03-01T00:00:00', end_dt: '2026-03-31T00:00:00',
    },
    {
      crew_id: 'C0002', pairing_id: 9001, duty_seq: 1, rule_code: '8056', rule_instance: '006',
      severity: 2, actual_value: null, limit_value: null, unit: null,
      message: 'Minimum spacing between duties violated', start_dt: '2026-03-05T00:00:00', end_dt: '2026-03-06T00:00:00',
    },
  ],
}

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data: body, message: 'ok' }),
})

test.describe('Scenario Alert Center — unified onto the shared roster condition strip', () => {
  test('Scen-2042 — scenario bell lives in the shared condition strip (not the top toolbar) and opens the shared dialog', async ({ page, request }) => {
    const token = await seedGanttAuth(page, request)
    const { id: SCENARIO_ID, name: SCENARIO_NAME } = await findScenario(request, token, { fileType: 'RO', status: 'DONE' })

    await page.route(`**/api/scenario/${SCENARIO_ID}/gantt-data`, (route) => route.fulfill(json(buildMockGanttData(SCENARIO_ID, SCENARIO_NAME))))
    await page.route(`**/api/scenario/${SCENARIO_ID}/lock-status`, (route) => route.fulfill(json(MOCK_LOCK_STATUS)))
    await page.route(`**/api/scenario/${SCENARIO_ID}/legality`, (route) => route.fulfill(json(MOCK_LEGALITY)))

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const item = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()

    const view = page.getByTestId('scenario-gantt-view')
    await expect(view).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })

    // 1) The forked top-toolbar bell is GONE — the standalone testid no longer exists anywhere,
    //    and the shared bell is NOT in the top toolbar.
    await expect(page.getByTestId('scenario-violations-button')).toHaveCount(0)
    await expect(page.getByTestId('scenario-gantt-toolbar').getByTestId('violations-button')).toHaveCount(0)

    // 2) The bell now renders in the shared roster condition strip (exactly like Live),
    //    with a badge driven by the persisted legality (3 mocked violations).
    const bell = view.getByTestId('violations-button')
    await expect(bell).toBeVisible()
    await expect(view.getByTestId('violations-button-count')).toHaveText('3', { timeout: 15_000 })

    // 3) Clicking opens the SAME shared ViolationListDialog; grouped by rule shows both rules,
    //    and every mocked violation appears as a row.
    await bell.click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('alert-groupby-rule').click()
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8002/006' })).toHaveCount(1)
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8056/006' })).toHaveCount(1)
    await expect(dialog.locator('[data-testid="violation-list-row"]')).toHaveCount(3)
  })
})
