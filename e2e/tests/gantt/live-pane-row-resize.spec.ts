/**
 * Live LayoutGrid vertical resize — drag the row splitter between roster and pairing
 * (parity with Scenario HorizontalPaneSplitter).
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

const rowHeights = (page: Page): Promise<number[]> => readHook<number[]>(page, 'rowHeights')
const dragSplitter = async (page: Page, splitterIndex: number, deltaY: number): Promise<void> => {
  const splitter = page.getByTestId('pane-row-splitter').nth(splitterIndex)
  await expect(splitter).toBeVisible()
  const box = await splitter.boundingBox()
  expect(box).not.toBeNull()

  const centerX = box!.x + box!.width / 2
  const centerY = box!.y + box!.height / 2
  await page.mouse.move(centerX, centerY)
  await page.mouse.down()
  await page.mouse.move(centerX, centerY + deltaY, { steps: 8 })
  await page.mouse.up()
}

test.describe('Live pane row resize', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Live-1160 — drag row splitter changes roster row height (not equal flex)', async ({ page }) => {
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()

    await expect(dashboard.rosterPane).toBeVisible()
    await expect(dashboard.pairingPane).toBeVisible()

    const beforeHeights = await rowHeights(page)
    expect(beforeHeights.length).toBeGreaterThanOrEqual(2)
    // Default layout: both rows flex-fill
    expect(beforeHeights[0]).toBe(-1)

    const rosterRow = page.getByTestId('live-grid-row-0')
    const heightBefore = (await rosterRow.boundingBox())!.height

    await dragSplitter(page, 0, 80)

    await expect
      .poll(async () => (await rowHeights(page))[0], {
        timeout: 5_000,
        message: 'rowHeights[0] should become a fixed px height after drag',
      })
      .toBeGreaterThan(80)

    const after = await rowHeights(page)
    expect(after[0]).not.toBe(-1)
    expect(after[0]).toBeGreaterThan(heightBefore - 1)

    const heightAfter = (await rosterRow.boundingBox())!.height
    expect(heightAfter).toBeGreaterThan(heightBefore + 20)
  })

  test('Live-1161 — dragging the lower splitter first keeps pairing row anchored', async ({ page }) => {
    test.slow()

    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.addFlightPane()

    await expect(dashboard.flightPane).toBeVisible()

    await dragSplitter(page, 1, 60)

    await expect
      .poll(async () => {
        const heights = await rowHeights(page)
        return [heights[0], heights[1]]
      }, {
        timeout: 5_000,
        message: 'dragging the lower splitter first should materialize roster and pairing row heights',
      })
      .toEqual(expect.arrayContaining([expect.any(Number), expect.any(Number)]))

    const afterFirstDrag = await rowHeights(page)
    expect(afterFirstDrag[0]).toBeGreaterThan(80)
    expect(afterFirstDrag[1]).toBeGreaterThan(80)

    const pairingRow = page.getByTestId('live-grid-row-1')
    const firstBox = await pairingRow.boundingBox()
    expect(firstBox, 'pairing row should be measurable after the first lower-splitter drag').not.toBeNull()

    await dragSplitter(page, 1, -40)

    const secondBox = await pairingRow.boundingBox()
    expect(secondBox, 'pairing row should stay measurable after the second lower-splitter drag').not.toBeNull()
    expect(Math.abs(secondBox!.y - firstBox!.y)).toBeLessThanOrEqual(1)
  })

  test('Live-1162 — dragging the lower splitter to the limit keeps the flight pane visible', async ({ page }) => {
    test.slow()

    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.addFlightPane()

    await expect(dashboard.flightPane).toBeVisible()

    await dragSplitter(page, 1, 500)

    const flightRow = page.getByTestId('live-grid-row-2')
    const flightBox = await flightRow.boundingBox()
    expect(flightBox, 'flight row should still be measurable at the drag limit').not.toBeNull()
    expect(flightBox!.height).toBeGreaterThanOrEqual(76)
    await expect(dashboard.flightPane).toBeVisible()
  })

  test('Live-1163 — after the flight pane hits minimum height, the pairing pane can still move down', async ({ page }) => {
    test.slow()

    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.addFlightPane()

    await dragSplitter(page, 1, 500)

    const pairingRow = page.getByTestId('live-grid-row-1')
    const flightRow = page.getByTestId('live-grid-row-2')
    const beforePairingBox = await pairingRow.boundingBox()
    const beforeFlightBox = await flightRow.boundingBox()
    expect(beforePairingBox, 'pairing row should be measurable before dragging the upper splitter').not.toBeNull()
    expect(beforeFlightBox, 'flight row should be measurable before dragging the upper splitter').not.toBeNull()

    await dragSplitter(page, 0, 100)

    const afterPairingBox = await pairingRow.boundingBox()
    const afterFlightBox = await flightRow.boundingBox()
    expect(afterPairingBox, 'pairing row should stay measurable after dragging the upper splitter').not.toBeNull()
    expect(afterFlightBox, 'flight row should stay measurable after dragging the upper splitter').not.toBeNull()
    expect(afterPairingBox!.y).toBeGreaterThan(beforePairingBox!.y + 20)
    expect(afterPairingBox!.height).toBeLessThan(beforePairingBox!.height - 20)
    expect(Math.abs(afterFlightBox!.height - beforeFlightBox!.height)).toBeLessThanOrEqual(1)
    expect(afterFlightBox!.height).toBeGreaterThanOrEqual(76)
  })
})
