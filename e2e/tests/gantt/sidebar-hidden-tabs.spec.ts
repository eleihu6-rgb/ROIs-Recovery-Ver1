import { expect, test } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Sidebar hidden customer tabs', () => {
  test('Live and Legality sidebars hide currently unused submenu tabs', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')

    await page.getByTestId('module-nav-live').click()
    await expect(page.getByTestId('live-nav-roster')).toBeVisible()
    await expect(page.getByTestId('live-nav-pairing')).toHaveCount(0)
    await expect(page.getByTestId('live-nav-flight')).toHaveCount(0)

    await page.getByTestId('module-nav-legality').click()
    await expect(page.getByTestId('legality-nav-rule-sets')).toBeVisible()
    await expect(page.getByTestId('legality-nav-rule-instances')).toBeVisible()
    await expect(page.getByTestId('legality-nav-composition')).toHaveCount(0)
    await expect(page.getByTestId('legality-nav-comp-load')).toHaveCount(0)
  })
})
