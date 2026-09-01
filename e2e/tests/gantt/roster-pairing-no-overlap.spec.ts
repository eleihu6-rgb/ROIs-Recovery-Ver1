/**
 * Roster pane — no-overlap proof for the 3 delay-fixture pairings, now that real crew
 * assignments exist (see roster-assign-delay-fixtures.spec.ts). Mirrors the duty-boundary
 * walk already proven on the Pairing pane (pairing-delay-ghost-bar.spec.ts) — pickup/
 * check-in → brief-end → act-dep/act-arv (per leg) → dropoff/check-out → layover to the
 * next duty's pickup → trailing rest-back-to-base — applied here to the Roster pane's OWN
 * RosterItem rows (pickup/brief/debrief/dropoff/rest are live-joined from pairing_segment
 * by roster-service.ts, so the fixes already applied there flow straight through).
 *
 * "for the quality of coding, all the case have to be validated" (Ryan 2026-08-29) — all
 * 3 fixtures covered, not just one: duty-1 delay (150390), duty-2/last-duty delay (150398),
 * and the delay>duration gap-closing case (150406).
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, setDateRange } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SNAPSHOT_150390 = path.resolve(__dirname, '../../../docs/assets/screenshots/gantt/roster-no-overlap-150390-Ver1.png')
const SNAPSHOT_150398 = path.resolve(__dirname, '../../../docs/assets/screenshots/gantt/roster-no-overlap-150398-Ver1.png')
const SNAPSHOT_150406 = path.resolve(__dirname, '../../../docs/assets/screenshots/gantt/roster-no-overlap-150406-Ver1.png')

const TARGETS = [
  { pairingId: 150390, crewId: 'K1001', label: 'duty-1 delay', screenshotPath: SNAPSHOT_150390, screenshotHeight: 60 },
  { pairingId: 150398, crewId: 'K1002', label: 'duty-2 (last duty) delay', screenshotPath: SNAPSHOT_150398, screenshotHeight: 60 },
  { pairingId: 150406, crewId: 'T2001', label: 'delay>duration gap-closing', screenshotPath: SNAPSHOT_150406, screenshotHeight: 95 },
]

const PX_PER_HOUR = 60 // 1px/min

interface RosterItemRow {
  id: number
  crewId: string
  pairingId: number | null
  dutySeq: number | null
  segSeq: number | null
  start: string | null
  end: string | null
  actStrDtUtc: string | null
  actEndDtUtc: string | null
  pickupStartUtc: string | null
  pickupEndUtc: string | null
  briefStartUtc: string | null
  briefEndUtc: string | null
  debriefStartUtc: string | null
  debriefEndUtc: string | null
  dropoffStartUtc: string | null
  dropoffEndUtc: string | null
  dutySchRestMin: number | null
  dutyActRestMin: number | null
}

const applyCrewFilter = (page: Page, filter: { crewIds?: string[] }): Promise<void> =>
  page.evaluate(
    (f) => (window.__ganttTest as unknown as { applyCrewFilter: (x: typeof f) => Promise<void> }).applyCrewFilter(f),
    filter,
  )

const setZoom = (page: Page, pxPerHour: number): Promise<void> =>
  page.evaluate((px) => (window.__ganttTest as unknown as { setZoom: (n: number) => void }).setZoom(px), pxPerHour)

const setScrollX = (page: Page, x: number): Promise<void> =>
  page.evaluate((v) => (window.__ganttTest as unknown as { setScrollX: (n: number) => void }).setScrollX(v), x)

const RANGE_START_MS = Date.parse('2026-08-30T00:00:00.000Z') // matches setDateRange() in beforeEach below

// Scrolls the Roster canvas so `ms` lands ~150px from the left edge, then returns its local x —
// a duty's debrief window can be hours (even a full layover) away from its own departure, so
// reusing a single departure-anchored focus point (focusRosterItem) can push the sample point
// off-canvas at this zoom. Scrolling directly to the timestamp being sampled avoids that.
const scrollToMs = async (page: Page, ms: number, pxPerHour: number): Promise<number> => {
  const contentX = ((ms - RANGE_START_MS) / 3_600_000) * pxPerHour
  const scrollX = Math.max(0, Math.round(contentX - 150))
  await setScrollX(page, scrollX)
  await settleFrame(page)
  return contentX - scrollX
}

const focusRosterItem = (
  page: Page,
  itemId: number,
): Promise<{ id: number; pairingId: number | null; crewId: string; x: number; y: number } | null> =>
  page.evaluate(
    (id) =>
      (window.__ganttTest as unknown as {
        focusRosterItem: (n: number) => { id: number; pairingId: number | null; crewId: string; x: number; y: number } | null
      }).focusRosterItem(id),
    itemId,
  )

const settleFrame = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

// Pixel-position proof (not just data-level): reads the CANVAS's own painted pixels via
// getImageData, the same technique roster-delay-ghost-bar.spec.ts uses. A data-level check on
// RosterItem fields alone cannot catch a renderer bug where the canvas independently recomputes
// a bar's x-position from the wrong timestamp — only sampling the actual painted pixel can.
// See flight-delay-ghost-bar.spec.ts's header doc for the area-average rationale.
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

// gantt-constants.ts SEGMENT_DEBRIEF_COLOR = '#94a3b8' (opaque slate). Distance from this in
// RGB space is how we tell "debrief bar painted here" from "flight puck blue" or "background".
const DEBRIEF_RGB = [148, 163, 184] as const
const colorDistance = (r: number, g: number, b: number): number =>
  Math.hypot(r - DEBRIEF_RGB[0], g - DEBRIEF_RGB[1], b - DEBRIEF_RGB[2])

test.describe('Roster pane — pairing no-overlap (post-assignment)', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    test.setTimeout(150_000)
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    // Covers all 3 fixtures: 150398 starts 2026-08-31, 150390/150406 end 2026-09-02.
    await setDateRange(page, '2026-08-30T00:00:00.000Z', '2026-09-04T00:00:00.000Z')
    await setZoom(page, PX_PER_HOUR)
  })

  for (const t of TARGETS) {
    test(`Roster-NoOverlap — pairing ${t.pairingId} (${t.label}) on crew ${t.crewId} has no overlapping duty elements @smoke`, async ({ page }) => {
      await applyCrewFilter(page, { crewIds: [t.crewId] })

      await expect
        .poll(
          async () => (await readHook<RosterItemRow[]>(page, 'roster')).some((r) => r.pairingId === t.pairingId),
          { message: `pairing ${t.pairingId} legs loaded on crew ${t.crewId}'s roster row`, timeout: 15_000 },
        )
        .toBe(true)

      const items = await readHook<RosterItemRow[]>(page, 'roster')
      const legs = items.filter((r) => r.pairingId === t.pairingId)
      expect(legs.length, `pairing ${t.pairingId} must expose at least one roster leg`).toBeGreaterThan(0)
      for (const leg of legs) {
        expect(leg.start, `leg ${leg.id} has sch start`).toBeTruthy()
        expect(leg.end, `leg ${leg.id} has sch end`).toBeTruthy()
        expect(leg.actStrDtUtc, `leg ${leg.id} has act start`).toBeTruthy()
        expect(leg.actEndDtUtc, `leg ${leg.id} has act end`).toBeTruthy()
      }

      const firstLeg = [...legs].sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime())[0]
      const focus = await focusRosterItem(page, firstLeg.id)
      expect(focus, `focusRosterItem found leg ${firstLeg.id}`).toBeTruthy()
      await settleFrame(page)

      const zoomState = await page.evaluate(() => (window.__ganttTest as unknown as { zoom: () => { pxPerHour: number } }).zoom())
      expect(zoomState.pxPerHour, 'zoom pinned to PX_PER_HOUR').toBe(PX_PER_HOUR)

      // Data-level no-overlap proof — same duty-boundary march-through as the Pairing pane
      // (pairing-delay-ghost-bar.spec.ts), but sourced from the Roster pane's OWN live-joined
      // RosterItem rows, proving the join carries the already-fixed pairing_segment values
      // through correctly for a real assigned crew.
      const dutyKey = (r: RosterItemRow) => `${r.pickupStartUtc}|${r.dropoffEndUtc}`
      const duties: RosterItemRow[][] = []
      const dutyBuckets = new Map<string, RosterItemRow[]>()
      for (const r of [...legs].sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime())) {
        const key = dutyKey(r)
        let bucket = dutyBuckets.get(key)
        if (!bucket) {
          bucket = []
          dutyBuckets.set(key, bucket)
          duties.push(bucket)
        }
        bucket.push(r)
      }

      let prevBoundaryMs = 0
      let prevLabel = 'pairing start'
      const assertNonDecreasing = (ms: number, label: string) => {
        expect(
          ms,
          `pairing ${t.pairingId} (roster, crew ${t.crewId}): ${label} (${new Date(ms).toISOString()}) is before ${prevLabel} (${new Date(prevBoundaryMs).toISOString()}) — would overlap`,
        ).toBeGreaterThanOrEqual(prevBoundaryMs)
        prevBoundaryMs = ms
        prevLabel = label
      }
      let pairingRestEndMs = -Infinity
      duties.forEach((dutyLegs, di) => {
        const first = dutyLegs[0]
        const last = dutyLegs[dutyLegs.length - 1]
        if (first.pickupStartUtc) assertNonDecreasing(new Date(first.pickupStartUtc).getTime(), `duty${di + 1} pickup/check-in`)
        assertNonDecreasing(new Date(first.start!).getTime(), `duty${di + 1} brief-end/sched-dep`)
        for (const leg of dutyLegs) {
          assertNonDecreasing(new Date(leg.actStrDtUtc!).getTime(), `duty${di + 1} leg${leg.id} act-dep`)
          assertNonDecreasing(new Date(leg.actEndDtUtc!).getTime(), `duty${di + 1} leg${leg.id} act-arv`)
        }
        if (last.dropoffEndUtc) assertNonDecreasing(new Date(last.dropoffEndUtc).getTime(), `duty${di + 1} dropoff/check-out`)
        if (di === duties.length - 1 && last.dropoffEndUtc) {
          const restMin = last.dutyActRestMin ?? last.dutySchRestMin ?? 0
          pairingRestEndMs = new Date(last.dropoffEndUtc).getTime() + restMin * 60_000
          assertNonDecreasing(pairingRestEndMs, 'pairing rest-back-to-base end')
        }
      })

      // Render-level regression for the "debrief bar anchored to scheduled arrival instead of
      // actual arrival" bug (found 2026-08-29 via visual review of this exact screenshot —
      // roster-no-overlap-150398-Ver1.png showed the debrief/REST slate bleeding into the tail
      // of a delayed EK202 puck). Data-level assertNonDecreasing above cannot catch this: the
      // underlying pairing_segment/RosterItem fields were always correct — the bug was the
      // canvas independently recomputing the bar's left edge from schEndDtUtc instead of the
      // already-correct debriefStartUtc. Only sampling actual painted pixels proves it's fixed.
      // A pairing's duties can span days apart, and a duty's own debrief window can be hours
      // away from its own departure (e.g. across a long layover/rest). Reusing a single
      // departure-anchored focus point (focusRosterItem) for the whole duty can push the actual
      // sample point off-canvas at this zoom. Instead, scroll directly (scrollToMs) to each
      // sample timestamp right before sampling it — the row's y (barY) is scroll-independent so
      // one focusRosterItem call per duty is enough to get it.
      for (const dutyLegs of duties) {
        const last = dutyLegs[dutyLegs.length - 1]
        if (!last.end || !last.actEndDtUtc || !last.start) continue
        const schEndMs = new Date(last.end).getTime()
        const actEndMs = new Date(last.actEndDtUtc).getTime()
        if (actEndMs <= schEndMs) continue // arrival not delayed — nothing to regress-test on this duty

        const dutyFocus = await focusRosterItem(page, last.id)
        expect(dutyFocus, `focusRosterItem found duty-ending leg ${last.id}`).toBeTruthy()
        const barY = dutyFocus!.y // SEGMENT_FLIGHT_HEIGHT=20 / SEGMENT_BAR_HEIGHT=10 → bar band == [centerY, centerY+10] == [focus.y, focus.y+10]

        // Sample strictly between the (earlier) scheduled arrival and the actual arrival — the
        // buggy debrief bar painted slate here, overwriting the tail of the still-in-progress
        // delayed puck; fixed, nothing should paint here until the plane actually lands.
        const gapMidMs = (schEndMs + actEndMs) / 2
        const gapX = await scrollToMs(page, gapMidMs, PX_PER_HOUR)
        const [gr, gg, gb] = await sampleRegionAvg(page, 'roster-canvas', gapX - 2, barY + 2, 4, 6)
        expect(
          colorDistance(gr, gg, gb),
          `pairing ${t.pairingId}: debrief bar must not paint before actual arrival (${last.actEndDtUtc}) — sampled rgb(${gr.toFixed(0)},${gg.toFixed(0)},${gb.toFixed(0)}) at the mid-gap pixel looks like debrief slate, meaning it is still anchored to the scheduled arrival (${last.end})`,
        ).toBeGreaterThan(30)

        // Positive control: the debrief bar DOES render, spanning [debriefStartUtc, debriefEndUtc]
        // — the exact field the fixed renderer anchors on. NOT [actEnd, debriefEnd]: some fixtures
        // (e.g. 150390) have a real gap between actual arrival and debriefStartUtc in the source
        // data itself (unrelated to the delay), so assuming debrief starts right at arrival is wrong.
        if (last.debriefStartUtc && last.debriefEndUtc) {
          const debriefMidMs = (new Date(last.debriefStartUtc).getTime() + new Date(last.debriefEndUtc).getTime()) / 2
          const debriefX = await scrollToMs(page, debriefMidMs, PX_PER_HOUR)
          const [dr, dg, db] = await sampleRegionAvg(page, 'roster-canvas', debriefX - 2, barY + 2, 4, 6)
          expect(
            colorDistance(dr, dg, db),
            `pairing ${t.pairingId}: debrief bar must render slate-colored across [${last.debriefStartUtc}, ${last.debriefEndUtc}]`,
          ).toBeLessThan(40)
        }
      }

      // Restore the pairing-start focus/scroll for the zoom-fit §PW-Snapshot screenshot below.
      await focusRosterItem(page, firstLeg.id)
      await settleFrame(page)

      // §PW-Snapshot — render-level proof: whole pairing on the crew's roster row, zoom-fit
      // to canvas width the same way the Pairing-pane spec does.
      const canvas = page.locator('canvas[data-testid="roster-canvas"]')
      const box = await canvas.boundingBox()
      if (box) {
        let pairingMinMs = Infinity
        let pairingMaxMs = -Infinity
        for (const leg of legs) {
          for (const iso of [leg.pickupStartUtc, leg.start, leg.end, leg.actStrDtUtc, leg.actEndDtUtc, leg.dropoffEndUtc]) {
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
        const zFocus = screenshotZoom === PX_PER_HOUR ? focus : await focusRosterItem(page, firstLeg.id)
        const zSchedStrXLocal = zFocus!.x - 6
        const firstLegSchStrMs = new Date(firstLeg.start!).getTime()
        const toLocalXms = (ms: number) => zSchedStrXLocal + (ms - firstLegSchStrMs) / 3_600_000 * screenshotZoom
        const toLocalX = (iso: string) => toLocalXms(new Date(iso).getTime())

        let pairingMinX = Infinity
        let pairingMaxX = -Infinity
        for (const leg of legs) {
          for (const iso of [leg.pickupStartUtc, leg.start, leg.end, leg.actStrDtUtc, leg.actEndDtUtc, leg.dropoffEndUtc]) {
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
            x: Math.max(0, box.x + clipStartLocal),
            y: Math.max(box.y, box.y + zFocus!.y - 25),
            width: Math.min(clipEndLocal - clipStartLocal, box.width - clipStartLocal),
            height: t.screenshotHeight,
          },
        })
        if (screenshotZoom !== PX_PER_HOUR) {
          await setZoom(page, PX_PER_HOUR)
          await settleFrame(page)
        }
      }
    })
  }
})
