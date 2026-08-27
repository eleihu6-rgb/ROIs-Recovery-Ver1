/**
 * Pairing pane Base column — regression spec (Task 5).
 *
 * Spec ID: Scen-2011
 *
 * What we prove (RENDER-LEVEL, not config — see history below):
 *  1. The pairing header Canvas actually DRAWS a "Base" column, after pairingId and before type.
 *  2. The drawn Base column box fits within the painted canvas width (not clipped off-screen).
 *  3. The Base CELL the Canvas drew for the first row carries the real base ('YVR').
 *
 * Both Live and Scenario share the same DEFAULT_PAIRING_COLUMNS (§Gantt-Unify), so a single
 * scenario-mode assertion covers both paths.
 *
 * Strategy: mock the gantt-data endpoint with YVR-based pairings so the test is deterministic
 * and does not depend on the remote Postgres being warm (mirrors pairing-coverage-default.spec.ts).
 *
 * Assert via window.__ganttTest RENDER RECEIPT (§No-Illusion). Earlier this spec asserted
 * pairingColumns()/scenarioPairings() — the column-STORE config and the data STORE — which pass
 * even if the renderer never paints the column. We now assert the receipt PaneHeaderCanvas.render()
 * publishes from the exact visibleColumns + rows.values its draw loop fillText()s:
 *  - renderedColumns('pairing')     → the columns actually drawn, in draw order
 *  - renderedHeaderWidth('pairing')  → the header canvas pixel width (clip check)
 *  - renderedRow('pairing', 0)       → the cell values actually drawn for row 0
 */

import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import {
  seedGanttAuth,
  seedScenarioListMocks,
  paneRenderStat,
} from '../../utils/gantt-hook'

const DEMO_SCENARIO_ID = 6
const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'

const mkPairing = (id: number, label: string, base: string) => ({
  pairingId: id,
  pairingLabel: label,
  base,
  division: 'P',
  assignment: 'DOM',
  assignmentGroup: 'GRP',
  fleet: '73H',
  schStrDtUtc: '2026-06-02T08:00:00.000Z',
  schEndDtUtc: '2026-06-02T16:00:00.000Z',
  compositions: [{ rank: 'CA', plan: 1, fill: 0 }],
})

const MOCK_PAIRINGS = [
  mkPairing(2001, 'YVR001', 'YVR'),
  mkPairing(2002, 'YVR002', 'YVR'),
]

const MOCK_PAIRING_SEGMENTS = MOCK_PAIRINGS.map((p, i) => ({
  pairingId: p.pairingId,
  dutySeq: 1, segSeq: 1,
  fltId: 7000 + i,
  fltDt: '2026-06-02',
  fltNum: `F${i + 1}`,
  airline: 'F8',
  depArp: 'YVR',
  arvArp: 'YYZ',
  segAssignment: 'FLY',
  schStrDtUtc: p.schStrDtUtc,
  schEndDtUtc: p.schEndDtUtc,
  dutyStrArp: 'YVR',
  dutyEndArp: 'YYZ',
  dutySchStrDtUtc: p.schStrDtUtc,
  dutySchEndDtUtc: p.schEndDtUtc,
  dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: 480,
  brief1StartUtc: p.schStrDtUtc, brief1EndUtc: p.schStrDtUtc,
  debrief1StartUtc: p.schEndDtUtc, debrief1EndUtc: p.schEndDtUtc,
  pickup1StartUtc: p.schStrDtUtc, pickup1EndUtc: p.schStrDtUtc,
  dropoff1StartUtc: p.schEndDtUtc, dropoff1EndUtc: p.schEndDtUtc,
}))

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
  crew: Array.from({ length: 2 }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`,
    base: 'YVR',
    division: 'Pilots',
    rank: 'CA',
    seniorityNum: String(i + 1),
    crewName: `Crew ${i + 1}`,
  })),
  pairings: MOCK_PAIRINGS,
  assignments: [
    { crewId: 'C0001', pairingId: 2001, source: 'CR' as const },
  ],
  pairingSegments: MOCK_PAIRING_SEGMENTS,
  flights: [],
  groundItems: [],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

const MOCK_LIVE_PAIRINGS = MOCK_PAIRINGS.map((p, i) => ({
  id: p.pairingId,
  pairingLabel: p.pairingLabel,
  filiale: 'F8',
  division: p.division,
  base: p.base,
  fleet: p.fleet,
  assignmentGroup: p.assignmentGroup,
  assignment: p.assignment,
  schStrDtUtc: p.schStrDtUtc,
  schEndDtUtc: p.schEndDtUtc,
  actStrDtUtc: p.schStrDtUtc,
  actEndDtUtc: p.schEndDtUtc,
  durationDays: 1,
  tafb: 3,
  dutyCount: 1,
  segCount: 1,
  blockMinutes: 240,
  ver: 0,
  isDeleted: 0,
  source: null,
  tags: null,
  comments: null,
  pairingDt: '2026-06-02',
  composition: [{ rank: 'CA', plan: 1, fill: 0 }],
  isFull: false,
  segments: [MOCK_PAIRING_SEGMENTS[i]],
}))

// ── Live-1290: legacy Live pairing pane maps pairing.base into header cells ─────

test('Live-1290 — Live pairing pane draws non-empty Base cells from pairing.base', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await page.route('**/api/pairing**', (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.endsWith('/api/pairing')) {
      void route.continue()
      return
    }
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: { items: MOCK_LIVE_PAIRINGS, total: MOCK_LIVE_PAIRINGS.length, page: 1, pageSize: 0, totalPages: 1 },
        message: 'ok',
      }),
    })
  })

  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto()
  await dashboard.expectPairingPaneVisible()

  await expect
    .poll(
      async () => (await paneRenderStat(page, 'pairing'))?.totalRows ?? -1,
      { timeout: 10_000, message: 'Live pairing pane must render rows' },
    )
    .toBeGreaterThan(0)

  const row0 = await page.evaluate(
    (): Record<string, string> | null => window.__ganttTest!.renderedRow('pairing', 0),
  )
  expect(row0, 'Live pairing header canvas must have drawn at least one row').not.toBeNull()
  expect(row0!.base, 'Live pairing Base cell must be populated from pairing.base').toBe('YVR')
  expect(row0!.type, 'Live pairing Tp cell must be populated from pairing.assignmentGroup').toBe('GRP')
})

// ── Scen-2011: pairing pane shows a Base column with real base values ─────────

test('Scen-2011 — pairing pane shows a visible Base column and populates it with the pairing base (YVR)', async ({ page }) => {
  await seedGanttAuth(page, page.request)
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

  // Wait until the pairing pane has rendered at least one row.
  await expect
    .poll(
      async () => (await paneRenderStat(page, 'pairing'))?.totalRows ?? -1,
      { timeout: 8_000, message: 'pairing pane must render rows' },
    )
    .toBeGreaterThan(0)

  // Assert on what the PAIRING HEADER CANVAS ACTUALLY DREW (render receipt), not the
  // column-store config. renderedColumns/renderedRow/renderedHeaderWidth are published by
  // PaneHeaderCanvas.render() from the exact visibleColumns + rows.values its draw loop
  // fillText()s — so these fail if the Base column is configured but never painted.
  type RenderedCol = { key: string; label: string; width: number }
  const drawn = await page.evaluate(
    (): RenderedCol[] => window.__ganttTest!.renderedColumns('pairing'),
  )
  const headerWidth = await page.evaluate(
    (): number => window.__ganttTest!.renderedHeaderWidth('pairing'),
  )

  // ── Assert 1: the Canvas drew a "Base" header, after pairingId and before type. ──
  const drawnKeys = drawn.map((c) => c.key)
  const pairingIdx = drawnKeys.indexOf('pairingId')
  const baseIdx = drawnKeys.indexOf('base')
  const typeIdx = drawnKeys.indexOf('type')
  expect(baseIdx, `Canvas must have DRAWN a "base" column (drew: [${drawnKeys.join(', ')}])`).toBeGreaterThanOrEqual(0)
  expect(drawn[baseIdx].label, 'the drawn base column must be labelled "Base"').toBe('Base')
  expect(pairingIdx, '"pairingId" must have been drawn').toBeGreaterThanOrEqual(0)
  expect(typeIdx, '"type" must have been drawn').toBeGreaterThanOrEqual(0)
  expect(baseIdx, '"base" must be drawn AFTER "pairingId"').toBeGreaterThan(pairingIdx)
  expect(typeIdx, '"type" must be drawn AFTER "base"').toBeGreaterThan(baseIdx)

  // ── Assert 2: the Base column box fits within the painted canvas (not clipped off-screen). ──
  const baseRightEdge = drawn.slice(0, baseIdx + 1).reduce((sum, c) => sum + c.width, 0)
  expect(headerWidth, 'header canvas must report a measured pixel width').toBeGreaterThan(0)
  expect(
    baseRightEdge,
    `Base column right edge (${baseRightEdge}px) must fit within the header canvas (${headerWidth}px) — else it is clipped and invisible`,
  ).toBeLessThanOrEqual(headerWidth)

  // ── Assert 3: the Base CELL the Canvas drew for the first row carries the real base ('YVR'). ──
  const row0 = await page.evaluate(
    (): Record<string, string> | null => window.__ganttTest!.renderedRow('pairing', 0),
  )
  expect(row0, 'Canvas must have drawn at least one pairing row').not.toBeNull()
  expect(
    row0!.base,
    `the drawn Base cell for row 0 must be 'YVR' (got '${String(row0?.base)}')`,
  ).toBe('YVR')
  expect(
    row0!.type,
    `the drawn Tp cell for row 0 must be assignmentGroup 'GRP', not assignment '${MOCK_PAIRINGS[0].assignment}'`,
  ).toBe('GRP')
})

// ── Scen-2013: existing users with a STALE persisted column config still get Base ─────
//
// The real-world bug behind "I don't see Base on F301": the pairing columns are persisted in
// localStorage['gantt-column-config']. A user whose stored config predates the Base column —
// and whose stored schema version does NOT trigger the reset — keeps the old 4-column set, so
// Base never appears even though the build ships it. Scen-2011 runs in a fresh context (no
// localStorage) so it could never catch this. This test SEEDS a stale config and proves the
// schema-version migration resets it so the Canvas draws Base.

test('Scen-2013 — a stale persisted pairing column config (no Base) migrates so Base still renders', async ({ page }) => {
  await seedGanttAuth(page, page.request)
  await seedScenarioListMocks(page, DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)

  // Seed a stale persisted config BEFORE the app boots: schema v4 (the version that shipped the
  // Base column) but with a pairing array that LACKS base — i.e. exactly the broken state an
  // existing user is stuck in. The migration must reset this to the current defaults.
  await page.addInitScript(() => {
    localStorage.setItem(
      'gantt-column-config',
      JSON.stringify({
        v: 4,
        cols: {
          pairing: [
            { key: 'pairingId', label: 'Pairing', width: 54, visible: true, order: 1, row: 1 },
            { key: 'type', label: 'Tp', width: 32, visible: true, order: 2, row: 1 },
            { key: 'fleet', label: 'Fleet', width: 60, visible: true, order: 3, row: 1 },
            { key: 'cred', label: 'Cred', width: 52, visible: true, order: 4, row: 1 },
          ],
        },
      }),
    )
  })

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
      { timeout: 8_000, message: 'pairing pane must render rows' },
    )
    .toBeGreaterThan(0)

  // Despite the stale stored config, the Canvas must have DRAWN a Base column — proving the
  // schema-version migration reset the stale persisted pairing columns to the current defaults.
  const drawnKeys = await page.evaluate(
    (): string[] => window.__ganttTest!.renderedColumns('pairing').map((c) => c.key),
  )
  expect(
    drawnKeys,
    `stale persisted columns must migrate so Base is drawn (drew: [${drawnKeys.join(', ')}])`,
  ).toContain('base')
})
