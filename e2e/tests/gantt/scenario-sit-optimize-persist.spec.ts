/**
 * SIT (or any live stack) — full optimize → DONE → persisted roster proof.
 *
 * Covers the regressions that status-only tests miss:
 *   1. JWT / engine start (401) and pbs-engine missing source (ModuleNotFoundError)
 *   2. Engine callback writes taskId + filePath
 *   3. Async loadResultGzIntoDb → scenario.roster_flight (gantt-data non-empty)
 *   4. Real UI Open still mounts scenario-gantt-view with crew
 *
 * Kick-off uses the real Run button (§Simulate-User). Status/gantt-data polls use
 * a separate APIRequestContext (do not waitForResponse(/run/) — /run can last minutes).
 *
 * Run against SIT API (Portal) + public UI:
 *   cd e2e && \
 *     GANTT_BASE_URL=https://crew-f8-usva-sit.roiscloud.com \
 *     GANTT_API_URL=https://crew-f8-usva-sit.roiscloud.com \
 *     SCENARIO_ID=622 SCENARIO_NAME='Copy540 of YVR-FC-Ver1' \
 *     npx playwright test --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/scenario-sit-optimize-persist.spec.ts --reporter=list --no-deps
 *
 * Against Portal loopback (no UI Open step if no gantt on :3000):
 *   GANTT_API_URL=http://10.15.12.4:3000 SKIP_UI_OPEN=1 ...
 *
 * Prefer the shell gate for preflight+DB SQL without browser:
 *   bash deploy/sit/verify-optimize-e2e.sh
 *   REMOTE=1 SCENARIO_ID=622 bash deploy/sit/verify-optimize-e2e.sh
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import {
  assertDoneMetadata,
  ensureDraftViaApi,
  fetchScenario,
  loginGantt,
  waitForPersistedGanttData,
  waitForStatus,
} from '../../utils/gantt/scenario-optimize-persist'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://127.0.0.1:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'
const SCENARIO_ID = Number(process.env.SCENARIO_ID ?? '622')
const SCENARIO_NAME = process.env.SCENARIO_NAME ?? 'Copy540 of YVR-FC-Ver1'
const SKIP_UI_OPEN = process.env.SKIP_UI_OPEN === '1'
const RUN_TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS ?? 1_200_000)
const DB_WAIT_MS = Number(process.env.DB_WAIT_MS ?? 180_000)

test.describe.configure({ mode: 'serial' })

test.describe(`SIT optimize persist — scenario ${SCENARIO_ID}`, () => {
  let token = ''

  test.beforeEach(async ({ page }) => {
    const auth = await loginGantt(page.request, GANTT_API, GANTT_USER, GANTT_PASS)
    token = auth.token
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({
          user: { userCode: a.userCode, userName: a.userName, schema: a.schema },
          token: a.token,
        }),
      )
    }, auth)
  })

  test('Sit-Opt-1 — UI Run reaches RUNNING/DONE (not 401 / instant FAILED)', async ({ page }) => {
    test.setTimeout(300_000)

    // API cleanup first so list UI is not stuck on orphaned RUNNING
    await ensureDraftViaApi(page.request, GANTT_API, token, SCENARIO_ID)

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const row = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await row.click()
    await expect(scenario.detailPanel).toBeVisible()

    const panel = scenario.detailPanel
    const statusBadge = panel.getByTestId('scenario-status-badge')
    const runBtn = panel.getByTestId('scenario-run-btn')
    const removeResultBtn = panel.getByTestId('scenario-remove-result-btn')

    // Product cleanup if Remove result still shows (status may already be DRAFT)
    const pre = await fetchScenario(page.request, GANTT_API, token, SCENARIO_ID)
    if (pre.status !== 'DRAFT' && (await removeResultBtn.isEnabled().catch(() => false))) {
      await removeResultBtn.click()
      const dlg = page.getByTestId('remove-result-dialog')
      if (await dlg.isVisible().catch(() => false)) {
        await dlg.getByRole('button', { name: 'Remove Result' }).click()
      }
      await expect(statusBadge).toHaveText('Draft', { timeout: 30_000 })
    }

    await expect(statusBadge).toHaveText('Draft', { timeout: 30_000 })
    await expect(runBtn).toBeEnabled()
    await runBtn.click()

    const dialog = page.getByTestId('run-check-dialog')
    if (await dialog.isVisible().catch(() => false)) {
      await expect(dialog.getByText('Must fix before running')).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Proceed Anyway' }).click()
    }

    const status = await waitForStatus(
      page.request,
      GANTT_API,
      token,
      SCENARIO_ID,
      (s) => s === 'RUNNING' || s === 'DONE' || s === 'FAILED',
      180_000,
      3_000,
    )
    // eslint-disable-next-line no-console
    console.log(`[Sit-Opt-1] after kick-off status=${status}`)
    expect(
      status,
      'instant FAILED usually means JWT 401 or missing pbs-engine source — run deploy/sit/verify-optimize-e2e.sh PREFLIGHT_ONLY=1',
    ).not.toBe('FAILED')
    expect(['RUNNING', 'DONE']).toContain(status)
  })

  test('Sit-Opt-2 — solve finishes DONE with result metadata', async ({ page }) => {
    test.setTimeout(RUN_TIMEOUT_MS + 60_000)

    const status = await waitForStatus(
      page.request,
      GANTT_API,
      token,
      SCENARIO_ID,
      (s) => s === 'DONE' || s === 'FAILED',
      RUN_TIMEOUT_MS,
      8_000,
    )
    // eslint-disable-next-line no-console
    console.log(`[Sit-Opt-2] terminal status=${status}`)
    expect(status, 'must finish DONE (not FAILED)').toBe('DONE')

    const sc = await fetchScenario(page.request, GANTT_API, token, SCENARIO_ID)
    assertDoneMetadata(sc)
    // eslint-disable-next-line no-console
    console.log(`[Sit-Opt-2] taskId=${sc.taskId} filePath=${sc.filePath}`)
  })

  test('Sit-Opt-3 — gantt-data reflects DB-persisted roster (async load)', async ({ page }) => {
    test.setTimeout(DB_WAIT_MS + 120_000)

    const sc = await fetchScenario(page.request, GANTT_API, token, SCENARIO_ID)
    expect(sc.status).toBe('DONE')

    const { crewCount, dutyCount } = await waitForPersistedGanttData(
      page.request,
      GANTT_API,
      token,
      SCENARIO_ID,
      DB_WAIT_MS,
    )
    // eslint-disable-next-line no-console
    console.log(`[Sit-Opt-3] persisted gantt-data crew=${crewCount} duties=${dutyCount}`)
    expect(crewCount, 'crew rows after loadResultGzIntoDb').toBeGreaterThan(0)
    expect(dutyCount, 'assignments+groundItems after loadResultGzIntoDb').toBeGreaterThan(0)
  })

  test('Sit-Opt-4 — Open in UI mounts scenario gantt with crew', async ({ page }) => {
    test.skip(SKIP_UI_OPEN, 'SKIP_UI_OPEN=1')
    test.setTimeout(300_000)

    const sc = await fetchScenario(page.request, GANTT_API, token, SCENARIO_ID)
    expect(sc.status).toBe('DONE')

    // warm gantt-data
    await waitForPersistedGanttData(page.request, GANTT_API, token, SCENARIO_ID, 60_000)

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const row = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await row.click()
    await expect(scenario.detailPanel).toBeVisible()

    const openBtn = scenario.detailPanel.getByTestId('scenario-open-btn')
    await expect(openBtn).toBeVisible({ timeout: 30_000 })
    await openBtn.click()

    const view = page.getByTestId('scenario-gantt-view')
    await expect(view, 'scenario gantt view must mount after Open').toBeVisible({ timeout: 120_000 })

    const { crewCount } = await waitForPersistedGanttData(
      page.request,
      GANTT_API,
      token,
      SCENARIO_ID,
      30_000,
    )
    expect(crewCount).toBeGreaterThan(0)
  })
})
