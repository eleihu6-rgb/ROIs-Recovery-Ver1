/**
 * Scen-2035 — Scenario roster multi-key SortDialog.
 *
 * Proves that the scenario roster's condition-strip sort button opens the
 * shared SortDialog and that applying two fields (Rank + Crew ID) produces
 * two pane-sort-chip elements in the correct label order.
 *
 * Flow:
 *   1. Open scenario #6 gantt (roster pane).
 *   2. Assert no sort chips initially.
 *   3. Click the condition-strip sort button (data-testid="pane-sort-button").
 *   4. Assert SortDialog is visible (data-testid="sort-dialog").
 *   5. Select "Rank" from the available list → move-right.
 *   6. Select "Crew ID" from the available list → move-right.
 *   7. Click Apply (data-testid="sort-apply").
 *   8. Assert two pane-sort-chip elements appear with the correct labels.
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

const SCENARIO_ID = 6

test.describe('Scenario roster multi-key SortDialog (Scen-2035)', () => {
  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)
  })

  test('Scen-2035 — sort button opens dialog; two fields applied produce two chips', async ({ page }) => {
    test.setTimeout(90_000)

    // ── 1. Open scenario #6 gantt ──────────────────────────────────────────────
    await page.goto('/altair/')
    await page.waitForLoadState('networkidle')

    await gotoScenarioList(page)
    await page.getByTestId('scenario-nav-ro').click()

    // Wait for the scenario list to be populated before searching
    await expect(page.getByTestId('scenario-list-item').first()).toBeVisible({ timeout: 10_000 })

    // Search + pin to the #id badge to uniquely select scenario #6
    await page.getByPlaceholder('Search scenarios…').fill('RO-2026-06 YEG Test---')
    const item = page.getByTestId('scenario-list-item').filter({
      has: page.getByTestId('scenario-item-id').getByText(`#${SCENARIO_ID}`, { exact: true }),
    })
    await expect(item).toBeVisible({ timeout: 10_000 })
    await item.click()

    const detail = page.getByTestId('scenario-detail-panel')
    await expect(detail).toBeVisible()
    await detail.getByTestId('scenario-open-btn').click()

    const ganttView = page.getByTestId('scenario-gantt-view')
    await expect(ganttView).toBeVisible({ timeout: 20_000 })

    // Wait for the roster header canvas to confirm pane is loaded
    const headerCanvas = page.getByTestId('pane-header-canvas-scenario-roster')
    await expect(headerCanvas).toBeVisible({ timeout: 15_000 })

    // ── 2. Assert no sort chips initially ──────────────────────────────────────
    await expect(page.getByTestId('pane-sort-chip')).toHaveCount(0)

    // ── 3. Click the condition-strip sort button ────────────────────────────────
    // The sort button renders when onSortClick is set (pane-condition-strip.tsx)
    const sortButton = page.getByTestId('pane-sort-button')
    await expect(sortButton).toBeVisible({ timeout: 10_000 })
    await sortButton.click()

    // ── 4. Assert SortDialog is visible ────────────────────────────────────────
    const sortDialog = page.getByTestId('sort-dialog')
    await expect(sortDialog).toBeVisible({ timeout: 5_000 })

    // ── 5. Select "Rank" and move to selected ──────────────────────────────────
    // Click the "Rank" entry in the available list to highlight it
    await page.getByTestId('sort-available-rank').click()
    // Move it to the selected list
    await page.getByTestId('sort-move-right').click()

    // Assert "Rank" is now in the selected panel
    await expect(page.getByTestId('sort-selected-rank')).toBeVisible()

    // ── 6. Select "Crew ID" and move to selected ───────────────────────────────
    await page.getByTestId('sort-available-crewId').click()
    await page.getByTestId('sort-move-right').click()

    // Assert both "Rank" and "Crew ID" are now in the selected panel
    await expect(page.getByTestId('sort-selected-rank')).toBeVisible()
    await expect(page.getByTestId('sort-selected-crewId')).toBeVisible()

    // ── 7. Apply ───────────────────────────────────────────────────────────────
    await page.getByTestId('sort-apply').click()

    // Dialog should close
    await expect(sortDialog).not.toBeVisible({ timeout: 3_000 })

    // ── 8. Assert two sort chips appear with correct labels ────────────────────
    const chips = page.getByTestId('pane-sort-chip')
    await expect(chips).toHaveCount(2, { timeout: 5_000 })

    // First chip = Rank (priority 1), second = CrewId (priority 2).
    // Chip labels now come from the visible COLUMN labels (unified with Live, which also labels
    // its sort chips from columns), so the crew column reads "CrewId" — matching the column
    // header and the SortDialog field — not the old hardcoded "Crew ID".
    const chip0 = chips.nth(0)
    const chip1 = chips.nth(1)
    await expect(chip0).toContainText('Rank')
    await expect(chip1).toContainText('CrewId')
  })
})
