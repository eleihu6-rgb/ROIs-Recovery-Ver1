/**
 * PBS Portal Azure SSO login UI tests.
 *
 * The pbs-portal SSO button + token-callback flow already existed; this feature
 * wires the backend (/auth/sso/login + /auth/sso/callback). These tests lock the
 * UI entry (button → redirect to /auth/sso/login). Real Azure round-trip is
 * covered by pbs-server Vitest (see src/routes/sso.test.ts) and manual UAT checks.
 */
import { test, expect } from '@playwright/test'

test.describe('PBS Portal Azure SSO login', () => {
  test('SSO 按钮点击跳转 sso/login', async ({ page }) => {
    await page.goto('/pbs/login')
    const ssoBtn = page.getByRole('button', { name: 'SSO Login' })
    await expect(ssoBtn).toBeVisible()

    const reqPromise = page.waitForRequest((r) => r.url().includes('/auth/sso/login'))
    await ssoBtn.click()
    const req = await reqPromise
    expect(req.method()).toBe('GET')
  })
})
