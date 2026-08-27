/**
 * Regression: Daily Gantt Statistics dialog must close on overlay click and Esc.
 *
 * The dialog sets `dismissable` on the shared AppDialog. Bug: it was hard-coded
 * `dismissable={false}`, which blocks BOTH overlay-click and Esc dismissal (see
 * AppDialog `handleOutside` / `onEscapeKeyDown`), leaving the Close button as the
 * only exit. This test drives the REAL scenario gantt UI: double-click the
 * scenario time axis to open the dialog, then prove the black overlay click and
 * the Esc key each close it.
 *
 * The dialog component is the single shared Live/Scenario path (app-shell mounts
 * `GanttDayStatisticsDialog` for both), so the scenario path exercises the same
 * code the Live path uses.
 *
 * Determinism (§No-Illusion): gantt-data + lock-status are mocked so no remote DB
 * is required; the dialog opens for whatever calendar day sits under the
 * double-click on the mocked range.
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, seedScenarioListMocks } from '../../utils/gantt-hook'

const RO_SCENARIO_ID = 6
const RO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const PAIRING_ID = 2000
const PAIRING_LABEL = 'P2000'

const RO_CAPABILITIES = {
  panes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

const MOCK_PAIRING = {
  pairingId: PAIRING_ID,
  pairingLabel: PAIRING_LABEL,
  base: 'YEG',
  schStrDtUtc: '2026-03-02T08:00:00.000Z',
  schEndDtUtc: '2026-03-02T16:00:00.000Z',
  assignmentGroup: 'FLT',
  assignment: 'FLT',
  division: 'Pilots',
  compositions: [{ rank: 'CA', plan: 1, fill: 1 }],
}

const MOCK_SEGMENT = {
  pairingId: PAIRING_ID,
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
}

const MOCK_FLIGHT = {
  id: 6000,
  fltNum: '2000',
  depArp: 'YEG',
  arvArp: 'YYZ',
  schDepDtUtc: '2026-03-02T08:00:00.000Z',
  schArvDtUtc: '2026-03-02T16:00:00.000Z',
  fleet: 'B737',
  register: 'C-FABC',
}

const buildGanttData = () => ({
  scenarioId: RO_SCENARIO_ID,
  scenarioName: RO_SCENARIO_NAME,
  fileType: 'RO' as const,
  capabilities: RO_CAPABILITIES,
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  scenarioStrDt: '2026-03-01T00:00:00',
  scenarioEndDt: '2026-03-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: Array.from({ length: 4 }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`,
    base: 'YEG',
    division: 'Pilots',
    rank: i % 2 === 0 ? 'CA' : 'FO',
    seniorityNum: String(i + 1),
    crewName: `Crew ${i + 1}`,
  })),
  pairings: [MOCK_PAIRING],
  assignments: [{ crewId: 'C0001', pairingId: PAIRING_ID, source: 'CR' as const }],
  pairingSegments: [MOCK_SEGMENT],
  flights: [MOCK_FLIGHT],
  groundItems: [],
  crewStats: {},
})

const LOCK = { locked: false, owner: null, ttl: null, isOwner: false }

const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
})

const routeScenario = async (page: Page): Promise<void> => {
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) =>
    route.fulfill(ok(buildGanttData())))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) =>
    route.fulfill(ok(LOCK)))
}

const openScenario = async (page: Page): Promise<void> => {
  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  const item = await scenario.scenarioRow(RO_SCENARIO_ID, RO_SCENARIO_NAME)
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()
  await expect(scenario.detailPanel.getByTestId('scenario-status-badge')).toHaveText('Done')
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })
}

/** Double-click the roster pane's time axis to open Daily Gantt Statistics. */
const openDayStats = async (page: Page): Promise<void> => {
  const axis = page.getByTestId('sg-time-axis').first()
  await expect(axis).toBeVisible({ timeout: 10_000 })
  await axis.dblclick({ position: { x: 400, y: 8 } })
}

const dialog = (page: Page): ReturnType<Page['getByTestId']> =>
  page.getByTestId('gantt-day-statistics-dialog')

test.describe('Daily Gantt Statistics dialog dismissal', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await seedScenarioListMocks(page, RO_SCENARIO_ID, RO_SCENARIO_NAME)
    await routeScenario(page)
  })

  test('closes when clicking the black overlay and when pressing Esc', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await openScenario(page)

    // Open via a real double-click on the time axis.
    await openDayStats(page)
    await expect(dialog(page), 'dialog opens on time-axis double-click').toBeVisible({ timeout: 10_000 })

    // Overlay click (top-left, outside the centered dialog) must close it.
    await page.mouse.click(12, 12)
    await expect(dialog(page), 'overlay click closes the dialog').toHaveCount(0)

    // Reopen, then Esc must close it.
    await openDayStats(page)
    await expect(dialog(page), 'dialog reopens').toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Escape')
    await expect(dialog(page), 'Esc closes the dialog').toHaveCount(0)
  })
})
