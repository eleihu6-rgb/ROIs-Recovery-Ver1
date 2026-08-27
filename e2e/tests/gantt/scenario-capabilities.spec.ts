/**
 * Scenario capability-driven pane visibility guard (P2).
 *
 * P2 added capability gating: the backend derives a `capabilities` block per
 * scenario type and the frontend gates which panes mount, which add-pane toolbar
 * buttons render, and the layout default:
 *   - PO scenarios → panes [pairing, flight]: NO roster pane, NO roster add-button.
 *   - RO scenarios → panes [roster, pairing, flight]: roster pane present.
 *
 * This spec proves BOTH halves of that contract:
 *   Scen-2008 — a PO scenario HIDES roster (no roster add-button, no
 *               scenario-roster-canvas, no 'scenario-roster' render entry), while
 *               the pairing pane still renders.
 *   Scen-2009 — an RO scenario SHOWS roster (scenario-roster-canvas mounts and the
 *               shared PaneCanvas publishes a 'scenario-roster' render entry).
 *
 * Proof model (§No-Illusion): assertions read concrete DOM counts and the in-app
 * render-introspection hook `window.__ganttTest.render()` (per-pane draw receipts:
 * paneId / paneType / totalRows / renders) — NOT bare toBeVisible().
 *
 * Scenario data: the demo engine-server returns 502 for
 * /api/scenario/:id/gantt-data (documented in perf-scenario-canvas-raf.spec.ts),
 * so the gantt-data + lock-status APIs are intercepted with deterministic mocks
 * that carry the scenario-type `capabilities` block. The PO mock asserts the gate;
 * the RO mock asserts roster stays.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, renderStats, type PaneRenderStat } from '../../utils/gantt-hook'

// ── Demo scenarios (confirmed via GET /api/scenario in the demo DB) ──────────
/** DONE PO scenario — its capabilities hide roster. */
const PO_SCENARIO_ID = 4
const PO_SCENARIO_NAME = '4-PO-2026-03 Mar Final'
/** DONE RO scenario — its capabilities keep roster (same as scenario-roster-shared-canvas). */
const RO_SCENARIO_ID = 6
const RO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'

const CREW_COUNT = 10
const PAIRING_COUNT = 4

/** Capability blocks mirroring the server-side derivation (gantt-pane-source.ts shapes). */
const PO_CAPABILITIES = {
  panes: ['pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: false, canRemove: false, canReassign: false },
  pairing: { canEditSegments: false },
}
const RO_CAPABILITIES = {
  panes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

const mockPairings = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    pairingId: 3000 + i,
    pairingLabel: `P${3000 + i}`,
    base: 'YEG',
    schStrDtUtc: `2026-03-${String(2 + i).padStart(2, '0')}T08:00:00.000Z`,
    schEndDtUtc: `2026-03-${String(2 + i).padStart(2, '0')}T16:00:00.000Z`,
    assignmentGroup: 'FLT',
    assignment: 'FLT',
    division: 'Pilots',
    compositions: [{ rank: 'CA', plan: 1, fill: 1 }],
  }))

const mockSegments = (pairings: ReturnType<typeof mockPairings>) =>
  pairings.map((p, i) => ({
    pairingId: p.pairingId,
    dutySeq: 1,
    segSeq: 1,
    fltId: 7000 + i,
    fltDt: `2026-03-${String(2 + i).padStart(2, '0')}`,
    fltNum: `300${i}`,
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

const mockGanttData = (opts: {
  scenarioId: number
  scenarioName: string
  fileType: 'PO' | 'RO'
  capabilities: typeof PO_CAPABILITIES
}) => {
  const pairings = mockPairings(PAIRING_COUNT)
  return {
    scenarioId: opts.scenarioId,
    scenarioName: opts.scenarioName,
    fileType: opts.fileType,
    capabilities: opts.capabilities,
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
    pairings,
    assignments: pairings.map((p, i) => ({
      crewId: `C${String((i % CREW_COUNT) + 1).padStart(4, '0')}`,
      pairingId: p.pairingId,
      source: 'CR' as const,
    })),
    pairingSegments: mockSegments(pairings),
    flights: [],
    groundItems: [],
    crewStats: {},
  }
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

const interceptScenario = async (
  page: import('@playwright/test').Page,
  id: number,
  data: ReturnType<typeof mockGanttData>,
): Promise<void> => {
  await page.route(`**/api/scenario/${id}/gantt-data`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data, message: 'ok' }),
    }),
  )
  await page.route(`**/api/scenario/${id}/lock-status`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: MOCK_LOCK_STATUS, message: 'ok' }),
    }),
  )
}

const openScenario = async (
  scenario: ScenarioPage,
  id: number,
  name: string,
): Promise<void> => {
  // Demo DB holds several copies sharing a display name → search + pin by the unique #<id> chip.
  const item = await scenario.scenarioRow(id, name)
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()
  await expect(scenario.detailPanel.getByTestId('scenario-status-badge')).toHaveText('Done')
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()
  await expect(scenario.page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
}

test.describe('Scenario capability gating — PO hides roster, RO shows roster', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Scen-2008 — PO scenario hides the roster pane and roster add-button', async ({ page }) => {
    await interceptScenario(
      page,
      PO_SCENARIO_ID,
      mockGanttData({
        scenarioId: PO_SCENARIO_ID,
        scenarioName: PO_SCENARIO_NAME,
        fileType: 'PO',
        capabilities: PO_CAPABILITIES,
      }),
    )

    const scenario = new ScenarioPage(page)
    await scenario.gotoPo()
    await openScenario(scenario, PO_SCENARIO_ID, PO_SCENARIO_NAME)

    // The PO scenario gantt mounted (toolbar present). The pairing-pane-present fact is
    // asserted authoritatively below via Gate 3 (render-stats pairing rows); the old
    // `sg-pairing-filter-btn` smoke check was removed when the pane toolbar was refactored.
    await expect(page.getByTestId('scenario-gantt-toolbar')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('sg-scenario-name')).toHaveCount(0)
    await expect(page.getByTestId('module-nav-scenario')).toContainText(PO_SCENARIO_NAME)

    // ── Gate 1: the roster add-pane button is NOT rendered (roster ∉ capabilities.panes). ──
    await expect(page.getByTestId('sg-add-pane-roster')).toHaveCount(0)
    // Pairing add-button is filtered out only because that pane is already open; the
    // flight add-button (allowed but not open) proves the PO toolbar still lists panes.
    await expect(page.getByTestId('sg-add-pane-flight')).toHaveCount(1)

    // ── Gate 2: the scenario roster canvas DOM element is never mounted. ──
    await expect(page.getByTestId('scenario-roster-canvas')).toHaveCount(0)

    // ── Gate 3: wait for the pairing pane to actually draw, then assert via render-stats. ──
    await expect
      .poll(
        async () =>
          (await renderStats(page)).find((s: PaneRenderStat) => s.paneType === 'pairing')?.totalRows ?? 0,
        { timeout: 15_000, message: 'PO scenario pairing pane never published its rows' },
      )
      .toBe(PAIRING_COUNT)

    const stats = await renderStats(page)
    // No 'scenario-roster' draw receipt exists (roster pane never rendered).
    expect(
      stats.filter((s) => s.paneType === 'scenario-roster'),
      'PO scenario must NOT publish any scenario-roster render entry',
    ).toHaveLength(0)
    // The pairing pane DID render its mocked rows.
    const pairing = stats.find((s) => s.paneType === 'pairing')
    expect(pairing, 'PO scenario must publish a pairing render entry').toBeTruthy()
    expect(pairing!.totalRows, `PO pairing pane must render ${PAIRING_COUNT} rows`).toBe(PAIRING_COUNT)
    expect(pairing!.renders, 'PO pairing PaneCanvas must have drawn at least once').toBeGreaterThan(0)
  })

  test('Scen-2009 — RO scenario shows the roster pane', async ({ page }) => {
    await interceptScenario(
      page,
      RO_SCENARIO_ID,
      mockGanttData({
        scenarioId: RO_SCENARIO_ID,
        scenarioName: RO_SCENARIO_NAME,
        fileType: 'RO',
        capabilities: RO_CAPABILITIES,
      }),
    )

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await openScenario(scenario, RO_SCENARIO_ID, RO_SCENARIO_NAME)

    // ── The roster pane (allowed + in defaultPanes) mounts the shared PaneCanvas. ──
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })

    // ── Positive capability: the roster content PaneCanvas (paneId 'roster-1') publishes ──
    // a draw receipt with the known crew row count.
    const rosterContentStat = (stats: PaneRenderStat[]): PaneRenderStat | undefined =>
      stats.find((s) => s.paneId === 'roster-1' && s.paneType === 'scenario-roster')

    await expect
      .poll(async () => rosterContentStat(await renderStats(page))?.totalRows ?? 0, {
        timeout: 15_000,
        message: 'RO scenario roster PaneCanvas never published its crew rows',
      })
      .toBe(CREW_COUNT)

    const rosterStat = rosterContentStat(await renderStats(page))
    expect(rosterStat, 'RO scenario must publish a scenario-roster render entry').toBeTruthy()
    expect(rosterStat!.totalRows, `RO roster pane must render ${CREW_COUNT} crew rows`).toBe(CREW_COUNT)
    expect(rosterStat!.renders, 'RO roster PaneCanvas must have drawn at least once').toBeGreaterThan(0)
  })
})
