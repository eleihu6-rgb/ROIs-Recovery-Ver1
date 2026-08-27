/**
 * Legality param tables show a UI-only 1-based Row column that matches
 * Alert Center / recheck message prefixes ("Row N: …").
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Legality param Row Number', () => {
  test('8002 editor shows 1-based Row column for each param row', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.getByTestId('module-nav-legality').click()
    await expect(page.getByTestId('legality-rule-sets-view')).toBeVisible({ timeout: 30_000 })

    const card = page.getByTestId('legality-ruleset-card-433')
    if (await card.isVisible().catch(() => false)) {
      await card.click()
    } else {
      const cards = page.locator('[data-testid^="legality-ruleset-card-"]')
      await cards.first().click()
    }
    await expect(page.getByTestId('legality-set-name')).toBeVisible({ timeout: 10_000 })

    await page.getByTestId('legality-rule-edit-8002-001').click()
    const editor = page.getByTestId('legality-params-editor-8002-001')
    await expect(editor).toBeVisible({ timeout: 10_000 })

    await expect(page.getByTestId('legality-param-rownum-col-8002-001-0')).toHaveText('Row')

    const row0 = page.getByTestId('legality-param-rownum-8002-001-0-0')
    await expect(row0).toHaveText('1')

    const rowCount = await page.locator('[data-testid^="legality-param-rownum-8002-001-0-"]').count()
    expect(rowCount).toBeGreaterThanOrEqual(1)
    for (let i = 0; i < Math.min(rowCount, 5); i++) {
      await expect(page.getByTestId(`legality-param-rownum-8002-001-0-${i}`)).toHaveText(String(i + 1))
    }
  })
})
