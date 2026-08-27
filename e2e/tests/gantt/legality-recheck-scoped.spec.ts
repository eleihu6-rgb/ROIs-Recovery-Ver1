/**
 * Scoped live recheck (perf fix) — Legal-6040 / Legal-6041.
 *
 * Background: a rule-param save auto-triggers a live legality recheck. Originally it
 * recomputed ALL 9 engine rules over the active window — ~12 min over the remote DB, which
 * looked "stuck" to planners. The fix scopes the recheck to the CHANGED rule (+ its
 * dependents) so a single-rule edit recomputes one rule (~25s) instead of nine.
 *
 * These tests pin the scoping contract end-to-end:
 *   - Legal-6040: editing a standalone checker (8002/001) on the DEFAULT ruleset auto-fires
 *     a recheck whose POST body is scoped to exactly ['8002'], and that recheck settles to
 *     done (proves the fast scoped path runs, not the 12-min whole-group path).
 *   - Legal-6041: the dependency map is honoured — changing 7503 also rechecks 7504 (7504
 *     reads 7503's WOCL window), asserted at the API layer via the PATCH response's
 *     recheckRuleCodes (no slow recompute needed).
 *
 * Both snapshot + restore rule.param_json so the shared demo DB is left untouched.
 * §No-Illusion: assertions check the concrete scoped rule-code payload, not bare visibility.
 *
 * Run alone (pbs-server not needed):
 *   cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test \
 *     --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/legality-recheck-scoped.spec.ts --no-deps --reporter=list
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { seedGanttAuth, ganttApiUrl, ganttApiLogin } from '../../utils/gantt-hook'

const GROUP = 'pbs_solver_ruleset'
const DEFAULT_RULESET = 103

type RuleRow = { function: number; instance: string; id: number; paramJson: unknown }

const getRule = async (request: APIRequestContext, token: string, fn: number, inst: string) => {
  const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${DEFAULT_RULESET}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `get ruleset ${DEFAULT_RULESET} failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { data: { rules: RuleRow[] } }
  const rule = body.data.rules.find((r) => r.function === fn && r.instance === inst)
  expect(rule, `${fn}/${inst} not in default ruleset`).toBeTruthy()
  return rule!
}

const patchParam = async (request: APIRequestContext, token: string, ruleId: number, paramJson: unknown) =>
  request.patch(`${ganttApiUrl}/api/legality/rule/${ruleId}/params`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { paramJson },
  })

const waitRecheckSettled = async (request: APIRequestContext, token: string, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await request.get(
      `${ganttApiUrl}/api/legality/recheck-status?groupCode=${encodeURIComponent(GROUP)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (res.ok()) {
      const s = ((await res.json()) as { data: { status: string } }).data
      if (s.status === 'done') return 'done'
      if (s.status === 'failed') return 'failed'
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return 'timeout'
}

const openLegalityDefault = async (page: Page) => {
  await page.getByTestId('module-nav-legality').click()
  await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId(`legality-ruleset-card-${DEFAULT_RULESET}`).click()
  await expect(page.getByTestId('legality-set-name')).toContainText('PBS Solver Ruleset', { timeout: 10_000 })
}

test('Legal-6040 — single-rule edit auto-rechecks only that rule (scoped), and it completes', async ({ page, request }) => {
  test.setTimeout(240_000)
  const token = await ganttApiLogin(request)
  const rule = await getRule(request, token, 8002, '006')

  try {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
    await openLegalityDefault(page)

    // Expand + inline-edit 8002/001 row 0 (change Bases '*' → 'YEG'; restored via API after).
    await page.getByTestId('legality-rule-edit-8002-001').click()
    await page.getByTestId('legality-params-editor-8002-001').waitFor({ state: 'visible', timeout: 5_000 })
    await page.getByTestId('legality-param-edit-8002-001-0-0').click()
    await page.getByTestId('legality-param-cell-input-8002-001-0-0-0').fill('YEG')
    await page.getByTestId('legality-param-confirm-edit-8002-001-0-0').click()

    // Save All → the frontend auto-fires the recheck; capture the POST and assert it is
    // SCOPED to exactly ['8002'] (not a whole-group recheck).
    const autoPost = page.waitForRequest(
      (r) => r.url().includes('/api/legality/recheck') && r.method() === 'POST',
      { timeout: 15_000 },
    )
    await page.getByTestId('param-save-all-btn').click()
    await expect(page.getByTestId('param-change-log-panel')).toContainText('No changes yet', { timeout: 10_000 })
    const req = await autoPost
    const body = JSON.parse(req.postData() ?? '{}') as { ruleCodes?: string[] }
    expect(body.ruleCodes, 'recheck POST must be scoped to the changed rule').toEqual(['8002'])

    // The indicator reflects the running recheck, and the scoped recheck actually completes
    // (the whole-group path would still be running well past this timeout).
    await expect(page.getByTestId('legality-recheck-label'))
      .toContainText(/Checking legality|Last checked/, { timeout: 10_000 })
    const settled = await waitRecheckSettled(request, token, 180_000)
    expect(settled, 'scoped recheck did not settle to done').toBe('done')
  } finally {
    await patchParam(request, token, rule.id, rule.paramJson)
  }
})

test('Legal-6041 — dependency map: editing 7503 also rechecks its dependent 7504', async ({ request }) => {
  const token = await ganttApiLogin(request)
  const rule = await getRule(request, token, 7503, '003')
  // No-op PATCH (same param_json) — recheckRuleCodes is derived from the rule identity, not the
  // payload, so this proves the dep map without changing data or spawning a recompute.
  const res = await patchParam(request, token, rule.id, rule.paramJson)
  expect(res.ok(), `patch 7503 failed: ${res.status()}`).toBeTruthy()
  const data = ((await res.json()) as { data: { recheckRuleCodes: string[] } }).data
  expect(data.recheckRuleCodes, '7503 edit must recheck 7503 + dependent 7504').toEqual(['7503', '7504'])
})
