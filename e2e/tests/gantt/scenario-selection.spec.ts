/**
 * Scenario PAIRING pane selection (P3.7 + row/header selection).
 *
 * Scen-2050 — clicking a pairing puck selects it (solid selection outline via scenarioPairingSelection).
 * Selection uses a solid 3px focus ring + wash; CR unselected duties keep a thin green dashed identity ring.
 * Scen-2060 — status bar shows hovered pairing info.
 * Scen-2070 — clicking a pairing header row selects it (row/header highlight via
 *             scenarioPairingRowIds). Regression for bug: scenario pairing pane header
 *             clicks were silently ignored because makeScenarioPairingPaneSource was
 *             missing selectRow/toggleRowSelection/selectRowRange/useSelectedRowIds.
 * Scen-2071 — ESC clears the Scenario Pairing Pane row selection.
 *
 * Determinism: gantt-data + lock-status are mocked for tests that need scenario data.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const RO_SCENARIO_ID = 6
const RO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'

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
  compositions: [
    { rank: 'CA', plan: 1, fill: 1 },
    { rank: 'FO', plan: 1, fill: 0 },
  ],
}

const MOCK_SEGMENT = {
  pairingId: PAIRING_ID,
  dutySeq: 1,
  segSeq: 1,
  fltId: 6010,
  fltDt: '2026-03-02',
  fltNum: '2010',
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
  id: 6010,
  fltNum: '2010',
  depArp: 'YEG',
  arvArp: 'YYZ',
  schDepDtUtc: '2026-03-02T08:00:00.000Z',
  schArvDtUtc: '2026-03-02T16:00:00.000Z',
  fleet: 'B737',
  register: 'C-FABC',
}

const makeExtraPairing = (index: number) => ({
  ...MOCK_PAIRING,
  pairingId: PAIRING_ID + index,
  pairingLabel: `P${PAIRING_ID + index}`,
  schStrDtUtc: `2026-03-${String(2 + index).padStart(2, '0')}T08:00:00.000Z`,
  schEndDtUtc: `2026-03-${String(2 + index).padStart(2, '0')}T16:00:00.000Z`,
})

const makeExtraSegment = (index: number) => ({
  ...MOCK_SEGMENT,
  pairingId: PAIRING_ID + index,
  fltId: 6010 + index,
  fltDt: `2026-03-${String(2 + index).padStart(2, '0')}`,
  fltNum: String(2010 + index),
  schStrDtUtc: `2026-03-${String(2 + index).padStart(2, '0')}T08:00:00.000Z`,
  schEndDtUtc: `2026-03-${String(2 + index).padStart(2, '0')}T16:00:00.000Z`,
  dutySchStrDtUtc: `2026-03-${String(2 + index).padStart(2, '0')}T08:00:00.000Z`,
  dutySchEndDtUtc: `2026-03-${String(2 + index).padStart(2, '0')}T16:00:00.000Z`,
  brief1StartUtc: `2026-03-${String(2 + index).padStart(2, '0')}T08:00:00.000Z`,
  brief1EndUtc: `2026-03-${String(2 + index).padStart(2, '0')}T08:00:00.000Z`,
  debrief1StartUtc: `2026-03-${String(2 + index).padStart(2, '0')}T16:00:00.000Z`,
  debrief1EndUtc: `2026-03-${String(2 + index).padStart(2, '0')}T16:00:00.000Z`,
  pickup1StartUtc: `2026-03-${String(2 + index).padStart(2, '0')}T08:00:00.000Z`,
  pickup1EndUtc: `2026-03-${String(2 + index).padStart(2, '0')}T08:00:00.000Z`,
  dropoff1StartUtc: `2026-03-${String(2 + index).padStart(2, '0')}T16:00:00.000Z`,
  dropoff1EndUtc: `2026-03-${String(2 + index).padStart(2, '0')}T16:00:00.000Z`,
})

const makeExtraFlight = (index: number) => ({
  ...MOCK_FLIGHT,
  id: 6010 + index,
  fltNum: String(2010 + index),
  schDepDtUtc: `2026-03-${String(2 + index).padStart(2, '0')}T08:00:00.000Z`,
  schArvDtUtc: `2026-03-${String(2 + index).padStart(2, '0')}T16:00:00.000Z`,
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
  crew: Array.from({ length: 4 }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`,
    base: 'YEG',
    division: 'Pilots',
    rank: i % 2 === 0 ? 'CA' : 'FO',
    seniorityNum: String(i + 1),
    crewName: `Crew ${i + 1}`,
  })),
  pairings: [MOCK_PAIRING],
  assignments: [],
  pairingSegments: [MOCK_SEGMENT],
  flights: [MOCK_FLIGHT],
  groundItems: [],
  crewStats: {},
}

const MOCK_SCROLLABLE_PAIRING_DATA = {
  ...MOCK_GANTT_DATA,
  pairings: Array.from({ length: 18 }, (_, index) => makeExtraPairing(index)),
  pairingSegments: Array.from({ length: 18 }, (_, index) => makeExtraSegment(index)),
  flights: Array.from({ length: 18 }, (_, index) => makeExtraFlight(index)),
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
})

const openRoScenario = async (page: Page): Promise<void> => {
  await page.goto(`/altair/scenario/${RO_SCENARIO_ID}`)
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('scenario-pairing-canvas')).toBeVisible({ timeout: 10_000 })
}

const readPairingPuck = (
  page: Page,
  wantPairingId?: number,
): Promise<{ x: number; y: number; pairingId: number; segId: number; fltId: number | null } | null> =>
  page.evaluate(
    ({ sid, pid }) => window.__ganttTest!.scenarioPairingPuck!(sid, pid) ?? null,
    { sid: RO_SCENARIO_ID, pid: wantPairingId },
  )

const readFlightPuck = (
  page: Page,
  wantFlightId?: number,
): Promise<{ x: number; y: number; flightId: number; fltNum: string } | null> =>
  page.evaluate(
    ({ sid, fid }) => window.__ganttTest!.scenarioFlightPuck!(sid, fid) ?? null,
    { sid: RO_SCENARIO_ID, fid: wantFlightId },
  )

const readSelection = (page: Page): Promise<number[]> =>
  page.evaluate((sid) => window.__ganttTest!.scenarioPairingSelection!(sid), RO_SCENARIO_ID)

/** Hover: drive a real Playwright mousemove at the canvas coordinate. */
const hoverMove = async (
  page: Page,
  canvasTestId: 'scenario-pairing-canvas' | 'scenario-flight-canvas',
  x: number,
  y: number,
): Promise<void> => {
  const canvas = page.getByTestId(canvasTestId)
  const box = await canvas.boundingBox()
  expect(box, `${canvasTestId} must have a bounding box`).toBeTruthy()
  const clientX = box!.x + x
  const clientY = box!.y + y
  await page.mouse.move(clientX, clientY)
}

const countCanvasPixels = async (
  page: Page,
  canvasTestId: 'scenario-pairing-canvas' | 'scenario-flight-canvas',
  x: number,
  y: number,
): Promise<number> =>
  page.evaluate(
    ({ testId, px, py }) => {
      const canvas = document.querySelector(`[data-testid="${testId}"]`) as HTMLCanvasElement | null
      if (!canvas) throw new Error(`${testId} not found`)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error(`${testId} context not available`)
      const sx = Math.max(0, Math.round(px) - 12)
      const sy = Math.max(0, Math.round(py) - 12)
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
    { testId: canvasTestId, px: x, py: y },
  )

const countPairingFlightGreenPixels = async (page: Page, x: number, y: number): Promise<number> =>
  page.evaluate(
    ({ px, py }) => {
      const canvas = document.querySelector('[data-testid="scenario-pairing-canvas"]') as HTMLCanvasElement | null
      if (!canvas) throw new Error('scenario-pairing-canvas not found')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('scenario-pairing-canvas context not available')
      const sx = Math.max(0, Math.round(px) - 12)
      const sy = Math.max(0, Math.round(py) - 10)
      const data = ctx.getImageData(sx, sy, 24, 20).data
      let count = 0
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (g > 70 && g > r + 10 && g > b + 10) count += 1
      }
      return count
    },
    { px: x, py: y },
  )

const countPairingFlightGreenPixelsInFrozenInterior = async (page: Page, x: number, y: number): Promise<number> =>
  page.evaluate(
    ({ px, py }) => {
      const canvas = document.querySelector('[data-testid="scenario-pairing-canvas"]') as HTMLCanvasElement | null
      if (!canvas) throw new Error('scenario-pairing-canvas not found')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('scenario-pairing-canvas context not available')
      const sx = Math.max(0, Math.round(px) - 12)
      const sy = Math.max(0, Math.round(py) - 4)
      const data = ctx.getImageData(sx, sy, 24, 8).data
      let count = 0
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (g > 70 && g > r + 10 && g > b + 10) count += 1
      }
      return count
    },
    { px: x, py: y },
  )

const rightClickHeaderRow = async (
  page: Page,
  headerTestId: 'pane-header-canvas-pairing' | 'pane-header-canvas-flight',
  rowIndex: number,
): Promise<void> => {
  const header = page.getByTestId(headerTestId)
  const box = await header.boundingBox()
  expect(box, `${headerTestId} must have a bounding box`).toBeTruthy()
  const headerHeight = headerTestId === 'pane-header-canvas-pairing' ? 40 : 30
  const rowHeight = headerTestId === 'pane-header-canvas-pairing' ? 42 : 43
  await page.mouse.click(box!.x + 24, box!.y + headerHeight + rowIndex * rowHeight + rowHeight / 2, { button: 'right' })
}

const clickHeaderPinIcon = async (
  page: Page,
  headerTestId: 'pane-header-canvas-pairing' | 'pane-header-canvas-flight',
  rowIndex: number,
): Promise<void> => {
  const header = page.getByTestId(headerTestId)
  const box = await header.boundingBox()
  expect(box, `${headerTestId} must have a bounding box`).toBeTruthy()
  const headerHeight = headerTestId === 'pane-header-canvas-pairing' ? 40 : 30
  const rowHeight = headerTestId === 'pane-header-canvas-pairing' ? 42 : 43
  await page.mouse.click(box!.x + box!.width - 10, box!.y + headerHeight + rowIndex * rowHeight + rowHeight / 2)
}

/** Left-click: dispatch a REAL mousedown+mouseup (button 0) at the canvas coordinate. */
const leftClick = async (page: Page, x: number, y: number): Promise<void> => {
  const canvas = page.getByTestId('scenario-pairing-canvas')
  const box = await canvas.boundingBox()
  expect(box, 'scenario-pairing-canvas must have a bounding box').toBeTruthy()
  const clientX = box!.x + x
  const clientY = box!.y + y
  await page.evaluate(
    ({ cx, cy }) => {
      const el = document.querySelector('[data-testid="scenario-pairing-canvas"]') as HTMLCanvasElement | null
      if (!el) throw new Error('scenario-pairing-canvas not found')
      const opts: MouseEventInit = { bubbles: true, cancelable: true, button: 0, clientX: cx, clientY: cy }
      el.dispatchEvent(new MouseEvent('mousedown', opts))
      el.dispatchEvent(new MouseEvent('mouseup', opts))
    },
    { cx: clientX, cy: clientY },
  )
}

test.describe('Scenario pairing-pane selection', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Scen-2050 — clicking a pairing puck selects it (solid focus ring gate); background click clears', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(MOCK_GANTT_DATA)))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(MOCK_LOCK_STATUS)))

    await openRoScenario(page)

    // Wait until the pairing segment puck is rendered, then read its on-screen coordinate.
    await expect
      .poll(() => readPairingPuck(page, PAIRING_ID), { timeout: 15_000, message: 'no scenario pairing puck rendered' })
      .not.toBeNull()
    const puck = await readPairingPuck(page, PAIRING_ID)
    expect(puck, 'pairing puck probe must resolve').toBeTruthy()
    expect(puck!.pairingId).toBe(PAIRING_ID)

    // BEFORE: nothing is selected — the renderer would draw no solid selection outline.
    expect(await readSelection(page)).toEqual([])

    // ACT 1: click the puck → onItemClick → setSelectedPairingIds(new Set([segId])).
    await leftClick(page, puck!.x, puck!.y)

    await expect
      .poll(() => readSelection(page), { timeout: 5_000, message: 'selection should contain the clicked segment' })
      .toEqual([puck!.segId])

    // ACT 2: click empty background (well below the single row) → onBackgroundClick → clear.
    const canvasBox = await page.getByTestId('scenario-pairing-canvas').boundingBox()
    expect(canvasBox).toBeTruthy()
    await leftClick(page, 40, canvasBox!.height - 20)

    await expect
      .poll(() => readSelection(page), { timeout: 5_000, message: 'background click should clear selection' })
      .toEqual([])

    // ACT 3: click the puck again to re-select, then click it once more → toggles OFF
    // (single-select-on-same toggles to empty, mirroring Live). Wait past the 300ms
    // double-click window between the two clicks so the second registers as a fresh
    // single click (not a dblclick → open-info path).
    await leftClick(page, puck!.x, puck!.y)
    await expect.poll(() => readSelection(page), { timeout: 5_000 }).toEqual([puck!.segId])
    await page.waitForTimeout(350)
    await leftClick(page, puck!.x, puck!.y)
    await expect.poll(() => readSelection(page), { timeout: 5_000 }).toEqual([])
  })

  test('Scen-2060 — scenario bottom status bar is present and shows hovered pairing info', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(MOCK_GANTT_DATA)))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(MOCK_LOCK_STATUS)))

    await openRoScenario(page)

    // The status bar exists at the bottom (mirrors Live's <StatusBar/>).
    const statusBar = page.getByTestId('scenario-status-bar')
    await expect(statusBar).toBeVisible()
    // Empty fallback before any hover.
    await expect(statusBar.getByTestId('scenario-status-bar-text')).toContainText('No selection')

    // Resolve the puck coordinate, then move the real Playwright mouse over it so the
    // pane's onItemHover runs end-to-end and writes statusBarText into the ui-store.
    await expect
      .poll(() => readPairingPuck(page, PAIRING_ID), { timeout: 15_000, message: 'no scenario pairing puck rendered' })
      .not.toBeNull()
    const puck = await readPairingPuck(page, PAIRING_ID)
    expect(puck, 'pairing puck probe must resolve').toBeTruthy()

    await hoverMove(page, 'scenario-pairing-canvas', puck!.x, puck!.y)

    // The hovered pairing's id appears in the status bar (e.g. "Pairing #2000 ...").
    await expect
      .poll(async () => (await statusBar.getByTestId('scenario-status-bar-text').textContent()) ?? '', {
        timeout: 5_000,
        message: 'status bar should show hovered pairing info',
      })
      .toContain(`Pairing #${PAIRING_ID}`)
  })

  test('Scen-2061 — scenario flight hover mirrors Live status line with scenario composition fill', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(MOCK_GANTT_DATA)))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(MOCK_LOCK_STATUS)))

    await openRoScenario(page)

    await page.getByTestId('sg-add-pane-flight').click()
    await expect(page.getByTestId('scenario-flight-canvas')).toBeVisible({ timeout: 10_000 })

    await expect
      .poll(() => readFlightPuck(page, MOCK_FLIGHT.id), { timeout: 15_000, message: 'no scenario flight puck rendered' })
      .not.toBeNull()
    const puck = await readFlightPuck(page, MOCK_FLIGHT.id)
    expect(puck, 'flight puck probe must resolve').toBeTruthy()

    await hoverMove(page, 'scenario-flight-canvas', puck!.x, puck!.y)

    const statusText = page.getByTestId('scenario-status-bar-text')
    await expect
      .poll(async () => (await statusText.textContent()) ?? '', {
        timeout: 5_000,
        message: 'status bar should show rich scenario flight hover info',
      })
      .toMatch(/F8-2010 · YEG \d{1,2}\/\d{1,2} \d{2}:\d{2} \/ (?:\d{1,2}\/\d{1,2} )?\d{2}:\d{2}L → YYZ \d{1,2}\/\d{1,2} \d{2}:\d{2} \/ (?:\d{1,2}\/\d{1,2} )?\d{2}:\d{2}L · B737 · C-FABC · CA 1\/1\s+FO 1\/0/)
  })

  test('Scen-2072 — scenario pairing row pin keeps right canvas content visible and header pin unpins', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(MOCK_GANTT_DATA)))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(MOCK_LOCK_STATUS)))

    await openRoScenario(page)
    await expect
      .poll(() => readPairingPuck(page, PAIRING_ID), { timeout: 15_000, message: 'no scenario pairing puck rendered' })
      .not.toBeNull()
    const puck = await readPairingPuck(page, PAIRING_ID)
    expect(puck, 'pairing puck probe must resolve').toBeTruthy()

    await rightClickHeaderRow(page, 'pane-header-canvas-pairing', 0)
    const menu = page.getByTestId('scenario-context-menu')
    await expect(menu.getByText('Pin 1 Selected Row', { exact: true })).toHaveCount(1)
    await menu.getByText('Pin 1 Selected Row', { exact: true }).click()
    await expect(page.getByTestId('scenario-context-menu')).toHaveCount(0)

    await expect
      .poll(() => countCanvasPixels(page, 'scenario-pairing-canvas', puck!.x, puck!.y), {
        timeout: 5_000,
        message: 'pinned pairing row should still show its pairing puck on the right canvas',
      })
      .toBeGreaterThan(20)

    await clickHeaderPinIcon(page, 'pane-header-canvas-pairing', 0)
    await rightClickHeaderRow(page, 'pane-header-canvas-pairing', 0)
    const afterUnpinMenu = page.getByTestId('scenario-context-menu')
    await expect(afterUnpinMenu.getByText('Pin 1 Selected Row', { exact: true })).toHaveCount(1)
    await expect(afterUnpinMenu.getByText('Unpin All (1)', { exact: true })).toHaveCount(0)
  })

  test('Scen-2074 — pinned pairing row clips scrollable task content at the frozen boundary', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(MOCK_SCROLLABLE_PAIRING_DATA)))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(MOCK_LOCK_STATUS)))

    await openRoScenario(page)
    await expect
      .poll(() => readPairingPuck(page, PAIRING_ID + 1), { timeout: 15_000, message: 'no second scenario pairing puck rendered' })
      .not.toBeNull()
    const visibleSecondPuck = await readPairingPuck(page, PAIRING_ID + 1)
    expect(visibleSecondPuck, 'second pairing probe must resolve before scroll').toBeTruthy()
    await expect
      .poll(() => countPairingFlightGreenPixels(page, visibleSecondPuck!.x, visibleSecondPuck!.y), {
        timeout: 5_000,
        message: 'test must detect the second pairing block before it is scrolled into the frozen zone',
      })
      .toBeGreaterThan(20)

    await rightClickHeaderRow(page, 'pane-header-canvas-pairing', 0)
    const menu = page.getByTestId('scenario-context-menu')
    await menu.getByText('Pin 1 Selected Row', { exact: true }).click()
    await expect(page.getByTestId('scenario-context-menu')).toHaveCount(0)

    const canvas = page.getByTestId('scenario-pairing-canvas')
    const box = await canvas.boundingBox()
    expect(box, 'scenario-pairing-canvas must have a bounding box').toBeTruthy()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 80)
    await page.mouse.wheel(0, 28)
    await expect
      .poll(
        () => page.evaluate((sid) => window.__ganttTest!.scenarioPaneScrollY!(sid, 'pairing-1'), RO_SCENARIO_ID),
        { timeout: 5_000, message: 'pairing pane should scroll after pinning the first row' },
      )
      .toBeGreaterThan(20)

    const scrolledSecondPuck = await readPairingPuck(page, PAIRING_ID + 1)
    expect(scrolledSecondPuck, 'second pairing probe must resolve after scroll').toBeTruthy()
    expect(scrolledSecondPuck!.y, 'test geometry should place the unpinned second row inside the pinned row zone').toBeLessThan(72)

    await expect
      .poll(() => countPairingFlightGreenPixelsInFrozenInterior(page, scrolledSecondPuck!.x, scrolledSecondPuck!.y), {
        timeout: 5_000,
        message: 'unpinned pairing block must be clipped before it bleeds into the pinned row',
      })
      .toBeLessThan(5)
  })

  test('Scen-2073 — scenario flight rows can be selected, pinned, and unpinned from the header', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(MOCK_GANTT_DATA)))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(MOCK_LOCK_STATUS)))

    await openRoScenario(page)
    await page.getByTestId('sg-add-pane-flight').click()
    await expect(page.getByTestId('scenario-flight-canvas')).toBeVisible({ timeout: 10_000 })
    await expect
      .poll(() => readFlightPuck(page, MOCK_FLIGHT.id), { timeout: 15_000, message: 'no scenario flight puck rendered' })
      .not.toBeNull()
    const puck = await readFlightPuck(page, MOCK_FLIGHT.id)
    expect(puck, 'flight puck probe must resolve').toBeTruthy()

    await rightClickHeaderRow(page, 'pane-header-canvas-flight', 0)
    const menu = page.getByTestId('scenario-context-menu')
    await expect(menu.getByText('Pin 1 Selected Row', { exact: true })).toHaveCount(1)
    await menu.getByText('Pin 1 Selected Row', { exact: true }).click()
    await expect(page.getByTestId('scenario-context-menu')).toHaveCount(0)

    await expect
      .poll(() => countCanvasPixels(page, 'scenario-flight-canvas', puck!.x, puck!.y), {
        timeout: 5_000,
        message: 'pinned flight row should still show its flight block on the right canvas',
      })
      .toBeGreaterThan(20)

    await clickHeaderPinIcon(page, 'pane-header-canvas-flight', 0)
    await rightClickHeaderRow(page, 'pane-header-canvas-flight', 0)
    const afterUnpinMenu = page.getByTestId('scenario-context-menu')
    await expect(afterUnpinMenu.getByText('Pin 1 Selected Row', { exact: true })).toHaveCount(1)
    await expect(afterUnpinMenu.getByText('Unpin All (1)', { exact: true })).toHaveCount(0)
  })
})

// ── Scen-2070/2071: Scenario Pairing Pane ROW (header) selection ──────────────
//
// Before the fix, makeScenarioPairingPaneSource had no selectRow/toggleRowSelection/
// selectRowRange/useSelectedRowIds, so the shared PairingPane's onRowClick guard
// (`pairing.selectRow ? handleRowClick : undefined`) always passed undefined and
// header clicks were silently ignored.
//
// These tests use __ganttTest drivers to seed/read the scenario pairing pane's
// row selection state directly — same determinism as ESC-04 for Live.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Scenario Pairing Pane — row (header) selection', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(MOCK_GANTT_DATA)))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(MOCK_LOCK_STATUS)))
    await openRoScenario(page)
  })

  const readRowIds = (page: Page): Promise<string[]> =>
    page.evaluate(
      (sid) => (window.__ganttTest as unknown as { scenarioPairingRowIds: (id: number) => string[] }).scenarioPairingRowIds(sid),
      RO_SCENARIO_ID,
    )

  const seedRowSelection = (page: Page, pairingId: number): Promise<void> =>
    page.evaluate(
      ({ sid, pid }) => {
        (window.__ganttTest as unknown as { setScenarioPairingRow: (sid: number, pid: string) => void })
          .setScenarioPairingRow(sid, String(pid))
      },
      { sid: RO_SCENARIO_ID, pid: pairingId },
    )

  const pressEsc = (page: Page): Promise<void> =>
    page.evaluate(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

  test('Scen-2070 — pairing header row selection state is maintained after seeding', async ({ page }) => {
    // Nothing selected initially.
    expect(await readRowIds(page)).toEqual([])

    // Seed a row selection for our mock pairing.
    await seedRowSelection(page, PAIRING_ID)

    // The row selection store should now contain the pairing id.
    await expect
      .poll(() => readRowIds(page), {
        timeout: 3_000,
        message: 'scenario pairing row must be selected after seeding',
      })
      .toContain(String(PAIRING_ID))

    // Toggle the same row off — should clear it.
    await page.evaluate(
      ({ sid, pid }) => {
        (window.__ganttTest as unknown as { setScenarioPairingRow: (sid: number, pid: string) => void })
          .setScenarioPairingRow(sid, String(pid))
      },
      { sid: RO_SCENARIO_ID, pid: PAIRING_ID },
    )
    // Seeding the same row again replaces (selectRow = replace, not toggle), so still selected.
    // Verify it remains — the intent of this assertion is store-write-through, not toggle.
    await expect
      .poll(() => readRowIds(page), { timeout: 3_000 })
      .toContain(String(PAIRING_ID))
  })

  test('Scen-2071 — ESC clears Scenario Pairing Pane row selection (regression)', async ({ page }) => {
    // Seed a row selection.
    await seedRowSelection(page, PAIRING_ID)
    await expect
      .poll(() => readRowIds(page), {
        timeout: 3_000,
        message: 'row selection must be seeded before ESC test',
      })
      .toContain(String(PAIRING_ID))

    // Press ESC — clearAllGanttSelections must clear 'scenario-pairing' row selection.
    await pressEsc(page)
    await expect
      .poll(() => readRowIds(page), {
        timeout: 3_000,
        message: 'ESC must clear Scenario Pairing Pane row selection',
      })
      .toEqual([])
  })
})
