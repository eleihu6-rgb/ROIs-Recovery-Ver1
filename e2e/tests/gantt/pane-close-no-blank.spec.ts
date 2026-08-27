/**
 * Regression: closing a docked pane must not leave a large blank area in a remaining pane.
 *
 * Root cause: each pane's vertical scrollY is clamped to maxScroll only inside wheel handlers,
 * using the viewport height *at scroll time*. When a sibling pane closes, the remaining pane's
 * viewport GROWS, shrinking maxScroll — but the stored scrollY is never re-clamped. The canvas
 * then renders with a too-large scrollY, scrolling content past the end and leaving blank space
 * below the last row (the rows are pushed up out of view).
 *
 * Fix: pane-canvas re-clamps the stored scrollY whenever the viewport height / row count changes.
 *
 * These tests scroll a fully-loaded (filtered, single-page) roster to its bottom, then close
 * another pane so the roster grows, and assert the roster's scrollY no longer exceeds maxScroll
 * and no blank gap appears below the content.
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { seedGanttAuth, gotoGantt, waitGanttReady } from '../../utils/gantt-hook'

const HEADER_HEIGHT = 30
const ROW_HEIGHT = 43 // roster/flight; pairing is 42 but we only assert on the roster pane

type PaneMetric = {
  found: boolean
  scrollY: number
  totalRows: number
  viewportHeight: number
  contentHeight: number
  maxScroll: number
  scrollYExceedsMax: boolean
  blankBelowPx: number
}

const measureRoster = (page: Page): Promise<PaneMetric> =>
  page.evaluate(
    ({ HEADER_HEIGHT, ROW_HEIGHT }) => {
      const hook = (window as unknown as {
        __ganttTest?: {
          render: () => Array<{ paneId: string; totalRows: number; height: number }>
          paneScrollY: (p: string) => number
        }
      }).__ganttTest
      const stat = (hook?.render?.() ?? []).find((s) => s.paneId === 'roster-1')
      const scrollY = hook?.paneScrollY?.('roster') ?? 0
      if (!stat) return { found: false, scrollY, totalRows: 0, viewportHeight: 0, contentHeight: 0, maxScroll: 0, scrollYExceedsMax: false, blankBelowPx: 0 }
      const viewportHeight = stat.height - HEADER_HEIGHT
      const contentHeight = stat.totalRows * ROW_HEIGHT
      const maxScroll = Math.max(0, contentHeight - viewportHeight)
      const blankBelowPx = Math.max(0, viewportHeight - (contentHeight - scrollY))
      return {
        found: true,
        scrollY,
        totalRows: stat.totalRows,
        viewportHeight,
        contentHeight,
        maxScroll,
        scrollYExceedsMax: scrollY > maxScroll + 1, // +1px tolerance for rounding
        blankBelowPx: Math.round(blankBelowPx),
      }
    },
    { HEADER_HEIGHT, ROW_HEIGHT },
  )

const filterRosterToYEG = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __ganttTest?: { applyCrewFilter: (f: unknown) => Promise<void> } }).__ganttTest?.applyCrewFilter?.({ bases: ['YEG'] }),
  )

// Real wheel over the roster canvas → goes through the app's clamp to the current viewport's max.
const wheelRosterToBottom = async (page: Page) => {
  const box = await page.locator('canvas[data-testid="roster-canvas"]').boundingBox()
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 16; i++) {
    await page.mouse.wheel(0, 6000)
    await page.waitForTimeout(50)
  }
  await page.waitForTimeout(250)
}

const closePane = (page: Page, paneTestId: string) =>
  page.locator(`[data-testid="${paneTestId}"]`).locator('button[title="Close pane"]').click()

test.describe('Gantt — closing a pane leaves no blank area', () => {
  test('Live-1147 — 2 panes: close pairing → roster fills the freed space (no blank) @smoke', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page)

    await filterRosterToYEG(page)
    await page.waitForTimeout(1000) // small, fully-loaded set (90 rows, single page)
    await wheelRosterToBottom(page)

    const before = await measureRoster(page)
    expect(before.found, 'roster pane present').toBe(true)
    // Sanity: content taller than the (small) viewport, and scrolled to the bottom.
    expect(before.contentHeight, 'content taller than small viewport').toBeGreaterThan(before.viewportHeight)
    expect(before.scrollY, 'roster scrolled down').toBeGreaterThan(0)

    await closePane(page, 'pairing-pane')
    await page.waitForTimeout(800) // ResizeObserver → clamp effect → RAF re-render

    const after = await measureRoster(page)
    expect(after.contentHeight, 'content still taller than grown viewport (90 rows)').toBeGreaterThan(after.viewportHeight)
    // The bug: scrollY (clamped to old small max) exceeds the new max → blank below.
    expect(after.scrollYExceedsMax, `scrollY ${after.scrollY} must not exceed maxScroll ${after.maxScroll}`).toBe(false)
    expect(after.blankBelowPx, 'no blank gap below roster rows after close').toBe(0)
  })

  test('Live-1148 — 3 panes: close one → the scrolled roster grows with objects, no blank', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page)

    // Add a third pane (default layout has roster + pairing). Now 3 stacked rows.
    await page.getByTestId('add-pane-flight').click()
    await expect(page.locator('canvas[data-testid="flight-canvas"]')).toBeVisible()
    await page.waitForTimeout(400)

    await filterRosterToYEG(page)
    await page.waitForTimeout(1000)
    await wheelRosterToBottom(page) // roster occupies ~1/3 height; scroll it to its bottom

    const before = await measureRoster(page)
    expect(before.found).toBe(true)
    expect(before.contentHeight).toBeGreaterThan(before.viewportHeight)
    expect(before.scrollY).toBeGreaterThan(0)

    // Close the bottom (flight) pane → roster grows from ~1/3 to ~1/2 height.
    await closePane(page, 'flight-pane')
    await page.waitForTimeout(800)

    const after = await measureRoster(page)
    expect(after.viewportHeight, 'roster viewport grew after close').toBeGreaterThan(before.viewportHeight)
    expect(after.contentHeight, 'content still taller than grown viewport').toBeGreaterThan(after.viewportHeight)
    expect(after.scrollYExceedsMax, `scrollY ${after.scrollY} must not exceed maxScroll ${after.maxScroll}`).toBe(false)
    expect(after.blankBelowPx, 'no blank gap below roster rows after close').toBe(0)
  })
})
