/**
 * Scenario roster optimizer ⚡ badge (source === 'CR').
 *
 * Regression: solver-placed duties must be tagged flash=true via __ganttTest;
 * lead-in (pre-assignment) duties must stay flash=false. Visual placement is
 * covered by optimizer-overlay unit tests (TL outside for pairing, TR outside for ground).
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedScenarioListMocks } from '../../utils/gantt-hook'

const DEMO_SCENARIO_ID = 6
const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'

const MOCK_GANTT_DATA = {
  scenarioId: DEMO_SCENARIO_ID,
  scenarioName: DEMO_SCENARIO_NAME,
  fileType: 'RO' as const,
  strDtLoc: '2026-06-01T00:00:00.000Z',
  endDtLoc: '2026-06-30T23:59:59.000Z',
  scenarioStrDt: '2026-06-01T00:00:00',
  scenarioEndDt: '2026-06-30T00:00:00',
  leadinLive: 0,
  dataSource: 'snapshot' as const,
  crew: [
    { crewId: 'C0001', base: 'YVR', division: 'Pilots', rank: 'CA', seniorityNum: '1', crewName: 'Pre-assign' },
    { crewId: 'C0002', base: 'YVR', division: 'Pilots', rank: 'FO', seniorityNum: '2', crewName: 'Optimized' },
  ],
  pairings: [],
  pairingSegments: [],
  assignments: [],
  flights: [],
  groundItems: [
    { crewId: 'C0001', assignmentGroup: 'OFF', assignment: 'DO', schStrDtUtc: '2026-06-05T00:00:00.000Z', schEndDtUtc: '2026-06-05T23:59:00.000Z', actingRank: 'CA', source: 'leadin' as const },
    { crewId: 'C0002', assignmentGroup: 'OFF', assignment: 'DO', schStrDtUtc: '2026-06-06T00:00:00.000Z', schEndDtUtc: '2026-06-06T23:59:00.000Z', actingRank: 'FO', source: 'CR' as const },
  ],
  crewStats: {},
}

test.describe('Scenario optimizer flash badge', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({
          user: { userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin: 1 },
          token: 'e2e-token',
        }),
      )
    })
    await seedScenarioListMocks(page, DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)
    await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/gantt-data`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: MOCK_GANTT_DATA, message: 'ok' }),
      }),
    )
    await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/lock-status`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: { locked: false, owner: null, ttl: null, isOwner: false }, message: 'ok' }),
      }),
    )
  })

  test('leadin DO has no flash; CR DO has flash=true in scenarioRosterFlash', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await (await scenario.scenarioRow(DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)).click()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })

    const leadin = await page.evaluate(
      (id) => window.__ganttTest?.scenarioRosterFlash?.(id, 'C0001') ?? [],
      DEMO_SCENARIO_ID,
    )
    expect(leadin).toHaveLength(1)
    expect(leadin[0].source).toBe('leadin')
    expect(leadin[0].flash).toBe(false)

    const optimized = await page.evaluate(
      (id) => window.__ganttTest?.scenarioRosterFlash?.(id, 'C0002') ?? [],
      DEMO_SCENARIO_ID,
    )
    expect(optimized).toHaveLength(1)
    expect(optimized[0].source).toBe('CR')
    expect(optimized[0].flash).toBe(true)
    expect(optimized[0].assignment).toBe('DO')
  })
})
