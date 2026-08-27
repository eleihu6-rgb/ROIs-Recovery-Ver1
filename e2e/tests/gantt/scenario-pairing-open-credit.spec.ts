/**
 * Scenario Pairing Pane — open/partial coverage total credit badge (HH:MM).
 *
 * The open-credit badge is a §Gantt-Unify shared feature: Live (legacy pane) and Scenario
 * (SharedPairingPane → ScenarioPaneToolbar) both compute it from the same `sumCoverageCredit`
 * util. This spec proves the SCENARIO render path with deterministic mock data (no engine-server):
 *
 *   Mock pairings (each duty credited 480 min = 8:00):
 *     9001 open    (CA plan 1 / fill 0)   ← uncovered
 *     9002 partial (CA plan 2 / fill 1)   ← uncovered
 *     9003 full    (FA plan 1 / fill 1)   ← covered
 *
 * The scenario pairing pane defaults to Open+Partial coverage (a hard filter), so it shows
 * 9001 + 9002 and the badge = 480 + 480 = 960 min = "16:00" (the full pairing's 8:00 is excluded).
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, seedScenarioListMocks, paneRenderStat } from '../../utils/gantt-hook'

const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const DEMO_SCENARIO_ID = 6

const seg = (id: number, i: number) => ({
  pairingId: id, dutySeq: 1, segSeq: 1, fltId: 8000 + i,
  fltNum: `300${i}`, airline: 'F8', depArp: 'YEG', arvArp: 'YYZ', segAssignment: 'FLY',
  schStrDtUtc: `2026-03-0${i + 2}T08:00:00.000Z`, schEndDtUtc: `2026-03-0${i + 2}T16:00:00.000Z`,
  dutyStrArp: 'YEG', dutyEndArp: 'YYZ',
  dutySchStrDtUtc: `2026-03-0${i + 2}T08:00:00.000Z`, dutySchEndDtUtc: `2026-03-0${i + 2}T16:00:00.000Z`,
  dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: 480,
  brief1StartUtc: `2026-03-0${i + 2}T08:00:00.000Z`, brief1EndUtc: `2026-03-0${i + 2}T08:00:00.000Z`,
  debrief1StartUtc: `2026-03-0${i + 2}T16:00:00.000Z`, debrief1EndUtc: `2026-03-0${i + 2}T16:00:00.000Z`,
  pickup1StartUtc: `2026-03-0${i + 2}T08:00:00.000Z`, pickup1EndUtc: `2026-03-0${i + 2}T08:00:00.000Z`,
  dropoff1StartUtc: `2026-03-0${i + 2}T16:00:00.000Z`, dropoff1EndUtc: `2026-03-0${i + 2}T16:00:00.000Z`,
})

const MOCK_GANTT_DATA = {
  scenarioId: DEMO_SCENARIO_ID, scenarioName: DEMO_SCENARIO_NAME, fileType: 'RO' as const,
  strDtLoc: '2026-03-01T00:00:00.000Z', endDtLoc: '2026-03-31T23:59:59.000Z',
  scenarioStrDt: '2026-03-01T00:00:00.000Z', scenarioEndDt: '2026-03-31T23:59:59.000Z',
  leadinLive: 1, dataSource: 'snapshot' as const,
  crew: Array.from({ length: 3 }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`, base: 'YEG', division: 'P',
    rank: 'CA', seniorityNum: String(i + 1), crewName: `Crew ${i + 1}`,
  })),
  pairings: [
    { pairingId: 9001, pairingLabel: 'F-OPEN', base: 'YEG', division: 'P', assignment: 'FLY', assignmentGroup: 'FLY', fleet: '',
      schStrDtUtc: '2026-03-02T08:00:00.000Z', schEndDtUtc: '2026-03-02T16:00:00.000Z', compositions: [{ rank: 'CA', plan: 1, fill: 0 }] },
    { pairingId: 9002, pairingLabel: 'F-PARTIAL', base: 'YEG', division: 'P', assignment: 'FLY', assignmentGroup: 'FLY', fleet: '',
      schStrDtUtc: '2026-03-03T08:00:00.000Z', schEndDtUtc: '2026-03-03T16:00:00.000Z', compositions: [{ rank: 'CA', plan: 2, fill: 1 }] },
    { pairingId: 9003, pairingLabel: 'F-FULL', base: 'YEG', division: 'P', assignment: 'FLY', assignmentGroup: 'FLY', fleet: '',
      schStrDtUtc: '2026-03-04T08:00:00.000Z', schEndDtUtc: '2026-03-04T16:00:00.000Z', compositions: [{ rank: 'CA', plan: 1, fill: 1 }] },
  ],
  assignments: [
    { crewId: 'C0001', pairingId: 9001, source: 'CR' as const },
    { crewId: 'C0002', pairingId: 9002, source: 'CR' as const },
    { crewId: 'C0003', pairingId: 9003, source: 'CR' as const },
  ],
  pairingSegments: [9001, 9002, 9003].map((id, i) => seg(id, i)),
  flights: [], groundItems: [], crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

test.describe('Scenario Pairing Pane — open-credit badge (Scen-2095)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await seedScenarioListMocks(page, DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)
    await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/gantt-data`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: MOCK_GANTT_DATA, message: 'ok' }) }))
    await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/lock-status`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: MOCK_LOCK_STATUS, message: 'ok' }) }))

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const item = await scenario.scenarioRow(DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()
    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
  })

  test('Scen-2095 — open/partial credit badge shows 16:00 (480+480), excluding the full pairing @smoke', async ({ page }) => {
    // Default coverage = Open+Partial (hard filter) → only the open + partial pairings render.
    await expect
      .poll(async () => (await paneRenderStat(page, 'pairing'))?.totalRows ?? -1, { timeout: 8_000 })
      .toBe(2)

    // Badge present in the scenario pairing toolbar with the exact open+partial credit sum:
    // 480 + 480 = 960 min = 16:00. The full pairing (480) is NOT counted.
    const badge = page.getByTestId('pane-open-credit')
    await expect(badge).toBeVisible({ timeout: 5_000 })
    await expect(badge).toHaveText(/16:00/)
  })
})
