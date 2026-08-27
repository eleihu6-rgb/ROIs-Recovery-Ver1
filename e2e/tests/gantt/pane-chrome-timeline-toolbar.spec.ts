/**
 * Pane chrome restructure — timeline in the title row, chips + actions in the old band.
 *
 *  1. The shared TimeAxis now renders inside the pane title row (the "Roster" title row),
 *     horizontally aligned with the gantt canvas below (same left edge).
 *  2. Timeline interactions still work after the move: drag-right zooms in
 *     (pxPerHour increases), double-click resets to zoomMin. Truth via __ganttTest.zoom().
 *  3. The pane action cluster (REPLACE, Sort, Column settings) moved DOWN into the
 *     30px band where the timeline used to be (the condition strip overlay), and is
 *     no longer in the title row.
 *  4. Filter chips render inside that band too (not in a separate row that pushes
 *     content down), and the strip overlay does not block the left column headers
 *     (pointer-events: none on the pass-through region).
 */
import { test, expect, type Locator } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

const HEADER_BAND_HEIGHT = 30 // gantt-constants HEADER_HEIGHT

const box = async (loc: Locator) => {
  const b = await loc.boundingBox()
  expect(b, 'element must be laid out').not.toBeNull()
  return b!
}

test.describe('Pane chrome — timeline in toolbar row', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
    await expect.poll(async () => (await page.evaluate(() => window.__ganttTest!.rosterPanel())).length)
      .toBeGreaterThan(0)
  })

  test('Live-1143 — timeline renders in the Roster title row, aligned with the canvas @smoke', async ({ page }) => {
    const rosterPane = dashboard.rosterPane
    const titleSection = rosterPane.getByTestId('pane-title-section').first()
    const timeAxis = rosterPane.getByTestId('pane-time-axis').first()
    const canvas = dashboard.rosterCanvas

    // Title row shows the pane name; the time axis lives in the SAME row.
    // (The main roster pane title is "Roster" — the redundant "Main" suffix was dropped.)
    await expect(titleSection).toContainText('Roster')
    const titleBox = await box(titleSection)
    const axisBox = await box(timeAxis)
    const canvasBox = await box(canvas)

    // Same vertical band as the title (the toolbar row), i.e. the axis moved UP.
    expect(Math.abs(axisBox.y - titleBox.y)).toBeLessThanOrEqual(2)
    expect(axisBox.height).toBeGreaterThanOrEqual(28)

    // Left edge aligned with the gantt canvas below (virtual line + splitter).
    expect(Math.abs(axisBox.x - canvasBox.x)).toBeLessThanOrEqual(2)
    // And it spans the full canvas width.
    expect(Math.abs((axisBox.x + axisBox.width) - (canvasBox.x + canvasBox.width))).toBeLessThanOrEqual(2)
  })

  test('Live-1144 — drag-zoom and double-click reset still work on the relocated timeline', async ({ page }) => {
    const timeAxis = dashboard.rosterPane.getByTestId('pane-time-axis').first()
    const axisBox = await box(timeAxis)

    const before = await page.evaluate(() => window.__ganttTest!.zoom())

    // Drag right across the bottom half of the axis (bottom half = no month labels,
    // so this is a range-selection zoom, not a month-click).
    const y = axisBox.y + axisBox.height * 0.75
    await page.mouse.move(axisBox.x + 60, y)
    await page.mouse.down()
    await page.mouse.move(axisBox.x + 360, y, { steps: 8 })
    await page.mouse.up()

    // Zoomed in: pxPerHour strictly increased.
    await expect
      .poll(async () => (await page.evaluate(() => window.__ganttTest!.zoom())).pxPerHour)
      .toBeGreaterThan(before.pxPerHour)

    // Double-click resets to zoomMin / scroll 0.
    await page.mouse.dblclick(axisBox.x + 200, y)
    await expect
      .poll(async () => {
        const z = await page.evaluate(() => window.__ganttTest!.zoom())
        return Math.abs(z.pxPerHour - z.zoomMin)
      })
      .toBeLessThan(0.01)
  })

  test('Live-1145 — REPLACE / Sort / Column settings moved down into the old timeline band', async ({ page }) => {
    const rosterPane = dashboard.rosterPane
    const titleSection = rosterPane.getByTestId('pane-title-section').first()
    const strip = rosterPane.getByTestId('pane-condition-strip').first()

    const titleBox = await box(titleSection)
    const stripBox = await box(strip)

    // The strip sits directly BELOW the title row and has the old timeline band height.
    expect(stripBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 2)
    expect(Math.round(stripBox.height)).toBe(HEADER_BAND_HEIGHT)

    // Action cluster lives inside the strip band (y within strip), not in the title row.
    for (const title of ['Sort', 'Column settings', 'Quick filter']) {
      const btn = strip.getByTitle(title, { exact: true }).first()
      await expect(btn).toBeVisible()
      const b = await box(btn)
      expect(b.y, `${title} button inside the band`).toBeGreaterThanOrEqual(stripBox.y - 1)
      expect(b.y + b.height, `${title} button inside the band`).toBeLessThanOrEqual(stripBox.y + stripBox.height + 1)
    }
    const replaceBtn = strip.getByText('REPLACE', { exact: true }).first()
    await expect(replaceBtn).toBeVisible()

    // The title row no longer hosts any action buttons.
    await expect(titleSection.getByRole('button')).toHaveCount(0)
    await expect(titleSection.getByText('REPLACE')).toHaveCount(0)

    // The strip is indented to the crew-list/canvas boundary…
    const padLeft = await strip.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))
    expect(padLeft).toBeGreaterThan(100)
    // …and its outer overlay is click-through so the column headers stay interactive.
    const pe = await strip.evaluate((el) => getComputedStyle(el).pointerEvents)
    expect(pe).toBe('none')
  })

  test('Live-1146 — filter chips render inside the band (no extra chips row pushed in)', async ({ page }) => {
    const rosterPane = dashboard.rosterPane
    const strip = rosterPane.getByTestId('pane-condition-strip').first()
    const canvas = dashboard.rosterCanvas

    // Canvas top BEFORE applying a filter.
    const canvasTopBefore = (await box(canvas)).y

    // Apply a base filter through the real pipeline.
    await page.evaluate(() => window.__ganttTest!.applyCrewFilter({ bases: ['YVR'] }))
    const chip = page.getByTestId('pane-filter-chip').filter({ hasText: 'YVR' }).first()
    await expect(chip).toBeVisible()

    // Chip is inside the band overlay (strip y-range)…
    const stripBox = await box(strip)
    const chipBox = await box(chip)
    expect(chipBox.y).toBeGreaterThanOrEqual(stripBox.y - 1)
    expect(chipBox.y + chipBox.height).toBeLessThanOrEqual(stripBox.y + stripBox.height + 1)

    // …and the canvas does NOT stay shifted (chips no longer occupy their own row).
    // Poll: the transient 2px PaneLoadingBar may still be animating right after the
    // filter reload; once it settles the canvas must be back at its original top.
    await expect.poll(async () => Math.abs((await box(canvas)).y - canvasTopBefore))
      .toBeLessThanOrEqual(1)

    // Chip removal still works from the new location.
    await chip.getByRole('button').click()
    await expect(page.getByTestId('pane-filter-chip').filter({ hasText: 'YVR' })).toHaveCount(0)
    await expect
      .poll(async () => (await page.evaluate(() => window.__ganttTest!.activeCrewFilter()))?.bases?.length ?? 0)
      .toBe(0)
  })
})
