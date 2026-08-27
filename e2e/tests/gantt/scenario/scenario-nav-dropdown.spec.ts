/**
 * Scenario top-nav dropdown — replaces the old right-extending scenario tabs.
 * The "Scenario" tab is now a dropdown: "Scenarios" navigates to the
 * management view; currently opened scenario Gantts are listed directly below
 * it, letting users switch to one or close it.
 *
 * Scen-2050/2052 use scenario #595 (RO "Backup: TEST-New-YVR-Pilot") which is
 * reliably available on the remote live-server DB.
 *
 * Requires: live-server (SCENARIO_GANTT_SOURCE=db).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

interface Auth { token: string; userCode: string; userName: string; schema: string }

const login = async (request: APIRequestContext): Promise<Auth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, { data: { userCode: GANTT_USER, password: GANTT_PASS } })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { data: Auth }).data
}

/**
 * Navigate to the scenario list, search for a scenario by name fragment, open it,
 * and wait for the gantt canvas to be visible.
 * nameSearch — substring to type into the search field (scenario name, not the "#id" prefix)
 */
async function openScenarioById(page: Page, id: number, nameSearch: string): Promise<void> {
  await page.goto('/altair/')
  await page.waitForLoadState('networkidle')
  await page.getByTestId('module-nav-scenario').click()
  await page.getByTestId('scenario-nav-list').click()
  await page.getByPlaceholder('Search scenarios…').fill(nameSearch)
  const item = page.getByTestId('scenario-list-item').filter({
    // scenario-item-id renders the bare id (e.g. "595"), not "#595"
    has: page.getByTestId('scenario-item-id').getByText(String(id), { exact: true }),
  })
  await expect(item).toBeVisible({ timeout: 15_000 })
  await item.click()
  await page.getByTestId('scenario-detail-panel').getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 15_000 })
}

test.describe('Scenario nav dropdown', () => {
  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    await page.addInitScript((a) => {
      window.sessionStorage.setItem('rois-auth', JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }))
    }, auth)
  })

  test('Scen-2050 — open scenario shows in trigger + flat opened scenario rows switch and close', async ({ page }) => {
    const SCENARIO_ID = 595
    const MODULE = `scenario-gantt:${SCENARIO_ID}`
    await openScenarioById(page, SCENARIO_ID, 'TEST-New-YVR')

    // 1. Trigger shows the active scenario's name (not just "Scenario").
    const trigger = page.getByTestId('module-nav-scenario')
    await expect(trigger).toContainText('Backup')

    // 2. Open dropdown → the open scenario row is directly under Scenarios.
    await trigger.click()
    const row = page.getByTestId(`scenario-nav-tab-${MODULE}`)
    await expect(row).toBeVisible()
    await expect(row).toContainText('Backup')
    await expect(page.getByTestId('scenario-nav-scenarios-sub')).toHaveCount(0)
    await expect(page.getByText('Opened Scenarios')).toHaveCount(0)

    // Opening the top-level Scenario menu must not leave the active Gantt.
    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible()

    // 3. Navigate away to the scenario list view, then switch back via the submenu.
    await page.keyboard.press('Escape')
    await page.getByTestId('module-nav-scenario').click()
    await page.getByTestId('scenario-nav-list').click()
    await expect(page.getByTestId('scenario-gantt-view')).toBeHidden()

    await page.getByTestId('module-nav-scenario').click()
    await page.getByTestId(`scenario-nav-tab-${MODULE}`).click()
    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
    await expect(trigger).toContainText('Backup')

    // 4. Close the scenario from the flat row → trigger falls back to "Scenario".
    await trigger.click()
    await page.getByTestId(`scenario-nav-close-${MODULE}`).click()
    await page.keyboard.press('Escape')
    await expect(trigger).toContainText('Scenario')
    await expect(trigger).not.toContainText('Backup')
    await expect(page.getByTestId('scenario-detail-panel')).toBeVisible({ timeout: 10_000 })

    // 5. Empty state: no submenu and no empty-state row.
    await trigger.click()
    await expect(page.getByTestId('scenario-nav-scenarios-sub')).toHaveCount(0)
    await expect(page.getByText('No open scenarios')).toHaveCount(0)
  })

  test('Scen-2051 — dropdown shows Scenarios without the old Opened Scenarios submenu', async ({ page }) => {
    await page.goto('/altair/')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('module-nav-scenario').click()
    await expect(page.getByTestId('scenario-nav-list')).toHaveText('Scenarios')
    await expect(page.getByTestId('scenario-nav-scenarios-sub')).toHaveCount(0)
    await expect(page.getByText('Opened Scenarios')).toHaveCount(0)
  })

  test('Scen-2052 — switching to Live keeps scenario label; dropdown row returns to scenario', async ({ page }) => {
    const SCENARIO_ID = 595
    await openScenarioById(page, SCENARIO_ID, 'TEST-New-YVR')

    const trigger = page.getByTestId('module-nav-scenario')
    await expect(trigger).toContainText('Backup')

    // Switch to the Live tab.
    await page.getByTestId('module-nav-live').click()
    await expect(page.getByTestId('scenario-gantt-view')).toBeHidden()

    // Scenario button should still show the scenario label — not the generic "Scenario".
    await expect(trigger).toContainText('Backup')
    await expect(trigger).not.toHaveText('Scenario')

    // The Scenario trigger stays a dropdown; selecting the flat row returns to the scenario.
    await trigger.click()
    await page.getByTestId(`scenario-nav-tab-scenario-gantt:${SCENARIO_ID}`).click()
    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
    await expect(trigger).toContainText('Backup')
  })

})

test.describe('Scenario nav dropdown tooltip', () => {
  const MODULE = 'scenario-gantt:9001'
  const FULL_LABEL = '#9001 Copy of YVR-August Maintenance Rotation 2026 - Long Label'
  const ok = (data: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 200, message: 'ok', data }),
  })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ label, module }) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: 'tester', userName: 'Tester', schema: 'f8' }, token: 'e2e-token' }),
      )
      window.localStorage.setItem('rois-shell-module', 'dashboard')
      window.localStorage.setItem('rois-shell-open-tabs', JSON.stringify(['dashboard', 'scenario', module]))
      window.localStorage.setItem('rois-shell-scenario-tab-labels', JSON.stringify({ [module]: label }))
      window.localStorage.setItem('rois-shell-scenario-tab-types', JSON.stringify({ [module]: 'RO' }))
      window.localStorage.setItem('rois-shell-top-nav', 'true')
    }, { label: FULL_LABEL, module: MODULE })

    await page.route('**/altair/live/api/auth/me', (route) => route.fulfill(ok({
      userCode: 'tester',
      userName: 'Tester',
      schema: 'f8',
      isAdmin: 1,
    })))
    await page.route('**/altair/live/api/public/config', (route) => route.fulfill(ok({
      airline: 'F8',
      timezone: 'UTC',
      language: 'en',
      theme: 'light',
      dateFormat: 'YYYY-MM-DD',
    })))
    await page.route('**/altair/live/api/dashboard/overview', (route) => route.fulfill(ok({
      flightsToday: 0,
      totalActiveCrew: 0,
      violations: null,
      pendingApprovals: null,
      crewByRank: [],
      flightsByDay: [],
    })))
    await page.route('**/altair/live/api/assignment/group', (route) => route.fulfill(ok([])))
    await page.route('**/altair/live/api/assignment', (route) => route.fulfill(ok([])))
    await page.route('**/altair/live/api/scenario/run-health', (route) => route.fulfill(ok({
      overall: 'healthy',
      checkedAt: '2026-07-04T00:00:00.000Z',
      services: [],
    })))
  })

  test('Scen-2053 — hovering the Scenario trigger and row shows the full scenario name', async ({ page }) => {
    await page.goto('/altair/')

    const fullNameTooltip = page.getByRole('tooltip').filter({ hasText: FULL_LABEL }).first()
    const trigger = page.getByTestId('module-nav-scenario')

    await expect(trigger).toContainText('Copy of YVR-August')
    await trigger.hover()
    await expect(fullNameTooltip).toBeVisible({ timeout: 5_000 })

    await trigger.click()
    const row = page.getByTestId(`scenario-nav-tab-${MODULE}`)
    await expect(row).toBeVisible()
    await row.hover()
    await expect(fullNameTooltip).toBeVisible({ timeout: 5_000 })
  })
})
