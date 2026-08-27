/**
 * Scenario Pairing Pane — filter dialog dimensions and chip round-trip.
 *
 * §Stale-Test rewrite: Scen-2017 and Scen-2018 previously tested the OLD inline
 * popover (`sg-pairing-filter-btn`) which was removed when the Scenario Gantt was
 * unified with Live (§Gantt-Unify). The scenario pairing pane now uses the same shared
 * FilterDialog opened via `pane-filter-button` — identical to Live mode.
 *
 * Uses mock gantt-data so these tests run without engine-server.
 *
 * Previous intent preserved:
 *  - Scen-2017: filter dialog accessible + shows all pairing filter dimensions
 *  - Scen-2018: division filter creates a chip; removing the chip clears the filter
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, seedScenarioListMocks, paneRenderStat } from '../../utils/gantt-hook'

const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const DEMO_SCENARIO_ID = 6

// ── Minimal mock data (3 pairings: P/open, P/partial, C/full) ──────────────

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
  crew: Array.from({ length: 3 }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`, base: 'YEG', division: 'P',
    rank: 'CA', seniorityNum: String(i + 1), crewName: `Crew ${i + 1}`,
  })),
  pairings: [
    { pairingId: 9001, pairingLabel: 'F-PILOT-OPEN', base: 'YEG', division: 'P', assignment: 'FLY', assignmentGroup: 'FLY', fleet: '',
      schStrDtUtc: '2026-03-02T08:00:00.000Z', schEndDtUtc: '2026-03-02T16:00:00.000Z',
      compositions: [{ rank: 'CA', plan: 1, fill: 0 }] },
    { pairingId: 9002, pairingLabel: 'F-PILOT-PARTIAL', base: 'YEG', division: 'P', assignment: 'FLY', assignmentGroup: 'FLY', fleet: '',
      schStrDtUtc: '2026-03-03T08:00:00.000Z', schEndDtUtc: '2026-03-03T16:00:00.000Z',
      compositions: [{ rank: 'CA', plan: 2, fill: 1 }] },
    { pairingId: 9003, pairingLabel: 'F-CABIN-FULL', base: 'YEG', division: 'C', assignment: 'FLY', assignmentGroup: 'FLY', fleet: '',
      schStrDtUtc: '2026-03-04T08:00:00.000Z', schEndDtUtc: '2026-03-04T16:00:00.000Z',
      compositions: [{ rank: 'FA', plan: 1, fill: 1 }] },
  ],
  assignments: [
    { crewId: 'C0001', pairingId: 9001, source: 'CR' as const },
    { crewId: 'C0002', pairingId: 9002, source: 'CR' as const },
    { crewId: 'C0003', pairingId: 9003, source: 'CR' as const },
  ],
  pairingSegments: [9001, 9002, 9003].map((id, i) => ({
    pairingId: id, dutySeq: 1, segSeq: 1, fltId: 8000 + i,
    fltNum: `300${i}`, airline: 'F8', depArp: 'YEG', arvArp: 'YYZ',
    segAssignment: 'FLY',
    schStrDtUtc: `2026-03-0${i + 2}T08:00:00.000Z`,
    schEndDtUtc: `2026-03-0${i + 2}T16:00:00.000Z`,
    dutyStrArp: 'YEG', dutyEndArp: 'YYZ',
    dutySchStrDtUtc: `2026-03-0${i + 2}T08:00:00.000Z`,
    dutySchEndDtUtc: `2026-03-0${i + 2}T16:00:00.000Z`,
    dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: 480,
    brief1StartUtc: `2026-03-0${i + 2}T08:00:00.000Z`, brief1EndUtc: `2026-03-0${i + 2}T08:00:00.000Z`,
    debrief1StartUtc: `2026-03-0${i + 2}T16:00:00.000Z`, debrief1EndUtc: `2026-03-0${i + 2}T16:00:00.000Z`,
    pickup1StartUtc: `2026-03-0${i + 2}T08:00:00.000Z`, pickup1EndUtc: `2026-03-0${i + 2}T08:00:00.000Z`,
    dropoff1StartUtc: `2026-03-0${i + 2}T16:00:00.000Z`, dropoff1EndUtc: `2026-03-0${i + 2}T16:00:00.000Z`,
  })),
  flights: [],
  groundItems: [],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

// ── Helpers ────────────────────────────────────────────────────────────────

const expectPairingRows = async (
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

const openScenarioPairingFilter = async (page: import('@playwright/test').Page) => {
  const filterBtns = page.getByTestId('pane-filter-button')
  const count = await filterBtns.count()
  // pane-filter-button: first = roster, second = pairing (when both panes are open)
  await (count >= 2 ? filterBtns.nth(1) : filterBtns.first()).click()
  await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
}

// ── Test suite ─────────────────────────────────────────────────────────────

test.describe('Scenario Pairing Pane — filter dialog (Scen-2017, Scen-2018 rewrite)', () => {
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
    await expectPairingRows(page, 3, 'all 3 mocked pairings must render before test starts')
  })

  test('Scen-2017 — pairing FilterDialog opens from pane-filter-button and shows all filter dimensions', async ({ page }) => {
    await openScenarioPairingFilter(page)

    const dialog = page.getByTestId('filter-dialog')

    // Opens on the Pairing tab
    await expect(dialog.getByTestId('filter-tab-pairing')).toHaveAttribute('data-active', 'true')

    // Label text input
    await expect(dialog.getByTestId('filter-pairing-label')).toBeVisible()

    // Division pills (P and C)
    await expect(dialog.getByTestId('filter-pairing-division-P')).toBeVisible()
    await expect(dialog.getByTestId('filter-pairing-division-C')).toBeVisible()

    // Base dropdown trigger
    await expect(dialog.getByTestId('filter-pairing-base-trigger')).toBeVisible()

    // Assignment type dropdown trigger
    await expect(dialog.getByTestId('filter-pairing-type-trigger')).toBeVisible()

    // Airport text chip field — label "Arpt", F8-style placeholder
    const depField = dialog.getByTestId('filter-pairing-dep')
    await expect(depField).toBeVisible()
    await expect(depField).toHaveAttribute('placeholder', 'e.g. YVR, YYZ')
    await expect(dialog.getByText('Arpt', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Origin Arpt')).toHaveCount(0)

    // Coverage pills (all 4 states)
    await expect(dialog.getByTestId('filter-pairing-coverage-open')).toBeVisible()
    await expect(dialog.getByTestId('filter-pairing-coverage-partial')).toBeVisible()
    await expect(dialog.getByTestId('filter-pairing-coverage-full')).toBeVisible()
    await expect(dialog.getByTestId('filter-pairing-coverage-over')).toBeVisible()

    // Apply button
    await expect(dialog.getByTestId('filter-apply')).toBeVisible()
  })

  test('Scen-2018 — selecting Division P creates a filter chip; removing it clears filter @smoke', async ({ page }) => {
    await openScenarioPairingFilter(page)

    // Select Pilot division
    await page.getByTestId('filter-pairing-division-P').click()
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).toBeHidden()

    // Pilot pairings: 9001 (P/open), 9002 (P/partial) → 2
    await expectPairingRows(page, 2, 'Division P must show 2 pilot pairings')

    // A filter chip containing "P" should be visible in the pairing pane's condition strip
    const chip = page.getByTestId('pane-filter-chip').filter({ hasText: /\bP\b/ }).first()
    await expect(chip).toBeVisible()

    // Remove the chip via its × button → filter clears → all 3 pairings return
    await chip.getByRole('button').click()
    await expectPairingRows(page, 3, 'removing chip must restore all 3 pairings')
    await expect(page.getByTestId('pane-filter-chip').filter({ hasText: /\bP\b/ })).toHaveCount(0)
  })
})
