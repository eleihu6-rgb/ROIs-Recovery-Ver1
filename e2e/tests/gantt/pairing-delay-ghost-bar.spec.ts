/**
 * Delay ghost bar — Pairing pane (Ryan's Phase-4 item 2: "add feat to delay flight, which
 * shall render the ghost bar in flight, pairing and roster, when this flight was part of
 * pairing and roster. same style as my snapshot shoot").
 *
 * pairing_segment is pre-denormalized with its OWN sch/act times (not joined from `flight`),
 * so the pairing pane draws the same hatched gray "sched" ghost + amber "→" actual-departure
 * flag independently of the Flight pane, reusing the shared drawDelayGhost helper (see
 * flight-delay-ghost-bar.spec.ts's header doc for the full style rationale).
 *
 * Two targets:
 *  - EK001: pairing_id=150390 / seg_id=465248 (DXB->LHR, 2026-09-01), delayMin(120) < duration
 *    — the ordinary case, ghost's tail hides under the solid puck.
 *  - ET168: pairing_id=150406 / seg_id=465280 (ADD->GDQ, 2026-09-01), delayMin(240) > duration
 *    (85min) — the case that used to leave a visible gap between the ghost and the solid puck
 *    (Ryan 2026-08-29: "check ET168 01 sep, the ghost bar and solid bar are not connecting,
 *    the ghost bar stands for duration of delay"), now fixed so the ghost always spans the
 *    full delay and touches the puck.
 * Both segments' sch/act times were confirmed via direct DB query, not re-seeded here.
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, setDateRange } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// §PW-Snapshot: Ver2 — whole-pairing capture of the Pairing-pane ghost bar (EK001, ordinary
// case). Ver1 cropped to only the delayed segment; Ryan asked for the entire pairing (all legs).
const SNAPSHOT_PATH = path.resolve(__dirname, '../../../docs/assets/screenshots/gantt/pairing-delay-ghost-bar-Ver2.png')
// §PW-Snapshot Ver3 — whole-pairing ET168 gap-closed proof (delayMin > duration case). Ver2
// cropped to only the delayed segment; Ver3 shows both legs of the pairing.
const SNAPSHOT_PATH_ET168 = path.resolve(__dirname, '../../../docs/assets/screenshots/gantt/pairing-delay-ghost-bar-et168-Ver3.png')
// §PW-Snapshot Ver1 — EK202 (Ryan 2026-08-29 clipboard screenshot: "check out overlap with
// flight"). Root cause: pairing 150398 seg 465265 (JFK->DXB, duty_seq=2, the LAST duty) had
// debrief/dropoff computed from the SCHEDULED end (15:45) instead of the ACTUAL delayed end
// (18:45), same seed-fixture bug class as EK001/ET168 — fixed via SQL. This is also the first
// fixture where the delay lands on duty 2 (the last duty), which anchors the trailing
// rest-back-to-base bar, closing that coverage gap.
const SNAPSHOT_PATH_EK202 = path.resolve(__dirname, '../../../docs/assets/screenshots/gantt/pairing-delay-ghost-bar-ek202-Ver1.png')

// depArp uniquely scopes the server-side query per pairing (see applyPairingFilter below).
const TARGETS = [
  { pairingId: 150390, segId: 465248, depArp: 'DXB', delayMin: 120, screenshotPath: SNAPSHOT_PATH, screenshotHeight: 60 },
  { pairingId: 150406, segId: 465280, depArp: 'ADD', delayMin: 240, screenshotPath: SNAPSHOT_PATH_ET168, screenshotHeight: 95 },
  { pairingId: 150398, segId: 465265, depArp: 'DXB', delayMin: 180, screenshotPath: SNAPSHOT_PATH_EK202, screenshotHeight: 60 },
]

const PX_PER_HOUR = 60 // 1px/min

interface PairingSegmentRow {
  segId: number
  pairingId: number
  schStrDtUtc: string | null
  schEndDtUtc: string | null
  actStrDtUtc: string | null
  actEndDtUtc: string | null
  pickupStartUtc: string | null
  dropoffEndUtc: string | null
  dutySchRestMin: number | null
  dutyActRestMin: number | null
}

const applyPairingFilter = (page: Page, filter: { depArps?: string[]; pairingIds?: string[]; coverage?: string[] }): Promise<void> =>
  page.evaluate(
    (f) => (window.__ganttTest as unknown as { applyPairingFilter: (x: typeof f) => Promise<void> }).applyPairingFilter(f),
    filter,
  )

const setZoom = (page: Page, pxPerHour: number): Promise<void> =>
  page.evaluate((px) => (window.__ganttTest as unknown as { setZoom: (n: number) => void }).setZoom(px), pxPerHour)

const focusPairingSegment = (page: Page, segId: number): Promise<{ id: number; pairingId: number; x: number; y: number } | null> =>
  page.evaluate(
    (id) => (window.__ganttTest as unknown as { focusPairingSegment: (n: number) => { id: number; pairingId: number; x: number; y: number } | null }).focusPairingSegment(id),
    segId,
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

test.describe('Pairing pane — delay ghost bar', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    // End extended to Sep4 (not Sep3) so EK001's return leg (arrives Sep3 04:05) is fully
    // in-range — needed for the §PW-Snapshot whole-pairing capture below to include both legs.
    await setDateRange(page, '2026-08-31T00:00:00.000Z', '2026-09-04T00:00:00.000Z')
    await setZoom(page, PX_PER_HOUR)
  })

  test('Live-1731 — a delayed flight in a pairing renders a hatched sched-ghost head before the solid segment @smoke', async ({ page }) => {
    for (const t of TARGETS) {
      // depArps narrows the server-side query; pairingIds is the pairing pane's client-side
      // hard filter down to the exact target; coverage:[] disables the default open/partial-only
      // restriction so a fully-open pairing still shows.
      await applyPairingFilter(page, { depArps: [t.depArp], pairingIds: [String(t.pairingId)], coverage: [] })

      await expect
        .poll(async () => (await readHook<PairingSegmentRow[]>(page, 'pairingSegments')).some((s) => s.segId === t.segId), {
          message: `seg ${t.segId} (pairing ${t.pairingId}) loaded`,
          timeout: 15_000,
        })
        .toBe(true)

      const segs = await readHook<PairingSegmentRow[]>(page, 'pairingSegments')
      const seg = segs.find((s) => s.segId === t.segId)
      expect(seg, `target segment ${t.segId} loaded`).toBeTruthy()
      expect(seg!.schStrDtUtc, 'has schStrDtUtc').toBeTruthy()
      expect(seg!.schEndDtUtc, 'has schEndDtUtc').toBeTruthy()
      expect(seg!.actStrDtUtc, 'has actStrDtUtc').toBeTruthy()
      expect(seg!.actEndDtUtc, 'has actEndDtUtc').toBeTruthy()

      const schStrMs = new Date(seg!.schStrDtUtc!).getTime()
      const schEndMs = new Date(seg!.schEndDtUtc!).getTime()
      const actStrMs = new Date(seg!.actStrDtUtc!).getTime()
      const actEndMs = new Date(seg!.actEndDtUtc!).getTime()
      expect(Math.round((actStrMs - schStrMs) / 60_000), `seg ${t.segId} dep delay minutes`).toBe(t.delayMin)
      expect(Math.round((actEndMs - schEndMs) / 60_000), `seg ${t.segId} arv delay minutes`).toBe(t.delayMin)

      const focus = await focusPairingSegment(page, t.segId)
      expect(focus, `focusPairingSegment found segment ${t.segId} in the loaded/sorted rows`).toBeTruthy()
      await settleFrame(page)

      const zoomState = await page.evaluate(() => (window.__ganttTest as unknown as { zoom: () => { pxPerHour: number } }).zoom())
      expect(zoomState.pxPerHour, 'zoom pinned to PX_PER_HOUR').toBe(PX_PER_HOUR)

      const schedStrXLocal = focus!.x - 6 // focusPairingSegment lands 6px into the box from its schStr x
      const durationHours = (schEndMs - schStrMs) / 3_600_000
      const schedEndXLocal = schedStrXLocal + durationHours * PX_PER_HOUR
      const shiftHours = t.delayMin / 60
      const actStrXLocal = schedStrXLocal + shiftHours * PX_PER_HOUR

      // The ghost is always drawn delayMin wide — [schedStr, actStr] — so its right edge sits
      // exactly at the solid segment's actual start, regardless of how that compares to schedEnd.
      const visibleGhostEndXLocal = actStrXLocal
      const visibleGhostSpan = visibleGhostEndXLocal - schedStrXLocal
      const beforeGhostX = Math.max(schedStrXLocal - 30, 5)

      const sampleH = 24 // SEGMENT_FLIGHT_HEIGHT (20) + margin for the ghost's dashed border
      const [hr, , hb, ha] = await sampleRegionAvg(
        page, 'pairing-canvas', schedStrXLocal, focus!.y - sampleH / 2, Math.max(visibleGhostSpan, 2), sampleH,
      )
      const [pr, , pb] = await sampleRegionAvg(page, 'pairing-canvas', beforeGhostX, focus!.y - sampleH / 2, 20, sampleH)

      expect(ha, `seg ${t.segId} ghost head region is on-canvas (has paint)`).toBeGreaterThan(0)
      const relativeSlateLean = (hb - hr) - (pb - pr)
      expect(
        relativeSlateLean,
        `seg ${t.segId} ghost head region [${schedStrXLocal.toFixed(1)},${visibleGhostEndXLocal.toFixed(1)}]@${focus!.y} leans slate (b>r) relative to the just-before-ghost baseline`,
      ).toBeGreaterThanOrEqual(1)

      // Regression proof for Ryan's 2026-08-29 report ("ET168 ... ghost bar and solid bar are
      // not connecting"): for a delayMin >= duration target, [schedEnd, actStr] is exactly the
      // span that used to be an unpainted gap under the old (scheduled-duration-wide) ghost.
      // Only ET168 exercises this; skip targets where it doesn't apply.
      if (actStrXLocal > schedEndXLocal + 1) {
        const [gr, , gb, ga] = await sampleRegionAvg(
          page,
          'pairing-canvas',
          schedEndXLocal,
          focus!.y - sampleH / 2,
          actStrXLocal - schedEndXLocal,
          sampleH,
        )
        expect(ga, `seg ${t.segId} former-gap region [${schedEndXLocal.toFixed(1)},${actStrXLocal.toFixed(1)}]@${focus!.y} is on-canvas (has paint)`).toBeGreaterThan(0)
        const gapSlateLean = (gb - gr) - (pb - pr)
        expect(
          gapSlateLean,
          `seg ${t.segId} former-gap region [${schedEndXLocal.toFixed(1)},${actStrXLocal.toFixed(1)}]@${focus!.y} now leans slate (ghost extends to touch the solid segment, no gap) relative to the just-before-ghost baseline`,
        ).toBeGreaterThanOrEqual(1)
      }

      // Data-level no-overlap proof (Ryan 2026-08-29: "check all the elements in the pairing,
      // there should be no overlapping of check in, check out, pick up, drop off, layover and
      // rest back to base"). Reconstruct each duty's boundaries in march-through order — pickup
      // → brief-end(schStr) → act-dep → act-arv → dropoff, then the gap to the next duty's
      // pickup (layover), finally the trailing rest-back-to-base puck after the last duty — and
      // assert every boundary is non-decreasing. The renderer maps time->x linearly (proven by
      // the ghost/gap assertions above), so a renderer overlap is impossible if this ordering
      // holds; this is the data-level half of the check, the §PW-Snapshot capture below is the
      // render-level half.
      const pairingSegs = segs.filter((s) => s.pairingId === t.pairingId)
      const dutyKey = (s: PairingSegmentRow) => `${s.pickupStartUtc}|${s.dropoffEndUtc}`
      const duties: PairingSegmentRow[][] = []
      const dutyBuckets = new Map<string, PairingSegmentRow[]>()
      for (const s of [...pairingSegs].sort((a, b) => new Date(a.schStrDtUtc!).getTime() - new Date(b.schStrDtUtc!).getTime())) {
        const key = dutyKey(s)
        let bucket = dutyBuckets.get(key)
        if (!bucket) {
          bucket = []
          dutyBuckets.set(key, bucket)
          duties.push(bucket)
        }
        bucket.push(s)
      }

      let prevBoundaryMs = 0
      let prevLabel = 'pairing start'
      const assertNonDecreasing = (ms: number, label: string) => {
        expect(
          ms,
          `pairing ${t.pairingId}: ${label} (${new Date(ms).toISOString()}) is before ${prevLabel} (${new Date(prevBoundaryMs).toISOString()}) — would overlap`,
        ).toBeGreaterThanOrEqual(prevBoundaryMs)
        prevBoundaryMs = ms
        prevLabel = label
      }
      let pairingRestEndMs = -Infinity
      duties.forEach((dutySegs, di) => {
        const first = dutySegs[0]
        const last = dutySegs[dutySegs.length - 1]
        if (first.pickupStartUtc) assertNonDecreasing(new Date(first.pickupStartUtc).getTime(), `duty${di + 1} pickup/check-in`)
        assertNonDecreasing(new Date(first.schStrDtUtc!).getTime(), `duty${di + 1} brief-end/sched-dep`)
        for (const s of dutySegs) {
          assertNonDecreasing(new Date(s.actStrDtUtc!).getTime(), `duty${di + 1} seg${s.segId} act-dep`)
          assertNonDecreasing(new Date(s.actEndDtUtc!).getTime(), `duty${di + 1} seg${s.segId} act-arv`)
        }
        if (last.dropoffEndUtc) assertNonDecreasing(new Date(last.dropoffEndUtc).getTime(), `duty${di + 1} dropoff/check-out`)
        if (di === duties.length - 1 && last.dropoffEndUtc) {
          const restMin = last.dutyActRestMin ?? last.dutySchRestMin ?? 0
          pairingRestEndMs = new Date(last.dropoffEndUtc).getTime() + restMin * 60_000
          assertNonDecreasing(pairingRestEndMs, 'pairing rest-back-to-base end')
        }
      })

      // §PW-Snapshot — capture the ENTIRE pairing (every leg, pickup through rest), not just the
      // delayed segment (Ryan 2026-08-29: "snapshot shall capture an entire pairing, not
      // partial" / "give a full picture"). `segs` is already hard-filtered to this one pairingId
      // (applyPairingFilter above), so it lists all of the pairing's legs. A pairing's whole duty
      // renders on the same row, so every leg's local x can be derived from a known anchor via
      // linear time-offset. The full pairing span (pickup to rest-end) can exceed the canvas's
      // own width at PX_PER_HOUR (proven by the assertions above), so the screenshot uses the
      // largest zoom (<=PX_PER_HOUR) that still fits the whole span on-canvas — the
      // pixel-sampling assertions above stay at PX_PER_HOUR, only this capture step differs.
      const canvas = page.locator('canvas[data-testid="pairing-canvas"]')
      const box = await canvas.boundingBox()
      if (box) {
        let pairingMinMs = Infinity
        let pairingMaxMs = -Infinity
        for (const s of pairingSegs) {
          for (const iso of [s.pickupStartUtc, s.schStrDtUtc, s.schEndDtUtc, s.actStrDtUtc, s.actEndDtUtc, s.dropoffEndUtc]) {
            if (!iso) continue
            const ms = new Date(iso).getTime()
            pairingMinMs = Math.min(pairingMinMs, ms)
            pairingMaxMs = Math.max(pairingMaxMs, ms)
          }
        }
        if (pairingRestEndMs > -Infinity) pairingMaxMs = Math.max(pairingMaxMs, pairingRestEndMs)
        const spanHours = (pairingMaxMs - pairingMinMs) / 3_600_000
        const margin = 40
        const screenshotZoom = Math.min(PX_PER_HOUR, Math.floor((box.width - margin) / spanHours))

        if (screenshotZoom !== PX_PER_HOUR) {
          await setZoom(page, screenshotZoom)
          await settleFrame(page)
        }
        const zFocus = screenshotZoom === PX_PER_HOUR ? focus : await focusPairingSegment(page, t.segId)
        const zSchedStrXLocal = zFocus!.x - 6
        const toLocalXms = (ms: number) => zSchedStrXLocal + (ms - schStrMs) / 3_600_000 * screenshotZoom
        const toLocalX = (iso: string) => toLocalXms(new Date(iso).getTime())

        let pairingMinX = Infinity
        let pairingMaxX = -Infinity
        for (const s of pairingSegs) {
          for (const iso of [s.pickupStartUtc, s.schStrDtUtc, s.schEndDtUtc, s.actStrDtUtc, s.actEndDtUtc, s.dropoffEndUtc]) {
            if (!iso) continue
            const x = toLocalX(iso)
            pairingMinX = Math.min(pairingMinX, x)
            pairingMaxX = Math.max(pairingMaxX, x)
          }
        }
        if (pairingRestEndMs > -Infinity) pairingMaxX = Math.max(pairingMaxX, toLocalXms(pairingRestEndMs))
        const clipStartLocal = pairingMinX - 20
        const clipEndLocal = pairingMaxX + 20
        await page.screenshot({
          path: t.screenshotPath,
          clip: {
            // Same top offset for every target (proven clear of the pane's top-left
            // filter-chip overlay); per-target height accommodates each pairing's rest-bar span.
            x: Math.max(0, box.x + clipStartLocal),
            y: Math.max(box.y, box.y + focus!.y - 25),
            width: Math.min(clipEndLocal - clipStartLocal, box.width - clipStartLocal),
            height: t.screenshotHeight,
          },
        })
        // Restore PX_PER_HOUR so the next target's zoom-pin assertion (and its own
        // pixel-sampling geometry) still sees the zoom this loop expects throughout.
        if (screenshotZoom !== PX_PER_HOUR) {
          await setZoom(page, PX_PER_HOUR)
          await settleFrame(page)
        }
      }
    }
  })
})
