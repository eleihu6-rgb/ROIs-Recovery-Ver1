/**
 * PBS Portal Authentication — REAL end-to-end smoke.
 *
 * Unlike portal-smoke.spec.ts (which mocks /api/auth/session to test routing in
 * isolation), this exercises the real contract: portal UI → vite /api proxy →
 * pbs-server → DB. It catches backend/proxy/contract regressions the mocks can't.
 *
 * Account: PBS portal users are numeric crew codes with the shared demo password
 * 'rois' (override via PBS_TEST_USER / PBS_TEST_PASS). Token lives in
 * sessionStorage('pbs-portal.auth.token'); success lands on /dashboard.
 */
import { test, expect } from '@playwright/test'
import { PbsLoginPage, PBS_AUTH_TOKEN_KEY } from '../../pages/pbs-portal/pbs-login-page'
import { PbsPortalDashboardPage } from '../../pages/pbs-portal/pbs-dashboard-page'

const PBS_USER = process.env.PBS_TEST_USER ?? '762'
const PBS_PASS = process.env.PBS_TEST_PASS ?? 'rois'

// Start every test unauthenticated (the project storageState carries no token,
// but be explicit so these tests don't depend on that detail).
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('PBS Portal Authentication (real backend)', () => {
  test('PBS-3003 — renders the login form @smoke', async ({ page }) => {
    const login = new PbsLoginPage(page)
    await login.goto()
    await login.expectVisible()
    await expect(login.ssoButton).toBeVisible()

    const form = page.locator('form#pbs-portal-login-form')
    await expect(form).toHaveCount(1)
    await expect(form).toHaveAttribute('name', 'pbs-portal-login-form')
    await expect(form).toHaveAttribute('action', /\/api\/auth\/session$/)
    await expect(form).toHaveAttribute('autocomplete', 'on')
    await expect(form).toHaveAttribute('method', 'post')
    await expect(form.locator('input[name="pbsPortalUserCode"]')).toHaveAttribute(
      'autocomplete',
      'section-pbs username',
    )
    await expect(form.locator('input[name="pbsPortalUserCode"]')).not.toHaveAttribute('readonly', '')
    await expect(form.locator('input[name="pbsPortalPassword"]')).toHaveAttribute(
      'autocomplete',
      'section-pbs current-password',
    )
    await expect(form.locator('input[name="pbsPortalPassword"]')).not.toHaveAttribute('readonly', '')

    await page.evaluate(() => {
      const userInput = document.querySelector<HTMLInputElement>('input[name="pbsPortalUserCode"]')
      const passwordInput = document.querySelector<HTMLInputElement>('input[name="pbsPortalPassword"]')
      if (!userInput || !passwordInput) throw new Error('Login fields are missing')
      userInput.value = '654'
      passwordInput.value = 'portal-password'
    })

    await page.waitForTimeout(300)
    await page.locator('label:has(input[name="pbsPortalPassword"]) button').last().click()
    await expect(login.userCodeInput).toHaveValue('654')
    await expect(login.passwordInput).toHaveValue('portal-password')
  })

  test('PBS-3004 — valid credentials log in, land on the dashboard, and store a token @smoke', async ({ page }) => {
    const login = new PbsLoginPage(page)
    const dashboard = new PbsPortalDashboardPage(page)
    let loginPayload: Record<string, unknown> | null = null

    await page.route('**/api/auth/session', async (route) => {
      if (route.request().method() === 'POST') {
        loginPayload = route.request().postDataJSON() as Record<string, unknown>
      }

      await route.continue()
    })

    await login.goto()
    await login.login(PBS_USER, PBS_PASS)

    // Real redirect to the protected dashboard, which actually mounts.
    await page.waitForURL(/\/dashboard$/, { timeout: 15_000 })
    await dashboard.expectLoaded()

    // The portal persisted a real JWT to sessionStorage under its known key.
    const token = await page.evaluate(
      (key) => window.sessionStorage.getItem(key),
      PBS_AUTH_TOKEN_KEY,
    )
    expect(token, 'a JWT should be stored after login').toBeTruthy()
    expect(token!.split('.').length, 'token looks like a JWT').toBe(3)

    expect(loginPayload, 'login POST payload should be captured').toBeTruthy()
    const payload = loginPayload as {
      userCode?: string
      encryptedPassword?: string
      encryption?: { algorithm?: string; keyId?: string }
      password?: string
    }
    expect(payload.userCode).toBe(PBS_USER)
    expect(payload.encryptedPassword).toEqual(expect.any(String))
    expect(payload.encryption?.algorithm).toBe('RSA-OAEP-256')
    expect(payload.encryption?.keyId).toEqual(expect.any(String))
    expect(payload.password).toBeUndefined()
    expect(JSON.stringify(payload)).not.toContain(PBS_PASS)
  })

  test('PBS-3005 — invalid credentials surface the server error and stay on login', async ({ page }) => {
    const login = new PbsLoginPage(page)
    await login.goto()
    await login.login('999000999', 'definitely-wrong')

    // A login error is surfaced and we do not advance off /login. (The portal
    // currently shows axios's "Request failed with status code 401" rather than
    // the server's friendly message — a flagged UX gap; see docs/handoff.)
    await login.expectError()
    await expect(page).toHaveURL(/\/login$/)
    await login.expectVisible()

    // And nothing was stored.
    const token = await page.evaluate(
      (key) => window.sessionStorage.getItem(key),
      PBS_AUTH_TOKEN_KEY,
    )
    expect(token, 'no token after a failed login').toBeNull()
  })
})
