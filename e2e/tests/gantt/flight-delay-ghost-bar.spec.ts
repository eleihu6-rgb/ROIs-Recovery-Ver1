/**
 * Delay ghost bar — Live Flight pane draws a hatched (diagonal-stripe) gray/slate
 * outline at a flight's ORIGINAL SCHEDULED (STD/STA) position, and the solid puck
 * itself moves to the ACTUAL (ATD/ATA) position, once |actual - scheduled| exceeds
 * DELAY_GHOST_THRESHOLD_MIN (5 min) — the ghost stays BEFORE the regular puck for a
 * delay (Ryan: "if a flight delay, it should stay before the regular flight puck"),
 * and its style matches Ryan's reference screenshot: hatched gray box labeled
 * "{depTime} sched", with the solid puck's departure time flagged amber with a "→"
 * suffix (Ryan 2026-08-28: "make the ghost bar same style as i phosted").
 * gantt/src/components/gantt/renderers/flight-renderer.ts (drawDelayGhost) +
 * gantt-constants.ts DELAY_GHOST_* tokens. Test data:
 * 142-flight-schedule-seed-generator's delay-flights.mjs delayed 4 real
 * 2026-09-01 flights (2 EK, 2 ET) by 120/180/150/240 min (dep and arv
 * shifted equally, so the ghost's HEAD — the region before the solid
 * puck's actual start — is exactly delayMin minutes wide).
 *
 * Proves the ghost is an actual canvas-drawn visual, not just loaded data
 * (§Playwright-Required bans toBeVisible()/data-only proof for a visual
 * feature): averages canvas[data-testid="flight-canvas"] pixel regions via
 * getImageData (precedent: no-yellow-grid-line.spec.ts) over the "pure ghost
 * head" area — before the solid puck's actual start, where the slate hatch
 * fill/stripes/border (DELAY_GHOST_FILL_COLOR / DELAY_GHOST_HATCH_COLOR /
 * DELAY_GHOST_BORDER_COLOR, all '#94a3b8'-family, blue channel > red channel)
 * paint — and asserts a blue-over-red (b-r) lean there that is absent just
 * before the ghost's own (scheduled) start. An area average (not a single
 * pixel) is used because the diagonal stripes only cover ~20% of any given
 * row of pixels — a single-pixel sample would be flaky. Zoom is pinned high
 * (60px/hour = 1px/min) so each flight's delay-minutes head is comfortably
 * wide for sampling.
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, setDateRange } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// §PW-Snapshot: Ver1 (pre-fix, ghost trailing AFTER the solid puck) lives at
// docs/assets/screenshots/flight-edit/flight-ghost-bar.png. Ver2 was the "ghost before the
// solid puck" anchor-swap. This round restyles the ghost to the hatched gray "sched" box +
// amber "→" departure flag, so it's versioned Ver3.
const SNAPSHOT_PATH = path.resolve(__dirname, '../../../docs/assets/screenshots/gantt/flight-delay-ghost-bar-Ver3.png')
// Ver4: fix for Ryan's 2026-08-29 report — ET168 (delayMin 240 > 85min duration) previously
// left a visible gap between the ghost's end and the solid puck; the ghost now always spans
// the full delay so it touches the puck with no gap.
const SNAPSHOT_PATH_ET168 = path.resolve(__dirname, '../../../docs/assets/screenshots/gantt/flight-delay-ghost-bar-et168-Ver4.png')

interface FlightRow {
  id: number
  fltNum: string | null
  start: string | null // schDepDtUtc
  end: string | null // schArvDtUtc
  actDepDtUtc: string | null
  actArvDtUtc: string | null
  isCancelled: boolean
}

interface FocusResult {
  id: number
  x: number
  y: number
  rowIndex: number
  scrollX: number
  scrollY: number
}

// airline flt_num flt_dt dep_arp uniquely identify these — see delay-flights.mjs.
const TARGETS = [
  { id: 145505, fltNum: 'EK001', delayMin: 120 },
  { id: 145628, fltNum: 'EK202', delayMin: 180 },
  { id: 153846, fltNum: 'ET100', delayMin: 150 },
  { id: 153985, fltNum: 'ET168', delayMin: 240 },
]

const PX_PER_HOUR = 60 // 1px/min — makes every target's delay-minutes tail that many px wide.

const applyFlightFilter = (page: Page, filter: { fltNums?: string[] }): Promise<void> =>
  page.evaluate(
    (f) => (window.__ganttTest as unknown as { applyFlightFilter: (x: typeof f) => Promise<void> }).applyFlightFilter(f),
    filter,
  )

const setZoom = (page: Page, pxPerHour: number): Promise<void> =>
  page.evaluate((px) => (window.__ganttTest as unknown as { setZoom: (n: number) => void }).setZoom(px), pxPerHour)

const focusFlight = (page: Page, id: number): Promise<FocusResult | null> =>
  page.evaluate((fltId) => (window.__ganttTest as unknown as { focusFlight: (n: number) => FocusResult | null }).focusFlight(fltId), id)

// focusFlight only updates the scroll store; the canvas repaints on the next RAF tick(s). Without
// this, a sample taken immediately after focusFlight can race the repaint and read a stale frame
// (e.g. the previous target's scroll position, still on-screen from before this call) — observed
// as an intermittent "no amber anywhere" failure on later loop iterations.
const settleFrame = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

/**
 * Average [r, g, b, a] over a LOGICAL (CSS-pixel) rectangle, scaled by devicePixelRatio to
 * the backing store. The delay ghost's diagonal stripes only cover a fraction of any given
 * pixel row (5px period, 1px line), so a single-pixel sample is flaky — averaging over an
 * area integrates the fill + stripes + border into one deterministic signal.
 */
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
        r += d[i]
        g += d[i + 1]
        b += d[i + 2]
        a += d[i + 3]
      }
      return [r / n, g / n, b / n, a / n] as [number, number, number, number]
    },
    { testId, logicalX, logicalY, logicalW, logicalH },
  )

test.describe('Flight pane — delay ghost bar', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.addFlightPane()
    // 72h — EK202 (JFK->DXB) departs late enough UTC that its schedule sits on 2026-09-02
    // and its delayed arrival lands at 18:45Z that day; a 48h/08-31..09-02 window clamped
    // the scroll (and the puck) short of it. Give a full day of margin past that.
    await setDateRange(page, '2026-08-31T00:00:00.000Z', '2026-09-03T00:00:00.000Z')
    // Pin zoom LAST (relative to dateRange) — app-layout.tsx recomputes zoomMin/zoomMax (and
    // re-snaps pxPerHour if it was sitting at the previous min) whenever dateRange/viewport
    // changes, which would otherwise clobber this deterministic pin. Per-target flight-number
    // filtering happens later in the test body (see below) and does not touch zoom/scroll state.
    await setZoom(page, PX_PER_HOUR)
  })

  test('Live-1730 — delayed flights render a hatched sched-ghost head before the solid puck @smoke', async ({ page }) => {
    for (const t of TARGETS) {
      // The Flight pane filter only forwards the FIRST selected value per dimension to the
      // API (flight-store.ts "Phase 1: pass first element of each multi-select array") — so
      // a combined 4-flight-number filter would silently only ever load the first one. Filter
      // one flight number at a time, same as a real user narrowing down to inspect one flight.
      await applyFlightFilter(page, { fltNums: [t.fltNum] })
      await expect
        .poll(async () => (await readHook<FlightRow[]>(page, 'flights')).some((r) => r.id === t.id), {
          message: `${t.fltNum} (id=${t.id}) loaded`,
          timeout: 15_000,
        })
        .toBe(true)

      const rows = await readHook<FlightRow[]>(page, 'flights')
      const row = rows.find((r) => r.id === t.id)
      expect(row, `target flight id=${t.id} (${t.fltNum}) loaded`).toBeTruthy()
      expect(row!.isCancelled, `${t.fltNum} not cancelled`).toBe(false)
      expect(row!.start, `${t.fltNum} has schDepDtUtc`).toBeTruthy()
      expect(row!.end, `${t.fltNum} has schArvDtUtc`).toBeTruthy()
      expect(row!.actDepDtUtc, `${t.fltNum} has actDepDtUtc`).toBeTruthy()
      expect(row!.actArvDtUtc, `${t.fltNum} has actArvDtUtc`).toBeTruthy()

      // Data-level sanity: actual is exactly delayMin later than scheduled (both ends).
      const schDepMs = new Date(row!.start!).getTime()
      const schArvMs = new Date(row!.end!).getTime()
      const actDepMs = new Date(row!.actDepDtUtc!).getTime()
      const actArvMs = new Date(row!.actArvDtUtc!).getTime()
      expect(Math.round((actDepMs - schDepMs) / 60_000), `${t.fltNum} dep delay minutes`).toBe(t.delayMin)
      expect(Math.round((actArvMs - schArvMs) / 60_000), `${t.fltNum} arv delay minutes`).toBe(t.delayMin)

      // Visual-level proof: scroll the flight into view, compute the ghost's screen extent.
      // The ghost's width is the DELAY DURATION (schedDep -> actDep), not the scheduled flight
      // duration — its right edge always touches the solid puck's left edge, with no gap
      // between them, regardless of whether the delay is shorter or longer than the flight's
      // own scheduled duration (Ryan 2026-08-29, re ET168 240min delay on an 85min flight:
      // "the ghost bar and solid bar are not connecting, the ghost bar stands for duration of
      // delay"). So the full unobstructed ghost span is always [schedDep, actDep]:
      //   - delayMin < duration: the solid puck's start falls inside the ghost's OLD
      //     (scheduled-duration) span, but the ghost itself is only ever drawn delayMin wide,
      //     so none of it is hidden (e.g. EK001).
      //   - delayMin >= duration: previously left a gap between the ghost's end and the
      //     puck's actual start (the bug); now the ghost is drawn the full delayMin wide,
      //     reaching exactly to the puck (e.g. ET168).
      const focus = await focusFlight(page, t.id)
      expect(focus, `${t.fltNum} focusFlight found it in the loaded/sorted rows`).toBeTruthy()
      await settleFrame(page)

      const zoomState = await page.evaluate(() => (window.__ganttTest as unknown as { zoom: () => { pxPerHour: number } }).zoom())
      const pxPerHour = zoomState.pxPerHour
      expect(pxPerHour, 'zoom pinned to PX_PER_HOUR').toBe(PX_PER_HOUR)

      // focusFlight scrolls purely off schDepDtUtc (independent of which element is drawn where),
      // so this local x is always the ghost's (scheduled) start.
      const schedDepXLocal = focus!.x - 6 // focusFlight lands 6px into the puck from its schDep x
      const durationHours = (schArvMs - schDepMs) / 3_600_000
      const schedArvXLocal = schedDepXLocal + durationHours * pxPerHour
      const shiftHours = t.delayMin / 60
      const actDepXLocal = schedDepXLocal + shiftHours * pxPerHour

      // The ghost is always drawn delayMin wide — [schedDep, actDep] — so its right edge sits
      // exactly at the solid puck's actual start, regardless of how that compares to schedArv.
      const visibleGhostEndXLocal = actDepXLocal
      const visibleGhostSpan = visibleGhostEndXLocal - schedDepXLocal
      // Clamp to stay on-canvas: a ghost head landing near the viewport's left edge could push
      // schedDep-30 negative, and sampling off-canvas returns a stray/inconsistent pixel instead
      // of real background.
      const beforeGhostX = Math.max(schedDepXLocal - 30, 5)

      // Area-average the whole unobstructed ghost head span (not a single point): the hatch's
      // diagonal stripes only cover a fraction of any given pixel row, so averaging over the
      // fill + stripes + dashed border gives one deterministic slate (blue-over-red) signal
      // instead of risking a flaky single-pixel hit between stripe lines.
      const sampleH = 30 // TASK_HEIGHT — full box height so the window also picks up the ghost's top/bottom dashed border
      const [hr, , hb, ha] = await sampleRegionAvg(
        page,
        'flight-canvas',
        schedDepXLocal,
        focus!.y - sampleH / 2,
        Math.max(visibleGhostSpan, 2),
        sampleH,
      )
      const [pr, , pb] = await sampleRegionAvg(page, 'flight-canvas', beforeGhostX, focus!.y - sampleH / 2, 20, sampleH)

      expect(ha, `${t.fltNum} ghost head region is on-canvas (has paint)`).toBeGreaterThan(0)
      // Compare against the just-before-ghost region on the SAME row rather than an absolute
      // b-r threshold: the pane tints weekend date columns (BG_COLOR_WEEKEND), so the local
      // background baseline shifts row-to-row/column-to-column — an absolute threshold only
      // happened to hold for flights whose ghost landed on a non-tinted column.
      const relativeSlateLean = (hb - hr) - (pb - pr)
      expect(
        relativeSlateLean,
        `${t.fltNum} ghost head region [${schedDepXLocal.toFixed(1)},${visibleGhostEndXLocal.toFixed(1)}]@${focus!.y} leans slate (b>r) relative to the just-before-ghost baseline (${beforeGhostX},${focus!.y}) — DELAY_GHOST_FILL_COLOR/HATCH/BORDER`,
      ).toBeGreaterThanOrEqual(1)

      // Regression proof for Ryan's 2026-08-29 report ("ET168 ... ghost bar and solid bar are
      // not connecting"): for a delayMin >= duration target, [schedArv, actDep] is exactly the
      // span that used to be an unpainted gap under the old (scheduled-duration-wide) ghost. Only
      // ET168 (240min delay, 85min duration) exercises this; skip targets where it doesn't apply.
      if (actDepXLocal > schedArvXLocal + 1) {
        const [gr, , gb, ga] = await sampleRegionAvg(
          page,
          'flight-canvas',
          schedArvXLocal,
          focus!.y - sampleH / 2,
          actDepXLocal - schedArvXLocal,
          sampleH,
        )
        expect(ga, `${t.fltNum} former-gap region [${schedArvXLocal.toFixed(1)},${actDepXLocal.toFixed(1)}]@${focus!.y} is on-canvas (has paint)`).toBeGreaterThan(0)
        const gapSlateLean = (gb - gr) - (pb - pr)
        expect(
          gapSlateLean,
          `${t.fltNum} former-gap region [${schedArvXLocal.toFixed(1)},${actDepXLocal.toFixed(1)}]@${focus!.y} now leans slate (ghost extends to touch the solid puck, no gap) relative to the just-before-ghost baseline`,
        ).toBeGreaterThanOrEqual(1)
      }

      // §PW-Snapshot: capture one representative screenshot (first target) in the same run
      // that proves the pixel-level assertion above, showing the hatched gray "sched" ghost
      // sitting BEFORE the solid puck, which itself flags its amber "→" actual departure time.
      if (t.id === TARGETS[0].id) {
        const actArvXLocal = actDepXLocal + durationHours * pxPerHour
        const canvas = page.locator('canvas[data-testid="flight-canvas"]')
        const box = await canvas.boundingBox()
        if (box) {
          const clipStartLocal = Math.min(schedDepXLocal, actDepXLocal) - 20
          const clipEndLocal = Math.max(schedArvXLocal, actArvXLocal) + 20
          await page.screenshot({
            path: SNAPSHOT_PATH,
            clip: {
              x: Math.max(0, box.x + clipStartLocal),
              y: Math.max(0, box.y + focus!.y - 35),
              width: Math.min(clipEndLocal - clipStartLocal, box.width - clipStartLocal),
              height: 85,
            },
          })
        }
      }

      // §PW-Snapshot Ver4: ET168 specifically — proves the gap-closed fix visually (ghost's
      // right edge now touches the solid puck's left edge with no gap), matching Ryan's
      // reference screenshot of EK225.
      if (t.id === TARGETS[3].id) {
        const actArvXLocal = actDepXLocal + durationHours * pxPerHour
        const canvas = page.locator('canvas[data-testid="flight-canvas"]')
        const box = await canvas.boundingBox()
        if (box) {
          const clipStartLocal = Math.min(schedDepXLocal, actDepXLocal) - 20
          const clipEndLocal = Math.max(schedArvXLocal, actArvXLocal) + 20
          await page.screenshot({
            path: SNAPSHOT_PATH_ET168,
            clip: {
              x: Math.max(0, box.x + clipStartLocal),
              y: Math.max(0, box.y + focus!.y - 35),
              width: Math.min(clipEndLocal - clipStartLocal, box.width - clipStartLocal),
              height: 85,
            },
          })
        }
      }
    }
  })
})
