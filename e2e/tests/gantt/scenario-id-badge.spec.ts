import { test, expect, type Locator } from '@playwright/test'
import { gotoScenarioList } from '../../pages/gantt/scenario-nav'
import { seedGanttAuth } from '../../utils/gantt-hook'

/**
 * Scenario badges — success badges must remain readable on selected or
 * hover-highlighted rows and in the detail panel. Regression intent
 * (2026-07-24 request): the old translucent emerald text was too faint against
 * light backgrounds.
 */
test.describe('Scenario id badge', () => {
  const readBadgeStyle = async (locator: Locator): Promise<{
    fontSize: string
    fontWeight: string
    backgroundColor: string
    color: string
    borderTopWidth: string
  }> => locator.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      backgroundColor: cs.backgroundColor,
      color: cs.color,
      borderTopWidth: cs.borderTopWidth,
    }
  })

  const expectSuccessBadgeStyle = (style: Awaited<ReturnType<typeof readBadgeStyle>>): void => {
    expect(style.backgroundColor).toBe('rgb(223, 247, 234)')
    expect(style.color).toBe('rgb(6, 95, 70)')
    expect(parseFloat(style.fontWeight)).toBeGreaterThanOrEqual(600)
    expect(style.borderTopWidth).toBe('0px')
  }

  test('Scen-2016 — RO / Done success badges use the readable no-border success palette', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.waitForLoadState('networkidle')
    await gotoScenarioList(page)

    const roItem = page.getByTestId('scenario-list-item').filter({
      has: page.getByTestId('scenario-item-type').getByText('RO', { exact: true }),
    }).first()
    await expect(roItem).toBeVisible({ timeout: 30_000 })

    const idBadge = roItem.getByTestId('scenario-item-id')
    await expect(idBadge).toBeVisible()
    await expect(idBadge).toHaveText(/^\d+$/)

    const idStyle = await readBadgeStyle(idBadge)
    expect(parseFloat(idStyle.fontSize)).toBeGreaterThanOrEqual(14)
    expectSuccessBadgeStyle(idStyle)

    const positiveCountBadge = page.getByTestId('scenario-item-optimized-count').filter({
      hasText: /^[1-9]\d* results?$/,
    }).first()
    await expect(positiveCountBadge).toBeVisible({ timeout: 30_000 })
    expectSuccessBadgeStyle(await readBadgeStyle(positiveCountBadge))

    const doneRoItem = page.getByTestId('scenario-list-item')
      .filter({ has: page.getByTestId('scenario-item-type').getByText('RO', { exact: true }) })
      .filter({ has: page.locator('[aria-label="Scenario status: Done"]') })
      .first()
    await expect(doneRoItem).toBeVisible({ timeout: 30_000 })
    await doneRoItem.click()

    const detailTypeBadge = page.getByTestId('scenario-type-badge')
    await expect(detailTypeBadge).toHaveText('RO')
    expectSuccessBadgeStyle(await readBadgeStyle(detailTypeBadge))

    const detailStatusBadge = page.getByTestId('scenario-status-badge')
    await expect(detailStatusBadge).toHaveText('Done')
    expectSuccessBadgeStyle(await readBadgeStyle(detailStatusBadge))
  })
})
