/**
 * Rule 8002/001 — CREDIT-HOUR BAND (4th param row, Type=CH, 1 CM) — feature enrichment.
 *
 * A new row added to 8002/001: `1 | CM | Y | 75:00 | 65:00 | Credit`
 * (sql/migration/2026-06-15-rule-8002-001-add-credit-band-row.sql). 8002 fires this
 * warning BY ITSELF — it computes each crew's MONTHLY credit standalone (FLY → max(4:00,
 * block); ground/off → flat 4:00), prorates the [65:00, 75:00] band by availability, and
 * warns when outside it. It does NOT depend on the 7502 calculator. Maps to the C++ 8002
 * Type="CH" branch (rule8002.cpp:657-684): violate if credit > Max || credit < Min.
 *
 *   Rule-3010 — the LIVE param (Legality API) really carries the 4th 8002/001 row:
 *               Period=1, Unit=CM, Prorated=Y, Max=75:00, Min=65:00, Type=CH
 *               (alongside the 3 unchanged BH windows).
 *   Rule-3011 — drive the standalone Rust 8002 credit engine over live June roster data;
 *               it computes monthly credit itself and fires band warnings (invariants).
 *   Rule-3012 — the warnings reach the planner: the Alert Center shows 8002/001 credit
 *               warnings ("Monthly credit … 1 CM … maximum"), AND the original 8002 block
 *               windows (40h, sev 3) AND 8056 are STILL there — 8002 enriched, not replaced.
 *
 * §No-Illusion: every assertion checks concrete values computed/served from live data.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const HARNESS = path.join(REPO, 'live-server', 'scripts', 'check-8002-credit.mjs')
const WORKSET_PBS_SOLVER = 103

interface CreditBandResult {
  minHours: number
  maxHours: number
  crewEvaluated: number
  warnings: number
  overMax: number
  underMin: number
  worst: { crewId: string; creditHours: number; over: boolean } | null
}

const runBand = (): CreditBandResult => {
  const out = execFileSync(
    'node',
    [HARNESS, '--min', '65', '--max', '75', '--from', '2026-06-01', '--to', '2026-07-01'],
    {
      cwd: path.join(REPO, 'live-server'),
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
    },
  )
  return JSON.parse(out) as CreditBandResult
}

test.describe('Rule 8002/001 — monthly credit-hour band (4th row)', () => {
  test('Rule-3010 — live param_json carries the 4th 8002/001 row: 1 CM credit band 65–75', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; paramJson: unknown }> }
    }
    const rule = body.data.rules.find((r) => Number(r.function) === 8002 && r.instance === '001')!
    const pj = rule.paramJson as { tables: Array<{ header: string[]; rows: string[][] }> }
    const t = pj.tables[0]
    const i = (name: string) => t.header.indexOf(name)

    // Four rows now: the 3 BH windows are unchanged + the new Credit row.
    expect(t.rows).toHaveLength(4)
    const bh = t.rows.filter((r) => r[i('Type')] === 'BH').map((r) => r[i('Period')])
    expect(bh).toEqual(['28', '100', '200'])

    // Type=CH ("Credit Hour") — the type code the C++ 8002 already supports.
    const credit = t.rows.find((r) => r[i('Type')] === 'CH')
    expect(credit, 'the new CH (credit-hour) row exists').toBeTruthy()
    expect(credit![i('Period')]).toBe('1')
    expect(credit![i('Unit')]).toBe('CM')
    expect(credit![i('Prorated')]).toBe('Y')
    expect(credit![i('Max Limits')]).toBe('75:00')
    expect(credit![i('Min Limits')]).toBe('65:00')
  })

  test('Rule-3011 — standalone Rust 8002 computes monthly credit + fires band warnings (June)', async () => {
    const r = runBand()
    expect(r.minHours).toBe(65)
    expect(r.maxHours).toBe(75)
    // A substantial population is evaluated; 8002 computes monthly credit standalone (the
    // data-driven assignment-factor model: off/leave = 0) and warns BOTH ways — most crew
    // fall BELOW the 65h floor, a minority exceed the 75h cap. Both bounds genuinely fire.
    expect(r.crewEvaluated).toBeGreaterThan(600)
    expect(r.warnings).toBeGreaterThan(400)
    expect(r.underMin).toBeGreaterThan(0)
    expect(r.overMax).toBeGreaterThan(0)
    // Under-min dominates on this roster (days off earn 0), proving the floor-free model.
    expect(r.underMin).toBeGreaterThan(r.overMax)
    // The worst (highest-credit) crew is concrete, over the cap, and positive.
    expect(r.worst).not.toBeNull()
    expect(r.worst!.over).toBe(true)
    expect(r.worst!.creditHours).toBeGreaterThan(75)
  })

  test('Rule-3012 — Alert Center shows 8002 credit warnings; block 8002 + 8056 still there', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)

    // BELL data carries the new sev-2 credit 8002 warning (message "Monthly credit … 1 CM").
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const t = (window as unknown as { __ganttTest?: { liveViolations?: () => Array<{ ruleCode: string; severity: number; message: string }> } }).__ganttTest
            return (t?.liveViolations?.() ?? []).filter(
              (v) => v.ruleCode === '8002' && v.severity === 2 && /Monthly credit/.test(v.message),
            ).length
          }),
        { timeout: 30_000, intervals: [500] },
      )
      .toBeGreaterThan(0)

    const bells = await page.evaluate(() => {
      const t = (window as unknown as { __ganttTest: { liveViolations: () => Array<{ ruleCode: string; severity: number; message: string }> } }).__ganttTest
      return t.liveViolations()
    })
    // The new credit warning: sev 2, "Monthly credit … in 1 CM … (above max OR below min)".
    const credit = bells.filter((v) => v.ruleCode === '8002' && v.severity === 2 && /Monthly credit/.test(v.message))
    expect(credit.length).toBeGreaterThan(0)
    expect(credit.every((v) => /1 CM/.test(v.message))).toBe(true)
    // Both band directions occur on this roster: some exceed the max, most are below the min.
    expect(credit.some((v) => /maximum/.test(v.message))).toBe(true)
    expect(credit.some((v) => /minimum/.test(v.message))).toBe(true)
    // The ORIGINAL 8002 block-window alarms (sev 3, 40h) are still present.
    expect(bells.some((v) => v.ruleCode === '8002' && v.severity === 3 && /40h/.test(v.message))).toBe(true)
    // …and 8056 spacing too (nothing was replaced).
    expect(bells.some((v) => v.ruleCode === '8056')).toBe(true)

    // Alert Center: an 8002/001 row whose message is the monthly-credit warning.
    await page.getByTestId('violations-button').first().click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()
    const rows8002 = dialog.locator('[data-testid="violation-list-row"][data-rule-id="8002/001"]')
    await expect.poll(() => rows8002.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
    // A monthly-credit row is shown (1 CM band), and the block-window 40h row coexists.
    await expect(rows8002.filter({ hasText: 'Monthly credit' }).first()).toContainText('1 CM')
    await expect(rows8002.filter({ hasText: '40h' }).first()).toBeVisible()
  })
})
