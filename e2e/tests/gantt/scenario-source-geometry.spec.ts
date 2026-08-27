/**
 * Cross-mode rendering-geometry regression (source-abstraction refactor, Task 10).
 *
 * After the GanttPaneSource abstraction, the Live pairing pane and the Scenario
 * pairing pane render through the SAME shared `PaneCanvas`. Before the refactor
 * the two had forked into separate canvas implementations and drifted apart.
 *
 * This is the P0 minimal cross-mode guard: it asserts that BOTH modes actually
 * draw their pairing pane through the shared PaneCanvas, producing a render-stats
 * entry with a NON-ZERO row count (proving real pairing data was rendered, not an
 * empty pane). P1 will strengthen this to per-row X-geometry equivalence once the
 * roster pane also converges onto the shared source.
 *
 * Proof model (§No-Illusion): assertions read the in-app render-introspection
 * hook `window.__ganttTest.render()` — the per-pane draw receipt published by
 * PaneCanvas itself (paneId / paneType / totalRows / renders). A non-empty
 * `totalRows` on a `pairing` entry proves the canvas drew real rows, not "the
 * canvas has some pixels".
 *
 * The hook is published only in non-PROD builds (gantt-test-hook.ts:
 * publishRenderStats early-returns when import.meta.env.PROD). The Playwright
 * webServer starts the gantt via `vite` (dev) → PROD === false → the hook runs.
 *
 * Scenario data: the demo engine-server returns 502 for
 * /api/scenario/:id/gantt-data (documented in perf-scenario-canvas-raf.spec.ts),
 * so the scenario gantt-data API is intercepted with a deterministic mock that
 * carries real pairings + pairing segments. This makes the scenario pairing pane
 * render NON-ZERO rows independent of the engine-server, isolating the test to
 * the rendering-geometry guard it is meant to protect.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  seedGanttAuth,
  renderStats,
  paneRenderStat,
  type PaneRenderStat,
} from '../../utils/gantt-hook'

/** Demo DONE RO scenario used to open the Scenario Gantt view (same as perf-scenario-canvas-raf). */
const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const DEMO_SCENARIO_ID = 6

/**
 * Mock ScenarioGanttData with real pairings + segments so the scenario pairing
 * pane builds non-zero rows. Shapes follow gantt/src/types/scenario-gantt.ts.
 */
const PAIRING_COUNT = 6
const MOCK_PAIRINGS = Array.from({ length: PAIRING_COUNT }, (_, i) => ({
  pairingId: 1000 + i,
  pairingLabel: `P${1000 + i}`,
  base: 'YEG',
  schStrDtUtc: `2026-03-${String(2 + i).padStart(2, '0')}T08:00:00.000Z`,
  schEndDtUtc: `2026-03-${String(2 + i).padStart(2, '0')}T16:00:00.000Z`,
  assignmentGroup: 'FLT',
  assignment: 'FLT',
  division: 'Pilots',
  compositions: [{ rank: 'CA', plan: 1, fill: 1 }],
}))

const MOCK_PAIRING_SEGMENTS = MOCK_PAIRINGS.map((p, i) => ({
  pairingId: p.pairingId,
  dutySeq: 1,
  segSeq: 1,
  fltId: 5000 + i,
  fltDt: `2026-03-${String(2 + i).padStart(2, '0')}`,
  fltNum: `100${i}`,
  airline: 'F8',
  depArp: 'YEG',
  arvArp: 'YYZ',
  segAssignment: 'FLT',
  schStrDtUtc: p.schStrDtUtc,
  schEndDtUtc: p.schEndDtUtc,
  dutyStrArp: 'YEG',
  dutyEndArp: 'YYZ',
  dutySchStrDtUtc: p.schStrDtUtc,
  dutySchEndDtUtc: p.schEndDtUtc,
  dutySchRestMin: null,
  dutyActRestMin: null,
  dutyActCreditedMinutes: 480,
  brief1StartUtc: p.schStrDtUtc,
  brief1EndUtc: p.schStrDtUtc,
  debrief1StartUtc: p.schEndDtUtc,
  debrief1EndUtc: p.schEndDtUtc,
  pickup1StartUtc: p.schStrDtUtc,
  pickup1EndUtc: p.schStrDtUtc,
  dropoff1StartUtc: p.schEndDtUtc,
  dropoff1EndUtc: p.schEndDtUtc,
}))

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
  crew: Array.from({ length: 10 }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`,
    base: 'YEG',
    division: 'Pilots',
    rank: i % 2 === 0 ? 'CA' : 'FO',
    seniorityNum: String(i + 1),
    crewName: `Crew ${i + 1}`,
  })),
  pairings: MOCK_PAIRINGS,
  assignments: MOCK_PAIRINGS.map((p, i) => ({
    crewId: `C${String((i % 10) + 1).padStart(4, '0')}`,
    pairingId: p.pairingId,
    source: 'CR' as const,
  })),
  pairingSegments: MOCK_PAIRING_SEGMENTS,
  flights: [],
  groundItems: [],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

test.describe('Source abstraction — cross-mode pairing geometry guard', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('pairing pane renders via shared PaneCanvas in both live and scenario modes', async ({ page }) => {
    // ── LIVE MODE ─────────────────────────────────────────────────────────
    // The default Live layout mounts the pairing pane (paneType 'pairing') via
    // the shared PaneCanvas. goto() switches to Live and waits until every
    // visible data pane has shown its objects (ready() — non-zero counts AND a
    // draw receipt). Then read the pairing pane's draw receipt directly.
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()

    // Concrete signal that data rendered: pairing canvas element present.
    await expect(dashboard.pairingCanvas).toBeVisible()

    const liveStats = await renderStats(page)
    const livePairing = liveStats.find((s: PaneRenderStat) => s.paneType === 'pairing')

    expect(livePairing, 'Live mode must publish a pairing PaneCanvas render entry').toBeTruthy()
    // Specific assertion (not toBeVisible-only): the shared canvas drew real rows.
    expect(
      livePairing!.totalRows,
      'Live pairing pane must render a non-zero number of pairing rows',
    ).toBeGreaterThan(0)
    expect(
      livePairing!.renders,
      'Live pairing PaneCanvas must have completed at least one draw',
    ).toBeGreaterThan(0)
    const liveRows = livePairing!.totalRows

    // ── SCENARIO MODE ─────────────────────────────────────────────────────
    // Intercept the scenario gantt-data + lock-status APIs (engine-server 502s
    // in the demo env) with a deterministic mock carrying real pairings, so the
    // scenario pairing pane builds non-zero rows. It renders through the SAME
    // shared PaneCanvas as Live (scenario-pairing-pane.tsx → PaneCanvas,
    // paneType 'pairing').
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

    const item = scenario.listItemByName(DEMO_SCENARIO_NAME)
    await expect(item, `demo scenario "${DEMO_SCENARIO_NAME}" must exist in demo DB`).toHaveCount(1)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-status-badge')).toHaveText('Done')

    await scenario.detailPanel.getByTestId('scenario-open-btn').click()

    const ganttView = page.getByTestId('scenario-gantt-view')
    await expect(ganttView).toBeVisible({ timeout: 10_000 })

    // The default scenario layout already mounts a pairing pane; its filter
    // button (PaneConditionStrip via the shared infra) proves the pane mounted.
    await expect(page.getByTestId('sg-pairing-filter-btn')).toBeVisible({ timeout: 10_000 })

    // Wait until the scenario pairing PaneCanvas has published a draw receipt
    // with the mocked pairing rows. The renderStats Map is keyed by paneId; the
    // scenario pairing pane uses 'pairing-1' (same id Live used), so the receipt
    // is overwritten with the scenario draw once it paints — we assert on the
    // CURRENT (scenario) value here, after navigating into scenario mode.
    await expect
      .poll(
        async () => (await paneRenderStat(page, 'pairing'))?.totalRows ?? 0,
        {
          timeout: 15_000,
          message: 'scenario pairing PaneCanvas never published non-zero rows',
        },
      )
      .toBeGreaterThan(0)

    const scenarioStats = await renderStats(page)
    const scenarioPairing = scenarioStats.find((s: PaneRenderStat) => s.paneType === 'pairing')

    expect(scenarioPairing, 'Scenario mode must publish a pairing PaneCanvas render entry').toBeTruthy()
    expect(
      scenarioPairing!.totalRows,
      'Scenario pairing pane must render a non-zero number of pairing rows',
    ).toBeGreaterThan(0)
    expect(
      scenarioPairing!.renders,
      'Scenario pairing PaneCanvas must have completed at least one draw',
    ).toBeGreaterThan(0)
    // The scenario pane renders exactly the mocked pairings → row count is known.
    expect(
      scenarioPairing!.totalRows,
      `Scenario pairing rows must match the ${PAIRING_COUNT} mocked pairings`,
    ).toBe(PAIRING_COUNT)

    // ── CROSS-MODE GUARD ──────────────────────────────────────────────────
    // Both Live and Scenario produced a 'pairing' PaneCanvas render entry with
    // non-zero rows. This is the P0 minimal guard against the two modes forking
    // their canvas again. P1 will strengthen it to per-row X-geometry
    // equivalence once the roster pane also converges onto the shared source.
    expect(liveRows, 'Live pairing pane rendered rows (cross-mode guard)').toBeGreaterThan(0)
    expect(
      scenarioPairing!.totalRows,
      'Scenario pairing pane rendered rows (cross-mode guard)',
    ).toBeGreaterThan(0)
  })
})
