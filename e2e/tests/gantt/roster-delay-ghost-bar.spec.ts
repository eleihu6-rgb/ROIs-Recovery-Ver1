/**
 * Delay ghost bar — Roster pane (Ryan's Phase-4 item 2: "add feat to delay flight, which
 * shall render the ghost bar in flight, pairing and roster, when this flight was part of
 * pairing and roster. same style as my snapshot shoot").
 *
 * roster_flight carries its OWN sch/act times (crew x segment grain, denormalized from
 * pairing_segment at assignment time), so the roster pane draws the same hatched gray
 * "sched" ghost + amber "→" actual-departure flag independently, reusing the shared
 * drawDelayGhost helper (see flight-delay-ghost-bar.spec.ts's header doc for style rationale).
 *
 * Test data: roster_flight.id=1328507 / crew_id='1168' / pairing_id=14968 — flight 502
 * (YXX->YYC, 2026-08-01), a naturally-occurring clean historical delay (60min dep / 56min
 * arv, confirmed via direct DB query, not re-seeded here). Deliberately asymmetric delay
 * (dep != arv) to prove the ghost isn't just mirroring a uniform shift.
 *
 * Second test data: roster_flight.id=1309635 / crew_id='2292' / pairing_id=11896 — flight
 * 11048 (2026-06-22), a naturally-occurring delay (1439min dep / 1431min arv) on a 330min
 * scheduled duration — delayMin > duration, the case that used to leave a visible gap between
 * the ghost and the solid segment (Ryan 2026-08-29, re ET168 on the Flight pane: "the ghost
 * bar and solid bar are not connecting, the ghost bar stands for duration of delay"), now
 * fixed so the ghost always spans the full delay and touches the segment. Reused as-is (no
 * new assignment) since it already satisfies delayMin > duration, per Ryan's direction to
 * prefer an existing fixture over writing a new roster_flight row into the shared SIT DB.
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, setDateRange } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// §PW-Snapshot: Ver2 — whole-pairing capture of the Roster-pane ghost bar. Ver1 cropped to only
// the delayed leg; Ryan asked for the entire pairing (all legs on this crew's roster row).
const SNAPSHOT_PATH = path.resolve(__dirname, '../../../docs/assets/screenshots/gantt/roster-delay-ghost-bar-Ver2.png')
// §PW-Snapshot Ver3 — whole-pairing gap-closed proof (delayMin > duration case). Ver2 cropped to
// only the delayed leg; Ver3 shows every leg of the pairing.
const SNAPSHOT_PATH_V2 = path.resolve(__dirname, '../../../docs/assets/screenshots/gantt/roster-delay-ghost-bar-Ver3.png')

const ROSTER_ITEM_ID = 1328507
const CREW_ID = '1168'
const DEP_DELAY_MIN = 60
const ARV_DELAY_MIN = 56

const ROSTER_ITEM_ID_2 = 1309635
const CREW_ID_2 = '2292'
const DEP_DELAY_MIN_2 = 1439
const ARV_DELAY_MIN_2 = 1431

const PX_PER_HOUR = 60 // 1px/min

interface RosterItemRow {
  id: number
  crewId: string
  pairingId: number | null
  start: string | null
  end: string | null
  actStrDtUtc: string | null
  actEndDtUtc: string | null
}

const applyCrewFilter = (page: Page, filter: { crewIds?: string[] }): Promise<void> =>
  page.evaluate(
    (f) => (window.__ganttTest as unknown as { applyCrewFilter: (x: typeof f) => Promise<void> }).applyCrewFilter(f),
    filter,
  )

const setZoom = (page: Page, pxPerHour: number): Promise<void> =>
  page.evaluate((px) => (window.__ganttTest as unknown as { setZoom: (n: number) => void }).setZoom(px), pxPerHour)

const focusRosterItem = (page: Page, itemId: number): Promise<{ id: number; pairingId: number | null; crewId: string; x: number; y: number } | null> =>
  page.evaluate(
    (id) => (window.__ganttTest as unknown as { focusRosterItem: (n: number) => { id: number; pairingId: number | null; crewId: string; x: number; y: number } | null }).focusRosterItem(id),
    itemId,
  )

const settleFrame = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

// See flight-delay-ghost-bar.spec.ts for the area-average rationale (diagonal stripes only
// cover a fraction of any given pixel row — a single-pixel sample is flaky).
const sampleRegionAvg = (
  page: Page,
  testId: string,
  logicalX: number,
  logicalY: number,
  logicalW: number,
  logicalH: number,
): Promise<[number, number, number, number]> =>
  page.evaluate(
    ({ testId, logicalX, logicalY, logicalW, logicalH }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-testid="${testId}"]`)
      if (!canvas) throw new Error(`canvas[data-testid="${testId}"] not found`)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2d context unavailable')
      const dpr = window.devicePixelRatio || 1
      const px = Math.max(0, Math.round(logicalX * dpr))
      const py = Math.max(0, Math.round(logicalY * dpr))
      const w = Math.max(1, Math.round(logicalW * dpr))
      const h = Math.max(1, Math.round(logicalH * dpr))
      const d = ctx.getImageData(px, py, w, h).data
      let r = 0, g = 0, b = 0, a = 0
      const n = w * h
      for (let i = 0; i < d.length; i += 4) {
        r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]
      }
      return [r / n, g / n, b / n, a / n] as [number, number, number, number]
    },
    { testId, logicalX, logicalY, logicalW, logicalH },
  )

test.describe('Roster pane — delay ghost bar', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await setDateRange(page, '2026-07-31T00:00:00.000Z', '2026-08-02T00:00:00.000Z')
    await setZoom(page, PX_PER_HOUR)
  })

  test('Live-1732 — a delayed flight on a crew roster renders a hatched sched-ghost head before the solid segment @smoke', async ({ page }) => {
    await applyCrewFilter(page, { crewIds: [CREW_ID] })

    await expect
      .poll(async () => (await readHook<RosterItemRow[]>(page, 'roster')).some((it) => it.id === ROSTER_ITEM_ID), {
        message: `roster item ${ROSTER_ITEM_ID} (crew ${CREW_ID}) loaded`,
        timeout: 15_000,
      })
      .toBe(true)

    const items = await readHook<RosterItemRow[]>(page, 'roster')
    const item = items.find((it) => it.id === ROSTER_ITEM_ID)
    expect(item, `target roster item ${ROSTER_ITEM_ID} loaded`).toBeTruthy()
    expect(item!.start, 'has sch start').toBeTruthy()
    expect(item!.end, 'has sch end').toBeTruthy()
    expect(item!.actStrDtUtc, 'has actStrDtUtc').toBeTruthy()
    expect(item!.actEndDtUtc, 'has actEndDtUtc').toBeTruthy()

    const schStrMs = new Date(item!.start!).getTime()
    const schEndMs = new Date(item!.end!).getTime()
    const actStrMs = new Date(item!.actStrDtUtc!).getTime()
    const actEndMs = new Date(item!.actEndDtUtc!).getTime()
    expect(Math.round((actStrMs - schStrMs) / 60_000), 'dep delay minutes').toBe(DEP_DELAY_MIN)
    expect(Math.round((actEndMs - schEndMs) / 60_000), 'arv delay minutes').toBe(ARV_DELAY_MIN)

    const focus = await focusRosterItem(page, ROSTER_ITEM_ID)
    expect(focus, 'focusRosterItem found the item in the loaded/rendered rows').toBeTruthy()
    await settleFrame(page)

    const zoomState = await page.evaluate(() => (window.__ganttTest as unknown as { zoom: () => { pxPerHour: number } }).zoom())
    expect(zoomState.pxPerHour, 'zoom pinned to PX_PER_HOUR').toBe(PX_PER_HOUR)

    const schedStrXLocal = focus!.x - 6 // focusRosterItem lands 6px into the box from its schStr x
    const durationHours = (schEndMs - schStrMs) / 3_600_000
    const schedEndXLocal = schedStrXLocal + durationHours * PX_PER_HOUR
    const shiftHours = DEP_DELAY_MIN / 60
    const actStrXLocal = schedStrXLocal + shiftHours * PX_PER_HOUR

    const visibleGhostEndXLocal = Math.min(schedEndXLocal, actStrXLocal)
    const visibleGhostSpan = visibleGhostEndXLocal - schedStrXLocal
    const beforeGhostX = Math.max(schedStrXLocal - 30, 5)

    const sampleH = 24 // SEGMENT_FLIGHT_HEIGHT (20) + margin for the ghost's dashed border
    const [hr, , hb, ha] = await sampleRegionAvg(
      page, 'roster-canvas', schedStrXLocal, focus!.y - sampleH / 2, Math.max(visibleGhostSpan, 2), sampleH,
    )
    const [pr, , pb] = await sampleRegionAvg(page, 'roster-canvas', beforeGhostX, focus!.y - sampleH / 2, 20, sampleH)

    expect(ha, 'ghost head region is on-canvas (has paint)').toBeGreaterThan(0)
    const relativeSlateLean = (hb - hr) - (pb - pr)
    expect(
      relativeSlateLean,
      `ghost head region [${schedStrXLocal.toFixed(1)},${visibleGhostEndXLocal.toFixed(1)}]@${focus!.y} leans slate (b>r) relative to the just-before-ghost baseline`,
    ).toBeGreaterThanOrEqual(1)

    // §PW-Snapshot — capture the ENTIRE pairing (every leg on this crew's roster row), not
    // just the delayed leg (Ryan 2026-08-29: "snapshot shall capture an entire pairing, not
    // partial"). `items` already carries every roster item for this crew in the loaded date
    // range, so filter it down to this leg's own pairingId to get its sibling legs. A crew's
    // whole duty renders on the same row, so every leg's local x can be derived from the known
    // anchor (schedStrXLocal @ this leg's schStrMs) via linear time-offset.
    const pairingLegs = items.filter((it) => it.pairingId === item!.pairingId)
    const canvas = page.locator('canvas[data-testid="roster-canvas"]')
    const box = await canvas.boundingBox()
    if (box) {
      const toLocalX = (iso: string) => schedStrXLocal + (new Date(iso).getTime() - schStrMs) / 3_600_000 * PX_PER_HOUR
      let pairingMinX = Infinity
      let pairingMaxX = -Infinity
      for (const leg of pairingLegs) {
        for (const iso of [leg.start, leg.end, leg.actStrDtUtc, leg.actEndDtUtc]) {
          if (!iso) continue
          const x = toLocalX(iso)
          pairingMinX = Math.min(pairingMinX, x)
          pairingMaxX = Math.max(pairingMaxX, x)
        }
      }
      const clipStartLocal = pairingMinX - 20
      const clipEndLocal = pairingMaxX + 20
      await page.screenshot({
        path: SNAPSHOT_PATH,
        clip: {
          x: Math.max(0, box.x + clipStartLocal),
          y: Math.max(box.y, box.y + focus!.y - 25),
          width: Math.min(clipEndLocal - clipStartLocal, box.width - clipStartLocal),
          height: 60,
        },
      })
    }
  })

  test('Live-1732b — a delay exceeding the flight duration still renders a gap-free ghost head touching the solid segment @smoke', async ({ page }) => {
    // Fixture's date is far from the describe-level beforeEach's window — set our own. This
    // fixture's delay (1439min) plus duration span ~29.4h — at PX_PER_HOUR (60) that's ~1760px,
    // wider than the canvas element itself, so the solid segment would render off-canvas. Use
    // a much lower zoom so the whole ghost-to-segment span is visible on-screen (and provable).
    const ZOOM_2 = 20
    // End extended to Jun24 (not Jun23) so this pairing's second leg (arrives Jun23 19:29) is
    // fully in-range — needed for the §PW-Snapshot whole-pairing capture below to include both legs.
    await setDateRange(page, '2026-06-21T00:00:00.000Z', '2026-06-24T00:00:00.000Z')
    await setZoom(page, ZOOM_2)
    await applyCrewFilter(page, { crewIds: [CREW_ID_2] })

    await expect
      .poll(async () => (await readHook<RosterItemRow[]>(page, 'roster')).some((it) => it.id === ROSTER_ITEM_ID_2), {
        message: `roster item ${ROSTER_ITEM_ID_2} (crew ${CREW_ID_2}) loaded`,
        timeout: 15_000,
      })
      .toBe(true)

    const items = await readHook<RosterItemRow[]>(page, 'roster')
    const item = items.find((it) => it.id === ROSTER_ITEM_ID_2)
    expect(item, `target roster item ${ROSTER_ITEM_ID_2} loaded`).toBeTruthy()
    expect(item!.start, 'has sch start').toBeTruthy()
    expect(item!.end, 'has sch end').toBeTruthy()
    expect(item!.actStrDtUtc, 'has actStrDtUtc').toBeTruthy()
    expect(item!.actEndDtUtc, 'has actEndDtUtc').toBeTruthy()

    const schStrMs = new Date(item!.start!).getTime()
    const schEndMs = new Date(item!.end!).getTime()
    const actStrMs = new Date(item!.actStrDtUtc!).getTime()
    const actEndMs = new Date(item!.actEndDtUtc!).getTime()
    expect(Math.round((actStrMs - schStrMs) / 60_000), 'dep delay minutes').toBe(DEP_DELAY_MIN_2)
    expect(Math.round((actEndMs - schEndMs) / 60_000), 'arv delay minutes').toBe(ARV_DELAY_MIN_2)
    const durationHours = (schEndMs - schStrMs) / 3_600_000
    expect(DEP_DELAY_MIN_2, 'fixture sanity: dep delay exceeds scheduled duration').toBeGreaterThan(durationHours * 60)

    const focus = await focusRosterItem(page, ROSTER_ITEM_ID_2)
    expect(focus, 'focusRosterItem found the item in the loaded/rendered rows').toBeTruthy()
    await settleFrame(page)

    const zoomState = await page.evaluate(() => (window.__ganttTest as unknown as { zoom: () => { pxPerHour: number } }).zoom())
    expect(zoomState.pxPerHour, 'zoom pinned to ZOOM_2').toBe(ZOOM_2)

    const schedStrXLocal = focus!.x - 6 // focusRosterItem lands 6px into the box from its schStr x
    const schedEndXLocal = schedStrXLocal + durationHours * ZOOM_2
    const shiftHours = DEP_DELAY_MIN_2 / 60
    const actStrXLocal = schedStrXLocal + shiftHours * ZOOM_2

    // Ghost is always drawn delayMin wide — [schedStr, actStr] — so it always reaches the
    // solid segment's actual start, even though delayMin_2 (1439) far exceeds duration (330).
    const visibleGhostEndXLocal = actStrXLocal
    const visibleGhostSpan = visibleGhostEndXLocal - schedStrXLocal
    const beforeGhostX = Math.max(schedStrXLocal - 30, 5)

    const sampleH = 24
    const [hr, , hb, ha] = await sampleRegionAvg(
      page, 'roster-canvas', schedStrXLocal, focus!.y - sampleH / 2, Math.max(visibleGhostSpan, 2), sampleH,
    )
    const [pr, , pb] = await sampleRegionAvg(page, 'roster-canvas', beforeGhostX, focus!.y - sampleH / 2, 20, sampleH)

    expect(ha, 'ghost head region is on-canvas (has paint)').toBeGreaterThan(0)
    const relativeSlateLean = (hb - hr) - (pb - pr)
    expect(
      relativeSlateLean,
      `ghost head region [${schedStrXLocal.toFixed(1)},${visibleGhostEndXLocal.toFixed(1)}]@${focus!.y} leans slate (b>r) relative to the just-before-ghost baseline`,
    ).toBeGreaterThanOrEqual(1)

    // Regression proof: [schedEnd, actStr] is exactly the span that used to be an unpainted
    // gap under the old (scheduled-duration-wide) ghost.
    const [gr, , gb, ga] = await sampleRegionAvg(
      page, 'roster-canvas', schedEndXLocal, focus!.y - sampleH / 2, actStrXLocal - schedEndXLocal, sampleH,
    )
    expect(ga, `former-gap region [${schedEndXLocal.toFixed(1)},${actStrXLocal.toFixed(1)}]@${focus!.y} is on-canvas (has paint)`).toBeGreaterThan(0)
    const gapSlateLean = (gb - gr) - (pb - pr)
    expect(
      gapSlateLean,
      `former-gap region [${schedEndXLocal.toFixed(1)},${actStrXLocal.toFixed(1)}]@${focus!.y} now leans slate (ghost extends to touch the solid segment, no gap) relative to the just-before-ghost baseline`,
    ).toBeGreaterThanOrEqual(1)

    // §PW-Snapshot — capture the ENTIRE pairing (every leg on this crew's roster row), not just
    // the delayed leg (Ryan 2026-08-29: "snapshot shall capture an entire pairing, not partial").
    // The full pairing span can exceed the canvas's own width at ZOOM_2 (same issue as the
    // Pairing-pane capture), so this uses the largest zoom (<=ZOOM_2) that still fits the whole
    // span on-canvas — the pixel-sampling assertions above stay at ZOOM_2, only capture differs.
    const pairingLegs = items.filter((it) => it.pairingId === item!.pairingId)
    const canvas = page.locator('canvas[data-testid="roster-canvas"]')
    const box = await canvas.boundingBox()
    if (box) {
      let pairingMinMs = Infinity
      let pairingMaxMs = -Infinity
      for (const leg of pairingLegs) {
        for (const iso of [leg.start, leg.end, leg.actStrDtUtc, leg.actEndDtUtc]) {
          if (!iso) continue
          const ms = new Date(iso).getTime()
          pairingMinMs = Math.min(pairingMinMs, ms)
          pairingMaxMs = Math.max(pairingMaxMs, ms)
        }
      }
      const spanHours = (pairingMaxMs - pairingMinMs) / 3_600_000
      const margin = 40
      const screenshotZoom = Math.min(ZOOM_2, Math.floor((box.width - margin) / spanHours))

      if (screenshotZoom !== ZOOM_2) {
        await setZoom(page, screenshotZoom)
        await settleFrame(page)
      }
      const zFocus = screenshotZoom === ZOOM_2 ? focus : await focusRosterItem(page, ROSTER_ITEM_ID_2)
      const zSchedStrXLocal = zFocus!.x - 6
      const toLocalX = (iso: string) => zSchedStrXLocal + (new Date(iso).getTime() - schStrMs) / 3_600_000 * screenshotZoom

      let pairingMinX = Infinity
      let pairingMaxX = -Infinity
      for (const leg of pairingLegs) {
        for (const iso of [leg.start, leg.end, leg.actStrDtUtc, leg.actEndDtUtc]) {
          if (!iso) continue
          const x = toLocalX(iso)
          pairingMinX = Math.min(pairingMinX, x)
          pairingMaxX = Math.max(pairingMaxX, x)
        }
      }
      const clipStartLocal = pairingMinX - 20
      const clipEndLocal = pairingMaxX + 20
      await page.screenshot({
        path: SNAPSHOT_PATH_V2,
        clip: {
          x: Math.max(0, box.x + clipStartLocal),
          y: Math.max(box.y, box.y + focus!.y - 25),
          width: Math.min(clipEndLocal - clipStartLocal, box.width - clipStartLocal),
          height: 60,
        },
      })

      if (screenshotZoom !== ZOOM_2) {
        await setZoom(page, ZOOM_2)
        await settleFrame(page)
      }
    }
  })
})
