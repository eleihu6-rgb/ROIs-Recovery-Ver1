/**
 * Scen-2036 — Scenario roster shared FilterDialog parity gate (fixture 6 AND 460)
 *
 * Verifies that BOTH the live-backed (6) and copy-backed (460) scenario fixtures
 * use the shared context filter-store: opening the filter dialog, selecting a Base
 * filter, applying it → chip appears; removing the chip → 0 chips.
 *
 * Requires:
 *   - live-server running with SCENARIO_GANTT_SOURCE=db
 *   - Scenario #6 (26 crew, live-backed) and #460 (copy-backed) loadable
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

const CASES = [
  { label: 'live-backed (6)',       id: 6,   search: 'RO-2026-06 YEG Test---' },
  { label: 'copy-backed (460)',     id: 460, search: 'Ryan-2026-06 YEG Test---' },
]

test.describe('Scen-2036 — Scenario roster FilterDialog parity gate', () => {
  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)
  })

  for (const { label, id, search } of CASES) {
    test(`Scen-2036 — ${label} roster uses shared filter (chip round-trip)`, async ({ page }) => {
      // ── Navigate to gantt and open the scenario ──
      await page.goto('/altair/')
      await page.waitForLoadState('networkidle')
      await gotoScenarioList(page)
      await page.getByTestId('scenario-nav-ro').click()

      // Wait for list to render before searching
      await expect(page.getByTestId('scenario-list-item').first()).toBeVisible({ timeout: 10_000 })

      await page.getByPlaceholder('Search scenarios…').fill(search)

      // Pin to the #id badge to disambiguate duplicated names in dev
      const item = page.getByTestId('scenario-list-item').filter({
        has: page.getByTestId('scenario-item-id').getByText(`#${id}`, { exact: true }),
      })
      await expect(item).toBeVisible({ timeout: 10_000 })
      await item.click()

      const detail = page.getByTestId('scenario-detail-panel')
      await expect(detail).toBeVisible()
      await detail.getByTestId('scenario-open-btn').click()

      const ganttView = page.getByTestId('scenario-gantt-view')
      await expect(ganttView).toBeVisible({ timeout: 15_000 })

      // Wait for the roster pane header canvas to be present (pane rendered)
      await expect(page.getByTestId('pane-header-canvas-scenario-roster')).toBeVisible({ timeout: 15_000 })

      // ── Assert 0 filter chips initially ──
      await expect(page.getByTestId('pane-filter-chip')).toHaveCount(0)

      // ── Open shared FilterDialog via pane-filter-button ──
      const filterBtn = page.getByTestId('pane-filter-button').first()
      await expect(filterBtn).toBeVisible()
      await filterBtn.click()

      const filterDialog = page.getByTestId('filter-dialog')
      await expect(filterDialog).toBeVisible({ timeout: 5_000 })

      // ── Crew tab → Base multiselect → pick first available option ──
      const baseTrigger = filterDialog.getByTestId('filter-crew-base-trigger')
      await expect(baseTrigger).toBeVisible({ timeout: 5_000 })
      await baseTrigger.click()

      const firstOpt = filterDialog.locator('[data-testid^="filter-crew-base-opt-"]').first()
      await expect(firstOpt).toBeVisible({ timeout: 5_000 })
      const baseCode = (await firstOpt.getAttribute('data-testid') ?? '').replace('filter-crew-base-opt-', '')
      await firstOpt.click()

      // ── Apply the filter ──
      await filterDialog.getByTestId('filter-apply').click()
      await expect(filterDialog).not.toBeVisible({ timeout: 3_000 })

      // ── Assert a pane-filter-chip with the base code appears ──
      const chip = page.getByTestId('pane-filter-chip').first()
      await expect(chip).toBeVisible({ timeout: 5_000 })
      if (baseCode) {
        await expect(chip).toContainText(baseCode)
      }

      // ── Remove the chip via its × button → 0 chips ──
      await chip.getByRole('button').click()
      await expect(page.getByTestId('pane-filter-chip')).toHaveCount(0, { timeout: 5_000 })
    })
  }
})
