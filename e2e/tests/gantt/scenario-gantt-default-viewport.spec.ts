import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedScenarioListMocks } from '../../utils/gantt-hook'

const SCENARIO_ID = 544
const SCENARIO_NAME = 'RO-2026-06 YYC FD Buffered Viewport'

const ok = (data: unknown): string => JSON.stringify({ code: 200, data, message: 'ok' })

const MOCK_GANTT_DATA = {
  scenarioId: SCENARIO_ID,
  scenarioName: SCENARIO_NAME,
  fileType: 'RO',
  rulesetId: 103,
  capabilities: { panes: ['roster', 'pairing', 'flight'], defaultPanes: ['roster', 'pairing'], editable: true },
  strDtLoc: '2026-05-25T00:00:00.000Z',
  endDtLoc: '2026-07-07T23:59:59.999Z',
  scenarioStrDt: '2026-06-01T00:00:00',
  scenarioEndDt: '2026-06-30T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot',
  crew: [{
    crewId: 'C0001',
    base: 'YYC',
    division: 'Pilots',
    rank: 'CA',
    seniorityNum: '1',
    crewName: 'Crew 1',
  }],
  pairings: [],
  assignments: [],
  pairingSegments: [],
  flights: [],
  groundItems: [],
  crewStats: {},
}

async function openMockedScenario(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({
        user: { userCode: 'admin', userName: 'Admin User', schema: 'f8', isAdmin: 1 },
        token: 'test-token',
      }),
    )
  })

  await seedScenarioListMocks(page, SCENARIO_ID, SCENARIO_NAME)

  await page.route('**/altair/live/api/roster-periods', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: ok({
        maxPeriods: 5,
        items: [
          { id: 6, rosterPeriod: '2026RP06', name: '2026-06', rpStart: '2026-06-01', rpEnd: '2026-06-30', isCurrent: false },
          { id: 7, rosterPeriod: '2026RP07', name: '2026-07', rpStart: '2026-07-01', rpEnd: '2026-07-31', isCurrent: true },
          { id: 8, rosterPeriod: '2026RP08', name: '2026-08', rpStart: '2026-08-01', rpEnd: '2026-08-31', isCurrent: false },
        ],
      }),
    }),
  )

  await page.route('**/api/legality/ruleset/103', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: ok({ workset: { id: 103, name: 'PBS Solver Ruleset', category: null }, rules: [] }),
    }),
  )

  await page.route(`**/api/scenario/${SCENARIO_ID}/gantt-data`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: ok(MOCK_GANTT_DATA) }),
  )
  await page.route(`**/api/scenario/${SCENARIO_ID}/lock-status`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: ok({ locked: false, owner: null, ttl: null, isOwner: false }),
    }),
  )
  await page.route(`**/api/scenario/${SCENARIO_ID}/legality`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: ok({ status: 'OK', violations: [], summary: { total: 0 } }),
    }),
  )

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  await page.getByPlaceholder('Search scenarios…').fill(SCENARIO_NAME)
  const row = page.getByTestId('scenario-list-item').filter({ hasText: SCENARIO_NAME })
  await expect(row).toBeVisible({ timeout: 10_000 })
  await row.click()
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()

  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })
}

const scenarioVisibleRange = async (page: Page): Promise<{ startDate: string; endDate: string; startIso: string; endIso: string }> =>
  page.evaluate((scenarioId) => {
    const zoom = window.__ganttTest!.scenarioZoom!(scenarioId)
    const range = window.__ganttTest!.scenarioRange!(scenarioId)
    const viewportWidth = zoom.viewportWidth || (document.querySelector('[data-testid="sg-time-axis"]') as HTMLElement | null)?.clientWidth || 1
    const startMs = Date.parse(range.start) + (zoom.scrollX / zoom.pxPerHour) * 3_600_000
    const endMs = startMs + (viewportWidth / zoom.pxPerHour) * 3_600_000
    const start = new Date(startMs)
    const end = new Date(endMs)
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    }
  }, SCENARIO_ID)

test('Scen-5441 — scenario opens with definition window plus seven lead-in and lead-out days', async ({ page }) => {
  await openMockedScenario(page)

  await expect(page.getByTestId('sg-rule-group-display')).toContainText('PBS Solver Ruleset')

  const viewport = await page.evaluate((scenarioId) => {
    const zoom = window.__ganttTest!.scenarioZoom!(scenarioId)
    const range = window.__ganttTest!.scenarioRange!(scenarioId)
    const axis = document.querySelector('[data-testid="sg-time-axis"]') as HTMLElement | null
    if (!axis) throw new Error('sg-time-axis not found')
    const viewportWidth = axis.clientWidth
    const rangeStartMs = Date.parse('2026-05-25T00:00:00.000Z')
    const visibleHours = viewportWidth / zoom.pxPerHour
    const start = new Date(rangeStartMs + (zoom.scrollX / zoom.pxPerHour) * 3_600_000)
    const end = new Date(start.getTime() + visibleHours * 3_600_000)
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      visibleDays: visibleHours / 24,
      rangeStart: range.start,
      rangeEnd: range.end,
    }
  }, SCENARIO_ID)

  expect(viewport.rangeStart).toBe('2026-05-25T00:00:00.000Z')
  expect(viewport.rangeEnd).toBe('2026-07-07T23:59:59.999Z')
  expect(viewport.startDate).toBe('2026-06-01')
  expect(viewport.endDate).toBe('2026-07-01')
  expect(viewport.visibleDays).toBeGreaterThan(29.5)
  expect(viewport.visibleDays).toBeLessThan(30.5)
})

test('Scen-5442 — timeline uses a faint alternate background for the next RP', async ({ page }) => {
  await openMockedScenario(page)

  const axis = page.getByTestId('sg-pane-toolbar-roster-1').getByTestId('sg-time-axis')
  await expect(axis).toBeVisible()
  const axisBox = await axis.boundingBox()
  expect(axisBox, 'Scenario time axis has a bounding box').not.toBeNull()
  await axis.click({ button: 'right', position: { x: axisBox!.width / 2, y: axisBox!.height / 2 } })
  const menu = page.getByRole('menu', { name: 'GO TO RPDate' })
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem').filter({ hasText: '2026RP07' }).click()
  await expect(menu).toBeHidden()

  const samples = await page.evaluate((scenarioId) => {
    const zoom = window.__ganttTest!.scenarioZoom!(scenarioId)
    const range = window.__ganttTest!.scenarioRange!(scenarioId)
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="scenario-roster-canvas"]')
    if (!canvas) throw new Error('scenario-roster-canvas not found')

    const rect = canvas.getBoundingClientRect()
    const rangeStartMs = Date.parse(range.start)
    const toCanvasPoint = (iso: string) => {
      const cssX = ((Date.parse(iso) - rangeStartMs) / 3_600_000) * zoom.pxPerHour - zoom.scrollX
      const cssY = 60
      return {
        x: Math.round(cssX * canvas.width / rect.width),
        y: Math.round(cssY * canvas.height / rect.height),
      }
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('scenario-roster-canvas context not found')
    const read = (iso: string) => {
      const point = toCanvasPoint(iso)
      if (point.x < 0 || point.x >= canvas.width || point.y < 0 || point.y >= canvas.height) {
        throw new Error(`sample point is outside canvas: ${JSON.stringify(point)}`)
      }
      return Array.from(ctx.getImageData(point.x, point.y, 1, 1).data)
    }

    return {
      july: read('2026-07-02T12:00:00.000Z'),
    }
  }, SCENARIO_ID)

  expect(samples.july[3]).toBeGreaterThan(0)
  expect(samples.july.slice(0, 3), 'RP07 should have a faint tinted background').not.toEqual([255, 255, 255])
})

test('Scen-2442 — Scenario GO TO RPDate anchors RP07 and scrollbar survives timeline drag zoom', async ({ page }) => {
  await openMockedScenario(page)

  const axis = page.getByTestId('sg-pane-toolbar-roster-1').getByTestId('sg-time-axis')
  await expect(axis).toBeVisible()
  const axisBox = await axis.boundingBox()
  expect(axisBox, 'Scenario time axis has a bounding box').not.toBeNull()

  await axis.click({ button: 'right', position: { x: axisBox!.width / 2, y: axisBox!.height / 2 } })
  const menu = page.getByRole('menu', { name: 'GO TO RPDate' })
  await expect(menu).toBeVisible({ timeout: 10_000 })
  await menu.getByRole('menuitem').filter({ hasText: '2026RP07' }).click()
  await expect(menu).toBeHidden()

  const rp07Visible = await scenarioVisibleRange(page)
  expect(rp07Visible.startIso, 'RP07 opens at the RP start, not the padded lead-in range').toBe('2026-07-01T00:00:00.000Z')
  expect(rp07Visible.endDate, 'RP07 viewport is clipped to the loaded scenario intersection').toBe('2026-07-07')

  const beforeZoom = await page.evaluate((scenarioId) => window.__ganttTest!.scenarioZoom!(scenarioId), SCENARIO_ID)
  const scrollbar = page.getByTestId('scenario-horizontal-scrollbar')
  const thumb = page.getByTestId('scenario-horizontal-scrollbar-thumb')
  await expect(scrollbar).toBeVisible()
  await expect(thumb).toBeVisible()

  await page.mouse.move(axisBox!.x + axisBox!.width * 0.25, axisBox!.y + axisBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(axisBox!.x + axisBox!.width * 0.65, axisBox!.y + axisBox!.height / 2, { steps: 5 })
  await page.mouse.up()

  const afterZoom = await page.evaluate((scenarioId) => window.__ganttTest!.scenarioZoom!(scenarioId), SCENARIO_ID)
  expect(afterZoom.pxPerHour).toBeGreaterThan(beforeZoom.pxPerHour)
  expect(afterZoom.scrollWindowEndX, 'manual timeline zoom clears stale RP pixel bounds').toBeNull()

  const trackBox = await scrollbar.boundingBox()
  const thumbBox = await thumb.boundingBox()
  expect(trackBox, 'Scenario scrollbar track has a bounding box').not.toBeNull()
  expect(thumbBox, 'Scenario scrollbar thumb has a bounding box').not.toBeNull()
  expect(thumbBox!.width, 'Scenario scrollbar thumb remains draggable after timeline zoom').toBeLessThan(trackBox!.width)

  const beforeDrag = afterZoom.scrollX
  await page.mouse.move(thumbBox!.x + thumbBox!.width / 2, thumbBox!.y + thumbBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    thumbBox!.x + thumbBox!.width / 2 + Math.min(120, trackBox!.width / 4),
    thumbBox!.y + thumbBox!.height / 2,
    { steps: 5 },
  )
  await page.mouse.up()

  await expect.poll(async () => {
    const zoom = await page.evaluate((scenarioId) => window.__ganttTest!.scenarioZoom!(scenarioId), SCENARIO_ID)
    return zoom.scrollX
  }, {
    message: 'Scenario horizontal scrollbar drag updates scrollX after manual timeline zoom',
    timeout: 5_000,
  }).not.toBe(beforeDrag)
})
