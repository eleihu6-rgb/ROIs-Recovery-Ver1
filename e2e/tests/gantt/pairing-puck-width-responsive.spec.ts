/**
 * Pairing-pane puck text is WIDTH-RESPONSIVE and never overlaps (Ryan 2026-09-13:
 * "we made a flight puck info responsive change today, why the last two differ from first 2 /
 * expect the same behavior"). His screenshot was the PAIRING pane, pairing 152675 — the wider
 * return legs ET2683 (ADD->JNB) / ET2684 (JNB->ADD) piled "ADD 09:00 ET2683 14:00 JNB" on top
 * of the centered flt_num, while the narrower ET2681/ET2682 happened to render only the flt_num.
 *
 * Today's fix landed the measure-first degradation ladder in the Flight pane (drawFullPuck) and
 * Roster pane (drawRosterPuck) but NOT the Pairing pane, whose drawFullFlightPuck still drew the
 * three columns at fixed offsets with no collision check. This spec covers the ported ladder
 * (pairing-renderer.ts drawFullFlightPuck): the dep/arv columns are measured against the centered
 * flt_num and degrade as the puck narrows — airport+time each side → airports only → flt_num only
 * — so all four legs now behave the same (§Gantt-Unify).
 *
 * Fixture (§Real-Business-Case-Test): pairing 152675 / base ADD — a real multi-leg base loop
 * (duty 1 ADD->DXB->ADD, layover, duty 2 ADD->JNB->ADD) on 2026-09-29/30. Focus segment is
 * 470257 (ET2683 ADD->JNB, sch 06:00-11:00Z), the exact leg that overlapped in Ryan's screenshot.
 * Confirmed via direct DB query, not re-seeded here.
 *
 * Puck text is Canvas-rendered (not DOM), so per §PW-Snapshot the proof is the captured,
 * visually-inspected screenshots at descending zoom levels — one per responsive tier — plus the
 * on-canvas focus assertion that the leg actually rendered.
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, setDateRange } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const shot = (name: string): string =>
  path.resolve(__dirname, `../../../docs/assets/screenshots/gantt/${name}`)

const PAIRING_ID = 152675
const SEG_ID = 470257 // ET2683 ADD->JNB (duty 2, leg 1) — the leg that piled up in Ryan's screenshot
const DEP_ARP = 'ADD'

interface PairingSegmentRow {
  segId: number
  pairingId: number
  schStrDtUtc: string | null
  schEndDtUtc: string | null
}

const applyPairingFilter = (
  page: Page,
  filter: { depArps?: string[]; pairingIds?: string[]; coverage?: string[] },
): Promise<void> =>
  page.evaluate(
    (f) => (window.__ganttTest as unknown as { applyPairingFilter: (x: typeof f) => Promise<void> }).applyPairingFilter(f),
    filter,
  )

const setZoom = (page: Page, pxPerHour: number): Promise<void> =>
  page.evaluate((px) => (window.__ganttTest as unknown as { setZoom: (n: number) => void }).setZoom(px), pxPerHour)

const focusPairingSegment = (
  page: Page,
  segId: number,
): Promise<{ id: number; pairingId: number; x: number; y: number } | null> =>
  page.evaluate(
    (id) =>
      (window.__ganttTest as unknown as {
        focusPairingSegment: (n: number) => { id: number; pairingId: number; x: number; y: number } | null
      }).focusPairingSegment(id),
    segId,
  )

const settleFrame = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

test.describe('Pairing pane — puck width-responsive text (no overlap)', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await setDateRange(page, '2026-09-28T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
    // pairingIds hard-filters to the exact target; coverage:[] disables the default
    // open/partial-only restriction so a fully-crewed pairing still shows.
    await applyPairingFilter(page, { depArps: [DEP_ARP], pairingIds: [String(PAIRING_ID)], coverage: [] })
    await expect
      .poll(async () => (await readHook<PairingSegmentRow[]>(page, 'pairingSegments')).some((s) => s.segId === SEG_ID), {
        message: `seg ${SEG_ID} (pairing ${PAIRING_ID}) loaded`,
        timeout: 15_000,
      })
      .toBe(true)
  })

  test('Live-puck-responsive — pairing puck text degrades across zoom tiers without overlapping', async ({ page }) => {
    const canvas = page.locator('canvas[data-testid="pairing-canvas"]')
    await expect(canvas).toBeVisible()

    // FULL (wide zoom): airport + time on both sides plus centered flt_num.
    // MID (~90px): the regime the old fixed-offset code overlapped — now degrades to
    //   airports-only / flt_num-only instead of piling text on the centered flt_num.
    // MINIMAL (narrow): flt_num-only.
    // Each tier is a separate versioned capture, cropped to the focused pairing row.
    const tiers: Array<{ zoom: number; label: string }> = [
      { zoom: 90, label: 'z90-full' },
      { zoom: 18, label: 'z18-degraded' },
      { zoom: 8, label: 'z08-minimal' },
    ]

    for (const { zoom, label } of tiers) {
      await setZoom(page, zoom)
      await settleFrame(page)
      const focus = await focusPairingSegment(page, SEG_ID)
      expect(focus, `focus pairing segment ${SEG_ID} @zoom ${zoom}`).not.toBeNull()
      await settleFrame(page)

      const box = await canvas.boundingBox()
      expect(box).not.toBeNull()

      // Crop a wide band around the focused pairing row so every leg (both duties) is visible —
      // overlap, if any, shows up as text piled on itself.
      const rowY = box!.y + focus!.y
      await page.screenshot({
        path: shot(`pairing-puck-width-responsive-Ver1-${label}.png`),
        clip: {
          x: box!.x,
          y: Math.max(box!.y, rowY - 24),
          width: box!.width,
          height: 48,
        },
      })
    }
  })
})
