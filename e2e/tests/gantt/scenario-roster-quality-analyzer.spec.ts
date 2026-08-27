/**
 * Scenario Roster Quality Analyzer (Scen-2080).
 *
 * Proves the scenario-only roster-pane Quality Analyzer end to end:
 *   1. The Quality Analyzer button appears in the scenario roster toolbar and opens a dialog.
 *   2. The master-detail layout groups by QLTY rule with per-rule crew counts.
 *   3. The "standalone RES" quality finding fires for an isolated reserve day (RES + blank +
 *      RES → no two-consecutive reserve), and passes (OK) for two consecutive reserve days.
 *   3b. The "day-off only" finding fires for a crew whose whole roster is days off (no
 *      flying/reserve assignment at all → a likely data issue).
 *   4. Clicking a crew id floats that crew to the TOP row of the scenario roster (so the
 *      planner can observe its roster) — asserted via the published scenario-roster row order.
 *
 * Scenario data is mocked (the demo engine-server 502s for /gantt-data — documented in the
 * sibling scenario-roster-shared-canvas.spec.ts), so the table is deterministic and offline.
 *
 * §No-Illusion: assertions read the actual rendered table cells (testid'd) + the in-app
 * scenario-roster panel order hook, not "the dialog is visible".
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, seedScenarioListMocks } from '../../utils/gantt-hook'

const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const DEMO_SCENARIO_ID = 6

const DEMO_SCENARIO_ID_P4 = 7

/**
 * Fixture for P4 param-config tests: 1 flight-crew member with division='P' and 6 working
 * days. With default max=18 the crew is OK; after changing to max=5 the crew is flagged.
 */
const MOCK_GANTT_DATA_P4 = {
  scenarioId: DEMO_SCENARIO_ID_P4,
  scenarioName: 'P4-Test---',
  fileType: 'RO' as const,
  strDtLoc: '2026-06-01T00:00:00.000Z',
  endDtLoc: '2026-06-30T23:59:59.000Z',
  scenarioStrDt: '2026-06-01T00:00:00',
  scenarioEndDt: '2026-06-30T00:00:00',
  leadinLive: 0,
  dataSource: 'snapshot' as const,
  crew: [
    { crewId: 'P0001', base: 'YEG', division: 'P', rank: 'CA', seniorityNum: '1', crewName: 'Flight One' },
    { crewId: 'P0002', base: 'YEG', division: 'C', rank: 'FA', seniorityNum: '2', crewName: 'Cabin One' },
  ],
  pairings: Array.from({ length: 6 }, (_, i) => ({
    pairingId: 900 + i,
    pairingLabel: `P${900 + i}`,
    base: 'YEG',
    schStrDtUtc: `2026-06-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`,
    schEndDtUtc:  `2026-06-${String(i + 1).padStart(2, '0')}T16:00:00.000Z`,
    assignmentGroup: 'FLT',
    assignment: 'FLT',
    division: 'Pilots',
    compositions: [{ rank: 'CA', plan: 1, fill: 1 }],
  })),
  pairingSegments: Array.from({ length: 6 }, (_, i) => ({
    pairingId: 900 + i, dutySeq: 1, segSeq: 1, fltId: (900 + i) * 10,
    fltDt: `2026-06-${String(i + 1).padStart(2, '0')}`,
    fltNum: String(900 + i), airline: 'F8', depArp: 'YEG', arvArp: 'YYZ', segAssignment: 'FLT',
    schStrDtUtc: `2026-06-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`,
    schEndDtUtc:  `2026-06-${String(i + 1).padStart(2, '0')}T16:00:00.000Z`,
    dutyStrArp: 'YEG', dutyEndArp: 'YYZ',
    dutySchStrDtUtc: `2026-06-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`,
    dutySchEndDtUtc:  `2026-06-${String(i + 1).padStart(2, '0')}T16:00:00.000Z`,
    dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: 480,
    brief1StartUtc: '', brief1EndUtc: '', debrief1StartUtc: '', debrief1EndUtc: '',
    pickup1StartUtc: '', pickup1EndUtc: '', dropoff1StartUtc: '', dropoff1EndUtc: '',
  })),
  assignments: Array.from({ length: 6 }, (_, i) => ({
    crewId: 'P0001',
    pairingId: 900 + i,
    source: 'CR' as const,
  })),
  flights: [],
  groundItems: [],
  crewStats: {},
}

/** Two solver pairings + one pre-assigned (leadin) pairing, each with a credited duty. */
const seg = (pairingId: number, creditMin: number, day = '2026-06-12') => ({
  pairingId, dutySeq: 1, segSeq: 1, fltId: pairingId * 10, fltDt: day, fltNum: String(pairingId),
  airline: 'F8', depArp: 'YEG', arvArp: 'YYZ', segAssignment: 'FLT',
  schStrDtUtc: `${day}T08:00:00.000Z`, schEndDtUtc: `${day}T16:00:00.000Z`,
  dutyStrArp: 'YEG', dutyEndArp: 'YYZ',
  dutySchStrDtUtc: `${day}T08:00:00.000Z`, dutySchEndDtUtc: `${day}T16:00:00.000Z`,
  dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: creditMin,
  brief1StartUtc: '', brief1EndUtc: '', debrief1StartUtc: '', debrief1EndUtc: '',
  pickup1StartUtc: '', pickup1EndUtc: '', dropoff1StartUtc: '', dropoff1EndUtc: '',
})

const pairing = (pairingId: number, day = '2026-06-12') => ({
  pairingId, pairingLabel: `P${pairingId}`, base: 'YEG',
  schStrDtUtc: `${day}T08:00:00.000Z`, schEndDtUtc: `${day}T16:00:00.000Z`,
  assignmentGroup: 'FLT', assignment: 'FLT', division: 'Pilots',
  compositions: [{ rank: 'CA', plan: 1, fill: 1 }],
})

const ground = (crewId: string, assignment: string, day: string, source: 'CR' | 'leadin', creditMin?: number, assignmentGroup = 'SBY') => ({
  crewId, assignmentGroup, assignment,
  schStrDtUtc: `${day}T00:00:00.000Z`, schEndDtUtc: `${day}T23:59:00.000Z`,
  actingRank: 'CA', source, actCreditedMinutes: creditMin,
})

const MOCK_GANTT_DATA = {
  scenarioId: DEMO_SCENARIO_ID,
  scenarioName: DEMO_SCENARIO_NAME,
  fileType: 'RO' as const,
  strDtLoc: '2026-06-01T00:00:00.000Z',
  endDtLoc: '2026-06-30T23:59:59.000Z',
  scenarioStrDt: '2026-06-01T00:00:00',
  scenarioEndDt: '2026-06-30T00:00:00',
  leadinLive: 0,
  dataSource: 'snapshot' as const,
  // 5 crew, seniority 1..5 → default order C0001..C0005.
  crew: Array.from({ length: 5 }, (_, i) => ({
    crewId: `C000${i + 1}`,
    base: 'YEG',
    division: 'Pilots',
    rank: i % 2 === 0 ? 'CA' : 'FO',
    seniorityNum: String(i + 1),
    crewName: `Crew ${i + 1}`,
  })),
  pairings: [
    pairing(100), pairing(200), pairing(201),
    // P400 spans 8 calendar days → an 8-day working run for C0004 (> 6).
    { ...pairing(400), schStrDtUtc: '2026-06-01T08:00:00.000Z', schEndDtUtc: '2026-06-08T16:00:00.000Z' },
  ],
  pairingSegments: [
    seg(100, 3600), // pre-assigned (leadin): 60:00 (before optimization)
    seg(200, 1200), // solver: 20:00
    seg(201, 1200), // solver: 20:00
    seg(400, 4800), // C0004 long trip
  ],
  // C0001 carries the credit breakdown; C0002/C0003 exercise RES; C0004 exercises long-working.
  assignments: [
    { crewId: 'C0001', pairingId: 100, source: 'leadin' as const }, // pre-assign 60:00
    { crewId: 'C0001', pairingId: 200, source: 'CR' as const },     // solver 20:00
    { crewId: 'C0001', pairingId: 201, source: 'CR' as const },     // solver 20:00
    { crewId: 'C0004', pairingId: 400, source: 'CR' as const },     // 8-day working run
  ],
  flights: [],
  groundItems: [
    // C0001 lead-in ground (training, NOT reserve) is contextual only and no longer displayed.
    ground('C0001', 'TRN', '2026-05-30', 'leadin', 1200, 'GRD'),
    // C0001 two consecutive CR reserve duties carry credit into After opt and do not flag standalone RES.
    ground('C0001', 'PRAM', '2026-06-20', 'CR', 480),
    ground('C0001', 'PRPM', '2026-06-21', 'CR', 480),
    // C0002 — two CONSECUTIVE reserve days → quality OK (client minimum met).
    ground('C0002', 'PRAM', '2026-06-08', 'CR'),
    ground('C0002', 'PRPM', '2026-06-09', 'CR'),
    // C0003 — a single ISOLATED reserve day (RES + blank + RES not met) → 1 standalone RES.
    ground('C0003', 'RES', '2026-06-15', 'CR'),
    // C0005 — ONLY days off, no flying/reserve at all → "day-off only" data-issue flag.
    ground('C0005', 'DO', '2026-06-05', 'CR', 0, 'OFF'),
    ground('C0005', 'DO', '2026-06-06', 'CR', 0, 'OFF'),
  ],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

test.describe('Scenario Roster Quality Analyzer', () => {
  // List + detail + gantt-data are all mocked (the demo remote DB is pathologically slow/flaky),
  // so the whole open flow is deterministic and offline.
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
  })

  test('Scen-2080 — quality table shows credit breakdown + standalone RES, and crew click floats to top', async ({ page }) => {
    // ── Open the (mocked) demo scenario gantt ──
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const item = await scenario.scenarioRow(DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()

    const ganttView = page.getByTestId('scenario-gantt-view')
    await expect(ganttView).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })

    // ── Step 1: the scenario roster toolbar has the Quality Analyzer button; open it ──
    const qaButton = page.getByTestId('quality-analysis-button')
    await expect(qaButton, 'Quality Analyzer button is scenario-only and must be present').toBeVisible()
    // Badge: three crew have an open finding (C0003 standalone RES, C0004 long working run,
    // C0005 day-off only).
    await expect(page.getByTestId('quality-analysis-button-count')).toHaveText('3')

    await qaButton.click()
    const dialog = page.getByTestId('quality-analysis-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('quality-issue-count')).toHaveText('3')

    // ── Check-standard description appears in the detail header for the selected rule ──
    const standards = dialog.getByTestId('quality-analysis-standards')
    await expect(standards).toContainText('Qlty-1001')
    await expect(standards).toContainText('Standalone RES')
    await expect(standards).toContainText('at least 2 consecutive RES/standby')

    // ── Step 2: "Issues only" is ON → left nav shows 3 rules; default selects first with findings ──
    await expect(dialog.getByTestId('quality-issues-only')).toBeChecked()
    await expect(dialog.getByTestId('quality-rule-nav-standalone-res')).toBeVisible()
    await expect(dialog.getByTestId('quality-rule-nav-consecutive-working')).toBeVisible()
    await expect(dialog.getByTestId('quality-rule-nav-day-off-only')).toBeVisible()
    await expect(dialog.getByTestId('quality-rule-count-standalone-res')).toHaveText('1')
    await expect(dialog.getByTestId('quality-rule-count-consecutive-working')).toHaveText('1')
    await expect(dialog.getByTestId('quality-rule-count-day-off-only')).toHaveText('1')

    // ── Step 3: standalone RES rule → C0003 with offending date ──
    await dialog.getByTestId('quality-rule-nav-standalone-res').click()
    await expect(dialog.getByTestId('quality-analysis-row')).toHaveCount(1)
    const c3 = dialog.locator('[data-testid="quality-analysis-row"][data-crew-id="C0003"]')
    const c3Finding = c3.getByTestId('quality-finding-standalone-res')
    await expect(c3Finding).toHaveAttribute('data-ok', 'false')
    await expect(c3Finding).toHaveAttribute('data-count', '1')
    await expect(c3Finding).toContainText('1 Standalone RES')
    await expect(c3Finding.getByTestId('quality-finding-detail')).toHaveText('2026-06-15')

    // consecutive-working rule → C0004
    await dialog.getByTestId('quality-rule-nav-consecutive-working').click()
    await expect(dialog.getByTestId('quality-analysis-row')).toHaveCount(1)
    const c4 = dialog.locator('[data-testid="quality-analysis-row"][data-crew-id="C0004"]')
    const c4Finding = c4.getByTestId('quality-finding-consecutive-working')
    await expect(c4Finding).toHaveAttribute('data-ok', 'false')
    await expect(c4Finding).toHaveAttribute('data-count', '1')
    await expect(c4Finding).toContainText('Working >6d')
    await expect(c4Finding.getByTestId('quality-finding-detail')).toHaveText('2026-06-01–2026-06-08 (8d)')

    // day-off-only rule → C0005
    await dialog.getByTestId('quality-rule-nav-day-off-only').click()
    await expect(dialog.getByTestId('quality-analysis-row')).toHaveCount(1)
    const c5 = dialog.locator('[data-testid="quality-analysis-row"][data-crew-id="C0005"]')
    const c5Finding = c5.getByTestId('quality-finding-day-off-only')
    await expect(c5Finding).toHaveAttribute('data-ok', 'false')
    await expect(c5Finding).toContainText('Qlty-1003')
    await expect(c5Finding).toContainText('Day-off only')
    await expect(c5Finding).toContainText('no flying or reserve assignment')
    await expect(c5Finding.getByTestId('quality-finding-detail')).toHaveText('2 days off')

    // ── Step 4: uncheck "Issues only" → all rules in nav; per-rule table shows full roster ──
    await dialog.getByTestId('quality-issues-only').uncheck()
    await expect(dialog.getByTestId('quality-rule-nav-standalone-res')).toBeVisible()
    await dialog.getByTestId('quality-rule-nav-standalone-res').click()
    await expect(dialog.getByTestId('quality-analysis-row')).toHaveCount(5)
    await expect(dialog).not.toContainText('Lead-in CRD')
    const c1 = dialog.locator('[data-testid="quality-analysis-row"][data-crew-id="C0001"]')
    await expect(c1.getByTestId('quality-preassign')).toHaveText('60:00') // before optimization
    await expect(c1.getByTestId('quality-solver')).toHaveText('56:00')    // after optimization: CR pairings + credited RES/SBY ground
    await expect(c1.getByTestId('quality-finding-standalone-res')).toHaveAttribute('data-ok', 'true')
    const c2 = dialog.locator('[data-testid="quality-analysis-row"][data-crew-id="C0002"]')
    await expect(c2.getByTestId('quality-finding-standalone-res')).toHaveAttribute('data-ok', 'true')

    await dialog.getByTestId('quality-rule-nav-consecutive-working').click()
    await expect(
      dialog.locator('[data-testid="quality-analysis-row"][data-crew-id="C0001"]')
        .getByTestId('quality-finding-consecutive-working'),
    ).toHaveAttribute('data-ok', 'true')

    await dialog.getByTestId('quality-rule-nav-day-off-only').click()
    await expect(
      dialog.locator('[data-testid="quality-analysis-row"][data-crew-id="C0001"]')
        .getByTestId('quality-finding-day-off-only'),
    ).toHaveAttribute('data-ok', 'true')

    // ── Step 5: click C0003's crew id on standalone RES rule → floats to top of roster ──
    await dialog.getByTestId('quality-rule-nav-standalone-res').click()
    await dialog.locator('[data-testid="quality-analysis-row"][data-crew-id="C0003"]')
      .getByTestId('quality-crew-link').click()
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__ganttTest?.scenarioCrewViolationSeverities?.() ?? []))[0]?.crewId,
        { timeout: 10_000, message: 'clicked crew should float to the top scenario roster row' },
      )
      .toBe('C0003')
  })
})

const DEMO_SCENARIO_NAME_P4 = 'P4-Test---'

// ─── Parameter Configuration tab tests (Scen-2081 · Scen-2082 · Scen-2083) ──────────────

test.describe('Quality Analyzer — Parameter Configuration tab (P4 fixture)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await seedScenarioListMocks(page, DEMO_SCENARIO_ID_P4, DEMO_SCENARIO_NAME_P4)
    await page.route(`**/api/scenario/${DEMO_SCENARIO_ID_P4}/gantt-data`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: MOCK_GANTT_DATA_P4, message: 'ok' }),
      }),
    )
    await page.route(`**/api/scenario/${DEMO_SCENARIO_ID_P4}/lock-status`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: MOCK_LOCK_STATUS, message: 'ok' }),
      }),
    )
  })

  const openDialog = async (page: import('@playwright/test').Page) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const item = await scenario.scenarioRow(DEMO_SCENARIO_ID_P4, DEMO_SCENARIO_NAME_P4)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()
    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('quality-analysis-button').click()
    return page.getByTestId('quality-analysis-dialog')
  }

  // Scen-2081: Parameter Configuration tab renders all 6 param rows
  test('Scen-2081 · config tab shows 6 parameter rows', async ({ page }) => {
    const dlg = await openDialog(page)
    await dlg.getByTestId('quality-config-tab').click()
    await expect(dlg.getByTestId('quality-param-table')).toBeVisible()
    await expect(dlg.getByTestId('quality-param-row-min-res')).toBeVisible()
    await expect(dlg.getByTestId('quality-param-row-max-work')).toBeVisible()
    await expect(dlg.getByTestId('quality-param-row-day-off')).toBeVisible()
    await expect(dlg.getByTestId('quality-param-row-max-period')).toBeVisible()
    await expect(dlg.getByTestId('quality-param-row-nonworking-codes')).toBeVisible()
    await expect(dlg.getByTestId('quality-param-row-divisions')).toBeVisible()
  })

  // Scen-2082: Change max-period to 5 → Save & Re-analyze → Qlty-1004 shows 1 affected crew
  test('Scen-2082 · changing max working days to 5 flags P-division crew', async ({ page }) => {
    const dlg = await openDialog(page)
    // Switch to config tab
    await dlg.getByTestId('quality-config-tab').click()
    // Change max-working-days-in-period from 18 to 5
    const maxPeriodInput = dlg.getByTestId('quality-param-row-max-period').locator('input[type="number"]')
    await maxPeriodInput.fill('5')
    // Save
    await dlg.getByTestId('quality-param-save').click()
    // Should switch back to analyzer tab
    await expect(dlg.getByTestId('quality-analyzer-tab')).toHaveAttribute('aria-selected', 'true')
    // Turn off "issues only" to show all rules including max-working-days
    await dlg.getByTestId('quality-issues-only').uncheck()
    // Navigate to the max-working-days rule
    const ruleNavBtn = dlg.getByTestId('quality-rule-nav-max-working-days')
    await expect(ruleNavBtn).toBeVisible()
    // The count badge must show > 0 (P-division crew P0001 has 6 working days > 5)
    const countBadge = ruleNavBtn.getByTestId('quality-rule-count-max-working-days')
    const countText = await countBadge.innerText()
    expect(Number(countText)).toBeGreaterThan(0)
  })

  // Scen-2083: Clicking Cancel on config tab reverts draft, does not apply changes
  test('Scen-2083 · cancel on config tab reverts draft without applying', async ({ page }) => {
    const dlg = await openDialog(page)
    // Open config tab
    await dlg.getByTestId('quality-config-tab').click()
    const maxPeriodInput = dlg.getByTestId('quality-param-row-max-period').locator('input[type="number"]')
    // Change to 3
    await maxPeriodInput.fill('3')
    // Cancel
    await dlg.getByTestId('quality-param-cancel').click()
    // Back on analyzer tab
    await expect(dlg.getByTestId('quality-analyzer-tab')).toHaveAttribute('aria-selected', 'true')
    // Re-open config tab and check the value reverted to 18 (draft was discarded)
    await dlg.getByTestId('quality-config-tab').click()
    await expect(maxPeriodInput).toHaveValue('18')
  })
})
