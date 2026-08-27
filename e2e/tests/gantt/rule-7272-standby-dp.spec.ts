/**
 * Rule 7272/001 (CALCULATE DP OF THE RESERVES) — C++→Rust→Gantt migration, rule #11.
 *
 * Like 7502/2014/7500, 7272 is a DEFINITION / CALC rule: per standby/reserve roster it computes
 * a duty-period (DP) = rate × the (offset-adjusted) standby duration (F8 rate 0.33), which other
 * duty rules consume. It emits NO violations. It was added to workset 103 "PBS Solver Ruleset"
 * (sql/migration/2026-06-15-rule-7272-001-add-to-103.sql) so its standby-DP params show in the
 * gantt LEGALITY (config) tab — the gantt's violation behaviour is unchanged.
 *
 *   Rule-3034 — the LIVE param (Legality API the gantt consumes) carries 7272/001 in workset
 *               103 with the standby-DP table (Assignments=SBY|PRAM|PRPM, Rate=0.33, Standby
 *               Offset/SBY Limit/Notification Limit 00:00).
 *   Rule-3035 — drive the proven Rust 7272 calculator over live June reserves and assert it
 *               computes DP (per-crew totals; rate from param_json) AND writes ZERO violations.
 *   Rule-3036 — the gantt LEGALITY tab renders 7272/001 "Calculate DP of the Reserves" in
 *               ruleset 103 with its params; AND 7272 produces NO violations (pure calc — absent
 *               from the bell/Alert Center, while 8002 remains).
 *
 * §No-Illusion: every assertion checks concrete values computed/served from live data.
 * Engine harness: live-server/scripts/check-7272-standby-dp.mjs.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const HARNESS = path.join(REPO, 'live-server', 'scripts', 'check-7272-standby-dp.mjs')
const WORKSET_PBS_SOLVER = 103

interface DpResult {
  kind: string
  rate: number
  reserveRosters: number
  crewWithReserves: number
  totalReserveDpHours: number
  avgDpHoursPerReserve: number
  longest: Array<{ crewId: string; dp: string }>
  violationsWritten: number
}

const runDp = (): DpResult => {
  const out = execFileSync('node', [HARNESS, '--from', '2026-06-01', '--to', '2026-07-01'], {
    cwd: path.join(REPO, 'live-server'),
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
  })
  return JSON.parse(out) as DpResult
}

test.describe('Rule 7272/001 — standby-DP calculator added to workset 103', () => {
  test('Rule-3034 — live param_json carries 7272/001 in workset 103 with the standby-DP table', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; category?: string; paramJson: unknown }> }
    }

    const rule = body.data.rules.find((r) => Number(r.function) === 7272 && r.instance === '001')
    expect(rule, '7272/001 must now be in PBS Solver Ruleset (workset 103)').toBeTruthy()
    // It is a Definition (no-violation) rule.
    if (rule!.category !== undefined) expect(rule!.category).toBe('Definition')

    const pj = rule!.paramJson as { tables: Array<{ header: string[]; rows: string[][] }> }
    const t = pj.tables[0]
    const col = (n: string) => t.header.indexOf(n)
    // The 5 standby-DP columns are present.
    for (const c of ['Assignments', 'Standby Offset', 'Rate', 'SBY Limit', 'Notification Limit']) {
      expect(col(c), `${c} column present`).toBeGreaterThanOrEqual(0)
    }
    const r = t.rows[0]
    expect(r[col('Assignments')]).toBe('SBY|PRAM|PRPM')
    expect(r[col('Rate')]).toBe('0.33')
    expect(r[col('Standby Offset')]).toBe('00:00')
  })

  test('Rule-3035 — Rust 7272 computes reserve DP over live June AND writes zero violations', async () => {
    const r = runDp()
    expect(r.kind).toBe('CALC/Definition')
    expect(r.rate).toBe(0.33)

    // A substantial reserve population is computed (the June roster has ~200 crew on reserve).
    expect(r.reserveRosters).toBeGreaterThan(1000)
    expect(r.crewWithReserves).toBeGreaterThan(100)
    // DP is computed and positive; total reserve DP is many hundreds of hours at rate 0.33.
    expect(r.totalReserveDpHours).toBeGreaterThan(1000)
    // Average per reserve is a sane standby fraction (rate 0.33 of a multi-hour standby).
    expect(r.avgDpHoursPerReserve).toBeGreaterThan(0)
    expect(r.avgDpHoursPerReserve).toBeLessThan(12)
    // A concrete longest reserve DP exists and is positive.
    expect(r.longest.length).toBeGreaterThan(0)
    expect(r.longest[0].crewId.length).toBeGreaterThan(0)
    expect(r.longest[0].dp).toMatch(/^\d+:\d{2}$/)
    // CALC / Definition rule: it writes NO violations.
    expect(r.violationsWritten).toBe(0)
  })

  test('Rule-3036 — Legality tab shows 7272/001 in ruleset 103, and it emits NO violations', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')

    // ── The gantt LEGALITY (config) tab renders 7272/001 in workset 103 ─────────────
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByTestId('legality-ruleset-card-103').click()
    await expect(page.getByTestId('legality-set-name')).toContainText('PBS Solver Ruleset', { timeout: 10_000 })

    await expect(page.getByTestId('legality-rule-name-7272-001'))
      .toHaveText('7272/001 - Calculate DP of the Reserves')

    // Edit → the standby-DP param table with the real columns + values.
    await page.getByTestId('legality-rule-edit-7272-001').click()
    const params = page.getByTestId('legality-params-7272-001')
    await expect(params).toBeVisible()
    for (const c of ['Assignments', 'Standby Offset', 'Rate', 'SBY Limit', 'Notification Limit']) {
      await expect(params.getByText(c, { exact: true })).toBeVisible()
    }
    await expect(params.getByText('SBY|PRAM|PRPM', { exact: true })).toBeVisible()
    await expect(params.getByText('0.33', { exact: true })).toBeVisible()

    // ── Pure calc: 7272 contributes NO violations to the gantt (bell/Alert Center) ──
    await gotoGantt(page)
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const t = (window as unknown as { __ganttTest?: { liveViolations?: () => Array<{ ruleCode: string }> } }).__ganttTest
            return (t?.liveViolations?.() ?? []).filter((v) => v.ruleCode === '8002').length
          }),
        { timeout: 30_000, intervals: [500] },
      )
      .toBeGreaterThan(0)
    // 7272 produced ZERO violations (it is a calculator, not a checker).
    const count7272 = await page.evaluate(() => {
      const t = (window as unknown as { __ganttTest: { liveViolations: () => Array<{ ruleCode: string }> } }).__ganttTest
      return t.liveViolations().filter((v) => v.ruleCode === '7272').length
    })
    expect(count7272).toBe(0)
  })
})
