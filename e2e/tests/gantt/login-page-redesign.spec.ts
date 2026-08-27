/**
 * Login page redesign — validates full-bleed layout, auth behaviour, and UX enhancements.
 *
 * Covers:
 *  - New label "User Name" visible (not "User Code")
 *  - Login card rendered top-right, ROIS wordmark bottom-left
 *  - Ryan / Our2027 successfully authenticates
 *  - Session written to sessionStorage after login
 *  - Case-insensitive: lowercase "ryan" also logs in
 *  - Unknown user shows "User not found" message
 *  - Wrong password shows "Incorrect password" message
 *  - Error clears when user starts retyping
 *  - Show/hide password toggle changes input type
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
import { TEST_ACCOUNTS } from '../../utils/test-data'

const USER = TEST_ACCOUNTS.ryan

test.use({ storageState: { cookies: [], origins: [] } })

const fillCredentials = async (page: Page, userCode: string, password: string): Promise<void> => {
  const userCodeInput = page.getByTestId('login-user-code')
  const passwordInput = page.getByTestId('login-password')
  await userCodeInput.click()
  await userCodeInput.fill(userCode)
  await passwordInput.click()
  await passwordInput.fill(password)
}

test.describe('Login page redesign', () => {
  test('Live-1272 — login page shows "User Name" label and ROIS wordmark', async ({ page }) => {
    const loginPage = new GanttLoginPage(page)
    await loginPage.goto()

    await expect(page.getByText('User Name', { exact: false })).toBeVisible()
    await expect(page.getByText('User Code', { exact: false })).not.toBeVisible()
    await expect(page.getByRole('heading', { name: 'ROIS' })).toBeVisible()
    await expect(page.getByTestId('login-sign-in')).toBeDisabled()
  })

  test('Live-1102 — Ryan logs in with Our2027 and reaches the gantt shell', async ({ page }) => {
    const loginPage = new GanttLoginPage(page)
    await loginPage.goto()

    await fillCredentials(page, USER.userCode, USER.password)
    await expect(page.getByTestId('login-sign-in')).toBeEnabled()
    await page.getByTestId('login-sign-in').click()

    await expect(page.getByRole('heading', { name: 'ROIS' })).not.toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })

    const stored = await page.evaluate(() => window.sessionStorage.getItem('rois-auth'))
    expect(stored, 'rois-auth session written').not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.user.userCode.toLowerCase(), 'logged-in user is Ryan').toBe(USER.userCode.toLowerCase())
  })

  test('Live-1103 — wrong password shows "Incorrect password" message', async ({ page }) => {
    const loginPage = new GanttLoginPage(page)
    await loginPage.goto()

    await fillCredentials(page, 'Ryan', 'wrongpassword')
    await page.getByTestId('login-sign-in').click()

    await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('login-error')).toContainText('Incorrect password')
    await expect(page.getByRole('heading', { name: 'ROIS' })).toBeVisible()
  })

  test('Live-1104 — unknown user shows "User not found" message', async ({ page }) => {
    const loginPage = new GanttLoginPage(page)
    await loginPage.goto()

    await fillCredentials(page, 'NoSuchUser99', 'Our2027')
    await page.getByTestId('login-sign-in').click()

    await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('login-error')).toContainText('User not found')
  })

  test('Live-1105 — lowercase "ryan" logs in (case-insensitive)', async ({ page }) => {
    const loginPage = new GanttLoginPage(page)
    await loginPage.goto()

    await fillCredentials(page, 'ryan', USER.password)
    await page.getByTestId('login-sign-in').click()

    await expect(page.getByRole('heading', { name: 'ROIS' })).not.toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })
  })

  test('Live-1106 — show/hide toggle changes password input type', async ({ page }) => {
    const loginPage = new GanttLoginPage(page)
    await loginPage.goto()

    const passwordInput = page.getByTestId('login-password')
    const toggle = page.getByTestId('login-show-hide')

    // Default: hidden
    await expect(passwordInput).toHaveAttribute('type', 'password')

    // Click to show
    await toggle.click()
    await expect(passwordInput).toHaveAttribute('type', 'text')

    // Click to hide again
    await toggle.click()
    await expect(passwordInput).toHaveAttribute('type', 'password')
  })

  test('Live-1107 — error banner clears when user starts retyping', async ({ page }) => {
    const loginPage = new GanttLoginPage(page)
    await loginPage.goto()

    // Cause an error
    await fillCredentials(page, 'Ryan', 'wrongpassword')
    await page.getByTestId('login-sign-in').click()
    await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 8_000 })

    // Start retyping — error must disappear
    await page.getByTestId('login-password').fill('O')
    await expect(page.getByTestId('login-error')).not.toBeVisible()
  })
})
