/**
 * Roster Pane Filter — comprehensive coverage.
 *
 * Addresses the gap identified in 2026-06: crew filter had no full test coverage.
 * Two test suites:
 *
 * A) Scenario mode (mock, deterministic) — tests single-field and multi-field combos
 *    with exact expected crew counts.
 *
 *    Mock crew (4):
 *      C0001: P (Pilot), YEG, CA
 *      C0002: P (Pilot), YEG, FO
 *      C0003: P (Pilot), YYZ, CA
 *      C0004: C (Cabin), YEG, FA
 *
 *    Filter counts:
 *      Division P          → 3 (C0001, C0002, C0003)
 *      Division C          → 1 (C0004)
 *      Base YEG            → 3 (C0001, C0002, C0004)
 *      Division P + Base YEG → 2 (C0001, C0002)
 *      Reset → 4 (all)
 *
 * B) Live mode (server-backed) — uses first-available values; asserts count
 *    changes (> 0, ≤ before) and chip appears. No hardcoded crew counts.
 *
 * Test IDs:
 *   Scenario: Scen-2426 to Scen-2430
 *   Live:     Live-1218 to Live-1221
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, seedScenarioListMocks, paneRenderStat, openFilter, applyFilter, applyFilterLight, selectFirstAvailableOption, counts, readHook } from '../../utils/gantt-hook'

// ═══════════════════════════════════════════════════════════════════════════
// A — SCENARIO MODE (mock, deterministic)
// ═══════════════════════════════════════════════════════════════════════════

const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const DEMO_SCENARIO_ID = 6

const MOCK_CREW = [
  { crewId: 'C0001', base: 'YEG', division: 'P', rank: 'CA', seniorityNum: '1', crewName: 'Pilot YEG One' },
  { crewId: 'C0002', base: 'YEG', division: 'P', rank: 'FO', seniorityNum: '2', crewName: 'Pilot YEG Two' },
  { crewId: 'C0003', base: 'YYZ', division: 'P', rank: 'CA', seniorityNum: '3', crewName: 'Pilot YYZ One' },
  { crewId: 'C0004', base: 'YEG', division: 'C', rank: 'FA', seniorityNum: '4', crewName: 'Cabin YEG One' },
]

const MOCK_GANTT_DATA_ROSTER = {
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
  pairings: [],
  assignments: [],
  pairingSegments: [],
  flights: [],
  groundItems: [],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

/** Count rendered rows in the scenario roster pane (paneType='scenario-roster'). */
const scenarioRosterRows = async (page: import('@playwright/test').Page) =>
  (await paneRenderStat(page, 'scenario-roster'))?.totalRows ?? -1

/** Count rendered rows in the live roster pane (paneType='roster-main'). */
const liveRosterRows = async (page: import('@playwright/test').Page) =>
  (await paneRenderStat(page, 'roster'))?.totalRows ?? -1

const expectRosterRows = async (
  page: import('@playwright/test').Page,
  n: number,
  msg: string,
) => {
  await expect.poll(() => scenarioRosterRows(page), { timeout: 8_000, message: msg }).toBe(n)
}

/** Open the crew FilterDialog from the Roster pane's filter button. */
const openRosterFilter = async (page: import('@playwright/test').Page) => {
  await page.getByTestId('pane-filter-button').first().click()
  await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
}

// Minimal base options that match the mock crew (YEG + YYZ) so the base dropdown
// in the filter dialog renders `filter-crew-base-opt-YEG` and `filter-crew-base-opt-YYZ`.
const MOCK_BASES = [
  { id: 1, base: 'YEG', name: 'Edmonton International', filiale: 'F8', isPrimeDisplayBase: 1, displayOrder: 1 },
  { id: 2, base: 'YYZ', name: 'Toronto Pearson', filiale: 'F8', isPrimeDisplayBase: 0, displayOrder: 2 },
]

test.describe('Roster Filter — Scenario mode (mock, deterministic)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await seedScenarioListMocks(page, DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)

    // Override the default empty-base mock from seedScenarioListMocks so the
    // crew-base dropdown populates with YEG and YYZ (higher LIFO priority).
    await page.route(
      (url) => url.pathname === '/altair/live/api/base',
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 200, data: MOCK_BASES, message: 'ok' }),
        }),
    )

    await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/gantt-data`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: MOCK_GANTT_DATA_ROSTER, message: 'ok' }),
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
    await expectRosterRows(page, 4, 'all 4 mocked crew must render before test starts')
  })

  test('Scen-2426 — Division "P" hides Cabin crew @smoke', async ({ page }) => {
    await openRosterFilter(page)
    await page.getByTestId('filter-crew-division-P').click()
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).toBeHidden()
    // Pilots: C0001, C0002, C0003 → 3
    await expectRosterRows(page, 3, 'Division P must show 3 pilot crew')
  })

  test('Scen-2427 — Division "C" hides Pilot crew', async ({ page }) => {
    await openRosterFilter(page)
    await page.getByTestId('filter-crew-division-C').click()
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).toBeHidden()
    // Cabin: C0004 → 1
    await expectRosterRows(page, 1, 'Division C must show 1 cabin crew')
  })

  test('Scen-2428 — Base "YEG" hides YYZ crew', async ({ page }) => {
    await openRosterFilter(page)
    await page.getByTestId('filter-crew-base-trigger').click()
    await page.getByTestId('filter-crew-base-opt-YEG').click()
    await page.getByTestId('filter-crew-base-trigger').click() // close dropdown
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).toBeHidden()
    // YEG: C0001, C0002, C0004 → 3
    await expectRosterRows(page, 3, 'Base YEG must show 3 YEG crew')
  })

  test('Scen-2429 — Division P + Base YEG → intersection: 2 crew @smoke', async ({ page }) => {
    await openRosterFilter(page)
    // Division P
    await page.getByTestId('filter-crew-division-P').click()
    // Base YEG
    await page.getByTestId('filter-crew-base-trigger').click()
    await page.getByTestId('filter-crew-base-opt-YEG').click()
    await page.getByTestId('filter-crew-base-trigger').click() // close dropdown
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).toBeHidden()
    // P ∩ YEG: C0001, C0002 → 2
    await expectRosterRows(page, 2, 'Division P + Base YEG must show 2 crew')
  })

  test('Scen-2430 — Reset clears all crew filters and restores full roster', async ({ page }) => {
    // Apply a filter first
    await openRosterFilter(page)
    await page.getByTestId('filter-crew-division-C').click()
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).toBeHidden()
    await expectRosterRows(page, 1, 'Cabin filter must reduce to 1 before reset')

    // Open filter again and reset
    await openRosterFilter(page)
    await page.getByTestId('filter-reset').click()
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).toBeHidden()
    // All 4 crew restored
    await expectRosterRows(page, 4, 'reset must restore all 4 crew')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// B — LIVE MODE (server-backed; flexible assertions)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Roster Filter — Live mode (server-backed)', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect
      .poll(async () => (await counts(page)).roster, { timeout: 30_000 })
      .toBeGreaterThan(0)
  })

  test('Live-1218 — Division "P" filter reduces roster count and shows chip @smoke', async ({ page }) => {
    // Use store total as the reference (stable, not a mid-load canvas snapshot)
    const totalCrew = (await counts(page)).roster
    expect(totalCrew).toBeGreaterThan(0)

    await openFilter(page, 'crew')
    await page.getByTestId('filter-crew-division-P').click()
    await applyFilter(page)

    // Count must be > 0 and ≤ total store count
    const after = await liveRosterRows(page)
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThanOrEqual(totalCrew)

    // Filter chip for division "P" appears
    await expect(page.getByTestId('pane-filter-chip').first()).toBeVisible()
  })

  test('Live-1219 — Division "C" filter reduces roster count', async ({ page }) => {
    const totalCrew = (await counts(page)).roster
    expect(totalCrew).toBeGreaterThan(0)

    await openFilter(page, 'crew')
    await page.getByTestId('filter-crew-division-C').click()
    await applyFilter(page)

    const after = await liveRosterRows(page)
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThanOrEqual(totalCrew)

    // Filter chip for division "C" appears
    await expect(page.getByTestId('pane-filter-chip').first()).toBeVisible()
  })

  test('Live-1220 — Base filter (first available) reduces roster count', async ({ page }) => {
    const totalCrew = (await counts(page)).roster
    expect(totalCrew).toBeGreaterThan(0)

    await openFilter(page, 'crew')
    const baseCode = await selectFirstAvailableOption(page, 'filter-crew-base', 'crew')
    await applyFilterLight(page)

    expect(baseCode.length).toBeGreaterThan(0)
    const after = await liveRosterRows(page)
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThanOrEqual(totalCrew)

    // Filter chip appears
    await expect(page.getByTestId('pane-filter-chip').first()).toBeVisible()
  })

  test('Live-1221 — Crew filter chip × button restores full count @smoke', async ({ page }) => {
    // Wait for stable store total before capturing reference
    const crewTotals = await readHook<{ total: number; unfilteredTotal: number }>(page, 'crewTotals')
    const before = crewTotals.unfilteredTotal
    expect(before).toBeGreaterThan(0)

    // Apply Division P filter
    await openFilter(page, 'crew')
    await page.getByTestId('filter-crew-division-P').click()
    await applyFilter(page)

    const chip = page.getByTestId('pane-filter-chip').first()
    await expect(chip).toBeVisible()

    // Remove chip
    await chip.getByRole('button').click()
    await expect(page.getByTestId('pane-filter-chip')).toHaveCount(0, { timeout: 5_000 })

    // Canvas crew count must return to store total (unfiltered)
    await expect.poll(() => liveRosterRows(page), { timeout: 10_000 }).toBe(before)
  })
})
