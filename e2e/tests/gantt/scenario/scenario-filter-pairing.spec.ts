/**
 * Scen-2034 — Scenario Pairing Pane uses shared FilterDialog + context filter-store
 *
 * Verifies Task 3C-pairing: the scenario pairing pane's Filter button (from
 * PaneConditionStrip) opens the shared FilterDialog keyed to the scenario's
 * contextId pre-switched to the Pairing tab. Setting a label and applying the
 * filter causes a pane-filter-chip to appear. The old inline popover
 * (testid: sg-pairing-filter-btn) must be absent.
 *
 * Requires:
 *   - live-server running with SCENARIO_GANTT_SOURCE=db
 *   - Scenario #6 loaded (26 crew, pairings present)
 *
 * The scenario pairing pane is ALREADY OPEN by default (roster + pairing are the
 * default two panes — confirmed via scenario-layout-store counters: roster:1, pairing:1).
 * Canvas testid: "scenario-pairing-canvas".
 *
 * Since both roster and pairing panes are open by default, there are 2 filter buttons
 * (pane-filter-button). The roster pane comes first (top); the pairing pane is second.
 * We locate the filter button that is within the same flex column as the pairing canvas.
 *
 * Pairing tab testid conventions in FilterDialog:
 *   - filter-pairing-label: text input for label substring search
 *   - filter-tab-pairing: the Pairing tab button (must have data-active="true")
 *   - filter-apply: apply button
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

  // The pairing canvas should already be visible (pairing pane opens by default)
  await expect(page.getByTestId('scenario-pairing-canvas')).toBeVisible({ timeout: 10_000 })
}

// The pairing pane is already open by default (roster + pairing = default layout).
// The toolbar shows sg-add-pane-pairing as disabled when the pane is already open.
// We locate the pairing pane's filter button as the SECOND pane-filter-button
// (roster comes first, pairing second in the vertical stack).
async function getPairingPaneFilterButton(page: Page) {
  const filterBtns = page.getByTestId('pane-filter-button')
  const count = await filterBtns.count()
  // Both roster and pairing panes are open by default: 2 filter buttons
  if (count >= 2) return filterBtns.nth(1)
  // Fallback: only 1 visible (pairing pane only)
  return filterBtns.first()
}

test.describe('Scen-2034 — Scenario pairing pane shared FilterDialog', () => {
  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)
  })

  test('Scen-2034a — Old inline popover trigger absent; pairing pane opens shared FilterDialog on Pairing tab', async ({ page }) => {
    await openScenario6(page)

    // The OLD inline popover button must NOT be present (removed in Task 3C-pairing)
    await expect(page.getByTestId('sg-pairing-filter-btn')).toHaveCount(0)

    // The pairing pane is already open by default — its add button is disabled
    await expect(page.getByTestId('sg-add-pane-pairing')).toBeDisabled()

    // Regression lock: the default ['open','partial'] coverage must NOT produce a spurious chip.
    // If this fires, the coverageNarrowed guard regressed.
    await expect(page.getByTestId('pane-filter-chip')).toHaveCount(0, { timeout: 3_000 })

    // Open the filter dialog via the shared pane-filter-button (2nd = pairing pane's)
    const filterBtn = await getPairingPaneFilterButton(page)
    await expect(filterBtn).toBeVisible()
    await filterBtn.click()

    // The shared FilterDialog must open
    const filterDialog = page.getByTestId('filter-dialog')
    await expect(filterDialog).toBeVisible({ timeout: 5_000 })

    // It should open pre-switched to the Pairing tab
    const pairingTab = filterDialog.getByTestId('filter-tab-pairing')
    await expect(pairingTab).toBeVisible()
    await expect(pairingTab).toHaveAttribute('data-active', 'true')
  })

  test('Scen-2034b — Typing a pairing label filter applies reactively and shows a chip', async ({ page }) => {
    await openScenario6(page)

    // Open the filter dialog via the pairing pane's filter button
    const filterBtn = await getPairingPaneFilterButton(page)
    await filterBtn.click()
    const filterDialog = page.getByTestId('filter-dialog')
    await expect(filterDialog).toBeVisible({ timeout: 5_000 })

    // Make sure we're on the Pairing tab
    const pairingTab = filterDialog.getByTestId('filter-tab-pairing')
    if ((await pairingTab.getAttribute('data-active')) !== 'true') {
      await pairingTab.click()
    }

    // Type a label substring into the label text input (testid="filter-pairing-label")
    const labelInput = filterDialog.getByTestId('filter-pairing-label')
    await expect(labelInput).toBeVisible({ timeout: 5_000 })
    // Use a label substring that is known to exist in F8 June pairings
    await labelInput.fill('YEG')

    // Apply the filter
    await filterDialog.getByTestId('filter-apply').click()

    // The dialog should close
    await expect(filterDialog).not.toBeVisible({ timeout: 3_000 })

    // A pane-filter-chip with the YEG label should appear
    const yegChip = page.getByTestId('pane-filter-chip').filter({ hasText: 'YEG' })
    await expect(yegChip).toBeVisible({ timeout: 5_000 })
  })

  test('Scen-2034c — Chip × button removes the pairing label filter', async ({ page }) => {
    await openScenario6(page)

    // Apply a label filter
    const filterBtn = await getPairingPaneFilterButton(page)
    await filterBtn.click()
    const filterDialog = page.getByTestId('filter-dialog')
    await expect(filterDialog).toBeVisible({ timeout: 5_000 })

    const pairingTab = filterDialog.getByTestId('filter-tab-pairing')
    if ((await pairingTab.getAttribute('data-active')) !== 'true') {
      await pairingTab.click()
    }

    const labelInput = filterDialog.getByTestId('filter-pairing-label')
    await expect(labelInput).toBeVisible({ timeout: 5_000 })
    await labelInput.fill('YEG')
    await filterDialog.getByTestId('filter-apply').click()
    await expect(filterDialog).not.toBeVisible({ timeout: 3_000 })

    // Chip with YEG label must appear
    const yegChip = page.getByTestId('pane-filter-chip').filter({ hasText: 'YEG' })
    await expect(yegChip).toBeVisible({ timeout: 5_000 })

    // Click the × button inside the YEG chip to remove the label filter
    await yegChip.getByRole('button').click()

    // YEG chip disappears (other chips like coverage may remain)
    await expect(page.getByTestId('pane-filter-chip').filter({ hasText: 'YEG' })).toHaveCount(0, { timeout: 5_000 })
  })
})
