/**
 * Scenario Pairing-Detail dialog (P3.5 — Task 1).
 *
 * The Pairing Info dialog is an API-driven AppDialog backed by the ui-store
 * (pairingInfoOpen / pairingInfoId). It was only mounted in the LIVE app-layout,
 * so double-clicking a pairing puck inside a Scenario Gantt called
 * `openPairingInfo` but nothing rendered. Task 1 mounts <PairingInfoDialog/> in
 * the scenario view and wires the scenario ROSTER pane's double-click to
 * `openPairingInfo` (the pairing pane already did this).
 *
 *   Scen-2013 — double-clicking a rostered pairing puck in the scenario ROSTER
 *               pane opens the Pairing Detail dialog built from SCENARIO data, NOT
 *               the Live /api/pairing endpoint. The Live endpoints are mocked to
 *               404 here; the dialog still renders the pairing (title "Pairing
 *               #2000", label "P2000", segment flight number "2000", crew row for
 *               the rostered crew) with NO "Pairing not found". This is the
 *               regression for the bug where PairingInfoDialog ignored
 *               pairingInfoScenarioId and always hit Live → 404 → "not found".
 *
 *   Scen-2020 — double-clicking a flight puck in the scenario FLIGHT pane opens
 *               the Flight Detail dialog reading the SCENARIO gantt store (not the
 *               empty Live flight-store) and shows that flight's specific data
 *               (id #6010, flight number "2010", route YEG → YYZ). Crew Assignment
 *               merges scenario assignees with Live mates on the same physical
 *               fltId (out-of-scope bases). Proves flight fields stay scenario-
 *               backed while crew can include Live COF mates.
 *
 * Determinism (§No-Illusion): the demo engine-server 502s on /gantt-data (see
 * scenario-roster-shared-canvas.spec.ts), so gantt-data + lock-status are mocked
 * with real pairings/segments/assignments. The Pairing Info dialog in scenario
 * mode builds the detail from that scenario gantt-data via
 * buildScenarioPairingInfo — it does NOT call /api/pairing/:id. Scen-2013 mocks
 * those Live endpoints to 404 to PROVE the scenario path is taken (a Live fetch
 * would surface as "Pairing not found").
 *
 * The double-click is a REAL `dblclick` MouseEvent dispatched at the puck's
 * on-screen coordinate, computed by the dev-only `window.__ganttTest.scenarioRosterPuck`
 * probe from live scenario store geometry — so the pane's own interaction handler
 * + the new onItemDoubleClick wiring run end-to-end.
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

const RO_SCENARIO_ID = 6
const RO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'

const OWNER_CREW = 'C0001'
const PAIRING_ID = 2000
const PAIRING_LABEL = 'P2000'

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

const FLIGHT_ID = 6010
const FLIGHT_NUM = '2010'

/** One flight row for the scenario FLIGHT pane (Scen-2020). */
const MOCK_FLIGHT = {
  id: FLIGHT_ID,
  fltNum: FLIGHT_NUM,
  depArp: 'YEG',
  arvArp: 'YYZ',
  schDepDtUtc: '2026-03-02T08:00:00.000Z',
  schArvDtUtc: '2026-03-02T16:00:00.000Z',
  fleet: 'B737',
  register: 'C-FABC',
}

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
  crew: Array.from({ length: 4 }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`,
    base: 'YEG',
    division: 'Pilots',
    rank: i % 2 === 0 ? 'CA' : 'FO',
    seniorityNum: String(i + 1),
    crewName: `Crew ${i + 1}`,
  })),
  pairings: [MOCK_PAIRING],
  assignments: [
    {
      crewId: OWNER_CREW,
      pairingId: PAIRING_ID,
      source: 'CR' as const,
      crewRank: 'CA',
      flightActingRank: 'CA',
    },
  ],
  // Pairing puck uses flt 6000; Flight Detail (Scen-2020) uses flt 6010 — both FLY on same pairing.
  pairingSegments: [
    MOCK_SEGMENT,
    { ...MOCK_SEGMENT, fltId: FLIGHT_ID, fltNum: FLIGHT_NUM, segSeq: 2 },
  ],
  flights: [MOCK_FLIGHT],
  groundItems: [],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

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

const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
})

const openRoScenario = async (page: Page): Promise<void> => {
  // List/detail mocked so this suite does not depend on a seeded demo DB row.
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
  await expect(item, `mocked scenario "${RO_SCENARIO_NAME}" (#${RO_SCENARIO_ID})`).toHaveCount(1, { timeout: 10_000 })
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

/** Double-click the puck: dispatch a REAL dblclick MouseEvent at the puck's screen coordinate. */
const doubleClickPuck = async (page: Page, puck: { x: number; y: number }): Promise<void> => {
  const canvas = page.getByTestId('scenario-roster-canvas')
  const box = await canvas.boundingBox()
  expect(box, 'scenario-roster-canvas must have a bounding box').toBeTruthy()
  const clientX = box!.x + puck.x
  const clientY = box!.y + puck.y
  await page.evaluate(
    ({ cx, cy }) => {
      const el = document.querySelector('[data-testid="scenario-roster-canvas"]') as HTMLCanvasElement | null
      if (!el) throw new Error('scenario-roster-canvas not found')
      const opts: MouseEventInit = { bubbles: true, cancelable: true, button: 0, clientX: cx, clientY: cy }
      el.dispatchEvent(new MouseEvent('dblclick', opts))
    },
    { cx: clientX, cy: clientY },
  )
}

const readFlightPuck = (
  page: Page,
  wantFlightId?: number,
): Promise<{ x: number; y: number; flightId: number; fltNum: string } | null> =>
  page.evaluate(
    ({ sid, fid }) => window.__ganttTest!.scenarioFlightPuck!(sid, fid) ?? null,
    { sid: RO_SCENARIO_ID, fid: wantFlightId },
  )

/** Double-click the flight puck: dispatch a REAL dblclick at the puck's screen coordinate. */
const doubleClickFlightPuck = async (page: Page, puck: { x: number; y: number }): Promise<void> => {
  const canvas = page.getByTestId('scenario-flight-canvas')
  const box = await canvas.boundingBox()
  expect(box, 'scenario-flight-canvas must have a bounding box').toBeTruthy()
  const clientX = box!.x + puck.x
  const clientY = box!.y + puck.y
  await page.evaluate(
    ({ cx, cy }) => {
      const el = document.querySelector('[data-testid="scenario-flight-canvas"]') as HTMLCanvasElement | null
      if (!el) throw new Error('scenario-flight-canvas not found')
      const opts: MouseEventInit = { bubbles: true, cancelable: true, button: 0, clientX: cx, clientY: cy }
      el.dispatchEvent(new MouseEvent('dblclick', opts))
    },
    { cx: clientX, cy: clientY },
  )
}

test.describe('Scenario Pairing-Detail dialog', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Scen-2013 — pairing detail is built from SCENARIO data, not Live /api/pairing (no "Pairing not found")', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(MOCK_GANTT_DATA)))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(MOCK_LOCK_STATUS)))

    // The bug: PairingInfoDialog ignored pairingInfoScenarioId and always fetched from
    // the Live pairing path → for scenario pairing ids absent from the Live table this
    // 404s → "Pairing not found". Make those Live endpoints 404 here: if the dialog
    // touches them the detail would FAIL, so a passing assertion proves the scenario
    // path (buildScenarioPairingInfo) is taken. We also record whether they were hit.
    let liveHit = 0
    await page.route(`**/api/pairing/${PAIRING_ID}/crew-detail`, (route) => { liveHit++; return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 404, message: 'not found' }) }) })
    await page.route(`**/api/pairing/${PAIRING_ID}`, (route) => { liveHit++; return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 404, message: 'not found' }) }) })

    await openRoScenario(page)

    // Wait until the rostered pairing puck is rendered, then read its on-screen coordinate.
    await expect
      .poll(() => readPuck(page, PAIRING_ID), { timeout: 15_000, message: 'no scenario-roster pairing puck rendered' })
      .not.toBeNull()
    const puck = await readPuck(page, PAIRING_ID)
    expect(puck, 'puck probe must resolve').toBeTruthy()
    expect(puck!.pairingId).toBe(PAIRING_ID)
    expect(puck!.crewId).toBe(OWNER_CREW)

    // BEFORE: the dialog is not mounted/open.
    await expect(page.getByTestId('pairing-info-dialog')).toHaveCount(0)

    // ACT: double-click the puck → onItemDoubleClick → openPairingInfo(id, scenarioId) → dialog renders.
    await doubleClickPuck(page, puck!)

    const dialog = page.getByTestId('pairing-info-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // Title carries the scenario pairing id.
    await expect(dialog).toContainText(`Pairing #${PAIRING_ID}`)

    // Content renders from SCENARIO data — NOT the not-found / error state.
    const content = dialog.getByTestId('pairing-info-content')
    await expect(content).toBeVisible({ timeout: 10_000 })
    // Status node (Loading…/Error) must be gone — no "Pairing not found".
    await expect(dialog.getByTestId('pairing-info-status')).toHaveCount(0)
    await expect(dialog).not.toContainText('not found')

    // Specific scenario data: pairing label + the segment's flight number (from MOCK_SEGMENT).
    await expect(content).toContainText(PAIRING_LABEL)
    await expect(dialog.getByTestId('pairing-info-segments')).toContainText(MOCK_SEGMENT.fltNum)

    // Crew is joined from scenario assignments + crew roster (NOT the Live crew-detail).
    await expect(dialog.getByTestId('pairing-info-crew-count')).toHaveText('1')
    await expect(dialog.getByTestId('pairing-info-crew')).toContainText(OWNER_CREW)
    await expect(dialog.getByTestId('pairing-info-crew')).toContainText('Crew 1')

    // The Live pairing endpoints were never used.
    expect(liveHit, 'scenario detail must NOT fetch the Live /api/pairing endpoints').toBe(0)
  })

  test('Scen-2020 — flight detail uses SCENARIO flight data and merges Live crew mates', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(MOCK_GANTT_DATA)))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(MOCK_LOCK_STATUS)))
    await page.route('**/api/base/airport-timezones', (route) => route.fulfill(ok({
      YEG: 'America/Edmonton',
      YYZ: 'America/Toronto',
    })))

    // Crew Info falls back to Live /api/crew when the synthetic scenario crew is not in crew-store.
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

    // Flight-by-id must stay on the scenario store (snapshot flt id is absent from Live).
    // Crew list is intentionally fetched from Live and merged with scenario assignees.
    let liveFlightHit = 0
    let liveCrewHit = 0
    const LIVE_MATE = '1012'
    await page.route(`**/api/flight/${FLIGHT_ID}/crew`, (route) => {
      liveCrewHit++
      return route.fulfill(ok({
        items: [{
          seqOrder: 1,
          crewId: LIVE_MATE,
          crewName: 'Live Mate',
          base: 'YYZ',
          crewRank: 'CA',
          actingRank: 'CA',
          label: '',
          source: 'MANUAL',
          mbh: '0:00',
          mfdp: null,
        }],
        composition: {
          CA: { plan: 1, actual: 1 },
          FO: { plan: 1, actual: 0 },
          FA: { plan: 3, actual: 0 },
          IFD: { plan: 1, actual: 0 },
        },
        status: 'partial',
      }))
    })
    await page.route(`**/api/flight/${FLIGHT_ID}`, (route) => {
      liveFlightHit++
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 404, message: 'not found' }) })
    })

    await openRoScenario(page)

    // Open the FLIGHT pane (RO default panes are roster+pairing; flight is allowed and toggled on).
    await page.getByTestId('sg-add-pane-flight').click({ force: true })
    await expect(page.getByTestId('scenario-flight-canvas')).toBeVisible({ timeout: 10_000 })

    // Wait for the flight puck to render, then read its on-screen coordinate.
    await expect
      .poll(() => readFlightPuck(page, FLIGHT_ID), { timeout: 15_000, message: 'no scenario flight puck rendered' })
      .not.toBeNull()
    const puck = await readFlightPuck(page, FLIGHT_ID)
    expect(puck, 'flight puck probe must resolve').toBeTruthy()
    expect(puck!.flightId).toBe(FLIGHT_ID)
    expect(puck!.fltNum).toBe(FLIGHT_NUM)

    // BEFORE: the flight detail dialog is not open.
    await expect(page.getByTestId('flight-detail-dialog')).toHaveCount(0)

    // ACT: double-click the flight puck → openFlightDetail(id, scenarioId) → dialog renders scenario data.
    await doubleClickFlightPuck(page, puck!)

    const dialog = page.getByTestId('flight-detail-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // The dialog reads the SCENARIO store (Live flight-store is empty in a scenario):
    // specific data — flight id, flight number, and the YEG → YYZ route.
    await expect(dialog).toContainText(`#${FLIGHT_ID}`)
    await expect(dialog).toContainText(FLIGHT_NUM)
    await expect(dialog).toContainText('YEG')
    await expect(dialog).toContainText('YYZ')

    // Content renders from SCENARIO data — NOT the not-found / error / loading state.
    // The status node (Loading…/Error) must be gone, and no "not found" anywhere.
    await expect(dialog.getByTestId('flight-detail-status')).toHaveCount(0)
    await expect(dialog).not.toContainText('not found')
    await expect(dialog).not.toContainText('Error')

    // Scenario flights have no actuals → ops Status is Scheduled (not crew coverage).
    await expect(dialog.getByTestId('flight-detail-ops-status')).toHaveText('Scheduled')
    // No ATA → Block Hours from STD/STA (08:00–16:00 UTC → 8:00); no "BH" unit under the value.
    await expect(dialog.getByTestId('flight-detail-block-hours')).toHaveText('8:00')
    await expect(
      dialog.locator('.dur-item').filter({ has: dialog.getByTestId('flight-detail-block-hours') }).locator('.dur-unit'),
    ).toHaveCount(0)
    await expect(dialog.getByTestId('flight-detail-flight-date')).toHaveText('Mar 2, 2026')
    // STD/STA in airport local time (YEG MST −7 → 01:00; YYZ EST −5 → 11:00 on 2026-03-02).
    await expect(dialog.getByTestId('flight-detail-std')).toHaveText('01:00')
    await expect(dialog.getByTestId('flight-detail-sta')).toHaveText('11:00')
    await expect(dialog.getByTestId('flight-detail-std')).not.toContainText('UTC')
    await expect(dialog.getByTestId('flight-detail-sta')).not.toContainText('UTC')

    // Composition cards: CA filled (scenario assignee) → full; FO/IFD/FA plan with 0 actual → empty.
    // Display order: CA, FO, IFD, FA.
    await expect(dialog.getByTestId('flight-comp-card-CA')).toHaveClass(/full/)
    await expect(dialog.getByTestId('flight-comp-card-FO')).toHaveClass(/empty/)
    await expect(dialog.getByTestId('flight-comp-card-IFD')).toHaveClass(/empty/)
    await expect(dialog.getByTestId('flight-comp-card-FA')).toHaveClass(/empty/)
    await expect(dialog.locator('.comp-card')).toHaveCount(4)
    await expect(dialog.locator('.comp-card')).toHaveText([/CA/, /FO/, /IFD/, /FA/])

    // Crew Assignment = scenario assignee + Live mate on the same physical flight.
    const crewTable = dialog.locator('.crew-table')
    await expect(crewTable).toBeVisible()
    await expect(crewTable.locator('thead th')).toHaveText(['Crew ID', 'Name', 'Base', 'Active Rank', 'Acting Rank', 'Source'])
    await expect(dialog).not.toContainText('No crew assigned')
    await expect
      .poll(async () => crewTable.locator('.crew-id-val').count(), { timeout: 10_000 })
      .toBe(2)
    const crewIds = (await crewTable.locator('.crew-id-val').allTextContents()).map((t) => t.trim()).sort()
    expect(crewIds).toEqual([LIVE_MATE, OWNER_CREW].sort())
    await expect(crewTable).toContainText('Crew 1')
    await expect(crewTable).toContainText('Live Mate')
    // Scenario assignee base from gantt crew.base; Live mate base from Live crew payload.
    await expect(crewTable.locator('tr', { has: page.getByTestId(`flight-crew-id-${OWNER_CREW}`) })).toContainText('YEG')
    await expect(crewTable.locator('tr', { has: page.getByTestId(`flight-crew-id-${LIVE_MATE}`) })).toContainText('YYZ')
    // Acting Rank shows even when equal to Active Rank (not hidden as —).
    await expect(crewTable.locator('tr', { has: page.getByTestId(`flight-crew-id-${OWNER_CREW}`) }).locator('.col-acting .rank-pill')).toHaveText('CA')
    await expect(crewTable.locator('tr', { has: page.getByTestId(`flight-crew-id-${LIVE_MATE}`) }).locator('.col-acting .rank-pill')).toHaveText('CA')

    // Crew ID opens the shared Crew Info dialog (stacked above Flight Detail).
    await crewTable.getByTestId(`flight-crew-id-${OWNER_CREW}`).click()
    const crewInfo = page.getByTestId('crew-info-dialog')
    await expect(crewInfo).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Crew Info — Crew One', { exact: true })).toBeVisible()
    await expect(crewInfo.getByTestId('crew-info-summary')).toContainText(OWNER_CREW)
    await expect(dialog).toBeVisible()
    await page.getByTestId('crew-info-close').click()
    await expect(crewInfo).toHaveCount(0)
    await expect(dialog).toBeVisible()

    // No double-mount: exactly ONE flight detail dialog exists in the whole tree.
    await expect(page.getByTestId('flight-detail-dialog')).toHaveCount(1)

    expect(liveFlightHit, 'scenario flight detail must NOT fetch Live /api/flight/:id').toBe(0)
    expect(liveCrewHit, 'scenario flight detail merges Live /api/flight/:id/crew').toBeGreaterThan(0)
  })
})
