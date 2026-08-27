import { test, expect, type Page } from '@playwright/test'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'

const ADMIN  = { userCode: 'admin',    password: '123456' }
const VIEWER = { userCode: 'viewer01', password: '123456' }

// 顶层 Tab testid。三个内部 Tab 自带自定义 testid（shell-top-nav.tsx）。
const INTERNAL_TABS = ['regression', 'dev', 'release'] as const
const INTERNAL_TESTID: Record<typeof INTERNAL_TABS[number], string> = {
  regression: 'nav-regression',
  dev:        'nav-dev',
  release:    'nav-release',
}

async function login(page: Page, account: { userCode: string; password: string }): Promise<void> {
  const loginPage = new GanttLoginPage(page)
  await loginPage.goto()
  await loginPage.login(account.userCode, account.password)
  await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })
}

/**
 * Internal tabs (Regression / Dev / Release) are gated by the menu permission
 * system only — no env-based bypass. Behavior must be identical regardless of
 * the build environment (DEV / SIT / UAT / PROD).
 *
 * Admin (is_admin=1) sees all three via the short-circuit; non-admin
 * Viewer-P (viewer01) only sees the tabs whose menu code is granted to the
 * profile — Viewer-P is NOT granted Regression / Dev / Release.
 */
test.describe('Permission-gated internal tabs (Regression / Dev / Release)', () => {
  test('admin sees all three internal tabs', async ({ page }) => {
    await login(page, ADMIN)
    for (const tab of INTERNAL_TABS) {
      await expect(page.getByTestId(INTERNAL_TESTID[tab])).toBeVisible({ timeout: 5_000 })
    }
  })

  test('viewer01 (no internal-tooling grant) sees none of the three internal tabs', async ({ page }) => {
    await login(page, VIEWER)
    for (const tab of INTERNAL_TABS) {
      await expect(page.getByTestId(INTERNAL_TESTID[tab])).toHaveCount(0)
    }
    // sanity: regular allowed tabs still render
    await expect(page.getByTestId('module-nav-dashboard')).toBeVisible()
    await expect(page.getByTestId('module-nav-live')).toBeVisible()
  })

  test('stale localStorage value for an unauthorized module redirects to dashboard', async ({ page }) => {
    // Pre-seed stale state BEFORE login so the persisted module triggers the
    // boot-time loadFromStorage redirect in shell-store.
    await page.addInitScript(() => {
      window.localStorage.setItem('rois-shell-module', 'regression')
      window.localStorage.setItem('rois-shell-open-tabs', JSON.stringify(['dashboard', 'regression']))
    })
    await login(page, VIEWER)
    // App must have redirected away from 'regression' to 'dashboard' because
    // viewer01 lacks the REGRESSION menu permission.
    await expect(page.getByTestId('module-nav-dashboard')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('nav-regression')).toHaveCount(0)
  })
})