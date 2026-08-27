import { expect, type Page } from '@playwright/test'

const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

export const loginToGantt = async (page: Page, base: string): Promise<void> => {
  await page.goto(`${base}/altair/`)

  if (await page.getByTestId('nav-help').isVisible().catch(() => false)) return

  await page.getByTestId('login-user-code').fill(GANTT_USER)
  await page.getByTestId('login-password').fill(GANTT_PASS)
  await page.getByTestId('login-sign-in').click()
  await expect(page.getByTestId('nav-help')).toBeVisible({ timeout: 20_000 })
}

export const openHelp = async (page: Page, base: string): Promise<void> => {
  await loginToGantt(page, base)
  await page.getByTestId('nav-help').click()
  await expect(page.getByTestId('help-view')).toBeVisible({ timeout: 5_000 })
}
