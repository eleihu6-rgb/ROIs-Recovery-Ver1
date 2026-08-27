import { test, expect } from '@playwright/test'

import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { readHook, seedGanttAuth, seedScenarioListMocks } from '../../utils/gantt-hook'

const SCENARIO_ID = 679
const SCENARIO_NAME = 'SIT Scenario HHMM Sort'

const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
})

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

const MOCK_GANTT_DATA = {
  scenarioId: SCENARIO_ID,
  scenarioName: SCENARIO_NAME,
  fileType: 'RO' as const,
  strDtLoc: '2026-07-01T00:00:00.000Z',
  endDtLoc: '2026-07-31T23:59:59.000Z',
  scenarioStrDt: '2026-07-01T00:00:00.000Z',
  scenarioEndDt: '2026-07-31T23:59:59.000Z',
  leadinLive: 1,
  dataSource: 'db' as const,
  crew: [
    { crewId: '609', base: 'YEG', division: 'C', rank: 'FA', seniorityNum: '2', crewName: 'Crew 609' },
    { crewId: '1988', base: 'YEG', division: 'C', rank: 'FA', seniorityNum: '1', crewName: 'Crew 1988' },
    { crewId: '9000', base: 'YEG', division: 'C', rank: 'FA', seniorityNum: '3', crewName: 'Crew 9000' },
  ],
  pairings: [],
  assignments: [],
  pairingSegments: [],
  flights: [],
  groundItems: [],
  crewStats: {
    '609': { '2026-07': { credit: 5901, dayOffCount: 0, alCount: 0, leaveCount: 0 } },
    '1988': { '2026-07': { credit: 6611, dayOffCount: 0, alCount: 0, leaveCount: 0 } },
    '9000': { '2026-07': { credit: 550, dayOffCount: 0, alCount: 0, leaveCount: 0 } },
  },
}

test.describe('Scenario roster HH:MM sorting', () => {
  test('Scen-2098 — MCred desc sorts HH:MM values by minutes, not text', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await seedScenarioListMocks(page, SCENARIO_ID, SCENARIO_NAME)
    await page.route(`**/api/scenario/${SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(MOCK_GANTT_DATA)))
    await page.route(`**/api/scenario/${SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(MOCK_LOCK_STATUS)))

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const item = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()
    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })

    await page.getByTitle('Sort', { exact: true }).first().click()
    const dialog = page.getByTestId('sort-dialog')
    await dialog.getByTestId('sort-available-mcred').dblclick()
    await dialog.getByTestId('sort-order-desc').check()
    await dialog.getByTestId('sort-apply').click()
    await expect(dialog).toBeHidden()

    await expect.poll(async () => (await readHook<Array<{ crewId: string; mcred: string }>>(page, 'scenarioRosterMcred'))[0])
      .toEqual({ crewId: '1988', mcred: '110:11' })
  })
})
