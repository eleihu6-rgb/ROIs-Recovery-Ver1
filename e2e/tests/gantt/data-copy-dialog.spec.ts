/**
 * Data Tab — Copy dialog (Data-50xx).
 *
 * Regression coverage for two related bugs reported on SIT /altair/data:
 *   1. Copying a row opened a dialog titled "Add <Entity>" instead of
 *      "Copy <Entity>" (§1 title fix).
 *   2. After Copy, Save failed validation but nothing told the user WHICH field
 *      failed — the server discards issue details on 422, so the dialog now
 *      re-runs the validate endpoint and highlights the offending field(s).
 *
 * NON-DESTRUCTIVE: saving an unchanged copy of an existing row always trips the
 * server duplicate-key check, so the test exercises the validation-feedback
 * path without ever committing a write (committed rows would have to differ).
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const openAssignmentPage = async (page: import('@playwright/test').Page) => {
  await page.goto('/altair/')
  await page.getByTestId('module-nav-data').click()
  await page.getByTestId('data-view').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId('data-tree-item-basic.assignment').click()
  await page.getByTestId('data-section-assignment').waitFor({ state: 'visible', timeout: 10_000 })
  const grid = page.getByTestId('data-grid-assignment')
  await expect(grid.locator('[data-testid^="data-copy-row-"]').first()).toBeVisible({ timeout: 10_000 })
}

test('Data-5030 — Copy row opens a dialog titled "Copy Assignment", not "Add Assignment"', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await openAssignmentPage(page)

  await page.getByTestId('data-grid-assignment').locator('[data-testid^="data-copy-row-"]').first().click()

  const dialog = page.getByTestId('data-edit-dialog-assignment')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await expect(dialog.locator('[data-app-dialog-header]')).toContainText('Copy Assignment')
  await expect(dialog.locator('[data-app-dialog-header]')).not.toContainText('Add Assignment')
})

test('Data-5031 — Copy-then-Save with a duplicate key highlights the offending field and names it', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await openAssignmentPage(page)

  // Grab the first row's copy button and open the Copy dialog.
  const grid = page.getByTestId('data-grid-assignment')
  const firstCopyBtn = grid.locator('[data-testid^="data-copy-row-"]').first()
  await firstCopyBtn.click()
  const dialog = page.getByTestId('data-edit-dialog-assignment')
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  // Saving an unchanged copy of an existing row trips the server duplicate-key check.
  await dialog.getByTestId('data-edit-save').click()

  // The offending field is highlighted with its specific message (not a generic "Validation failed").
  await expect(dialog.getByTestId('data-edit-error-assignment')).toContainText('already exists', { timeout: 10_000 })

  // The validation notification names the field / message.
  await expect(page.locator('[data-sonner-toast]').getByText(/already exists/)).toBeVisible({ timeout: 10_000 })

  // Dialog stays open so the planner can fix the field and retry.
  await expect(dialog).toBeVisible()
})
