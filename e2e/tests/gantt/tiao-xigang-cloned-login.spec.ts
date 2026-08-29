/**
 * Verifies the Tiao / Xigang accounts (cloned from Ryan's role + password via
 * sql/migration/2026-08-27-add-tiao-xigang-users.sql) can actually log in through
 * the real login form and reach the authenticated shell with permissions bound.
 */
import { test, expect } from '@playwright/test'

const PASSWORD = process.env.GANTT_TEST_PASS ?? 'Our2027'

for (const userCode of ['Tiao', 'Xigang']) {
  test(`${userCode} logs in via the real UI form and reaches the gantt shell`, async ({ page }) => {
    await page.goto('/altair/')
    await expect(page.getByRole('heading', { name: 'ROIS' })).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('login-user-code').click()
    await page.getByTestId('login-user-code').fill(userCode)
    await page.getByTestId('login-password').click()
    await page.getByTestId('login-password').fill(PASSWORD)
    await page.getByTestId('login-sign-in').click()

    await expect(page.getByRole('heading', { name: 'ROIS' })).not.toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })

    const stored = await page.evaluate(() => window.sessionStorage.getItem('rois-auth'))
    expect(stored, 'rois-auth session written').not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.user.userCode).toBe(userCode)
  })
}
