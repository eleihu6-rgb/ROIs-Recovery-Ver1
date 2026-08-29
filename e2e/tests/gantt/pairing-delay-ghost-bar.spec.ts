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
 * Test data: pairing_id=150390 / seg_id=465248 (flight EK001, DXB->LHR, 2026-09-01) — the same
 * flight the Flight-pane test delays — whose pairing_segment already carries the matching
 * +120min act_str/act_end (confirmed via direct DB query, not re-seeded here).
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, setDateRange } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// §PW-Snapshot: Ver1 — first capture of the Pairing-pane ghost bar.
const SNAPSHOT_PATH = path.resolve(__dirname, '../../../docs/assets/screenshots/gantt/pairing-delay-ghost-bar-Ver1.png')

const PAIRING_ID = 150390
const SEG_ID = 465248
const DELAY_MIN = 120

const PX_PER_HOUR = 60 // 1px/min

interface PairingSegmentRow {
  segId: number
  pairingId: number
  schStrDtUtc: string | null
  schEndDtUtc: string | null
  actStrDtUtc: string | null
  actEndDtUtc: string | null
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
    await setDateRange(page, '2026-08-31T00:00:00.000Z', '2026-09-03T00:00:00.000Z')
    await setZoom(page, PX_PER_HOUR)
  })

  test('Live-1731 — a delayed flight in a pairing renders a hatched sched-ghost head before the solid segment @smoke', async ({ page }) => {
    // depArps narrows the server-side query (EK001 departs DXB); pairingIds is the pairing
    // pane's client-side hard filter down to the exact target; coverage:[] disables the
    // default open/partial-only restriction so a fully-open pairing still shows.
    await applyPairingFilter(page, { depArps: ['DXB'], pairingIds: [String(PAIRING_ID)], coverage: [] })

    await expect
      .poll(async () => (await readHook<PairingSegmentRow[]>(page, 'pairingSegments')).some((s) => s.segId === SEG_ID), {
        message: `seg ${SEG_ID} (pairing ${PAIRING_ID}) loaded`,
        timeout: 15_000,
      })
      .toBe(true)

    const segs = await readHook<PairingSegmentRow[]>(page, 'pairingSegments')
    const seg = segs.find((s) => s.segId === SEG_ID)
    expect(seg, `target segment ${SEG_ID} loaded`).toBeTruthy()
    expect(seg!.schStrDtUtc, 'has schStrDtUtc').toBeTruthy()
    expect(seg!.schEndDtUtc, 'has schEndDtUtc').toBeTruthy()
    expect(seg!.actStrDtUtc, 'has actStrDtUtc').toBeTruthy()
    expect(seg!.actEndDtUtc, 'has actEndDtUtc').toBeTruthy()

    const schStrMs = new Date(seg!.schStrDtUtc!).getTime()
    const schEndMs = new Date(seg!.schEndDtUtc!).getTime()
    const actStrMs = new Date(seg!.actStrDtUtc!).getTime()
    const actEndMs = new Date(seg!.actEndDtUtc!).getTime()
    expect(Math.round((actStrMs - schStrMs) / 60_000), 'dep delay minutes').toBe(DELAY_MIN)
    expect(Math.round((actEndMs - schEndMs) / 60_000), 'arv delay minutes').toBe(DELAY_MIN)

    const focus = await focusPairingSegment(page, SEG_ID)
    expect(focus, 'focusPairingSegment found the segment in the loaded/sorted rows').toBeTruthy()
    await settleFrame(page)

    const zoomState = await page.evaluate(() => (window.__ganttTest as unknown as { zoom: () => { pxPerHour: number } }).zoom())
    expect(zoomState.pxPerHour, 'zoom pinned to PX_PER_HOUR').toBe(PX_PER_HOUR)

    const schedStrXLocal = focus!.x - 6 // focusPairingSegment lands 6px into the box from its schStr x
    const durationHours = (schEndMs - schStrMs) / 3_600_000
    const schedEndXLocal = schedStrXLocal + durationHours * PX_PER_HOUR
    const shiftHours = DELAY_MIN / 60
    const actStrXLocal = schedStrXLocal + shiftHours * PX_PER_HOUR

    const visibleGhostEndXLocal = Math.min(schedEndXLocal, actStrXLocal)
    const visibleGhostSpan = visibleGhostEndXLocal - schedStrXLocal
    const beforeGhostX = Math.max(schedStrXLocal - 30, 5)

    const sampleH = 24 // SEGMENT_FLIGHT_HEIGHT (20) + margin for the ghost's dashed border
    const [hr, , hb, ha] = await sampleRegionAvg(
      page, 'pairing-canvas', schedStrXLocal, focus!.y - sampleH / 2, Math.max(visibleGhostSpan, 2), sampleH,
    )
    const [pr, , pb] = await sampleRegionAvg(page, 'pairing-canvas', beforeGhostX, focus!.y - sampleH / 2, 20, sampleH)

    expect(ha, 'ghost head region is on-canvas (has paint)').toBeGreaterThan(0)
    const relativeSlateLean = (hb - hr) - (pb - pr)
    expect(
      relativeSlateLean,
      `ghost head region [${schedStrXLocal.toFixed(1)},${visibleGhostEndXLocal.toFixed(1)}]@${focus!.y} leans slate (b>r) relative to the just-before-ghost baseline`,
    ).toBeGreaterThanOrEqual(1)

    // §PW-Snapshot
    const actEndXLocal = actStrXLocal + durationHours * PX_PER_HOUR
    const canvas = page.locator('canvas[data-testid="pairing-canvas"]')
    const box = await canvas.boundingBox()
    if (box) {
      const clipStartLocal = Math.min(schedStrXLocal, actStrXLocal) - 20
      const clipEndLocal = Math.max(schedEndXLocal, actEndXLocal) + 20
      await page.screenshot({
        path: SNAPSHOT_PATH,
        clip: {
          x: Math.max(0, box.x + clipStartLocal),
          y: Math.max(0, box.y + focus!.y - 25),
          width: Math.min(clipEndLocal - clipStartLocal, box.width - clipStartLocal),
          height: 60,
        },
      })
    }
  })
})
