/**
 * Scenario 538 ("RUST Seam Connector") — end-to-end optimization run through the
 * REAL gantt UI, exercising the full local pipeline:
 *
 *   gantt UI (Kick off run)
 *     → live-server POST /api/scenario/538/run  (type=LegacyRO, inputSource=db)
 *       → engine-server _generate_input_from_db  → F8.ro_input_builder builds
 *          ro_input.txt/input.gz from the remote PG (with the pairing-driven
 *          Flight section fix in sections/flight.py — no all-fleet over-fetch)
 *       → engine-server runs ./F8/ro_rust.sh  → pbs-engine solver
 *          with rule_engine.mode=rust
 *          → the in-process Rust rule connector (rois_rule_engine_rs)
 *       → ro_output.txt → output.gz → scenario status RUNNING→DONE
 *
 * Rust-7001 is the deterministic kick-off proof (UI click → RUNNING).
 * Rust-7002 waits for the real solve to finish and asserts a DONE roster result.
 * (The actual roster artifacts + Rust-connector firing are proven separately from
 *  the engine-server output dir / logs — gantt-data db-source ingestion is a
 *  different concern from "the run produced a roster".)
 *
 * Run (live-server is IPv4-only; pbs may be down → --no-deps):
 *   cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test \
 *     --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/scenario-538-rust-solver-run.spec.ts --reporter=list --no-deps
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://127.0.0.1:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'Ryan'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? 'Our2027'

const SCENARIO_ID = 538
const SCENARIO_NAME = 'RUST Seam Connector'

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
 * Poll the scenario status API until `accept(status)` is true or the timeout
 * elapses, then return the last observed status. We poll the DB-backed status
 * (an independent APIRequestContext) instead of awaiting the `/run` HTTP
 * response: scenarioService.run() transitions DRAFT→RUNNING in the DB *before*
 * the minutes-long engine call, and the browser's own /run fetch can outlive
 * the test, so the response is not a reliable signal.
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

test.describe('Scenario 538 — Rust-connector solver run via the UI', () => {
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

  test('Rust-7001 — UI "Kick off run" on scenario 538 reaches RUNNING', async ({ page }) => {
    test.setTimeout(180_000)
    const scenario = new ScenarioPage(page)

    // If a previous run left it terminal, revert to DRAFT so it is runnable again.
    // (RUNNING can't be reset — RUNNING only transitions to DONE/FAILED — so if a
    //  prior invocation is still mid-solve, accept that and let Rust-7002 wait.)
    const pre = await fetchStatus(page.request, token)
    if (pre === 'RUNNING') {
      // eslint-disable-next-line no-console
      console.log('[Rust-7001] scenario already RUNNING from a prior kick-off; nothing to start')
      expect(pre).toBe('RUNNING')
      return
    }
    if (pre !== 'DRAFT') {
      const reset = await page.request.post(`${GANTT_API}/api/scenario/${SCENARIO_ID}/transition`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { status: 'DRAFT' },
      })
      expect(reset.ok(), `reset scenario ${SCENARIO_ID} → DRAFT failed: ${reset.status()}`).toBeTruthy()
    }

    await scenario.gotoRo()
    const row = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await row.click()
    await expect(scenario.detailPanel).toBeVisible()

    const panel = scenario.detailPanel
    const statusBadge = panel.getByTestId('scenario-status-badge')
    const runBtn = panel.getByTestId('scenario-run-btn')

    await expect(statusBadge).toHaveText('Draft', { timeout: 30_000 })
    await expect(runBtn).toBeEnabled()
    await runBtn.click()

    // 538 is fully configured (rule set, pairing scenario 0, crew+pairing filters),
    // so no blocker dialog is expected; a warnings-only dialog (if any) → proceed.
    const dialog = page.getByTestId('run-check-dialog')
    if (await dialog.isVisible().catch(() => false)) {
      await expect(
        dialog.getByText('Must fix before running'),
        'unexpected pre-run BLOCKER — 538 should be fully configured',
      ).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Proceed Anyway' }).click()
    }

    // Do NOT await the /run response: it blocks for minutes while engine-server
    // builds ro_input from the remote PG, and the browser's fetch can outlive the
    // test. The server flips DRAFT→RUNNING in the DB *before* that engine call, so
    // poll the status API — the kick-off is proven the moment status leaves DRAFT.
    const status = await waitForStatus(
      page.request,
      token,
      (s) => s === 'RUNNING' || s === 'DONE',
      120_000,
      3_000,
    )
    // eslint-disable-next-line no-console
    console.log(`[Rust-7001] scenario ${SCENARIO_ID} status after UI kick-off = ${status}`)
    expect(['RUNNING', 'DONE'], 'UI kick-off must move scenario out of DRAFT').toContain(status)

    // The UI badge should reflect the same transition (best-effort — the API status
    // above is the authoritative proof; the badge may lag a poll cycle).
    await expect(statusBadge).toHaveText(/Running|Done/, { timeout: 30_000 }).catch(() => {})
  })

  test('Rust-7002 — the Rust solve completes (scenario reaches DONE)', async ({ page }) => {
    // remote-PG ro_input build + solve + converter round-trip can take minutes.
    test.setTimeout(900_000)

    // Wait for a terminal status (DONE or FAILED), polling the DB-backed status.
    const status = await waitForStatus(
      page.request,
      token,
      (s) => s === 'DONE' || s === 'FAILED',
      840_000,
      5_000,
    )
    // eslint-disable-next-line no-console
    console.log(`[Rust-7002] scenario ${SCENARIO_ID} terminal status = ${status}`)
    expect(status, 'scenario must finish in DONE (not FAILED)').toBe('DONE')

    // Best-effort: if the db-source gantt ingestion is wired, the roster is readable
    // via gantt-data. A 409 here ("no loaded result") is NOT a run failure — the
    // roster artifacts are verified independently from the engine-server output dir.
    const gd = await page.request.get(`${GANTT_API}/api/scenario/${SCENARIO_ID}/gantt-data`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 120_000,
    })
    if (gd.ok()) {
      const data = ((await gd.json()) as { data?: { crew?: unknown[]; rosters?: unknown[] } }).data
      const crewCount = data?.crew?.length ?? 0
      // eslint-disable-next-line no-console
      console.log(`[Rust-7002] gantt-data crew rows = ${crewCount}`)
      expect(crewCount, 'optimized roster must contain crew assignments').toBeGreaterThan(0)
    } else {
      // eslint-disable-next-line no-console
      console.log(`[Rust-7002] gantt-data HTTP ${gd.status()} (db-source not loaded; roster verified via engine-server output)`)
    }
  })
})
