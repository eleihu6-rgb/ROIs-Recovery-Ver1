/**
 * Pairing Info — Scenario mode follows the Scenario's saved Base timezone.
 *
 * The scenario toolbar's TimezoneSwitcher writes the picked Base into the shared
 * global timezone store via `setScenarioTimezone`; `applyScenarioTimezone` applies
 * that saved per-scenario selection when the scenario opens. The Pairing Info
 * dialog reads the SAME global store, so with the scenario's Base set to YVR the
 * dialog must default to "Airport" (YVR) and render every time in America/Vancouver
 * — identical behavior to Live (shared dialog component).
 *
 * The dialog is modal, so the scenario's Base is seeded via its persistence key
 * (gantt-scenario-timezones) before the scenario opens — the same precondition the
 * scenario toolbar produces. The dialog is opened the real-UI way (right-click the
 * scenario roster puck → "View pairing detail"), same as Scen-535-11012.
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth } from '../../utils/gantt-hook'
import { SEG, readSegmentCells } from '../../utils/pairing-info'

const SCENARIO_ID = 703
const SCENARIO_NAME = 'RO-TZ-Follow'
const OWNER_CREW = 'C0703'
const PAIRING_ID = 22010
const PAIRING_LABEL = 'F22010'
// 08:15Z on 2026-07-07 in America/Vancouver = PDT (UTC-7) → 7/7 01:15.
const SCH_STR_DT = '2026-07-07T08:15:00Z'
const SCH_END_DT = '2026-07-07T16:45:00Z'

const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
})

const TZ_OPTIONS = [
  { airport: 'YVR', airportName: 'VANCOUVER INTL', zoneId: 'America/Vancouver', utcOffset: 'UTC-420', isBase: true },
  { airport: 'YOW', airportName: 'MACDONALD-CARTIER INTL', zoneId: 'America/Toronto', utcOffset: 'UTC-240', isBase: true },
  { airport: 'UTC', airportName: 'Coordinated Universal Time', zoneId: 'UTC', utcOffset: 'UTC+0', isBase: false },
]

const RO_CAPABILITIES = {
  panes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

const MOCK_PAIRING = {
  pairingId: PAIRING_ID,
  pairingLabel: PAIRING_LABEL,
  base: 'YVR',
  schStrDtUtc: SCH_STR_DT,
  schEndDtUtc: SCH_END_DT,
  assignmentGroup: 'FLT',
  assignment: 'FLT',
  division: 'Pilots',
  compositions: [{ rank: 'CA', plan: 1, fill: 1 }],
}

const MOCK_SEGMENT = {
  pairingId: PAIRING_ID,
  dutySeq: 1,
  segSeq: 1,
  fltId: 22010,
  fltNum: '2010',
  airline: 'F8',
  depArp: 'YVR',
  arvArp: 'YYZ',
  segAssignment: 'FLT',
  schStrDtUtc: SCH_STR_DT,
  schEndDtUtc: SCH_END_DT,
  dutyStrArp: 'YVR',
  dutyEndArp: 'YVR',
  dutySchStrDtUtc: SCH_STR_DT,
  dutySchEndDtUtc: SCH_END_DT,
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

const buildGanttData = () => ({
  scenarioId: SCENARIO_ID,
  scenarioName: SCENARIO_NAME,
  fileType: 'RO' as const,
  capabilities: RO_CAPABILITIES,
  strDtLoc: '2026-07-01T00:00:00.000Z',
  endDtLoc: '2026-07-31T23:59:59.000Z',
  scenarioStrDt: '2026-07-01T00:00:00',
  scenarioEndDt: '2026-07-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: [{ crewId: OWNER_CREW, base: 'YVR', division: 'Pilots', rank: 'CA', seniorityNum: '703', crewName: 'Crew 703' }],
  pairings: [MOCK_PAIRING],
  assignments: [{ crewId: OWNER_CREW, pairingId: PAIRING_ID, source: 'CR' as const }],
  pairingSegments: [MOCK_SEGMENT],
  flights: [],
  groundItems: [],
  crewStats: {},
})

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

const MOCK_SCENARIO_ITEM = {
  id: SCENARIO_ID,
  name: SCENARIO_NAME,
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

const openScenario = async (page: Page): Promise<void> => {
  await page.route('**/api/scenario?**', (route) => route.fulfill(ok({
    items: [MOCK_SCENARIO_ITEM], total: 1, page: 1, pageSize: 20, totalPages: 1,
  })))
  await page.route(`**/api/scenario/${SCENARIO_ID}`, (route) => route.fulfill(ok(MOCK_SCENARIO_DETAIL)))
  await page.route(`**/api/scenario/${SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(buildGanttData())))
  await page.route(`**/api/scenario/${SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(MOCK_LOCK_STATUS)))
  await page.route((url) => url.pathname === '/altair/live/base/timezone-options', (route) => route.fulfill(ok(TZ_OPTIONS)))

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  await page.getByPlaceholder('Search scenarios…').fill(SCENARIO_NAME)
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(String(SCENARIO_ID), { exact: true }),
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
    { sid: SCENARIO_ID, pid: PAIRING_ID },
  )

const waitForPuck = async (page: Page): Promise<{ x: number; y: number; pairingId: number; crewId: string; itemId: number }> => {
  await expect
    .poll(() => readPuck(page), { timeout: 15_000, message: 'no scenario-roster pairing puck rendered' })
    .not.toBeNull()
  return (await readPuck(page))!
}

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

test.describe('Pairing Info — Scenario follows the Scenario Base timezone (Scen-703)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    // Precondition: the scenario's saved Base timezone is YVR (what the scenario
    // toolbar's TimezoneSwitcher persists via setScenarioTimezone).
    await page.addInitScript((sid) => {
      window.localStorage.setItem(
        'gantt-scenario-timezones',
        JSON.stringify({ [String(sid)]: { timezone: 'America/Vancouver', timezoneAirport: 'YVR' } }),
      )
    }, SCENARIO_ID)
  })

  test('Scenario Base = YVR → Pairing Info defaults to Airport(YVR) and renders in the YVR zone', async ({ page }) => {
    await openScenario(page)

    // The scenario toolbar reflects the saved Base.
    await expect(page.getByTestId('timezone-switcher')).toContainText('YVR')

    const puck = await waitForPuck(page)
    await rightClickPuck(page, puck)
    const menu = page.getByTestId('scenario-context-menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    await menu.getByText('View pairing detail', { exact: true }).click()

    const dialog = page.getByTestId('pairing-info-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 10_000 })

    // Defaults to Airport(YVR) — same behavior as Live with the Toolbar on YVR.
    await expect(dialog.getByTestId('pairing-info-tz-airport')).toHaveClass(/bg-primary/)
    await expect(dialog.getByTestId('pairing-info-tz-airport')).toHaveText('YVR')
    await expect(dialog.getByTestId('pairing-info-tz-utc')).not.toHaveClass(/bg-primary/)

    // Times render in America/Vancouver (PDT, UTC-7 on 2026-07-07): 08:15Z → 01:15.
    const cells = await readSegmentCells(dialog)
    expect(cells[0][SEG.STD], 'STD in YVR zone (08:15Z → 01:15 PDT)').toBe('7/7 01:15')
    expect(cells[0][SEG.STA], 'STA in YVR zone (16:45Z → 09:45 PDT)').toBe('7/7 09:45')
  })
})
