import { expect, test } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Altair URL routing and branding', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Altair-7001 - /altair/ loads dashboard with Altair title', async ({ page }) => {
    await page.goto('/altair/')
    await expect(page).toHaveTitle('ROIs Altair')
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/altair\/$/)
  })

  test('Altair-7002 - clicking Live and Scenario updates the URL', async ({ page }) => {
    await page.goto('/altair/')
    await page.getByTestId('module-nav-live').click()
    await expect(page).toHaveURL(/\/altair\/live$/)

    await page.getByTestId('module-nav-scenario').click()
    await expect(page).toHaveURL(/\/altair\/scenario$/)
  })

  test('Altair-7003 - direct scenario URL opens the scenario Gantt tab', async ({ page }) => {
    await page.route('**/api/scenario/577/gantt-data', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 500, data: null, message: 'Scenario 577 fixture intentionally absent' }),
    }))
    await page.route('**/api/scenario/577/lock-status', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { locked: false, owner: null, expiresAt: null } }),
    }))
    await page.route('**/api/scenario/577/legality', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { status: 'DONE', violations: [] } }),
    }))

    await page.goto('/altair/scenario/577')
    await expect(page).toHaveURL(/\/altair\/scenario\/577$/)
    await expect(page.getByText('Scenario 577 fixture intentionally absent')).toBeVisible({ timeout: 15_000 })
  })

  test('Altair-7004 - browser back restores the prior module URL', async ({ page }) => {
    await page.goto('/altair/')
    await page.getByTestId('module-nav-live').click()
    await expect(page).toHaveURL(/\/altair\/live$/)
    await page.getByTestId('module-nav-scenario').click()
    await expect(page).toHaveURL(/\/altair\/scenario$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/altair\/live$/)
  })

  test('Altair-7005 - missing direct scenario URL redirects to Scenario', async ({ page }) => {
    await page.route('**/api/scenario/77/gantt-data', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 404, data: null, message: 'Scenario not found' }),
    }))
    await page.route('**/api/scenario/77/lock-status', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { locked: false, owner: null, expiresAt: null } }),
    }))
    await page.route('**/api/scenario/77/legality', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { status: 'DONE', violations: [] } }),
    }))

    await page.goto('/altair/scenario/77')
    await expect(page).toHaveURL(/\/altair\/scenario\/77$/)
    await expect(page.getByText('Error: Scenario not found')).toHaveCount(0)
  })
})
