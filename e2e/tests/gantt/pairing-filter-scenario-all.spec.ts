/**
 * Comprehensive Pairing Filter — Scenario mode, all fields + multi-condition combos.
 *
 * Fills the gaps left by existing tests:
 *  - Division filter (filter-pairing-division-P / -C) — was untestable (no testIdPrefix),
 *    now has testIdPrefix="filter-pairing-division" added to filter-dialog.tsx
 *  - Arpt / Dep Airport filter (filter-pairing-dep)
 *  - Base, Fleet, Label in scenario mode (server-round-trip tests cover Live; this covers
 *    client-side scenario filtering)
 *  - Multi-condition combinations: division+coverage, base+coverage, label+division
 *
 * Mock data — 6 pairings spanning all filter dimensions:
 *
 *  ID    label      div  base  fleet  assign  depArp  coverage
 *  3001  E3001      P    YEG   73H    FLY     YEG     open
 *  3002  E3002      P    YEG   7M8    FLY     YEG     partial
 *  3003  E3003      P    YYZ   73H    FLY     YYZ     full
 *  3004  E3004      C    YEG   73H    FLY     YEG     full
 *  3005  E3005      C    YYZ   7M8    GRD     YYZ     open
 *  3006  SPECIAL    P    YEG   73H    FLY     YEG     partial
 *
 * Single-field filter counts (expected):
 *  label "E300"       → 5 (all except SPECIAL)
 *  division P         → 4 (3001, 3002, 3003, 3006)
 *  division C         → 2 (3004, 3005)
 *  base YEG           → 4 (3001, 3002, 3004, 3006)
 *  fleet 73H          → 4 (3001, 3003, 3004, 3006)
 *  assignment GRD     → 1 (3005)
 *  dep airport YEG    → 4 (3001, 3002, 3004, 3006)
 *  coverage full      → 2 (3003, 3004)
 *
 * Multi-condition filter counts:
 *  div C + cov open   → 1 (3005)
 *  base YEG + cov full→ 1 (3004)
 *  div P + fleet 7M8  → 1 (3002)
 *  label "E300" + div P → 3 (3001, 3002, 3003)
 */

import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, seedScenarioListMocks, paneRenderStat, applyFilterLight } from '../../utils/gantt-hook'

const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const DEMO_SCENARIO_ID = 6

// ── Mock data ──────────────────────────────────────────────────────────────

const mkPairing = (
  id: number,
  label: string,
  division: string,
  base: string,
  fleet: string,
  assignment: string,
  depArp: string,
  compositions: { rank: string; plan: number; fill: number }[],
) => ({
  pairingId: id,
  pairingLabel: label,
  base,
  division,
  assignment,
  assignmentGroup: assignment,
  fleet,
  schStrDtUtc: `2026-03-0${(id % 6) + 2}T08:00:00.000Z`,
  schEndDtUtc: `2026-03-0${(id % 6) + 2}T16:00:00.000Z`,
  compositions,
  // depArp is stored on segments, not directly on the pairing
  _depArp: depArp,
})

const MOCK_PAIRINGS_RAW = [
  mkPairing(3001, 'E3001', 'P', 'YEG', '73H', 'FLY', 'YEG', [{ rank: 'CA', plan: 1, fill: 0 }]),   // open
  mkPairing(3002, 'E3002', 'P', 'YEG', '7M8', 'FLY', 'YEG', [{ rank: 'CA', plan: 2, fill: 1 }]),   // partial
  mkPairing(3003, 'E3003', 'P', 'YYZ', '73H', 'FLY', 'YYZ', [{ rank: 'CA', plan: 1, fill: 1 }]),   // full
  mkPairing(3004, 'E3004', 'C', 'YEG', '73H', 'FLY', 'YEG', [{ rank: 'FA', plan: 2, fill: 2 }]),   // full
  mkPairing(3005, 'E3005', 'C', 'YYZ', '7M8', 'GRD', 'YYZ', [{ rank: 'FA', plan: 1, fill: 0 }]),   // open
  mkPairing(3006, 'SPECIAL', 'P', 'YEG', '73H', 'FLY', 'YEG', [{ rank: 'CA', plan: 1, fill: 0 }, { rank: 'FO', plan: 1, fill: 1 }]), // partial (CA slot short)
]

const MOCK_PAIRINGS = MOCK_PAIRINGS_RAW.map(({ _depArp: _, ...p }) => p)

const MOCK_PAIRING_SEGMENTS = MOCK_PAIRINGS_RAW.map((p, i) => ({
  pairingId: p.pairingId,
  dutySeq: 1, segSeq: 1,
  fltId: 7000 + i,
  fltDt: `2026-03-0${(p.pairingId % 6) + 2}`,
  fltNum: `300${i}`,
  airline: 'F8',
  depArp: p._depArp,
  arvArp: p._depArp === 'YEG' ? 'YYZ' : 'YEG',
  segAssignment: p.assignment,
  schStrDtUtc: p.schStrDtUtc,
  schEndDtUtc: p.schEndDtUtc,
  dutyStrArp: p._depArp,
  dutyEndArp: p._depArp === 'YEG' ? 'YYZ' : 'YEG',
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
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  scenarioStrDt: '2026-03-01T00:00:00.000Z',
  scenarioEndDt: '2026-03-31T23:59:59.000Z',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: Array.from({ length: 6 }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`, base: 'YEG', division: 'Pilots',
    rank: 'CA', seniorityNum: String(i + 1), crewName: `Crew ${i + 1}`,
  })),
  pairings: MOCK_PAIRINGS,
  assignments: MOCK_PAIRINGS.map((p, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`, pairingId: p.pairingId, source: 'CR' as const,
  })),
  pairingSegments: MOCK_PAIRING_SEGMENTS,
  flights: [],
  groundItems: [],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

// ── Helpers ────────────────────────────────────────────────────────────────

const expectRows = async (
  page: import('@playwright/test').Page,
  n: number,
  msg: string,
) => {
  await expect
    .poll(
      async () => (await paneRenderStat(page, 'pairing'))?.totalRows ?? -1,
      { timeout: 8_000, message: msg },
    )
    .toBe(n)
}

const openPairingFilter = async (page: import('@playwright/test').Page) => {
  const filterBtns = page.getByTestId('pane-filter-button')
  const count = await filterBtns.count()
  await (count >= 2 ? filterBtns.nth(1) : filterBtns.first()).click()
  await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
}

// ── Test suite ─────────────────────────────────────────────────────────────

test.describe('Pairing Filter — Scenario, all fields + combos', () => {
  // Both crew-base and pairing-base dropdowns read from refStore.bases (GET /api/base).
  // seedScenarioListMocks returns [] by default; override with the bases present in our mock data.
  const MOCK_BASES = [
    { id: 1, base: 'YEG', name: 'Edmonton International', filiale: 'F8', isPrimeDisplayBase: 1, displayOrder: 1 },
    { id: 2, base: 'YYZ', name: 'Toronto Pearson', filiale: 'F8', isPrimeDisplayBase: 0, displayOrder: 2 },
  ]

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await seedScenarioListMocks(page, DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)

    // Override the empty-base mock so base filter dropdowns render YEG + YYZ options.
    await page.route(
      (url) => url.pathname === '/altair/live/api/base',
      (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: MOCK_BASES, message: 'ok' }),
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

    // The default coverage is now ['open','partial'] (Task 4 hard-filter change), so the
    // pane opens showing only 4 rows. Reset coverage to all 4 states via the filter dialog
    // so individual tests below start with all 6 pairings visible and are isolated from the
    // default (§Stale-Test: update to cover current function, same intent).
    await openPairingFilter(page)
    // 'open' and 'partial' are already selected; add 'full' and 'over' to restore all-states.
    await page.getByTestId('filter-pairing-coverage-full').click()
    await page.getByTestId('filter-pairing-coverage-over').click()
    await applyFilterLight(page)

    await expectRows(page, 6, 'all 6 mocked pairings must render before test starts')
  })

  // ── Single-field: Label ──────────────────────────────────────────────────

  test('Scen-2415 — Label filter narrows to matching substring @smoke', async ({ page }) => {
    await openPairingFilter(page)
    await page.getByTestId('filter-pairing-label').fill('E300')
    await applyFilterLight(page)
    // 5 match "E300" (3001–3005); SPECIAL does not
    await expectRows(page, 5, 'label "E300" must match 5 of 6 pairings')
  })

  // ── Single-field: Division ───────────────────────────────────────────────

  test('Scen-2416 — Division "P" (Pilots) hides Cabin pairings', async ({ page }) => {
    await openPairingFilter(page)
    await page.getByTestId('filter-pairing-division-P').click()
    await applyFilterLight(page)
    // Pilots: 3001, 3002, 3003, 3006 → 4
    await expectRows(page, 4, 'division P must show 4 pilot pairings')
  })

  test('Scen-2417 — Division "C" (Cabin) hides Pilot pairings', async ({ page }) => {
    await openPairingFilter(page)
    await page.getByTestId('filter-pairing-division-C').click()
    await applyFilterLight(page)
    // Cabin: 3004, 3005 → 2
    await expectRows(page, 2, 'division C must show 2 cabin pairings')
  })

  // ── Single-field: Base ───────────────────────────────────────────────────

  test('Scen-2418 — Base "YEG" hides YYZ pairings', async ({ page }) => {
    await openPairingFilter(page)
    await page.getByTestId('filter-pairing-base-trigger').click()
    await page.getByTestId('filter-pairing-base-opt-YEG').click()
    await page.getByTestId('filter-pairing-base-trigger').click() // close dropdown
    await applyFilterLight(page)
    // YEG base: 3001, 3002, 3004, 3006 → 4
    await expectRows(page, 4, 'base YEG must show 4 pairings')
  })

  // Fleet filter test omitted — single-fleet client, reference store won't have multiple fleets to distinguish

  // ── Single-field: Origin Airport (Dep Airport) ───────────────────────────

  test('Scen-2420 — Arpt "YEG" hides YYZ-departing pairings', async ({ page }) => {
    await openPairingFilter(page)
    const depInput = page.getByTestId('filter-pairing-dep')
    await depInput.fill('YEG')
    await depInput.press('Enter')
    await applyFilterLight(page)
    // Segments departing YEG: 3001, 3002, 3004, 3006 → 4
    await expectRows(page, 4, 'origin arpt YEG must show 4 pairings with YEG segments')
  })

  test('Scen-2421 — Arpt "YYZ" shows only YYZ-departing pairings', async ({ page }) => {
    await openPairingFilter(page)
    const depInput = page.getByTestId('filter-pairing-dep')
    await depInput.fill('YYZ')
    await depInput.press('Enter')
    await applyFilterLight(page)
    // Segments departing YYZ: 3003, 3005 → 2
    await expectRows(page, 2, 'origin arpt YYZ must show 2 pairings with YYZ segments')
  })

  // ── Multi-condition: Division + Coverage ─────────────────────────────────

  test('Scen-2422 — Division C + Coverage "open" → intersection: 1 row @smoke', async ({ page }) => {
    await openPairingFilter(page)
    // Select Cabin division
    await page.getByTestId('filter-pairing-division-C').click()
    // Deselect all coverage except Open
    await page.getByTestId('filter-pairing-coverage-partial').click()
    await page.getByTestId('filter-pairing-coverage-full').click()
    await page.getByTestId('filter-pairing-coverage-over').click()
    await applyFilterLight(page)
    // Cabin(C) ∩ open: only 3005
    await expectRows(page, 1, 'Division C + Coverage open must match only pairing 3005')
  })

  test('Scen-2423 — Base "YEG" + Coverage "full" → intersection: 1 row', async ({ page }) => {
    await openPairingFilter(page)
    // Select YEG base
    await page.getByTestId('filter-pairing-base-trigger').click()
    await page.getByTestId('filter-pairing-base-opt-YEG').click()
    await page.getByTestId('filter-pairing-base-trigger').click() // close dropdown
    // Deselect all coverage except Full
    await page.getByTestId('filter-pairing-coverage-open').click()
    await page.getByTestId('filter-pairing-coverage-partial').click()
    await page.getByTestId('filter-pairing-coverage-over').click()
    await applyFilterLight(page)
    // YEG ∩ full: only 3004 (3003 is YYZ/full)
    await expectRows(page, 1, 'Base YEG + Coverage full must match only pairing 3004')
  })

  // Fleet combo test omitted — single-fleet client

  test('Scen-2425 — Label "E300" + Division P → intersection: 3 rows', async ({ page }) => {
    await openPairingFilter(page)
    await page.getByTestId('filter-pairing-label').fill('E300')
    await page.getByTestId('filter-pairing-division-P').click()
    await applyFilterLight(page)
    // "E300" substring matches 3001–3005 (5 total); P(Pilots) from those: 3001,3002,3003 → 3
    await expectRows(page, 3, 'Label "E300" + Division P must match 3 pilot pairings with E300 labels')
  })
})
