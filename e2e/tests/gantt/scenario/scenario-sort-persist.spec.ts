/**
 * Scen-2031 — Scenario roster sort persists across tab suspend / resume.
 *
 * Phase 2 regression proof: sort state is stored in getPaneStore(scenarioId) (a
 * per-scenario pane-store instance), NOT in component-local useState.  A local
 * useState would reset to no sort when the tab is suspended (component unmounts);
 * the pane-store survives.
 *
 * Flow:
 *   1. Open scenario #6 gantt.
 *   2. Assert no sort chip.
 *   3. Click a column header → sort chip appears.
 *   4. Switch to Live view (suspend the scenario tab).
 *   5. Return to the scenario tab.
 *   6. Assert the same sort chip is still present (proves store persistence).
 */
import { test, expect, type APIRequestContext } from '@playwright/test'
import { gotoScenarioList, switchToOpenScenario } from '../../../pages/gantt/scenario-nav'

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
const MODULE_KEY = `scenario-gantt:${SCENARIO_ID}`

test.describe('Scenario roster sort — persist across suspend (Scen-2031)', () => {
  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)
  })

  test('Scen-2031 — scenario roster sort chip persists after tab suspend + resume', async ({ page }) => {
    test.setTimeout(90_000)

    // ── 1. Open scenario #6 gantt ──────────────────────────────────────────────
    await page.goto('/altair/')
    await page.waitForLoadState('networkidle')

    await gotoScenarioList(page)
    await page.getByTestId('scenario-nav-ro').click()

    // Wait for the scenario list to be populated before searching (guards against
    // the nav-click triggering a reload while networkidle is already satisfied).
    await expect(page.getByTestId('scenario-list-item').first()).toBeVisible({ timeout: 10_000 })

    // Search + pin to the #id badge to uniquely select scenario #6
    // (search term from scenario-db-source.spec.ts — the '---' suffix narrows the list)
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

    // ── 2. Wait for roster header canvas and assert no sort chip yet ───────────
    const headerCanvas = page.getByTestId('pane-header-canvas-scenario-roster')
    await expect(headerCanvas).toBeVisible({ timeout: 15_000 })

    await expect(page.getByTestId('pane-sort-chip')).toHaveCount(0)

    // ── 3. Click a column header to trigger sort ───────────────────────────────
    const box = await headerCanvas.boundingBox()
    if (!box) throw new Error('pane-header-canvas-scenario-roster has no bounding box')

    // Click at x+40 (first column header region), y+8 (inside the ~30px header band)
    await page.mouse.click(box.x + 40, box.y + 8)

    // Wait for a sort chip to appear (proves header click routed to onColumnHeaderClick)
    await expect(page.getByTestId('pane-sort-chip')).toHaveCount(1, { timeout: 10_000 })

    const chipText = await page.getByTestId('pane-sort-chip').first().innerText()

    // ── 4. SUSPEND: switch to Live view ───────────────────────────────────────
    await page.getByTestId('module-nav-live').click()

    // The scenario tab should suspend (placeholder attached to DOM)
    await expect(page.getByTestId('scenario-gantt-suspended')).toBeAttached({ timeout: 10_000 })

    // ── 5. RESUME: return to the scenario tab ─────────────────────────────────
    await switchToOpenScenario(page, MODULE_KEY)
    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 15_000 })
    await expect(headerCanvas).toBeVisible({ timeout: 15_000 })

    // ── 6. ASSERT PERSISTENCE ─────────────────────────────────────────────────
    // If sort were stored in component-local useState, it would have reset to 0 chips.
    // Pane-store survival means the chip (and the same text) must still be present.
    await expect(page.getByTestId('pane-sort-chip')).toHaveCount(1, { timeout: 10_000 })
    const restoredChipText = await page.getByTestId('pane-sort-chip').first().innerText()
    expect(restoredChipText, 'sort chip text must survive suspend/resume').toBe(chipText)
  })
})
