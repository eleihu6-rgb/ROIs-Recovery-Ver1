/**
 * GO TO RPDate context menu (replaces the per-mode "Go to Month" / "Zoom to Month"
 * menus). Right-click the Live time axis → "GO TO RPDate" lists ONLY the roster
 * periods that are currently loaded (overlap the gantt window) — "as many RPs as
 * are loaded". Selecting one zooms the viewport to that RP's [rp_start, rp_end].
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth, gotoGantt, waitGanttReady, readHook } from '../../utils/gantt-hook'

const zoomState = (page: Page): Promise<{ pxPerHour: number; scrollX: number; viewportWidth: number; scrollWindowStartX: number; scrollWindowEndX: number | null }> =>
  readHook(page, 'zoom')

const visibleRange = async (page: Page): Promise<{ startMs: number; endMs: number }> => {
  const zoom = await zoomState(page)
  const range = await readHook<{ start: string }>(page, 'dateRange')
  const startMs = Date.parse(range.start) + (zoom.scrollX / zoom.pxPerHour) * 3_600_000
  return { startMs, endMs: startMs + (zoom.viewportWidth / zoom.pxPerHour) * 3_600_000 }
}

test.describe('GO TO RPDate context menu', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page, 90_000)
  })

  test('right-click lists the loaded roster periods and zooms to the selected RP', async ({ page }) => {
    const axis = page.getByTestId('roster-pane').getByTestId('pane-time-axis')
    await expect(axis).toBeVisible()
    const box = await axis.boundingBox()
    expect(box, 'time axis has a bounding box').not.toBeNull()

    // Right-click opens the GO TO RPDate menu.
    await axis.click({ button: 'right', position: { x: box!.width / 2, y: box!.height / 2 } })
    const menu = page.getByRole('menu', { name: 'GO TO RPDate' })
    await expect(menu).toBeVisible({ timeout: 10_000 })

    // Items are RP codes — only the loaded RPs (overlapping the window) are listed.
    const items = menu.getByRole('menuitem')
    await expect(items.first()).toContainText(/20\d\dRP\d{2}/)
    expect(await items.count(), 'lists at least one loaded RP').toBeGreaterThan(0)
    const rp07 = items.filter({ hasText: /20\d\dRP07/ }).first()
    await expect(rp07, 'default July RP is available in the loaded RP menu').toBeVisible()

    // Selecting an RP fires onSelectRp (zoomToRp) and closes the menu. This is
    // viewport-only; it must not expand dateRange or reload roster data.
    const before = await zoomState(page)
    const selectedText = await rp07.textContent()
    const dataRequests: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (/\/api\/(roster|pairing|flight|gantt\/bootstrap)(\?|$|\/)/.test(url)) dataRequests.push(url)
    })
    await rp07.click()
    await expect(menu, 'menu closes after selecting an RP').toBeHidden()
    await page.waitForTimeout(750)
    expect(dataRequests, 'GO TO RPDate must not reload Gantt data').toHaveLength(0)

    // zoomToRp ran: viewport still holds a valid (RP-sized) zoom.
    const after = await zoomState(page)
    expect(after.pxPerHour, 'viewport has a valid zoom after GO TO RPDate').toBeGreaterThan(0)
    expect(after.scrollX !== before.scrollX || after.pxPerHour !== before.pxPerHour ||
      new Date((await visibleRange(page)).startMs).toISOString().slice(0, 10) === '2026-07-01',
      'viewport is positioned on the selected RP').toBe(true)
    expect(after.scrollX, `${selectedText?.trim() ?? 'selected RP'} opens at RP start, not the padded scroll-window start`)
      .toBeGreaterThan(after.scrollWindowStartX)
    expect(after.scrollWindowEndX, 'RPDate installs a bounded scroll window').not.toBeNull()

    const selectedVisible = await visibleRange(page)
    const leftmost = new Date(selectedVisible.startMs)
    expect(leftmost.getUTCMinutes(), 'leftmost visible time is on a 00-minute boundary').toBe(0)
    expect(leftmost.getUTCSeconds(), 'leftmost visible time has no seconds drift').toBe(0)
    expect(new Date(selectedVisible.startMs).toISOString().slice(0, 10)).toBe('2026-07-01')
    expect(new Date(selectedVisible.endMs).toISOString().slice(0, 10)).toBe('2026-07-31')

    // The same loaded range must support navigation to partially overlapping RPs
    // without changing the backend range.
    await axis.click({ button: 'right', position: { x: box!.width / 2, y: box!.height / 2 } })
    const rp06 = page.getByRole('menu', { name: 'GO TO RPDate' }).getByRole('menuitem').filter({ hasText: /20\d\dRP06/ }).first()
    await expect(rp06).toBeVisible()
    await rp06.click()
    await page.waitForTimeout(750)
    const rp06Visible = await visibleRange(page)
    expect(new Date(rp06Visible.startMs).toISOString().slice(0, 10)).toBe('2026-06-24')
    expect(new Date(rp06Visible.endMs).toISOString().slice(0, 10)).toBe('2026-06-30')

    await axis.click({ button: 'right', position: { x: box!.width / 2, y: box!.height / 2 } })
    const rp08 = page.getByRole('menu', { name: 'GO TO RPDate' }).getByRole('menuitem').filter({ hasText: /20\d\dRP08/ }).first()
    await expect(rp08).toBeVisible()
    await rp08.click()
    await page.waitForTimeout(750)
    const rp08Zoom = await zoomState(page)
    const rp08Visible = await visibleRange(page)
    expect(new Date(rp08Visible.startMs).toISOString().slice(0, 10)).toBe('2026-08-01')
    expect(new Date(rp08Visible.endMs).toISOString().slice(0, 10)).toBe('2026-08-07')
    expect(rp08Zoom.scrollWindowStartX).toBe(0)
    expect(rp08Zoom.scrollWindowEndX).toBeGreaterThan(rp08Zoom.viewportWidth)
    expect(dataRequests, 'RP navigation across partially loaded periods must not reload Gantt data').toHaveLength(0)
  })

  test('RP07 stats switch at the left edge and remain horizontally draggable after manual zoom', async ({ page }) => {
    const axis = page.getByTestId('roster-pane').getByTestId('pane-time-axis')
    const axisBox = await axis.boundingBox()
    expect(axisBox, 'time axis has a bounding box').not.toBeNull()

    await axis.click({ button: 'right', position: { x: axisBox!.width / 2, y: axisBox!.height / 2 } })
    const menu = page.getByRole('menu', { name: 'GO TO RPDate' })
    await expect(menu).toBeVisible({ timeout: 10_000 })
    await menu.getByRole('menuitem').filter({ hasText: '2026RP07' }).click()

    await expect(page.getByTestId('roster-header-rp').first()).toHaveText('2026RP07', { timeout: 15_000 })
    await expect.poll(async () => (await readHook<string | null>(page, 'crewStatsYearMonth')) ?? '', {
      message: 'RP07 manday stats are keyed to the selected RP at the left edge',
      timeout: 15_000,
    }).toBe('2026RP07')

    const beforeZoom = await zoomState(page)
    const scrollbar = page.getByTestId('gantt-horizontal-scrollbar')
    const thumb = page.getByTestId('gantt-horizontal-scrollbar-thumb')
    await expect(scrollbar).toBeVisible()
    await expect(thumb).toBeVisible()

    // Drag right on the real time axis to zoom in after GO TO RPDate.
    await axis.hover({ position: { x: axisBox!.width * 0.25, y: axisBox!.height / 2 } })
    await page.mouse.down()
    await page.mouse.move(axisBox!.x + axisBox!.width * 0.65, axisBox!.y + axisBox!.height / 2, { steps: 5 })
    await page.mouse.up()

    const afterZoom = await zoomState(page)
    expect(afterZoom.pxPerHour).toBeGreaterThan(beforeZoom.pxPerHour)
    expect(afterZoom.scrollWindowEndX, 'manual zoom clears stale RP pixel bounds').toBeNull()

    const trackWidth = (await scrollbar.boundingBox())!.width
    const thumbWidth = (await thumb.boundingBox())!.width
    expect(thumbWidth, 'scrollbar thumb remains draggable after zoom').toBeLessThan(trackWidth)

    const beforeDrag = afterZoom.scrollX
    const thumbBox = await thumb.boundingBox()
    expect(thumbBox).not.toBeNull()
    await page.mouse.move(thumbBox!.x + thumbBox!.width / 2, thumbBox!.y + thumbBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      thumbBox!.x + thumbBox!.width / 2 + Math.min(120, trackWidth / 4),
      thumbBox!.y + thumbBox!.height / 2,
      { steps: 5 },
    )
    await page.mouse.up()
    await expect.poll(async () => (await zoomState(page)).scrollX, {
      message: 'horizontal scrollbar drag updates the timeline after manual zoom',
      timeout: 5_000,
    }).not.toBe(beforeDrag)
  })
})
