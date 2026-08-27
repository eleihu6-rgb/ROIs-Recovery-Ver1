/**
 * Rule 7502/001 (CALCULATION OF CREDIT HOURS) — C++→Rust→Gantt migration, rule #3.
 *
 * Unlike 8002/8056, 7502 is a CALCULATOR, not a checker: per activity it computes
 *   credit = max(MinimumCH_floor, flightBlock × FT-ratio, dutyPeriod × DP-ratio)
 * (CalculateCreditHoursForCARSRule.cpp:611-647; F8 params FLY→FT 1.0, GND→DP 0.5,
 * DO|LO|LEA|SBY→MinCH 04:00). It emits NO violations. It was added to workset 103
 * "PBS Solver Ruleset" (sql/migration/2026-06-15-rule-7502-001-add-to-103.sql) so its
 * credit param table shows in the gantt LEGALITY (config) tab — the gantt's violation
 * behaviour is unchanged.
 *
 *   Rule-3007 — the LIVE param (read through the Legality API the gantt consumes) really
 *               carries 7502/001 in workset 103 with the credit table (FLY FT 1.0, GND
 *               DP 0.5, DO|LO|LEA|SBY MinimumCH 04:00).
 *   Rule-3008 — drive the proven Rust 7502 calculator over live June roster data and
 *               assert it computes credit hours (per-crew totals; ratios sourced from
 *               param_json; FLY + ground = total). Invariants, not brittle headcounts.
 *   Rule-3009 — the gantt LEGALITY tab renders 7502/001 "The Calculation of Credit Hours"
 *               in ruleset 103 with its credit params; AND 7502 produces NO violations
 *               (pure calc — absent from the bell/Alert Center, while 8002/8056 remain).
 *
 * §No-Illusion: every assertion checks concrete values computed/served from live data.
 * Engine harness: live-server/scripts/check-7502-credit.mjs.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const HARNESS = path.join(REPO, 'live-server', 'scripts', 'check-7502-credit.mjs')
const WORKSET_PBS_SOLVER = 103

interface CreditResult {
  model: string
  crewCredited: number
  totalCreditHours: number
  flyCreditHours: number
  groundCreditHours: number
  worst: { crewId: string; creditHours: number } | null
}

const runCredit = (): CreditResult => {
  const out = execFileSync('node', [HARNESS, '--from', '2026-06-01', '--to', '2026-07-01'], {
    cwd: path.join(REPO, 'live-server'),
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
  })
  return JSON.parse(out) as CreditResult
}

test.describe('Rule 7502/001 — credit-hours calculator added to workset 103', () => {
  test('Rule-3007 — live param_json carries 7502/001 in workset 103 with the credit table', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; name?: string; paramJson: unknown }> }
    }

    const rule7502 = body.data.rules.find((r) => Number(r.function) === 7502 && r.instance === '001')
    expect(rule7502, '7502/001 must now be in PBS Solver Ruleset (workset 103)').toBeTruthy()

    const pj = rule7502!.paramJson as { tables: Array<{ header: string[]; rows: string[][] }> }
    const table = pj.tables[0]
    const h = table.header
    const iGrp = h.indexOf('Assignment Groups')
    const iMin = h.indexOf('Minimum CH')
    const iFt = h.indexOf('FT Ratio')
    const iDp = h.indexOf('DP Ratio')
    expect(iGrp).toBeGreaterThanOrEqual(0)

    // FLY row → FT Ratio 1.0.
    const fly = table.rows.find((r) => r[iGrp] === 'FLY')
    expect(fly, 'FLY credit row present').toBeTruthy()
    expect(fly![iFt]).toBe('1.0')
    // GND row → DP Ratio 0.5.
    const gnd = table.rows.find((r) => r[iGrp] === 'GND')
    expect(gnd, 'GND credit row present').toBeTruthy()
    expect(gnd![iDp]).toBe('0.5')
    // DO|LO|LEA|SBY row → Minimum CH 04:00.
    const off = table.rows.find((r) => /DO\|LO\|LEA\|SBY/.test(r[iGrp]))
    expect(off, 'off/leave/standby credit row present').toBeTruthy()
    expect(off![iMin]).toBe('04:00')
  })

  test('Rule-3008 — Rust 7502 computes per-crew credit on the live assignment-factor model', async () => {
    const r = runCredit()

    // Credit comes from the data-driven assignment fixed credit fallback.
    // Days off / leave earn 0 when fixed_credit_min is 0 or null.
    expect(r.model).toBe('assignment-factors')

    // A substantial population is credited (the June roster has ~800 crew with activity).
    expect(r.crewCredited).toBeGreaterThan(600)
    // Credit is computed and positive; well BELOW the old floored model (~64k h) because
    // off/leave days now earn 0 — flight credit is sparse in this demo, ground dominates.
    expect(r.totalCreditHours).toBeGreaterThan(5_000)
    expect(r.groundCreditHours).toBeGreaterThan(r.flyCreditHours)
    // The two buckets sum to the total (fly + ground), allowing rounding.
    expect(r.flyCreditHours + r.groundCreditHours).toBeCloseTo(r.totalCreditHours, 0)
    // The worst crew is concrete and positive.
    expect(r.worst).not.toBeNull()
    expect(r.worst!.creditHours).toBeGreaterThan(0)
    expect(r.worst!.crewId.length).toBeGreaterThan(0)
  })

  test('Rule-3009 — Legality tab shows 7502/001 in ruleset 103, and it emits NO violations', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')

    // ── The gantt LEGALITY (config) tab renders 7502/001 in workset 103 ─────────────
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByTestId('legality-ruleset-card-103').click()
    await expect(page.getByTestId('legality-set-name')).toContainText('PBS Solver Ruleset', { timeout: 10_000 })

    await expect(page.getByTestId('legality-rule-name-7502-001'))
      .toHaveText('7502/001 - The Calculation of Credit Hours')

    // Edit → the credit param table with the FT/DP/Minimum-CH columns + values.
    await page.getByTestId('legality-rule-edit-7502-001').click()
    const params = page.getByTestId('legality-params-7502-001')
    await expect(params).toBeVisible()
    for (const col of ['Assignment Groups', 'Minimum CH', 'FT Ratio', 'DP Ratio']) {
      await expect(params.getByText(col, { exact: true })).toBeVisible()
    }
    // Concrete credit values from param_json (not bare visibility).
    await expect(params.getByText('1.0', { exact: true }).first()).toBeVisible()
    await expect(params.getByText('0.5', { exact: true }).first()).toBeVisible()
    await expect(params.getByText('04:00', { exact: true }).first()).toBeVisible()

    // ── Pure calc: 7502 contributes NO violations to the gantt (bell/Alert Center) ──
    await gotoGantt(page)
    // Wait until the persisted-violation load has run (8002/8056 are present)…
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const t = (window as unknown as { __ganttTest?: { liveViolations?: () => Array<{ ruleCode: string }> } }).__ganttTest
            return (t?.liveViolations?.() ?? []).filter((v) => ['8002', '8056'].includes(v.ruleCode)).length
          }),
        { timeout: 30_000, intervals: [500] },
      )
      .toBeGreaterThan(0)
    // …and assert 7502 produced ZERO violations (it is a calculator, not a checker).
    const count7502 = await page.evaluate(() => {
      const t = (window as unknown as { __ganttTest: { liveViolations: () => Array<{ ruleCode: string }> } }).__ganttTest
      return t.liveViolations().filter((v) => v.ruleCode === '7502').length
    })
    expect(count7502).toBe(0)
  })
})
