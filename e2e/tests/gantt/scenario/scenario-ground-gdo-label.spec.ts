/**
 * Scen — Live GDO label preserved on Scenario ground pucks.
 *
 * Live stores day-off as assignment=DO + label=GDO. Scenario lead-in / groundItems
 * must carry `label` through to buildScenarioRosterItems so the puck draws "GDO"
 * (same as Live buildGroundTaskPuckLabel), not the generic "DO".
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../../pages/gantt/scenario-page'
import { seedGanttAuth, seedScenarioListMocks } from '../../../utils/gantt-hook'

const SCENARIO_ID = 6
const SCENARIO_NAME = 'RO-2026-06 YEG Test---'

const MOCK_GANTT_DATA = {
  scenarioId: SCENARIO_ID,
  scenarioName: SCENARIO_NAME,
  fileType: 'RO' as const,
  capabilities: {
    panes: ['roster', 'pairing'],
    defaultPanes: ['roster'],
    roster: { canAssign: false, canRemove: false, canReassign: false },
    pairing: { canEditSegments: false },
  },
  strDtLoc: '2026-06-01T00:00:00.000Z',
  endDtLoc: '2026-06-30T23:59:59.000Z',
  scenarioStrDt: '2026-06-01T00:00:00',
  scenarioEndDt: '2026-06-30T00:00:00',
  leadinLive: 1,
  dataSource: 'seed' as const,
  readOnly: true,
  crew: [
    { crewId: 'C0001', base: 'YVR', division: 'C', rank: 'FA', seniorityNum: '1', crewName: 'Crew 1' },
  ],
  pairings: [],
  assignments: [],
  pairingSegments: [],
  flights: [],
  groundItems: [
    {
      crewId: 'C0001',
      base: 'YVR',
      assignmentGroup: 'DO',
      assignment: 'DO',
      label: 'GDO',
      schStrDtUtc: '2026-06-05T07:01:00.000Z',
      schEndDtUtc: '2026-06-06T07:00:00.000Z',
      actingRank: '',
      source: 'PA' as const,
    },
    {
      crewId: 'C0001',
      base: 'YVR',
      assignmentGroup: 'DO',
      assignment: 'DO',
      label: 'MLOA',
      schStrDtUtc: '2026-06-07T07:01:00.000Z',
      schEndDtUtc: '2026-06-08T07:00:00.000Z',
      actingRank: '',
      source: 'PA' as const,
    },
  ],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }
const MOCK_LEGALITY = { status: 'READY' as const, violations: [] }

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data: body, message: 'ok' }),
})

type GroundPuck = { crewId: string; assignmentGroup: string; assignment: string; label: string }

const groundPucks = (page: Page): Promise<GroundPuck[]> =>
  page.evaluate((id) => {
    const hook = (window as unknown as {
      __ganttTest?: { scenarioGroundPucks: (scenarioId: number) => GroundPuck[] | null }
    }).__ganttTest
    return hook?.scenarioGroundPucks(id) ?? []
  }, SCENARIO_ID)

test.describe('Scenario ground puck labels from Live label', () => {
  test('Scen — DO+label GDO/MLOA render as GDO/MLOA not DO', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await seedScenarioListMocks(page, SCENARIO_ID, SCENARIO_NAME)
    await page.route(`**/api/scenario/${SCENARIO_ID}/gantt-data`, (route) => route.fulfill(json(MOCK_GANTT_DATA)))
    await page.route(`**/api/scenario/${SCENARIO_ID}/lock-status`, (route) => route.fulfill(json(MOCK_LOCK_STATUS)))
    await page.route(`**/api/scenario/${SCENARIO_ID}/legality`, (route) => route.fulfill(json(MOCK_LEGALITY)))

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const item = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()

    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })

    await expect.poll(async () => (await groundPucks(page)).length, { timeout: 15_000 }).toBe(2)

    const pucks = await groundPucks(page)
    expect(pucks).toEqual(expect.arrayContaining([
      expect.objectContaining({ crewId: 'C0001', assignment: 'DO', label: 'GDO' }),
      expect.objectContaining({ crewId: 'C0001', assignment: 'DO', label: 'MLOA' }),
    ]))
    // Regression: must not collapse specific labels back to generic DO.
    expect(pucks.every((p) => p.label !== 'DO')).toBe(true)
  })
})
