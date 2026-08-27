/**
 * Live-1321 — the REAL planner flow, driven entirely through the UI (§Simulate-User):
 *
 *   1. Set the gantt date range to May 2026.
 *   2. In the Legality tab, edit 8002/001 row 0 (the 28-day BH limit) to 40:00 and click
 *      SAVE — which AUTO-triggers a live recheck of the May window (no API call fakes it).
 *   3. Open the Live Alert Center and read the 8002/001 warning count (tight 40h cap).
 *   4. Edit the same cell BACK to its original cap and SAVE → auto-recheck again.
 *   5. Read the count again — expect FEWER warnings (a looser cap can only reduce breaches).
 *
 * The edit + save + recheck are all real user actions: we fill the rule cell and click
 * "Save All"; the gantt's own onSaved→recordParamSave→auto-recheck effect fires the
 * recheck. We only use the API to (a) read the original cap for restore and (b) poll the
 * recheck status — never to perform the edit or the recheck the planner would do by hand.
 *
 * Proves the dynamic recheck end-to-end: tightening the cap via the rule set produces more
 * 8002/001 warnings and loosening it produces fewer, all tagged under the CURRENT instance.
 *
 * Run against up-to-date servers (a stale live-server 500s on /rulesets — dropped rule_group):
 *   cd e2e && GANTT_BASE_URL=http://localhost:5373 GANTT_API_URL=http://127.0.0.1:3100 \
 *     npx playwright test --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/legality-save-autorecheck-may.spec.ts --no-deps --reporter=list
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiUrl, ganttApiLogin, setDateRange } from '../../utils/gantt-hook'

const DEFAULT_RULESET = 103
const GROUP = String(DEFAULT_RULESET) // the auto-recheck targets the default set's id (ruleset_id)
const MAX_LIMITS_COL = 7 // 8002/001: …Period(4) Unit(5) Prorated(6) Max Limits(7) Min Limits(8) Type(9)
const TIGHT_CAP = '40:00'
const FROM = '2026-05-01'
const TO = '2026-05-31'

type RuleRow = { function: number; instance: string; id: number; paramJson: { tables: Array<{ rows: string[][] }> } }
type LiveViol = { ruleCode: string }

const getRule8002 = async (request: APIRequestContext, token: string): Promise<RuleRow> => {
  const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${DEFAULT_RULESET}`, {
    headers: { Authorization: `Bearer ${token}` }, timeout: 60_000,
  })
  expect(res.ok(), `get ruleset failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { data: { rules: RuleRow[] } }
  const rule = body.data.rules.find((r) => r.function === 8002 && r.instance === '001')
  expect(rule, '8002/001 not in default ruleset').toBeTruthy()
  return rule!
}

/** Read the recheck status (groupCode = the default ruleset id). */
const recheckStatus = async (request: APIRequestContext, token: string) => {
  const res = await request.get(`${ganttApiUrl}/api/legality/recheck-status?groupCode=${GROUP}`, {
    headers: { Authorization: `Bearer ${token}` }, timeout: 30_000,
  })
  if (!res.ok()) return { status: 'idle', lastCheckedAt: null as string | null }
  return (await res.json()).data as { status: string; lastCheckedAt: string | null }
}

/** Wait until a recheck completes AFTER `sinceIso` (the lastCheckedAt captured before the save). */
const waitRecheckDoneAfter = async (
  request: APIRequestContext, token: string, sinceIso: string | null, timeoutMs: number,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const s = await recheckStatus(request, token).catch(() => ({ status: 'busy', lastCheckedAt: null }))
    if (s.status === 'done' && s.lastCheckedAt && s.lastCheckedAt !== sinceIso) return
    if (s.status === 'failed') throw new Error('recheck failed')
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error('recheck did not finish in time')
}

const hook8002 = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const t = (window as unknown as { __ganttTest?: { liveViolations?: () => LiveViol[] } }).__ganttTest
    return (t?.liveViolations?.() ?? []).filter((v) => v.ruleCode === '8002').length
  })

/** Let the async violation stream stop growing before reading the badge. */
const waitStreamSettled = async (page: Page, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  let last = -1, stableSince = 0
  while (Date.now() < deadline) {
    const n = await hook8002(page)
    if (n === last) { if (stableSince === 0) stableSince = Date.now(); if (Date.now() - stableSince >= 3000) return }
    else stableSince = 0
    last = n
    await new Promise((r) => setTimeout(r, 1000))
  }
}

/** Set the gantt date range to the May window (test hook; toolbar date pickers were removed). */
const setMayRange = async (page: Page): Promise<void> => {
  await setDateRange(page, FROM, TO)
}

/**
 * Reload the gantt (forces a fresh violation fetch — in-app nav serves the cached set),
 * re-apply the May range (a reload resets it to the default month), then open the Live
 * Alert Center, group by Rule, and return the 8002/001 row-backed count (0 if absent).
 */
const read8002Count = async (page: Page): Promise<number> => {
  await gotoGantt(page)
  await setMayRange(page)
  await waitStreamSettled(page, 90_000)
  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await dialog.getByTestId('alert-groupby-rule').click()
  const group = dialog.locator('[data-testid="alert-group-item"]', { hasText: '8002/001' })
  let count = 0
  if ((await group.count()) > 0) {
    await group.first().click()
    count = await dialog.locator('[data-testid="violation-list-row"][data-rule-id="8002/001"]').count()
  }
  await page.getByTestId('violation-list-dialog-close').click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
  return count
}

/** Set the 8002/001 28-day Max Limits cell to `cap` via the Legality UI and click Save All. */
const editCapAndSave = async (page: Page, cap: string): Promise<void> => {
  await page.getByTestId('module-nav-legality').click()
  // Default ruleset (103) auto-selects; ensure its card is active, then expand 8002/001.
  await page.getByTestId('legality-ruleset-card-103').click().catch(() => {})
  const editToggle = page.getByTestId('legality-rule-edit-8002-001')
  await expect(editToggle).toBeVisible({ timeout: 15_000 })
  // Expand the param editor if not already open.
  if ((await page.getByTestId('legality-param-edit-8002-001-0-0').count()) === 0) await editToggle.click()
  await page.getByTestId('legality-param-edit-8002-001-0-0').click()
  const cell = page.getByTestId(`legality-param-cell-input-8002-001-0-0-${MAX_LIMITS_COL}`)
  await cell.fill(cap)
  await page.getByTestId('legality-param-confirm-edit-8002-001-0-0').click()
  await page.getByTestId('param-save-all-btn').click()
}

test('Live-1321 Save 8002 28d cap=40h auto-rechecks May → more warnings; revert → fewer', async ({ page, request }) => {
  test.setTimeout(600_000)
  const token = await ganttApiLogin(request)
  const rule = await getRule8002(request, token)
  const origCap = rule.paramJson.tables[0].rows[0][MAX_LIMITS_COL] // e.g. "59:00"
  expect(origCap, 'original 28d cap missing').toBeTruthy()

  let tightCount = -1, looseCount = -1
  try {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    // 1. Date range → May 2026 (native date inputs; onChange writes filter-store.dateRange).
    await setMayRange(page)

    // 2. Tight cap (40h): edit + Save → auto-recheck May.
    let before = (await recheckStatus(request, token)).lastCheckedAt
    await editCapAndSave(page, TIGHT_CAP)
    await waitRecheckDoneAfter(request, token, before, 300_000)
    tightCount = await read8002Count(page)

    // 3. Revert to the original cap: edit + Save → auto-recheck May.
    before = (await recheckStatus(request, token)).lastCheckedAt
    await editCapAndSave(page, origCap)
    await waitRecheckDoneAfter(request, token, before, 300_000)
    looseCount = await read8002Count(page)

    // 4. A tighter 40h cap can only produce MORE 8002 warnings than the looser original.
    console.log(`\n[Live-1321] May 2026 8002/001 warnings — 40h cap: ${tightCount} | reverted (${origCap}): ${looseCount}\n`)
    expect(tightCount, `tight(40h)=${tightCount} loose(${origCap})=${looseCount}`).toBeGreaterThan(looseCount)
    expect(tightCount).toBeGreaterThan(0)
  } finally {
    // Restore the original cap + one recheck so the shared DB is left as found.
    await request.patch(`${ganttApiUrl}/api/legality/rule/${rule.id}/params`, {
      headers: { Authorization: `Bearer ${token}` }, data: { paramJson: rule.paramJson }, timeout: 60_000,
    }).catch(() => {})
    await request.post(`${ganttApiUrl}/api/legality/recheck`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { groupCode: GROUP, from: FROM, to: TO, ruleCodes: ['8002'] }, timeout: 60_000,
    }).catch(() => {})
  }
})
