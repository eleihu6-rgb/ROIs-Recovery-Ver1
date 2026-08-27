/**
 * Rule Instance catalog — Edit flow (shares the create/copy dialog).
 *
 * Regression: previously the catalog had no Edit entry point and the dialog's
 * Save always POSTed a new instance, so editing an existing instance in place
 * was impossible. This test creates a customer instance, edits its name +
 * severity through the SAME dialog (now in "Edit Instance" mode with the code
 * locked), and proves the row is updated in place — not duplicated.
 *
 * §No-Illusion: asserts concrete row text/severity changes and row count == 1,
 * not mere dialog visibility. Cleans up the created instance at the end.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Rule Instance catalog — edit', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.getByTestId('module-nav-rule').click()
    await page.getByRole('button', { name: 'Rule Instances' }).click()
    // Catalog ready once the toolbar's New Instance button is present.
    await expect(page.getByRole('button', { name: 'New Instance', exact: true })).toBeVisible({ timeout: 10_000 })
  })

  test('Live-1223 — create then edit updates the instance in place via the shared dialog', async ({ page }) => {
    const code = `e2e_edit_${Date.now()}`
    const search = page.getByPlaceholder('Search instances…')
    const dialog = page.getByTestId('instance-edit-dialog')

    // ── Create ────────────────────────────────────────────────
    await page.getByRole('button', { name: 'New Instance', exact: true }).click()
    await expect(dialog).toBeVisible()
    // index 0 is the "— select template —" placeholder; pick the first real one.
    await dialog.getByTestId('instance-template').selectOption({ index: 1 })
    await dialog.getByTestId('instance-code').fill(code)
    await dialog.getByTestId('instance-name').fill(`E2E Edit ${code}`)
    await dialog.getByTestId('instance-severity').selectOption('WARNING')
    await dialog.getByTestId('instance-save').click()
    await expect(dialog).toBeHidden()

    // Filter to the new instance so assertions are unambiguous.
    await search.fill(code)
    const row = page.getByTestId(`instance-row-${code}`)
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(`E2E Edit ${code}`)
    await expect(row).toContainText('WARNING')

    // ── Edit (same dialog, now in edit mode) ──────────────────
    await row.getByTitle('Edit instance').click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Edit Instance')
    // Identity is locked in edit mode and pre-filled with the existing code.
    await expect(dialog.getByTestId('instance-code')).toBeDisabled()
    await expect(dialog.getByTestId('instance-code')).toHaveValue(code)

    await dialog.getByTestId('instance-name').fill(`E2E Edited ${code}`)
    await dialog.getByTestId('instance-severity').selectOption('INFO')
    await dialog.getByTestId('instance-save').click()
    await expect(dialog).toBeHidden()

    // Row updated in place — same code, new name + severity, still exactly one.
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(`E2E Edited ${code}`)
    await expect(row).toContainText('INFO')
    await expect(row).not.toContainText('WARNING')

    // ── Cleanup ───────────────────────────────────────────────
    await row.getByTitle('Delete instance').click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByTestId(`instance-row-${code}`)).toHaveCount(0)
  })
})
