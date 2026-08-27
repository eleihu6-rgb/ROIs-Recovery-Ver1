/**
 * Scenario Pane Canvas Refactor — regression.
 *
 * §Stale-Test rewrite: Scen-2019/2020/2021 previously created a real DONE scenario
 * and asserted old per-pane testids (sg-pairing-filter-btn, sg-flight-filter-btn,
 * sg-pane-toolbar) which were removed when the scenario gantt was unified with Live
 * (§Gantt-Unify). Tests now use mock gantt-data and the shared filter infrastructure.
 *
 * Intent preserved:
 *  - Scen-2019: Pairing pane: shared PaneCanvas renders — filter button + row count visible
 *  - Scen-2020: Flight pane: shared PaneCanvas renders — filter button + dialog opens
 *  - Scen-2021: Pairing + flight panes open simultaneously without crash
 *
 * Requires scenario #6 ('RO-2026-06 YEG Test---') to exist; gantt-data is mocked
 * so the test runs without engine-server.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, seedScenarioListMocks, paneRenderStat } from '../../utils/gantt-hook'

const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const DEMO_SCENARIO_ID = 6

// ── Mock data: 3 crew · 3 pairings · 2 flights (2 distinct aircraft → 2 flight rows) ──

const MOCK_CREW = [
  { crewId: 'C0001', base: 'YEG', division: 'P', rank: 'CA', seniorityNum: '1', crewName: 'Pilot YEG One' },
  { crewId: 'C0002', base: 'YEG', division: 'P', rank: 'FO', seniorityNum: '2', crewName: 'Pilot YEG Two' },
  { crewId: 'C0003', base: 'YEG', division: 'C', rank: 'FA', seniorityNum: '3', crewName: 'Cabin YEG One' },
]

const MOCK_PAIRINGS = [
  {
    pairingId: 9001, pairingLabel: 'F-PILOT-1', base: 'YEG', division: 'P',
    assignment: 'FLY', assignmentGroup: 'FLY', fleet: '',
    schStrDtUtc: '2026-03-02T08:00:00.000Z', schEndDtUtc: '2026-03-02T16:00:00.000Z',
    compositions: [{ rank: 'CA', plan: 1, fill: 0 }],
  },
  {
    pairingId: 9002, pairingLabel: 'F-PILOT-2', base: 'YEG', division: 'P',
    assignment: 'FLY', assignmentGroup: 'FLY', fleet: '',
    schStrDtUtc: '2026-03-03T08:00:00.000Z', schEndDtUtc: '2026-03-03T16:00:00.000Z',
    compositions: [{ rank: 'CA', plan: 2, fill: 1 }],
  },
  {
    pairingId: 9003, pairingLabel: 'F-CABIN-1', base: 'YEG', division: 'C',
    assignment: 'FLY', assignmentGroup: 'FLY', fleet: '',
    schStrDtUtc: '2026-03-04T08:00:00.000Z', schEndDtUtc: '2026-03-04T16:00:00.000Z',
    compositions: [{ rank: 'FA', plan: 1, fill: 1 }],
  },
]

const MOCK_FLIGHTS = [
  {
    id: 7001, fltNum: '301', depArp: 'YEG', arvArp: 'YYZ',
    fleet: 'B737', register: 'C-FREG1',
    schDepDtUtc: '2026-03-02T08:00:00.000Z', schArvDtUtc: '2026-03-02T12:00:00.000Z',
  },
  {
    id: 7002, fltNum: '302', depArp: 'YYZ', arvArp: 'YEG',
    fleet: 'B737', register: 'C-FREG2',
    schDepDtUtc: '2026-03-03T14:00:00.000Z', schArvDtUtc: '2026-03-03T18:00:00.000Z',
  },
]

const MOCK_GANTT_DATA = {
  scenarioId: DEMO_SCENARIO_ID,
  scenarioName: DEMO_SCENARIO_NAME,
  fileType: 'RO' as const,
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  scenarioStrDt: '2026-03-01T00:00:00.000Z',
  scenarioEndDt: '2026-03-31T23:59:59.000Z',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: MOCK_CREW,
  pairings: MOCK_PAIRINGS,
  assignments: [
    { crewId: 'C0001', pairingId: 9001, source: 'CR' as const },
    { crewId: 'C0002', pairingId: 9002, source: 'CR' as const },
  ],
  pairingSegments: MOCK_PAIRINGS.map((p, i) => ({
    pairingId: p.pairingId, dutySeq: 1, segSeq: 1, fltId: 7001 + i,
    fltNum: `30${i + 1}`, airline: 'F8', depArp: 'YEG', arvArp: 'YYZ',
    segAssignment: 'FLY',
    schStrDtUtc: p.schStrDtUtc, schEndDtUtc: p.schEndDtUtc,
    dutyStrArp: 'YEG', dutyEndArp: 'YYZ',
    dutySchStrDtUtc: p.schStrDtUtc, dutySchEndDtUtc: p.schEndDtUtc,
    dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: 480,
    brief1StartUtc: p.schStrDtUtc, brief1EndUtc: p.schStrDtUtc,
    debrief1StartUtc: p.schEndDtUtc, debrief1EndUtc: p.schEndDtUtc,
    pickup1StartUtc: p.schStrDtUtc, pickup1EndUtc: p.schStrDtUtc,
    dropoff1StartUtc: p.schEndDtUtc, dropoff1EndUtc: p.schEndDtUtc,
  })),
  flights: MOCK_FLIGHTS,
  groundItems: [],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

// ── Helpers ───────────────────────────────────────────────────────────────────

const pairingRows = async (page: import('@playwright/test').Page) =>
  (await paneRenderStat(page, 'pairing'))?.totalRows ?? -1

const flightRows = async (page: import('@playwright/test').Page) =>
  (await paneRenderStat(page, 'flight'))?.totalRows ?? -1

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('Scenario Pane Canvas Refactor — shared PaneCanvas (Scen-2019/2020/2021 rewrite)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
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
    // Roster + pairing are open by default; wait for all 3 pairing rows
    await expect
      .poll(() => pairingRows(page), { timeout: 8_000, message: '3 mock pairings must render' })
      .toBe(3)
  })

  test('Scen-2019 — pairing pane: pane-filter-button accessible and row count shown in toolbar @smoke', async ({ page }) => {
    // Default state: roster (nth 0) + pairing (nth 1) — 2 filter buttons visible
    await expect(page.getByTestId('pane-filter-button')).toHaveCount(2)
    await expect(page.getByTestId('pane-filter-button').nth(1)).toBeVisible()

    // Scenario pane toolbar (paneId='pairing-1' by default) displays row count
    const toolbar = page.getByTestId('sg-pane-toolbar-pairing-1')
    await expect(toolbar).toBeVisible()
    await expect(toolbar).toContainText('3')
  })

  test('Scen-2020 — flight pane: PaneCanvas renders — filter button visible and dialog opens', async ({ page }) => {
    await page.getByTestId('sg-add-pane-flight').click()
    // Two mock flights (distinct registrations) → 2 aircraft rows in the flight pane
    await expect
      .poll(() => flightRows(page), { timeout: 8_000, message: '2 mock flights must render' })
      .toBe(2)

    // Three filter buttons: roster (0), pairing (1), flight (2)
    await expect(page.getByTestId('pane-filter-button')).toHaveCount(3)

    // Open the flight filter dialog via the third button
    await page.getByTestId('pane-filter-button').nth(2).click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })

    // Dialog opens on the Flight tab (initialTab="flight" in SharedFlightPane)
    await expect(page.getByTestId('filter-tab-flight')).toHaveAttribute('data-active', 'true')

    // Flight-specific filter fields are present
    await expect(page.getByTestId('filter-flight-dep')).toBeVisible()
    await expect(page.getByTestId('filter-flight-arr')).toBeVisible()
  })

  test('Scen-2021 — pairing + flight panes open simultaneously without crash @smoke', async ({ page }) => {
    await page.getByTestId('sg-add-pane-flight').click()

    // All three filter buttons present once flight pane is mounted
    await expect(page.getByTestId('pane-filter-button')).toHaveCount(3, { timeout: 10_000 })

    // Gantt view remains intact — no crash or unhandled error
    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible()
    // No loading overlay — all panes have mounted successfully
    await expect(page.getByText('Loading scenario data…')).toHaveCount(0)
  })
})
