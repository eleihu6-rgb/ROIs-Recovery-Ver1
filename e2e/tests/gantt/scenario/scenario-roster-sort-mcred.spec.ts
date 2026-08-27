/**
 * Scen-2043 — Scenario roster can sort by a COMPUTED-STAT column (MCred), like Live.
 *
 * §Gantt-Unify regression. The scenario roster sorting was forked from Live: it sorted the raw
 * CREW LIST via a hardcoded 4-key accessor (seniorityNum / crewId / rank / base) and offered only
 * those 4 fields in the SortDialog. Live sorts the built PANEL ROWS by any column value, so
 * computed stats like MCred / MDO (which live only on the panel row, not the crew record) sort in
 * Live but were a NO-OP in Scenario — the MCred field wasn't even offered.
 *
 * Fix: both contexts now sort panel rows with the SAME shared comparator
 * (sortPanelRowsByValues), and the scenario SortDialog derives its fields from the visible
 * columns (so MCred is offered). This test mocks gantt-data with three crew whose MCred differs
 * from their default (seniority) order, applies an MCred sort, and asserts the rows reorder by
 * MCred — it FAILS before the fix (no `sort-available-mcred` field; sort is a no-op) and PASSES
 * after.
 *
 * Mockable (no scenario backend), same approach as scenario-alert-center-unified / perf-scenario.
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../../pages/gantt/scenario-page'
import { seedGanttAuth } from '../../../utils/gantt-hook'

const SCENARIO_NAME = 'RO-2026-03 Mar Full Assignment'
const SCENARIO_ID = 8
const MONTH = '2026-03'

// Three crew. Default (no-sort) order is by seniority asc → C0001, C0002, C0003.
// MCred (monthly credit minutes → "HH:MM") differs, so an MCred sort must REORDER them:
//   C0003 = 3900m = 65:00  (lowest)
//   C0001 = 4500m = 75:00
//   C0002 = 5100m = 85:00  (highest)
// MCred ascending ⇒ C0003, C0001, C0002 (distinct from the seniority default).
const MOCK_GANTT_DATA = {
  scenarioId: SCENARIO_ID,
  scenarioName: SCENARIO_NAME,
  fileType: 'RO' as const,
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  scenarioStrDt: '2026-03-01T00:00:00',
  scenarioEndDt: '2026-03-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: [
    { crewId: 'C0001', base: 'YEG', division: 'Pilots', rank: 'CA', seniorityNum: '1', crewName: 'Crew 1' },
    { crewId: 'C0002', base: 'YEG', division: 'Pilots', rank: 'FO', seniorityNum: '2', crewName: 'Crew 2' },
    { crewId: 'C0003', base: 'YEG', division: 'Pilots', rank: 'CA', seniorityNum: '3', crewName: 'Crew 3' },
  ],
  pairings: [],
  assignments: [],
  pairingSegments: [],
  flights: [],
  groundItems: [],
  crewStats: {
    C0001: { [MONTH]: { credit: 4500, dayOffCount: 5 } },
    C0002: { [MONTH]: { credit: 5100, dayOffCount: 4 } },
    C0003: { [MONTH]: { credit: 3900, dayOffCount: 6 } },
  },
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }
const MOCK_LEGALITY = { status: 'READY' as const, violations: [] }

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data: body, message: 'ok' }),
})

/** Scenario roster left-panel ROW ORDER (crewId sequence) as published by the pane. */
const rosterOrder = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    ((window as unknown as {
      __ganttTest?: { scenarioCrewViolationSeverities: () => Array<{ crewId: string }> }
    }).__ganttTest?.scenarioCrewViolationSeverities() ?? []).map((r) => r.crewId),
  )

test.describe('Scenario roster — sort by computed-stat column (MCred), unified with Live', () => {
  test('Scen-2043 — applying an MCred sort reorders the rows by MCred (was a no-op / unavailable)', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    await page.route(`**/api/scenario/${SCENARIO_ID}/gantt-data`, (route) => route.fulfill(json(MOCK_GANTT_DATA)))
    await page.route(`**/api/scenario/${SCENARIO_ID}/lock-status`, (route) => route.fulfill(json(MOCK_LOCK_STATUS)))
    await page.route(`**/api/scenario/${SCENARIO_ID}/legality`, (route) => route.fulfill(json(MOCK_LEGALITY)))

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const item = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()

    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })

    // Default (no explicit sort) order = seniority ascending.
    await expect.poll(() => rosterOrder(page), { timeout: 15_000 }).toEqual(['C0001', 'C0002', 'C0003'])

    // ── Open the shared SortDialog and add the MCred field (only offered after the fix) ──
    await page.getByTestId('pane-sort-button').click()
    const sortDialog = page.getByTestId('sort-dialog')
    await expect(sortDialog).toBeVisible({ timeout: 5_000 })

    const mcredField = page.getByTestId('sort-available-mcred')
    await expect(mcredField, 'MCred must be offered as a sortable column (unified with Live)').toBeVisible()
    await mcredField.click()
    await page.getByTestId('sort-move-right').click()
    await expect(page.getByTestId('sort-selected-mcred')).toBeVisible()
    await page.getByTestId('sort-apply').click()
    await expect(sortDialog).not.toBeVisible({ timeout: 3_000 })

    // A sort chip labelled "MCred" appears (the dialog applied an MCred sort).
    await expect(page.getByTestId('pane-sort-chip')).toContainText('MCred')

    // ── The rows must now be ordered by MCred ascending — NOT the seniority default ──
    await expect.poll(() => rosterOrder(page), { timeout: 10_000 }).toEqual(['C0003', 'C0001', 'C0002'])
  })
})
