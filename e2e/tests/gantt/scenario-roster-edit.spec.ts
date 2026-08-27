/**
 * RO Scenario Roster EDIT regression (P3 — final task).
 *
 * P3 added RO-scenario roster editing on the converged scenario-roster PaneCanvas:
 *   - right-click a pairing puck → ScenarioContextMenu → "Remove from crew"
 *     (capability `canRemove` + lock owner gated; P3.5 routed the remove through the menu)
 *   - the remove is an OPTIMISTIC patch (pendingChanges) re-built into the roster items
 *   - a pre-check fires the rule engine for the affected crew → violation badges
 *   - Save POSTs the accumulated patches to /api/scenario/:id/patch-output
 *
 * This spec proves that pipeline end-to-end on RO scenario 6, with everything the
 * scenario view needs mocked deterministically (the demo engine-server 502s on
 * /gantt-data — see scenario-roster-shared-canvas.spec.ts):
 *
 *   Scen-2010 — menu-driven remove applies the optimistic patch.
 *               A REAL `mousedown` (button 2) at the puck's on-screen coordinate
 *               (computed by the dev-only `window.__ganttTest.scenarioRosterPuck` probe)
 *               opens the ScenarioContextMenu; clicking "Remove from crew" runs the same
 *               store remove patch. Proof: `scenarioPendingChanges` carries exactly
 *               `{op:'remove', crewId:'C0001', pairingId:2000}` and the affected
 *               crew row loses the puck (puck probe returns null after).
 *
 *   Scen-2011 — Save POSTs the patch. After the remove, the toolbar Save button
 *               (`sg-save-btn`, shown only to the lock owner) is clicked and the
 *               intercepted /patch-output request body is asserted to be
 *               `{ patches: [{op:'remove', crewId:'C0001', pairingId:2000}] }`.
 *
 *   Scen-2012 — pre-check produces a violation badge. /check/batch is mocked to
 *               return a deterministic ERROR violation for pairing 2000; after the
 *               remove fires the pre-check, `scenarioViolationKeys` contains
 *               `pairing:2000` (the keyed map that drives the canvas violation badge).
 *
 * Proof model (§No-Illusion): assertions read concrete patch objects, the request
 * body, the puck delta and the violation key — NOT bare toBeVisible().
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'
import { SEG, readSegmentCells } from '../../utils/pairing-info'

const RO_SCENARIO_ID = 6
const RO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'

/** ≥2 crew so a reassign has a target; seniority "1".."N" → deterministic C0001-first order. */
const CREW_COUNT = 4
/** The crew that owns the assigned pairing — first row (seniority 1). */
const OWNER_CREW = 'C0001'
/** The assigned pairing the test removes. */
const PAIRING_ID = 2000
const ASSIGN_PAIRING_ID = 2002
/**
 * A SECOND pairing also assigned to the owner crew. The remove pre-check re-checks
 * the affected crew's REMAINING roster, so this pairing stays after the remove and
 * is what /check/batch evaluates → the violation badge in Scen-2012 keys to it.
 */
const KEEP_PAIRING_ID = 2001

const RO_CAPABILITIES = {
  panes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

const mkPairing = (pairingId: number, label: string, day: string, fill = 1) => ({
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

// Two pairings, both assigned to the owner crew. PAIRING_ID (day 02) is the left-most
// removable puck; KEEP_PAIRING_ID (day 10) remains after the remove and drives the
// pre-check violation in Scen-2012.
const MOCK_PAIRINGS = [
  mkPairing(PAIRING_ID, 'P2000', '02'),
  mkPairing(KEEP_PAIRING_ID, 'P2001', '10'),
  // P2002 gets an open CA + FO slot so the rank gate resolves a non-cross-rank assign.
  { ...mkPairing(ASSIGN_PAIRING_ID, 'P2002', '15', 0), compositions: [
    { rank: 'CA', plan: 1, fill: 0 },
    { rank: 'FO', plan: 1, fill: 0 },
  ] },
]

const MOCK_PAIRING_SEGMENTS = [
  mkSegment(PAIRING_ID, 6000, '2000', '02'),
  mkSegment(KEEP_PAIRING_ID, 6001, '2001', '10'),
  mkSegment(ASSIGN_PAIRING_ID, 6002, '2002', '15'),
]

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
      // Date-effective rank history so the assign rank gate resolves a valid rank.
      ranks: [{ id: i + 1, crewId, rank, effDt: '2026-01-01T00:00:00Z', expDt: null }],
    }
  }),
  pairings: MOCK_PAIRINGS,
  // Both pairings assigned to C0001 (first row): PAIRING_ID is removed, KEEP_PAIRING_ID stays.
  assignments: [
    { crewId: OWNER_CREW, pairingId: PAIRING_ID, source: 'CR' as const },
    { crewId: OWNER_CREW, pairingId: KEEP_PAIRING_ID, source: 'CR' as const },
  ],
  pairingSegments: MOCK_PAIRING_SEGMENTS,
  flights: [],
  groundItems: [],
  crewStats: {},
}

/** Lock-status mock: the user owns the edit lock → editing gates open. */
const OWNER_LOCK = { locked: true, owner: 'admin', ttl: 600, isOwner: true }
/** Initial (pre-acquire) lock-status: nobody holds it → read-only until acquired. */
const FREE_LOCK = { locked: false, owner: null, ttl: null, isOwner: false }

/**
 * Deterministic ERROR (non-overridable) violation for the REMAINING pairing
 * (KEEP_PAIRING_ID). The remove pre-check re-checks the owner crew's surviving
 * roster, so /check/batch evaluates KEEP_PAIRING_ID; the engine result must key to
 * that id for runRuleBatch to map it back to the crew/pairing. (The pre-check is
 * before/after-diffed, so the violation must be NEW: it is absent in the "before"
 * roster only if the before/after rule sets differ — here both runs return the same
 * single rule, but `runPreCheck` is called WITHOUT a currentItems baseline from the
 * pane effect, so every returned violation is flagged isNew and kept.)
 */
const VIOLATION_BATCH = {
  totalDuration: 1,
  items: [
    {
      id: KEEP_PAIRING_ID,
      result: {
        calcResults: [],
        passedAll: false,
        highestSeverity: 3,
        checkResults: [
          {
            ruleCode: 'TEST_MAX_DUTY',
            ruleName: 'Max Duty Period',
            passed: false,
            severity: 3,
            actualValue: 14,
            limitValue: 13,
            unit: 'h',
            message: 'Duty exceeds the maximum allowed.',
            overridable: false,
          },
        ],
      },
    },
  ],
}

const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
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
    optimizedCount: 2,
    leadinLive: 1 as const,
    updatedBy: 'admin',
    updatedAt: '2026-03-01T00:00:00.000Z',
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

interface ScenarioMocks {
  /** Patch bodies captured at /patch-output (most recent last). */
  patchBodies: Array<{ patches: unknown[] }>
  /** True once /check/batch has been requested at least once. */
  checkBatchCalled: () => boolean
}

/**
 * Wire all scenario APIs the edit flow touches. `lockOwned` decides whether the
 * lock-status / acquire-lock endpoints grant ownership (so a single helper covers
 * both the read-only baseline and the editable path).
 */
const wireMocks = async (
  page: Page,
  ganttData: typeof MOCK_GANTT_DATA | ((callIndex: number) => typeof MOCK_GANTT_DATA | Promise<typeof MOCK_GANTT_DATA>) = MOCK_GANTT_DATA,
): Promise<ScenarioMocks> => {
  const patchBodies: Array<{ patches: unknown[] }> = []
  let checkBatch = false
  let ganttDataCall = 0

  await page.route('**/api/version', (route) => route.fulfill(ok({ appVersion: 'test' })))
  await page.route('**/api/auth/me', (route) => route.fulfill(ok({
    user: {
      userCode: 'admin',
      userName: 'Admin',
      schema: 'f8',
      isAdmin: 1,
    },
    menus: [],
    ctrls: {},
    dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
  })))
  await page.route('**/api/public/config', (route) => route.fulfill(ok({
    airline: 'F8',
    timezone: 'UTC',
    language: 'en',
    theme: 'light',
    dateFormat: 'yyyy-MM-dd',
  })))
  await page.route('**/api/dashboard/overview', (route) => route.fulfill(ok(dashboardOverview)))
  await page.route('**/api/assignment', (route) => route.fulfill(ok({ items: [] })))
  await page.route('**/api/assignment/group', (route) => route.fulfill(ok({ items: [] })))
  await page.route('**/api/scenario/run-health', (route) => route.fulfill(ok({ ok: true })))
  await page.route('**/api/scenario?*', (route) => route.fulfill(ok(scenarioListResponse)))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}`, (route) => route.fulfill(ok(scenarioDetail)))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/results`, (route) => route.fulfill(ok({})))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/progress`, (route) => route.fulfill(ok({})))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/versions`, (route) => route.fulfill(ok({ items: [] })))

  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, async (route) => {
    const data = typeof ganttData === 'function' ? await ganttData(ganttDataCall++) : ganttData
    await route.fulfill(ok(data))
  })
  // Acquire-lock returns success; lock-status then reports ownership.
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/acquire-lock`, (route) =>
    route.fulfill(ok({ acquired: true })),
  )
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-keepalive`, (route) =>
    route.fulfill(ok({ renewed: true })),
  )
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/release-lock`, (route) =>
    route.fulfill(ok(null)),
  )
  // Before the test clicks "acquire", the store has never fetched lock-status (the
  // view only polls every 30s), so isOwner stays false. After acquireLock() the
  // store fetches lock-status — return ownership so the edit gates open.
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) =>
    route.fulfill(ok(OWNER_LOCK)),
  )

  // patch-output: capture the request body, return success.
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}/patch-output`, async (route) => {
    const body = route.request().postDataJSON() as { patches: unknown[] }
    patchBodies.push(body)
    await route.fulfill(ok({ patched: body.patches?.length ?? 0 }))
  })

  await page.route('**/api/legality/preview-draft', (route) =>
    route.fulfill(ok({ allowed: true, violations: [] })),
  )

  // Rule engine batch check (pre-check) → deterministic violation for pairing 2000.
  await page.route('**/altair/rule/check/batch', (route) => {
    checkBatch = true
    route.fulfill(ok(VIOLATION_BATCH))
  })

  return { patchBodies, checkBatchCalled: () => checkBatch }
}

const openRoScenario = async (page: Page): Promise<void> => {
  await page.goto(`/altair/scenario/${RO_SCENARIO_ID}`)
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })
}

/** Click the toolbar "acquire edit lock" button and wait until the store reports ownership. */
const acquireEditLock = async (page: Page): Promise<void> => {
  const acquireBtn = page.getByTestId('sg-acquire-lock-btn')
  await expect(acquireBtn).toBeVisible({ timeout: 10_000 })
  await acquireBtn.hover()
  await expect(page.getByText('Enable editing', { exact: true })).toBeVisible()
  await acquireBtn.click()
  // Ownership flips → the read-only "Viewing" button is replaced by the "Editing"
  // (release) button, and the Save button appears (owner-only). Assert via the
  // release button so we know lockStatus.isOwner is true before editing.
  await expect(page.getByTestId('sg-release-lock-btn')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('sg-release-lock-btn').hover()
  await expect(page.getByText('Exit editing', { exact: true })).toBeVisible()
  await expect(page.getByText('Edit lock acquired', { exact: true })).toHaveCount(0)
}

const expectEditingBadgeReadable = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('sg-release-lock-btn').locator('svg')).toHaveClass(/lucide-pencil-line/)

  const styles = await page.getByTestId('sg-release-lock-btn').evaluate((el) => {
    const computed = window.getComputedStyle(el)
    return {
      backgroundColor: computed.backgroundColor,
      borderTopWidth: computed.borderTopWidth,
      borderTopStyle: computed.borderTopStyle,
    }
  })

  expect(styles.backgroundColor, 'Editing badge must have a visible background').not.toBe('rgba(0, 0, 0, 0)')
  expect(styles.backgroundColor, 'Editing badge must have a visible background').not.toBe('transparent')
  expect(styles.borderTopStyle, 'Editing badge must have a visible border').not.toBe('none')
  expect(Number.parseFloat(styles.borderTopWidth), 'Editing badge border must be at least 1px').toBeGreaterThanOrEqual(1)
}

/** Read the removable puck probe from the dev-only test hook (live scenario geometry). */
const readPuck = (
  page: Page,
  wantPairingId?: number,
): Promise<{ x: number; y: number; pairingId: number; crewId: string; itemId: number } | null> =>
  page.evaluate(
    ({ sid, pid }) => window.__ganttTest!.scenarioRosterPuck!(sid, pid) ?? null,
    { sid: RO_SCENARIO_ID, pid: wantPairingId },
  )

const readPairingPuck = (
  page: Page,
  wantPairingId?: number,
): Promise<{ x: number; y: number; pairingId: number; segId: number; fltId: number | null } | null> =>
  page.evaluate(
    ({ sid, pid }) => {
      const puck = window.__ganttTest!.scenarioPairingPuck!(sid, pid) ?? null
      if (!puck) return null
      const visibleRowIndex = window.__ganttTest!.pairingPanelOrder!()
        .findIndex((row) => row.id === String(puck.pairingId))
      if (visibleRowIndex < 0) return null
      return { ...puck, y: 30 + visibleRowIndex * 42 + 21 }
    },
    { sid: RO_SCENARIO_ID, pid: wantPairingId },
  )

/** Wait until the removable puck for PAIRING_ID is rendered, then return it. */
const waitForRemovablePuck = async (
  page: Page,
): Promise<{ x: number; y: number; pairingId: number; crewId: string; itemId: number }> => {
  await expect
    .poll(() => readPuck(page, PAIRING_ID), { timeout: 15_000, message: 'no removable scenario-roster puck rendered' })
    .not.toBeNull()
  const puck = await readPuck(page, PAIRING_ID)
  expect(puck, 'puck probe must resolve').toBeTruthy()
  return puck!
}

const waitForPairingPuck = async (
  page: Page,
): Promise<{ x: number; y: number; pairingId: number; segId: number; fltId: number | null }> => {
  await expect
    .poll(() => readPairingPuck(page, ASSIGN_PAIRING_ID), { timeout: 15_000, message: 'no scenario-pairing puck rendered' })
    .not.toBeNull()
  const puck = await readPairingPuck(page, ASSIGN_PAIRING_ID)
  expect(puck, 'pairing puck probe must resolve').toBeTruthy()
  return puck!
}

const readPending = (page: Page): Promise<Array<{ op: string; crewId: string; pairingId: number; toCrewId?: string }>> =>
  page.evaluate((sid) => window.__ganttTest!.scenarioPendingChanges!(sid), RO_SCENARIO_ID) as Promise<
    Array<{ op: string; crewId: string; pairingId: number; toCrewId?: string }>
  >

/**
 * Remove via the scenario context menu: dispatch a REAL mousedown (button 2) at the puck's
 * screen coordinate to open the ScenarioContextMenu, then click "Remove from crew". The menu
 * item produces the SAME remove patch the old direct right-click did (op:'remove', crewId,
 * pairingId) — capability + lock gated inside the store. (Right-click no longer removes
 * directly; it opens the scenario menu — see scenario-context-menu.spec.ts.)
 */
const removeViaMenu = async (
  page: Page,
  puck: { x: number; y: number },
): Promise<void> => {
  const canvas = page.getByTestId('scenario-roster-canvas')
  const box = await canvas.boundingBox()
  expect(box, 'scenario-roster-canvas must have a bounding box').toBeTruthy()
  const clientX = box!.x + puck.x
  const clientY = box!.y + puck.y
  await page.evaluate(
    ({ cx, cy }) => {
      const el = document.querySelector('[data-testid="scenario-roster-canvas"]') as HTMLCanvasElement | null
      if (!el) throw new Error('scenario-roster-canvas not found')
      const opts: MouseEventInit = { bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: cx, clientY: cy }
      el.dispatchEvent(new MouseEvent('mousedown', opts))
    },
    { cx: clientX, cy: clientY },
  )
  const menu = page.getByTestId('scenario-context-menu')
  await expect(menu).toBeVisible({ timeout: 5_000 })
  await menu.getByText('Remove from crew', { exact: true }).click()
}

const openPairingDetailViaMenu = async (
  page: Page,
  puck: { x: number; y: number },
): Promise<void> => {
  const canvas = page.getByTestId('scenario-roster-canvas')
  const box = await canvas.boundingBox()
  expect(box, 'scenario-roster-canvas must have a bounding box').toBeTruthy()
  const clientX = box!.x + puck.x
  const clientY = box!.y + puck.y
  await page.evaluate(
    ({ cx, cy }) => {
      const el = document.querySelector('[data-testid="scenario-roster-canvas"]') as HTMLCanvasElement | null
      if (!el) throw new Error('scenario-roster-canvas not found')
      const opts: MouseEventInit = { bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: cx, clientY: cy }
      el.dispatchEvent(new MouseEvent('mousedown', opts))
    },
    { cx: clientX, cy: clientY },
  )
  const menu = page.getByTestId('scenario-context-menu')
  await expect(menu).toBeVisible({ timeout: 5_000 })
  await menu.getByText('View pairing detail', { exact: true }).click()
}

const clickRosterPuck = async (
  page: Page,
  puck: { x: number; y: number },
): Promise<void> => {
  const canvas = page.getByTestId('scenario-roster-canvas')
  const box = await canvas.boundingBox()
  expect(box, 'scenario-roster-canvas must have a bounding box').toBeTruthy()
  await page.mouse.click(box!.x + puck.x, box!.y + puck.y)
}

const dragPairingToSecondCrew = async (
  page: Page,
  puck: { x: number; y: number; segId: number },
): Promise<void> => {
  const pairingCanvas = page.getByTestId('scenario-pairing-canvas')
  const rosterCanvas = page.getByTestId('scenario-roster-canvas')
  const pairingBox = await pairingCanvas.boundingBox()
  const rosterBox = await rosterCanvas.boundingBox()
  expect(pairingBox, 'scenario-pairing-canvas must have a bounding box').toBeTruthy()
  expect(rosterBox, 'scenario-roster-canvas must have a bounding box').toBeTruthy()

  const startX = pairingBox!.x + puck.x
  const startY = pairingBox!.y + puck.y
  const targetX = rosterBox!.x + 160
  const targetY = rosterBox!.y + 30 + 43 + 21

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await expect
    .poll(() => page.evaluate((sid) => window.__ganttTest!.scenarioPairingSelection!(sid), RO_SCENARIO_ID), {
      timeout: 2_000,
      message: 'pairing puck mousedown did not select a segment',
    })
    .toContain(puck.segId)
  await page.mouse.move(targetX, targetY, { steps: 2 })
  await page.mouse.up()
}

test.describe('RO scenario roster edit — remove + save patch + violation', () => {
  test.beforeEach(async ({ page }) => {
    await seedGanttAuth(page, page.request)
  })

  test('Scen-2010 — menu "Remove from crew" applies the optimistic remove patch', async ({ page }) => {
    await wireMocks(page)
    await openRoScenario(page)
    await acquireEditLock(page)
    await expectEditingBadgeReadable(page)

    // Baseline: the owner crew has a removable pairing puck on-screen.
    const puck = await waitForRemovablePuck(page)
    expect(puck.pairingId, 'puck belongs to the mocked pairing').toBe(PAIRING_ID)
    expect(puck.crewId, 'puck belongs to the owner crew').toBe(OWNER_CREW)

    // No pending changes yet.
    expect(await readPending(page), 'no pending changes before the edit').toHaveLength(0)

    // ── Right-click the puck → context menu → "Remove from crew" ──
    await removeViaMenu(page, puck)

    // The optimistic patch must be exactly one remove for the owner crew + pairing.
    await expect
      .poll(() => readPending(page), { timeout: 10_000, message: 'remove patch never reached pendingChanges' })
      .toEqual([{ op: 'remove', crewId: OWNER_CREW, pairingId: PAIRING_ID }])

    // The removed pairing's puck is gone from the rebuilt roster (optimistic remove took effect).
    await expect
      .poll(() => readPuck(page, PAIRING_ID), { timeout: 10_000, message: 'puck still present after remove' })
      .toBeNull()

    await page.getByTestId('sg-release-lock-btn').click()
    await expect(page.getByTestId('sg-acquire-lock-btn')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Edit lock released', { exact: true })).toHaveCount(0)
  })

  test('Scen-2011 — Save POSTs the accumulated remove patch to /patch-output', async ({ page }) => {
    const mocks = await wireMocks(page)
    await openRoScenario(page)
    await acquireEditLock(page)

    const puck = await waitForRemovablePuck(page)
    await removeViaMenu(page, puck)
    await expect
      .poll(() => readPending(page), { timeout: 10_000, message: 'remove patch never reached pendingChanges' })
      .toEqual([{ op: 'remove', crewId: OWNER_CREW, pairingId: PAIRING_ID }])

    // ── Save (owner-only toolbar button; enabled because the draft is dirty) ──
    const saveBtn = page.getByTestId('sg-save-btn')
    await expect(saveBtn).toBeEnabled({ timeout: 10_000 })

    const patchPosted = page.waitForResponse(
      (r) => r.url().includes(`/api/scenario/${RO_SCENARIO_ID}/patch-output`) && r.request().method() === 'POST',
      { timeout: 15_000 },
    )
    await saveBtn.click()
    await patchPosted

    // The intercepted request body must carry exactly the remove patch we made.
    expect(mocks.patchBodies, 'one patch-output POST captured').toHaveLength(1)
    expect(mocks.patchBodies[0]).toEqual({
      patches: [{ op: 'remove', crewId: OWNER_CREW, pairingId: PAIRING_ID }],
    })

    // After save resolves, the store clears pendingChanges (reload returns the same mock).
    await expect
      .poll(() => readPending(page), { timeout: 10_000, message: 'pendingChanges not cleared after save' })
      .toHaveLength(0)
  })

  test('Scen-2011b — save reloads authoritative rosterDutyRefs before reopening pairing detail', async ({ page }) => {
    const mocks = await wireMocks(page, (callIndex) => callIndex === 0
      ? { ...MOCK_GANTT_DATA, rosterDutyRefs: [] }
      : {
          ...MOCK_GANTT_DATA,
          assignments: MOCK_GANTT_DATA.assignments.map((assignment) => assignment.pairingId === ASSIGN_PAIRING_ID
            ? { ...assignment, crewId: 'C0002' }
            : assignment),
          rosterDutyRefs: [
            { crewId: 'C0002', pairingId: ASSIGN_PAIRING_ID, dutySeq: 1, dutyRefTz: -420 },
          ],
        })

    await openRoScenario(page)
    await acquireEditLock(page)

    const puck = await waitForPairingPuck(page)
    await dragPairingToSecondCrew(page, puck)
    await expect
      .poll(() => readPending(page), { timeout: 10_000, message: 'pairing drag never reached pendingChanges' })
      .toContainEqual({ op: 'add', crewId: 'C0002', pairingId: ASSIGN_PAIRING_ID, rosterActingRank: 'FO' })

    const saveBtn = page.getByTestId('sg-save-btn')
    await expect(saveBtn).toBeEnabled({ timeout: 10_000 })
    await saveBtn.click()

    await expect
      .poll(() => readPending(page), { timeout: 10_000, message: 'pendingChanges not cleared after save' })
      .toHaveLength(0)
    expect(mocks.patchBodies, 'one patch-output POST captured').toHaveLength(1)

    await expect
      .poll(() => readPuck(page, ASSIGN_PAIRING_ID), { timeout: 10_000, message: 'reloaded roster puck never rendered' })
      .not.toBeNull()
    const rosterPuck = await readPuck(page, ASSIGN_PAIRING_ID)
    expect(rosterPuck, 'saved pairing must still be visible on roster').toBeTruthy()

    await openPairingDetailViaMenu(page, rosterPuck!)
    const dialog = page.getByTestId('pairing-info-dialog')
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 10_000 })

    const rows = await readSegmentCells(dialog)
    expect(rows[0][SEG.REF]).toMatch(/^[+-]\d+:\d{2}$/)
  })

  test('Scen-2012 — the remove pre-check produces a violation for the edited pairing', async ({ page }) => {
    const mocks = await wireMocks(page)
    await openRoScenario(page)
    await acquireEditLock(page)

    const puck = await waitForRemovablePuck(page)
    await removeViaMenu(page, puck)
    await expect
      .poll(() => readPending(page), { timeout: 10_000, message: 'remove patch never reached pendingChanges' })
      .toEqual([{ op: 'remove', crewId: OWNER_CREW, pairingId: PAIRING_ID }])

    // The pre-check effect fires the rule engine for the affected crew.
    await expect
      .poll(() => mocks.checkBatchCalled(), { timeout: 10_000, message: '/check/batch was never called by the pre-check' })
      .toBe(true)

    // The keyed violation map (which drives the canvas badge) carries the remaining pairing.
    await expect
      .poll(
        () => page.evaluate((sid) => window.__ganttTest!.scenarioViolationKeys!(sid), RO_SCENARIO_ID),
        { timeout: 10_000, message: 'pre-check produced no violation for the affected crew roster' },
      )
      .toContain(`pairing:${KEEP_PAIRING_ID}`)
  })

  test('Scen-2013 — toolbar Delete only removes selected source=CR tasks and supports undo/redo', async ({ page }) => {
    await wireMocks(page)
    await openRoScenario(page)
    await acquireEditLock(page)

    const puck = await waitForRemovablePuck(page)
    await clickRosterPuck(page, puck)
    await page.getByTestId('sg-delete-btn').click()

    await expect
      .poll(() => readPending(page), { timeout: 10_000, message: 'toolbar delete patch never reached pendingChanges' })
      .toEqual([{ op: 'remove', crewId: OWNER_CREW, pairingId: PAIRING_ID }])
    await expect(page.getByTestId('sg-save-btn')).toContainText('1')

    await page.getByTestId('sg-undo-btn').click()
    await expect.poll(() => readPending(page), { timeout: 10_000 }).toHaveLength(0)

    await page.getByTestId('sg-redo-btn').click()
    await expect
      .poll(() => readPending(page), { timeout: 10_000 })
      .toEqual([{ op: 'remove', crewId: OWNER_CREW, pairingId: PAIRING_ID }])
  })

  test('Scen-2014 — toolbar Delete does not alter selected immutable (PA/IMP) tasks', async ({ page }) => {
    await wireMocks(page, {
      ...MOCK_GANTT_DATA,
      assignments: [
        { crewId: OWNER_CREW, pairingId: PAIRING_ID, source: 'IMP' as const },
        { crewId: OWNER_CREW, pairingId: KEEP_PAIRING_ID, source: 'PA' as const },
      ],
    })
    await openRoScenario(page)
    await acquireEditLock(page)

    const puck = await waitForRemovablePuck(page)
    await clickRosterPuck(page, puck)
    await page.getByTestId('sg-delete-btn').click()

    await expect.poll(() => readPending(page), { timeout: 3_000 }).toHaveLength(0)
    await expect.poll(() => readPuck(page, PAIRING_ID), { timeout: 3_000 }).not.toBeNull()
  })

  test('Scen-2015 — dragging a pairing to a crew row creates an add patch', async ({ page }) => {
    await wireMocks(page)
    await openRoScenario(page)
    await acquireEditLock(page)

    const puck = await waitForPairingPuck(page)
    await dragPairingToSecondCrew(page, puck)

    await expect
      .poll(() => readPending(page), { timeout: 10_000, message: 'pairing drag never reached pendingChanges' })
      .toContainEqual({ op: 'add', crewId: 'C0002', pairingId: ASSIGN_PAIRING_ID, rosterActingRank: 'FO' })
  })

  test('Scen-2016 — mate 7507 from preview-draft does not open the assign confirm dialog', async ({ page }) => {
    const previewBodies: Array<Record<string, unknown>> = []
    await wireMocks(page)
    await page.route('**/api/legality/preview-draft', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      previewBodies.push(body)
      await route.fulfill(ok({
        allowed: false,
        violations: [
          {
            crewId: 'C0001',
            pairingId: 138732,
            dutySeq: null,
            ruleCode: '7507',
            ruleInstance: '001',
            scopeKey: '1RP',
            severity: 1,
            startDt: '2026-03-01T00:00:00.000Z',
            endDt: '2026-03-31T23:59:59.000Z',
            message: 'The number of days off(9) must be at least 10 in 1 RP (2026-03-01, 2026-03-31).',
          },
        ],
      }))
    })
    await openRoScenario(page)
    await acquireEditLock(page)

    const puck = await waitForPairingPuck(page)
    await dragPairingToSecondCrew(page, puck)

    await expect
      .poll(() => readPending(page), { timeout: 10_000, message: 'pairing drag never reached pendingChanges' })
      .toContainEqual({ op: 'add', crewId: 'C0002', pairingId: ASSIGN_PAIRING_ID, rosterActingRank: 'FO' })

    const dialog = page.getByTestId('rule-confirm-dialog')
    await expect(dialog).toHaveCount(0)
    expect(previewBodies.length).toBeGreaterThan(0)
    const posted = previewBodies[0]
    if (posted.rpFrom != null || posted.rpTo != null) {
      expect(posted.rpFrom).toBe('2026-03-01')
      expect(posted.rpTo).toBe('2026-03-31')
    }
  })

  test('Scen-2017 — FLY segment fill is blue and Reserve fill is light green', async ({ page }) => {
    await wireMocks(page, {
      ...MOCK_GANTT_DATA,
      pairings: [
        ...MOCK_PAIRINGS,
        {
          pairingId: 3001,
          pairingLabel: 'CRPM01',
          base: 'YEG',
          schStrDtUtc: '2026-03-20T08:00:00.000Z',
          schEndDtUtc: '2026-03-20T16:00:00.000Z',
          assignmentGroup: 'RES',
          assignment: 'CRPM',
          division: 'Cabin',
          compositions: [{ rank: 'FA', plan: 1, fill: 0 }],
        },
      ],
      groundItems: [
        {
          crewId: OWNER_CREW,
          assignmentGroup: 'GRD',
          assignment: 'RES',
          label: 'RES',
          schStrDtUtc: '2026-03-05T08:00:00.000Z',
          schEndDtUtc: '2026-03-05T16:00:00.000Z',
          actingRank: 'CA',
          source: 'PA',
        },
      ],
    })
    await openRoScenario(page)

    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('scenario-pairing-canvas')).toBeVisible({ timeout: 10_000 })

    const fills = await page.evaluate(() => {
      const api = window.__ganttTest
      if (!api?.segmentDutyFill) return null
      return {
        fly: api.segmentDutyFill('FLY', 'FLY'),
        reservePairing: api.segmentDutyFill('RES', 'CRPM'),
        reserveGround: api.segmentDutyFill('GRD', 'RES'),
      }
    })
    expect(fills, 'gantt test hook segmentDutyFill must be available').not.toBeNull()
    expect(fills!.fly.kind).toBe('fly')
    expect(fills!.fly).toMatchObject({ top: '#1e40af', bottom: '#2563eb' })
    expect(fills!.reservePairing.kind).toBe('reserve')
    expect(fills!.reservePairing).toMatchObject({ baseColor: '#66CDAA' })
    expect(fills!.reserveGround.kind).toBe('reserve')
    expect(fills!.reserveGround).toMatchObject({ baseColor: '#66CDAA' })

    const pairings = await page.evaluate(
      (sid) => window.__ganttTest?.scenarioPairings?.(sid) ?? null,
      RO_SCENARIO_ID,
    )
    expect(pairings?.some((p) => p.id === ASSIGN_PAIRING_ID)).toBe(true)
    expect(pairings?.some((p) => p.id === 3001)).toBe(true)

    const ground = await page.evaluate(
      (sid) => window.__ganttTest?.scenarioGroundPucks?.(sid) ?? null,
      RO_SCENARIO_ID,
    )
    expect(ground?.some((g) => g.assignment === 'RES' && g.crewId === OWNER_CREW)).toBe(true)
  })
})
