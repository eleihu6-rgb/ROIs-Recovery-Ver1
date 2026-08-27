/**
 * Scenario 596 ("596-YVR-PIlot") — re-run through the REAL gantt UI after wiring
 * rule 8056 (param-driven FLY|RES → FLY|SBY|SIM|GRD) to stop the optimizer placing
 * flying/reserve over pre-assigned hard ground (VAC/ILL/DO) via the in-process Rust
 * rule connector.
 *
 *   gantt UI (Remove result → Draft, then Kick off run)
 *     → live-server POST /api/scenario/596/run
 *       → engine builds ro_input from PG → ro_rust.sh pbs-engine solver (mode=rust)
 *         → Rust connector loads workset-103 8056 rows + crew pre-assigned ground duties
 *       → output.gz → scenario RUNNING→DONE → loader writes scenario.roster_flight
 *
 * Rust-7020 cleans the prior result via the real "Remove result" button (§Simulate-User,
 * skill 114 §1) then clicks Run. Rust-7021 waits for DONE. Rust-7022 opens the result.
 * The overlap proof (work × hard-leave → 0) is verified separately against
 * scenario.roster_flight after DONE.
 *
 * Run (pbs/engine started manually → --no-deps):
 *   cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test \
 *     --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/scenario-596-yvr-pilot-rust-solver-run.spec.ts --reporter=list --no-deps
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://127.0.0.1:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'Ryan'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? 'Our2027'

const SCENARIO_ID = 596
const SCENARIO_NAME = '596-YVR-PIlot'

type Req = import('@playwright/test').APIRequestContext

const login = async (request: Req) => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: GANTT_USER, password: GANTT_PASS },
  })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  return ((await res.json()) as {
    data: { token: string; userCode: string; userName: string; schema: string }
  }).data
}

const fetchStatus = async (request: Req, token: string): Promise<string> => {
  const res = await request.get(`${GANTT_API}/api/scenario/${SCENARIO_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `GET scenario ${SCENARIO_ID} → ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { data: { status: string } }).data.status
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const waitForStatus = async (
  request: Req,
  token: string,
  accept: (s: string) => boolean,
  timeoutMs: number,
  pollMs = 4_000,
): Promise<string> => {
  const deadline = Date.now() + timeoutMs
  let status = await fetchStatus(request, token)
  while (!accept(status) && Date.now() < deadline) {
    await sleep(pollMs)
    status = await fetchStatus(request, token)
  }
  return status
}

test.describe.configure({ mode: 'serial' })

test.describe('Scenario 596 — YVR pilot 8056 VAC/DO re-run via the UI', () => {
  let token = ''

  test.beforeEach(async ({ page }) => {
    const auth = await login(page.request)
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

  test('Rust-7020 — clean up prior result (Remove result → Draft) then Kick off run', async ({ page }) => {
    test.setTimeout(180_000)
    const scenario = new ScenarioPage(page)

    const pre = await fetchStatus(page.request, token)
    if (pre === 'RUNNING') {
      // eslint-disable-next-line no-console
      console.log('[Rust-7020] scenario 596 already RUNNING; letting Rust-7021 wait for it')
      expect(pre).toBe('RUNNING')
      return
    }
    await scenario.gotoRo()
    const row = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await row.click()
    await expect(scenario.detailPanel).toBeVisible()

    const panel = scenario.detailPanel
    const statusBadge = panel.getByTestId('scenario-status-badge')
    const runBtn = panel.getByTestId('scenario-run-btn')
    const removeResultBtn = panel.getByTestId('scenario-remove-result-btn')

    // §Simulate-User cleanup: clear the prior result through the real "Remove result"
    // (Eraser) button → confirm dialog → status reverts to Draft. NOT a back-channel reset.
    if (pre !== 'DRAFT') {
      await expect(removeResultBtn, 'a finished scenario must expose Remove result').toBeEnabled({
        timeout: 30_000,
      })
      await removeResultBtn.click()
      const removeDialog = page.getByTestId('remove-result-dialog')
      await expect(removeDialog, 'Remove result confirm dialog must open').toBeVisible()
      await removeDialog.getByRole('button', { name: 'Remove Result' }).click()
      await expect(statusBadge, 'Remove result must revert to Draft').toHaveText('Draft', {
        timeout: 30_000,
      })
      // eslint-disable-next-line no-console
      console.log(`[cleanup] removed prior result via UI — scenario ${SCENARIO_ID} reverted to Draft`)
    }

    await expect(statusBadge).toHaveText('Draft', { timeout: 30_000 })
    await expect(runBtn).toBeEnabled()
    await runBtn.click()

    const dialog = page.getByTestId('run-check-dialog')
    if (await dialog.isVisible().catch(() => false)) {
      await expect(
        dialog.getByText('Must fix before running'),
        'unexpected pre-run BLOCKER — 596 should be fully configured',
      ).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Proceed Anyway' }).click()
    }

    const status = await waitForStatus(
      page.request,
      token,
      (s) => s === 'RUNNING' || s === 'DONE',
      120_000,
      3_000,
    )
    // eslint-disable-next-line no-console
    console.log(`[Rust-7020] scenario ${SCENARIO_ID} status after UI kick-off = ${status}`)
    expect(['RUNNING', 'DONE'], 'UI kick-off must move scenario out of DRAFT').toContain(status)
  })

  test('Rust-7021 — the YVR pilot Rust solve completes (scenario reaches DONE)', async ({ page }) => {
    test.setTimeout(900_000)
    const status = await waitForStatus(
      page.request,
      token,
      (s) => s === 'DONE' || s === 'FAILED',
      840_000,
      5_000,
    )
    // eslint-disable-next-line no-console
    console.log(`[Rust-7021] scenario ${SCENARIO_ID} terminal status = ${status}`)
    expect(status, 'scenario must finish in DONE (not FAILED)').toBe('DONE')
  })

  test('Rust-7022 — open the finished YVR pilot result in the gantt via the real UI', async ({ page }) => {
    test.setTimeout(600_000)
    const status = await fetchStatus(page.request, token)
    expect(status, 'open-in-gantt requires a finished run').toBe('DONE')

    // Pre-warm the heavy gantt-data query so the app's own fetch hits a warm cache.
    let warm = false
    const warmDeadline = Date.now() + 240_000
    while (!warm && Date.now() < warmDeadline) {
      const t0 = Date.now()
      try {
        const r = await page.request.get(`${GANTT_API}/api/scenario/${SCENARIO_ID}/gantt-data`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8_000,
        })
        if (r.ok() && Date.now() - t0 < 8_000) warm = true
      } catch {
        // still cold
      }
      if (!warm) await sleep(3_000)
    }

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const row = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await row.click()
    await expect(scenario.detailPanel).toBeVisible()

    const openBtn = scenario.detailPanel.getByTestId('scenario-open-btn')
    await expect(openBtn, 'finished scenario must expose an Open button').toBeVisible({ timeout: 30_000 })
    await openBtn.click()

    const view = page.getByTestId('scenario-gantt-view')
    await expect(view, 'scenario gantt view must mount after Open').toBeVisible({ timeout: 120_000 })

    const gd = await page.request.get(`${GANTT_API}/api/scenario/${SCENARIO_ID}/gantt-data`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 90_000,
    })
    expect(gd.ok(), `gantt-data → ${gd.status()}`).toBeTruthy()
    const data = ((await gd.json()) as { data?: { crew?: unknown[] } }).data
    const crewCount = data?.crew?.length ?? 0
    // eslint-disable-next-line no-console
    console.log(`[Rust-7022] opened scenario ${SCENARIO_ID} gantt view — crew rows = ${crewCount}`)
    expect(crewCount, 'opened scenario roster must contain crew').toBeGreaterThan(0)
  })
})
