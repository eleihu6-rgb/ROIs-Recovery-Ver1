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
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, setDateRange } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// §PW-Snapshot: Ver1 — first capture of the Roster-pane ghost bar.
const SNAPSHOT_PATH = path.resolve(__dirname, '../../../docs/assets/screenshots/gantt/roster-delay-ghost-bar-Ver1.png')

const ROSTER_ITEM_ID = 1328507
const CREW_ID = '1168'
const DEP_DELAY_MIN = 60
const ARV_DELAY_MIN = 56

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

    // §PW-Snapshot
    const arvShiftHours = ARV_DELAY_MIN / 60
    const actEndXLocal = schedEndXLocal + arvShiftHours * PX_PER_HOUR
    const canvas = page.locator('canvas[data-testid="roster-canvas"]')
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
