import { test, expect } from '@playwright/test'

test.describe('Data Quality Monitor', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.fill('[name="userCode"], input[placeholder*="user" i]', 'admin')
    await page.fill('[name="password"], input[type="password"]', '123456')
    await page.click('button[type="submit"]')
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('data quality monitor runs checks and shows results', async ({ page }) => {
    // Navigate to System → Data Quality
    await page.goto('/#system/data-quality')
    // Or click through shell sidebar
    await page.waitForSelector('[data-testid="data-quality-monitor"]', { timeout: 5000 })
      .catch(async () => {
        // Try clicking system module item via sidebar
        const systemItem = page.locator('[data-testid="system-nav-data-quality"]')
        if (await systemItem.isVisible()) {
          await systemItem.click()
        }
      })

    // The monitor panel should be visible
    const panel = page.locator('[data-testid="data-quality-monitor"]')
    await expect(panel).toBeVisible({ timeout: 8000 })

    // Click "Run Checks"
    const runBtn = panel.locator('[data-testid="dq-run-checks-btn"]')
    await expect(runBtn).toBeVisible()
    await runBtn.click()

    // Wait for the checks list to appear (API call completes)
    const checksList = panel.locator('[data-testid="dq-checks-list"]')
    await expect(checksList).toBeVisible({ timeout: 30000 })

    // At least one check row should appear with a result
    const checkRows = checksList.locator('[data-testid^="dq-check-"]')
    await expect(checkRows).toHaveCount(await checkRows.count())
    expect(await checkRows.count()).toBeGreaterThan(0)

    // Each visible check row has a name (some text, not empty)
    const firstRow = checkRows.first()
    await expect(firstRow).toBeVisible()
    // The check shows either "OK" badge or a count badge
    const hasBadge = await firstRow.locator('.badge, [class*="Badge"]').count()
    expect(hasBadge).toBeGreaterThan(0)
  })
})
