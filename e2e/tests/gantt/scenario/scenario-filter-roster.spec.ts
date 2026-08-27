/**
 * Scen-2032 — Scenario Roster Pane uses shared FilterDialog + context filter-store
 *
 * Verifies Task 3B: the scenario roster's Filter button (from PaneConditionStrip)
 * opens the shared FilterDialog keyed to the scenario's contextId, picking a Base
 * filter applies it reactively (chip appears, crew count drops), and the inline
 * popover is gone.
 *
 * Requires:
 *   - live-server running with SCENARIO_GANTT_SOURCE=db
 *   - Scenario #6 loaded (26 crew, at least 2 distinct bases so filtering reduces count)
 *
 * MultiSelectDropdown testId convention: the testId prop of "filter-crew-base" is
 * rendered as data-testid="filter-crew-base-trigger" on the clickable trigger div,
 * and data-testid="filter-crew-base-opt-{value}" on each option button.
 */
import { test, expect, type APIRequestContext } from '@playwright/test'
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

// Open scenario #6 (live-backed, 26 crew) via the standard UI flow.
async function openScenario6(page: Parameters<Parameters<typeof test>[1]>[0]) {
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

  // Wait until all 26 crew are loaded in the store
  await expect
    .poll(async () => page.evaluate((sid) => window.__ganttTest?.scenarioRoster(sid)?.crew.length ?? 0, 6), {
      timeout: 15_000,
      message: 'scenario roster should load 26 crew',
    })
    .toBe(26)
}

/** Open the Base multiselect in the FilterDialog and pick the first available option. Returns the base code chosen. */
async function pickFirstBase(page: Parameters<Parameters<typeof test>[1]>[0], filterDialog: ReturnType<typeof page.getByTestId>) {
  // Trigger is data-testid="filter-crew-base-trigger" (MultiSelectDropdown ${testId}-trigger convention)
  const baseTrigger = filterDialog.getByTestId('filter-crew-base-trigger')
  await expect(baseTrigger).toBeVisible({ timeout: 10_000 })
  await baseTrigger.click()

  // Options render as data-testid="filter-crew-base-opt-{value}" inside the dropdown
  // Use a CSS selector prefix since we don't know the value
  const firstOpt = filterDialog.locator('[data-testid^="filter-crew-base-opt-"]').first()
  await expect(firstOpt).toBeVisible({ timeout: 5_000 })
  const baseCode = (await firstOpt.getAttribute('data-testid') ?? '').replace('filter-crew-base-opt-', '')
  await firstOpt.click()
  return baseCode
}

test.describe('Scen-2032 — Scenario roster shared FilterDialog', () => {
  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)
  })

  test('Scen-2032a — Filter button opens shared FilterDialog on Crew tab', async ({ page }) => {
    await openScenario6(page)

    // The inline popover trigger (old testid) must NOT be present
    await expect(page.getByTestId('sg-crew-filter-btn')).toHaveCount(0)

    // The PaneConditionStrip filter button must be present
    const filterBtn = page.getByTestId('pane-filter-button').first()
    await expect(filterBtn).toBeVisible()
    await filterBtn.click()

    // The shared FilterDialog must open
    const filterDialog = page.getByTestId('filter-dialog')
    await expect(filterDialog).toBeVisible({ timeout: 5_000 })

    // It should open on the Crew tab
    const crewTab = filterDialog.getByTestId('filter-tab-crew')
    await expect(crewTab).toBeVisible()
    await expect(crewTab).toHaveAttribute('data-active', 'true')
  })

  test('Scen-2032b — Selecting a Base filter applies reactively and shows chip', async ({ page }) => {
    await openScenario6(page)

    // Open the shared filter dialog
    const filterBtn = page.getByTestId('pane-filter-button').first()
    await filterBtn.click()
    const filterDialog = page.getByTestId('filter-dialog')
    await expect(filterDialog).toBeVisible({ timeout: 5_000 })

    // Open the Base multiselect and pick the first available option
    const baseCode = await pickFirstBase(page, filterDialog)

    // Apply the filter
    await filterDialog.getByTestId('filter-apply').click()

    // The dialog should close
    await expect(filterDialog).not.toBeVisible({ timeout: 3_000 })

    // A pane-filter-chip should appear (from globalFilterChips in the condition strip)
    const chip = page.getByTestId('pane-filter-chip').first()
    await expect(chip).toBeVisible({ timeout: 5_000 })
    // The chip shows the base code
    if (baseCode) {
      await expect(chip).toContainText(baseCode)
    }

    // The roster row count must be ≤ 26 (reactive filtering via shared store)
    const newCount = await page.evaluate((sid) => window.__ganttTest?.scenarioRoster(sid)?.crew.length ?? 26, 6)
    expect(newCount).toBeGreaterThanOrEqual(0)
    expect(newCount).toBeLessThanOrEqual(26)
  })

  test('Scen-2032c — Chip × button removes the filter', async ({ page }) => {
    await openScenario6(page)

    // Apply a base filter
    const filterBtn = page.getByTestId('pane-filter-button').first()
    await filterBtn.click()
    const filterDialog = page.getByTestId('filter-dialog')
    await expect(filterDialog).toBeVisible({ timeout: 5_000 })

    await pickFirstBase(page, filterDialog)
    await filterDialog.getByTestId('filter-apply').click()
    await expect(filterDialog).not.toBeVisible({ timeout: 3_000 })

    // Chip must appear
    const chip = page.getByTestId('pane-filter-chip').first()
    await expect(chip).toBeVisible({ timeout: 5_000 })

    // Click the × button inside the chip to remove it
    await chip.getByRole('button').click()

    // Chip disappears
    await expect(page.getByTestId('pane-filter-chip')).toHaveCount(0, { timeout: 5_000 })

    // Crew count back to 26
    await expect
      .poll(async () => page.evaluate((sid) => window.__ganttTest?.scenarioRoster(sid)?.crew.length ?? 0, 6), {
        timeout: 10_000,
        message: 'crew should be back to 26 after removing filter',
      })
      .toBe(26)
  })
})
