/**
 * Gantt Pairing Pane Tests.
 *
 * Pairing 面板渲染、滚动、刷新、缩放。断言基于 window.__ganttTest（store 真值 + Canvas 回执）。
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, counts, paneRenderStat, zoomState, waitGanttReady, pairingObjects } from '../../utils/gantt-hook'
import { recordRegressionSnapshot } from '../../utils/regression-snapshot'

const pairingStat = (page: import('@playwright/test').Page) => paneRenderStat(page, 'pairing')
const MS_PER_DAY = 24 * 60 * 60 * 1000

interface PairingRow {
  id: number
  start: string
  end: string
}

const normalizeUtcIso = (iso: string): string =>
  iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`

const xFromIso = (iso: string, rangeStartIso: string, pxPerHour: number): number => {
  const ms = Date.parse(normalizeUtcIso(iso))
  const rangeStartMs = Date.parse(rangeStartIso)
  return (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * pxPerHour
}

const ymdInTimezone = (iso: string, timezone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(normalizeUtcIso(iso)))
  const value = (type: string): string => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

const forcePairingRowsOffscreenLeft = async (page: import('@playwright/test').Page): Promise<PairingRow> => {
  const [firstPairing] = await pairingObjects(page) as unknown as PairingRow[]
  expect(firstPairing?.start, 'pairing start available').toBeTruthy()
  expect(firstPairing?.end, 'pairing end available').toBeTruthy()

  const range = await page.evaluate(() => window.__ganttTest!.dateRange())
  const zoom = await zoomState(page)
  const pairingEndX = xFromIso(firstPairing.end, range.start, zoom.pxPerHour)
  await page.evaluate((x) => window.__ganttTest!.setScrollX(x), pairingEndX + 24 * zoom.pxPerHour)
  return firstPairing
}

test.describe('Pairing Pane', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
  })

  test('Live-1130 — should render the pairing pane with pairing objects @smoke', async ({ page }) => {
    await dashboard.expectPairingPaneVisible()
    await expect(dashboard.pairingCanvas).toBeVisible()
    expect((await counts(page)).pairing, 'pairing objects loaded').toBeGreaterThan(0)
    const stat = await pairingStat(page)
    expect(stat?.totalRows ?? 0, 'pairing canvas drew rows').toBeGreaterThan(0)
    expect(stat?.renders ?? 0, 'pairing canvas painted').toBeGreaterThan(0)
  })

  test('Live-1131 — should keep pairing objects rendered while scrolling', async ({ page }) => {
    const before = await pairingStat(page)
    const box = await dashboard.pairingCanvas.boundingBox()
    expect(box).not.toBeNull()

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.wheel(0, 500)

    await expect.poll(async () => (await pairingStat(page))?.renders ?? 0).toBeGreaterThan(before!.renders)
    expect((await counts(page)).pairing, 'pairing objects preserved during scroll').toBeGreaterThan(0)
  })

  test('Live-1132 — should preserve pairing objects on refresh', async ({ page }) => {
    const before = await counts(page)
    expect(before.pairing).toBeGreaterThan(0)
    await dashboard.refresh()
    await waitGanttReady(page)
    expect((await counts(page)).pairing, 'pairing objects present after refresh').toBeGreaterThan(0)
  })

  test('Live-1133 — zoom controls change zoom and repaint pairing objects', async ({ page }) => {
    const px0 = (await zoomState(page)).pxPerHour
    const renders0 = (await pairingStat(page))?.renders ?? 0

    await dashboard.zoomIn()

    await expect.poll(() => zoomState(page).then((z) => z.pxPerHour)).toBeGreaterThan(px0)
    await expect.poll(async () => (await pairingStat(page))?.renders ?? 0).toBeGreaterThan(renders0)
    expect((await counts(page)).pairing, 'pairing objects preserved after zoom').toBeGreaterThan(0)
  })

  test('Live-1134 — REG-GANTT-PAIRING-OFFSCREEN-JUMP-001 shows date jump and scrolls to pairing start minus two days', async ({ page }, testInfo) => {
    const firstPairing = await forcePairingRowsOffscreenLeft(page)
    const range = await page.evaluate(() => window.__ganttTest!.dateRange())
    const zoom = await zoomState(page)

    const hint = page.getByTestId('pairing-offscreen-jump-hint')
    await expect(hint, 'offscreen date jump appears in Pairing pane body').toBeVisible({ timeout: 5_000 })
    const jumpButtons = page.getByTestId('pairing-offscreen-jump-button')
    await expect.poll(() => jumpButtons.count(), {
      timeout: 5_000,
      message: 'all visible offscreen pairing rows get quick-jump buttons',
    }).toBeGreaterThan(1)
    const displayTimezone = await page.evaluate(() => window.__ganttTest!.timezone().timezone)
    await expect(jumpButtons.first()).toContainText(`<< ${ymdInTimezone(firstPairing.start, displayTimezone)}`)

    const hintBox = await jumpButtons.first().boundingBox()
    const canvasBox = await dashboard.pairingCanvas.boundingBox()
    expect(hintBox, 'date jump hint has a DOM box').not.toBeNull()
    expect(canvasBox, 'pairing canvas has a DOM box').not.toBeNull()
    expect(hintBox!.x, 'date jump hint is rendered in the Gantt timeline area, not the left Pairing header').toBeGreaterThanOrEqual(canvasBox!.x - 1)

    // Capture state BEFORE click (jump buttons visible, first pairing offscreen)
    await recordRegressionSnapshot(page, testInfo, {
      label: 'jump-buttons-visible-before-click',
      stepIndex: 0,
      details: {
        pairing_start: firstPairing.start,
        display_timezone: displayTimezone,
        jump_button_label: `<< ${ymdInTimezone(firstPairing.start, displayTimezone)}`,
      },
    })

    await jumpButtons.first().click()

    const targetDate = new Date(Date.parse(normalizeUtcIso(firstPairing.start)) - 2 * MS_PER_DAY).toISOString()
    const expectedScrollX = Math.max(0, xFromIso(targetDate, range.start, zoom.pxPerHour))
    await expect.poll(() => zoomState(page).then((z) => z.scrollX), {
      timeout: 5_000,
      message: 'clicking pairing offscreen hint scrolls to pairing start minus two days',
    }).toBeCloseTo(expectedScrollX, 1)

    const actualScrollX = (await zoomState(page)).scrollX
    // Capture state AFTER click (timeline scrolled to pairing start − 2 days)
    await recordRegressionSnapshot(page, testInfo, {
      label: 'after-jump-timeline-scrolled',
      stepIndex: 1,
      details: {
        pairing_start: firstPairing.start,
        target_date: targetDate.slice(0, 10),
        expected_scroll_x: Math.round(expectedScrollX),
        actual_scroll_x: Math.round(actualScrollX),
        match: Math.abs(actualScrollX - expectedScrollX) < 1,
      },
    })

    process.stdout.write(`REGRESSION_DETAIL: ${JSON.stringify({
      summary: `Jump << on pairing ${firstPairing.start.slice(0, 10)} scrolled to ${targetDate.slice(0, 10)} (start − 2 days)`,
      steps: [
        {
          action: 'assert_jump_buttons_visible',
          pairing_start: firstPairing.start.slice(0, 10),
          button_label: `<< ${ymdInTimezone(firstPairing.start, displayTimezone)}`,
          timezone: displayTimezone,
        },
        {
          action: 'click_jump_button',
          target_date: targetDate.slice(0, 10),
          expected_scroll_x: Math.round(expectedScrollX),
          actual_scroll_x: Math.round(actualScrollX),
        },
      ],
      artifacts: [],
    })}\n`)
  })

  test('Live-1135 — REG-GANTT-PAIRING-OFFSCREEN-JUMP-003 jump hints never overlay the header band and stay row-aligned when partially scrolled', async ({ page }) => {
    const PAIRING_HEADER_HEIGHT = 30
    const PAIRING_ROW_HEIGHT = 42
    await forcePairingRowsOffscreenLeft(page)

    const jumpButtons = page.getByTestId('pairing-offscreen-jump-button')
    await expect(jumpButtons.first()).toBeVisible({ timeout: 5_000 })

    // Scroll the pane vertically by a NON-multiple of the row height so the
    // first row is partially hidden behind the header band (the bug: its hint
    // floated up over the condition-strip/header band instead of clipping).
    const canvasBox = await dashboard.pairingCanvas.boundingBox()
    expect(canvasBox, 'pairing canvas has a DOM box').not.toBeNull()
    await page.mouse.move(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2)
    await page.mouse.wheel(0, 21)
    await expect.poll(() => page.evaluate(() => window.__ganttTest!.paneScrollY('pairing')), {
      timeout: 5_000,
      message: 'pairing pane scrolled by a partial row offset',
    }).toBeGreaterThan(0)
    const scrollY = await page.evaluate(() => window.__ganttTest!.paneScrollY('pairing'))
    expect(scrollY % PAIRING_ROW_HEIGHT, 'scroll offset is a non-multiple of the row height').not.toBe(0)

    // 1. The hint overlay must start below the 30px header band — never on top of it.
    const hintContainerBox = await page.getByTestId('pairing-offscreen-jump-hint').boundingBox()
    expect(hintContainerBox, 'hint overlay has a DOM box').not.toBeNull()
    expect(
      hintContainerBox!.y,
      'jump-hint overlay does not overlay the pairing header band',
    ).toBeGreaterThanOrEqual(canvasBox!.y + PAIRING_HEADER_HEIGHT - 0.5)

    // 2. Behavioral proof: a point inside the header band over the timeline area
    // must NOT hit a jump button (before the fix the row-0 button floated there).
    const probe = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      return el?.closest('[data-testid="pairing-offscreen-jump-button"]') !== null
    }, { x: canvasBox!.x + 80, y: canvasBox!.y + PAIRING_HEADER_HEIGHT / 2 })
    expect(probe, 'header band point is not covered by a jump button').toBe(false)

    // 3. Fully visible rows stay aligned to their canvas row band (row 1 top =
    // header + rowHeight − scrollY). Tolerate 1px for DPR rounding.
    const row1Box = await jumpButtons.nth(1).boundingBox()
    expect(row1Box, 'row-1 jump button has a DOM box').not.toBeNull()
    expect(
      Math.abs(row1Box!.y - (canvasBox!.y + PAIRING_HEADER_HEIGHT + PAIRING_ROW_HEIGHT - scrollY)),
      'row-1 jump button aligns with its canvas row band',
    ).toBeLessThanOrEqual(1)
  })

  test('Live-1136 — REG-GANTT-PAIRING-OFFSCREEN-JUMP-002 preserves touchpad vertical scroll over jump buttons', async ({ page }) => {
    await forcePairingRowsOffscreenLeft(page)

    const jumpButtons = page.getByTestId('pairing-offscreen-jump-button')
    await expect(jumpButtons.first()).toBeVisible({ timeout: 5_000 })

    const box = await jumpButtons.first().boundingBox()
    expect(box, 'jump button has a DOM box').not.toBeNull()
    const before = await page.evaluate(() => window.__ganttTest!.paneScrollY('pairing'))

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.wheel(0, 500)

    await expect.poll(() => page.evaluate(() => window.__ganttTest!.paneScrollY('pairing')), {
      timeout: 5_000,
      message: 'wheel/touchpad vertical scroll over offscreen jump buttons still scrolls the Pairing pane',
    }).toBeGreaterThan(before)
  })
})
