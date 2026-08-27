import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

/**
 * Live context menu → "View pairing detail" (parity with Scenario).
 *
 * Regression: Live omitted View pairing detail while Scenario offered it.
 * Opens the real Live ContextMenu for a loaded pairing (via test hook — canvas
 * geometry is flaky when first rows are DO-only), then clicks the menu item and
 * asserts the shared Pairing Info dialog shows that pairing id.
 */

test.describe('Live View pairing detail', () => {
  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).pairing, {
      message: 'pairing objects loaded',
      timeout: 30_000,
    }).toBeGreaterThan(0)
  })

  test('Live-1320 — View pairing detail menu item opens Pairing Info for the pairing', async ({ page }) => {
    const pairings = await readHook<Array<{ id: number }>>(page, 'pairings')
    expect(pairings.length, 'at least one pairing loaded').toBeGreaterThan(0)
    const pairingId = pairings[0]!.id

    await page.evaluate((id) => {
      ;(window.__ganttTest as unknown as { openLivePairingContextMenu: (p: number) => void })
        .openLivePairingContextMenu(id)
    }, pairingId)

    const viewDetail = page.getByRole('button', { name: 'View pairing detail', exact: true })
    await expect(viewDetail).toBeVisible({ timeout: 5_000 })
    await viewDetail.click()

    const dialog = page.getByTestId('pairing-info-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog).toContainText(`#${pairingId}`)
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 10_000 })
  })
})
