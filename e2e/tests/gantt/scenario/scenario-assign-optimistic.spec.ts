/**
 * Scenario Gantt — optimistic drag-assign feedback (the "2-3s frozen drop" regression).
 *
 * Before the fix, dropping a pairing onto a roster row ran the Rust legality preview
 * (`POST /api/legality/preview-draft`, ~2-3s) as a HARD GATE before the optimistic patch
 * was applied — the user saw nothing happen during the wait and didn't know if the drag
 * succeeded. After the fix the drop applies the patch optimistically (the task appears on
 * the roster instantly) and the legality check runs in the background; a legal result keeps
 * the patch, an illegal result rolls it back.
 *
 * This spec drives the REAL canvas drag (pairing puck → first roster row) with the
 * preview-draft route DELAYED 3s, then asserts the assignment patch lands in the store
 * within 1s — well before the legality preview resolves. On the old hard-gate code this
 * assertion fails (the patch only appeared after the 3s preview returned).
 *
 * Determinism: gantt-data + lock are mocked (demo engine-server 502s on /gantt-data),
 * matching scenario-pairing-fill-live.spec.ts. Assertions read the concrete patch object,
 * not bare visibility.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { seedGanttAuth } from '../../../utils/gantt-hook'

const RO_SCENARIO_ID = 6
const RO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const CREW_COUNT = 4
const OWNER_CREW = 'C0001'
/** Unassigned pairing — dragged onto the first roster row in this test. */
const ASSIGN_PAIRING_ID = 2001
/** Simulate the ~2-3s Rust legality round trip so the optimistic window is observable. */
const DELAY_PREVIEW_MS = 3000

const RO_CAPABILITIES = {
  panes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

const mkPairing = (pairingId: number, label: string, day: string, fill: number) => ({
  pairingId,
  pairingLabel: label,
  base: 'YEG',
  schStrDtUtc: `2026-03-${day}T08:00:00.000Z`,
  schEndDtUtc: `2026-03-${day}T16:00:00.000Z`,
  assignmentGroup: 'FLT',
  assignment: 'FLT',
  division: 'Pilots',
  compositions: [{ rank: 'CA', plan: 1, fill }],
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
  pairings: [
    mkPairing(ASSIGN_PAIRING_ID, 'P2001', '03', 0),
  ],
  assignments: [],
  pairingSegments: [
    mkSegment(ASSIGN_PAIRING_ID, 6001, '2001', '03'),
  ],
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

interface PreviewMockOptions {
  delayMs?: number
  result?: {
    allowed: boolean
    violations: Array<{
      crewId: string
      pairingId: number
      dutySeq: number
      ruleCode: string
      ruleInstance: string
      scopeKey: string
      severity: number
      startDt: string
      endDt: string
      message: string
    }>
  }
}

const wireMocks = async (
  page: Page,
  options: PreviewMockOptions = {},
): Promise<() => number> => {
  let previewCalls = 0
  await page.route('**/api/version', (route) => route.fulfill(ok({ appVersion: 'test' })))
  await page.route('**/api/auth/me', (route) => route.fulfill(ok({
    user: { userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin: 1 },
  })))
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
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/legality`, (route) => route.fulfill(ok({ status: 'READY', violations: [], computedAt: '2026-03-01T00:00:00.000Z' })))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/legality/recheck`, (route) => route.fulfill(ok({ status: 'ok' })))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(MOCK_GANTT_DATA)))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/acquire-lock`, (route) => route.fulfill(ok({ acquired: true })))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-keepalive`, (route) => route.fulfill(ok({ renewed: true })))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/release-lock`, (route) => route.fulfill(ok(null)))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(OWNER_LOCK)))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/patch-output`, async (route) => {
    const body = route.request().postDataJSON() as { patches: unknown[] }
    await route.fulfill(ok({ patched: body.patches?.length ?? 0 }))
  })
  // KEY mock: the default Rust legality preview is DELAYED ~3s (the pre-fix hard gate froze the UI here).
  await page.route('**/api/legality/preview-draft', async (route) => {
    previewCalls += 1
    await new Promise((r) => setTimeout(r, options.delayMs ?? DELAY_PREVIEW_MS))
    await route.fulfill(ok(options.result ?? { allowed: true, violations: [] }))
  })
  await page.route('**/altair/rule/check/batch', (route) => route.fulfill(ok({ totalDuration: 1, items: [] })))
  return () => previewCalls
}

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

test.describe('Scenario drag-assign — optimistic feedback', () => {
  test('Scen-Opt-1 — drop applies the assignment before the legality preview resolves, then keeps it', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    const getPreviewCalls = await wireMocks(page)
    await openRoScenario(page)
    await acquireEditLock(page)

    // Baseline: no pending patches, pairing 2001 puck present in the pairing pane.
    await expect.poll(() => readPending(page), { timeout: 10_000 }).toEqual([])
    await expect
      .poll(() => page.evaluate(({ sid, pid }) => window.__ganttTest!.scenarioPairingPuck!(sid, pid) ?? null, { sid: RO_SCENARIO_ID, pid: ASSIGN_PAIRING_ID }), { timeout: 10_000 })
      .not.toBeNull()

    const pairingPuck = await page.evaluate(
      ({ sid, pid }) => window.__ganttTest!.scenarioPairingPuck!(sid, pid) ?? null,
      { sid: RO_SCENARIO_ID, pid: ASSIGN_PAIRING_ID },
    )
    expect(pairingPuck, 'pairing puck must resolve').toBeTruthy()

    const pairingCanvas = page.getByTestId('scenario-pairing-canvas')
    const pairingBox = await pairingCanvas.boundingBox()
    expect(pairingBox, 'scenario-pairing-canvas must have a bounding box').toBeTruthy()

    const rosterCanvas = page.getByTestId('scenario-roster-canvas')
    const rosterBox = await rosterCanvas.boundingBox()
    expect(rosterBox, 'scenario-roster-canvas must have a bounding box').toBeTruthy()

    // Drag pairing 2001 onto the first roster row (C0001). First row center: header 30px
    // + row 0 (43px) midpoint ≈ y + 51 (same geometry as scenario-pairing-fill-live).
    const startX = pairingBox!.x + pairingPuck!.x
    const startY = pairingBox!.y + pairingPuck!.y
    const targetX = rosterBox!.x + 160
    const targetY = rosterBox!.y + 51
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(targetX, targetY, { steps: 8 })
    await page.mouse.up()

    // Optimistic apply: the add patch is in pendingChanges well BEFORE the 3s legality
    // preview resolves. On the pre-fix hard-gate code this assertion fails (the patch only
    // appeared after the preview returned).
    await expect
      .poll(() => readPending(page), {
        timeout: 1000, // << well under the 3s legality delay
        message: 'optimistic assign patch did not apply before the legality preview resolved',
      })
      .toContainEqual({ op: 'add', crewId: OWNER_CREW, pairingId: ASSIGN_PAIRING_ID, rosterActingRank: 'CA' })

    // Legal result → the optimistic patch survives; a single preview request (fast path).
    await expect
      .poll(() => readPending(page), { timeout: 5000 })
      .toContainEqual({ op: 'add', crewId: OWNER_CREW, pairingId: ASSIGN_PAIRING_ID, rosterActingRank: 'CA' })
    expect(getPreviewCalls()).toBe(1)
  })

  test('Scen-Opt-2 — one 8030 card lists both crew on the same flight', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    const message = (age: number): string =>
      `Row 1: Pilot aged ${age} on flight 605 (2026-09-07) carrying 2 crew aged 50+ (limit 1).`
    await wireMocks(page, {
      delayMs: 0,
      result: {
        allowed: true,
        violations: [
          {
            crewId: '2314',
            pairingId: ASSIGN_PAIRING_ID,
            dutySeq: 1,
            ruleCode: '8030',
            ruleInstance: '001',
            scopeKey: 'row-1',
            severity: 1,
            startDt: '2026-03-03T08:00:00.000Z',
            endDt: '2026-03-03T16:00:00.000Z',
            flightId: 77370,
            message: message(58),
          },
          {
            crewId: '264',
            pairingId: ASSIGN_PAIRING_ID,
            dutySeq: 1,
            ruleCode: '8030',
            ruleInstance: '001',
            scopeKey: 'row-1',
            severity: 1,
            startDt: '2026-03-03T08:00:00.000Z',
            endDt: '2026-03-03T16:00:00.000Z',
            flightId: 77370,
            message: message(51),
          },
        ],
      },
    })
    await openRoScenario(page)
    await acquireEditLock(page)

    const pairingPuck = await page.evaluate(
      ({ sid, pid }) => window.__ganttTest!.scenarioPairingPuck!(sid, pid) ?? null,
      { sid: RO_SCENARIO_ID, pid: ASSIGN_PAIRING_ID },
    )
    expect(pairingPuck, 'pairing puck must resolve').toBeTruthy()
    const pairingBox = await page.getByTestId('scenario-pairing-canvas').boundingBox()
    const rosterBox = await page.getByTestId('scenario-roster-canvas').boundingBox()
    expect(pairingBox).toBeTruthy()
    expect(rosterBox).toBeTruthy()

    await page.mouse.move(pairingBox!.x + pairingPuck!.x, pairingBox!.y + pairingPuck!.y)
    await page.mouse.down()
    await page.mouse.move(rosterBox!.x + 160, rosterBox!.y + 51, { steps: 8 })
    await page.mouse.up()

    const dialog = page.getByTestId('rule-confirm-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog.getByTestId('rule-confirm-group-8030-0')).toHaveCount(1)
    await expect(dialog.getByTestId('rule-confirm-member-2314')).toContainText('Crew 2314')
    await expect(dialog.getByTestId('rule-confirm-member-2314')).toContainText('Age 58')
    await expect(dialog.getByTestId('rule-confirm-member-264')).toContainText('Crew 264')
    await expect(dialog.getByTestId('rule-confirm-member-264')).toContainText('Age 51')
    await expect(dialog).toContainText('1 Soft')
    await expect(dialog).not.toContainText('2 Soft')
  })
})
