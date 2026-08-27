/**
 * Gantt Auth Tests.
 *
 * Tests for the Gantt independent login system.
 * Auth: JWT via POST /api/auth/login, stored in sessionStorage.
 * Isolated from PBS auth (no shared tokens or sessions).
 */
import { test, expect } from '@playwright/test'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
import { TEST_ACCOUNTS } from '../../utils/test-data'

test.describe('Gantt Authentication', () => {
  let loginPage: GanttLoginPage

  test.beforeEach(async ({ page }) => {
    loginPage = new GanttLoginPage(page)
  })

  test('Live-1006 — should display the login page @smoke', async ({ page }) => {
    await loginPage.goto()
    await loginPage.expectVisible()
    await expect(page).toHaveTitle(/ROIS|Gantt|Crew/i)
  })

  test('Live-1007 — should login successfully with valid credentials @smoke', async ({ page }) => {
    await loginPage.goto()
    await loginPage.login(TEST_ACCOUNTS.admin.userCode, TEST_ACCOUNTS.admin.password)

    // After login, should be redirected to the Gantt view
    // Check for Gantt-specific elements
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })
  })

  test('Live-1008 — should show error with invalid credentials', async ({ page }) => {
    await loginPage.goto()
    await loginPage.userCodeInput.fill('invalid_user')
    await loginPage.passwordInput.fill('wrong_password')
    await loginPage.signInButton.click()

    // Error message should appear
    await expect(loginPage.errorMessage).toBeVisible({ timeout: 5_000 })

    // Should still be on login page
    await loginPage.expectVisible()
  })

  test('Live-1009 — should show error with empty credentials', async ({ page }) => {
    await loginPage.goto()
    // Try to submit without filling anything
    await page.keyboard.press('Enter')

    // Should not redirect — still on login
    await loginPage.expectVisible()
  })

  test('Live-1010 — should persist session in sessionStorage', async ({ page }) => {
    await loginPage.goto()
    await loginPage.login(TEST_ACCOUNTS.admin.userCode, TEST_ACCOUNTS.admin.password)

    // Wait for redirect
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })

    // Verify sessionStorage has auth data
    const stored = await page.evaluate(() => window.sessionStorage.getItem('rois-auth'))
    expect(stored).not.toBeNull()

    const parsed = JSON.parse(stored!)
    expect(parsed).toHaveProperty('token')
    expect(parsed).toHaveProperty('user')
  })

  test('Live-1011 — should logout and clear session', async ({ page }) => {
    // Login first
    await loginPage.goto()
    await loginPage.login(TEST_ACCOUNTS.admin.userCode, TEST_ACCOUNTS.admin.password)
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })

    // Logout via user menu or logout button
    const logoutBtn = page.getByTestId('logout-btn')
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click()
    } else {
      // Try user menu
      await page.getByTestId('user-menu').click()
      await page.getByTestId('user-menu-logout').click()
    }

    // Should redirect to login
    await expect(page.getByTestId('login-sign-in')).toBeVisible({ timeout: 10_000 })

    // SessionStorage should be cleared
    const stored = await page.evaluate(() => window.sessionStorage.getItem('rois-auth'))
    expect(stored).toBeNull()
  })
})
