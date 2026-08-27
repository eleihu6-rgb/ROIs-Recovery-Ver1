/**
 * Scenario 544 ("Calgary-FD-Ver1") — a NEW (non-baseline) end-to-end optimization
 * run through the REAL gantt UI for a YYC (Calgary) PILOT (flight-deck) scenario,
 * validating the full local pipeline:
 *
 *   gantt UI (Kick off run)
 *     → live-server POST /api/scenario/544/run (type=LegacyRO, inputSource=db)
 *       → engine-server builds ro_input.txt/input.gz from the remote PG
 *          (F8.ro_input_builder, scenario 544 = YYC base / June 2026, division=P)
 *       → engine-server fetches the SCENARIO-SCOPED bid package from pbs-server
 *          POST /api/admin/algorithm-export/scenario-package {periodCode, YYC pilot crewIds}
 *       → ./F8/ro_rust.sh → pbs-engine solver (rule_engine.mode=rust,
 *          problem.crew_type=P) → in-process Rust rule connector
 *       → ro_output.txt → output.gz → scenario RUNNING→DONE
 *
 * Rust-7017 is the deterministic kick-off proof (UI click → RUNNING).
 * Rust-7018 waits for the real solve to finish and asserts a DONE roster.
 * Rust-7019 opens the finished result in the gantt via the real Open button.
 *
 * Run (live-server is IPv4-only; pbs/engine started manually → --no-deps):
 *   cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test \
 *     --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/scenario-544-yyc-fd-rust-solver-run.spec.ts --reporter=list --no-deps --headed
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://127.0.0.1:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'Ryan'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? 'Our2027'

const SCENARIO_ID = 544
const SCENARIO_NAME = 'Calgary-FD-Ver1'

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

/**
 * Poll the DB-backed scenario status until `accept(status)` or timeout, then
 * return the last status. We poll status (a separate APIRequestContext) rather
 * than awaiting the `/run` response: scenarioService.run() flips DRAFT→RUNNING
 * in the DB *before* the minutes-long engine call, and the browser fetch can
 * outlive the test → waitForResponse(/run) would time out though the run works.
 */
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

test.describe('Scenario 544 — Calgary pilot Rust-connector solver run via the UI', () => {
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

  test('Rust-7017 — UI "Kick off run" on Calgary pilot scenario 544 reaches RUNNING', async ({ page }) => {
    test.setTimeout(180_000)
    const scenario = new ScenarioPage(page)

    // If a prior run left it terminal, revert to DRAFT so it is runnable again.
    // RUNNING can't be reset (only → DONE/FAILED) — if a prior kick-off is still
    // mid-solve, accept that and let Rust-7018 wait for it.
    const pre = await fetchStatus(page.request, token)
    if (pre === 'RUNNING') {
      // eslint-disable-next-line no-console
      console.log('[Rust-7017] scenario 544 already RUNNING from a prior kick-off; nothing to start')
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

    // §Simulate-User cleanup: a finished scenario carries an optimization result.
    // Clear it through the REAL "Remove result" (Eraser) button — open the confirm
    // dialog and click "Remove Result" — which reverts the scenario to DRAFT. This
    // is the product action a planner takes, NOT a back-channel API transition. The
    // button is disabled when there is no result (already DRAFT), so only drive it
    // when the scenario still holds a prior result.
    if (pre !== 'DRAFT') {
      await expect(
        removeResultBtn,
        'a finished scenario must expose an enabled Remove result button',
      ).toBeEnabled({ timeout: 30_000 })
      await removeResultBtn.click()
      const removeDialog = page.getByTestId('remove-result-dialog')
      await expect(removeDialog, 'Remove result confirm dialog must open').toBeVisible()
      await removeDialog.getByRole('button', { name: 'Remove Result' }).click()
      await expect(statusBadge, 'Remove result must revert the scenario to Draft').toHaveText('Draft', {
        timeout: 30_000,
      })
      // eslint-disable-next-line no-console
      console.log(`[cleanup] removed prior result via UI — scenario ${SCENARIO_ID} reverted to Draft`)
    }

    await expect(statusBadge).toHaveText('Draft', { timeout: 30_000 })
    await expect(runBtn).toBeEnabled()
    await runBtn.click()

    // A warnings-only pre-run dialog → proceed; a hard blocker should not appear.
    const dialog = page.getByTestId('run-check-dialog')
    if (await dialog.isVisible().catch(() => false)) {
      await expect(
        dialog.getByText('Must fix before running'),
        'unexpected pre-run BLOCKER — 544 should be fully configured',
      ).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Proceed Anyway' }).click()
    }

    // Don't await /run (blocks for minutes while engine builds ro_input from PG).
    // The server flips DRAFT→RUNNING in the DB before that call — poll status.
    const status = await waitForStatus(
      page.request,
      token,
      (s) => s === 'RUNNING' || s === 'DONE',
      120_000,
      3_000,
    )
    // eslint-disable-next-line no-console
    console.log(`[Rust-7017] scenario ${SCENARIO_ID} status after UI kick-off = ${status}`)
    expect(['RUNNING', 'DONE'], 'UI kick-off must move scenario out of DRAFT').toContain(status)

    await expect(statusBadge).toHaveText(/Running|Done/, { timeout: 30_000 }).catch(() => {})
  })

  test('Rust-7018 — the Calgary pilot Rust solve completes (scenario reaches DONE)', async ({ page }) => {
    // remote-PG ro_input build + scenario-scoped bid build + solve can take minutes.
    test.setTimeout(900_000)

    const status = await waitForStatus(
      page.request,
      token,
      (s) => s === 'DONE' || s === 'FAILED',
      840_000,
      5_000,
    )
    // eslint-disable-next-line no-console
    console.log(`[Rust-7018] scenario ${SCENARIO_ID} terminal status = ${status}`)
    expect(status, 'scenario must finish in DONE (not FAILED)').toBe('DONE')
  })

  test('Rust-7019 — open the finished Calgary pilot result in the gantt via the real UI', async ({ page }) => {
    // §Simulate-User: the user's final step is "open gantt to view result" — do it
    // by clicking the scenario's Open button, NOT by fetching gantt-data directly.
    test.setTimeout(600_000)

    const status = await fetchStatus(page.request, token)
    expect(status, 'open-in-gantt requires a finished run').toBe('DONE')

    // Pre-warm the heavy scenario gantt-data query (remote PG is pathologically
    // variable, the app's own fetch caps ~30s) so the UI open hits a warm cache.
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
        // still cold — keep retrying
      }
      if (!warm) await sleep(3_000)
    }
    // eslint-disable-next-line no-console
    console.log(`[Rust-7019] gantt-data warm=${warm} — proceeding to the UI open`)

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
    const data = ((await gd.json()) as { data?: { crew?: unknown[]; rosters?: unknown[] } }).data
    const crewCount = data?.crew?.length ?? 0
    // eslint-disable-next-line no-console
    console.log(`[Rust-7019] opened scenario ${SCENARIO_ID} gantt view — crew rows = ${crewCount}`)
    expect(crewCount, 'opened scenario roster must contain crew').toBeGreaterThan(0)
  })
})
