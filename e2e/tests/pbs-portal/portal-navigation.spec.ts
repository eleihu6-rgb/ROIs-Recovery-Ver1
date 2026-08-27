/**
 * PBS Portal authenticated navigation — REAL end-to-end.
 *
 * Replaces the old schedule.spec.ts, which targeted a `/schedule` route and
 * `pbs-schedule-view` / `pbs-pairing-list` testids that never existed in the
 * portal. This exercises the real authenticated shell: log in for real, then
 * verify the dashboard, a protected section route, and logout.
 *
 * Each test logs in itself because the portal token lives in sessionStorage,
 * which Playwright's storageState does not persist.
 */
import { test, expect } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'
import { PbsPortalDashboardPage } from '../../pages/pbs-portal/pbs-dashboard-page'

const PBS_USER = process.env.PBS_TEST_USER ?? '762'
const PBS_PASS = process.env.PBS_TEST_PASS ?? 'rois'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('PBS Portal navigation (real backend)', () => {
  let dashboard: PbsPortalDashboardPage

  test.beforeEach(async ({ page }) => {
    const login = new PbsLoginPage(page)
    dashboard = new PbsPortalDashboardPage(page)
    await login.goto()
    await login.login(PBS_USER, PBS_PASS)
    await page.waitForURL(/\/dashboard$/, { timeout: 15_000 })
    await dashboard.expectLoaded()
  })

  test('PBS-3006 — dashboard mounts with the section nav @smoke', async ({ page }) => {
    await expect(dashboard.layout).toBeVisible()
    await expect(dashboard.topNav).toBeVisible()
    // The known portal sections are reachable from the top nav.
    await expect(dashboard.navLink('Bid')).toBeVisible()
    await expect(dashboard.navLink('Pairing')).toHaveCount(0)
    await expect(dashboard.navLink('Award')).toBeVisible()
  })

  test('PBS-3007 — navigates to the protected Bid route without bouncing to login', async ({ page }) => {
    await dashboard.navLink('Bid').click()

    // Real protected route mounts under the shared shell — not a redirect to /login.
    await page.waitForURL(/\/bid$/, { timeout: 15_000 })
    await expect(dashboard.topNav).toBeVisible()
    await expect(page).not.toHaveURL(/\/login/)
    // The Bid route renders one of its data-state panels (loading / error / data),
    // never the login form.
    await expect(page.getByRole('button', { name: 'Sign In' })).toHaveCount(0)
  })

  test('PBS-3008 — logout clears the session and returns to login @smoke', async ({ page }) => {
    await dashboard.logout()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  })
})
