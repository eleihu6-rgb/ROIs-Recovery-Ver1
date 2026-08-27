/**
 * Pairing Coverage filter — Live + Scenario (both HARD-HIDE when narrowed).
 *
 * ## History
 * Live-1113 / Live-1114 originally asserted coverage *float* (non-matches stayed
 * visible below). As of 2026-07-19 Live matches Scenario: narrowed coverage
 * hard-hides non-matching rows (Full hidden under Open+Partial).
 *
 * ## Bug fixed (Scen-2411 – Scen-2414)
 * In Scenario mode, pairingCoverageNarrowed() exempted the old default
 * ['open','partial'] from being treated as an active filter. The badge showed
 * "1 active" but no rows were hidden. Fix: pairingCoverageNarrowed is now a
 * clean strict-subset check; default is [...ALL_COVERAGE] (no filter).
 *
 * ## Mock data (5 scenario pairings with known coverage types)
 *   P1, P5  → open    (composition present, fill=0)
 *   P2      → partial (fill < plan)
 *   P3      → full    (fill == plan)
 *   P4      → full    (empty composition → no requirement)
 *
 * ## Filter expectations
 *   "Full" only        → 2 rows (P3, P4)
 *   "Open" only        → 2 rows (P1, P5)
 *   "Open + Partial"   → 3 rows (P1, P2, P5)  ← was 5 (bug) before fix
 *   No filter (all 4)  → 5 rows
 */

import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  seedGanttAuth,
  seedScenarioListMocks,
  readHook,
  counts,
  openFilter,
  applyFilter,
  applyFilterLight,
  paneRenderStat,
} from '../../utils/gantt-hook'
import { coverageOf, type Coverage } from '../../utils/coverage'

type PairingRow = { id: string; label: string }

const waitStable = async (read: () => Promise<PairingRow[]>): Promise<PairingRow[]> => {
  let prev = ''
  await expect.poll(async () => {
    const cur = JSON.stringify(await read())
    const stable = cur === prev && cur !== '[]'
    prev = cur
    return stable
  }, { timeout: 30_000, intervals: [600] }).toBe(true)
  return read()
}

// ── Scenario mock data ─────────────────────────────────────────────────────

const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const DEMO_SCENARIO_ID = 6

const MOCK_PAIRINGS = [
  // P1 — open (has composition, nobody assigned)
  {
    pairingId: 2001, pairingLabel: 'E2001', base: 'YEG', assignment: 'FLT', division: 'Pilots',
    assignmentGroup: 'FLT',
    schStrDtUtc: '2026-03-02T08:00:00.000Z', schEndDtUtc: '2026-03-02T16:00:00.000Z',
    compositions: [{ rank: 'CA', plan: 1, fill: 0 }],
  },
  // P2 — partial (1 of 2 seats filled)
  {
    pairingId: 2002, pairingLabel: 'E2002', base: 'YEG', assignment: 'FLT', division: 'Pilots',
    assignmentGroup: 'FLT',
    schStrDtUtc: '2026-03-03T08:00:00.000Z', schEndDtUtc: '2026-03-03T16:00:00.000Z',
    compositions: [{ rank: 'CA', plan: 2, fill: 1 }],
  },
  // P3 — full (fill == plan)
  {
    pairingId: 2003, pairingLabel: 'E2003', base: 'YEG', assignment: 'FLT', division: 'Pilots',
    assignmentGroup: 'FLT',
    schStrDtUtc: '2026-03-04T08:00:00.000Z', schEndDtUtc: '2026-03-04T16:00:00.000Z',
    compositions: [{ rank: 'CA', plan: 1, fill: 1 }],
  },
  // P4 — full (no composition requirement)
  {
    pairingId: 2004, pairingLabel: 'E2004', base: 'YEG', assignment: 'FLT', division: 'Pilots',
    assignmentGroup: 'FLT',
    schStrDtUtc: '2026-03-05T08:00:00.000Z', schEndDtUtc: '2026-03-05T16:00:00.000Z',
    compositions: [],
  },
  // P5 — open (same as P1; gives 2 open pairings to make the count unambiguous)
  {
    pairingId: 2005, pairingLabel: 'E2005', base: 'YEG', assignment: 'FLT', division: 'Pilots',
    assignmentGroup: 'FLT',
    schStrDtUtc: '2026-03-06T08:00:00.000Z', schEndDtUtc: '2026-03-06T16:00:00.000Z',
    compositions: [{ rank: 'CA', plan: 1, fill: 0 }],
  },
]

const MOCK_PAIRING_SEGMENTS = MOCK_PAIRINGS.map((p, i) => ({
  pairingId: p.pairingId, dutySeq: 1, segSeq: 1, fltId: 6000 + i, fltDt: `2026-03-0${2 + i}`,
  fltNum: `200${i}`, airline: 'F8', depArp: 'YEG', arvArp: 'YYZ', segAssignment: 'FLT',
  schStrDtUtc: p.schStrDtUtc, schEndDtUtc: p.schEndDtUtc,
  dutyStrArp: 'YEG', dutyEndArp: 'YYZ',
  dutySchStrDtUtc: p.schStrDtUtc, dutySchEndDtUtc: p.schEndDtUtc,
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
  crew: Array.from({ length: 5 }, (_, i) => ({
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

// ── Scenario helpers ───────────────────────────────────────────────────────

const expectScenarioPairingRows = async (
  page: import('@playwright/test').Page,
  n: number,
  description: string,
) => {
  await expect
    .poll(
      async () => (await paneRenderStat(page, 'pairing'))?.totalRows ?? -1,
      { timeout: 8_000, message: description },
    )
    .toBe(n)
}

/**
 * Open the global FilterDialog via the scenario pairing pane's filter button.
 * In Scenario mode the global `filter-btn` (Live toolbar) is absent; the pane
 * condition strip's `pane-filter-button` is the trigger. The default scenario
 * layout has roster (top) + pairing (bottom), so the pairing pane's button is
 * the second `pane-filter-button`. The dialog pre-opens on the Pairing tab.
 */
const openScenarioPairingFilter = async (page: import('@playwright/test').Page) => {
  const filterBtns = page.getByTestId('pane-filter-button')
  const count = await filterBtns.count()
  const filterBtn = count >= 2 ? filterBtns.nth(1) : filterBtns.first()
  await filterBtn.click()
  await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
}

type StorePairing = {
  id: number
  composition?: { plan?: number; fill?: number; rank?: string | null }[]
}

/** Visible panel rows with composition from the store (panel order ∩ store). */
const visibleWithCoverage = async (page: import('@playwright/test').Page) => {
  const order = await waitStable(() => readHook<PairingRow[]>(page, 'pairingPanelOrder'))
  const all = await readHook<StorePairing[]>(page, 'pairings')
  const byId = new Map(all.map((p) => [String(p.id), p]))
  return order.map((r) => {
    const p = byId.get(r.id)
    return { id: r.id, coverage: p ? coverageOf(p) : null as Coverage | null }
  }).filter((r) => r.coverage != null) as Array<{ id: string; coverage: Coverage }>
}

// ── Live mode tests ────────────────────────────────────────────────────────

test.describe('Pairing Coverage filter — Live', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).pairing, { timeout: 30_000 }).toBeGreaterThan(0)
  })

  test('Live-1113 — Open+Partial hard-hides fully-crewed pairings (no ranks)', async ({ page }) => {
    // Default coverage is Open+Partial. Full rows must not appear in the panel.
    const visible = await visibleWithCoverage(page)
    test.skip(visible.length === 0, 'no pairings with composition in panel')

    const visibleFull = visible.filter((r) => r.coverage === 'full')
    const visibleUnder = visible.filter((r) => r.coverage === 'open' || r.coverage === 'partial')
    test.skip(visibleUnder.length === 0, 'need open/partial pairings loaded for positive assert')

    expect(visibleFull, 'full pairings must be hard-hidden under Open+Partial').toHaveLength(0)
    expect(visibleUnder.length).toBeGreaterThan(0)
  })

  test('Live-1114 — selecting only Full hard-hides open/partial pairings', async ({ page }) => {
    await waitStable(() => readHook<PairingRow[]>(page, 'pairingPanelOrder'))

    await openFilter(page, 'pairing')
    // Default: Open+Partial. Deselect Open/Partial, select Full (Over stays off).
    await page.getByTestId('filter-pairing-coverage-open').click()
    await page.getByTestId('filter-pairing-coverage-partial').click()
    await page.getByTestId('filter-pairing-coverage-full').click()
    await expect(page.getByText('pairing:coverage')).toBeVisible()
    await applyFilter(page)

    const visible = await visibleWithCoverage(page)
    const fulls = visible.filter((r) => r.coverage === 'full')
    const nonFull = visible.filter((r) => r.coverage !== 'full')
    test.skip(fulls.length === 0, 'need full pairings loaded')

    expect(nonFull, 'non-full pairings must be hard-hidden when only Full is selected').toHaveLength(0)
    expect(fulls.length).toBeGreaterThan(0)
  })

  test('Live-1704 — default state shows 0 active pairing filters (all 4 coverage states selected)', async ({ page }) => {
    // After the fix, default = ALL_COVERAGE → pairingCoverageNarrowed = false → badge 0.
    await expect(page.getByTestId('filter-btn')).not.toContainText('1')

    // Opening the dialog and applying without changes must leave 0 active filters.
    await openFilter(page, 'pairing')
    await applyFilterLight(page)
    await expect(page.getByTestId('filter-btn')).not.toContainText('1')
  })
})

// ── Scenario mode tests (coverage = HIDE, not float) ──────────────────────

test.describe('Pairing Coverage filter — Scenario', () => {
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
    // Wait for all 5 mocked pairings to render before each test.
    await expectScenarioPairingRows(page, 5, 'all 5 mocked pairings must render before test starts')
  })

  test('Scen-2411 — "Full" only hides open and partial pairings @smoke', async ({ page }) => {
    await openScenarioPairingFilter(page)
    // Default: all 4 selected. Deselect Open, Partial, Over → keep Full only.
    await page.getByTestId('filter-pairing-coverage-open').click()
    await page.getByTestId('filter-pairing-coverage-partial').click()
    await page.getByTestId('filter-pairing-coverage-over').click()
    await applyFilterLight(page)

    // P3 (full, fill==plan) + P4 (full, empty comp) → 2 rows
    await expectScenarioPairingRows(page, 2, '"Full" only must show exactly 2 full-coverage pairings')
  })

  test('Scen-2412 — "Open" only shows only open pairings', async ({ page }) => {
    await openScenarioPairingFilter(page)
    await page.getByTestId('filter-pairing-coverage-partial').click()
    await page.getByTestId('filter-pairing-coverage-full').click()
    await page.getByTestId('filter-pairing-coverage-over').click()
    await applyFilterLight(page)

    // P1 + P5 (both open, fill=0 with composition) → 2 rows
    await expectScenarioPairingRows(page, 2, '"Open" only must show exactly 2 open pairings')
  })

  test('Scen-2413 — "Open + Partial" selection narrows rows (regression for pairingCoverageNarrowed exemption bug)', async ({ page }) => {
    // This is the exact scenario from the bug report (scenario 482). The user had
    // Open+Partial selected — the badge said "1 active" but all 5 rows stayed visible
    // because pairingCoverageNarrowed(['open','partial']) returned false (it exempted
    // the old store default). After the fix it returns true and rows are hidden.
    await openScenarioPairingFilter(page)
    // Deselect Full and Over → keep Open + Partial selected
    await page.getByTestId('filter-pairing-coverage-full').click()
    await page.getByTestId('filter-pairing-coverage-over').click()
    await applyFilterLight(page)

    // P1 (open) + P2 (partial) + P5 (open) → 3 rows, NOT 5
    await expectScenarioPairingRows(page, 3, '"Open+Partial" must hide the 2 full pairings — was broken (showed all 5 before fix)')
  })

  test('Scen-2414 — Reset coverage filter restores all rows', async ({ page }) => {
    // First narrow to Full only.
    await openScenarioPairingFilter(page)
    await page.getByTestId('filter-pairing-coverage-open').click()
    await page.getByTestId('filter-pairing-coverage-partial').click()
    await page.getByTestId('filter-pairing-coverage-over').click()
    await applyFilterLight(page)
    await expectScenarioPairingRows(page, 2, 'pre-condition: 2 full pairings after "Full only" filter')

    // Reset → all 5 should come back.
    await openScenarioPairingFilter(page)
    await page.getByTestId('filter-reset').click()
    await applyFilterLight(page)
    await expectScenarioPairingRows(page, 5, 'after Reset, all 5 pairings must be visible again')
  })
})
