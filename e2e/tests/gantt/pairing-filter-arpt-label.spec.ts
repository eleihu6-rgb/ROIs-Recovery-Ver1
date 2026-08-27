/**
 * Pairing Filters — Arpt field label + F8 placeholder copy.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Pairing Filters — Arpt label', () => {
  test('Pairing tab shows Arpt with YVR/YYZ placeholder', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.getByTestId('module-nav-live').click()
    await expect(page.getByTestId('filter-btn')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('filter-btn').click()

    const dialog = page.getByTestId('filter-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('filter-tab-pairing').click()
    await expect(page.getByTestId('filter-tab-pairing')).toHaveAttribute('data-active', 'true')

    const depField = dialog.getByTestId('filter-pairing-dep')
    await expect(depField).toBeVisible()
    await expect(depField).toHaveAttribute('placeholder', 'e.g. YVR, YYZ')
    await expect(dialog.getByText('Arpt', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Origin Arpt')).toHaveCount(0)
  })
})
