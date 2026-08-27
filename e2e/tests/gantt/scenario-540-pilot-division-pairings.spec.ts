/**
 * Scen-2012 — Division isolation regression: pilot scenario #540 must NOT show
 * cabin pairings.
 *
 * This is the §No-Illusion gate for Tasks 1-3 (backend):
 *   - pairing-division-filter.ts helper: filterPairingsByCrewDivision
 *   - wired into parseCrewAndPairings (gz/snapshot path)
 *   - wired into buildGanttDataFromDb (db path)
 *   - pairingIdSet scope in scenario-export-service.ts
 *
 * Strategy (no mocks — real backend only):
 *   1. Log in and open scenario #540 through the REAL gantt UI (§Simulate-User).
 *   2. Pre-warm the gantt-data endpoint so the UI's own fetch hits a warm response.
 *   3. After the scenario-gantt-view mounts, assert via:
 *      a. The raw gantt-data API response (read-only, NOT mocking) — every pairing
 *         has division='P' (not 'C'); no composition rank is 'IFD'/'FA'; label
 *         'V4519' (the bug's specific leaked cabin pairing) is absent.
 *      b. window.__ganttTest.scenarioPairings(540) — at least 1 pairing loaded in
 *         the store (proves the scenario gantt view consumed the filtered response).
 *         Label 'V4519' absent from the store too.
 *
 * Run (pbs-server may be down; engine not needed):
 *   cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test \
 *     tests/gantt/scenario-540-pilot-division-pairings.spec.ts --reporter=list --no-deps
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://127.0.0.1:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'Ryan'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? 'Our2027'

const SCENARIO_ID = 540
const SCENARIO_NAME = 'YVR-RUST Seam Connector'

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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface GanttDataPairing {
  pairingId: number
  pairingLabel: string | null
  division: string
  compositions: Array<{ rank: string; plan: number; fill: number }>
}

/**
 * Pre-warm the gantt-data endpoint until one call returns within 9 s.
 * Also returns the warm response body so we can assert on the backend output
 * directly, without needing a second round-trip after the UI loads.
 */
const warmGanttData = async (
  request: Req,
  token: string,
  timeoutMs = 240_000,
): Promise<{ warm: boolean; pairings: GanttDataPairing[]; crew: Array<{ crewId: string; division: string }> }> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const t0 = Date.now()
    try {
      const r = await request.get(`${GANTT_API}/api/scenario/${SCENARIO_ID}/gantt-data`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10_000,
      })
      if (r.ok() && Date.now() - t0 < 9_000) {
        const body = await r.json() as {
          data?: { pairings?: GanttDataPairing[]; crew?: Array<{ crewId: string; division: string }> }
        }
        return {
          warm: true,
          pairings: body.data?.pairings ?? [],
          crew: body.data?.crew ?? [],
        }
      }
    } catch {
      // still cold — keep retrying
    }
    await sleep(3_000)
  }
  return { warm: false, pairings: [], crew: [] }
}

test('Scen-2012 — #540 pilot scenario shows only pilot pairings (no cabin division leak)', async ({ page }) => {
  test.setTimeout(360_000)

  // ── Auth ──────────────────────────────────────────────────────────────
  const auth = await login(page.request)
  await page.addInitScript((a) => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({
        user: { userCode: a.userCode, userName: a.userName, schema: a.schema },
        token: a.token,
      }),
    )
  }, auth)

  // ── Pre-warm + capture backend response ───────────────────────────────
  // eslint-disable-next-line no-console
  console.log('[Scen-2012] warming gantt-data endpoint for scenario 540…')
  const { warm, pairings: apiPairings, crew: apiCrew } = await warmGanttData(page.request, auth.token)
  // eslint-disable-next-line no-console
  console.log(`[Scen-2012] gantt-data warm=${warm}, pairings=${apiPairings.length}, crew=${apiCrew.length}`)

  // ── Part A: Assert on the REAL backend API response ───────────────────
  // The gantt-data endpoint IS the backend division filter's output.
  // Asserting on its response proves the filter is active end-to-end — this is
  // a read-only assertion, not mocking.

  // Fix 1: Hard assertions — Part A can never be silently bypassed (§No-Illusion).
  expect(warm, 'scenario #540 gantt-data must load (warm-up succeeded)').toBeTruthy()
  expect(apiPairings.length, '#540 must return pairings to prove filtering, not an empty pane').toBeGreaterThan(0)

  // eslint-disable-next-line no-console
  console.log(`[Scen-2012] API pairing divisions: ${[...new Set(apiPairings.map((p) => p.division))].join(', ')}`)
  // eslint-disable-next-line no-console
  console.log(`[Scen-2012] API crew divisions: ${[...new Set(apiCrew.map((c) => c.division))].join(', ')}`)

  // Fix 2: Guard against a backend field rename (compositions → composition).
  // If the field were renamed, `?? []` would make all rank checks pass vacuously.
  expect(apiPairings[0].compositions, 'pairing.compositions field must be present (guards against a field rename)').toBeDefined()

  // The specific leaked cabin pairing from the bug report must be absent.
  const v4519 = apiPairings.find((p) => (p.pairingLabel ?? '').includes('V4519'))
  expect(
    v4519,
    'cabin pairing V4519 must NOT appear in the gantt-data response for pilot scenario #540',
  ).toBeUndefined()

  // Every pairing must belong to the pilot division.
  const cabinPairings = apiPairings.filter((p) => p.division === 'C' || p.division === 'Cabin')
  expect(
    cabinPairings.length,
    `no cabin pairings may appear in a pilot scenario; found: ${cabinPairings.map((p) => p.pairingLabel ?? p.pairingId).join(', ')}`,
  ).toBe(0)

  // No pairing may carry a cabin-only rank (IFD = In-Flight Director, FA = Flight Attendant).
  for (const p of apiPairings) {
    const ranks = (p.compositions ?? []).map((c) => c.rank)
    expect(
      ranks.includes('IFD'),
      `pairing ${p.pairingLabel ?? p.pairingId} must not have rank 'IFD' in compositions`,
    ).toBe(false)
    expect(
      ranks.includes('FA'),
      `pairing ${p.pairingLabel ?? p.pairingId} must not have rank 'FA' in compositions`,
    ).toBe(false)
  }

  // eslint-disable-next-line no-console
  console.log('[Scen-2012] Part A (API): PASS — all pairings are pilot division, no IFD/FA ranks, no V4519')

  // ── Part B: Open via the REAL UI and assert via window.__ganttTest ────
  // §Simulate-User: click the real Open button; the UI fires its own gantt-data fetch.
  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  const row = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
  await row.click()
  await expect(scenario.detailPanel).toBeVisible()

  const openBtn = scenario.detailPanel.getByTestId('scenario-open-btn')
  await expect(openBtn, '#540 must have an Open button (must be in DONE state)').toBeVisible({ timeout: 20_000 })
  await openBtn.click()

  // The Scenario Gantt view mounts only after gantt-data resolves (pre-warmed above).
  const view = page.getByTestId('scenario-gantt-view')
  await expect(view, 'scenario-gantt-view must mount after Open').toBeVisible({ timeout: 120_000 })

  // ── Assert via window.__ganttTest.scenarioPairings (§No-Illusion) ────
  // scenarioPairings() reads from the same scenario gantt store the pane renders.
  // It returns { id, base, label } — enough to confirm:
  //  (a) the store is populated (proves the gantt consumed the backend response), and
  //  (b) the leaked cabin pairing label 'V4519' is absent.
  type PairingBrief = { id: number; base: string; label: string | null }

  await expect
    .poll(
      () =>
        page.evaluate(
          (sid: number): number =>
            ((window as unknown as {
              __ganttTest?: { scenarioPairings?: (id: number) => PairingBrief[] | null }
            }).__ganttTest?.scenarioPairings?.(sid) ?? []).length,
          SCENARIO_ID,
        ),
      { timeout: 30_000, message: 'scenarioPairings must return at least 1 pairing after view mounts' },
    )
    .toBeGreaterThan(0)

  const loaded = await page.evaluate(
    (sid: number): PairingBrief[] =>
      (window as unknown as {
        __ganttTest?: { scenarioPairings?: (id: number) => PairingBrief[] | null }
      }).__ganttTest?.scenarioPairings?.(sid) ?? [],
    SCENARIO_ID,
  )

  expect(loaded.length, 'at least 1 pilot pairing must be loaded in the store').toBeGreaterThan(0)

  // The specific cabin pairing from the bug report must be absent from the store.
  const v4519InStore = loaded.some((p) => (p.label ?? '').includes('V4519'))
  expect(
    v4519InStore,
    'cabin pairing V4519 must NOT appear in the scenario gantt store for #540',
  ).toBe(false)

  // eslint-disable-next-line no-console
  console.log(`[Scen-2012] Part B (UI+store): ${loaded.length} pairings in store; V4519 absent=${!v4519InStore}`)
  // eslint-disable-next-line no-console
  console.log('[Scen-2012] PASS')
})
