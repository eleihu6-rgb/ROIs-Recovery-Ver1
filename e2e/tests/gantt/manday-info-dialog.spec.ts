/**
 * Manday Info — roster name-cell context menu → daily Credit/BH table
 * for the viewport leftmost calendar month.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth, gotoGantt, counts } from '../../utils/gantt-hook'

const HEADER_HEIGHT = 30
const ROW_HEIGHT = 43

test.describe('Manday Info dialog', () => {
  /** Right-click the first roster name cell and pick Manday Info. */
  async function openMandayInfoDialog(page: Page): Promise<void> {
    await expect.poll(async () => (await counts(page)).roster, {
      message: 'roster loaded',
      timeout: 60_000,
    }).toBeGreaterThan(0)

    const header = page.getByTestId('pane-header-canvas-roster-main')
    await expect(header).toBeVisible({ timeout: 15_000 })
    const box = await header.boundingBox()
    expect(box, 'roster header canvas').toBeTruthy()

    // Name column is on the left of the header canvas — mid-left of first crew row.
    const x = box!.x + Math.min(80, box!.width * 0.35)
    const y = box!.y + HEADER_HEIGHT + ROW_HEIGHT / 2
    await page.mouse.click(x, y, { button: 'right' })

    const menuItem = page.getByText('Manday Info', { exact: true })
    await expect(menuItem).toBeVisible({ timeout: 5_000 })
    await menuItem.click()

    const dialog = page.getByTestId('manday-info-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog).toContainText('Manday Info')
    await expect(page.locator('.fixed.inset-0.z-50.bg-black\\/25')).toBeVisible()
  }

  test('Live-manday — name-cell Manday Info shows month table with Credit and BH', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await openMandayInfoDialog(page)

    const dialog = page.getByTestId('manday-info-dialog')

    const table = page.getByTestId('manday-info-table')
    await expect(table).toBeVisible({ timeout: 15_000 })
    await expect(table.getByText('Credit', { exact: true })).toBeVisible()
    await expect(table.getByText('BH', { exact: true })).toBeVisible()

    const rows = page.getByTestId('manday-info-row')
    const rowCount = await rows.count()
    expect(rowCount, 'one row per calendar day of the month').toBeGreaterThanOrEqual(28)
    expect(rowCount).toBeLessThanOrEqual(31)

    const firstCredit = await rows.first().getByTestId('manday-info-credit').textContent()
    const firstBh = await rows.first().getByTestId('manday-info-bh').textContent()
    expect(firstCredit).toMatch(/^-?\d+:\d{2}$/)
    expect(firstBh).toMatch(/^-?\d+:\d{2}$/)

    // Resize via SE handle — window grows so more rows can be visible.
    const before = await dialog.boundingBox()
    expect(before, 'dialog box before resize').toBeTruthy()
    const se = page.getByTestId('app-dialog-resize-se')
    await expect(se).toBeVisible()
    const seBox = await se.boundingBox()
    expect(seBox, 'SE resize handle').toBeTruthy()
    await se.hover()
    await page.mouse.down()
    await page.mouse.move(seBox!.x + seBox!.width / 2 + 120, seBox!.y + seBox!.height / 2 + 100, { steps: 10 })
    await page.mouse.up()
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    const after = await dialog.boundingBox()
    expect(after, 'dialog box after resize').toBeTruthy()
    expect(after!.width, 'dialog wider after SE drag').toBeGreaterThan(before!.width + 40)
    expect(after!.height, 'dialog taller after SE drag').toBeGreaterThan(before!.height + 40)

    await page.getByTestId('manday-info-close').click()
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  })

  test('Live-manday-dismiss — panel is opaque and Escape closes it like Crew Info', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await openMandayInfoDialog(page)

    const dialog = page.getByTestId('manday-info-dialog')

    // Panel must be fully opaque (regression: bg-background/85 made it translucent).
    const alpha = await dialog.evaluate((el) => {
      const color = getComputedStyle(el).backgroundColor
      // Legacy comma syntax with an explicit alpha: rgba(r, g, b, a).
      const rgba = color.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)$/)
      if (rgba) return Number(rgba[1])
      // Modern space-separated syntax with a / alpha: rgb(r g b / a), color(srgb … / a).
      const slash = color.match(/\/\s*([\d.]+)\s*\)$/)
      if (slash) return Number(slash[1])
      // No alpha component present → fully opaque.
      return 1
    })
    expect(alpha, 'manday panel background should be opaque, not translucent').toBe(1)

    // Esc (with no nested dropdown open) must close the dialog.
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  })

  test('Live-manday-dismiss-overlay — clicking the dimming overlay closes it like Crew Info', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await openMandayInfoDialog(page)

    const dialog = page.getByTestId('manday-info-dialog')
    // (5, 5) is on the full-screen overlay, far outside the ~420px centered dialog.
    await page.mouse.click(5, 5)
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  })
})
