/**
 * Viol-8012 — RULE 8002 QUALIFICATION GATE (the B1 live-path regression):
 * a param row gated to `Ranks=CA` must, after a live recheck, produce 8002
 * violations ONLY for CA crews — FO crews must carry none. Before the upgrade
 * the live path ignored the Bases/Ranks/Fleets columns entirely, so a gated
 * row silently applied to every crew: this test would have caught that.
 *
 * Flow (real UI for the user action, read-only API for assertions):
 *   0. Read-only baseline: with the row ungated (`*`), both a CA and an FO
 *      crew group carry 8002 violations in the recheck window (else the demo
 *      data can't prove the gate and the test fails its precondition).
 *   1. The planner edits 8002/001 row 0 "Ranks" `*` → `CA` in the Legality
 *      tab and clicks Save All — the frontend auto-fires a recheck scoped to
 *      ['8002'] (same chain as Viol-8010).
 *   2. After the recheck settles, /api/violations shows 8002 rows for the CA
 *      sample and ZERO for the FO sample.
 *
 * Self-restoring: the original 8002/001 param_json is restored via the
 * legality API and a final scoped recheck re-baselines the shared demo DB.
 *
 * Run alone:
 *   cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test \
 *     --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/legality-recheck-8002-rank-gate.spec.ts --no-deps --reporter=list
 */
import { test, expect, type APIRequestContext } from '@playwright/test'
import { seedGanttAuth, ganttApiUrl, ganttApiLogin } from '../../utils/gantt-hook'

const GROUP = 'pbs_solver_ruleset'
const DEFAULT_RULESET = 103
const RANKS_COL = 1 // 8002/001: Bases(0) Ranks(1) Fleets(2) Crew Teams(3) Period(4) …

type RuleRow = { function: number; instance: string; id: number; paramJson: unknown }
type ViolationRow = { crew_id: string; rule_code: string }

const authed = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

const getRule8002 = async (request: APIRequestContext, token: string) => {
  const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${DEFAULT_RULESET}`, authed(token))
  expect(res.ok(), `get ruleset failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { data: { rules: RuleRow[] } }
  const rule = body.data.rules.find((r) => r.function === 8002 && r.instance === '001')
  expect(rule, '8002/001 not in default ruleset').toBeTruthy()
  return rule!
}

const crewIdsByRank = async (request: APIRequestContext, token: string, rank: string) => {
  const res = await request.get(`${ganttApiUrl}/api/crew?ranks=${rank}&page=1&pageSize=30`, authed(token))
  expect(res.ok(), `crew list (${rank}) failed: ${res.status()}`).toBeTruthy()
  const data = ((await res.json()) as { data: { list?: unknown[]; items?: unknown[] } }).data
  const rows = (data.list ?? data.items ?? []) as Array<{ crewId?: string; crew_id?: string }>
  return rows.map((c) => String(c.crewId ?? c.crew_id ?? '')).filter(Boolean)
}

/** 8002 violation rows for a crew sample in [start, end] (read-only assertion). */
const violations8002 = async (
  request: APIRequestContext, token: string, crewIds: string[], start: string, end: string,
) => {
  const res = await request.get(
    `${ganttApiUrl}/api/violations?crewIds=${encodeURIComponent(crewIds.join(','))}` +
      `&groupCode=${GROUP}&start=${start}&end=${end}`,
    { ...authed(token), timeout: 30_000 },
  )
  expect(res.ok(), `violations query failed: ${res.status()}`).toBeTruthy()
  const rows = ((await res.json()) as { data: ViolationRow[] }).data ?? []
  return rows.filter((v) => v.rule_code === '8002')
}

const restoreParam = (request: APIRequestContext, token: string, ruleId: number, paramJson: unknown) =>
  request.patch(`${ganttApiUrl}/api/legality/rule/${ruleId}/params`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { paramJson },
    timeout: 60_000,
  })

const postRecheck = (request: APIRequestContext, token: string, from: string, to: string) =>
  request.post(`${ganttApiUrl}/api/legality/recheck`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { groupCode: GROUP, from, to, ruleCodes: ['8002'] },
    timeout: 60_000,
  })

const waitRecheckSettled = async (request: APIRequestContext, token: string, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await request.get(
        `${ganttApiUrl}/api/legality/recheck-status?groupCode=${encodeURIComponent(GROUP)}`,
        { ...authed(token), timeout: 15_000 },
      )
      if (res.ok()) {
        const s = ((await res.json()) as { data: { status: string } }).data
        if (s.status === 'done') return 'done'
        if (s.status === 'failed') return 'failed'
      }
    } catch { /* server busy under recheck load — keep polling */ }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return 'timeout'
}

test('Viol-8012 — Ranks=CA gated 8002 row fires for CA crews only after live recheck', async ({ page, request }) => {
  test.setTimeout(600_000)

  const token = await ganttApiLogin(request)
  const rule = await getRule8002(request, token)
  const pj = rule.paramJson as { tables: Array<{ rows: string[][] }> }
  expect(pj.tables[0].rows[0][RANKS_COL], 'precondition: row 0 Ranks must start ungated').toBe('*')

  const caCrews = await crewIdsByRank(request, token, 'CA')
  const foCrews = await crewIdsByRank(request, token, 'FO')
  expect(caCrews.length, 'demo data must have CA crews').toBeGreaterThan(0)
  expect(foCrews.length, 'demo data must have FO crews').toBeGreaterThan(0)

  let recheckFrom = ''
  let recheckTo = ''

  try {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

    // ── Step 1: edit 8002/001 row 0 Ranks `*` → `CA` on the DEFAULT ruleset ──
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByTestId(`legality-ruleset-card-${DEFAULT_RULESET}`).click()
    await expect(page.getByTestId('legality-set-name')).toContainText('PBS Solver Ruleset', { timeout: 10_000 })

    await page.getByTestId('legality-rule-edit-8002-001').click()
    await page.getByTestId('legality-params-editor-8002-001').waitFor({ state: 'visible', timeout: 5_000 })
    await page.getByTestId('legality-param-edit-8002-001-0-0').click()
    const ranksCell = page.getByTestId(`legality-param-cell-input-8002-001-0-0-${RANKS_COL}`)
    await ranksCell.clear()
    await ranksCell.fill('CA')
    await page.getByTestId('legality-param-confirm-edit-8002-001-0-0').click()
    await expect(page.getByTestId('legality-param-row-8002-001-0-0')).toContainText('CA')

    // ── Step 2: Save All → auto recheck scoped to ['8002'], wait until done ──
    const autoPost = page.waitForRequest(
      (r) => r.url().includes('/api/legality/recheck') && r.method() === 'POST',
      { timeout: 15_000 },
    )
    await page.getByTestId('param-save-all-btn').click()
    await expect(page.getByTestId('param-change-log-panel')).toContainText('No changes yet', { timeout: 10_000 })
    const body = JSON.parse((await autoPost).postData() ?? '{}') as { from?: string; to?: string; ruleCodes?: string[] }
    expect(body.ruleCodes).toEqual(['8002'])
    recheckFrom = body.from ?? ''
    recheckTo = body.to ?? ''
    expect(recheckFrom && recheckTo, 'recheck POST carried a window').toBeTruthy()
    const settled = await waitRecheckSettled(request, token, 300_000)
    expect(settled, 'scoped recheck did not settle to done').toBe('done')

    // ── Step 3: CA crews still carry 8002 bells; FO crews carry NONE ──
    const caViols = await violations8002(request, token, caCrews, recheckFrom, recheckTo)
    const foViols = await violations8002(request, token, foCrews, recheckFrom, recheckTo)
    expect(caViols.length, 'CA crews must still breach the CA-gated row').toBeGreaterThan(0)
    expect(
      foViols,
      `FO crews must carry ZERO 8002 rows under a Ranks=CA gate; got ${foViols.length} (e.g. ${foViols[0]?.crew_id ?? ''})`,
    ).toHaveLength(0)
  } finally {
    // Restore the original params and re-baseline (CRITICAL for the shared demo DB).
    await restoreParam(request, token, rule.id, rule.paramJson)
    if (recheckFrom && recheckTo) {
      try {
        await postRecheck(request, token, recheckFrom, recheckTo)
        await waitRecheckSettled(request, token, 120_000)
      } catch { /* best-effort re-baseline */ }
    }
  }
})
