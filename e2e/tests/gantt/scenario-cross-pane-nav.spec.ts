/**
 * Scenario Gantt cross-pane "find / locate" navigation (P3.6 — Task 2).
 *
 * The ScenarioContextMenu wires four cross-pane navigation actions whose visibility
 * is gated on the TARGET pane existing in the scenario's layout (scenarioHasPaneType),
 * so PO scenarios (no roster pane) hide the Find-Crew items. Labels match the Live
 * ContextMenu exactly:
 *  - Roster pane  → "Locate Pairing"          (gate: pairing pane exists)
 *  - Pairing pane → "Find Crew by Pairing"    (gate: roster pane exists — hidden in PO)
 *  - Flight pane  → "Find Crew by Flight"     (gate: roster pane exists — hidden in PO)
 *                 + "Find Pairing by Flight"  (gate: pairing pane exists)
 *
 * Each helper resolves target ids from the already-loaded scenario data (no API) and
 * floats the matched rows to the top of the target pane (setFoundCrewIds). The tests
 * assert BOTH the menu item presence/gating AND the float-to-top effect via the
 * dev-only `scenarioFoundIds(scenarioId, paneId)` probe — proving the action fired and
 * targeted the correct pane.
 *
 *   Scen-2040 — RO: right-click a roster pairing puck → "Locate Pairing" present; click →
 *               the pairing floats to the top of the Pairing pane (foundIds = [pairingId]).
 *   Scen-2041 — RO: right-click a pairing segment → "Find Crew by Pairing" present; click →
 *               the assigned crew floats to the top of the Roster pane (foundIds = [crewId]).
 *   Scen-2042 — RO: right-click a flight puck → "Find Crew by Flight" + "Find Pairing by
 *               Flight" present; clicking each floats crew → Roster pane, pairing → Pairing pane.
 *   Scen-2043 — PO gating: with NO roster pane, right-click a pairing → "Find Crew by Pairing"
 *               ABSENT; right-click a flight → "Find Crew by Flight" ABSENT but "Find Pairing
 *               by Flight" PRESENT (pairing pane exists).
 *   Scen-2047 — RO: right-click a roster pairing puck → "Locate Flight" present; click →
 *               the flight floats to the top of the Flight pane (foundIds = [fltId]).
 *   Scen-2048 — RO without Flight pane: "Locate Flight" ABSENT (does not auto-open the pane).
 *
 * Determinism (§No-Illusion): the demo engine-server 502s on /gantt-data, so gantt-data +
 * lock-status are mocked with real crew/pairings/segments/flights/assignments. Right-clicks
 * are REAL `mousedown` MouseEvents (button 2) dispatched at the puck's on-screen coordinate,
 * computed by the dev-only scenarioRosterPuck / scenarioPairingPuck / scenarioFlightPuck probes.
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

const RO_SCENARIO_ID = 6
const RO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'

const ASSIGNED_CREW = 'C0001'
const PAIRING_ID = 2000
const PAIRING_LABEL = 'P2000'
const SEG_FLT_ID = 6000
const FLT_NUM = '2000'

const ROSTER_PANE = 'roster-1'
const PAIRING_PANE = 'pairing-1'
const FLIGHT_PANE = 'flight-1'

const RO_CAPABILITIES = {
  panes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

/** RO layout without a Flight pane — Locate Flight must be hidden. */
const RO_NO_FLIGHT_CAPABILITIES = {
  panes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

// PO-style capabilities: NO roster pane → Find-Crew items must be hidden.
const PO_CAPABILITIES = {
  panes: ['pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: false, canRemove: false, canReassign: false },
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
  fltId: SEG_FLT_ID,
  fltDt: '2026-03-02',
  fltNum: FLT_NUM,
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
  id: SEG_FLT_ID,
  fltNum: FLT_NUM,
  depArp: 'YEG',
  arvArp: 'YYZ',
  schDepDtUtc: '2026-03-02T08:00:00.000Z',
  schArvDtUtc: '2026-03-02T16:00:00.000Z',
  fleet: 'B737',
  register: 'C-FABC',
}

const buildGanttData = (caps: typeof RO_CAPABILITIES) => ({
  scenarioId: RO_SCENARIO_ID,
  scenarioName: RO_SCENARIO_NAME,
  fileType: 'RO' as const,
  capabilities: caps,
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
  assignments: [{ crewId: ASSIGNED_CREW, pairingId: PAIRING_ID, source: 'CR' as const }],
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

const routeScenario = async (page: Page, caps: typeof RO_CAPABILITIES): Promise<void> => {
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) =>
    route.fulfill(ok(buildGanttData(caps))))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) =>
    route.fulfill(ok(LOCK)))
}

/** Open the RO scenario and wait for a specific canvas testid to be visible. */
const openScenario = async (page: Page, waitCanvas: string): Promise<void> => {
  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  // Narrow by name then pin #6 — the bare name now collides with the demo-DB copies #460/#467.
  await page.getByPlaceholder('Search scenarios…').fill(RO_SCENARIO_NAME)
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(`#${RO_SCENARIO_ID}`, { exact: true }),
  })
  await expect(item, `demo scenario "${RO_SCENARIO_NAME}" (#${RO_SCENARIO_ID}) must exist`).toHaveCount(1, { timeout: 10_000 })
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()
  await expect(scenario.detailPanel.getByTestId('scenario-status-badge')).toHaveText('Done')
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId(waitCanvas)).toBeVisible({ timeout: 10_000 })
}

type Puck = { x: number; y: number }

const readRosterPuck = (page: Page): Promise<{ x: number; y: number; pairingId: number; crewId: string } | null> =>
  page.evaluate((sid) => window.__ganttTest!.scenarioRosterPuck!(sid, undefined) ?? null, RO_SCENARIO_ID)

const readPairingPuck = (page: Page): Promise<{ x: number; y: number; pairingId: number; fltId: number | null } | null> =>
  page.evaluate((sid) => window.__ganttTest!.scenarioPairingPuck!(sid, undefined) ?? null, RO_SCENARIO_ID)

const readFlightPuck = (page: Page): Promise<{ x: number; y: number; flightId: number } | null> =>
  page.evaluate((sid) => window.__ganttTest!.scenarioFlightPuck!(sid, undefined) ?? null, RO_SCENARIO_ID)

const foundIds = (page: Page, paneId: string): Promise<string[]> =>
  page.evaluate(({ sid, pid }) => window.__ganttTest!.scenarioFoundIds!(sid, pid), { sid: RO_SCENARIO_ID, pid: paneId })

/** Right-click: dispatch a REAL mousedown MouseEvent (button 2) at the puck's screen coordinate. */
const rightClick = async (page: Page, canvasTestId: string, puck: Puck): Promise<void> => {
  const canvas = page.getByTestId(canvasTestId)
  const box = await canvas.boundingBox()
  expect(box, `${canvasTestId} must have a bounding box`).toBeTruthy()
  const clientX = box!.x + puck.x
  const clientY = box!.y + puck.y
  await page.evaluate(
    ({ tid, cx, cy }) => {
      const el = document.querySelector(`[data-testid="${tid}"]`) as HTMLCanvasElement | null
      if (!el) throw new Error(`${tid} not found`)
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2, clientX: cx, clientY: cy }))
    },
    { tid: canvasTestId, cx: clientX, cy: clientY },
  )
}

const menu = (page: Page): ReturnType<Page['getByTestId']> => page.getByTestId('scenario-context-menu')

test.describe('Scenario cross-pane navigation menu', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Scen-2040 — roster: Locate Pairing floats the pairing to the top of the Pairing pane', async ({ page }) => {
    await routeScenario(page, RO_CAPABILITIES)
    await openScenario(page, 'scenario-roster-canvas')

    await expect.poll(() => readRosterPuck(page), { timeout: 15_000, message: 'no roster pairing puck' }).not.toBeNull()
    const puck = await readRosterPuck(page)
    expect(puck!.pairingId).toBe(PAIRING_ID)
    expect(puck!.crewId).toBe(ASSIGNED_CREW)

    // BEFORE: pairing pane has no found float.
    expect(await foundIds(page, PAIRING_PANE)).toEqual([])

    await rightClick(page, 'scenario-roster-canvas', puck!)
    await expect(menu(page)).toBeVisible({ timeout: 5_000 })
    await expect(menu(page).getByText('Locate Pairing', { exact: true })).toHaveCount(1)

    await menu(page).getByText('Locate Pairing', { exact: true }).click()
    await expect(menu(page)).toHaveCount(0)

    // AFTER: the pairing floats to the top of the Pairing pane.
    await expect
      .poll(() => foundIds(page, PAIRING_PANE), { timeout: 10_000, message: 'pairing should be floated to top' })
      .toEqual([String(PAIRING_ID)])
  })

  test('Scen-2041 — pairing: Find Crew by Pairing floats the crew to the top of the Roster pane', async ({ page }) => {
    await routeScenario(page, RO_CAPABILITIES)
    await openScenario(page, 'scenario-pairing-canvas')

    await expect.poll(() => readPairingPuck(page), { timeout: 15_000, message: 'no pairing segment puck' }).not.toBeNull()
    const puck = await readPairingPuck(page)
    expect(puck!.pairingId).toBe(PAIRING_ID)

    expect(await foundIds(page, ROSTER_PANE)).toEqual([])

    await rightClick(page, 'scenario-pairing-canvas', puck!)
    await expect(menu(page)).toBeVisible({ timeout: 5_000 })
    await expect(menu(page).getByText('Find Crew by Pairing', { exact: true })).toHaveCount(1)

    await menu(page).getByText('Find Crew by Pairing', { exact: true }).click()
    await expect(menu(page)).toHaveCount(0)

    await expect
      .poll(() => foundIds(page, ROSTER_PANE), { timeout: 10_000, message: 'assigned crew should be floated to top' })
      .toEqual([ASSIGNED_CREW])
  })

  test('Scen-2042 — flight: Find Crew by Flight + Find Pairing by Flight float crew/pairing to top', async ({ page }) => {
    await routeScenario(page, RO_CAPABILITIES)
    await openScenario(page, 'scenario-flight-canvas')

    await expect.poll(() => readFlightPuck(page), { timeout: 15_000, message: 'no flight puck' }).not.toBeNull()
    const puck = await readFlightPuck(page)
    expect(puck!.flightId).toBe(SEG_FLT_ID)

    // 1) Find Crew by Flight → crew floats to top of Roster pane.
    await rightClick(page, 'scenario-flight-canvas', puck!)
    await expect(menu(page)).toBeVisible({ timeout: 5_000 })
    await expect(menu(page).getByText('Find Crew by Flight', { exact: true })).toHaveCount(1)
    await expect(menu(page).getByText('Find Pairing by Flight', { exact: true })).toHaveCount(1)

    await menu(page).getByText('Find Crew by Flight', { exact: true }).click()
    await expect(menu(page)).toHaveCount(0)
    await expect
      .poll(() => foundIds(page, ROSTER_PANE), { timeout: 10_000, message: 'flight crew should float to roster top' })
      .toEqual([ASSIGNED_CREW])

    // 2) Find Pairing by Flight → pairing floats to top of Pairing pane.
    await rightClick(page, 'scenario-flight-canvas', puck!)
    await expect(menu(page)).toBeVisible({ timeout: 5_000 })
    await menu(page).getByText('Find Pairing by Flight', { exact: true }).click()
    await expect(menu(page)).toHaveCount(0)
    await expect
      .poll(() => foundIds(page, PAIRING_PANE), { timeout: 10_000, message: 'flight pairing should float to pairing top' })
      .toEqual([String(PAIRING_ID)])
  })

  test('Scen-2043 — PO gating: Find Crew items hidden (no roster pane); Find Pairing by Flight present', async ({ page }) => {
    await routeScenario(page, PO_CAPABILITIES)
    await openScenario(page, 'scenario-pairing-canvas')

    // There must be no roster pane in a PO layout.
    await expect(page.getByTestId('scenario-roster-canvas')).toHaveCount(0)

    // Pairing right-click → "Find Crew by Pairing" ABSENT (roster pane gate).
    await expect.poll(() => readPairingPuck(page), { timeout: 15_000, message: 'no pairing segment puck' }).not.toBeNull()
    const pPuck = await readPairingPuck(page)
    await rightClick(page, 'scenario-pairing-canvas', pPuck!)
    await expect(menu(page)).toBeVisible({ timeout: 5_000 })
    await expect(menu(page).getByText('Find Crew by Pairing', { exact: true })).toHaveCount(0)
    // Sanity: the menu still has its non-gated pairing item.
    await expect(menu(page).getByText('View pairing detail', { exact: true })).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(menu(page)).toHaveCount(0)

    // Flight right-click → "Find Crew by Flight" ABSENT, "Find Pairing by Flight" PRESENT.
    await expect.poll(() => readFlightPuck(page), { timeout: 15_000, message: 'no flight puck' }).not.toBeNull()
    const fPuck = await readFlightPuck(page)
    await rightClick(page, 'scenario-flight-canvas', fPuck!)
    await expect(menu(page)).toBeVisible({ timeout: 5_000 })
    await expect(menu(page).getByText('Find Crew by Flight', { exact: true })).toHaveCount(0)
    await expect(menu(page).getByText('Find Pairing by Flight', { exact: true })).toHaveCount(1)
  })

  test('Scen-2047 — roster: Locate Flight floats the flight to the top of the Flight pane', async ({ page }) => {
    await routeScenario(page, RO_CAPABILITIES)
    await openScenario(page, 'scenario-roster-canvas')

    await expect.poll(() => readRosterPuck(page), { timeout: 15_000, message: 'no roster pairing puck' }).not.toBeNull()
    const puck = await readRosterPuck(page)
    expect(await foundIds(page, FLIGHT_PANE)).toEqual([])

    await rightClick(page, 'scenario-roster-canvas', puck!)
    await expect(menu(page)).toBeVisible({ timeout: 5_000 })
    await expect(menu(page).getByText('Locate Flight', { exact: true })).toHaveCount(1)
    await menu(page).getByText('Locate Flight', { exact: true }).click()
    await expect(menu(page)).toHaveCount(0)

    await expect
      .poll(() => foundIds(page, FLIGHT_PANE), { timeout: 10_000, message: 'flight should be floated to top' })
      .toEqual([String(SEG_FLT_ID)])
  })

  test('Scen-2048 — Locate Flight absent when Flight pane is not in the layout', async ({ page }) => {
    await routeScenario(page, RO_NO_FLIGHT_CAPABILITIES)
    await openScenario(page, 'scenario-roster-canvas')

    await expect(page.getByTestId('scenario-flight-canvas')).toHaveCount(0)
    await expect.poll(() => readRosterPuck(page), { timeout: 15_000, message: 'no roster pairing puck' }).not.toBeNull()
    const puck = await readRosterPuck(page)

    await rightClick(page, 'scenario-roster-canvas', puck!)
    await expect(menu(page)).toBeVisible({ timeout: 5_000 })
    await expect(menu(page).getByText('Locate Pairing', { exact: true })).toHaveCount(1)
    await expect(menu(page).getByText('Locate Flight', { exact: true })).toHaveCount(0)
  })
})
