import { test, expect } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'

const PBS_USER = process.env.PBS_TEST_USER ?? '762'
const PBS_PASS = process.env.PBS_TEST_PASS ?? 'rois'

test.use({ storageState: { cookies: [], origins: [] } })

test('PBS-3100 — version badge Ver:B/F visible in top nav after login', async ({ page }) => {
  const login = new PbsLoginPage(page)
  await login.goto()
  await login.login(PBS_USER, PBS_PASS)

  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 })

  const badge = page.locator('[data-testid="pbs-version-badge"]')
  await expect(badge).toBeVisible({ timeout: 5000 })
  await expect(badge).toContainText('Ver:B')
  await expect(badge).toContainText('/F')
})
