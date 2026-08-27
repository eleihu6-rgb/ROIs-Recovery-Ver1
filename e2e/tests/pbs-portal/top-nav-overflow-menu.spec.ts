import { test, expect } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'

const PBS_USER = process.env.PBS_TEST_USER ?? '762'
const PBS_PASS = process.env.PBS_TEST_PASS ?? 'rois'

test.use({ storageState: { cookies: [], origins: [] } })

test('PBS top nav overflow menu is clickable at narrow width', async ({ page }) => {
  await page.setViewportSize({ width: 940, height: 720 })

  const login = new PbsLoginPage(page)
  await login.goto()
  await login.login(PBS_USER, PBS_PASS)
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 })

  const trigger = page.getByTestId('dashboard-top-nav-overflow-trigger')
  await expect(trigger).toBeVisible({ timeout: 5000 })
  await expect(trigger).toHaveCSS('cursor', 'pointer')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')

  await trigger.click()

  const menu = page.getByTestId('dashboard-top-nav-overflow-menu')
  await expect(menu).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(menu.getByRole('menuitem', { name: 'Help' })).toBeVisible()

  await menu.getByRole('menuitem', { name: 'Help' }).click()
  await page.waitForURL(/\/help$/, { timeout: 10_000 })
  await expect(page.getByTestId('dashboard-top-nav-overflow-menu')).toHaveCount(0)
})
