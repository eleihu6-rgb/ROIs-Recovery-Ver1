import { test, expect, type APIRequestContext, type Locator } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

/**
 * Find Pairing by Flight + Find Crew by Flight menu wiring
 * (spec 2026-06-11-find-by-flight). Driven from the Flight pane — the reliably
 * clickable canvas surface in this dataset.
 *
 *  - Find Pairing by Flight (NEW): floats the pairing(s) that USE the flight
 *    (pairing_segment.flt_id) to the TOP of the Pairing pane, force-loading any
 *    hidden from the pane and toasting when it does.
 *  - The flight-pane context menu offers both Find Crew by Flight and Find Pairing
 *    by Flight.
 *
 * The findCrewToTop / findPairingsByFlight toast gates themselves are pinned by the
 * deterministic unit tests gantt/src/utils/__tests__/find-crew.test.ts and
 * find-pairings-by-flight.test.ts.
 */

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'

interface FlightProbe {
  id: number
  schDepDtUtc: string
  rowIndex: number
  rowCenterY: number
  scrollX: number
  pxPerHour: number
  rangeStartIso: string
}

type PairingOrderRow = { id: string; label: string }

/** Pairing ids that use a flight (segment-based), straight from the new endpoint. */
const pairingsForFlight = async (
  request: APIRequestContext,
  token: string,
  fltId: number,
): Promise<number[]> => {
  const res = await request.get(`${GANTT_API}/api/flight/${fltId}/pairings`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `flight pairings endpoint ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { data: { pairingIds: number[] } }).data.pairingIds
}

/** Canvas click point for a probed flight bar (mirrors flightProbe geometry). */
const flightClickXY = (probe: FlightProbe): { x: number; y: number } => {
  const iso = probe.schDepDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  const rangeStartMs = Date.parse(probe.rangeStartIso)
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe.pxPerHour - probe.scrollX
  return { x: x + 6, y: probe.rowCenterY }
}

const rightClickAt = async (canvas: Locator, x: number, y: number): Promise<void> => {
  const box = await canvas.boundingBox()
  test.skip(!box || x < 0 || x > box.width - 4 || y < 0 || y > box.height - 4,
    'probed target is outside the visible canvas')
  await canvas.click({ position: { x, y }, button: 'right' })
}

test.describe('Find by Flight', () => {
  let dashboard: GanttDashboardPage
  let token: string

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    token = await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).pairing, {
      message: 'pairing objects loaded', timeout: 30_000,
    }).toBeGreaterThan(0)
    await dashboard.addFlightPane()
  })

  test('Live-1054 — Find Pairing by Flight floats the flight\'s pairing(s) to the top of the Pairing pane', async ({ page, request }) => {
    const probe = await readHook<FlightProbe | null>(page, 'flightProbe')
    expect(probe, 'a visible flight bar exists').not.toBeNull()

    const expected = await pairingsForFlight(request, token, probe!.id)
    test.skip(expected.length === 0, 'probed flight bar is not used by any pairing')

    const { x, y } = flightClickXY(probe!)
    await rightClickAt(dashboard.flightCanvas, x, y)

    const action = page.getByRole('button', { name: 'Find Pairing by Flight' })
    await expect(action).toBeVisible({ timeout: 5_000 })
    await action.click()

    // Every pairing using the flight occupies the top rows of the pane, as a set.
    const expectedSet = JSON.stringify([...expected].map(String).sort())
    await expect.poll(async () => {
      const order = await readHook<PairingOrderRow[]>(page, 'pairingPanelOrder')
      return JSON.stringify(order.slice(0, expected.length).map((r) => r.id).sort())
    }, { message: 'flight pairing(s) floated to the top', timeout: 10_000 }).toBe(expectedSet)
  })

  test('Live-1055 — flight-pane context menu offers both Find Crew by Flight and Find Pairing by Flight', async ({ page }) => {
    const probe = await readHook<FlightProbe | null>(page, 'flightProbe')
    expect(probe, 'a visible flight bar exists').not.toBeNull()

    const { x, y } = flightClickXY(probe!)
    await rightClickAt(dashboard.flightCanvas, x, y)

    await expect(page.getByRole('button', { name: 'Find Crew by Flight' })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: 'Find Pairing by Flight' })).toBeVisible()
  })

  test('Live-1056 — Find Pairing by Flight loads a pairing hidden from the pane and toasts (off-screen path)', async ({ page, request }) => {
    const probe = await readHook<FlightProbe | null>(page, 'flightProbe')
    expect(probe, 'a visible flight bar exists').not.toBeNull()

    const expected = await pairingsForFlight(request, token, probe!.id)
    test.skip(expected.length === 0, 'probed flight bar is not used by any pairing')

    // Force the off-screen/filtered path: empty the pairing pane so the find must
    // getDetail-load the pairing(s) back in.
    await page.evaluate(() => (window.__ganttTest as unknown as { clearPairingItems: () => void }).clearPairingItems())

    const { x, y } = flightClickXY(probe!)
    await rightClickAt(dashboard.flightCanvas, x, y)
    const action = page.getByRole('button', { name: 'Find Pairing by Flight' })
    await expect(action).toBeVisible({ timeout: 5_000 })
    await action.click()

    // The hidden pairing is loaded back in and floated to the top.
    const expectedSet = JSON.stringify([...expected].map(String).sort())
    await expect.poll(async () => {
      const order = await readHook<PairingOrderRow[]>(page, 'pairingPanelOrder')
      return JSON.stringify(order.slice(0, expected.length).map((r) => r.id).sort())
    }, { message: 'hidden pairing loaded + floated to top', timeout: 10_000 }).toBe(expectedSet)

    // And the user is told the hidden pairing was brought in — either it was outside the
    // filter ("not in the current filter") or outside the date range ("Jumped the timeline").
    await expect(page.getByText(/(not in the current filter|Jumped the timeline)/i)).toBeVisible({ timeout: 5_000 })
  })

  test('Live-1057 — Find Pairing by Flight jumps the timeline when the pairing is outside the date range', async ({ page, request }) => {
    // Regression (reported 2026-06-11, flight #4146): its pairing T4132/1043 is dated
    // 2026-01-12 while the view is Jun–Jul, so floating it to the top row left its bars
    // off-screen ("not visible"). The fix extends the date range to include the pairing
    // and reloads, so its bars render. Driven through the test hook (the pairing-canvas
    // right-click is unreliable in this dataset; see find-crew.spec).
    const FLIGHT = 4146
    const pairingIds = await pairingsForFlight(request, token, FLIGHT)
    test.skip(pairingIds.length === 0, `flight ${FLIGHT} no longer has a pairing`)

    const detail = await request.get(`${GANTT_API}/api/pairing/${pairingIds[0]}`, { headers: { Authorization: `Bearer ${token}` } })
    const pairingStart = Date.parse((await detail.json()).data.schStrDtUtc)
    const rangeBefore = await readHook<{ start: string; end: string }>(page, 'dateRange')
    test.skip(pairingStart >= Date.parse(rangeBefore.start) && pairingStart <= Date.parse(rangeBefore.end),
      `pairing ${pairingIds[0]} is already within the current date range — no jump expected`)

    await page.evaluate((f) => (window.__ganttTest as unknown as { findPairingsByFlight: (x: number) => Promise<void> }).findPairingsByFlight(f), FLIGHT)

    // The date range extends to include the (out-of-range) pairing...
    await expect.poll(async () => {
      const r = await readHook<{ start: string; end: string }>(page, 'dateRange')
      return pairingStart >= Date.parse(r.start) && pairingStart <= Date.parse(r.end)
    }, { message: 'date range extended to include the pairing', timeout: 15_000 }).toBe(true)

    // ...the pairing is loaded, sits at the top row, and the user is told about the jump.
    await expect.poll(async () => {
      const loaded = await readHook<Array<{ id: number }>>(page, 'pairings')
      return loaded.some((p) => Number(p.id) === pairingIds[0])
    }, { message: 'out-of-range pairing loaded into the pane', timeout: 10_000 }).toBe(true)

    const order = await readHook<PairingOrderRow[]>(page, 'pairingPanelOrder')
    expect(order[0]?.id, 'pairing floated to the top row').toBe(String(pairingIds[0]))
    await expect(page.getByText(/Jumped the timeline/i)).toBeVisible({ timeout: 5_000 })
  })
})
