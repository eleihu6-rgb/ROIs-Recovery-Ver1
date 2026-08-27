/**
 * Scenario Roster convergence regression (P1 — final task).
 *
 * The Scenario Roster pane used to render through its own forked canvas
 * (`ScenarioGanttCanvas` + `ScenarioGanttLeftPanel`). Those forks drifted from
 * the Live roster pane and have now been deleted: the Scenario Roster pane
 * renders through the SAME shared `PaneCanvas` + `PaneHeaderCanvas` as Live.
 *
 * This test GUARDS that convergence — it proves the Scenario Roster pane mounts
 * the shared PaneCanvas (testid `scenario-roster-canvas`, paneType
 * `scenario-roster`, paneId `roster-1`) and that the canvas drew a NON-ZERO,
 * known number of crew rows. If a future change re-forks the scenario roster
 * onto a bespoke canvas, this guard fails.
 *
 * Proof model (§No-Illusion): the assertion reads the in-app render-introspection
 * hook `window.__ganttTest.render()` — the per-pane draw receipt published by
 * PaneCanvas itself (paneId / paneType / totalRows / renders). A `totalRows`
 * equal to the mocked crew count proves the SHARED canvas drew the real crew
 * rows, not merely "the canvas has some pixels".
 *
 * Scenario data: the demo engine-server returns 502 for
 * /api/scenario/:id/gantt-data (documented in perf-scenario-canvas-raf.spec.ts),
 * so the scenario gantt-data + lock-status APIs are intercepted with a
 * deterministic mock carrying crew + assignments + a pairing with a segment, so
 * the roster renders non-zero rows independent of the engine-server.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, renderStats, type PaneRenderStat } from '../../utils/gantt-hook'

/** Demo DONE RO scenario used to open the Scenario Gantt view (same as scenario-source-geometry). */
const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const DEMO_SCENARIO_ID = 6

/** Known crew count: the Scenario Roster pane renders one row per crew → totalRows must equal this. */
const CREW_COUNT = 10

/** One pairing + segment so the roster has at least one drawn task (non-empty pane). */
const MOCK_PAIRINGS = [
  {
    pairingId: 2000,
    pairingLabel: 'P2000',
    base: 'YEG',
    schStrDtUtc: '2026-03-02T08:00:00.000Z',
    schEndDtUtc: '2026-03-02T16:00:00.000Z',
    assignmentGroup: 'FLT',
    assignment: 'FLT',
    division: 'Pilots',
    compositions: [{ rank: 'CA', plan: 1, fill: 1 }],
  },
]

const MOCK_PAIRING_SEGMENTS = [
  {
    pairingId: 2000,
    dutySeq: 1,
    segSeq: 1,
    fltId: 6000,
    fltDt: '2026-03-02',
    fltNum: '2000',
    airline: 'F8',
    depArp: 'YEG',
    arvArp: 'YYZ',
    segAssignment: 'FLT',
    schStrDtUtc: '2026-03-02T08:00:00.000Z',
    schEndDtUtc: '2026-03-02T16:00:00.000Z',
    dutyStrArp: 'YEG',
    dutyEndArp: 'YYZ',
    dutySchStrDtUtc: '2026-03-02T08:00:00.000Z',
    dutySchEndDtUtc: '2026-03-02T16:00:00.000Z',
    dutySchRestMin: null,
    dutyActRestMin: null,
    dutyActCreditedMinutes: 480,
    brief1StartUtc: '2026-03-02T08:00:00.000Z',
    brief1EndUtc: '2026-03-02T08:00:00.000Z',
    debrief1StartUtc: '2026-03-02T16:00:00.000Z',
    debrief1EndUtc: '2026-03-02T16:00:00.000Z',
    pickup1StartUtc: '2026-03-02T08:00:00.000Z',
    pickup1EndUtc: '2026-03-02T08:00:00.000Z',
    dropoff1StartUtc: '2026-03-02T16:00:00.000Z',
    dropoff1EndUtc: '2026-03-02T16:00:00.000Z',
  },
]

const MOCK_GANTT_DATA = {
  scenarioId: DEMO_SCENARIO_ID,
  scenarioName: DEMO_SCENARIO_NAME,
  fileType: 'RO' as const,
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  // Required by ScenarioGanttView's updateZoomBounds (.slice on first load) — view crashes without them.
  scenarioStrDt: '2026-03-01T00:00:00',
  scenarioEndDt: '2026-03-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: Array.from({ length: CREW_COUNT }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`,
    base: 'YEG',
    division: 'Pilots',
    rank: i % 2 === 0 ? 'CA' : 'FO',
    seniorityNum: String(i + 1),
    crewName: `Crew ${i + 1}`,
  })),
  pairings: MOCK_PAIRINGS,
  // Assign the pairing to the first crew so a roster task is drawn.
  assignments: [{ crewId: 'C0001', pairingId: 2000, source: 'CR' as const }],
  pairingSegments: MOCK_PAIRING_SEGMENTS,
  flights: [],
  groundItems: [],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

test.describe('Scenario Roster convergence — shared PaneCanvas guard', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Scen-2007 — scenario roster pane renders via the shared PaneCanvas with the known crew row count', async ({ page }) => {
    // Intercept the scenario gantt-data + lock-status APIs (engine-server 502s in
    // the demo env) with a deterministic mock carrying real crew + a pairing seg,
    // so the scenario roster pane builds non-zero rows independent of the backend.
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

    // ── Step 1: open the demo scenario — the default layout mounts the roster pane ──
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()

    // The demo DB now holds several copies named "RO-2026-06 YEG Test---" (#6/#460/#467),
    // so filter by name AND pin to the #6 id (the mocked DEMO_SCENARIO_ID) — matches the
    // sibling violation-bell spec; a plain name filter resolves to 3 rows.
    await page.getByPlaceholder('Search scenarios…').fill(DEMO_SCENARIO_NAME)
    const item = page.getByTestId('scenario-list-item').filter({
      has: page.getByTestId('scenario-item-id').getByText(`#${DEMO_SCENARIO_ID}`, { exact: true }),
    })
    await expect(item, `demo scenario #${DEMO_SCENARIO_ID} must exist in demo DB`).toBeVisible({ timeout: 10_000 })
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-status-badge')).toHaveText('Done')

    await scenario.detailPanel.getByTestId('scenario-open-btn').click()

    const ganttView = page.getByTestId('scenario-gantt-view')
    await expect(ganttView).toBeVisible({ timeout: 10_000 })

    // ── Step 2: the SHARED PaneCanvas must be visible (proves convergence) ──
    // `scenario-roster-canvas` is the canvasTestId passed to the shared <PaneCanvas>
    // by scenario-roster-pane.tsx — NOT a bespoke fork canvas.
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })

    // ── Step 3: read the per-pane draw receipt and assert the known row count ──
    // Both the content <PaneCanvas> and the left <PaneHeaderCanvas> publish under
    // paneType 'scenario-roster'; the CONTENT canvas (the converged gantt surface)
    // is keyed by the layout paneId 'roster-1' (the header is 'roster-1:header').
    // Pin the lookup to paneId 'roster-1' so we assert the content canvas's draw.
    const rosterContentStat = (stats: PaneRenderStat[]): PaneRenderStat | undefined =>
      stats.find((s) => s.paneId === 'roster-1' && s.paneType === 'scenario-roster')

    await expect
      .poll(async () => rosterContentStat(await renderStats(page))?.totalRows ?? 0, {
        timeout: 15_000,
        message: 'scenario roster PaneCanvas never published its crew rows',
      })
      .toBe(CREW_COUNT)

    const rosterStat = rosterContentStat(await renderStats(page))

    expect(rosterStat, 'scenario roster must publish a PaneCanvas render entry (shared canvas)').toBeTruthy()
    // The default scenario layout's roster pane id is 'roster-1' — the SAME id the
    // Live roster pane uses, confirming the shared layout/canvas path.
    expect(rosterStat!.paneId, 'scenario roster content pane id (shared layout)').toBe('roster-1')
    // Specific assertion (not toBeVisible-only): the shared canvas drew the exact
    // mocked crew count — one row per crew.
    expect(
      rosterStat!.totalRows,
      `scenario roster must render exactly ${CREW_COUNT} crew rows`,
    ).toBe(CREW_COUNT)
    expect(
      rosterStat!.renders,
      'scenario roster PaneCanvas must have completed at least one draw',
    ).toBeGreaterThan(0)
  })
})
