import { test, expect } from '@playwright/test'
import { gotoScenarioList } from '../../pages/gantt/scenario-nav'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Scenario sidebar labels', () => {
  test('Scen-2046 — Scenario sidebar uses Pairing and Roster labels and hides TO', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await gotoScenarioList(page)

    const pairing = page.getByTestId('scenario-nav-po')
    const roster = page.getByTestId('scenario-nav-ro')
    const to = page.getByTestId('scenario-nav-to')

    await expect(pairing).toContainText('Pairing')
    await expect(roster).toContainText('Roster')
    await expect(to).toHaveCount(0)
  })
})
