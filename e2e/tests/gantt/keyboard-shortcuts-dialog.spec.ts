import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

/**
 * Keyboard Shortcuts reference dialog (gantt/src/components/common/keyboard-shortcuts-dialog.tsx).
 *
 * Opened from the Live sub-toolbar (button title="Keyboard shortcuts"). The dialog
 * is a read-only reference, so the meaningful assertions are on the ACTUAL shortcut
 * content the user relies on — group headers + specific key→action rows — not merely
 * that an overlay is visible (§Playwright anti-patterns).
 *
 * No backend writes; no live data dependency beyond reaching the Live toolbar.
 */
test.describe('Keyboard Shortcuts dialog', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, {
      timeout: 30_000,
    })
    await page.getByTestId('module-nav-live').click()
    // Toolbar must be mounted before the shortcuts button exists.
    await expect(page.getByTestId('refresh-btn')).toBeVisible({ timeout: 15_000 })
  })

  test('KbdHelp-1 — opens from toolbar and lists the real shortcuts, then closes', async ({ page }) => {
    const trigger = page.getByTitle('Keyboard shortcuts')
    await expect(trigger).toBeVisible()

    // Step 1: dialog is not present before the user opens it.
    await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts' })).toHaveCount(0)

    // Step 2: open it.
    await trigger.click()
    const heading = page.getByRole('heading', { name: 'Keyboard Shortcuts' })
    await expect(heading).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.fixed.inset-0.z-50.bg-black\\/25')).toBeVisible()
    // The dialog card itself (bg-popover), so group names don't collide with the
    // toolbar's "Pairing" pane button.
    const dialog = page.locator('div.bg-popover').filter({ has: heading })

    // Step 3: the documented group headers are all present.
    for (const group of ['File', 'Edit', 'Selection', 'Pairing', 'View']) {
      await expect(dialog.getByText(group, { exact: true })).toBeVisible()
    }

    // Step 4: specific action rows render with their key caps — assert real content,
    // matching keyboard-shortcuts-dialog.tsx SHORTCUT_GROUPS exactly.
    await expect(dialog.getByText('Save all pending changes')).toBeVisible()
    await expect(dialog.getByText('Undo last operation')).toBeVisible()
    await expect(dialog.getByText('Create Pairing from selected flights')).toBeVisible()
    // The 'S' key cap from the Ctrl+S save shortcut.
    await expect(dialog.locator('kbd', { hasText: 'Ctrl' }).first()).toBeVisible()
    await expect(dialog.locator('kbd', { hasText: /^S$/ }).first()).toBeVisible()

    // Step 5: close via the X button → dialog gone.
    await dialog.getByRole('button').first().click()
    await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts' })).toHaveCount(0)
  })
})
