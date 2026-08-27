/**
 * Pairing Info dialog — Scenario mode must not misread UTC timestamps that arrive
 * without a trailing 'Z' (Scenario #535, CrewId 390, Pairing #11012, F81848).
 *
 * Scenario `pairing`/`pairing_segment` are `timestamp` (no tz) columns; the PO-engine
 * snapshot/live-refresh path serializes them with Python's naive `datetime.isoformat()`,
 * which omits the 'Z'/offset suffix (e.g. "2026-07-07T08:15:00"). `new Date(iso)` /
 * `Date.parse(iso)` treat a timezone-less ISO string as LOCAL browser time, not UTC.
 *
 * Every other time-computation path in the app (canvas Puck via `formatTime`/
 * `parseIsoCached`, hit-testing) already guards against this via the shared
 * `normalizeUtcIso()` helper (gantt-utils.ts) — which is why the Gantt Puck bar drew
 * the correct time while the Pairing Detail dialog (fmtTs/airportCell/blockMin) did
 * not: those three helpers parsed the raw string directly, bypassing the guard.
 *
 * This spec pins a browser timezone with a fixed (non-DST) UTC offset different
 * from UTC, feeds the dialog a Z-less segment timestamp, and asserts the displayed
 * time is the UTC value — NOT the value you'd get by misreading it as local time.
 * Before the fix this fails (shows the shifted time); after the fix it passes.
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth } from '../../utils/gantt-hook'
import { SEG, readSegmentCells } from '../../utils/pairing-info'

// America/Phoenix is a fixed UTC-7 offset year-round (no DST) — deterministic
// regardless of when this test runs.
test.use({ timezoneId: 'America/Phoenix' })

const RO_SCENARIO_ID = 535
const RO_SCENARIO_NAME = 'RO-Zless-UTC-Regression'
const OWNER_CREW = 'C0390'
const PAIRING_ID = 11012
const PAIRING_LABEL = 'F81848'
const SEG_FLT_ID = 81848
const SECOND_SEG_FLT_ID = 81849

// Deliberately NO trailing 'Z'/offset — reproduces the PO-engine naive-isoformat() bug.
const SCH_STR_DT = '2026-07-07T08:15:00'
const SCH_END_DT = '2026-07-07T16:45:00'
const SECOND_SCH_STR_DT = '2026-07-07T17:45:00'
const SECOND_SCH_END_DT = '2026-07-07T22:00:00'

const RO_CAPABILITIES = {
  panes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

const MOCK_PAIRING = {
  pairingId: PAIRING_ID,
  pairingLabel: PAIRING_LABEL,
  base: 'YEG',
  schStrDtUtc: SCH_STR_DT,
  schEndDtUtc: SECOND_SCH_END_DT,
  assignmentGroup: 'FLT',
  assignment: 'FLT',
  division: 'Pilots',
  compositions: [{ rank: 'CA', plan: 1, fill: 1 }],
}

const MOCK_SEGMENT = {
  pairingId: PAIRING_ID,
  dutySeq: 1,
  segSeq: 1,
  fltId: SEG_FLT_ID,
  fltNum: '1848',
  airline: 'F8',
  depArp: 'YEG',
  arvArp: 'YYZ',
  segAssignment: 'FLT',
  schStrDtUtc: SCH_STR_DT,
  schEndDtUtc: SCH_END_DT,
  dutyStrArp: 'YEG',
  dutyEndArp: 'YEG',
  dutySchStrDtUtc: SCH_STR_DT,
  dutySchEndDtUtc: SECOND_SCH_END_DT,
  dutySchRestMin: null,
  dutyActRestMin: null,
  dutyActCreditedMinutes: 480,
  brief1StartUtc: SCH_STR_DT,
  brief1EndUtc: SCH_STR_DT,
  debrief1StartUtc: SCH_END_DT,
  debrief1EndUtc: SCH_END_DT,
  pickup1StartUtc: SCH_STR_DT,
  pickup1EndUtc: SCH_STR_DT,
  dropoff1StartUtc: SCH_END_DT,
  dropoff1EndUtc: SCH_END_DT,
}

const MOCK_SECOND_SEGMENT = {
  ...MOCK_SEGMENT,
  segSeq: 2,
  fltId: SECOND_SEG_FLT_ID,
  fltNum: '1849',
  depArp: 'YYZ',
  arvArp: 'YEG',
  schStrDtUtc: SECOND_SCH_STR_DT,
  schEndDtUtc: SECOND_SCH_END_DT,
  brief1StartUtc: null,
  brief1EndUtc: null,
  debrief1StartUtc: SECOND_SCH_END_DT,
  debrief1EndUtc: SECOND_SCH_END_DT,
  pickup1StartUtc: null,
  pickup1EndUtc: null,
  dropoff1StartUtc: SECOND_SCH_END_DT,
  dropoff1EndUtc: SECOND_SCH_END_DT,
}

const buildGanttData = () => ({
  scenarioId: RO_SCENARIO_ID,
  scenarioName: RO_SCENARIO_NAME,
  fileType: 'RO' as const,
  capabilities: RO_CAPABILITIES,
  strDtLoc: '2026-07-01T00:00:00.000Z',
  endDtLoc: '2026-07-31T23:59:59.000Z',
  scenarioStrDt: '2026-07-01T00:00:00',
  scenarioEndDt: '2026-07-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: [{ crewId: OWNER_CREW, base: 'YEG', division: 'Pilots', rank: 'CA', seniorityNum: '390', crewName: 'Crew 390' }],
  pairings: [MOCK_PAIRING],
  assignments: [{ crewId: OWNER_CREW, pairingId: PAIRING_ID, source: 'CR' as const }],
  pairingSegments: [MOCK_SEGMENT, MOCK_SECOND_SEGMENT],
  flights: [],
  groundItems: [],
  crewStats: {},
})

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

const MOCK_SCENARIO_ITEM = {
  id: RO_SCENARIO_ID,
  name: RO_SCENARIO_NAME,
  fileType: 'RO',
  status: 'DONE',
  strDtLoc: '2026-07-01',
  endDtLoc: '2026-07-31',
  optimizedCount: 1,
  leadinLive: 1,
  updatedBy: 'test',
  updatedByName: 'Test User',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

const MOCK_SCENARIO_DETAIL = {
  ...MOCK_SCENARIO_ITEM,
  worksetId: null,
  version: 1,
  rulesetId: 103,
  pairingScenarioId: null,
  filterParams: null,
  comments: null,
  createdBy: 'test',
  createdAt: '2026-07-01T00:00:00.000Z',
}

const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
})

const openRoScenario = async (page: Page): Promise<void> => {
  await page.route('**/api/scenario?**', (route) => route.fulfill(ok({
    items: [MOCK_SCENARIO_ITEM], total: 1, page: 1, pageSize: 20, totalPages: 1,
  })))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}`, (route) => route.fulfill(ok(MOCK_SCENARIO_DETAIL)))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(buildGanttData())))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(MOCK_LOCK_STATUS)))

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  await page.getByPlaceholder('Search scenarios…').fill(RO_SCENARIO_NAME)
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(String(RO_SCENARIO_ID), { exact: true }),
  })
  await expect(item).toHaveCount(1, { timeout: 10_000 })
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })
}

const readPuck = (page: Page): Promise<{ x: number; y: number; pairingId: number; crewId: string; itemId: number } | null> =>
  page.evaluate(
    ({ sid, pid }) => window.__ganttTest!.scenarioRosterPuck!(sid, pid) ?? null,
    { sid: RO_SCENARIO_ID, pid: PAIRING_ID },
  )

const waitForPuck = async (page: Page): Promise<{ x: number; y: number; pairingId: number; crewId: string; itemId: number }> => {
  await expect
    .poll(() => readPuck(page), { timeout: 15_000, message: 'no scenario-roster pairing puck rendered' })
    .not.toBeNull()
  return (await readPuck(page))!
}

/** Right-click the puck: dispatch a REAL mousedown MouseEvent (button 2) at the puck's screen coordinate. */
const rightClickPuck = async (page: Page, puck: { x: number; y: number }): Promise<void> => {
  const canvas = page.getByTestId('scenario-roster-canvas')
  const box = await canvas.boundingBox()
  expect(box, 'scenario-roster-canvas must have a bounding box').toBeTruthy()
  const clientX = box!.x + puck.x
  const clientY = box!.y + puck.y
  await page.evaluate(
    ({ cx, cy }) => {
      const el = document.querySelector('[data-testid="scenario-roster-canvas"]') as HTMLCanvasElement | null
      if (!el) throw new Error('scenario-roster-canvas not found')
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2, clientX: cx, clientY: cy }))
    },
    { cx: clientX, cy: clientY },
  )
}

test.describe('Pairing Info dialog — Z-less scenario timestamp parses as UTC (Scen-535-11012)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('STD/STA/ATD/ATA render the UTC instant, not shifted by the browser timezone', async ({ page }) => {
    await openRoScenario(page)
    const puck = await waitForPuck(page)

    await rightClickPuck(page, puck)
    const menu = page.getByTestId('scenario-context-menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    await menu.getByText('View pairing detail', { exact: true }).click()

    const dialog = page.getByTestId('pairing-info-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog).toContainText(`${PAIRING_LABEL} #${PAIRING_ID}`)
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 10_000 })

    // Default tz mode is UTC. If the dialog mis-parsed the Z-less timestamp as
    // America/Phoenix (fixed UTC-7) local time, STD would read "7/7 15:15" instead.
    const cells = await readSegmentCells(dialog)
    expect(cells.length, 'two segment rows rendered').toBe(2)
    expect(cells[0][SEG.STD], 'STD must be the UTC instant, not shifted by -7h').toBe('7/7 08:15')
    expect(cells[0][SEG.STA], 'STA must be the UTC instant, not shifted by -7h').toBe('7/7 16:45')
    expect(cells[0][SEG.ATD], 'ATD (mirrors sched) must also parse as UTC').toBe('7/7 08:15')
    expect(cells[0][SEG.ATA], 'ATA (mirrors sched) must also parse as UTC').toBe('7/7 16:45')

    const dutyCells = dialog.getByTestId('pairing-info-duty-cell')
    await expect(dutyCells).toHaveCount(1)
    await expect(dutyCells.first()).toHaveAttribute('rowspan', '2')
    await expect(dutyCells.first()).toContainText('Credit 8:00')
    expect(cells[1][SEG.DUTY], 'merged Duty content expands to the second segment row').toContain('Credit 8:00')

    await expect(dialog.getByTestId('pairing-info-crew').locator('thead')).toContainText('Credit')
    await expect(dialog.getByTestId('pairing-info-crew-credit')).toHaveText('8:00')
  })
})
