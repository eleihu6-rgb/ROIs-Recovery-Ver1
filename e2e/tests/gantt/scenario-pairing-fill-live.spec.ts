/**
 * Scenario Pairing Fill — real-time local recompute (the "配比未变化" regression).
 *
 * The Scenario pairing pane must recompute composition fills locally from the effective
 * roster (base assignments + pendingChanges), NOT from the stale server snapshot. This
 * proves the fix end-to-end through the real UI:
 *
 *   Scen-Fill-1 — deleting a rostered pairing task drops the pairing-pane fill in real
 *                 time (before any Save), and dragging the pairing back restores it.
 *
 * The pane's fill is read via the dev-only `window.__ganttTest.scenarioPairings` probe,
 * which returns each pairing's composition with the LOCAL fill (same buildPairingItems
 * path the pane renders). Roster edits go through the REAL toolbar-delete + canvas drag.
 *
 * Determinism: gantt-data + lock are mocked (demo engine-server 502s on /gantt-data),
 * matching scenario-roster-edit.spec.ts. Assertions read concrete fill numbers + patch
 * objects, not bare visibility.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const RO_SCENARIO_ID = 6
const RO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const CREW_COUNT = 4
const OWNER_CREW = 'C0001'
const PAIRING_ID = 2000

const RO_CAPABILITIES = {
  panes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

const mkPairing = (pairingId: number, label: string, day: string) => ({
  pairingId,
  pairingLabel: label,
  base: 'YEG',
  schStrDtUtc: `2026-03-${day}T08:00:00.000Z`,
  schEndDtUtc: `2026-03-${day}T16:00:00.000Z`,
  assignmentGroup: 'FLT',
  assignment: 'FLT',
  division: 'Pilots',
  compositions: [{ rank: 'CA', plan: 1, fill: 1 }],
})

const mkSegment = (pairingId: number, fltId: number, fltNum: string, day: string) => ({
  pairingId,
  dutySeq: 1,
  segSeq: 1,
  fltId,
  fltDt: `2026-03-${day}`,
  fltNum,
  airline: 'F8',
  depArp: 'YEG',
  arvArp: 'YYZ',
  segAssignment: 'FLT',
  schStrDtUtc: `2026-03-${day}T08:00:00.000Z`,
  schEndDtUtc: `2026-03-${day}T16:00:00.000Z`,
  dutyStrArp: 'YEG',
  dutyEndArp: 'YYZ',
  dutySchStrDtUtc: `2026-03-${day}T08:00:00.000Z`,
  dutySchEndDtUtc: `2026-03-${day}T16:00:00.000Z`,
  dutySchRestMin: null,
  dutyActRestMin: null,
  dutyActCreditedMinutes: 480,
  brief1StartUtc: `2026-03-${day}T08:00:00.000Z`,
  brief1EndUtc: `2026-03-${day}T08:00:00.000Z`,
  debrief1StartUtc: `2026-03-${day}T16:00:00.000Z`,
  debrief1EndUtc: `2026-03-${day}T16:00:00.000Z`,
  pickup1StartUtc: `2026-03-${day}T08:00:00.000Z`,
  pickup1EndUtc: `2026-03-${day}T08:00:00.000Z`,
  dropoff1StartUtc: `2026-03-${day}T16:00:00.000Z`,
  dropoff1EndUtc: `2026-03-${day}T16:00:00.000Z`,
})

const MOCK_GANTT_DATA = {
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
  crew: Array.from({ length: CREW_COUNT }, (_, i) => {
    const rank = i % 2 === 0 ? 'CA' : 'FO'
    const crewId = `C${String(i + 1).padStart(4, '0')}`
    return {
      crewId,
      base: 'YEG',
      division: 'Pilots',
      rank,
      crewRank: rank,
      seniorityNum: String(i + 1),
      crewName: `Crew ${i + 1}`,
      ranks: [{ id: i + 1, crewId, rank, effDt: '2026-01-01T00:00:00Z', expDt: null }],
    }
  }),
  pairings: [mkPairing(PAIRING_ID, 'P2000', '02')],
  assignments: [{ crewId: OWNER_CREW, pairingId: PAIRING_ID, source: 'CR' as const }],
  pairingSegments: [mkSegment(PAIRING_ID, 6000, '2000', '02')],
  flights: [],
  groundItems: [],
  crewStats: {},
}

const OWNER_LOCK = { locked: true, owner: 'admin', ttl: 600, isOwner: true }

const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data }),
})

const dashboardOverview = {
  flightsToday: 0,
  totalActiveCrew: 0,
  violations: null,
  pendingApprovals: null,
  crewByRank: [],
  flightsByDay: [],
}
const scenarioListResponse = {
  items: [{
    id: RO_SCENARIO_ID,
    name: RO_SCENARIO_NAME,
    fileType: 'RO' as const,
    status: 'DONE' as const,
    strDtLoc: '2026-03-01',
    endDtLoc: '2026-03-31',
    division: 'P',
    leadinLive: 1 as const,
    updatedBy: 'admin',
    updatedAt: '2026-03-01T00:00:00.000Z',
    worksetId: 103,
  }],
  total: 1,
}
const scenarioDetail = {
  id: RO_SCENARIO_ID,
  name: RO_SCENARIO_NAME,
  fileType: 'RO' as const,
  status: 'DONE' as const,
  strDtLoc: '2026-03-01',
  endDtLoc: '2026-03-31',
  division: 'P',
  optimizedCount: 2,
  leadinLive: 1 as const,
  updatedBy: 'admin',
  updatedAt: '2026-03-01T00:00:00.000Z',
  worksetId: 103,
  version: null,
  rulesetId: 103,
  pairingScenarioId: null,
  filterParams: null,
  comments: null,
  createdBy: 'admin',
  createdAt: '2026-03-01T00:00:00.000Z',
}

const wireMocks = async (page: Page): Promise<void> => {
  await page.route('**/api/version', (route) => route.fulfill(ok({ appVersion: 'test' })))
  await page.route('**/api/auth/me', (route) => route.fulfill(ok({ userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin: 1 })))
  await page.route('**/api/public/config', (route) => route.fulfill(ok({ airline: 'F8', timezone: 'UTC', language: 'en', theme: 'light', dateFormat: 'yyyy-MM-dd' })))
  await page.route('**/api/dashboard/overview', (route) => route.fulfill(ok(dashboardOverview)))
  await page.route('**/api/assignment', (route) => route.fulfill(ok({ items: [] })))
  await page.route('**/api/assignment/group', (route) => route.fulfill(ok({ items: [] })))
  await page.route('**/api/scenario/run-health', (route) => route.fulfill(ok({ ok: true })))
  await page.route('**/api/scenario?*', (route) => route.fulfill(ok(scenarioListResponse)))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}`, (route) => route.fulfill(ok(scenarioDetail)))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/results`, (route) => route.fulfill(ok({})))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/progress`, (route) => route.fulfill(ok({})))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/versions`, (route) => route.fulfill(ok({ items: [] })))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(MOCK_GANTT_DATA)))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/acquire-lock`, (route) => route.fulfill(ok({ acquired: true })))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-keepalive`, (route) => route.fulfill(ok({ renewed: true })))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/release-lock`, (route) => route.fulfill(ok(null)))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(OWNER_LOCK)))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/patch-output`, async (route) => {
    const body = route.request().postDataJSON() as { patches: unknown[] }
    await route.fulfill(ok({ patched: body.patches?.length ?? 0 }))
  })
  await page.route('**/api/legality/preview-draft', (route) => route.fulfill(ok({ allowed: true, violations: [] })))
  await page.route('**/altair/rule/check/batch', (route) => route.fulfill(ok({ totalDuration: 1, items: [] })))
}

const readFill = (page: Page, wantPairingId: number): Promise<number | undefined> =>
  page.evaluate(
    ({ sid, pid }) => {
      const rows = window.__ganttTest!.scenarioPairings!(sid) ?? []
      const row = rows.find((r) => r.id === pid)
      return row?.composition.find((c) => c.rank === 'CA')?.fill
    },
    { sid: RO_SCENARIO_ID, pid: wantPairingId },
  )

const readPuck = (page: Page, wantPairingId?: number) =>
  page.evaluate(
    ({ sid, pid }) => window.__ganttTest!.scenarioRosterPuck!(sid, pid) ?? null,
    { sid: RO_SCENARIO_ID, pid: wantPairingId },
  )

const readPending = (page: Page) =>
  page.evaluate((sid) => window.__ganttTest!.scenarioPendingChanges!(sid), RO_SCENARIO_ID)

const openRoScenario = async (page: Page): Promise<void> => {
  await page.goto(`/altair/scenario/${RO_SCENARIO_ID}`)
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })
}

const acquireEditLock = async (page: Page): Promise<void> => {
  const acquireBtn = page.getByTestId('sg-acquire-lock-btn')
  await expect(acquireBtn).toBeVisible({ timeout: 10_000 })
  await acquireBtn.click()
  await expect(page.getByTestId('sg-release-lock-btn')).toBeVisible({ timeout: 10_000 })
}

test.describe('Scenario Pairing Fill — real-time local recompute', () => {
  test.beforeEach(async ({ page, request }: { page: Page; request: APIRequestContext }) => {
    await seedGanttAuth(page, request)
    await wireMocks(page)
    await openRoScenario(page)
    await acquireEditLock(page)
  })

  test('Scen-Fill-1 — delete drops the pairing-pane fill; drag-back restores it', async ({ page }) => {
    // Baseline: P2000 assigned to C0001 as CA → pane shows CA fill 1.
    await expect.poll(() => readFill(page, PAIRING_ID), { timeout: 15_000 }).toBe(1)

    // Select the roster puck → toolbar Delete → optimistic remove patch.
    await expect.poll(() => readPuck(page, PAIRING_ID), { timeout: 15_000 }).not.toBeNull()
    const puck = await readPuck(page, PAIRING_ID)
    expect(puck, 'puck probe must resolve').toBeTruthy()
    const rosterCanvas = page.getByTestId('scenario-roster-canvas')
    const rosterBox = await rosterCanvas.boundingBox()
    expect(rosterBox, 'scenario-roster-canvas must have a bounding box').toBeTruthy()
    await page.mouse.click(rosterBox!.x + puck!.x, rosterBox!.y + puck!.y)
    await page.getByTestId('sg-delete-btn').click()

    // The pairing-pane fill must drop to 0 IMMEDIATELY (pending, not saved).
    await expect.poll(() => readFill(page, PAIRING_ID), { timeout: 10_000 }).toBe(0)
    await expect.poll(() => readPending(page)).toContainEqual({ op: 'remove', crewId: OWNER_CREW, pairingId: PAIRING_ID })

    // Drag the pairing back onto the crew (first roster row = C0001) → add patch → fill 1.
    await expect
      .poll(() => page.evaluate(({ sid, pid }) => window.__ganttTest!.scenarioPairingPuck!(sid, pid) ?? null, { sid: RO_SCENARIO_ID, pid: PAIRING_ID }), { timeout: 10_000 })
      .not.toBeNull()
    const pairingPuck = await page.evaluate(
      ({ sid, pid }) => window.__ganttTest!.scenarioPairingPuck!(sid, pid) ?? null,
      { sid: RO_SCENARIO_ID, pid: PAIRING_ID },
    )
    expect(pairingPuck, 'pairing puck must resolve').toBeTruthy()

    const pairingCanvas = page.getByTestId('scenario-pairing-canvas')
    const pairingBox = await pairingCanvas.boundingBox()
    expect(pairingBox, 'scenario-pairing-canvas must have a bounding box').toBeTruthy()

    // First roster row center: header 30px + row 0 (43px tall) midpoint ≈ y + 51.
    const startX = pairingBox!.x + pairingPuck!.x
    const startY = pairingBox!.y + pairingPuck!.y
    const targetX = rosterBox!.x + 160
    const targetY = rosterBox!.y + 51
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(targetX, targetY, { steps: 8 })
    await page.mouse.up()

    await expect
      .poll(() => readPending(page), { timeout: 10_000, message: 'pairing drag-back never reached pendingChanges' })
      .toContainEqual({ op: 'add', crewId: OWNER_CREW, pairingId: PAIRING_ID, rosterActingRank: 'CA' })
    await expect.poll(() => readFill(page, PAIRING_ID), { timeout: 10_000 }).toBe(1)
  })
})
