/**
 * Scenario Roster Ctrl+click multi-select (Live parity).
 *
 * Live supports Ctrl+click to add/remove individual task pucks to/from the
 * roster selection (base-interaction forwards ctrlKey; live-gantt-source
 * toggleTaskSelection). The Scenario roster pane shares the same interaction
 * layer but its source adapter ignored ctrlKey, so Ctrl+click behaved like a
 * plain click. This test opens a mocked RO scenario with two duties on
 * adjacent crew rows and drives a REAL Ctrl+click on the roster canvas.
 *
 *   Scen: Ctrl+click a puck adds it to the selection; Ctrl+clicking an already
 *         selected puck toggles it back off. Plain click still selects the
 *         pairing group.
 *
 * Determinism: gantt-data + lock-status + scenario list are mocked (same
 * pattern as scenario-roster-box-select). The click is a real mouse click with
 * the Control modifier at the puck's on-screen coordinate.
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../../pages/gantt/scenario-page'
import { seedGanttAuth } from '../../../utils/gantt-hook'

const RO_SCENARIO_ID = 6
const RO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'

const CREW_A = 'C0001'
const CREW_B = 'C0002'
const PAIRING_A = 2000
const PAIRING_B = 2001

const RO_CAPABILITIES = {
  panes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

const mockPairing = (id: number, label: string, start: string, end: string) => ({
  pairingId: id,
  pairingLabel: label,
  base: 'YEG',
  schStrDtUtc: start,
  schEndDtUtc: end,
  assignmentGroup: 'FLT',
  assignment: 'FLT',
  division: 'Pilots',
  compositions: [{ rank: 'CA', plan: 1, fill: 1 }],
})

const mockSegment = (pairingId: number, fltId: number, fltNum: string, start: string, end: string) => ({
  pairingId,
  dutySeq: 1,
  segSeq: 1,
  fltId,
  fltDt: '2026-03-02',
  fltNum,
  airline: 'F8',
  depArp: 'YEG',
  arvArp: 'YYZ',
  segAssignment: 'FLT',
  schStrDtUtc: start,
  schEndDtUtc: end,
  dutyStrArp: 'YEG',
  dutyEndArp: 'YYZ',
  dutySchStrDtUtc: start,
  dutySchEndDtUtc: end,
  dutySchRestMin: null,
  dutyActRestMin: null,
  dutyActCreditedMinutes: 480,
  brief1StartUtc: start,
  brief1EndUtc: start,
  debrief1StartUtc: end,
  debrief1EndUtc: end,
  pickup1StartUtc: start,
  pickup1EndUtc: start,
  dropoff1StartUtc: end,
  dropoff1EndUtc: end,
})

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
  crew: [
    { crewId: CREW_A, base: 'YEG', division: 'Pilots', rank: 'CA', seniorityNum: '1', crewName: 'Crew 1' },
    { crewId: CREW_B, base: 'YEG', division: 'Pilots', rank: 'FO', seniorityNum: '2', crewName: 'Crew 2' },
    { crewId: 'C0003', base: 'YEG', division: 'Pilots', rank: 'CA', seniorityNum: '3', crewName: 'Crew 3' },
    { crewId: 'C0004', base: 'YEG', division: 'Pilots', rank: 'FO', seniorityNum: '4', crewName: 'Crew 4' },
  ],
  pairings: [
    mockPairing(PAIRING_A, 'P2000', '2026-03-02T08:00:00.000Z', '2026-03-02T16:00:00.000Z'),
    mockPairing(PAIRING_B, 'P2001', '2026-03-02T09:00:00.000Z', '2026-03-02T15:00:00.000Z'),
  ],
  assignments: [
    { crewId: CREW_A, pairingId: PAIRING_A, source: 'CR' as const },
    { crewId: CREW_B, pairingId: PAIRING_B, source: 'CR' as const },
  ],
  pairingSegments: [
    mockSegment(PAIRING_A, 6000, '2000', '2026-03-02T08:00:00.000Z', '2026-03-02T16:00:00.000Z'),
    mockSegment(PAIRING_B, 6001, '2001', '2026-03-02T09:00:00.000Z', '2026-03-02T15:00:00.000Z'),
  ],
  flights: [],
  groundItems: [],
  crewStats: {},
})

const MOCK_SCENARIO_ITEM = {
  id: RO_SCENARIO_ID,
  name: RO_SCENARIO_NAME,
  fileType: 'RO',
  status: 'DONE',
  strDtLoc: '2026-03-01',
  endDtLoc: '2026-03-31',
  optimizedCount: 1,
  leadinLive: 1,
  updatedBy: 'test',
  updatedByName: 'Test User',
  updatedAt: '2026-03-05T00:00:00.000Z',
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
  createdAt: '2026-03-01T00:00:00.000Z',
}

const MOCK_RP_PERIODS = {
  maxPeriods: 5,
  items: [
    { id: 3, rosterPeriod: '2026RP03', name: '2026-03', rpStart: '2026-03-01', rpEnd: '2026-03-31', isCurrent: true },
  ],
}

const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
})

const openRoScenario = async (page: Page): Promise<void> => {
  await page.route('**/api/scenario?**', (route) => route.fulfill(ok({
    items: [MOCK_SCENARIO_ITEM],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  })))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}`, (route) => route.fulfill(ok(MOCK_SCENARIO_DETAIL)))

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

const readSelectedTaskIds = (page: Page): Promise<number[]> =>
  page.evaluate((sid) => window.__ganttTest!.scenarioRosterTaskIds!(sid), RO_SCENARIO_ID)

/** Read the on-screen (canvas-relative) coordinate of a roster puck. */
const readPuck = (
  page: Page,
  wantPairingId: number,
): Promise<{ x: number; y: number; itemId: number } | null> =>
  page.evaluate(
    ({ sid, pid }) => window.__ganttTest!.scenarioRosterPuck!(sid, pid) ?? null,
    { sid: RO_SCENARIO_ID, pid: wantPairingId },
  )

/** Real mouse click at the puck's canvas coordinate, optionally with the Control modifier held. */
const clickPuck = async (page: Page, puck: { x: number; y: number }, ctrl = false): Promise<void> => {
  const canvas = page.getByTestId('scenario-roster-canvas')
  const box = await canvas.boundingBox()
  expect(box, 'scenario-roster-canvas must have a bounding box').toBeTruthy()
  await page.mouse.click(box!.x + puck.x, box!.y + puck.y, { modifiers: ctrl ? ['Control'] : [] })
}

test.describe('Scenario Roster Ctrl+click multi-select', () => {
  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
  })

  test('ctrl-click toggles individual roster duties into/out of the selection', async ({ page }) => {
    await page.route('**/api/roster-periods', (route) => route.fulfill(ok(MOCK_RP_PERIODS)))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(buildGanttData())))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) =>
      route.fulfill(ok({ locked: false, owner: null, ttl: null, isOwner: false })))

    await openRoScenario(page)

    const puckA = await readPuck(page, PAIRING_A)
    const puckB = await readPuck(page, PAIRING_B)
    expect(puckA, 'crew A pairing puck visible').not.toBeNull()
    expect(puckB, 'crew B pairing puck visible').not.toBeNull()
    expect(puckA!.itemId).not.toBe(puckB!.itemId)

    await expect.poll(() => readSelectedTaskIds(page)).toHaveLength(0)

    // Plain click selects puck A only.
    await clickPuck(page, puckA!)
    await expect.poll(() => readSelectedTaskIds(page)).toEqual([puckA!.itemId])

    // Ctrl+click puck B adds it → both selected.
    await clickPuck(page, puckB!, true)
    await expect
      .poll(async () => {
        const ids = await readSelectedTaskIds(page)
        return ids.includes(puckA!.itemId) && ids.includes(puckB!.itemId) && ids.length === 2
      })
      .toBe(true)

    // Ctrl+click puck A toggles it back off → only B remains.
    await clickPuck(page, puckA!, true)
    await expect.poll(() => readSelectedTaskIds(page)).toEqual([puckB!.itemId])
  })
})
