/**
 * Phase-1 pairing build — right-click a flight in the Live Flight pane to build a
 * rules-aware pairing, and right-click a pairing segment to remove a flight from it.
 *
 * Drives the REAL context menu (§Simulate-User) and proves outcomes from store truth
 * via window.__ganttTest (§No-Illusion), not pixel-reading:
 *  - Single EK A380 (DXB) flight → "Create Pairing (1 flight)" builds a pairing based at
 *    DXB, fleet A380, wide-body composition CA2/FO2, one duty covering that flight, floated
 *    to the top row of the Pairing pane.
 *  - Multi-selecting the EK001 (DXB→LHR) out + EK002 (LHR→DXB) back legs → "Create Pairing
 *    (2 flights)" builds a 2-duty overnight pairing (the LHR layover splits the duties).
 *  - Right-click a segment → "Remove flight from pairing" drops the flight (and deletes the
 *    pairing once its last flight is removed).
 *
 * Backend: POST /api/pairing/build, POST /api/pairing/:id/remove-flight
 * (live-server/src/services/pairing/pairing-build-service.ts).
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, ganttApiLogin, ganttApiUrl, counts, readHook } from '../../utils/gantt-hook'
import { readSegmentCells, SEG } from '../../utils/pairing-info'

interface FlightRow {
  id: number; fleet: string; fltNum: string | null; depArp: string | null; arvArp: string | null; start: string | null
}
interface PairingObj {
  id: number; base: string | null; fleet: string | null; division: string | null
  composition: Array<{ rank: string | null; plan: number; fill: number }>
  start: string | null; end: string | null
}
interface SegObj { segId: number; pairingId: number; segSeq: number; dutySeq: number; schStrDtUtc: string | null; briefStartUtc: string | null; fltId: number | null; fltNum: string | null; pairingCreditMin: number | null }
interface FlightProbe {
  id: number; schDepDtUtc: string; rowIndex: number; rowCenterY: number
  scrollX: number; pxPerHour: number; rangeStartIso: string
}
interface PairingProbe {
  segId: number; pairingId: number; fltId: number | null; schStrDtUtc: string; rowIndex: number
  scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number
}

const isoMs = (iso: string): number =>
  Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)

const setDateRange = (page: Page, startIso: string, endIso: string): Promise<void> =>
  page.evaluate(
    ({ s, e }) => (window.__ganttTest as unknown as { setDateRange: (a: string, b: string) => Promise<void> }).setDateRange(s, e),
    { s: startIso, e: endIso },
  )

const applyFlightFilter = (page: Page, filter: { depArps?: string[]; fleets?: string[] }): Promise<void> =>
  page.evaluate(
    (f) => (window.__ganttTest as unknown as { applyFlightFilter: (x: typeof f) => Promise<void> }).applyFlightFilter(f),
    filter,
  )

const flightProbe = (page: Page): Promise<FlightProbe | null> =>
  page.evaluate(() => (window.__ganttTest as unknown as { flightProbe: () => FlightProbe | null }).flightProbe())

const pairingVisibleSegments = (page: Page): Promise<PairingProbe[]> =>
  page.evaluate(() => (window.__ganttTest as unknown as { pairingVisibleSegments: (n?: number) => PairingProbe[] }).pairingVisibleSegments())

const setScrollX = (page: Page, x: number): Promise<void> =>
  page.evaluate((v) => (window.__ganttTest as unknown as { setScrollX: (n: number) => void }).setScrollX(v), x)

const paneScrollY = (page: Page, prefix: string): Promise<number> =>
  page.evaluate((p) => (window.__ganttTest as unknown as { paneScrollY: (x: string) => number }).paneScrollY(p), prefix)

const selectFlights = (page: Page, ids: number[]): Promise<void> =>
  page.evaluate((v) => (window.__ganttTest as unknown as { selectRosterTasks: (x: number[]) => void }).selectRosterTasks(v), ids)

const pairingsNow = (page: Page): Promise<PairingObj[]> => readHook<PairingObj[]>(page, 'pairings')
const segsNow = (page: Page): Promise<SegObj[]> => readHook<SegObj[]>(page, 'pairingSegments')
const panelOrder = (page: Page): Promise<Array<{ id: string }>> => readHook<Array<{ id: string }>>(page, 'pairingPanelOrder')

/** Right-click the visible flight puck the probe describes. */
const rightClickFlight = async (page: Page, canvas: Locator, p: FlightProbe): Promise<void> => {
  const x = (Math.trunc((isoMs(p.schDepDtUtc) - isoMs(p.rangeStartIso)) / 60_000) / 60) * p.pxPerHour - p.scrollX
  await canvas.click({ position: { x: x + 6, y: p.rowCenterY }, button: 'right' })
}

/** Right-click a pairing segment (top-of-pane row) the probe describes. */
const rightClickPairingSeg = async (page: Page, canvas: Locator, p: PairingProbe): Promise<boolean> => {
  const box = await canvas.boundingBox()
  if (!box) return false
  const x = (Math.trunc((isoMs(p.schStrDtUtc) - isoMs(p.rangeStartIso)) / 60_000) / 60) * p.pxPerHour - p.scrollX + 6
  const y = p.headerHeight + p.rowIndex * p.rowHeight - p.scrollY + Math.floor(p.rowHeight / 2)
  if (x < 0 || x > box.width - 4 || y < 0 || y > box.height - 4) return false
  await canvas.click({ position: { x, y }, button: 'right' })
  return true
}

/** Remove one flight from a pairing through the real right-click menu; returns when the store settled. */
const removeFlightViaMenu = async (page: Page, dashboard: GanttDashboardPage, pairingId: number, fltId: number): Promise<void> => {
  // Horizontally scroll the target segment onto the (narrow) pairing canvas: the pane's date
  // range is padded, so the built pairing's day sits far right at the default scroll.
  const seg = (await segsNow(page)).find((s) => s.pairingId === pairingId && s.fltId === fltId && s.schStrDtUtc)
  expect(seg, `pairing #${pairingId} seg for flt #${fltId} loaded with a start time`).toBeTruthy()
  // Any currently-visible segment gives us the exact pane geometry (pxPerHour + range start).
  const geomRef = (await pairingVisibleSegments(page))[0]
  expect(geomRef, 'a visible pairing segment to read pane geometry from').toBeTruthy()
  const contentX = ((isoMs(seg!.schStrDtUtc as string) - isoMs(geomRef.rangeStartIso)) / 3_600_000) * geomRef.pxPerHour
  // Poll (don't fixed-wait): a headed window paints slower and can be narrower, so re-apply the
  // scroll until the target puck actually reports visible in the pane geometry.
  await expect.poll(async () => {
    await setScrollX(page, Math.max(0, Math.round(contentX - 150)))
    return (await pairingVisibleSegments(page)).some((p) => p.pairingId === pairingId && p.fltId === fltId)
  }, { message: `pairing #${pairingId} seg for flt #${fltId} scrolled into the pane`, timeout: 8_000 }).toBe(true)

  // Removing a leg makes the pane recompute the pairing; during that gap the pane can briefly
  // drop it from its order list (renderRow -1) or repaint the row. So retry the whole hit-test —
  // re-scroll, re-derive the on-screen row (pairingVisibleSegments gives sort order, but a
  // freshly touched pairing floats to the top "found" tier, so the rendered pane order is the
  // true row), right-click — until the Remove menu actually appears.
  const remove = page.getByRole('button', { name: 'Remove flight from pairing', exact: true })
  await expect(async () => {
    await setScrollX(page, Math.max(0, Math.round(contentX - 150)))
    const probe = (await pairingVisibleSegments(page)).find((p) => p.pairingId === pairingId && p.fltId === fltId)
    expect(probe, `pairing #${pairingId} seg for flt #${fltId} has a right-clickable puck`).toBeTruthy()
    const renderRow = (await panelOrder(page)).findIndex((r) => r.id === String(pairingId))
    expect(renderRow, `pairing #${pairingId} present in the rendered pane order`).toBeGreaterThanOrEqual(0)
    const scrollY = await paneScrollY(page, 'pairing')
    const aimed: PairingProbe = { ...(probe as PairingProbe), rowIndex: renderRow, scrollY }
    expect(await rightClickPairingSeg(page, dashboard.pairingCanvas, aimed)).toBe(true)
    await expect(remove).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 12_000 })
  await remove.click()
}

/** Open the Pairing Info dialog through the real right-click "View pairing detail" menu. */
const openPairingInfoViaMenu = async (page: Page, dashboard: GanttDashboardPage, pairingId: number, fltId: number): Promise<Locator> => {
  const seg = (await segsNow(page)).find((s) => s.pairingId === pairingId && s.fltId === fltId && s.schStrDtUtc)
  expect(seg, `pairing #${pairingId} seg for flt #${fltId} loaded with a start time`).toBeTruthy()
  const geomRef = (await pairingVisibleSegments(page))[0]
  expect(geomRef, 'a visible pairing segment to read pane geometry from').toBeTruthy()
  const contentX = ((isoMs(seg!.schStrDtUtc as string) - isoMs(geomRef.rangeStartIso)) / 3_600_000) * geomRef.pxPerHour
  await expect.poll(async () => {
    await setScrollX(page, Math.max(0, Math.round(contentX - 150)))
    return (await pairingVisibleSegments(page)).some((p) => p.pairingId === pairingId && p.fltId === fltId)
  }, { message: `pairing #${pairingId} seg for flt #${fltId} scrolled into the pane`, timeout: 8_000 }).toBe(true)

  const probe = (await pairingVisibleSegments(page)).find((p) => p.pairingId === pairingId && p.fltId === fltId)
  expect(probe, `pairing #${pairingId} seg for flt #${fltId} has a right-clickable puck`).toBeTruthy()
  const renderRow = (await panelOrder(page)).findIndex((r) => r.id === String(pairingId))
  expect(renderRow, `pairing #${pairingId} present in the rendered pane order`).toBeGreaterThanOrEqual(0)
  const scrollY = await paneScrollY(page, 'pairing')
  const aimed: PairingProbe = { ...(probe as PairingProbe), rowIndex: renderRow, scrollY }
  expect(await rightClickPairingSeg(page, dashboard.pairingCanvas, aimed)).toBe(true)
  const view = page.getByRole('button', { name: 'View pairing detail', exact: true })
  await expect(view).toBeVisible({ timeout: 3_000 })
  await view.click()
  const dialog = page.getByTestId('pairing-info-dialog')
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  return dialog
}

/** Duration min → "H:MM" exactly as the Pairing Info dialog's fmtDur renders it (0/null → ''). */
const fmtDur = (min: number | null | undefined): string =>
  min == null || min <= 0 ? '' : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`

test.describe('Phase-1 pairing build (right-click create / remove)', () => {
  let dashboard: GanttDashboardPage
  // Pairings the test built; torn down via API so a mid-test failure never leaves an orphan
  // (which would then trip the "flight already in a pairing" guard on the next run).
  let createdPairingIds: number[] = []

  test.beforeEach(async ({ page, request }) => {
    createdPairingIds = []
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.addFlightPane()
    await expect
      .poll(async () => (await counts(page)).pairing, { message: 'pairing pane loaded', timeout: 30_000 })
      .toBeGreaterThanOrEqual(0)
  })

  test.afterEach(async ({ request }) => {
    if (createdPairingIds.length === 0) return
    const token = await ganttApiLogin(request)
    for (const id of createdPairingIds) {
      await request.post(`${ganttApiUrl}/api/pairing/${id}/delete`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {},
      }).catch(() => {})
    }
  })

  test('Live-1710 — right-click an EK A380 flight builds a DXB CA2/FO2 pairing, then Remove flight deletes it', async ({ page }) => {
    test.setTimeout(90_000)
    await setDateRange(page, '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z')
    // Constrain to A380 (EK-only in this data) so the first visible puck is deterministically
    // an EK A380 leg regardless of scroll/sort state left by earlier tests.
    await applyFlightFilter(page, { depArps: ['DXB'], fleets: ['A380'] })
    await expect.poll(async () => (await counts(page)).flightLegs, {
      message: 'EK A380 legs departing DXB on 1 Sep loaded', timeout: 20_000,
    }).toBeGreaterThan(0)

    const probe = await flightProbe(page)
    expect(probe, 'a visible EK A380 flight puck to right-click').toBeTruthy()
    const flightId = (probe as FlightProbe).id
    const flt = (await readHook<FlightRow[]>(page, 'flights')).find((f) => f.id === flightId)
    expect(flt?.fleet, `flight #${flightId} is EK A380`).toBe('A380')

    const before = new Set((await pairingsNow(page)).map((p) => p.id))

    await rightClickFlight(page, dashboard.flightCanvas, probe as FlightProbe)
    const create = page.getByRole('button', { name: 'Create Pairing (1 flight)', exact: true })
    await expect(create).toBeVisible({ timeout: 3_000 })
    await create.click()

    // The built pairing lands in the store, based at DXB, wide-body composition CA2/FO2.
    let built: PairingObj | undefined
    await expect.poll(async () => {
      built = (await pairingsNow(page)).find((p) => !before.has(p.id) && p.fleet === 'A380')
      return built?.id ?? null
    }, { message: 'new EK A380 pairing appears in the store', timeout: 15_000 }).not.toBeNull()
    createdPairingIds.push(built!.id)

    expect(built!.base, 'EK pairing is based at DXB').toBe('DXB')
    const ca = built!.composition.find((c) => c.rank === 'CA')
    const fo = built!.composition.find((c) => c.rank === 'FO')
    expect(ca?.plan, 'wide-body flight crew = 2 Captains').toBe(2)
    expect(fo?.plan, 'wide-body flight crew = 2 First Officers').toBe(2)

    // One single-flight duty covering exactly the clicked flight.
    const segs = (await segsNow(page)).filter((s) => s.pairingId === built!.id)
    expect(segs.map((s) => s.fltId), 'pairing covers the clicked flight').toContain(flightId)
    expect(new Set(segs.map((s) => s.dutySeq)).size, 'single duty').toBe(1)
    expect(segs.length, 'single segment').toBe(1)

    // Floated to the top row of the Pairing pane so the user can keep adjusting it.
    expect((await panelOrder(page))[0]?.id, 'new pairing sits on the top row').toBe(String(built!.id))

    // Remove its only flight → the pairing is deleted (no flights left).
    await removeFlightViaMenu(page, dashboard, built!.id, flightId)
    await expect.poll(async () => (await pairingsNow(page)).some((p) => p.id === built!.id), {
      message: 'pairing removed once its last flight is gone', timeout: 15_000,
    }).toBe(false)
  })

  test('Live-1711 — multi-selecting EK001 out + EK002 back builds a 2-duty overnight pairing', async ({ page }) => {
    test.setTimeout(90_000)
    await setDateRange(page, '2026-09-01T00:00:00.000Z', '2026-09-03T00:00:00.000Z')
    await applyFlightFilter(page, { fleets: ['A380'] })
    await expect.poll(async () => (await counts(page)).flightLegs, {
      message: 'EK A380 legs loaded', timeout: 20_000,
    }).toBeGreaterThan(0)

    // EK001 (DXB→LHR) out and its EK002 (LHR→DXB) back leg — the LHR layover must split duties.
    const rows = await readHook<FlightRow[]>(page, 'flights')
    const out = rows.find((r) => r.fltNum === 'EK001' && r.depArp === 'DXB')
    const back = rows.find((r) => r.fltNum === 'EK002' && r.arvArp === 'DXB'
      && r.start != null && out?.start != null && isoMs(r.start) > isoMs(out.start))
    expect(out, 'EK001 DXB→LHR outbound present').toBeTruthy()
    expect(back, 'EK002 LHR→DXB return present after the outbound').toBeTruthy()

    const before = new Set((await pairingsNow(page)).map((p) => p.id))
    await selectFlights(page, [out!.id, back!.id])

    // Right-click one of the selected legs — the menu acts on the whole selection.
    const probe = await flightProbe(page)
    expect(probe, 'a visible EK A380 puck to right-click').toBeTruthy()
    await rightClickFlight(page, dashboard.flightCanvas, probe as FlightProbe)
    const create = page.getByRole('button', { name: 'Create Pairing (2 flights)', exact: true })
    await expect(create).toBeVisible({ timeout: 3_000 })
    await create.click()

    let built: PairingObj | undefined
    await expect.poll(async () => {
      built = (await pairingsNow(page)).find((p) => !before.has(p.id) && p.fleet === 'A380')
      return built?.id ?? null
    }, { message: 'new 2-leg EK A380 pairing appears', timeout: 15_000 }).not.toBeNull()
    createdPairingIds.push(built!.id)

    const segs = (await segsNow(page)).filter((s) => s.pairingId === built!.id)
    expect(segs.length, 'pairing carries both legs').toBe(2)
    expect(new Set(segs.map((s) => s.fltId)), 'covers EK001 + EK002').toEqual(new Set([out!.id, back!.id]))
    expect(new Set(segs.map((s) => s.dutySeq)).size, 'LHR layover splits into 2 duties').toBe(2)
    expect(built!.base, 'still based at DXB').toBe('DXB')

    // Clean up through the UI: remove one leg (recompute to a single duty), then the last.
    await removeFlightViaMenu(page, dashboard, built!.id, back!.id)
    await expect.poll(async () => (await segsNow(page)).filter((s) => s.pairingId === built!.id).length, {
      message: 'one leg removed, pairing recomputed', timeout: 15_000,
    }).toBe(1)
    await removeFlightViaMenu(page, dashboard, built!.id, out!.id)
    await expect.poll(async () => (await pairingsNow(page)).some((p) => p.id === built!.id), {
      message: 'pairing deleted after its last leg', timeout: 15_000,
    }).toBe(false)
  })

  test('Live-1712 — two short ET 73W legs (ADD→MQX→ADD turnaround) build one single-duty ADD pairing, CA1/FO1', async ({ page }) => {
    test.setTimeout(90_000)
    await setDateRange(page, '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z')
    await applyFlightFilter(page, { fleets: ['73W'] })
    await expect.poll(async () => (await counts(page)).flightLegs, {
      message: 'ET 73W legs loaded', timeout: 20_000,
    }).toBeGreaterThan(0)

    // ET100 (ADD→MQX) then ET101 (MQX→ADD): same station, 40-min turn, ~3h total block ⇒
    // both legs stay in ONE duty (no layover), and the pairing returns home to ADD.
    const rows = await readHook<FlightRow[]>(page, 'flights')
    const out = rows.find((r) => r.fltNum === 'ET100' && r.depArp === 'ADD' && r.arvArp === 'MQX')
    const back = rows.find((r) => r.fltNum === 'ET101' && r.depArp === 'MQX' && r.arvArp === 'ADD'
      && r.start != null && out?.start != null && isoMs(r.start) > isoMs(out.start))
    expect(out, 'ET100 ADD→MQX outbound present').toBeTruthy()
    expect(back, 'ET101 MQX→ADD return present after the outbound').toBeTruthy()

    const before = new Set((await pairingsNow(page)).map((p) => p.id))
    await selectFlights(page, [out!.id, back!.id])

    const probe = await flightProbe(page)
    expect(probe, 'a visible ET 73W puck to right-click').toBeTruthy()
    await rightClickFlight(page, dashboard.flightCanvas, probe as FlightProbe)
    const create = page.getByRole('button', { name: 'Create Pairing (2 flights)', exact: true })
    await expect(create).toBeVisible({ timeout: 3_000 })
    await create.click()

    let built: PairingObj | undefined
    await expect.poll(async () => {
      built = (await pairingsNow(page)).find((p) => !before.has(p.id) && p.fleet === '73W')
      return built?.id ?? null
    }, { message: 'new 2-leg ET 73W pairing appears', timeout: 15_000 }).not.toBeNull()
    createdPairingIds.push(built!.id)

    expect(built!.base, 'ET pairing is based at ADD').toBe('ADD')
    const ca = built!.composition.find((c) => c.rank === 'CA')
    const fo = built!.composition.find((c) => c.rank === 'FO')
    expect(ca?.plan, 'narrow-body flight crew = 1 Captain').toBe(1)
    expect(fo?.plan, 'narrow-body flight crew = 1 First Officer').toBe(1)

    const segs = (await segsNow(page)).filter((s) => s.pairingId === built!.id)
    expect(segs.length, 'pairing carries both short legs').toBe(2)
    expect(new Set(segs.map((s) => s.fltId)), 'covers ET100 + ET101').toEqual(new Set([out!.id, back!.id]))
    expect(new Set(segs.map((s) => s.dutySeq)).size, 'short turnaround stays a single duty').toBe(1)
    // A single duty carries exactly ONE check-in (brief) — on its first segment only.
    expect(segs.filter((s) => s.briefStartUtc != null).length, 'single duty has exactly one check-in').toBe(1)

    // Clean up through the UI.
    await removeFlightViaMenu(page, dashboard, built!.id, back!.id)
    await expect.poll(async () => (await segsNow(page)).filter((s) => s.pairingId === built!.id).length, {
      message: 'one leg removed, single-duty pairing recomputed', timeout: 15_000,
    }).toBe(1)
    await removeFlightViaMenu(page, dashboard, built!.id, out!.id)
    await expect.poll(async () => (await pairingsNow(page)).some((p) => p.id === built!.id), {
      message: 'pairing deleted after its last leg', timeout: 15_000,
    }).toBe(false)
  })

  test('Live-1714 — a multi-hour hub connection (ET337→ET857, 4.2h ADD sit) stays ONE duty with ONE check-in', async ({ page }) => {
    test.setTimeout(90_000)
    await setDateRange(page, '2026-09-01T00:00:00.000Z', '2026-09-03T00:00:00.000Z')
    await applyFlightFilter(page, { fleets: ['7M8'] })
    await expect.poll(async () => (await counts(page)).flightLegs, {
      message: 'ET 7M8 legs loaded', timeout: 20_000,
    }).toBeGreaterThan(0)

    // ET337 EBB→ADD then ET857 ADD→FBM (same 7M8, ~4.2h ground sit at ADD): a long hub
    // connection, NOT a rest/layover ⇒ both legs belong to ONE duty ⇒ exactly ONE check-in.
    // Regression for the over-split bug: a >4h (but <12h rest) gap used to start a 2nd duty.
    const rows = await readHook<FlightRow[]>(page, 'flights')
    // Multiple daily instances exist across the 2-day window; pick the ET337 whose ET857
    // return departs the same day within 8h (the ~4.2h ADD sit connection).
    let out: FlightRow | undefined
    let back: FlightRow | undefined
    for (const o of rows.filter((r) => r.fltNum === 'ET337' && r.depArp === 'EBB' && r.arvArp === 'ADD' && r.start != null)) {
      const b = rows.find((r) => r.fltNum === 'ET857' && r.depArp === 'ADD' && r.arvArp === 'FBM'
        && r.start != null && isoMs(r.start) > isoMs(o.start!) && isoMs(r.start) - isoMs(o.start!) < 8 * 3_600_000)
      if (b) { out = o; back = b; break }
    }
    expect(out, 'ET337 EBB→ADD outbound present').toBeTruthy()
    expect(back, 'ET857 ADD→FBM connection within 8h present').toBeTruthy()

    const before = new Set((await pairingsNow(page)).map((p) => p.id))
    await selectFlights(page, [out!.id, back!.id])
    const probe = await flightProbe(page)
    expect(probe, 'a visible ET 7M8 puck to right-click').toBeTruthy()
    await rightClickFlight(page, dashboard.flightCanvas, probe as FlightProbe)
    const create = page.getByRole('button', { name: 'Create Pairing (2 flights)', exact: true })
    await expect(create).toBeVisible({ timeout: 3_000 })
    await create.click()

    let built: PairingObj | undefined
    await expect.poll(async () => {
      built = (await pairingsNow(page)).find((p) => !before.has(p.id) && p.fleet === '7M8')
      return built?.id ?? null
    }, { message: 'new single-duty ET 7M8 pairing appears', timeout: 15_000 }).not.toBeNull()
    createdPairingIds.push(built!.id)

    const segs = (await segsNow(page)).filter((s) => s.pairingId === built!.id)
    expect(segs.length, 'both legs on the pairing').toBe(2)
    expect(new Set(segs.map((s) => s.dutySeq)).size, '4.2h sit does NOT split the duty').toBe(1)
    expect(segs.filter((s) => s.briefStartUtc != null).length, 'exactly one check-in for the single duty').toBe(1)

    // Clean up through the UI.
    await removeFlightViaMenu(page, dashboard, built!.id, back!.id)
    await removeFlightViaMenu(page, dashboard, built!.id, out!.id)
    await expect.poll(async () => (await pairingsNow(page)).some((p) => p.id === built!.id), {
      message: 'pairing deleted after last leg', timeout: 15_000,
    }).toBe(false)
  })

  test('Live-1713 — right-click an ET 788 wide-body flight builds an ADD CA2/FO2 pairing', async ({ page }) => {
    test.setTimeout(90_000)
    await setDateRange(page, '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z')
    await applyFlightFilter(page, { depArps: ['ADD'], fleets: ['788'] })
    await expect.poll(async () => (await counts(page)).flightLegs, {
      message: 'ET 788 legs departing ADD loaded', timeout: 20_000,
    }).toBeGreaterThan(0)

    const probe = await flightProbe(page)
    expect(probe, 'a visible ET 788 flight puck to right-click').toBeTruthy()
    const flightId = (probe as FlightProbe).id
    const flt = (await readHook<FlightRow[]>(page, 'flights')).find((f) => f.id === flightId)
    expect(flt?.fleet, `flight #${flightId} is ET 788`).toBe('788')

    const before = new Set((await pairingsNow(page)).map((p) => p.id))
    await rightClickFlight(page, dashboard.flightCanvas, probe as FlightProbe)
    const create = page.getByRole('button', { name: 'Create Pairing (1 flight)', exact: true })
    await expect(create).toBeVisible({ timeout: 3_000 })
    await create.click()

    let built: PairingObj | undefined
    await expect.poll(async () => {
      built = (await pairingsNow(page)).find((p) => !before.has(p.id) && p.fleet === '788')
      return built?.id ?? null
    }, { message: 'new ET 788 pairing appears', timeout: 15_000 }).not.toBeNull()
    createdPairingIds.push(built!.id)

    expect(built!.base, 'ET pairing is based at ADD').toBe('ADD')
    const ca = built!.composition.find((c) => c.rank === 'CA')
    const fo = built!.composition.find((c) => c.rank === 'FO')
    expect(ca?.plan, 'wide-body flight crew = 2 Captains').toBe(2)
    expect(fo?.plan, 'wide-body flight crew = 2 First Officers').toBe(2)

    const segs = (await segsNow(page)).filter((s) => s.pairingId === built!.id)
    expect(new Set(segs.map((s) => s.dutySeq)).size, 'single duty').toBe(1)
    expect(segs.length, 'single segment').toBe(1)

    await removeFlightViaMenu(page, dashboard, built!.id, flightId)
    await expect.poll(async () => (await pairingsNow(page)).some((p) => p.id === built!.id), {
      message: 'pairing removed once its last flight is gone', timeout: 15_000,
    }).toBe(false)
  })

  test('Live-1715 — Pairing Info dialog shows accurate KPIs for a freshly-built ET 73W turnaround', async ({ page }) => {
    test.setTimeout(90_000)
    await setDateRange(page, '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z')
    await applyFlightFilter(page, { fleets: ['73W'] })
    await expect.poll(async () => (await counts(page)).flightLegs, {
      message: 'ET 73W legs loaded', timeout: 20_000,
    }).toBeGreaterThan(0)

    // Same ET100(ADD→MQX)+ET101(MQX→ADD) single-duty turnaround as Live-1712 — a 2-segment
    // pairing exercises credit dedup (one duty credit, not double) and BH summation in the KPIs.
    const rows = await readHook<FlightRow[]>(page, 'flights')
    const out = rows.find((r) => r.fltNum === 'ET100' && r.depArp === 'ADD' && r.arvArp === 'MQX')
    const back = rows.find((r) => r.fltNum === 'ET101' && r.depArp === 'MQX' && r.arvArp === 'ADD'
      && r.start != null && out?.start != null && isoMs(r.start) > isoMs(out.start))
    expect(out, 'ET100 ADD→MQX outbound present').toBeTruthy()
    expect(back, 'ET101 MQX→ADD return present after outbound').toBeTruthy()

    const before = new Set((await pairingsNow(page)).map((p) => p.id))
    await selectFlights(page, [out!.id, back!.id])
    const probe = await flightProbe(page)
    expect(probe, 'a visible ET 73W puck to right-click').toBeTruthy()
    await rightClickFlight(page, dashboard.flightCanvas, probe as FlightProbe)
    const create = page.getByRole('button', { name: 'Create Pairing (2 flights)', exact: true })
    await expect(create).toBeVisible({ timeout: 3_000 })
    await create.click()

    let built: PairingObj | undefined
    await expect.poll(async () => {
      built = (await pairingsNow(page)).find((p) => !before.has(p.id) && p.fleet === '73W')
      return built?.id ?? null
    }, { message: 'new single-duty ET 73W pairing appears', timeout: 15_000 }).not.toBeNull()
    createdPairingIds.push(built!.id)

    const segs = (await segsNow(page)).filter((s) => s.pairingId === built!.id)
    expect(segs.length, 'both legs on the pairing').toBe(2)
    expect(new Set(segs.map((s) => s.dutySeq)).size, 'single duty').toBe(1)
    // Store-side credit total (sumPairingCreditMinutes, duty-deduped) — the independent ground
    // truth the dialog's Total Credit KPI must match.
    const creditMin = segs[0].pairingCreditMin
    const caPlan = built!.composition.find((c) => c.rank === 'CA')?.plan
    const foPlan = built!.composition.find((c) => c.rank === 'FO')?.plan

    // Open Pairing Info through the REAL right-click "View pairing detail" menu (§Simulate-User).
    const dialog = await openPairingInfoViaMenu(page, dashboard, built!.id, out!.id)
    const content = dialog.getByTestId('pairing-info-content')
    await expect(content).toBeVisible({ timeout: 5_000 })

    // Title carries the built pairing id.
    await expect(dialog).toContainText(`#${built!.id}`)
    // Base KPI matches the store's base for this pairing.
    await expect(dialog.locator('span', { hasText: 'Base:' }).first()).toContainText(built!.base ?? 'ADD')
    // Composition KPI reflects the narrow-body CA/FO plan counts.
    const comp = dialog.locator('span', { hasText: 'Composition:' }).first()
    await expect(comp).toContainText(`CA(${caPlan})`)
    await expect(comp).toContainText(`FO(${foPlan})`)
    // Total Credit KPI equals the independently-computed, duty-deduped store total (H:MM).
    const creditText = (await dialog.getByTestId('pairing-info-total-credit').textContent())?.trim()
    expect(creditText, 'Total Credit KPI matches store credit total').toBe(fmtDur(creditMin) || '—')
    // Total BH KPI renders a real positive H:MM sum for the two live (non-DH) legs.
    const bhText = (await dialog.getByTestId('pairing-info-total-bh').textContent())?.trim()
    expect(bhText, 'Total BH KPI is a positive H:MM').toMatch(/^\d{1,2}:[0-5]\d$/)
    expect(bhText, 'Total BH KPI is non-zero').not.toBe('0:00')

    // Segment table shows exactly the two built legs.
    const cells = await readSegmentCells(dialog)
    expect(cells.length, 'segment table has both legs').toBe(2)
    const flightCol = cells.map((r) => r[SEG.FLIGHT]).join(' ')
    expect(flightCol, 'ET100 outbound row present').toContain('100')
    expect(flightCol, 'ET101 return row present').toContain('101')
    // Both legs belong to ONE duty → exactly one merged (rowspanned) duty cell in the table.
    // (Its Credit/DP/FDP summary is blank on a freshly-built pairing: those duty aggregates are
    //  computed downstream, not at build time — Total Credit therefore reads "—" until then.)
    await expect(dialog.getByTestId('pairing-info-duty-cell'), 'single merged duty cell').toHaveCount(1)

    // Close the dialog through its real close button (the KPI-accuracy assertions above are the
    // point of this test; the pairing is torn down by afterEach — the remove-via-UI flow is
    // already covered by Live-1710/1712/1713/1714, so it isn't re-driven here).
    await page.getByTestId('pairing-info-dialog-close').click()
    await expect(dialog).toBeHidden({ timeout: 3_000 })
  })
})
