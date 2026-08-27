/**
 * Scen-2044 — Scenario Flight Navi (client-derived, no backend API).
 *
 * §Gantt-Unify: Flight Navi was Live-only. Live needs the `/api/flight/navi-counts` endpoint
 * because the flight→pairing / flight→crew links aren't shipped to the Live client; a SCENARIO's
 * gantt-data payload carries them (`pairingSegments[].fltId/pairingId`, `assignments[].crewId/
 * pairingId`), so per-flight pairing/crew counts are derived ENTIRELY client-side
 * (buildScenarioNaviRows) — NO scenario API. One shared FlightNaviDialog now drives both contexts
 * (keyed by ui-store flightNaviScenarioId, mirroring FlightDetailDialog); navigation routes to the
 * per-scenario find helpers.
 *
 * Mocked (no scenario backend). The mock wires:
 *   flight 9001 ← pairings {5001, 5002}; flight 9002 ← pairing {5002}
 *   assignments: C0001+C0002 → 5001, C0003 → 5002
 * ⇒ flight 9001: pairingCount 2, crewCount 3 (C0001/C0002/C0003)
 *   flight 9002: pairingCount 1, crewCount 1 (C0003)
 * The test asserts those client-derived counts, then clicks the flight-9002 Roster cell and
 * asserts C0003 floats to the top of the scenario roster (scenario navigation wired).
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../../pages/gantt/scenario-page'
import { seedGanttAuth } from '../../../utils/gantt-hook'

const SCENARIO_NAME = 'RO-2026-03 Mar Full Assignment'
const SCENARIO_ID = 8

const seg = (pairingId: number, fltId: number, fltNum: string, dep: string, arv: string, s: string, e: string) => ({
  pairingId, dutySeq: 1, segSeq: 1, fltId, fltDt: s.slice(0, 10), fltNum, airline: 'F8',
  depArp: dep, arvArp: arv, segAssignment: 'DOM', schStrDtUtc: s, schEndDtUtc: e,
  dutyStrArp: dep, dutyEndArp: arv, dutySchStrDtUtc: s, dutySchEndDtUtc: e,
  dutySchRestMin: 0, dutyActRestMin: 0, dutyActCreditedMinutes: 90,
  brief1StartUtc: '', brief1EndUtc: '', debrief1StartUtc: '', debrief1EndUtc: '',
  pickup1StartUtc: '', pickup1EndUtc: '', dropoff1StartUtc: '', dropoff1EndUtc: '',
})

const pairing = (pairingId: number) => ({
  pairingId, pairingLabel: `P${pairingId}`, base: 'YEG',
  schStrDtUtc: '2026-03-05T13:00:00', schEndDtUtc: '2026-03-05T19:00:00',
  assignmentGroup: 'FLY', assignment: 'DOM', division: 'Pilots', compositions: [],
})

const MOCK_GANTT_DATA = {
  scenarioId: SCENARIO_ID,
  scenarioName: SCENARIO_NAME,
  fileType: 'RO' as const,
  capabilities: {
    panes: ['roster', 'pairing', 'flight'],
    defaultPanes: ['roster'],
    roster: { canAssign: false, canRemove: false, canReassign: false },
    pairing: { canEditSegments: false },
  },
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  scenarioStrDt: '2026-03-01T00:00:00',
  scenarioEndDt: '2026-03-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: [
    { crewId: 'C0001', base: 'YEG', division: 'Pilots', rank: 'CA', seniorityNum: '1', crewName: 'Crew 1' },
    { crewId: 'C0002', base: 'YEG', division: 'Pilots', rank: 'FO', seniorityNum: '2', crewName: 'Crew 2' },
    { crewId: 'C0003', base: 'YEG', division: 'Pilots', rank: 'CA', seniorityNum: '3', crewName: 'Crew 3' },
  ],
  pairings: [pairing(5001), pairing(5002)],
  assignments: [
    { crewId: 'C0001', pairingId: 5001, source: 'CR' },
    { crewId: 'C0002', pairingId: 5001, source: 'CR' },
    { crewId: 'C0003', pairingId: 5002, source: 'CR' },
  ],
  pairingSegments: [
    seg(5001, 9001, '0924', 'YEG', 'YVR', '2026-03-05T14:00:00', '2026-03-05T15:30:00'),
    seg(5002, 9001, '0924', 'YEG', 'YVR', '2026-03-05T14:00:00', '2026-03-05T15:30:00'),
    seg(5002, 9002, '0925', 'YVR', 'YEG', '2026-03-05T16:30:00', '2026-03-05T18:00:00'),
  ],
  flights: [
    { id: 9001, fltNum: '0924', depArp: 'YEG', arvArp: 'YVR', schDepDtUtc: '2026-03-05T14:00:00', schArvDtUtc: '2026-03-05T15:30:00', fleet: '7M8', register: 'CFABC' },
    { id: 9002, fltNum: '0925', depArp: 'YVR', arvArp: 'YEG', schDepDtUtc: '2026-03-05T16:30:00', schArvDtUtc: '2026-03-05T18:00:00', fleet: '7M8', register: 'CFXYZ' },
  ],
  groundItems: [],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }
const MOCK_LEGALITY = { status: 'READY' as const, violations: [] }

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data: body, message: 'ok' }),
})

const rosterOrder = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    ((window as unknown as {
      __ganttTest?: { scenarioCrewViolationSeverities: () => Array<{ crewId: string }> }
    }).__ganttTest?.scenarioCrewViolationSeverities() ?? []).map((r) => r.crewId),
  )

test.describe('Scenario Flight Navi — client-derived counts + scenario navigation (no API)', () => {
  test('Scen-2044 — flight pane Navi shows scenario pairing/crew counts and navigates the scenario roster', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    await page.route(`**/api/scenario/${SCENARIO_ID}/gantt-data`, (route) => route.fulfill(json(MOCK_GANTT_DATA)))
    await page.route(`**/api/scenario/${SCENARIO_ID}/lock-status`, (route) => route.fulfill(json(MOCK_LOCK_STATUS)))
    await page.route(`**/api/scenario/${SCENARIO_ID}/legality`, (route) => route.fulfill(json(MOCK_LEGALITY)))
    // Guard: the scenario navi must NOT hit any live flight endpoint.
    let liveFlightCalls = 0
    await page.route('**/api/flight/**', (route) => { liveFlightCalls++; return route.fulfill(json({ items: [], total: 0, counts: [] })) })

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const item = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()

    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })
    await expect.poll(() => rosterOrder(page), { timeout: 15_000 }).toEqual(['C0001', 'C0002', 'C0003'])

    // Add the flight pane (not open by default), then open its Flight Navi.
    await page.getByTestId('sg-add-pane-flight').click()
    await expect(page.getByTestId('scenario-flight-canvas')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('flight-navi-button').click()

    const dialog = page.getByTestId('flight-navi-dialog')
    await expect(dialog).toBeVisible()

    // ── Client-derived per-flight counts (no API) ──
    await expect(dialog.getByTestId('navi-ptns-9001')).toHaveText('2')   // pairings 5001 + 5002
    await expect(dialog.getByTestId('navi-roster-9001')).toHaveText('3') // crew C0001/C0002/C0003
    await expect(dialog.getByTestId('navi-ptns-9002')).toHaveText('1')   // pairing 5002
    await expect(dialog.getByTestId('navi-roster-9002')).toHaveText('1') // crew C0003
    await expect(dialog.getByTestId('flight-navi-count')).toContainText('2 of 2 flights')

    // ── Scenario navigation: flight 9002's Roster cell floats its crew (C0003) to the top ──
    await dialog.getByTestId('navi-roster-9002').click()
    await expect.poll(() => rosterOrder(page), { timeout: 10_000 }).toEqual(['C0003', 'C0001', 'C0002'])

    // No live flight API was ever called for the scenario navi.
    expect(liveFlightCalls, 'scenario Flight Navi must not call any live /api/flight endpoint').toBe(0)
  })
})
