/**
 * Scen-2033 — Scenario Flight Pane uses shared FilterDialog + context filter-store
 *
 * Verifies Task 3C-flight: the scenario flight pane's Filter button (from
 * PaneConditionStrip) opens the shared FilterDialog keyed to the scenario's
 * contextId pre-switched to the Flight tab. Selecting a Dep Airport value and
 * applying the filter causes a pane-filter-chip to appear. The old inline popover
 * (testid: sg-flight-filter-btn) must be absent.
 *
 * Requires:
 *   - live-server running with SCENARIO_GANTT_SOURCE=db
 *   - Scenario #6 loaded (26 crew, flights present)
 *
 * The scenario flight pane is NOT open by default. It must be added via the
 * toolbar button (data-testid="sg-add-pane-flight"). Once open, the canvas
 * has data-testid="scenario-flight-canvas".
 *
 * Flight tab testid conventions in FilterDialog:
 *   - filter-flight-dep: TextChipField inner input for Dep airports (type + Enter to add)
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { gotoScenarioList } from '../../../pages/gantt/scenario-nav'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

interface Auth { token: string; userCode: string; userName: string; schema: string }

const login = async (request: APIRequestContext): Promise<Auth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: GANTT_USER, password: GANTT_PASS },
  })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  const json = (await res.json()) as { data: Auth }
  return json.data
}

// Open scenario #6 (live-backed, 26 crew) via the standard UI flow and wait for crew load.
async function openScenario6(page: Page) {
  await page.goto('/altair/')
  await page.waitForLoadState('networkidle')
  await gotoScenarioList(page)
  await page.getByTestId('scenario-nav-ro').click()

  await page.getByPlaceholder('Search scenarios…').fill('RO-2026-06 YEG Test---')
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText('#6', { exact: true }),
  })
  await expect(item).toBeVisible({ timeout: 10_000 })
  await item.click()

  const detail = page.getByTestId('scenario-detail-panel')
  await expect(detail).toBeVisible()
  await detail.getByTestId('scenario-open-btn').click()

  const ganttView = page.getByTestId('scenario-gantt-view')
  await expect(ganttView).toBeVisible({ timeout: 15_000 })

  // Wait until 26 crew rows are loaded in the scenario store
  await expect
    .poll(async () => page.evaluate((sid) => window.__ganttTest?.scenarioRoster(sid)?.crew.length ?? 0, 6), {
      timeout: 15_000,
      message: 'scenario roster should load 26 crew',
    })
    .toBe(26)
}

// Add the flight pane via the toolbar button and wait for it to render.
async function addFlightPane(page: Page) {
  // The scenario gantt toolbar has sg-add-pane-flight button to add the flight pane
  const addFlightBtn = page.getByTestId('sg-add-pane-flight')
  await expect(addFlightBtn).toBeVisible({ timeout: 5_000 })
  await addFlightBtn.click()

  // Wait for the flight canvas to appear
  const flightCanvas = page.getByTestId('scenario-flight-canvas')
  await expect(flightCanvas).toBeVisible({ timeout: 10_000 })
}

// Find the flight pane's filter button (pane-filter-button inside the flight pane block).
// If multiple pane-filter-buttons exist (roster + flight), returns the last one
// since the flight pane is added last.
async function getFlightPaneFilterButton(page: Page) {
  const filterBtns = page.getByTestId('pane-filter-button')
  const count = await filterBtns.count()
  if (count === 1) return filterBtns.first()
  // Multiple panes: the flight pane's filter button is the last one added
  return filterBtns.last()
}

test.describe('Scen-2033 — Scenario flight pane shared FilterDialog', () => {
  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)
  })

  test('Scen-2033a — Old inline popover trigger is absent; flight pane opens shared FilterDialog on Flight tab', async ({ page }) => {
    await openScenario6(page)
    await addFlightPane(page)

    // The OLD inline popover button must NOT be present
    await expect(page.getByTestId('sg-flight-filter-btn')).toHaveCount(0)

    // Open the filter dialog via the shared pane-filter-button
    const filterBtn = await getFlightPaneFilterButton(page)
    await expect(filterBtn).toBeVisible()
    await filterBtn.click()

    // The shared FilterDialog must open
    const filterDialog = page.getByTestId('filter-dialog')
    await expect(filterDialog).toBeVisible({ timeout: 5_000 })

    // It should open pre-switched to the Flight tab
    const flightTab = filterDialog.getByTestId('filter-tab-flight')
    await expect(flightTab).toBeVisible()
    await expect(flightTab).toHaveAttribute('data-active', 'true')
  })

  test('Scen-2033b — Typing a dep airport filter applies reactively and shows a chip', async ({ page }) => {
    await openScenario6(page)
    await addFlightPane(page)

    // Open the filter dialog
    const filterBtn = await getFlightPaneFilterButton(page)
    await filterBtn.click()
    const filterDialog = page.getByTestId('filter-dialog')
    await expect(filterDialog).toBeVisible({ timeout: 5_000 })

    // Make sure we're on the Flight tab
    const flightTab = filterDialog.getByTestId('filter-tab-flight')
    if ((await flightTab.getAttribute('data-active')) !== 'true') {
      await flightTab.click()
    }

    // Type a dep airport into the TextChipField (inner input has testid="filter-flight-dep")
    const depInput = filterDialog.getByTestId('filter-flight-dep')
    await expect(depInput).toBeVisible({ timeout: 5_000 })
    // 'YEG' is a known dep airport in the F8 June test data
    await depInput.fill('YEG')
    await depInput.press('Enter')

    // Apply the filter
    await filterDialog.getByTestId('filter-apply').click()

    // The dialog should close
    await expect(filterDialog).not.toBeVisible({ timeout: 3_000 })

    // A pane-filter-chip scoped to 'YEG' should appear (avoids matching unrelated chips)
    const chip = page.getByTestId('pane-filter-chip').filter({ hasText: 'YEG' })
    await expect(chip).toBeVisible({ timeout: 5_000 })
    await expect(chip).toContainText('YEG')
  })

  test('Scen-2033c — Chip × button removes the flight filter', async ({ page }) => {
    await openScenario6(page)
    await addFlightPane(page)

    // Apply a dep airport filter
    const filterBtn = await getFlightPaneFilterButton(page)
    await filterBtn.click()
    const filterDialog = page.getByTestId('filter-dialog')
    await expect(filterDialog).toBeVisible({ timeout: 5_000 })

    const flightTab = filterDialog.getByTestId('filter-tab-flight')
    if ((await flightTab.getAttribute('data-active')) !== 'true') {
      await flightTab.click()
    }

    const depInput = filterDialog.getByTestId('filter-flight-dep')
    await expect(depInput).toBeVisible({ timeout: 5_000 })
    await depInput.fill('YEG')
    await depInput.press('Enter')
    await filterDialog.getByTestId('filter-apply').click()
    await expect(filterDialog).not.toBeVisible({ timeout: 3_000 })

    // YEG chip must appear (scoped to avoid matching unrelated chips from other panes)
    const chip = page.getByTestId('pane-filter-chip').filter({ hasText: 'YEG' })
    await expect(chip).toBeVisible({ timeout: 5_000 })
    await expect(chip).toContainText('YEG')

    // Click the × button inside the YEG chip to remove the flight filter
    await chip.getByRole('button').click()

    // YEG chip disappears
    await expect(page.getByTestId('pane-filter-chip').filter({ hasText: 'YEG' })).toHaveCount(0, { timeout: 5_000 })
  })
})
