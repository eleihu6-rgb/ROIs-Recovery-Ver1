/**
 * Scen-2046 — a pre-assigned VAC duty (assignment_group GRD, like live) that overlaps a
 * flight must raise an 8056 spacing violation, surfaced through the REAL scenario recheck UI.
 *
 * Bug: scenario.roster_flight stored ground duties' assignment_group per-CODE (VAC→'VAC')
 * instead of the live taxonomy (VAC→'GRD'), AND the 8056 recheck data builder hardcoded
 * `assignment_group in ('FLY','SBY','SIM')` — so the rule set's `Assignment Group B =
 * "FLY|SBY|SIM|GRD"` never reached the engine. Net effect: crew 529's VAC-over-flight on
 * scenario 595 produced NO 8056 warning. Two fixes: (1) the write-back loader resolves the
 * ground group from f8.assignment_group_map (VAC→GRD); (2) the recheck pulls Group A∪B from
 * the latest param_json instead of a hardcoded set. Scenario 595's existing rows were
 * backfilled to match live.
 *
 * §Simulate-User: the recheck is triggered by clicking the real roster-pane "Recheck" button
 * (scenario-legality-recheck) — the UI fires POST /api/scenario/595/legality/recheck itself.
 * We only use the API/DB to (a) clear 595's violations as a clean before-state and (b) read
 * the legality the gantt view reads — never to perform the recheck.
 *
 * Run against the worktree servers (a stale live-server can't serve scenario legality):
 *   cd e2e && GANTT_BASE_URL=http://localhost:5373 GANTT_API_URL=http://127.0.0.1:3100 \
 *     npx playwright test --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/scenario-595-8056-vac-overlap.spec.ts --no-deps --reporter=list
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const LIVE_SERVER = path.join(REPO, 'live-server')

const GANTT_API = process.env.GANTT_API_URL ?? 'http://127.0.0.1:3100'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'
const SCENARIO_ID = 595
const SCENARIO_SEARCH = 'TEST-New-YVR'
const CREW = '529'

/** Read DATABASE_URL from live-server/.env (no hardcoded credentials). */
const dbUrl = (): string => {
  const env = fs.readFileSync(path.join(LIVE_SERVER, '.env'), 'utf8')
  const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL not in live-server/.env')
  return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')
}

/** Clean before-state: delete scenario 595's persisted violations (pg lives in live-server). */
const clearViolations = (): void => {
  const out = execFileSync(process.execPath, ['-e',
    `const{Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.U});` +
    `await c.connect();const r=await c.query('delete from scenario.rule_violation where scenario_id=$1',[${SCENARIO_ID}]);` +
    `console.log('cleared '+r.rowCount);await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})`,
  ], { cwd: LIVE_SERVER, env: { ...process.env, U: dbUrl() }, encoding: 'utf8' })
  expect(out).toContain('cleared')
}

type Viol = { crew_id: string; rule_code: string; rule_instance: string | null; message: string }
/** Read the legality the scenario view reads (via the app proxy + token). */
const getLegality = (page: Page): Promise<{ status: string; violations: Viol[] }> =>
  page.evaluate(async (sid) => {
    const tok = JSON.parse(sessionStorage.getItem('rois-auth') ?? '{}').token
    const r = await fetch(`/altair/live/api/scenario/${sid}/legality`, { headers: { authorization: `Bearer ${tok}` } })
    return (await r.json()).data as { status: string; violations: [] }
  }, SCENARIO_ID)

const crew8056 = (v: { violations: Viol[] }): Viol[] =>
  v.violations.filter((x) => x.crew_id === CREW && x.rule_code === '8056')

test('Scen-2046 UI recheck of scenario 595 fires 8056 for crew 529 (VAC over flight)', async ({ page, request }) => {
  test.setTimeout(540_000)

  // Auth + clean before-state (setup only — the recheck itself is a UI click below).
  const res = await request.post(`${GANTT_API}/api/auth/login`, { data: { userCode: GANTT_USER, password: GANTT_PASS } })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  const { data: auth } = (await res.json()) as { data: { token: string; userCode: string; userName: string; schema: string } }
  await page.addInitScript((a) => {
    window.sessionStorage.setItem('rois-auth',
      JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }))
  }, auth)
  clearViolations()

  // Open scenario 595's gantt.
  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  const row = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_SEARCH)
  await row.click()
  await expect(scenario.detailPanel).toBeVisible()
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 20_000 })

  // Before: no 8056 for crew 529 (cleared).
  await expect.poll(async () => (await getLegality(page)).status, { timeout: 30_000, intervals: [1000] })
    .not.toBe('COMPUTING')
  expect(crew8056(await getLegality(page)).length, 'pre-recheck crew 529 should have no 8056').toBe(0)

  // ── The real user action: click the roster-pane Recheck button (UI fires the recheck). ──
  const recheck = page.getByTestId('scenario-legality-recheck')
  await expect(recheck).toBeVisible({ timeout: 20_000 })
  await recheck.click()

  // After: poll the view's read path until the recheck completes AND crew 529's 8056 appears.
  await expect.poll(async () => {
    const l = await getLegality(page)
    return l.status === 'READY' ? crew8056(l).length : -1
  }, { timeout: 480_000, intervals: [3000] }).toBeGreaterThan(0)

  const fired = crew8056(await getLegality(page))
  console.log(`\n[Scen-2046] crew ${CREW} 8056 violations after UI recheck: ${fired.length}`)
  for (const f of fired.slice(0, 5)) console.log(`  8056/${f.rule_instance}: ${f.message}`)
  // At least one names a VAC adjacency (the reported overlap).
  expect(fired.some((f) => /VAC/.test(f.message)), 'expected an 8056 violation referencing VAC').toBe(true)

  // It reaches the planner's screen: scenario Alert Center, grouped by rule, shows 8056.
  const view = page.getByTestId('scenario-gantt-view')
  await view.getByTestId('violations-button').click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await dialog.getByTestId('alert-groupby-rule').click()
  await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8056/001' })).toHaveCount(1)
})
