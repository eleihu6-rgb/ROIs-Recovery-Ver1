import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

/**
 * Session Timeout warning dialog (gantt/src/components/auth/session-timeout-dialog.tsx).
 *
 * In production this is raised by a 1-hour idle timer — impractical to wait for in e2e —
 * so we drive it with the __ganttTest.forceSessionTimeout() hook, which sets the exact
 * auth-store state the real idle check sets. We then exercise BOTH actions:
 *  - "Stay Logged In" dismisses the warning (stays in the app).
 *  - "Sign Out" logs the user out (returns to the login screen).
 */
const forceTimeout = (page: Page, secondsLeft = 180): Promise<void> =>
  page.evaluate((s) => {
    (window.__ganttTest as unknown as { forceSessionTimeout: (n: number) => void }).forceSessionTimeout(s)
  }, secondsLeft)

test.describe('Session Timeout dialog', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  })

  test('SessTimeout-1 — warning shows the countdown and "Stay Logged In" dismisses it', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Session Timeout' })).toHaveCount(0)

    await forceTimeout(page, 180)

    const heading = page.getByRole('heading', { name: 'Session Timeout' })
    await expect(heading).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.fixed.inset-0.z-\\[9999\\].bg-black\\/25')).toBeVisible()
    const dialog = page.locator('div.bg-card').filter({ has: heading })

    // Real content: the inactivity message, the countdown label, and a m:ss value.
    await expect(dialog.getByText(/inactive for over 1 hour/)).toBeVisible()
    await expect(dialog.getByText('Auto logout in')).toBeVisible()
    await expect(dialog.getByText(/^[0-3]:\d{2}$/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Sign Out' })).toBeVisible()

    // Stay Logged In dismisses the warning; the user remains in the app (no login screen).
    await dialog.getByRole('button', { name: 'Stay Logged In' }).click()
    await expect(page.getByRole('heading', { name: 'Session Timeout' })).toHaveCount(0)
    await expect(page.getByTestId('login-sign-in')).toHaveCount(0)
  })

  test('SessTimeout-2 — "Sign Out" logs the user out to the login screen', async ({ page }) => {
    await forceTimeout(page, 180)
    const heading = page.getByRole('heading', { name: 'Session Timeout' })
    await expect(heading).toBeVisible({ timeout: 5_000 })

    await page.locator('div.bg-card').filter({ has: heading }).getByRole('button', { name: 'Sign Out' }).click()

    // Logged out → warning gone and the login form is shown.
    await expect(page.getByRole('heading', { name: 'Session Timeout' })).toHaveCount(0)
    await expect(page.getByTestId('login-sign-in')).toBeVisible({ timeout: 5_000 })
  })
})
