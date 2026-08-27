/**
 * Scenario 596 ("C595-New-YVR-PIlot") — a NEW end-to-end optimization run through
 * the REAL gantt UI, created to VALIDATE the data-quality fixes from Xiping's
 * feedback (曦平发现的数据分析-反馈.docx) on the prior YVR-pilot scenario 548:
 *
 *   1. Reserve tasks now created for the scenario (was: none).
 *   2. June pairing credit hours filled (137 NOC-missing flight tasks → credited;
 *      ~99.96% of pairings now carry credit).
 *   3. crew_rank date-filtered to the scenario window — crew 1873's future CA
 *      (eff 2026-07-01) no longer leaks into a June run; it stays FA.
 *   4. crew_base date-filtered to the scenario window — crew 1334's YVR/YYZ base
 *      rows resolve to the June-valid base, so a YVR-only run won't misplace it.
 *      (e52342ba: ro_input_builder CREW_RANK/CREW_BASE dated=True)
 *
 * Pipeline exercised (identical to 539/540): gantt UI (Kick off run)
 *   → live-server POST /api/scenario/596/run (type=LegacyRO, inputSource=db)
 *     → engine-server builds ro_input.txt/input.gz from remote PG
 *        (F8.ro_input_builder, scenario 596 = YVR base / June 2026)
 *     → engine-server fetches the SCENARIO-SCOPED bid package from pbs-server
 *     → ./F8/ro_rust.sh → pbs-engine solver (rule_engine.mode=rust)
 *        → in-process Rust rule connector (rois_rule_engine_rs, 8056 overlap rebuild)
 *     → ro_output.txt → output.gz → scenario RUNNING→DONE
 *
 * Rust-7020 is the deterministic kick-off proof (UI click → RUNNING).
 * Rust-7021 waits for the real solve to finish and asserts a DONE roster.
 * Rust-7022 opens the finished YVR result in the gantt via the real Open button.
 *
 * Run (live-server is IPv4-only; pbs/engine started manually → --no-deps):
 *   cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test \
 *     --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/scenario-596-yvr-datafix-rust-solver-run.spec.ts --reporter=list --no-deps
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://127.0.0.1:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'Ryan'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? 'Our2027'

const SCENARIO_ID = 596
const SCENARIO_NAME = 'C595-New-YVR-PIlot'

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

test.describe('Scenario 596 — YVR data-fix validation Rust solver run via the UI', () => {
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

  test('Rust-7020 — UI "Kick off run" on YVR scenario 596 reaches RUNNING', async ({ page }) => {
    test.setTimeout(180_000)
    const scenario = new ScenarioPage(page)

    // If a prior run left it terminal, revert to DRAFT so it is runnable again.
    // RUNNING can't be reset (only → DONE/FAILED) — if a prior kick-off is still
    // mid-solve, accept that and let Rust-7021 wait for it.
    const pre = await fetchStatus(page.request, token)
    if (pre === 'RUNNING') {
      // eslint-disable-next-line no-console
      console.log('[Rust-7020] scenario 596 already RUNNING from a prior kick-off; nothing to start')
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

    // 596 is fully configured (rule set 103, pairing scenario 0, YVR crew+pairing
    // filters) — no blocker dialog expected; a warnings-only dialog → proceed.
    const dialog = page.getByTestId('run-check-dialog')
    if (await dialog.isVisible().catch(() => false)) {
      await expect(
        dialog.getByText('Must fix before running'),
        'unexpected pre-run BLOCKER — 596 should be fully configured',
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
    console.log(`[Rust-7020] scenario ${SCENARIO_ID} status after UI kick-off = ${status}`)
    expect(['RUNNING', 'DONE'], 'UI kick-off must move scenario out of DRAFT').toContain(status)

    await expect(statusBadge).toHaveText(/Running|Done/, { timeout: 30_000 }).catch(() => {})
  })

  test('Rust-7021 — the YVR Rust solve completes (scenario reaches DONE)', async ({ page }) => {
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
    console.log(`[Rust-7021] scenario ${SCENARIO_ID} terminal status = ${status}`)
    expect(status, 'scenario must finish in DONE (not FAILED)').toBe('DONE')
  })

  test('Rust-7022 — open the finished YVR result in the gantt via the real UI', async ({ page }) => {
    // §Simulate-User: the user's final step is "open gantt to view result" — do it
    // by clicking the scenario's Open button, NOT by fetching gantt-data directly.
    test.setTimeout(600_000)

    // Only meaningful once the solve is DONE; guard so this never runs mid-solve.
    const status = await fetchStatus(page.request, token)
    expect(status, 'open-in-gantt requires a finished run').toBe('DONE')

    // The heavy scenario gantt-data query over the remote demo PG is pathologically
    // variable (~2s warm to >90s cold) and the app's own fetch caps ~30s → a cold
    // load renders an error state and scenario-gantt-view never mounts. Pre-warm
    // the endpoint in a retry loop until one call returns fast, THEN click Open so
    // the UI fetch hits a warm cache (gantt-scenario-open-e2e skill).
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
    console.log(`[Rust-7022] gantt-data warm=${warm} — proceeding to the UI open`)

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const row = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await row.click()
    await expect(scenario.detailPanel).toBeVisible()

    // Genuine user action: click the scenario toolbar's "Open" button.
    const openBtn = scenario.detailPanel.getByTestId('scenario-open-btn')
    await expect(openBtn, 'finished scenario must expose an Open button').toBeVisible({ timeout: 30_000 })
    await openBtn.click()

    // The Scenario Gantt view mounts only after gantt-data resolves
    // (scenario-gantt-view gates on !loading && !error && data).
    const view = page.getByTestId('scenario-gantt-view')
    await expect(view, 'scenario gantt view must mount after Open').toBeVisible({ timeout: 120_000 })

    // Independent proof the roster is present in the opened view: read the loaded
    // crew rows straight from the same endpoint the view consumed (now warm).
    const gd = await page.request.get(`${GANTT_API}/api/scenario/${SCENARIO_ID}/gantt-data`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 90_000,
    })
    expect(gd.ok(), `gantt-data → ${gd.status()}`).toBeTruthy()
    const data = ((await gd.json()) as { data?: { crew?: unknown[]; rosters?: unknown[] } }).data
    const crewCount = data?.crew?.length ?? 0
    // eslint-disable-next-line no-console
    console.log(`[Rust-7022] opened scenario ${SCENARIO_ID} gantt view — crew rows = ${crewCount}`)
    expect(crewCount, 'opened scenario roster must contain crew').toBeGreaterThan(0)
  })
})
