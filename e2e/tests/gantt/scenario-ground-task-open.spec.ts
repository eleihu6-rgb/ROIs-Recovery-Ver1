/**
 * Scenario roster double-click on a ground task (pairingId null) opens the shared
 * Ground Task dialog in view-only mode (no Scenario write API).
 *
 *   Scen-GT-1 — dblclick a mocked ground puck → dialog shows crew/assignment/times;
 *               Save / Delete controls are absent.
 *
 * Determinism: gantt-data is mocked (demo engine-server 502s). The dblclick is a real
 * canvas interaction at the puck coordinate from window.__ganttTest.scenarioRosterPuck.
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

const RO_SCENARIO_ID = 6
const RO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const OWNER_CREW = 'C0001'
const GROUND_ASSIGNMENT = 'SIM'
const GROUND_GROUP = 'GRD'

const RO_CAPABILITIES = {
  panes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

const MOCK_GROUND = {
  crewId: OWNER_CREW,
  base: 'YVR',
  depArp: 'YVR',
  arvArp: 'YYZ',
  assignmentGroup: GROUND_GROUP,
  assignment: GROUND_ASSIGNMENT,
  schStrDtUtc: '2026-03-03T09:00:00.000Z',
  schEndDtUtc: '2026-03-03T12:00:00.000Z',
  actingRank: 'CA',
  source: 'CR' as const,
  actCreditedMinutes: 180,
}

const buildGanttData = () => ({
  scenarioId: RO_SCENARIO_ID,
  scenarioName: RO_SCENARIO_NAME,
  fileType: 'RO' as const,
  capabilities: RO_CAPABILITIES,
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  scenarioStrDt: '2026-03-01T00:00:00',
  scenarioEndDt: '2026-03-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: Array.from({ length: 4 }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`,
    base: 'YEG',
    division: 'Pilots',
    rank: i % 2 === 0 ? 'CA' : 'FO',
    seniorityNum: String(i + 1),
    crewName: `Crew ${i + 1}`,
  })),
  pairings: [],
  assignments: [],
  pairingSegments: [],
  flights: [],
  groundItems: [MOCK_GROUND],
  crewStats: {},
})

const MOCK_SCENARIO_ITEM = {
  id: RO_SCENARIO_ID,
  name: RO_SCENARIO_NAME,
  fileType: 'RO',
  status: 'DONE',
  strDtLoc: '2026-03-01',
  endDtLoc: '2026-03-31',
  optimizedCount: 1,
  leadinLive: 1,
  updatedBy: 'test',
  updatedByName: 'Test User',
  updatedAt: '2026-03-05T00:00:00.000Z',
}

const MOCK_SCENARIO_DETAIL = {
  ...MOCK_SCENARIO_ITEM,
  worksetId: null,
  version: 1,
  rulesetId: 103,
  pairingScenarioId: null,
  filterParams: null,
  comments: null,
  createdBy: 'test',
  createdAt: '2026-03-01T00:00:00.000Z',
}

const NON_OWNER_LOCK = { locked: false, owner: null, ttl: null, isOwner: false }

const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
})

const openRoScenario = async (page: Page): Promise<void> => {
  await page.route('**/api/scenario?**', (route) => route.fulfill(ok({
    items: [MOCK_SCENARIO_ITEM],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  })))
  await page.route(`**/api/scenario/${RO_SCENARIO_ID}`, (route) => route.fulfill(ok(MOCK_SCENARIO_DETAIL)))

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  await page.getByPlaceholder('Search scenarios…').fill(RO_SCENARIO_NAME)
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(String(RO_SCENARIO_ID), { exact: true }),
  })
  await expect(item, `demo scenario "${RO_SCENARIO_NAME}" (#${RO_SCENARIO_ID}) must exist in demo DB`).toHaveCount(1, { timeout: 10_000 })
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()
  await expect(scenario.detailPanel.getByTestId('scenario-status-badge')).toHaveText('Done')
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })
}

const readGroundPuck = (
  page: Page,
): Promise<{ x: number; y: number; pairingId: number | null; crewId: string; itemId: number } | null> =>
  page.evaluate(
    ({ sid }) => window.__ganttTest!.scenarioRosterPuck!(sid, null) ?? null,
    { sid: RO_SCENARIO_ID },
  )

test.describe('Scenario ground task double-click', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Scen-GT-1 — dblclick ground puck opens view-only Ground Task dialog', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(buildGanttData())))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(NON_OWNER_LOCK)))

    await openRoScenario(page)

    await expect
      .poll(() => readGroundPuck(page), { timeout: 15_000, message: 'no scenario ground puck rendered' })
      .not.toBeNull()
    const puck = await readGroundPuck(page)
    expect(puck, 'ground puck probe must resolve').toBeTruthy()
    expect(puck!.pairingId).toBeNull()
    expect(puck!.crewId).toBe(OWNER_CREW)

    const canvas = page.getByTestId('scenario-roster-canvas')
    await canvas.dblclick({ position: { x: puck!.x, y: puck!.y } })

    const heading = page.getByRole('heading', { name: 'Ground Task' })
    await expect(heading).toBeVisible({ timeout: 5_000 })
    const dialog = page.getByTestId('ground-task-dialog')

    await expect(dialog.getByTestId('ground-task-view-only')).toBeVisible()
    await expect(dialog.getByText(OWNER_CREW, { exact: true })).toBeVisible()
    await expect(dialog.getByTestId('ground-task-assignment')).toContainText(GROUND_ASSIGNMENT)
    await expect(dialog.getByTestId('ground-task-dep-arp')).toContainText('YVR')
    await expect(dialog.getByTestId('ground-task-arv-arp')).toContainText('YYZ')
    await expect(dialog.getByTestId('ground-task-start-date')).not.toHaveText('Select date')
    await expect(dialog.getByTestId('ground-task-end-date')).not.toHaveText('Select date')

    // No write controls in Scenario view-only.
    await expect(dialog.getByTestId('ground-task-save-btn')).toHaveCount(0)
    await expect(dialog.getByTestId('ground-task-delete-btn')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Save Changes' })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Delete This Task' })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Close', exact: true }).nth(1)).toBeVisible()
  })
})
