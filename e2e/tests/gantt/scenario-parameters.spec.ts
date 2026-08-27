import { expect, test } from '@playwright/test'

import { ScenarioPage, type RoScenarioInput } from '../../pages/gantt/scenario-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'

test.describe('Scenario optimization parameters', () => {
  const input: RoScenarioInput = {
    name: `RO-Params-${Date.now()}`,
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    crewBase: 'YEG',
    division: 'Pilots',
  }

  let token = ''

  test.beforeEach(async ({ page, request }) => {
    token = await seedGanttAuth(page, request)
  })

  test.afterEach(async ({ request }) => {
    if (!token) return
    const listRes = await request.get(`${GANTT_API}/api/scenario`, {
      params: { page: 1, pageSize: 50, fileType: 'RO', name: input.name },
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!listRes.ok()) return
    const { data } = (await listRes.json()) as { data: { items: Array<{ id: number }> } }
    for (const item of data.items) {
      await request.delete(`${GANTT_API}/api/scenario/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  })

  test('Scen-2052 - parameters can be edited and reopened', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await scenario.createRoScenario(input)
    await expect(scenario.detailPanel).toBeVisible()

    await page.getByTestId('scenario-parameters-open').click()
    await expect(page.getByTestId('scenario-parameters-dialog')).toBeVisible()
    await expect(page.getByLabel('CA credit min hours')).toBeVisible()
    await expect(page.getByLabel('FO credit min hours')).toBeVisible()
    await expect(page.getByLabel('IFD credit min hours')).toHaveCount(0)
    await expect(page.getByLabel('FA credit min hours')).toHaveCount(0)

    await page.getByLabel('CA credit min hours').fill('76')
    await page.getByRole('button', { name: 'Done' }).click()

    await expect(page.getByTestId('scenario-parameters-dialog')).toBeHidden()
    await expect(page.getByTestId('scenario-parameters-open')).toContainText('Changed: Credit Range')
    await expect(scenario.detailPanel.getByTestId('scenario-save-btn')).toBeEnabled()
    await scenario.save()

    await page.getByTestId('scenario-parameters-open').click()
    await expect(page.getByTestId('scenario-parameters-dialog')).toBeVisible()
    await expect(page.getByLabel('CA credit min hours')).toHaveValue('76')
    await expect(page.getByTestId('scenario-parameters-open')).toContainText('Changed: Credit Range')
  })

  test('Scen-2053 - Team Rules uses Scenario division and scope candidates', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await scenario.createRoScenario(input)
    await expect(scenario.detailPanel).toBeVisible()

    await page.getByTestId('scenario-parameters-open').click()
    const parametersDialog = page.getByTestId('scenario-parameters-dialog')
    await expect(parametersDialog).toBeVisible()
    await parametersDialog.getByRole('button', { name: 'Team Rules', exact: true }).click()
    await parametersDialog.getByRole('button', { name: '+ Add Team', exact: true }).click()

    const addTeamDialog = page.getByRole('dialog', { name: 'Add Team' })
    const division = page.getByTestId('scenario-team-division')
    await expect(division).toHaveValue('P')
    await expect(division).toHaveAttribute('readonly', '')
    await expect(page.locator('select option[value="YEG"]')).toHaveCount(1)
    await expect(addTeamDialog.getByText('CA', { exact: true })).toBeVisible()
    await expect(addTeamDialog.getByText('FO', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Cancel', exact: true }).last().click()
  })

  test('Scen-2054 - Day Pressure Spread describes tie-break behavior', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await scenario.createRoScenario(input)
    await expect(scenario.detailPanel).toBeVisible()

    await page.getByTestId('scenario-parameters-open').click()
    const parametersDialog = page.getByTestId('scenario-parameters-dialog')
    await expect(parametersDialog).toBeVisible()
    await parametersDialog.getByRole('button', { name: 'Day Pressure Spread', exact: true }).click()
    await expect(parametersDialog).toContainText(
      'spread uncovered pairings and reserves evenly across the month instead of clustering them at month-end',
    )
    await expect(parametersDialog).toContainText(
      'Acts only as a tie-break below bid scores, so award/avoid preferences keep priority. Off = algorithm default (legacy ordering).',
    )
  })
})
