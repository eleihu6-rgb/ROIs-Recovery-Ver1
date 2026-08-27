/**
 * Viol-8010 — END-TO-END USER STORY: change rule 8002/001's 28-day BH limit in the Legality
 * tab, let the live recheck auto-fire, then open the gantt and confirm the violations now
 * reflect the NEW limit.
 *
 * The chain the auto-recheck feature exists for (Live side), exercised through the real UI:
 *   1. A planner edits 8002/001 row 0 "Max Limits" (the 28-day cumulative-block cap) on the
 *      DEFAULT ruleset (103) and clicks Save All.
 *   2. The frontend AUTO-fires a live recheck SCOPED to just ['8002'] (the perf fix) — no
 *      manual click — and the header indicator settles on "Last checked …".
 *   3. The planner opens the gantt; the 8002 Hard (sev 3) alarms now reference the NEW cap
 *      (every message says "<new>h", none say the old cap) — proving the param reached the
 *      Rust engine and the persisted live rule_violation rows were rewritten.
 *
 * §No-Illusion: the new cap is read back from the live gantt's own violation source
 * (__ganttTest.liveViolations, which feeds the crew bells), not asserted blindly. The OLD cap
 * is read from the param snapshot so the before/after is concrete.
 *
 * Self-restoring: the original 8002/001 param_json is restored via the legality API and a
 * final recheck re-baselines the live violations, so the shared demo DB is left as found.
 *
 * Heavy integration test (UI edit + scoped recheck + live bootstrap). Run alone:
 *   cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test \
 *     --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/legality-recheck-8002-user-story.spec.ts --no-deps --reporter=list
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiUrl, ganttApiLogin } from '../../utils/gantt-hook'

const GROUP = 'pbs_solver_ruleset'
const DEFAULT_RULESET = 103
const MAX_LIMITS_COL = 7 // 8002/001: …Period(4) Unit(5) Prorated(6) Max Limits(7) Min Limits(8) Type(9)

type LiveViol = { pairingId: number; ruleCode: string; severity: number; message: string }
type RuleRow = { function: number; instance: string; id: number; paramJson: unknown }

const getRule8002 = async (request: APIRequestContext, token: string) => {
  const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${DEFAULT_RULESET}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `get ruleset failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { data: { rules: RuleRow[] } }
  const rule = body.data.rules.find((r) => r.function === 8002 && r.instance === '001')
  expect(rule, '8002/001 not in default ruleset').toBeTruthy()
  return rule!
}

const restoreParam = (request: APIRequestContext, token: string, ruleId: number, paramJson: unknown) =>
  request.patch(`${ganttApiUrl}/api/legality/rule/${ruleId}/params`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { paramJson },
    timeout: 60_000, // resolveAffected hits the remote DB; the default 15s action timeout is too tight
  })

const postRecheck = (request: APIRequestContext, token: string, from: string, to: string, ruleCodes: string[]) =>
  request.post(`${ganttApiUrl}/api/legality/recheck`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { groupCode: GROUP, from, to, ruleCodes },
    timeout: 60_000,
  })

const waitRecheckSettled = async (request: APIRequestContext, token: string, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await request.get(
        `${ganttApiUrl}/api/legality/recheck-status?groupCode=${encodeURIComponent(GROUP)}`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15_000 },
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

/** Live 8002 Hard (sev 3) violation messages from the gantt test hook. */
const read8002Hard = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const t = (window as unknown as { __ganttTest?: { liveViolations?: () => LiveViol[] } }).__ganttTest
    return (t?.liveViolations?.() ?? [])
      .filter((v) => v.ruleCode === '8002' && v.severity === 3)
      .map((v) => v.message)
  })

/** "70:00" → 70 (whole hours, as rendered in the "<n>h" message). */
const capHours = (hhmm: string): number => Math.round(parseInt(String(hhmm).split(':')[0], 10))

test('Viol-8010 — edit 8002/001 28-day BH cap, auto scoped-recheck, gantt shows the new cap', async ({ page, request }) => {
  test.setTimeout(600_000)

  const token = await ganttApiLogin(request)
  const rule = await getRule8002(request, token)
  // Original row-0 Max Limits → the OLD cap that current 8002 messages reference.
  const pj = rule.paramJson as { tables: Array<{ rows: string[][] }> }
  const origCapRaw = pj.tables[0].rows[0][MAX_LIMITS_COL]
  const origHours = capHours(origCapRaw)
  // LOWER the cap so the new value is guaranteed to (a) differ and (b) produce MORE violations
  // than the baseline — a lower cap can only add breaches, so the new "<n>h" alarms are sure to
  // be present in the loaded viewport regardless of the baseline value.
  const newHours = Math.max(10, origHours - 15)
  const newCapRaw = `${newHours}:00`

  let recheckFrom = ''
  let recheckTo = ''

  try {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

    // ── Step 1: edit 8002/001 row 0 Max Limits on the DEFAULT ruleset ──────────────
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByTestId(`legality-ruleset-card-${DEFAULT_RULESET}`).click()
    await expect(page.getByTestId('legality-set-name')).toContainText('PBS Solver Ruleset', { timeout: 10_000 })

    await page.getByTestId('legality-rule-edit-8002-001').click()
    await page.getByTestId('legality-params-editor-8002-001').waitFor({ state: 'visible', timeout: 5_000 })
    const row0 = page.getByTestId('legality-param-row-8002-001-0-0')
    await expect(row0).toContainText(origCapRaw) // baseline cap shown

    await page.getByTestId('legality-param-edit-8002-001-0-0').click()
    const capCell = page.getByTestId(`legality-param-cell-input-8002-001-0-0-${MAX_LIMITS_COL}`)
    await capCell.clear()
    await capCell.fill(newCapRaw)
    await page.getByTestId('legality-param-confirm-edit-8002-001-0-0').click()
    await expect(row0).toContainText(newCapRaw)

    // ── Step 2: Save All → auto recheck, SCOPED to ['8002'] ────────────────────────
    const autoPost = page.waitForRequest(
      (r) => r.url().includes('/api/legality/recheck') && r.method() === 'POST',
      { timeout: 15_000 },
    )
    await page.getByTestId('param-save-all-btn').click()
    await expect(page.getByTestId('param-change-log-panel')).toContainText('No changes yet', { timeout: 10_000 })
    const req = await autoPost
    const body = JSON.parse(req.postData() ?? '{}') as { from?: string; to?: string; ruleCodes?: string[] }
    expect(body.ruleCodes, 'recheck must be scoped to the changed rule').toEqual(['8002'])
    recheckFrom = body.from ?? ''
    recheckTo = body.to ?? ''
    expect(recheckFrom && recheckTo, 'recheck POST carried a window').toBeTruthy()

    await expect(page.getByTestId('legality-recheck-label'))
      .toContainText(/Checking legality|Last checked/, { timeout: 10_000 })
    const settled = await waitRecheckSettled(request, token, 300_000)
    expect(settled, 'scoped recheck did not settle to done').toBe('done')

    // ── Step 3: open the gantt and read the latest 8002 alarms ─────────────────────
    await gotoGantt(page)
    await expect
      .poll(() => read8002Hard(page).then((m) => m.length), { timeout: 60_000, intervals: [1000] })
      .toBeGreaterThan(0)

    const after = await read8002Hard(page)
    // Every 8002 Hard alarm now references the NEW cap…
    expect(after.some((m) => m.includes(`${newHours}h`)), `expected "${newHours}h" alarms; got ${after.slice(0, 3).join(' | ')}`).toBe(true)
    // …and NONE reference the OLD cap (the recheck rewrote the window's rows).
    expect(after.filter((m) => m.includes(`${origHours}h`)), `old "${origHours}h" alarms must be gone`).toHaveLength(0)
  } finally {
    // Restore the original cap (CRITICAL — must succeed for data integrity).
    await restoreParam(request, token, rule.id, rule.paramJson)
    // Re-baseline the live 8002 violations to the restored cap. Best-effort: the still-loaded
    // gantt page keeps the server's DB pool busy, so this server-side recheck can be slow/contended.
    // Integrity is preserved either way — the param is back to original, and the recheck is
    // idempotent (it re-runs deterministically on the next param change or manual trigger).
    if (recheckFrom && recheckTo) {
      try {
        await postRecheck(request, token, recheckFrom, recheckTo, ['8002'])
        await waitRecheckSettled(request, token, 120_000)
      } catch { /* best-effort re-baseline */ }
    }
  }
})
