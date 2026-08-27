/**
 * Top Nav toggle — hide / restore + attention animation hint.
 *
 * After the user clicks "Hide Top Nav" in the sidebar, the top nav collapses
 * and that same sidebar toggle remains the way back. To remind the user
 * where to find it, that toggle gets the `animate-nav-hint` class (a pulsing
 * attention nudge) while the top nav is hidden, and loses it once restored.
 *
 * §No-Illusion: assertions check concrete state (top-nav visibility flag, the
 * presence/absence of the hint class), not just element visibility.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Top Nav toggle hint', () => {
  test.beforeEach(async ({ page, request }) => {
    // Ensure no persisted "hidden" state leaks in from a previous run.
    await seedGanttAuth(page, request)
    await page.addInitScript(() => localStorage.setItem('rois-shell-top-nav', 'true'))
    await page.goto('/altair/')
  })

  test('Live-1701 — hiding the top nav animates the sidebar toggle, restoring removes the hint', async ({ page }) => {
    const topNavWrap = page.getByTestId('shell-top-nav-wrap')
    const sidebarToggle = page.getByTestId('toggle-top-nav-btn')

    // Initial state: top nav visible, sidebar toggle is NOT animating.
    await expect(topNavWrap).toHaveAttribute('data-visible', 'true')
    await expect(sidebarToggle).toBeVisible()
    await expect(sidebarToggle).not.toHaveClass(/animate-nav-hint/)

    // Hide the top nav via the single sidebar control.
    await sidebarToggle.click()

    // Top nav is now hidden AND the sidebar toggle is animating to draw the eye.
    await expect(topNavWrap).toHaveAttribute('data-visible', 'false')
    await expect(sidebarToggle).toBeVisible()
    await expect(sidebarToggle).toHaveClass(/animate-nav-hint/)

    // The animation must actually be running (non-"none"), not just the class present.
    const animationName = await sidebarToggle.evaluate(
      (el) => getComputedStyle(el).animationName,
    )
    expect(animationName).toBe('rois-attention')

    // Click the animating toggle — the top nav comes back and the hint disappears.
    await sidebarToggle.click()
    await expect(topNavWrap).toHaveAttribute('data-visible', 'true')
    await expect(sidebarToggle).not.toHaveClass(/animate-nav-hint/)
  })
})
