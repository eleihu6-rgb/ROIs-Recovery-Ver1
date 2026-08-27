/**
 * Release tab — full-width layout.
 *
 * The Release tab brings its own left nav ("Release Notes" list), so the generic
 * shell sidebar was rendering as an empty wasted column to its left. It is now
 * hidden on the Release (and Help) tab so the page is fully utilised — but it
 * must reappear as the collapsed icon rail when the top nav is hidden, so the
 * "Show Top Nav" restore control stays reachable.
 *
 * §No-Illusion: assertions check the concrete sidebar state + measured width,
 * not just visibility.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Release tab — full-width layout', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.addInitScript(() => localStorage.setItem('rois-shell-top-nav', 'true'))
    await page.goto('/altair/')
    await page.getByTestId('nav-release').click()
    await page.getByTestId('release-view').waitFor({ state: 'visible', timeout: 10_000 })
  })

  test('Live-1702 — shell sidebar collapses to zero width on Release so the page is fully used', async ({ page }) => {
    const shellSidebar = page.getByTestId('shell-sidebar')
    const releaseNav = page.getByTestId('release-tree')

    // The Release tab's own nav (Release Notes) is present and populated.
    await expect(page.getByText('Release Notes')).toBeVisible()
    await expect(releaseNav.getByTestId('release-tree-item-2')).toContainText('Rel 2')

    // The generic shell sidebar is hidden (zero width) — no empty wasted column.
    // Poll the measured width so the w-[200px]→w-0 CSS transition can settle.
    await expect(shellSidebar).toHaveAttribute('data-state', 'hidden')
    await expect
      .poll(() => shellSidebar.evaluate((el) => (el as HTMLElement).offsetWidth))
      .toBe(0)
  })

  test('Live-1703 — hiding the top nav brings back the collapsed rail so nav is restorable', async ({ page }) => {
    const shellSidebar = page.getByTestId('shell-sidebar')

    // Baseline on Release: sidebar hidden.
    await expect(shellSidebar).toHaveAttribute('data-state', 'hidden')

    // Hide the top nav via the sidebar control — the rail must come back
    // (collapsed) with the same restore toggle.
    await page.getByTestId('toggle-top-nav-btn').click()
    await expect(shellSidebar).toHaveAttribute('data-state', 'collapsed')

    const restoreToggle = page.getByTestId('toggle-top-nav-btn')
    await expect(restoreToggle).toBeVisible()
    await expect(restoreToggle).toHaveClass(/animate-nav-hint/)

    // Restoring the top nav hides the rail again → back to full width.
    await restoreToggle.click()
    await expect(shellSidebar).toHaveAttribute('data-state', 'hidden')
  })
})
