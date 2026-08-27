/**
 * Scenario-specific right-click context menu (P3.5 — Task 3).
 *
 * The Live <ContextMenu/> is coupled to Live-only stores, so a small
 * <ScenarioContextMenu/> handles right-clicks inside a Scenario Gantt. Both menus
 * share the ui-store context-menu state but are distinguished by
 * `contextMenuScenarioId`: Live renders null when it is set, Scenario renders null
 * when it is not — so exactly one menu shows for any right-click.
 *
 * Menu items are context-dependent and capability/lock gated:
 *  - View pairing detail — when the clicked item carries a pairingId.
 *  - View flight detail  — when a flight id is resolvable (here the roster segment's fltId).
 *  - Remove from crew    — scenario roster pane only, pairing task, when the scenario
 *                          grants roster.canRemove AND the user owns the edit lock.
 *
 *   Scen-2030 — right-click a rostered pairing puck in an RO scenario where the user
 *               OWNS the lock → the ScenarioContextMenu appears with "View pairing detail"
 *               + "Remove from crew"; clicking "View pairing detail" opens the Pairing
 *               Detail dialog with the mocked pairing's data.
 *
 *   Scen-2031 — right-click the same puck when the user does NOT own the lock (non-owner /
 *               read-only) → the menu still offers "View pairing detail" but the gated
 *               "Remove from crew" item is ABSENT.
 *
 *   Scen-2032 — clicking "Remove from crew" (owner case) applies the remove patch: the
 *               scenario becomes dirty (pending change) and the pairing puck disappears
 *               for that crew.
 *
 * Determinism (§No-Illusion): the demo engine-server 502s on /gantt-data, so gantt-data
 * + lock-status are mocked with real pairings/segments/assignments. The right-click is a
 * REAL `mousedown` MouseEvent (button 2) dispatched at the puck's on-screen coordinate,
 * computed by the dev-only `window.__ganttTest.scenarioRosterPuck` probe — so the pane's
 * own interaction handler + the new onItemRightClick wiring run end-to-end.
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

const RO_SCENARIO_ID = 6
const RO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'

const OWNER_CREW = 'C0001'
const PAIRING_ID = 2000
const PAIRING_LABEL = 'P2000'
const SEG_FLT_ID = 6000

const RO_CAPABILITIES = {
  panes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
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
  fltId: SEG_FLT_ID,
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

const MOCK_GROUND_TASK = {
  crewId: OWNER_CREW,
  base: 'YEG',
  depArp: 'YEG',
  arvArp: 'YEG',
  assignmentGroup: 'GRD',
  assignment: 'SIM',
  label: 'SIM',
  schStrDtUtc: '2026-03-20T08:00:00.000Z',
  schEndDtUtc: '2026-03-20T16:00:00.000Z',
  actingRank: 'CA',
  source: 'CR' as const,
  actCreditedMinutes: 480,
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
  assignments: [{ crewId: OWNER_CREW, pairingId: PAIRING_ID, source: 'CR' as const }],
  pairingSegments: [MOCK_SEGMENT],
  flights: [],
  groundItems: [MOCK_GROUND_TASK],
  crewStats: {
    [OWNER_CREW]: {
      '2026RP03': {
        credit: 480,
        dayOffCount: 0,
        alCount: 0,
        leaveCount: 0,
        mcred: 510,
      },
    },
  },
})

const buildNoDutyGanttData = () => ({
  ...buildGanttData(),
  assignments: [],
})

const OWNER_LOCK = { locked: true, owner: 'me', ttl: 600, isOwner: true }
const NON_OWNER_LOCK = { locked: false, owner: null, ttl: null, isOwner: false }

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

const MOCK_RP_PERIODS = {
  maxPeriods: 5,
  items: [
    { id: 3, rosterPeriod: '2026RP03', name: '2026-03', rpStart: '2026-03-01', rpEnd: '2026-03-31', isCurrent: true },
  ],
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

/**
 * Acquire the edit lock so the store's lockStatus.isOwner becomes true (the gate for the
 * "Remove from crew" item). The store only sets lockStatus on acquire/refresh — not from a
 * GET on open — so the owner cases must click the acquire button (acquire-lock mocked → true,
 * lock-status mocked → OWNER_LOCK).
 */
const acquireLock = async (page: Page): Promise<void> => {
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/acquire-lock`, (route) =>
    route.fulfill(ok({ acquired: true })))
  await page.getByTestId('sg-acquire-lock-btn').click()
  // The release-lock button replaces the acquire button once the lock is held.
  await expect(page.getByTestId('sg-release-lock-btn')).toBeVisible({ timeout: 10_000 })
}

const MOCK_PAIRING_DETAIL = {
  id: PAIRING_ID,
  pairingLabel: PAIRING_LABEL,
  base: 'YEG',
  fleet: 'B737',
  schStrDtUtc: '2026-03-02T08:00:00.000Z',
  schEndDtUtc: '2026-03-02T16:00:00.000Z',
  composition: [{ rank: 'CA', plan: 1, fill: 1 }],
  isFull: true,
  tags: null,
  segments: [
    {
      id: 90001,
      pairingId: PAIRING_ID,
      dutySeq: 1,
      segSeq: 1,
      fltNum: '2000',
      airline: 'F8',
      depArp: 'YEG',
      arvArp: 'YYZ',
      segAssignment: 'FLT',
      schStrDtUtc: '2026-03-02T08:00:00.000Z',
      schEndDtUtc: '2026-03-02T16:00:00.000Z',
      actStrDtUtc: null,
      actEndDtUtc: null,
      pickupStartUtc: '2026-03-02T07:00:00.000Z',
      briefStartUtc: '2026-03-02T07:15:00.000Z',
      dropoffEndUtc: '2026-03-02T16:30:00.000Z',
      dutyActCreditedMinutes: 480,
    },
  ],
  compositions: [{ actingRank: 'CA', plan: 1, fill: 1, open: 0 }],
}

const MOCK_CREW_DETAIL = [
  { crewId: OWNER_CREW, name: 'Crew 1', gender: null, base: 'YEG', position: 'CA', actingRank: 'CA', source: 'CR', mbhMin: 4800 },
]

const mockCrewInfo = async (page: Page): Promise<void> => {
  const fulfillCrewInfo = async (route: Parameters<Parameters<Page['route']>[1]>[0]): Promise<void> => {
    const pathname = new URL(route.request().url()).pathname.replace(/\/$/, '')
    const data = pathname.endsWith('/api/crew')
      ? {
          items: [{
            id: 1,
            crewId: OWNER_CREW,
            firstName: 'Crew',
            middleName: null,
            lastName: 'One',
            preferredName: null,
            gender: 'M',
            division: 'P',
            filiale: 'F8',
            status: 1,
            remarks: null,
            seniorityNum: '1',
          }],
          total: 1,
          page: 1,
          pageSize: 1,
          totalPages: 1,
        }
      : pathname.includes('/ranks')
        ? [{ id: 10, crewId: OWNER_CREW, rank: 'CA', effDt: '2020-01-01', expDt: null }]
        : pathname.includes('/bases')
          ? [{ id: 11, crewId: OWNER_CREW, base: 'YEG', effDt: '2020-01-01', expDt: null }]
          : pathname.includes('/fleets')
            ? [{ id: 12, crewId: OWNER_CREW, fleetSpecific: 'A320', effDt: '2020-01-01', expDt: null }]
            : pathname.includes('/qualifications')
              ? [{ id: 13, crewId: OWNER_CREW, qualification: 'ETOPS', effDt: '2020-01-01', renewedDt: null, expDt: null, isValid: 1 }]
              : pathname.includes('/certificates')
                ? [{ id: 14, crewId: OWNER_CREW, certificate: 'MED', effDt: '2020-01-01T10:00:00.000Z', expDt: '2025-01-01T10:00:00.000Z', isValid: 1 }]
                : [{ id: 15, crewId: OWNER_CREW, team: 'TEAM-A', effDt: '2020-01-01', expDt: null, isValid: 1 }]
    await route.fulfill(ok(data))
  }
  await page.route('**/api/crew', fulfillCrewInfo)
  await page.route('**/api/crew?*', fulfillCrewInfo)
  await page.route('**/api/crew/**', fulfillCrewInfo)
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
  // Narrow by name then pin #6 — the bare name now collides with the demo-DB copies #460/#467.
  await page.getByPlaceholder('Search scenarios…').fill(RO_SCENARIO_NAME)
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(String(RO_SCENARIO_ID), { exact: true }),
  })
  await expect(item, `demo scenario "${RO_SCENARIO_NAME}" (#${RO_SCENARIO_ID}) must exist in demo DB`).toHaveCount(1, { timeout: 10_000 })
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()
  await expect(scenario.detailPanel.getByTestId('scenario-status-badge')).toHaveText('Done')
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })
}

const readPuck = (
  page: Page,
  wantPairingId?: number,
): Promise<{ x: number; y: number; pairingId: number; crewId: string; itemId: number } | null> =>
  page.evaluate(
    ({ sid, pid }) => window.__ganttTest!.scenarioRosterPuck!(sid, pid) ?? null,
    { sid: RO_SCENARIO_ID, pid: wantPairingId },
  )

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
      const opts: MouseEventInit = { bubbles: true, cancelable: true, button: 2, clientX: cx, clientY: cy }
      el.dispatchEvent(new MouseEvent('mousedown', opts))
    },
    { cx: clientX, cy: clientY },
  )
}

const clickRosterHeaderRow = async (page: Page, rowIndex: number): Promise<void> => {
  const header = page.getByTestId('pane-header-canvas-scenario-roster')
  const box = await header.boundingBox()
  expect(box, 'scenario roster header canvas must have bounding box').toBeTruthy()
  await page.evaluate(
    ({ cx, cy }) => {
      const el = document.querySelector('[data-testid="pane-header-canvas-scenario-roster"]') as HTMLCanvasElement | null
      if (!el) throw new Error('pane-header-canvas-scenario-roster not found')
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: cx, clientY: cy }))
    },
    { cx: box!.x + 24, cy: box!.y + 30 + rowIndex * 43 + 21 },
  )
}

const rightClickRosterHeaderRow = async (page: Page, rowIndex: number): Promise<void> => {
  const header = page.getByTestId('pane-header-canvas-scenario-roster')
  const box = await header.boundingBox()
  expect(box, 'scenario roster header canvas must have bounding box').toBeTruthy()
  await page.mouse.click(box!.x + 24, box!.y + 30 + rowIndex * 43 + 21, { button: 'right' })
}

const doubleClickRosterHeaderRow = async (page: Page, rowIndex: number): Promise<void> => {
  const header = page.getByTestId('pane-header-canvas-scenario-roster')
  const box = await header.boundingBox()
  expect(box, 'scenario roster header canvas must have a bounding box').toBeTruthy()
  await page.mouse.dblclick(box!.x + 24, box!.y + 30 + rowIndex * 43 + 21)
}

const countRosterPuckPixels = async (page: Page, puck: { x: number; y: number }): Promise<number> =>
  page.evaluate(
    ({ x, y }) => {
      const canvas = document.querySelector('[data-testid="scenario-roster-canvas"]') as HTMLCanvasElement | null
      if (!canvas) throw new Error('scenario-roster-canvas not found')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('scenario-roster-canvas context not available')
      const sx = Math.max(0, Math.round(x) - 12)
      const sy = Math.max(0, Math.round(y) - 12)
      const data = ctx.getImageData(sx, sy, 24, 24).data
      let count = 0
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (Math.max(r, g, b) - Math.min(r, g, b) > 55) count += 1
      }
      return count
    },
    { x: puck.x, y: puck.y },
  )

const waitForPuck = async (page: Page): Promise<{ x: number; y: number; pairingId: number; crewId: string; itemId: number }> => {
  await expect
    .poll(() => readPuck(page, PAIRING_ID), { timeout: 15_000, message: 'no scenario-roster pairing puck rendered' })
    .not.toBeNull()
  const puck = await readPuck(page, PAIRING_ID)
  expect(puck, 'puck probe must resolve').toBeTruthy()
  expect(puck!.pairingId).toBe(PAIRING_ID)
  expect(puck!.crewId).toBe(OWNER_CREW)
  return puck!
}

test.describe('Scenario right-click context menu', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Scen-2030 — owner: menu shows View pairing detail + Remove from crew; View opens dialog', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(buildGanttData())))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(OWNER_LOCK)))
    await page.route(`**/api/pairing/${PAIRING_ID}/crew-detail`, (route) => route.fulfill(ok(MOCK_CREW_DETAIL)))
    await page.route(`**/api/pairing/${PAIRING_ID}`, (route) => route.fulfill(ok(MOCK_PAIRING_DETAIL)))

    await openRoScenario(page)
    await acquireLock(page)
    const puck = await waitForPuck(page)

    // BEFORE: no scenario menu.
    await expect(page.getByTestId('scenario-context-menu')).toHaveCount(0)

    // ACT: right-click the rostered pairing puck.
    await rightClickPuck(page, puck)

    const menu = page.getByTestId('scenario-context-menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    // Specific items: pairing detail + (gated) remove + flight detail (segment carries fltId).
    await expect(menu.getByText('View pairing detail', { exact: true })).toHaveCount(1)
    await expect(menu.getByText('Remove from crew', { exact: true })).toHaveCount(1)
    await expect(menu.getByText('View flight detail', { exact: true })).toHaveCount(1)

    // Click "View pairing detail" → Pairing Detail dialog opens with the mocked pairing data.
    await menu.getByText('View pairing detail', { exact: true }).click()
    await expect(page.getByTestId('scenario-context-menu')).toHaveCount(0)

    const dialog = page.getByTestId('pairing-info-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    // Title now carries the pairing label moved before the id: "<label> #<id>".
    await expect(dialog).toContainText(`${PAIRING_LABEL} #${PAIRING_ID}`)
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 10_000 })
  })

  test('Scen-2031 — non-owner: Remove from crew is absent (capability/lock gated)', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(buildGanttData())))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(NON_OWNER_LOCK)))

    await openRoScenario(page)
    const puck = await waitForPuck(page)

    await rightClickPuck(page, puck)

    const menu = page.getByTestId('scenario-context-menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    // Read-only context still gets "View pairing detail"…
    await expect(menu.getByText('View pairing detail', { exact: true })).toHaveCount(1)
    // …but the gated "Remove from crew" item is ABSENT (non-owner).
    await expect(menu.getByText('Remove from crew', { exact: true })).toHaveCount(0)
  })

  test('Scen-2036 — roster right-click opens Schedule Details for that crew', async ({ page }) => {
    await page.route('**/api/roster-periods', (route) => route.fulfill(ok(MOCK_RP_PERIODS)))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(buildGanttData())))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(NON_OWNER_LOCK)))

    await openRoScenario(page)
    const puck = await waitForPuck(page)

    await rightClickPuck(page, puck)
    const menu = page.getByTestId('scenario-context-menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    await menu.getByText('Schedule Details', { exact: true }).click()

    const dialog = page.getByTestId('schedule-details-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog).toContainText(`Schedule Details - ${OWNER_CREW}`)
    await expect(dialog).toContainText('2026RP03')
    await dialog.getByTestId('schedule-details-crew').click()
    await dialog.getByTestId('schedule-details-crew-search').fill(OWNER_CREW)
    await expect(dialog.getByTestId('schedule-details-crew-option').first()).toContainText(OWNER_CREW)
    await page.keyboard.press('Escape')
    const row = dialog.getByTestId('schedule-details-row').first()
    await expect(row).toContainText(String(PAIRING_ID))
    await expect(row).toContainText(PAIRING_LABEL)
    await expect(row).not.toContainText(/Flight\s+\d+/)
    await row.click()
    await expect(row).toHaveAttribute('data-selected', 'true')
    await expect.poll(
      () => page.evaluate((sid) => window.__ganttTest!.scenarioRosterTaskIds!(sid), RO_SCENARIO_ID),
      { message: 'clicking a Scenario Schedule Details row selects the roster task', timeout: 5_000 },
    ).toContain(puck.itemId)
  })

  test('Scen-2037 — roster right-click opens Daily Task Calendar for the scenario RP', async ({ page }) => {
    await page.route('**/api/roster-periods', (route) => route.fulfill(ok(MOCK_RP_PERIODS)))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(buildGanttData())))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(NON_OWNER_LOCK)))

    await openRoScenario(page)
    const puck = await waitForPuck(page)

    await rightClickPuck(page, puck)
    const menu = page.getByTestId('scenario-context-menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    await menu.getByText('Daily Task Calendar', { exact: true }).click()

    const dialog = page.getByTestId('daily-task-calendar-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog).toContainText(`Daily Task Calendar - ${OWNER_CREW}`)
    await expect(dialog).toContainText('2026RP03')
    await expect(dialog.getByTestId('daily-task-calendar-prev')).toHaveCount(0)
    await expect(dialog.getByTestId('daily-task-calendar-stats')).toContainText('8:30')
    const task = dialog.getByTestId('daily-task-calendar-task').first()
    await expect(task).toContainText('2000 YEG-YYZ')
    await task.click()
    await expect(task).toHaveAttribute('data-selected', 'true')
    await expect.poll(
      () => page.evaluate((sid) => window.__ganttTest!.scenarioRosterTaskIds!(sid), RO_SCENARIO_ID),
      { message: 'clicking a Scenario Daily Task Calendar block selects the roster task', timeout: 5_000 },
    ).toContain(puck.itemId)
  })

  test('Scen-2040 — timeline menu opens Daily Gantt Statistics with crew and task details', async ({ page }) => {
    await page.route('**/api/roster-periods', (route) => route.fulfill(ok(MOCK_RP_PERIODS)))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(buildGanttData())))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(NON_OWNER_LOCK)))

    await openRoScenario(page)

    const axis = page.getByTestId('sg-pane-toolbar-roster-1').getByTestId('sg-time-axis')
    await expect(axis).toBeVisible({ timeout: 5_000 })
    const axisBox = await axis.boundingBox()
    expect(axisBox, 'scenario timeline axis must have a bounding box').toBeTruthy()
    // At the rendered month scale, this coordinate falls on 2026-03-02.
    await page.mouse.click(
      axisBox!.x + Math.min(axisBox!.width - 10, 60),
      axisBox!.y + Math.max(5, axisBox!.height / 2),
      { button: 'right' },
    )

    const menu = page.getByTestId('time-axis-rp-menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    await expect(menu.getByTestId('time-axis-daily-gantt-statistics')).toBeVisible()
    await menu.getByTestId('time-axis-daily-gantt-statistics').click()

    const dialog = page.getByTestId('gantt-day-statistics-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog.getByText('Total Crew', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'View Total Crew details' })).toHaveText('4')
    await expect(dialog.getByText('AssignmentGroup', { exact: true })).toHaveCount(0)
    await expect(dialog.getByText('FLT', { exact: true })).toHaveCount(2)
    await expect(dialog.getByRole('button', { name: 'Details', exact: true })).toHaveCount(0)
    await expect(dialog.getByText('No details selected', { exact: true })).toHaveCount(2)

    await dialog.getByRole('button', { name: 'View Total Crew details' }).click()
    await expect(page.getByTestId('gantt-day-statistics-details-dialog')).toHaveCount(0)
    await expect(dialog.getByText('Total Crew · Mon, Mar 2, 2026', { exact: true })).toBeVisible()
    await expect(dialog.getByText('4 rows', { exact: true })).toBeVisible()
    await expect(dialog.getByText(OWNER_CREW, { exact: true })).toBeVisible()
    await dialog.getByText('C0004', { exact: true }).click()
    await expect.poll(
      () => page.evaluate(() => window.__ganttTest!.scenarioCrewViolationSeverities()[0]?.crewId ?? ''),
      { message: 'clicking a statistic table row pins the crew to the top', timeout: 5_000 },
    ).toBe('C0004')

    await dialog.getByRole('button', { name: 'FO', exact: true }).click()
    await expect.poll(
      () => page.evaluate(() => window.__ganttTest!.scenarioCrewViolationSeverities()[0]?.crewId ?? ''),
      { message: 'clicking a statistic label pins that crew group to the top', timeout: 5_000 },
    ).toBe('C0002')

    await dialog.getByRole('button', { name: 'View FLT details' }).last().click()
    await expect(dialog.getByText('FLT · Mon, Mar 2, 2026', { exact: true })).toBeVisible()
    await expect(dialog.getByText('assignment', { exact: true })).toBeVisible()
    await expect(dialog).toContainText(PAIRING_LABEL)
  })

  test('Scen-2032 — owner: Remove from crew applies the remove patch (scenario dirty + puck gone)', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(buildGanttData())))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(OWNER_LOCK)))

    await openRoScenario(page)
    await acquireLock(page)
    const puck = await waitForPuck(page)

    await rightClickPuck(page, puck)
    const menu = page.getByTestId('scenario-context-menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })

    await menu.getByText('Remove from crew', { exact: true }).click()
    await expect(page.getByTestId('scenario-context-menu')).toHaveCount(0)

    // The remove patch applied → the rostered pairing puck for OWNER_CREW disappears.
    await expect
      .poll(() => readPuck(page, PAIRING_ID), { timeout: 10_000, message: 'pairing puck should be removed after remove patch' })
      .toBeNull()
  })

  test('Scen-2035 — Delete removes a CR ground task from the Scenario roster', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(buildGanttData())))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(OWNER_LOCK)))

    await openRoScenario(page)
    await acquireLock(page)

    await expect
      .poll(
        () => page.evaluate((sid) => window.__ganttTest!.scenarioRosterPuck!(sid, null) ?? null, RO_SCENARIO_ID),
        { timeout: 10_000, message: 'ground-task puck should render' },
      )
      .not.toBeNull()
    const puck = await page.evaluate(
      (sid) => window.__ganttTest!.scenarioRosterPuck!(sid, null) ?? null,
      RO_SCENARIO_ID,
    )
    expect(puck?.pairingId).toBeNull()

    const canvas = page.getByTestId('scenario-roster-canvas')
    const box = await canvas.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.click(box!.x + puck!.x, box!.y + puck!.y)
    await page.keyboard.press('Delete')

    await expect
      .poll(
        () => page.evaluate((sid) => window.__ganttTest!.scenarioPendingChanges!(sid), RO_SCENARIO_ID),
        { timeout: 5_000 },
      )
      .toEqual([{
        op: 'remove',
        crewId: OWNER_CREW,
        pairingId: null,
        startDtUtc: MOCK_GROUND_TASK.schStrDtUtc,
        endDtUtc: MOCK_GROUND_TASK.schEndDtUtc,
        assignmentGroup: MOCK_GROUND_TASK.assignmentGroup,
        assignment: MOCK_GROUND_TASK.assignment,
      }])
  })

  test('Scen-2033 — selected scenario roster row can be pinned and unpinned from context menu', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(buildGanttData())))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(NON_OWNER_LOCK)))
    await mockCrewInfo(page)

    await openRoScenario(page)
    await expect(page.getByTestId('pane-header-canvas-scenario-roster')).toBeVisible({ timeout: 10_000 })
    const puck = await waitForPuck(page)
    await expect.poll(() => countRosterPuckPixels(page, puck), { timeout: 5_000 }).toBeGreaterThan(20)

    await rightClickRosterHeaderRow(page, 0)

    const menu = page.getByTestId('scenario-context-menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    await expect(menu.locator('button').first()).toHaveText('Crew Info')
    await menu.getByText('Crew Info', { exact: true }).click()
    const crewInfo = page.getByTestId('crew-info-dialog')
    await expect(crewInfo).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Crew Info — Crew One', { exact: true })).toBeVisible()
    await expect(crewInfo.getByText(`Crew ID ${OWNER_CREW}`, { exact: true })).toHaveCount(0)
    await expect(crewInfo.getByTestId('crew-info-table-qualification')).toContainText('ETOPS')
    await page.getByTestId('crew-info-close').click()

    await doubleClickRosterHeaderRow(page, 0)
    await expect(page.getByTestId('crew-info-dialog')).toBeVisible({ timeout: 5_000 })
    await page.getByTestId('crew-info-close').click()

    await rightClickRosterHeaderRow(page, 0)
    const menuAfterInfo = page.getByTestId('scenario-context-menu')
    await expect(menuAfterInfo).toBeVisible({ timeout: 5_000 })
    await expect(menuAfterInfo.getByText('Pin 1 Selected Row', { exact: true })).toHaveCount(1)

    await menuAfterInfo.getByText('Pin 1 Selected Row', { exact: true }).click()
    await expect(page.getByTestId('scenario-context-menu')).toHaveCount(0)
    await expect
      .poll(() => countRosterPuckPixels(page, puck), {
        timeout: 5_000,
        message: 'pinned roster row should still show its duty puck instead of a blank pinned overlay',
      })
      .toBeGreaterThan(20)

    await rightClickRosterHeaderRow(page, 0)
    const unpinMenu = page.getByTestId('scenario-context-menu')
    await expect(unpinMenu).toBeVisible({ timeout: 5_000 })
    await expect(unpinMenu.getByText('Unpin All (1)', { exact: true })).toHaveCount(1)

    await unpinMenu.getByText('Unpin All (1)', { exact: true }).click()
    await expect(page.getByTestId('scenario-context-menu')).toHaveCount(0)
  })

  test('Scen-2034 — scenario roster row without a duty can still be pinned from the left row', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(buildNoDutyGanttData())))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(NON_OWNER_LOCK)))

    await openRoScenario(page)
    await expect(page.getByTestId('pane-header-canvas-scenario-roster')).toBeVisible({ timeout: 10_000 })
    await expect.poll(() => readPuck(page, PAIRING_ID), { timeout: 5_000 }).toBeNull()

    await rightClickRosterHeaderRow(page, 0)

    const menu = page.getByTestId('scenario-context-menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    await expect(menu.getByText('Pin 1 Selected Row', { exact: true })).toHaveCount(1)

    await menu.getByText('Pin 1 Selected Row', { exact: true }).click()
    await expect(page.getByTestId('scenario-context-menu')).toHaveCount(0)

    await rightClickRosterHeaderRow(page, 0)
    const unpinMenu = page.getByTestId('scenario-context-menu')
    await expect(unpinMenu.getByText('Unpin All (1)', { exact: true })).toHaveCount(1)
  })
})
