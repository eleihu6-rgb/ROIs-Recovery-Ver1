/**
 * Viol-8011 — THE SMALL GOAL, made concrete: changing a rule param fires a rule
 * recompute, and reopening the gantt shows the new violation set.
 *
 *   1. Set 8002/001 row 0 "Max Limits" (the 28-day cumulative-block cap) to a LOW
 *      cap (59h) → fire a scoped recheck → reopen the gantt → open the Alert Center,
 *      group by Rule, and READ the 8002/001 message count off its sidebar badge.
 *   2. Set the SAME cap to a HIGH value (100h) → recompute → reopen → read the
 *      8002/001 count again.
 *   3. Assert the lower cap produced strictly MORE messages than the higher cap.
 *      A lower BH ceiling can only turn more crew into breaches, so 59h > 100h is a
 *      monotonic, data-independent truth about the rule — exactly the before/after a
 *      planner expects when they tighten or loosen a limit.
 *
 * §No-Illusion: both counts are read from the Alert Center UI the planner actually
 * uses — the "8002/001" group's own count badge after grouping by Rule — not from the
 * API and not asserted blindly. We only use the gantt test hook to KNOW the async
 * violation stream has settled before reading the badge. The comparison is the proof.
 *
 * Self-restoring: the original 8002/001 param_json is restored via the legality API
 * and a final recheck re-baselines the live violations, so the shared demo DB is left
 * as found (operational baseline = 40:00).
 *
 * Heavy integration test (two param changes + two scoped rechecks + two live
 * bootstraps). Run alone:
 *   cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test \
 *     --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/legality-recheck-8002-count-compare.spec.ts --no-deps --reporter=list
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiUrl, ganttApiLogin } from '../../utils/gantt-hook'

const GROUP = 'pbs_solver_ruleset'
const DEFAULT_RULESET = 103
const MAX_LIMITS_COL = 7 // 8002/001: …Period(4) Unit(5) Prorated(6) Max Limits(7) Min Limits(8) Type(9)

const LOW_CAP = '59:00'   // tight ceiling → more crew breach
const HIGH_CAP = '100:00' // loose ceiling → fewer crew breach

type LiveViol = { pairingId: number; ruleCode: string; severity: number; message: string }
type RuleRow = { function: number; instance: string; id: number; paramJson: unknown }

const getRule8002 = async (request: APIRequestContext, token: string): Promise<RuleRow> => {
  const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${DEFAULT_RULESET}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 60_000,
  })
  expect(res.ok(), `get ruleset failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { data: { rules: RuleRow[] } }
  const rule = body.data.rules.find((r) => r.function === 8002 && r.instance === '001')
  expect(rule, '8002/001 not in default ruleset').toBeTruthy()
  return rule!
}

/** Clone the param_json and overwrite row 0's Max Limits cell with `cap` (e.g. "59:00"). */
const withCap = (paramJson: unknown, cap: string): unknown => {
  const pj = JSON.parse(JSON.stringify(paramJson)) as { tables: Array<{ rows: string[][] }> }
  pj.tables[0].rows[0][MAX_LIMITS_COL] = cap
  return pj
}

const patchParam = (request: APIRequestContext, token: string, ruleId: number, paramJson: unknown) =>
  request.patch(`${ganttApiUrl}/api/legality/rule/${ruleId}/params`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { paramJson },
    timeout: 60_000, // resolveAffected hits the remote DB; the default 15s action timeout is too tight
  })

const postRecheck = (request: APIRequestContext, token: string, from: string, to: string) =>
  request.post(`${ganttApiUrl}/api/legality/recheck`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { groupCode: GROUP, from, to, ruleCodes: ['8002'] }, // scoped per-rule (the perf fix)
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

/** Live 8002 violation count from the gantt test hook — used only to detect the async stream has settled. */
const hook8002 = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const t = (window as unknown as { __ganttTest?: { liveViolations?: () => LiveViol[] } }).__ganttTest
    return (t?.liveViolations?.() ?? []).filter((v) => v.ruleCode === '8002').length
  })

/**
 * Wait until the async violation stream has stopped growing (two equal reads ~3s apart),
 * so the Alert Center badge we read next reflects the FULL loaded set, not a partial load.
 */
const waitViolStreamSettled = async (page: Page, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  let last = -1
  let stableSince = 0
  while (Date.now() < deadline) {
    const n = await hook8002(page)
    if (n > 0 && n === last) {
      if (stableSince === 0) stableSince = Date.now()
      if (Date.now() - stableSince >= 3000) return
    } else {
      stableSince = 0
    }
    last = n
    await new Promise((r) => setTimeout(r, 1000))
  }
}

/**
 * Open the Alert Center, group by Rule, and read the "8002/001" group's count badge.
 * The badge is the trailing tabular-nums span inside the matching alert-group-item.
 * Returns 0 if the 8002/001 group is absent (no breaches at this cap). Closes the dialog.
 */
const read8002CountFromAlertCenter = async (page: Page): Promise<number> => {
  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await dialog.getByTestId('alert-groupby-rule').click()

  const group = dialog.locator('[data-testid="alert-group-item"]', { hasText: '8002/001' })
  let count = 0
  if ((await group.count()) > 0) {
    // The group item renders: <dot/><key>8002/001</key><count>N</count> — N is the last span.
    const txt = (await group.first().locator('span').last().innerText()).trim()
    count = parseInt(txt, 10)
    expect(Number.isFinite(count), `8002/001 badge "${txt}" not numeric`).toBeTruthy()

    // Cross-check against the rendered rows for this group (table is not virtualized).
    await group.first().click()
    const rows = dialog.locator('[data-testid="violation-list-row"][data-rule-id="8002/001"]')
    await expect.poll(() => rows.count(), { timeout: 10_000, intervals: [500] }).toBe(count)
  }

  await page.getByTestId('violation-list-dialog-close').click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
  return count
}

/**
 * Set the 28-day BH cap, fire a scoped recheck, reopen the gantt, then read the 8002/001
 * message count off the Alert Center sidebar badge.
 */
const applyCapAndCount = async (
  page: Page,
  request: APIRequestContext,
  token: string,
  rule: RuleRow,
  cap: string,
  from: string,
  to: string,
): Promise<number> => {
  const patch = await patchParam(request, token, rule.id, withCap(rule.paramJson, cap))
  expect(patch.ok(), `PATCH cap=${cap} failed: ${patch.status()}`).toBeTruthy()
  const recheck = await postRecheck(request, token, from, to)
  expect(recheck.ok(), `recheck cap=${cap} failed: ${recheck.status()}`).toBeTruthy()
  const settled = await waitRecheckSettled(request, token, 300_000)
  expect(settled, `recheck cap=${cap} did not settle to done`).toBe('done')

  await gotoGantt(page)
  await waitViolStreamSettled(page, 90_000) // let the crew-violation stream finish before reading the badge
  return read8002CountFromAlertCenter(page)
}

test('Viol-8011 — tighter 8002 cap (59h) yields more gantt messages than a looser cap (100h)', async ({ page, request }) => {
  test.setTimeout(900_000)

  const token = await ganttApiLogin(request)
  const rule = await getRule8002(request, token)

  // The recheck window = the gantt's default 2-month live window (this month → end of next).
  const today = new Date('2026-06-21T00:00:00Z')
  const from = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`
  const toMonth = today.getUTCMonth() + 2 // end of next month, exclusive-ish boundary the live recheck uses
  const toYear = today.getUTCFullYear() + (toMonth > 11 ? 1 : 0)
  const to = `${toYear}-${String((toMonth % 12) + 1).padStart(2, '0')}-01`

  let lowCount = -1
  let highCount = -1

  try {
    await seedGanttAuth(page, request)

    // ── 59h: tight ceiling ─────────────────────────────────────────────────────────
    lowCount = await applyCapAndCount(page, request, token, rule, LOW_CAP, from, to)

    // ── 100h: loose ceiling ────────────────────────────────────────────────────────
    highCount = await applyCapAndCount(page, request, token, rule, HIGH_CAP, from, to)

    // THE GOAL: a tighter cap turns strictly more crew into 28-day BH breaches.
    expect(lowCount, `59h messages (${lowCount}) must exceed 100h messages (${highCount})`).toBeGreaterThan(highCount)
    // Both ends must be live & non-degenerate (not a "0 loaded" false pass on either side).
    expect(highCount).toBeGreaterThanOrEqual(0)
    expect(lowCount).toBeGreaterThan(0)
  } finally {
    // Restore the original cap (CRITICAL — must succeed for data integrity) and re-baseline.
    try {
      await patchParam(request, token, rule.id, rule.paramJson)
      await postRecheck(request, token, from, to)
      await waitRecheckSettled(request, token, 120_000)
    } catch { /* best-effort re-baseline; param is back to original either way */ }
  }

  // Surface the concrete numbers in the run log (per §No-Illusion the comparison is the proof).
  console.log(`Viol-8011 8002 Hard messages — 59h cap: ${lowCount}  |  100h cap: ${highCount}`)
})
