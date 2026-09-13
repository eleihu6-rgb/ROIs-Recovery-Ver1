/**
 * Shared harness for Live "pairing build" Playwright specs.
 *
 * Extracted verbatim from `tests/gantt/pairing-build.spec.ts` (which still owns the
 * create/remove behaviour) so a second spec — `ek-et-flight-assignment-fly.spec.ts`,
 * proving what a pairing BUILT from EK/ET flights records as its segment assignment —
 * reuses the exact same real-UI hit-testing instead of duplicating ~120 lines of
 * canvas geometry math.
 *
 * Positioning the viewport / selecting flights uses window.__ganttTest hooks (the same
 * read-only affordance the other pairing specs use); the operation under test — the
 * right-click context menu and its actions — is always driven through the real UI
 * (§Simulate-User).
 */
import { expect, type Locator, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../pages/gantt/gantt-dashboard-page'
import { readHook } from './gantt-hook'

export interface FlightRow {
  id: number; fleet: string; fltNum: string | null; depArp: string | null; arvArp: string | null; start: string | null
}
export interface PairingObj {
  id: number; base: string | null; fleet: string | null; division: string | null
  composition: Array<{ rank: string | null; plan: number; fill: number }>
  start: string | null; end: string | null
}
export interface SegObj { segId: number; pairingId: number; segSeq: number; dutySeq: number; schStrDtUtc: string | null; briefStartUtc: string | null; fltId: number | null; fltNum: string | null; pairingCreditMin: number | null }
export interface FlightProbe {
  id: number; schDepDtUtc: string; rowIndex: number; rowCenterY: number
  scrollX: number; pxPerHour: number; rangeStartIso: string
}
export interface PairingProbe {
  segId: number; pairingId: number; fltId: number | null; schStrDtUtc: string; rowIndex: number
  scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number
}

export const isoMs = (iso: string): number =>
  Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)

export const setDateRange = (page: Page, startIso: string, endIso: string): Promise<void> =>
  page.evaluate(
    ({ s, e }) => (window.__ganttTest as unknown as { setDateRange: (a: string, b: string) => Promise<void> }).setDateRange(s, e),
    { s: startIso, e: endIso },
  )

export const applyFlightFilter = (page: Page, filter: { depArps?: string[]; fleets?: string[] }): Promise<void> =>
  page.evaluate(
    (f) => (window.__ganttTest as unknown as { applyFlightFilter: (x: typeof f) => Promise<void> }).applyFlightFilter(f),
    filter,
  )

export const flightProbe = (page: Page): Promise<FlightProbe | null> =>
  page.evaluate(() => (window.__ganttTest as unknown as { flightProbe: () => FlightProbe | null }).flightProbe())

export interface FocusResult { id: number; x: number; y: number; rowIndex: number; scrollX: number; scrollY: number }

/** Scroll a specific flight's puck into the flight pane and return its on-canvas x/y. */
export const focusFlight = (page: Page, id: number): Promise<FocusResult | null> =>
  page.evaluate((fid) => (window.__ganttTest as unknown as { focusFlight: (n: number) => FocusResult | null }).focusFlight(fid), id)

export const pairingVisibleSegments = (page: Page): Promise<PairingProbe[]> =>
  page.evaluate(() => (window.__ganttTest as unknown as { pairingVisibleSegments: (n?: number) => PairingProbe[] }).pairingVisibleSegments())

export const setScrollX = (page: Page, x: number): Promise<void> =>
  page.evaluate((v) => (window.__ganttTest as unknown as { setScrollX: (n: number) => void }).setScrollX(v), x)

export const paneScrollY = (page: Page, prefix: string): Promise<number> =>
  page.evaluate((p) => (window.__ganttTest as unknown as { paneScrollY: (x: string) => number }).paneScrollY(p), prefix)

export const selectFlights = (page: Page, ids: number[]): Promise<void> =>
  page.evaluate((v) => (window.__ganttTest as unknown as { selectRosterTasks: (x: number[]) => void }).selectRosterTasks(v), ids)

export const pairingsNow = (page: Page): Promise<PairingObj[]> => readHook<PairingObj[]>(page, 'pairings')
export const segsNow = (page: Page): Promise<SegObj[]> => readHook<SegObj[]>(page, 'pairingSegments')
export const panelOrder = (page: Page): Promise<Array<{ id: string }>> => readHook<Array<{ id: string }>>(page, 'pairingPanelOrder')

/** Right-click the visible flight puck the probe describes. */
export const rightClickFlight = async (page: Page, canvas: Locator, p: FlightProbe): Promise<void> => {
  const x = (Math.trunc((isoMs(p.schDepDtUtc) - isoMs(p.rangeStartIso)) / 60_000) / 60) * p.pxPerHour - p.scrollX
  await canvas.click({ position: { x: x + 6, y: p.rowCenterY }, button: 'right' })
}

/** Right-click a pairing segment (top-of-pane row) the probe describes. */
export const rightClickPairingSeg = async (page: Page, canvas: Locator, p: PairingProbe): Promise<boolean> => {
  const box = await canvas.boundingBox()
  if (!box) return false
  const x = (Math.trunc((isoMs(p.schStrDtUtc) - isoMs(p.rangeStartIso)) / 60_000) / 60) * p.pxPerHour - p.scrollX + 6
  const y = p.headerHeight + p.rowIndex * p.rowHeight - p.scrollY + Math.floor(p.rowHeight / 2)
  if (x < 0 || x > box.width - 4 || y < 0 || y > box.height - 4) return false
  await canvas.click({ position: { x, y }, button: 'right' })
  return true
}

/** Remove one flight from a pairing through the real right-click menu; returns when the store settled. */
export const removeFlightViaMenu = async (page: Page, dashboard: GanttDashboardPage, pairingId: number, fltId: number): Promise<void> => {
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
  // true row), right-click — until the Delete menu actually appears.
  const remove = page.getByRole('button', { name: 'Delete flight from pairing', exact: true })
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
export const openPairingInfoViaMenu = async (page: Page, dashboard: GanttDashboardPage, pairingId: number, fltId: number): Promise<Locator> => {
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
export const fmtDur = (min: number | null | undefined): string =>
  min == null || min <= 0 ? '' : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
