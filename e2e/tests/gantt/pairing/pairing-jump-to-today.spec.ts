import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../../pages/gantt/gantt-dashboard-page'
import { readHook, seedGanttAuth } from '../../../utils/gantt-hook'

interface PairingProbe {
  segId: number
  pairingId: number
  fltId: number | null
  schStrDtUtc: string
  rowIndex: number
  scrollX: number
  scrollY: number
  pxPerHour: number
  rangeStartIso: string
  headerHeight: number
  rowHeight: number
}

/**
 * Pairing Pane — "Jump to this day's pairing" right-click menu action.
 *
 * Right-clicking a Timeline pixel resolves that X to a local day; the menu item
 * (a) finds a pairing starting at exactly that local midnight, or
 * (b) falls back to the latest-starting pairing of an earlier day, or
 * (c) is omitted from the menu entirely when nothing matches in 365 days.
 *
 * The action MUST only touch the vertical scrollbar — no horizontal scroll,
 * no zoom, no date range, no row selection.
 */

/** Recompute the segment's canvas (x, y) from the probe's raw values. */
const probeCanvasXY = (probe: PairingProbe): { x: number; y: number } => {
  const iso = probe.schStrDtUtc
  const ms = new Date(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`).getTime()
  const rangeStartMs = new Date(probe.rangeStartIso).getTime()
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe.pxPerHour - probe.scrollX
  const rowTop = probe.headerHeight + probe.rowIndex * probe.rowHeight - probe.scrollY
  return { x: x + 6, y: rowTop + Math.floor(probe.rowHeight / 2) }
}

const paneScrollY = (page: Page, prefix: string): Promise<number> =>
  page.evaluate((p) => (window.__ganttTest as unknown as { paneScrollY: (s: string) => number }).paneScrollY(p), prefix)

/**
 * Find a probe whose puck is inside the default visible canvas window
 * (no scrolling needed). Iterates `pairingProbes(2000)` — that scan
 * skips rows whose first segment's segX is < 20 or > 2000, so any probe
 * it returns has a clickable segment within the timeline.
 *
 * We then filter to rows whose rowY is inside the canvas height — i.e. the
 * pairings shown in the top ~10 rows at default scrollY=0.
 */
const findAnyProbe = async (
  page: Page,
  box: { width: number; height: number },
): Promise<PairingProbe | null> => {
  const all = await page.evaluate(() => {
    const g = window.__ganttTest as unknown as { pairingVisibleSegments: (n?: number) => PairingProbe[] }
    return g.pairingVisibleSegments(2000)
  })
  // Prefer probes whose canvas-local segX sits WELL inside the canvas (so the
  // right-click is guaranteed to land inside the puck body, not its border).
  // Also avoids the bottom-right "offscreen jump" hint overlay that intercepts
  // clicks near the right edge.
  const candidates = all.filter((p) => {
    const ms = new Date(
      p.schStrDtUtc.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(p.schStrDtUtc) ? p.schStrDtUtc : `${p.schStrDtUtc}Z`,
    ).getTime()
    const rs = new Date(p.rangeStartIso).getTime()
    const segX = (Math.trunc((ms - rs) / 60_000) / 60) * p.pxPerHour - p.scrollX
    return segX >= 30 && segX <= box.width - 80
  })
  return candidates[0] ?? null
}

const paneScrollYSetter = (page: Page, paneTypePrefix: string, dy: number): Promise<string[]> =>
  page.evaluate(
    ({ prefix, delta }) => {
      const api = window.__ganttTest as unknown as { scrollPaneVertically: (p: string, d: number) => string[] }
      return api.scrollPaneVertically(prefix, delta)
    },
    { prefix: paneTypePrefix, delta: dy },
  )

test.describe('Pairing Pane "Jump to this day\'s pairing" menu', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    // Gantt auth lives in per-tab sessionStorage — Playwright storageState can't
    // persist it, so re-inject on each test.
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => {
      const all = await readHook<Array<{ id: number }>>(page, 'pairings')
      return all.length
    }, { message: 'pairings loaded', timeout: 30_000 }).toBeGreaterThan(0)
  })

  test('right-click shows the menu item; click scrolls vertically only and leaves horizontal scroll alone', async ({ page }) => {
    const canvas = dashboard.pairingCanvas
    const canvasBox = await canvas.boundingBox()
    test.skip(!canvasBox, 'pairing canvas not visible')

    // Pick the first probe returned by the test-harness scan (one probe per
    // pairing row whose first visible segment falls in the timeline). The
    // helper intentionally skips rows whose earliest segment is off-canvas.
    const initial = await findAnyProbe(page, canvasBox)
    test.skip(!initial, 'no pairing probe with a visible puck')

    // Scroll the pane vertically so the probe's row sits in the middle of the
    // canvas. The horizontal scroll is left untouched — the test asserts it's
    // preserved end-to-end.
    const rowCenter = initial.headerHeight + initial.rowIndex * initial.rowHeight + Math.floor(initial.rowHeight / 2)
    const targetScrollY = Math.max(0, rowCenter - Math.floor(canvasBox.height / 2))
    const currentScrollY = await paneScrollY(page, 'pairing')
    const delta = targetScrollY - currentScrollY
    if (Math.abs(delta) > 2) {
      await paneScrollYSetter(page, 'pairing', delta)
      await page.waitForTimeout(200)
    }

    // Re-fetch the same probe (by pairingId + segId) so the post-scroll scrollY is
    // reflected in subsequent xy math. pairingVisibleSegments returns ALL visible
    // segments per row, so the original segId is guaranteed to be there.
    const probe = (await page.evaluate(({ pairingId, segId }) => {
      const g = window.__ganttTest as unknown as { pairingVisibleSegments: (n?: number) => PairingProbe[] }
      const arr = g.pairingVisibleSegments(2000)
      return arr.find((p) => p.pairingId === pairingId && p.segId === segId) ?? null
    }, { pairingId: initial.pairingId, segId: initial.segId })) ?? initial

    const { x, y } = probeCanvasXY(probe)
    test.skip(
      x < 0 || x > canvasBox.width - 4 || y < 0 || y > canvasBox.height - 4,
      `puck outside visible canvas (x=${x.toFixed(0)} y=${y.toFixed(0)} wh=${canvasBox.width}x${canvasBox.height})`,
    )

    // Snapshot horizontal scroll BEFORE the click — proves "vertical only".
    const beforeScrollX = probe.scrollX

    // Right-click opens the Live pairing context menu. The menu's root div carries
    // data-roster-source=""; that selector uniquely matches the Live menu.
    await canvas.click({ position: { x, y }, button: 'right' })
    const menu = page.locator('[data-roster-source]')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    const jumpItem = menu.getByRole('button', { name: /Jump to this day's pairing/i })
    await expect(jumpItem).toBeVisible({ timeout: 5_000 })

    // Snapshot vertical scroll BEFORE the click.
    const beforeScrollY = await paneScrollY(page, 'pairing')

    await jumpItem.click()

    // Menu must close after the click.
    await expect(menu).toBeHidden({ timeout: 5_000 })

    // 1. Vertical scroll is now whatever the right-click handler pre-computed (clamped).
    const afterScrollY = await paneScrollY(page, 'pairing')
    expect(Number.isFinite(afterScrollY)).toBe(true)
    expect(afterScrollY).toBeGreaterThanOrEqual(0)

    // 2. The scrollY must have actually moved when a target pairing was found.
    //    The right-click always finds at least a same-day pairing or an earlier-day
    //    fallback. The handler targets a row near the right-click X; the post-click
    //    scrollY equals max(0, targetRowIndex * ROW_HEIGHT - HEADER_HEIGHT) clamped
    //    to the visible canvas.
    expect(afterScrollY).not.toBe(beforeScrollY)

    // 3. Horizontal scroll MUST be unchanged (vertical-only jump).
    const afterZoom = await readHook<{ scrollX: number }>(page, 'zoom')
    expect(afterZoom.scrollX).toBe(beforeScrollX)

    // 4. The pane is still visible (no other state was touched).
    await expect(canvas).toBeVisible()
  })
})