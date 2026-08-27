/**
 * Regression: the shared ViolationListDialog's recheck-status line must reflect THIS scenario's
 * own persisted legality status (scenario.legality_status), never the global Live group's status.
 *
 * Before the fix, ViolationListDialog hardcoded `<LegalityRecheckIndicator groupCode="pbs_solver_ruleset" />`
 * regardless of Live vs. Scenario context — so opening the alert dialog on a scenario whose OWN
 * recheck had succeeded could still show "Recheck failed" if the unrelated Live group's last
 * recheck had failed (or vice versa). This test asserts the dialog renders the scenario-specific
 * `scenario-recheck-indicator` (driven by GET /api/scenario/:id/legality's status/computedAt/
 * errorText) and never the Live `legality-recheck-indicator` when opened from a scenario.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../../pages/gantt/scenario-page'
import { seedGanttAuth, findScenario } from '../../../utils/gantt-hook'

const buildMockGanttData = (scenarioId: number, scenarioName: string) => ({
  scenarioId,
  scenarioName,
  fileType: 'RO' as const,
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
  groundItems: [],
  crewStats: {},
})

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data: body, message: 'ok' }),
})

async function openScenarioAndBell(page: import('@playwright/test').Page, id: number, name: string) {
  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  const item = await scenario.scenarioRow(id, name)
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()

  const view = page.getByTestId('scenario-gantt-view')
  await expect(view).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })

  const bell = view.getByTestId('violations-button')
  await expect(bell).toBeVisible()
  await bell.click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe('Scenario alert dialog — recheck-status line is scenario-scoped, not the Live group', () => {
  test('READY scenario shows its own "Last checked" time, not the Live indicator', async ({ page, request }) => {
    const token = await seedGanttAuth(page, request)
    const { id, name } = await findScenario(request, token, { fileType: 'RO', status: 'DONE' })

    await page.route(`**/api/scenario/${id}/gantt-data`, (route) => route.fulfill(json(buildMockGanttData(id, name))))
    await page.route(`**/api/scenario/${id}/lock-status`, (route) => route.fulfill(json(MOCK_LOCK_STATUS)))
    await page.route(`**/api/scenario/${id}/legality`, (route) => route.fulfill(json({
      status: 'READY', violations: [], computedAt: '2026-07-07T08:00:00.000Z', errorText: null,
    })))

    const dialog = await openScenarioAndBell(page, id, name)

    await expect(dialog.getByTestId('scenario-recheck-indicator')).toBeVisible()
    await expect(dialog.getByTestId('scenario-recheck-label')).toContainText('Last checked')
    await expect(dialog.getByTestId('legality-recheck-indicator')).toHaveCount(0)
  })

  test('FAILED scenario shows its own "Recheck failed", not a stale Live-group status', async ({ page, request }) => {
    const token = await seedGanttAuth(page, request)
    const { id, name } = await findScenario(request, token, { fileType: 'RO', status: 'DONE' })

    await page.route(`**/api/scenario/${id}/gantt-data`, (route) => route.fulfill(json(buildMockGanttData(id, name))))
    await page.route(`**/api/scenario/${id}/lock-status`, (route) => route.fulfill(json(MOCK_LOCK_STATUS)))
    await page.route(`**/api/scenario/${id}/legality`, (route) => route.fulfill(json({
      status: 'FAILED', violations: [], computedAt: null,
      errorText: "rule-engine binary 'check-8002' is missing",
    })))

    const dialog = await openScenarioAndBell(page, id, name)

    await expect(dialog.getByTestId('scenario-recheck-indicator')).toBeVisible()
    await expect(dialog.getByTestId('scenario-recheck-label')).toContainText('Recheck failed')
    await expect(dialog.getByTestId('legality-recheck-indicator')).toHaveCount(0)
  })
})
