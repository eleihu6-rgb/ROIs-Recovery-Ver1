/**
 * Scenario Algorithm Parameters UI — Reserve Priority default text, Add Team
 * crew selection persistence, and the Team → Team Rules delete guard.
 *
 * Uses scenario #595 (RO "Backup: TEST-New-YVR-PIlot"), reliably available on
 * the remote live-server DB.
 *
 * Requires: live-server (SCENARIO_GANTT_SOURCE=db).
 *
 * Auth: uses the gantt auth fixture (ganttLogin) because gantt stores its JWT
 * in sessionStorage, which Playwright's storageState cannot persist.
 */
import { expect, type Page } from '@playwright/test'
import { ganttAuthTest } from '../../../fixtures/gantt/auth.fixture'

async function openScenarioDetail(page: Page, id: number, nameSearch: string): Promise<void> {
  await page.goto('/altair/')
  await page.waitForLoadState('networkidle')
  await page.getByTestId('module-nav-scenario').click()
  await page.getByTestId('scenario-nav-list').click()
  await page.getByPlaceholder('Search scenarios…').fill(nameSearch)
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(String(id), { exact: true }),
  })
  await expect(item).toBeVisible({ timeout: 15_000 })
  await item.click()
  // The detail panel shows the "Algorithm Parameters" button; do NOT open the gantt.
  await expect(page.getByTestId('scenario-parameters-open')).toBeVisible({ timeout: 15_000 })
}

ganttAuthTest('Reserve Priority tab shows the algorithm default line with vertically stacked weekdays', async ({ page, ganttLogin }) => {
  await ganttLogin()
  await openScenarioDetail(page, 595, 'TEST-New-YVR-Pilot')
  await page.getByTestId('scenario-parameters-open').click()
  await expect(page.getByTestId('scenario-parameters-dialog')).toBeVisible()

  await page.getByRole('button', { name: 'Reserve Priority' }).click()
  await expect(page.getByText('Algorithm default: Thu/Fri/Sat 1, Mon/Sun 2, Tue/Wed 3.')).toBeVisible()
  const weekdayLabels = await page.locator('div.flex.flex-col label span').allTextContents()
  const filtered = weekdayLabels.filter((t) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(t.trim()))
  expect(filtered).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
  await page.getByRole('button', { name: 'Cancel' }).click()
})

ganttAuthTest('Add Team defaults all crews selected and persists unchecking a crew', async ({ page, ganttLogin }) => {
  await ganttLogin()
  await openScenarioDetail(page, 595, 'TEST-New-YVR-Pilot')
  await page.getByTestId('scenario-parameters-open').click()
  await expect(page.getByTestId('scenario-parameters-dialog')).toBeVisible()

  await page.getByRole('button', { name: 'Team Rules' }).click()
  await page.getByRole('button', { name: '+ Add Team' }).click()

  const rowCheckboxes = page.locator('tbody input[type="checkbox"]')
  await expect(rowCheckboxes.first()).toBeVisible()
  const count = await rowCheckboxes.count()
  expect(count).toBeGreaterThan(0)

  const firstCrew = page.locator('tbody tr').first().getByRole('checkbox').first()
  await firstCrew.uncheck()
  await expect(page.locator('tbody input[type="checkbox"]:checked')).toHaveCount(count - 1)

  await page.getByPlaceholder('e.g. Senior YVR CAs').fill(`E2E Crew Team ${Date.now()}`)
  await page.getByRole('button', { name: 'Done' }).click()

  // Reopen the team — the unchecked crew stays unchecked (selection persisted).
  await page.getByText(/E2E Crew Team/).locator('..').getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('button', { name: 'Done' })).toBeVisible()
  await expect(page.locator('tbody input[type="checkbox"]')).toHaveCount(count)
  await expect(page.locator('tbody input[type="checkbox"]:checked')).toHaveCount(count - 1)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
})

ganttAuthTest('deleting a Team with Team Rules is blocked until the rules are removed', async ({ page, ganttLogin }) => {
  await ganttLogin()
  await openScenarioDetail(page, 595, 'TEST-New-YVR-Pilot')
  await page.getByTestId('scenario-parameters-open').click()
  await expect(page.getByTestId('scenario-parameters-dialog')).toBeVisible()

  await page.getByRole('button', { name: 'Team Rules' }).click()

  // Create a team + a rule attached to it.
  await page.getByRole('button', { name: '+ Add Team' }).click()
  await page.getByPlaceholder('e.g. Senior YVR CAs').fill('E2E Delete Guard Team')
  await page.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: '+ Add Rule' }).click()
  await page.getByPlaceholder('e.g. No redeyes').fill('E2E Guard Rule')
  await page.getByRole('button', { name: 'Done' }).click()

  // Deleting the team is blocked and names the rule.
  // The dialog's tab content is itself a <section> wrapping both lists, so scope
  // to the innermost Teams / Team Rules sections via .last().
  const teamsSection = page.locator('section').filter({ has: page.getByRole('button', { name: '+ Add Team' }) }).last()
  const rulesSection = page.locator('section').filter({ has: page.getByRole('button', { name: '+ Add Rule' }) }).last()
  await teamsSection.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(/delete these Team Rules first/)).toBeVisible()
  await expect(page.getByText(/Cannot delete team/)).toContainText('E2E Guard Rule')

  // Delete the rule, then the team succeeds.
  await rulesSection.getByRole('button', { name: 'Delete' }).click()
  await teamsSection.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('E2E Delete Guard Team')).toBeHidden()
  await page.getByRole('button', { name: 'Cancel' }).click()
})
