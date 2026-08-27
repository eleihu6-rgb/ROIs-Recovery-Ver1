/**
 * Pairing left-panel composition rank order — CA before FO regardless of DB array order.
 *
 * Spec ID: Scen-2012
 *
 * Two mock pairings with reversed composition arrays:
 *   P-CA-FIRST  — [{CA}, {FO}]
 *   P-FO-FIRST  — [{FO}, {CA}]
 * After render both accessibility-mirror strings must be CA… then FO… (display_order).
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import {
  seedGanttAuth,
  seedScenarioListMocks,
  paneRenderStat,
} from '../../utils/gantt-hook'

const DEMO_SCENARIO_ID = 6
const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'

const mkPairing = (
  id: number,
  label: string,
  compositions: { rank: string; plan: number; fill: number }[],
) => ({
  pairingId: id,
  pairingLabel: label,
  base: 'YYC',
  division: 'P',
  assignment: 'FLY',
  assignmentGroup: 'FLY',
  fleet: '73H',
  schStrDtUtc: '2026-06-02T08:00:00.000Z',
  schEndDtUtc: '2026-06-02T16:00:00.000Z',
  compositions,
})

const MOCK_PAIRINGS = [
  mkPairing(4110, 'C4110', [
    { rank: 'CA', plan: 1, fill: 0 },
    { rank: 'FO', plan: 1, fill: 1 },
  ]),
  mkPairing(4142, 'C4142', [
    { rank: 'FO', plan: 1, fill: 0 },
    { rank: 'CA', plan: 1, fill: 1 },
  ]),
]

const MOCK_GANTT_DATA = {
  scenarioId: DEMO_SCENARIO_ID,
  scenarioName: DEMO_SCENARIO_NAME,
  fileType: 'RO' as const,
  strDtLoc: '2026-06-01T00:00:00.000Z',
  endDtLoc: '2026-06-30T23:59:59.000Z',
  scenarioStrDt: '2026-06-01T00:00:00.000Z',
  scenarioEndDt: '2026-06-30T23:59:59.000Z',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: [
    { crewId: 'C0001', base: 'YYC', division: 'Pilots', rank: 'CA', seniorityNum: '1', crewName: 'Crew 1' },
    { crewId: 'C0002', base: 'YYC', division: 'Pilots', rank: 'FO', seniorityNum: '2', crewName: 'Crew 2' },
  ],
  pairings: MOCK_PAIRINGS,
  assignments: [
    { crewId: 'C0001', pairingId: 4110, source: 'CR' as const },
    { crewId: 'C0002', pairingId: 4142, source: 'CR' as const },
  ],
  pairingSegments: MOCK_PAIRINGS.map((p, i) => ({
    pairingId: p.pairingId,
    dutySeq: 1, segSeq: 1,
    fltId: 6000 + i,
    fltDt: '2026-06-02',
    fltNum: `F${i + 1}`,
    airline: 'F8',
    depArp: 'YYC',
    arvArp: 'YEG',
    segAssignment: 'FLY',
    schStrDtUtc: p.schStrDtUtc,
    schEndDtUtc: p.schEndDtUtc,
    dutyStrArp: 'YYC',
    dutyEndArp: 'YEG',
    dutySchStrDtUtc: p.schStrDtUtc,
    dutySchEndDtUtc: p.schEndDtUtc,
    dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: 480,
    brief1StartUtc: p.schStrDtUtc, brief1EndUtc: p.schStrDtUtc,
    debrief1StartUtc: p.schEndDtUtc, debrief1EndUtc: p.schEndDtUtc,
    pickup1StartUtc: p.schStrDtUtc, pickup1EndUtc: p.schStrDtUtc,
    dropoff1StartUtc: p.schEndDtUtc, dropoff1EndUtc: p.schEndDtUtc,
  })),
  flights: [],
  groundItems: [],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

test('Scen-2012 — pairing composition ranks display CA before FO regardless of array order', async ({ page }) => {
  await seedGanttAuth(page, page.request)
  await seedScenarioListMocks(page, DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)

  // Rank table: CA display_order 1, FO 2 — authority for sort (not alphabet alone).
  await page.route('**/api/rank**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: [
          { id: 1, rank: 'CA', division: 'P', displayOrder: 1 },
          { id: 2, rank: 'FO', division: 'P', displayOrder: 2 },
        ],
        message: 'ok',
      }),
    }),
  )

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
      body: JSON.stringify({ code: 200, data: MOCK_LOCK_STATUS, message: 'ok' }),
    }),
  )

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  const item = await scenario.scenarioRow(DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })

  await expect
    .poll(
      async () => (await paneRenderStat(page, 'pairing'))?.totalRows ?? -1,
      { timeout: 8_000, message: 'both open+partial pairings visible' },
    )
    .toBe(2)

  const caFirst = page.getByTestId('pairing-comp-4110')
  const foFirst = page.getByTestId('pairing-comp-4142')
  await expect(caFirst).toBeVisible({ timeout: 5_000 })
  await expect(foFirst).toBeVisible()

  // Both must render CA before FO despite reversed source arrays.
  await expect(caFirst).toHaveText('CA(1:0)FO(1)')
  await expect(foFirst).toHaveText('CA(1)FO(1:0)')
})
