import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

/**
 * Column Config dialog (gantt/src/components/common/column-config-dialog.tsx),
 * opened from each pane's condition strip via the gear (title="Column settings").
 *
 * The left-panel columns are Canvas-rendered, so visibility cannot be asserted in
 * the DOM. The store IS the source of truth the canvas draws from, so we assert via
 * the introspection hook __ganttTest.rosterColumns() — hiding a column flips its
 * `visible` flag, and Reset restores the default. Multi-step with real state
 * assertions, not a "dialog is visible" smoke test. No backend writes.
 */
const rosterColumns = (page: Page): Promise<Array<{ key: string; label: string; visible: boolean }>> =>
  readHook(page, 'rosterColumns')

test.describe('Column Config dialog', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect
      .poll(async () => (await counts(page)).roster, { message: 'roster loaded', timeout: 30_000 })
      .toBeGreaterThan(0)
  })

  test('ColCfg-1 — hide a roster column flips its visible flag; Reset restores default', async ({ page }) => {
    const cols = await rosterColumns(page)
    expect(cols.length, 'roster has configurable columns').toBeGreaterThan(0)
    // A column that is visible by default (fresh context = no persisted overrides),
    // with a non-empty label so we can target its row.
    const target = cols.find((c) => c.visible && c.label.trim().length > 0)
    expect(target, 'a visible, labelled column exists').toBeTruthy()

    // Open the roster pane's Column settings (scoped so it doesn't match the
    // pairing/flight strips' gears).
    await dashboard.rosterPane.getByTitle('Column settings').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/Column Settings/)).toBeVisible({ timeout: 5_000 })

    // The target row shows its label; its only button is the eye visibility toggle.
    const row = dialog.locator('div').filter({ has: page.getByText(target!.label, { exact: true }) }).last()
    await row.getByRole('button').click()

    // Store now marks it hidden — this is exactly what suppresses it on the canvas.
    await expect
      .poll(async () => (await rosterColumns(page)).find((c) => c.key === target!.key)?.visible, {
        message: 'toggled column is now hidden in the store',
        timeout: 5_000,
      })
      .toBe(false)

    // Reset returns the column to its default-visible state.
    await dialog.getByRole('button', { name: 'Reset' }).click()
    await expect
      .poll(async () => (await rosterColumns(page)).find((c) => c.key === target!.key)?.visible, {
        message: 'Reset restored the column to visible',
        timeout: 5_000,
      })
      .toBe(true)

    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
